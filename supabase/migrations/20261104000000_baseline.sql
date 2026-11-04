-- SQL-1 (ARCHITECTURE §8.2, §8.3, §8.16): the database baseline.
--
-- Least privilege by construction. This migration never takes a privilege
-- away and never removes an object, so it applies unattended (decisions
-- memo §14.4, 01-ENGINEERING-CONSTRAINTS.md). The guarantees of §8.2 hold
-- because of how objects are created:
--
--   * Every table, sequence, type and internal function lives in the
--     private schema. A schema grants USAGE to nobody but its owner until
--     someone grants it, and nothing here or later ever grants it, so anon,
--     authenticated and service_role cannot name anything inside it. The
--     Data API does not expose the schema either.
--   * Functions keep PostgreSQL's built-in EXECUTE for PUBLIC, which nobody
--     can use without USAGE on the schema. Private functions are SECURITY
--     INVOKER, so the advisor's definer lints (0028, 0029) never see them.
--   * Only deliberate RPCs live in public: SECURITY DEFINER with
--     search_path = '', each named in private.rpc_allowlist. Supabase's
--     default privileges already let anon execute them.
--   * Every table has RLS enabled and a restrictive deny-all policy, so the
--     advisor sees a policy (lint 0008) and even a mistaken permissive
--     policy added later could not open a row. Only the owner, postgres,
--     which owns every definer function and bypasses RLS, reads or writes.
--   * Nothing for GraphQL or the OpenAPI root to show: no tables in public,
--     pg_graphql not installed. The standing checks in
--     supabase/tests/baseline/ fail if any of this ever changes, and the
--     backend-contract workflow probes both endpoints over HTTP.
--
-- The two settings §8.2 makes through role and extension changes need the
-- project owner, so they sit in 20261104000200_api_surface_owner_only.sql,
-- which we never apply ourselves (launch report item).
--
-- private.now() is defined here rather than in the helpers migration,
-- because column defaults below call it (§8.3: "column defaults call
-- private.now()").

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- The clock (§8.17)
-- ---------------------------------------------------------------------------

-- The clock for one session user: qz.now (an ISO timestamp, set with
-- set_config) when the session belongs to postgres, which only MCP and
-- pg_cron sessions do, else the transaction time. PostgREST sessions run as
-- authenticator, so no client can ever move the clock.
create or replace function private.now_as(p_session_user name)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_session_user = 'postgres'
     and coalesce(pg_catalog.current_setting('qz.now', true), '') <> ''
      then pg_catalog.current_setting('qz.now', true)::timestamptz
    else pg_catalog.now()
  end
$$;

-- Every RPC and default reads time here, never from now() (§8.2 rule 6).
create or replace function private.now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select private.now_as(session_user)
$$;

-- ---------------------------------------------------------------------------
-- RLS and the deny-all policy, for this and every later migration
-- ---------------------------------------------------------------------------

-- True when the table carries a policy that refuses every command to
-- everyone: FOR ALL, TO PUBLIC, USING (false) WITH CHECK (false). CNT-0's
-- key_escrow_deny_all qualifies as well as the deny_all policies below.
create or replace function private.has_deny_all(p_table regclass)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from pg_catalog.pg_policy p
     where p.polrelid = p_table
       and p.polcmd = '*'
       and p.polroles = array[0::oid]
       and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'false'
       and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'false'
  )
$$;

-- Enables RLS on a private table and gives it the restrictive deny_all
-- policy unless it already has a deny-all policy. Idempotent. Later
-- migrations call it for each table they create:
--   select private.secure_table('private.players');
create or replace function private.secure_table(p_table regclass)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_schema name;
  v_rls boolean;
begin
  select n.nspname, c.relrowsecurity
    into v_schema, v_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.oid = p_table and c.relkind in ('r', 'p');
  if v_schema is null then
    raise exception 'secure_table: % is not a table', p_table;
  end if;
  if v_schema <> 'private' then
    raise exception 'secure_table: % is not in the private schema', p_table;
  end if;
  if not v_rls then
    execute pg_catalog.format('alter table %s enable row level security', p_table);
  end if;
  if not private.has_deny_all(p_table) then
    execute pg_catalog.format(
      'create policy deny_all on %s as restrictive for all to public using (false) with check (false)',
      p_table);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Configuration and operations (§8.3; the ops tables of SQL-8 come later)
