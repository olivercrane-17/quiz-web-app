-- SQL-2 (ARCHITECTURE §8.3, §8.4, §8.5, §8.6, §8.15): identity in SQL.
--
-- The tables of a guest identity (players with their zone and trust
-- columns, credentials, sync codes, claims, name parts with a starter
-- list), private.authenticate with the soft threshold, low trust, the
-- burst limit and the project ceiling, every identity RPC but set_nickname
-- (MOD-1), t_client_ip for the client-ip contract test, and nightly_players.
-- Like every unattended file it only creates and overwrites, so it applies
-- without a confirmation (supabase/README.md §1).
--
-- Routine work never removes a row:
--   * A sync code is one row per player, overwritten by the next code.
--   * A claim is one row per player, overwritten by the next claim, so
--     expired claims need no pruning. That replaces §8.3's claims keyed by
--     token hash; a token is still found by its hash (unique).
--   * Adding an 11th device credential overwrites the least recently used
--     one in place (PRD §3.10.1), so a player never holds more than 10.
-- What has to remove rows waits in 20261104000500_identity_attended.sql,
-- applied only in a session someone attends: delete_player (AC-DAT-02) and
-- the nightly removal of test players older than a day (§8.17). Until then
-- delete_player answers unavailable and nightly_players leaves a daily
-- owner_queue alert, both naming that migration.
--
-- The client address is not trusted for anything a forged hop could abuse.
-- private.client_ip() reads the first X-Forwarded-For hop until the
-- client-ip contract test (CI-0) shows which hop a client cannot write, so
-- every address-keyed limit here has a project-wide bound beside it:
-- identity_all_1h refuses registrations, identity_test_all_1h test
-- registrations, sync_fail_all_1h and claim_fail_all_1h failed sync-code
-- and claim attempts. Normal trust needs all three of: the address under
-- identity_soft_1h, the project under identity_soft_all_1h, and a client
-- address rule marked "verified": true in private.config.client_ip. So
-- while the hop is unverified, every new identity registers as low trust,
-- which nobody sees (§8.5), and forged hops mint no trusted sock puppets.
--
-- Data that later tickets own is read through hooks created here, each a
-- stub that its owner replaces with create or replace (§8.15):
-- finished_dailies, identity_last_daily and export_attempts (SQL-4),
-- identity_streak and export_streak_days (SQL-6), export_challenges
-- (SQL-11), export_groups (SQL-12), export_quizzes (SQL-15), and the purge
-- hooks that delete_player calls: purge_player_reports (SQL-9),
-- purge_player_events (SQL-10) and purge_player_groups (SQL-12). A purge
-- hook removes rows, so its body goes in its owner's attended migration.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- What private.authenticate answers. code is null when the call may go on;
-- otherwise auth_failed, invalid_input or rate_limited, with the wait and
-- the scope that refused. created is true when this call registered the
-- player. prev_seen_at is players.last_seen_at as it was before this call
-- touched it, for the zone-hop rule of §8.7 ("20 hours since the previous
-- call").
do $$
begin
  create type private.auth_result as (
    player_id uuid,
    code text,
    retry_after_ms integer,
    limit_scope text,
    created boolean,
    prev_seen_at timestamptz);
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables (§8.3)
-- ---------------------------------------------------------------------------

-- One guest identity. The id is minted on the device; nothing here holds
-- the secret, only credentials hold its hash (AC-IDN-02).
create table if not exists private.players (
  id uuid primary key,
  created_at timestamptz not null default private.now(),
  is_test boolean not null default false,            -- the id starts with e2e2e2e2- (§8.17)
  track text not null default 'main' check (track in ('main', 'e2e')),
  low_trust boolean not null default false,          -- registered past a soft threshold (§8.5)
  friendly_name text not null check (char_length(friendly_name) between 1 and 64),
  nickname text check (char_length(nickname) between 1 and 24),
  age_band text check (age_band in ('13_17', '18_plus')),   -- an Under 13 answer never reaches the server (§9.7)
  age_band_set_at timestamptz,
  tz text check (char_length(tz) <= 64),             -- the stored zone (§8.7, SQL-4)
  tz_since timestamptz,
  max_local_date date,                               -- the latest local date served: today never goes back
  last_seen_at timestamptz,                          -- touched at most every 10 minutes
  last_finish_offset_min smallint,                   -- the date-line rule (PRD §4.4.7, SQL-7)
  last_finish_tz text check (char_length(last_finish_tz) <= 64),
  first_context text,                                -- the browser context and app at registration
  first_app text,
  first_finish_context text,                         -- cohort: where the first Daily finished (SQL-7)
  first_finish_date date
);
-- nightly_players finds test players older than a day through this index.
create index if not exists players_test_created_at_idx
  on private.players (created_at) where is_test;
select private.secure_table('private.players');

-- One device's secret, as sha256(secret). At most 10 per player: adding
-- an 11th overwrites the least recently used row (private.add_credential).
create table if not exists private.credentials (
  player_id uuid not null references private.players (id) on delete cascade,
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  source text not null check (source in ('mint', 'sync', 'claim')),
  created_at timestamptz not null default private.now(),
  last_used_at timestamptz not null default private.now(),   -- touched at most daily
  primary key (player_id, secret_hash)
);
select private.secure_table('private.credentials');

-- A player's sync code, as sha256 of its normalized form. Making a new
-- code overwrites the row, so the old code stops working (AC-SYN-03).
create table if not exists private.sync_codes (
  player_id uuid primary key references private.players (id) on delete cascade,
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  created_at timestamptz not null default private.now()
);
select private.secure_table('private.sync_codes');

-- A player's claim link (§9.5): the hash of a token minted on the device,
-- valid 10 minutes, single use. One row per player; the next claim
-- overwrites it, which also ends the previous token.
create table if not exists private.claims (
  player_id uuid primary key references private.players (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default private.now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
select private.secure_table('private.claims');

-- Friendly-name parts ("Plucky Otter"). MOD-1 loads the reviewed lists as
-- seed data; a word leaves the lists by active = false, never by removal.
create table if not exists private.name_parts (
  kind text not null check (kind in ('adjective', 'animal')),
  word text not null check (char_length(word) between 2 and 16 and word !~ '\s'),
  active boolean not null default true,
  primary key (kind, word)
);
select private.secure_table('private.name_parts');

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

-- A small starter list of plain words, so every combination is harmless.
insert into private.name_parts (kind, word)
select 'adjective', w
  from unnest(array['Plucky', 'Brave', 'Clever', 'Quiet', 'Swift', 'Sunny',
                    'Lucky', 'Merry', 'Nimble', 'Bold', 'Calm', 'Witty']) w
union all
select 'animal', w
  from unnest(array['Otter', 'Heron', 'Badger', 'Fox', 'Wren', 'Hare',
                    'Newt', 'Owl', 'Lynx', 'Puffin', 'Robin', 'Seal']) w
on conflict (kind, word) do nothing;

-- The identity buckets §8.6 does not list. The project-wide ones bound what
-- a forged client address could otherwise escape (see the header). Values
-- already stored (an owner's tuning) win over these defaults.
insert into private.config as c (key, value)
values ('limits', '{
  "identity_soft_all_1h": {"cap": 1000, "window_s": 3600},
  "identity_test_all_1h": {"cap": 1000, "window_s": 3600},
  "age_band_1d":          {"cap": 10,   "window_s": 86400},
  "sync_create_1d":       {"cap": 5,    "window_s": 86400},
  "sync_fail_all_1h":     {"cap": 1000, "window_s": 3600},
  "claim_fail_all_1h":    {"cap": 1000, "window_s": 3600},
  "export_1d":            {"cap": 5,    "window_s": 86400},
  "t_client_ip_1h":       {"cap": 30,   "window_s": 3600}
}')
on conflict (key) do update
  set value = excluded.value || c.value,
      updated_at = private.now();

-- Low trust lifts once the identity is this old or has finished this many
-- Dailies (PRD §3.10.1, tunable).
insert into private.config (key, value)
values ('low_trust', '{"lift_after_s": 86400, "lift_after_finishes": 2}')
on conflict (key) do nothing;

-- The client-address rule starts unverified. Whoever records CI-0's
-- verified rule sets "verified": true with it (§8.6).
update private.config c
   set value = c.value || '{"verified": false}', updated_at = private.now()
 where c.key = 'client_ip' and c.value -> 'verified' is null;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

-- 43 base64url characters: the shape of a secret or a claim token (§2.4).
create or replace function private.valid_token(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(octet_length(p_text) = 43 and p_text ~ '^[A-Za-z0-9_-]{43}$', false)
$$;

-- sha256 of text: secrets, claim tokens and normalized sync codes are
-- stored only this way.
create or replace function private.sha256_text(p_text text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(p_text, 'UTF8'))
$$;

-- A v4 UUID in the form the device mints, so every stored id decodes on
-- the client (parsePlayerId).
create or replace function private.valid_player_id(p_player uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_player::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
$$;

-- The reserved test identities (§8.17).
create or replace function private.is_test_player_id(p_player uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_player::text like 'e2e2e2e2-%', false)
$$;

-- The browser context and app of §7.2 (BrowserContextKind, AppTag).
create or replace function private.valid_context(p_context text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_context in ('browser', 'installed', 'in_app', 'unknown'), false)
$$;

create or replace function private.valid_app(p_app text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_app in ('whatsapp', 'instagram', 'facebook', 'messenger', 'tiktok', 'snapchat',
                            'linkedin', 'telegram', 'google', 'other', 'none'), false)
$$;

-- True once the client-address rule is marked verified (§8.6).
create or replace function private.client_ip_verified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.cfg('client_ip') -> 'verified' = 'true'::jsonb, false)
$$;

-- Loopback, private, shared, link-local, documentation and other reserved
-- ranges: hops a proxy may add, which never name a client on the internet.
create or replace function private.is_reserved_ip(p_ip inet)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_ip <<= any (array['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
                        '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15',
                        '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3', '::/127', 'fc00::/7',
                        'fe80::/10', '2001:db8::/32', 'ff00::/8']::inet[]),
    false)
$$;

-- An owner alert of one kind and item, once per period (since p_since).
-- Details hold no player id or address.
create or replace function private.alert_once(p_kind text, p_item text, p_detail jsonb, p_since timestamptz)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.alerts a
     where a.kind = p_kind and a.detail ->> 'item' = p_item and a.at >= p_since) then
    return false;
  end if;
  insert into private.alerts (kind, detail)
  values (p_kind, coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('item', p_item));
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Hooks other tickets fill (§8.15). Each owner replaces only its own body.
-- ---------------------------------------------------------------------------

-- SQL-4: the Dailies the player has finished (attempts of kind daily,
-- status finished), for lifting low trust (§8.5 step 3).
create or replace function private.finished_dailies(p_player uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select 0
$$;

-- SQL-4: the player's most recently finished Daily as
-- {"daily_number": 42, "date": "2026-11-01"}, or null (RestoredProfile,
-- ClaimPreview).
create or replace function private.identity_last_daily(p_player uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select null::jsonb
$$;

-- SQL-6: {"current": n, "best": n}, the streak a restore or a claim shows.
create or replace function private.identity_streak(p_player uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select '{"current": 0, "best": 0}'::jsonb
$$;

-- The export's arrays (ServerDataExport, §3.10): SQL-4 attempts, SQL-6
-- streak days, SQL-11 challenges, SQL-12 Group memberships, SQL-15 quizzes.
create or replace function private.export_attempts(p_player uuid)
returns jsonb language sql stable set search_path = '' as $$ select '[]'::jsonb $$;
create or replace function private.export_streak_days(p_player uuid)
returns jsonb language sql stable set search_path = '' as $$ select '[]'::jsonb $$;
create or replace function private.export_challenges(p_player uuid)
returns jsonb language sql stable set search_path = '' as $$ select '[]'::jsonb $$;
create or replace function private.export_groups(p_player uuid)
returns jsonb language sql stable set search_path = '' as $$ select '[]'::jsonb $$;
create or replace function private.export_quizzes(p_player uuid)
returns jsonb language sql stable set search_path = '' as $$ select '[]'::jsonb $$;

-- delete_player's purge steps for rows that no foreign key cascades
-- (§8.4): SQL-9 reports, hearts and practice bitsets; SQL-10 events;
-- SQL-12 the admin handover before memberships go. Bodies that remove
-- rows belong in their owner's attended migration.
create or replace function private.purge_player_reports(p_player uuid) returns void
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.purge_player_events(p_player uuid) returns void
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.purge_player_groups(p_player uuid) returns void
language plpgsql volatile set search_path = '' as $$ begin null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

-- A generated friendly name: one active adjective and one active animal,
-- picked by a hash of the player id, so a player's name never depends on
-- timing.
create or replace function private.friendly_name_for(p_player uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_seed bytea := sha256(convert_to('qz-friendly-name|' || p_player::text, 'UTF8'));
  v_adjectives integer;
  v_animals integer;
  v_adjective text;
  v_animal text;
begin
  select count(*) into v_adjectives from private.name_parts n where n.kind = 'adjective' and n.active;
  select count(*) into v_animals from private.name_parts n where n.kind = 'animal' and n.active;
  if v_adjectives = 0 or v_animals = 0 then
    return 'Plucky Otter';
  end if;
  select n.word into v_adjective
    from private.name_parts n
   where n.kind = 'adjective' and n.active
   order by n.word
  offset ((get_byte(v_seed, 0) << 8) | get_byte(v_seed, 1)) % v_adjectives
   limit 1;
  select n.word into v_animal
    from private.name_parts n
   where n.kind = 'animal' and n.active
   order by n.word
  offset ((get_byte(v_seed, 2) << 8) | get_byte(v_seed, 3)) % v_animals
   limit 1;
  return v_adjective || ' ' || v_animal;
end
$$;

-- Profile (§3.10): times in epoch milliseconds, as every RPC sends them.
create or replace function private.profile_json(p_player uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'player_id', p.id,
    'friendly_name', p.friendly_name,
    'nickname', p.nickname,
    'age_band', p.age_band,
    'created_at', private.epoch_ms(p.created_at))
    from private.players p
   where p.id = p_player
$$;

-- What a sync-code or claim restore answers: { player_id, profile, streak,
-- last_daily } (RestoredProfile and the player id).
create or replace function private.restored_json(p_player uuid)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'player_id', p_player,
    'profile', private.profile_json(p_player),
    'streak', private.identity_streak(p_player),
    'last_daily', private.identity_last_daily(p_player))
$$;

-- ---------------------------------------------------------------------------
-- Players and credentials
-- ---------------------------------------------------------------------------

-- Creates a player with a generated friendly name and its mint credential.
-- False, and nothing written, when the id exists already: a concurrent
-- first write of the same id won the race (§8.5 step 5).
create or replace function private.create_player(
  p_player uuid, p_hash bytea, p_low_trust boolean, p_context text, p_app text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_test boolean := private.is_test_player_id(p_player);
begin
  insert into private.players (id, created_at, is_test, track, low_trust, friendly_name, first_context, first_app)
  values (p_player, v_now, v_test, case when v_test then 'e2e' else 'main' end,
          coalesce(p_low_trust, false) and not v_test, private.friendly_name_for(p_player), p_context, p_app)
  on conflict (id) do nothing;
  if not found then
    return false;
  end if;
  insert into private.credentials (player_id, secret_hash, source, created_at, last_used_at)
  values (p_player, p_hash, 'mint', v_now, v_now);
  return true;
end
$$;

-- Adds a device credential for a sync-code or claim restore. The same
-- secret again only touches its row. A player keeps at most 10: the 11th
-- overwrites the least recently used one, which then needs a sync code to
-- write again (PRD §3.10.1). The player row's lock puts one device change
-- at a time.
create or replace function private.add_credential(p_player uuid, p_hash bytea, p_source text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_count integer;
begin
  perform 1 from private.players p where p.id = p_player for update;
  if not found then
    raise exception 'add_credential: no such player';
  end if;
  update private.credentials c
     set last_used_at = v_now
   where c.player_id = p_player and c.secret_hash = p_hash;
  if found then
    return;
  end if;
  select count(*) into v_count from private.credentials c where c.player_id = p_player;
  if v_count < 10 then
    insert into private.credentials (player_id, secret_hash, source, created_at, last_used_at)
    values (p_player, p_hash, p_source, v_now, v_now);
  else
    update private.credentials c
       set secret_hash = p_hash, source = p_source, created_at = v_now, last_used_at = v_now
     where c.player_id = p_player
       and c.secret_hash = (
         select o.secret_hash
           from private.credentials o
          where o.player_id = p_player
          order by o.last_used_at, o.created_at, o.secret_hash
          limit 1);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- private.authenticate (§8.5)
-- ---------------------------------------------------------------------------

-- 1. A null id or a secret of the wrong shape: auth_failed.
-- 2. The secret's sha256.
-- 3. A known credential: general_player_5m counted (rate_limited past it,
--    with nothing else touched); the credential's last_used_at touched when
--    a day old and the player's last_seen_at when 10 minutes old; low trust
--    lifted once the identity is old enough or has finished enough Dailies
--    (config.low_trust); the player.
-- 4. A known player without that credential: auth_failed. So is an unknown
--    player when p_register is false (6).
-- 5. Registration: a v4 id and the context and app in their enums
--    (invalid_input); the project ceiling, then the address's burst limit,
--    each refusing with rate_limited, its wait and scope, and giving back
--    the hit the other counted (a tripped ceiling alerts the owner once an
--    hour); test ids count only in their own buckets and are never low
--    trust. Low trust past either soft threshold or while the client
--    address is unverified. The player is inserted with on conflict do
--    nothing: the loser of a race between two first writes of one id gives
--    its hits back and goes back to step 3, so one player is created.
create or replace function private.authenticate(
  p_player uuid,
  p_secret text,
  p_register boolean,
  p_context text default 'unknown',
  p_app text default 'none')
returns private.auth_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_hash bytea;
  v_row record;
  v_limit private.limit_result;
  v_soft_ip private.limit_result;
  v_soft_all private.limit_result;
  v_ip inet;
  v_test boolean;
  v_low boolean := false;
  v_created boolean := false;
  v_lift jsonb;
  v_try integer;
begin
  if p_player is null or not private.valid_token(p_secret) then
    return row(null, 'auth_failed', null, null, false, null)::private.auth_result;
  end if;
  v_hash := private.sha256_text(p_secret);

  for v_try in 1 .. 2 loop
    select p.created_at, p.low_trust, p.last_seen_at, c.last_used_at
      into v_row
      from private.credentials c
      join private.players p on p.id = c.player_id
     where c.player_id = p_player and c.secret_hash = v_hash;
    if found then
      v_limit := private.hit_player('general_player_5m', p_player);
      if not v_limit.allowed then
        return row(p_player, 'rate_limited', v_limit.retry_after_ms, v_limit.scope,
                   v_created, v_row.last_seen_at)::private.auth_result;
      end if;
      if v_row.last_used_at < v_now - interval '1 day' then
        update private.credentials c
           set last_used_at = v_now
         where c.player_id = p_player and c.secret_hash = v_hash;
      end if;
      if v_row.last_seen_at is null or v_row.last_seen_at < v_now - interval '10 minutes' then
        update private.players p set last_seen_at = v_now where p.id = p_player;
      end if;
      if v_row.low_trust then
        v_lift := private.cfg('low_trust');
        if v_row.created_at <= v_now - make_interval(secs => coalesce((v_lift ->> 'lift_after_s')::double precision, 86400))
           or private.finished_dailies(p_player) >= coalesce((v_lift ->> 'lift_after_finishes')::integer, 2) then
          update private.players p set low_trust = false where p.id = p_player;
        end if;
      end if;
      return row(p_player, null, null, null, v_created, v_row.last_seen_at)::private.auth_result;
    end if;

    if v_try = 2 or not coalesce(p_register, false)
       or exists (select 1 from private.players p where p.id = p_player) then
      return row(null, 'auth_failed', null, null, false, null)::private.auth_result;
    end if;

    if not private.valid_player_id(p_player) or not private.valid_context(p_context)
       or not private.valid_app(p_app) then
      return row(null, 'invalid_input', null, null, false, null)::private.auth_result;
    end if;
    v_ip := private.client_ip();
    v_test := private.is_test_player_id(p_player);
    if v_test then
      v_limit := private.hit_ip('identity_test_1h', v_ip);
      if v_limit.allowed then
        v_limit := private.hit_global('identity_test_all_1h');
        if not v_limit.allowed then
          perform private.unhit_ip('identity_test_1h', v_ip);
        end if;
      end if;
    else
      v_limit := private.hit_global('identity_all_1h');
      if not v_limit.allowed then
        perform private.alert_once('identity_ceiling', 'identity_all_1h',
          jsonb_build_object('cap', private.limit('identity_all_1h')),
          private.window_start(v_now, private.limit_window('identity_all_1h')));
      else
        v_limit := private.hit_ip('identity_1m', v_ip);
        if not v_limit.allowed then
          perform private.unhit_global('identity_all_1h');
        end if;
      end if;
    end if;
    if not v_limit.allowed then
      return row(null, 'rate_limited', v_limit.retry_after_ms, v_limit.scope, false, null)::private.auth_result;
    end if;
    if not v_test then
      v_soft_ip := private.hit_ip('identity_soft_1h', v_ip);
      v_soft_all := private.hit_global('identity_soft_all_1h');
      v_low := not v_soft_ip.allowed or not v_soft_all.allowed or not private.client_ip_verified();
    end if;

    v_created := private.create_player(p_player, v_hash, v_low, p_context, p_app);
    if not v_created then
      if v_test then
        perform private.unhit_ip('identity_test_1h', v_ip);
        perform private.unhit_global('identity_test_all_1h');
      else
        perform private.unhit_global('identity_all_1h');
        perform private.unhit_ip('identity_1m', v_ip);
        perform private.unhit_ip('identity_soft_1h', v_ip);
        perform private.unhit_global('identity_soft_all_1h');
      end if;
    end if;
  end loop;
  return row(null, 'auth_failed', null, null, false, null)::private.auth_result;
end
$$;

-- The envelope for an authenticate refusal: the same auth_failed for every
-- wrong secret (AC-IDN-03), or rate_limited with its wait and scope.
create or replace function private.auth_refusal(p_auth private.auth_result)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.err((p_auth).code, p_retry_after_ms => (p_auth).retry_after_ms,
                     p_limit_scope => (p_auth).limit_scope)
$$;

-- An RPC's own bucket refused after authenticate passed: the
-- general_player_5m hit is given back, so the refused call consumes no
-- counter but the one that refused (§8.6).
create or replace function private.auth_limited(p_auth private.auth_result, p_limit private.limit_result)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
begin
  if (p_auth).player_id is not null then
    perform private.unhit_player('general_player_5m', (p_auth).player_id);
  end if;
  return private.rate_limited(p_limit);
end
$$;

-- ---------------------------------------------------------------------------
-- The export (export_my_data, §3.10 ServerDataExport)
-- ---------------------------------------------------------------------------

-- Everything kept about the player, by its id: the profile, an account
-- block (zone, first contexts, devices without their hashes, the sync code
-- and claim dates), and the arrays other tickets fill.
create or replace function private.export_json(p_player uuid)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', private.epoch_ms(private.now()),
    'profile', private.profile_json(p.id),
    'account', jsonb_build_object(
      'track', p.track,
      'age_band_set_at', private.epoch_ms(p.age_band_set_at),
      'time_zone', p.tz,
      'time_zone_since', private.epoch_ms(p.tz_since),
      'latest_local_date', p.max_local_date,
      'last_seen_at', private.epoch_ms(p.last_seen_at),
      'first_context', p.first_context,
      'first_app', p.first_app,
      'first_finish_context', p.first_finish_context,
      'first_finish_date', p.first_finish_date,
      'last_finish_time_zone', p.last_finish_tz,
      'last_finish_offset_min', p.last_finish_offset_min,
      'devices', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'source', c.source,
                 'created_at', private.epoch_ms(c.created_at),
                 'last_used_at', private.epoch_ms(c.last_used_at)) order by c.created_at, c.last_used_at), '[]'::jsonb)
          from private.credentials c where c.player_id = p.id),
      'sync_code', (
        select jsonb_build_object('created_at', private.epoch_ms(s.created_at))
          from private.sync_codes s where s.player_id = p.id),
      'claim', (
        select jsonb_build_object(
                 'created_at', private.epoch_ms(k.created_at),
                 'expires_at', private.epoch_ms(k.expires_at),
                 'redeemed_at', private.epoch_ms(k.redeemed_at))
          from private.claims k where k.player_id = p.id)),
    'attempts', private.export_attempts(p.id),
    'streak_days', private.export_streak_days(p.id),
    'groups', private.export_groups(p.id),
    'challenges', private.export_challenges(p.id),
    'quizzes', private.export_quizzes(p.id))
    from private.players p
   where p.id = p_player
$$;

-- ---------------------------------------------------------------------------
-- The identity RPCs (§8.4). Each follows supabase/README.md §3: sizes,
-- authentication and limits, validation, then only the writes in a block
-- that catches.
-- ---------------------------------------------------------------------------

-- Registers the identity, or answers its profile when it exists: Profile.
create or replace function public.register_player(p_player uuid, p_secret text, p_context text, p_app text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
begin
  if private.over_cap(p_context) or private.over_cap(p_app) then
    return private.err('invalid_input');
  end if;
  v_auth := private.authenticate(p_player, p_secret, true, p_context, p_app);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  if not private.valid_context(p_context) or not private.valid_app(p_app) then
    return private.err('invalid_input');
  end if;
  return private.ok(private.profile_json(v_auth.player_id));
end
$$;

-- Profile.
create or replace function public.get_profile(p_player uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
begin
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  return private.ok(private.profile_json(v_auth.player_id));
end
$$;

-- Stores 13_17 or 18_plus at one of the five moments (PRD §3.10.6); an
-- Under 13 answer is never sent (§9.7), so it is invalid_input. Profile.
create or replace function public.set_age_band(p_player uuid, p_secret text, p_band text, p_moment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
  v_limit private.limit_result;
begin
  if private.over_cap(p_band) or private.over_cap(p_moment) then
    return private.err('invalid_input');
  end if;
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  v_limit := private.hit_player('age_band_1d', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  if p_band is null or p_band not in ('13_17', '18_plus')
     or p_moment is null or p_moment not in ('nickname', 'group', 'reminder', 'quiz_share', 'room_name') then
    return private.err('invalid_input');
  end if;
  begin
    update private.players p
       set age_band = p_band, age_band_set_at = private.now()
     where p.id = v_auth.player_id and p.age_band is distinct from p_band;
    return private.ok(private.profile_json(v_auth.player_id));
  exception
    when others then
      return private.fail_internal('set_age_band', sqlstate, sqlerrm);
  end;
end
$$;

-- A new sync code: 16 Crockford characters from 10 random bytes. Only its
-- hash is kept, and it overwrites the previous one (AC-SYN-03).
-- { code, created_at }.
create or replace function public.create_sync_code(p_player uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
  v_limit private.limit_result;
  v_now timestamptz := private.now();
  v_code text;
  v_hash bytea;
  v_try integer;
begin
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  v_limit := private.hit_player('sync_create_1d', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  begin
    for v_try in 1 .. 5 loop
      v_code := private.random_code(10);
      v_hash := private.sha256_text(v_code);
      exit when not exists (select 1 from private.sync_codes s where s.code_hash = v_hash);
    end loop;
    insert into private.sync_codes as s (player_id, code_hash, created_at)
    values (v_auth.player_id, v_hash, v_now)
    on conflict (player_id) do update
      set code_hash = excluded.code_hash, created_at = excluded.created_at;
    return private.ok(jsonb_build_object('code', v_code, 'created_at', private.epoch_ms(v_now)));
  exception
    when others then
      return private.fail_internal('create_sync_code', sqlstate, sqlerrm);
  end;
end
$$;

-- Restores a player from its sync code onto a device, which sends the new
-- secret it minted. The failure counters come before the code is looked
-- at (AC-SYN-04): every attempt counts first and is given back when the
-- code is right (supabase/README.md §3). Typed forms are normalized
-- (AC-SYN-02). { player_id, profile, streak, last_daily }.
create or replace function public.redeem_sync_code(p_code text, p_new_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip inet := private.client_ip();
  v_fail private.limit_result;
  v_day private.limit_result;
  v_all private.limit_result;
  v_code text;
  v_player uuid;
begin
  if private.over_cap(p_code) then
    return private.err('invalid_input');
  end if;
  if not private.valid_token(p_new_secret) then
    return private.err('invalid_input');
  end if;
  v_fail := private.hit_ip('sync_fail_15m', v_ip);
  if not v_fail.allowed then
    return private.rate_limited(v_fail);
  end if;
  v_day := private.hit_ip('sync_1d', v_ip);
  if not v_day.allowed then
    perform private.unhit_ip('sync_fail_15m', v_ip);
    return private.rate_limited(v_day);
  end if;
  v_all := private.hit_global('sync_fail_all_1h');
  if not v_all.allowed then
    perform private.unhit_ip('sync_fail_15m', v_ip);
    perform private.unhit_ip('sync_1d', v_ip);
    return private.rate_limited(v_all);
  end if;
  v_code := private.crockford_normalize(p_code);
  if v_code is null or v_code !~ '^[0-9A-HJKMNP-TV-Z]{16}$' then
    return private.err('invalid_input');
  end if;
  select s.player_id into v_player from private.sync_codes s where s.code_hash = private.sha256_text(v_code);
  if v_player is null then
    return private.err('not_found');
  end if;
  perform private.unhit_ip('sync_fail_15m', v_ip);
  perform private.unhit_ip('sync_1d', v_ip);
  perform private.unhit_global('sync_fail_all_1h');
  begin
    perform private.add_credential(v_player, private.sha256_text(p_new_secret), 'sync');
    return private.ok(private.restored_json(v_player));
  exception
    when others then
      return private.fail_internal('redeem_sync_code', sqlstate, sqlerrm);
  end;
end
$$;

-- Starts a claim link with a token the device minted (§9.5): its hash,
-- valid 10 minutes. The token is the call's idempotency key: the same token
-- again returns the same claim and counts once; held by another player it
-- is conflict. { expires_at }.
create or replace function public.create_claim(p_player uuid, p_secret text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
  v_limit private.limit_result;
  v_now timestamptz := private.now();
  v_hash bytea;
  v_claim record;
  v_expires timestamptz;
begin
  if private.over_cap(p_token) then
    return private.err('invalid_input');
  end if;
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  if not private.valid_token(p_token) then
    return private.err('invalid_input');
  end if;
  v_hash := private.sha256_text(p_token);
  select k.player_id, k.expires_at into v_claim from private.claims k where k.token_hash = v_hash;
  if found then
    if v_claim.player_id <> v_auth.player_id then
      return private.err('conflict');
    end if;
    return private.ok(jsonb_build_object('expires_at', private.epoch_ms(v_claim.expires_at)));
  end if;
  v_limit := private.hit_player('claim_player_1h', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  begin
    insert into private.claims as k (player_id, token_hash, created_at, expires_at, redeemed_at)
    values (v_auth.player_id, v_hash, v_now, v_now + interval '10 minutes', null)
    on conflict (player_id) do update
      set token_hash = excluded.token_hash, created_at = excluded.created_at,
          expires_at = excluded.expires_at, redeemed_at = null
    returning k.expires_at into v_expires;
    return private.ok(jsonb_build_object('expires_at', private.epoch_ms(v_expires)));
  exception
    when others then
      return private.fail_internal('create_claim', sqlstate, sqlerrm);
  end;
end
$$;

-- The claim a token names, for the confirm step: ClaimPreview. A used or
-- expired claim is expired, with current {"used": true | false} so the
-- client can tell them apart (claim_link_used). Every call counts in
-- claim_ip_1h; only a token that names no claim counts as a failure.
create or replace function public.peek_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip inet := private.client_ip();
  v_limit private.limit_result;
  v_fail private.limit_result;
  v_claim record;
begin
  if private.over_cap(p_token) then
    return private.err('invalid_input');
  end if;
  v_limit := private.hit_ip('claim_ip_1h', v_ip);
  if not v_limit.allowed then
    return private.rate_limited(v_limit);
  end if;
  v_fail := private.hit_global('claim_fail_all_1h');
  if not v_fail.allowed then
    perform private.unhit_ip('claim_ip_1h', v_ip);
    return private.rate_limited(v_fail);
  end if;
  if not private.valid_token(p_token) then
    return private.err('not_found');
  end if;
  select k.player_id, k.expires_at, k.redeemed_at, p.friendly_name, p.nickname
    into v_claim
    from private.claims k
    join private.players p on p.id = k.player_id
   where k.token_hash = private.sha256_text(p_token);
  if not found then
    return private.err('not_found');
  end if;
  perform private.unhit_global('claim_fail_all_1h');
  if v_claim.redeemed_at is not null then
    return private.err('expired', p_current => '{"used": true}');
  end if;
  if v_claim.expires_at <= private.now() then
    return private.err('expired', p_current => '{"used": false}');
  end if;
  return private.ok(jsonb_build_object(
    'friendly_name', v_claim.friendly_name,
    'nickname', v_claim.nickname,
    'streak', coalesce((private.identity_streak(v_claim.player_id) ->> 'current')::integer, 0),
    'last_daily', private.identity_last_daily(v_claim.player_id),
    'expires_at', private.epoch_ms(v_claim.expires_at)));
end
$$;

-- Redeems a claim on this device with the new secret it minted: a claim
-- credential for the same player, so the in-app copy keeps working. The
-- update that sets redeemed_at makes it single use, also between two
-- concurrent redemptions (AC-IAB-04). { player_id, profile, streak,
-- last_daily }.
create or replace function public.redeem_claim(p_token text, p_new_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip inet := private.client_ip();
  v_limit private.limit_result;
  v_fail private.limit_result;
  v_hash bytea;
  v_claim record;
  v_player uuid;
begin
  if private.over_cap(p_token) then
    return private.err('invalid_input');
  end if;
  if not private.valid_token(p_new_secret) then
    return private.err('invalid_input');
  end if;
  v_limit := private.hit_ip('claim_ip_1h', v_ip);
  if not v_limit.allowed then
    return private.rate_limited(v_limit);
  end if;
  v_fail := private.hit_global('claim_fail_all_1h');
  if not v_fail.allowed then
    perform private.unhit_ip('claim_ip_1h', v_ip);
    return private.rate_limited(v_fail);
  end if;
  if not private.valid_token(p_token) then
    return private.err('not_found');
  end if;
  v_hash := private.sha256_text(p_token);
  select k.expires_at, k.redeemed_at into v_claim from private.claims k where k.token_hash = v_hash;
  if not found then
    return private.err('not_found');
  end if;
  perform private.unhit_global('claim_fail_all_1h');
  if v_claim.redeemed_at is not null then
    return private.err('expired', p_current => '{"used": true}');
  end if;
  if v_claim.expires_at <= private.now() then
    return private.err('expired', p_current => '{"used": false}');
  end if;
  begin
    update private.claims k
       set redeemed_at = private.now()
     where k.token_hash = v_hash and k.redeemed_at is null and k.expires_at > private.now()
    returning k.player_id into v_player;
    if v_player is null then
      return private.err('expired', p_current => '{"used": true}');
    end if;
    perform private.add_credential(v_player, private.sha256_text(p_new_secret), 'claim');
    return private.ok(private.restored_json(v_player));
  exception
    when others then
      return private.fail_internal('redeem_claim', sqlstate, sqlerrm);
  end;
end
$$;

-- Everything the server keeps about the caller: ServerDataExport plus the
-- account block (private.export_json).
create or replace function public.export_my_data(p_player uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
  v_limit private.limit_result;
begin
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  v_limit := private.hit_player('export_1d', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  begin
    return private.ok(private.export_json(v_auth.player_id));
  exception
    when others then
      return private.fail_internal('export_my_data', sqlstate, sqlerrm);
  end;
end
$$;

-- Deleting a player removes rows, so its body is in
-- 20261104000500_identity_attended.sql. Until that is applied this version
-- authenticates (a wrong secret is auth_failed, AC-IDN-03), answers
-- unavailable with an hour's wait, and leaves one owner_queue alert a day.
create or replace function public.delete_player(p_player uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
begin
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  perform private.alert_once('owner_queue', '20261104000500_identity_attended',
    jsonb_build_object('why', 'delete_player refused a player''s request with unavailable: the deletion '
      || 'waits for this migration, applied in a session someone attends (supabase/README.md, section 9).'),
    date_trunc('day', private.now(), 'UTC'));
  return private.err('unavailable', p_retry_after_ms => 3600000);
end
$$;

-- For the client-ip contract test (§8.6), test identities only (others
-- are not_found). It reports, as booleans and header names and never as
-- addresses, where the forged X-Forwarded-For value 203.0.113.7 the test
-- sends ends up: whether private.client_ip() chose it, whether it is the
-- first or the last hop, the kind of each hop from left to right
-- ("forged", "reserved", "public" or "invalid"), the request's header
-- names, the headers that carry it, and the rule in force.
create or replace function public.t_client_ip(p_player uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_forged constant inet := '203.0.113.7';
  v_auth private.auth_result;
  v_limit private.limit_result;
  v_headers jsonb;
  v_hops text[];
  v_count integer;
  v_kinds jsonb := '[]'::jsonb;
  v_hop inet;
  v_index integer;
  v_names jsonb;
  v_carriers jsonb;
begin
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  if not exists (select 1 from private.players p where p.id = v_auth.player_id and p.is_test) then
    return private.err('not_found');
  end if;
  v_limit := private.hit_player('t_client_ip_1h', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      v_headers := null;
  end;
  if jsonb_typeof(v_headers) is distinct from 'object' then
    v_headers := '{}'::jsonb;
  end if;
  v_hops := string_to_array(v_headers ->> 'x-forwarded-for', ',');
  v_count := coalesce(cardinality(v_hops), 0);
  for v_index in 1 .. v_count loop
    v_hop := private.parse_ip(v_hops[v_index]);
    v_kinds := v_kinds || to_jsonb(case
      when v_hop is null then 'invalid'
      when v_hop = c_forged then 'forged'
      when private.is_reserved_ip(v_hop) then 'reserved'
      else 'public' end);
  end loop;
  select coalesce(jsonb_agg(h.name order by h.name), '[]'::jsonb)
    into v_names
    from jsonb_object_keys(v_headers) h(name);
  select coalesce(jsonb_agg(h.key order by h.key), '[]'::jsonb)
    into v_carriers
    from jsonb_each_text(v_headers) h
   where exists (
     select 1 from unnest(string_to_array(h.value, ',')) v(hop) where private.parse_ip(v.hop) = c_forged);
  return private.ok(jsonb_build_object(
    'chosen_forged', coalesce(private.client_ip() = c_forged, false),
    'first_hop_forged', coalesce(private.parse_ip(v_hops[1]) = c_forged, false),
    'last_hop_forged', coalesce(private.parse_ip(v_hops[v_count]) = c_forged, false),
    'hops', v_count,
    'hop_kinds', v_kinds,
    'header_names', v_names,
    'forged_headers', v_carriers,
    'rule', private.cfg('client_ip')));
end
$$;

insert into private.rpc_allowlist (name)
values ('register_player'), ('get_profile'), ('set_age_band'), ('create_sync_code'),
       ('redeem_sync_code'), ('create_claim'), ('peek_claim'), ('redeem_claim'),
       ('export_my_data'), ('delete_player'), ('t_client_ip')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- nightly_players (§8.15)
-- ---------------------------------------------------------------------------

-- Until 20261104000500_identity_attended.sql replaces it: expired claims
-- need nothing (each player's one claim row is overwritten), and test
-- players older than a day stay, so one owner_queue alert a day names that
-- migration while any exist. While the client-address rule is unverified,
-- one more alert a day says that new identities register as low trust.
create or replace function private.nightly_players()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
begin
  if exists (select 1 from private.players p where p.is_test and p.created_at < v_now - interval '1 day') then
    perform private.alert_once('owner_queue', '20261104000500_identity_attended',
      jsonb_build_object('why', 'Test players older than a day stay, and delete_player answers unavailable, until '
        || 'this migration is applied in a session someone attends (supabase/README.md, section 9).'),
      date_trunc('day', v_now, 'UTC'));
  end if;
  if not private.client_ip_verified() then
    perform private.alert_once('owner_queue', 'client_ip_unverified',
      jsonb_build_object('why', 'New identities register as low trust until the client-ip contract test '
        || 'verifies the hop rule in private.config.client_ip and "verified": true is set (ARCHITECTURE §8.6, CI-0).'),
      date_trunc('day', v_now, 'UTC'));
  end if;
end
$$;