-- ---------------------------------------------------------------------------

-- Tunables as data: client_ip, limits and egress_sample_rate here; the
-- shared values (crowd_min_n and so on) from supabase/seed/config.sql.
create table if not exists private.config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  value jsonb not null,
  updated_at timestamptz not null default private.now()
);
select private.secure_table('private.config');

-- Every function anon may execute (§8.2 rule 4). The ticket that adds an RPC
-- adds its row in the same migration, and the same name to
-- supabase/expected-advisors.json (rpc.functions).
create table if not exists private.rpc_allowlist (
  name text primary key check (name ~ '^[a-z][a-z0-9_]{0,62}$')
);
select private.secure_table('private.rpc_allowlist');

-- Copied from pg_timezone_names (faster to probe than the view), refreshed
-- nightly so tzdata updates arrive without a migration (§8.7).
create table if not exists private.time_zones (
  name text primary key
);
select private.secure_table('private.time_zones');

-- One salt per UTC day. A window uses the salt of the day it started, and
-- the hourly job prunes a salt once the following day has ended, so each
-- lives 48 hours (§8.6, PRD §8.3).
create table if not exists private.ip_salts (
  day date primary key,
  salt bytea not null check (octet_length(salt) = 32)
);
select private.secure_table('private.ip_salts');

-- One row per bucket, subject and aligned window. hits keeps counting past
-- the cap, so a window's refusals are hits - cap; window_end and folded let
-- the hourly job add each ended window's refusals to daily_aggregates once.
create table if not exists private.rate_counters (
  bucket text not null,
  subject bytea not null,            -- sha256(bucket | key, the window's salt): never a raw IP or player id
  window_start timestamptz not null,
  window_end timestamptz not null,
  hits integer not null default 0,
  cap integer not null,
  folded boolean not null default false,
  primary key (bucket, subject, window_start)
);
create index if not exists rate_counters_window_start_idx
  on private.rate_counters (window_start);
select private.secure_table('private.rate_counters');

-- The pre-request hook's 429s (SQL-8): a nextval survives the rollback that
-- the hook's own raise causes, so refusals stay countable (§8.6).
create sequence if not exists private.refused_general_ip_5m;

-- Idempotency for RPCs that create records (§8.6). result is JSON null while
-- a claimed key's call is still running.
create table if not exists private.write_keys (
  client_id uuid primary key,
  fn text not null,
  player_id uuid,                    -- removed with the player by delete_player
  result jsonb not null,
  created_at timestamptz not null default private.now()
);
create index if not exists write_keys_created_at_idx
  on private.write_keys (created_at);
create index if not exists write_keys_player_id_idx
  on private.write_keys (player_id);
select private.secure_table('private.write_keys');

-- Unexpected exceptions that an RPC caught, with the reference id the client
-- shows. uuids, tokens and secrets are redacted before a row is written.
create table if not exists private.rpc_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default private.now(),
  fn text not null,
  sqlstate text not null,
  ref text not null,
  room_id uuid,
  question_index smallint,
  detail text
);
create index if not exists rpc_errors_at_idx
  on private.rpc_errors (at);
select private.secure_table('private.rpc_errors');

-- Owner alerts: job steps that failed, tripped ceilings, size alarms.
create table if not exists private.alerts (
  id bigint generated always as identity primary key,
  at timestamptz not null default private.now(),
  kind text not null,
  detail jsonb not null,
  resolved_at timestamptz
);
select private.secure_table('private.alerts');

-- Daily rollups, keyed by a short 'k=v;k=v' dims string (§8.3).
create table if not exists private.daily_aggregates (
  day date not null,
  metric text not null,
  dims text not null default '',
  value bigint not null,
  primary key (day, metric, dims)
);
select private.secure_table('private.daily_aggregates');

-- A sample of response sizes taken in private.ok() (§8.1): Postgres cannot
-- see egress, so it is estimated as bytes / egress_sample_rate.
create table if not exists private.egress_samples (
  hour timestamptz primary key,
  calls integer not null default 0,
  bytes bigint not null default 0
);
select private.secure_table('private.egress_samples');

-- Peak live room connections per hour, an estimate (§8.1, SQL-13 fills it).
create table if not exists private.connection_peaks (
  hour timestamptz primary key,
  peak integer not null
);
select private.secure_table('private.connection_peaks');

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into private.time_zones (name)
select z.name from pg_catalog.pg_timezone_names z
on conflict (name) do nothing;

-- The client-address rule (§8.6): Supabase's documented first
-- X-Forwarded-For hop until the client-ip contract test (CI-0) shows which
-- hop a client cannot forge. hop is "first", "last" or a position counted
-- from the right (0 is the last hop).
insert into private.config (key, value)
values ('client_ip', '{"header": "x-forwarded-for", "hop": "first"}')
on conflict (key) do nothing;

-- The share of private.ok() responses whose size is sampled (§8.1).
insert into private.config (key, value)
values ('egress_sample_rate', '0.01')
on conflict (key) do nothing;

-- The rate limits of §8.6, PRD §8.4: bucket -> { cap, window_s }. A later
-- migration merges its own buckets in the same way, and values already
-- stored (an owner's tuning) win over the defaults.
insert into private.config as c (key, value)
values ('limits', '{
  "general_ip_5m":        {"cap": 1000,    "window_s": 300},
  "general_player_5m":    {"cap": 300,     "window_s": 300},
  "identity_soft_1h":     {"cap": 60,      "window_s": 3600},
  "identity_1m":          {"cap": 20,      "window_s": 60},
  "identity_all_1h":      {"cap": 5000,    "window_s": 3600},
  "identity_test_1h":     {"cap": 200,     "window_s": 3600},
  "sync_fail_15m":        {"cap": 5,       "window_s": 900},
  "sync_1d":              {"cap": 20,      "window_s": 86400},
  "claim_player_1h":      {"cap": 5,       "window_s": 3600},
  "claim_ip_1h":          {"cap": 10,      "window_s": 3600},
  "challenge_player_1d":  {"cap": 20,      "window_s": 86400},
  "group_create_1d":      {"cap": 3,       "window_s": 86400},
  "group_join_1h":        {"cap": 20,      "window_s": 3600},
  "room_create_1h":       {"cap": 5,       "window_s": 3600},
  "room_join_bad_1m":     {"cap": 10,      "window_s": 60},
  "room_join_bad_all_1m": {"cap": 300,     "window_s": 60},
  "quiz_save_1h":         {"cap": 30,      "window_s": 3600},
  "quiz_share_1d":        {"cap": 10,      "window_s": 86400},
  "ugc_bytes_player_1d":  {"cap": 524288,  "window_s": 86400},
  "ugc_bytes_ip_1d":      {"cap": 2097152, "window_s": 86400},
  "report_player_1d":     {"cap": 30,      "window_s": 86400},
  "events_player_1m":     {"cap": 60,      "window_s": 60},
  "events_ip_5m":         {"cap": 300,     "window_s": 300},
  "events_all_1m":        {"cap": 600,     "window_s": 60},
  "events_all_1d":        {"cap": 150000,  "window_s": 86400},
  "practice_player_1d":   {"cap": 500,     "window_s": 86400},
  "practice_ip_1d":       {"cap": 2000,    "window_s": 86400},
  "practice_ids_ip_1d":   {"cap": 50,      "window_s": 86400},
  "calib_ip_item_1d":     {"cap": 3,       "window_s": 86400},
  "landing_ip_1m":        {"cap": 300,     "window_s": 60}
}')
on conflict (key) do update
  set value = excluded.value || c.value,
      updated_at = private.now();
