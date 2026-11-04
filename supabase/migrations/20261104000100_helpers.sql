-- SQL-1 (ARCHITECTURE §8.2, §8.6, §8.15, §8.16, §8.17): the helpers every
-- RPC builds on.
--
-- Everything here lives in private, is SECURITY INVOKER and sets
-- search_path = '' (lint 0011). RPCs in public run as postgres, so they can
-- call these; no API role can, because nothing grants USAGE on private. Like
-- the baseline, this file only creates, so it applies unattended.
--
-- Contents: the envelope (ok with its response-size sample, err,
-- rate_limited, the error log), text (clean_text, strip_links, redact,
-- payload caps), zones (valid_tz), client addresses and subjects
-- (client_ip, parse_ip, ip_prefix, salt_for, subject), the limiter (hit,
-- peek, unhit and their ip, player and global forms, limit,
-- limit_window), write keys, codes and tokens (crockford, random_code,
-- random_token), the scheduled-job bodies with every hook of §8.15 as a
-- no-op, and the SQL test helpers.
--
-- Signatures are contracts: a later migration may replace a body with
-- create or replace, but changing a return type or a parameter would need
-- the owner, so they are chosen once, here.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- What a rate-limit check answers: retry_after_ms is set when refused, and
-- scope (ip, player or project) names whose limit it was (§7.3, §8.6).
do $$
begin
  create type private.limit_result as (allowed boolean, retry_after_ms integer, scope text);
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- Time and configuration
-- ---------------------------------------------------------------------------

-- Milliseconds since the Unix epoch, the unit of every server_time.
create or replace function private.epoch_ms(p_at timestamptz)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select floor(extract(epoch from p_at) * 1000)::bigint
$$;

create or replace function private.cfg(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select c.value from private.config c where c.key = p_key
$$;

-- ---------------------------------------------------------------------------
-- The envelope (§8.2 rule 5)
-- ---------------------------------------------------------------------------

-- { ok: true, data, server_time }. A share of calls (egress_sample_rate,
-- 1% at launch) adds the response's size to egress_samples, the only egress
-- figure Postgres can see (§8.1). Read-only transactions skip the sample.
create or replace function private.ok(p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_envelope jsonb := jsonb_build_object(
    'ok', true, 'data', p_data, 'server_time', private.epoch_ms(v_now));
  v_rate jsonb := private.cfg('egress_sample_rate');
begin
  if jsonb_typeof(v_rate) = 'number'
     and random() < (v_rate #>> '{}')::double precision
     and current_setting('transaction_read_only') = 'off' then
    insert into private.egress_samples as s (hour, calls, bytes)
    values (date_trunc('hour', v_now, 'UTC'), 1, octet_length(v_envelope::text))
    on conflict (hour) do update
      set calls = s.calls + 1, bytes = s.bytes + excluded.bytes;
  end if;
  return v_envelope;
end
$$;

-- { ok: false, code, current, retry_after_ms, limit_scope, ref, server_time }.
-- Expected failures return this; they never raise (§8.2 rule 5). An unknown
-- code, or a rate_limited without its wait and scope, is a bug and raises.
create or replace function private.err(
  p_code text,
  p_current jsonb default null,
  p_retry_after_ms integer default null,
  p_ref text default null,
  p_limit_scope text default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_code is null or p_code not in (
    'unavailable', 'feature_disabled', 'auth_failed', 'rate_limited',
    'limit_reached', 'invalid_input', 'invalid_entity', 'already_guessed',
    'blocked_text', 'age_required', 'age_forbidden', 'not_found', 'stale',
    'conflict', 'already_played', 'expired', 'not_open', 'full', 'locked',
    'removed', 'ended', 'not_member', 'no_daily', 'internal') then
    raise exception 'private.err: % is not an error code an RPC returns', coalesce(p_code, 'null');
  end if;
  if p_retry_after_ms is not null and p_retry_after_ms < 0 then
    raise exception 'private.err: retry_after_ms must not be negative';
  end if;
  if p_limit_scope is not null
     and (p_code <> 'rate_limited' or p_limit_scope not in ('ip', 'player', 'project')) then
    raise exception 'private.err: limit_scope % does not fit code %', p_limit_scope, p_code;
  end if;
  if p_code = 'rate_limited' and (coalesce(p_retry_after_ms, 0) < 1 or p_limit_scope is null) then
    raise exception 'private.err: rate_limited needs retry_after_ms and limit_scope';
  end if;
  return jsonb_build_object(
    'ok', false,
    'code', p_code,
    'current', p_current,
    'retry_after_ms', p_retry_after_ms,
    'limit_scope', p_limit_scope,
    'ref', p_ref,
    'server_time', private.epoch_ms(private.now()));
end
$$;

-- ---------------------------------------------------------------------------
-- Text (§8.4: clean_text before validation; §8.12: links out of report
-- notes; §8.3: redaction before rpc_errors stores a detail)
-- ---------------------------------------------------------------------------

-- NFC, invisible and control characters removed (bidi controls and zero
-- width spaces too, but not the joiners emoji need), every run of
-- whitespace collapsed to one space, trimmed.
create or replace function private.clean_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        normalize(p_text, NFC),
        '[\u0001-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]',
        '', 'g'),
      '[\s\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+',
      ' ', 'g'),
    ' ')
$$;

-- Removes links: anything with a scheme, www., mailto: and tel: forms,
-- domains with a path, and bare domains on common top-level domains. The
-- result is cleaned again, so no double spaces are left behind.
create or replace function private.strip_links(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.clean_text(regexp_replace(
    p_text,
    '(?:[a-z][a-z0-9+.-]*://|www\.|mailto:|tel:)\S*'
      || '|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/\S*'
      || '|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|io|co|me|ly|app|dev|xyz|site|online|link|top|tk|gg|tv|ru|cn|uk|de|fr|nl|be)(?![a-z0-9-]|\.[a-z0-9])',
    ' ', 'gi'))
$$;

-- Replaces what could identify a player or open an account before error
-- text is stored (AC-DAT-02): uuids with or without hyphens, bytea hex,
-- e-mail addresses, long base64 and base64url runs (secrets and tokens),
-- shorter runs that mix letters and digits (sync codes, references), and
-- IPv4 and IPv6 addresses. Times such as 12:30:45 and snake_case names stay.
create or replace function private.redact(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    p_text,
    '[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}', '<uuid>', 'gi'),
    '\\x[0-9a-f]{8,}', '<bytes>', 'gi'),
    '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', '<email>', 'gi'),
    '[A-Za-z0-9_-]{32,}={0,2}', '<token>', 'g'),
    '[A-Za-z0-9+/]{32,}={0,2}', '<token>', 'g'),
    '(?=[A-Za-z0-9]*[0-9])(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{12,31}', '<code>', 'g'),
    '\m(?:[0-9]{1,3}\.){3}[0-9]{1,3}\M', '<ip>', 'g'),
    '\m[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){3,7}(?![0-9a-f:])', '<ip>', 'gi')
$$;

-- The byte caps of §8.6, checked before anything else is parsed.
create or replace function private.payload_cap(p_kind text default 'default')
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'events' then 65536      -- log_events
    when 'quiz' then 65536        -- a whole quiz
    when 'practice' then 32768    -- log_practice_answers
    when 'report' then 4096       -- submit_report
    when 'room' then 2048         -- room calls
    when 'default' then 8192      -- everything else
  end
$$;

-- True when a value's text is over the cap of its kind. Pass jsonb as
-- p_value::text. Null is never over.
create or replace function private.over_cap(p_value text, p_kind text default 'default')
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cap integer := private.payload_cap(p_kind);
begin
  if v_cap is null then
    raise exception 'over_cap: unknown payload kind %', coalesce(p_kind, 'null');
  end if;
  return coalesce(octet_length(p_value), 0) > v_cap;
end
$$;

-- A known zone name, or null (§8.7). Callers fall back in order:
-- coalesce(private.valid_tz(p_tz), private.valid_tz(v_stored_tz), 'UTC').
create or replace function private.valid_tz(p_tz text)
returns text
language sql
stable
set search_path = ''
as $$
  select z.name from private.time_zones z where z.name = p_tz and char_length(p_tz) <= 64
$$;

-- ---------------------------------------------------------------------------
-- Client addresses and subjects (§8.6)
-- ---------------------------------------------------------------------------

-- One host address from a header hop: brackets and ports removed; masks,
-- zone ids, names and anything malformed give null.
create or replace function private.parse_ip(p_raw text)
returns inet
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_raw, ''));
  v_match text[];
  v_ip inet;
begin
  if v_text = '' or char_length(v_text) > 64 then
    return null;
  end if;
  v_match := regexp_match(v_text, '^\[([0-9a-fA-F:.]+)\](?::[0-9]{1,5})?$');
  if v_match is not null then
    v_text := v_match[1];
  else
    v_match := regexp_match(v_text, '^([0-9]{1,3}(?:\.[0-9]{1,3}){3}):[0-9]{1,5}$');
    if v_match is not null then
      v_text := v_match[1];
    end if;
  end if;
  if v_text !~ '^[0-9a-fA-F:.]+$' then
    return null;
  end if;
  begin
    v_ip := v_text::inet;
  exception
    when others then
      return null;
  end;
  -- A host address carries the full mask of its family.
  if masklen(v_ip) <> (case family(v_ip) when 4 then 32 else 128 end) then
    return null;
  end if;
  return v_ip;
end
$$;

-- The address the limiter keys on, by private.config.client_ip:
-- { "header": "x-forwarded-for", "hop": "first" | "last" | n }, where n
-- counts from the right and 0 is the last hop. A missing or malformed
-- header gives null, and every such request shares one subject.
create or replace function private.client_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rule jsonb := coalesce(private.cfg('client_ip'), '{}'::jsonb);
  v_header text := lower(coalesce(v_rule ->> 'header', 'x-forwarded-for'));
  v_hop jsonb := coalesce(v_rule -> 'hop', '"first"'::jsonb);
  v_headers jsonb;
  v_hops text[];
  v_count integer;
  v_at integer;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      return null;
  end;
  if v_headers is null or jsonb_typeof(v_headers) <> 'object' then
    return null;
  end if;
  v_hops := string_to_array(v_headers ->> v_header, ',');
  v_count := coalesce(cardinality(v_hops), 0);
  if v_count = 0 then
    return null;
  end if;
  if jsonb_typeof(v_hop) = 'number' then
    v_at := v_count - (v_hop #>> '{}')::integer;
  elsif v_hop #>> '{}' = 'last' then
    v_at := v_count;
  else
    v_at := 1;
  end if;
  if v_at < 1 or v_at > v_count then
    return null;
  end if;
  return private.parse_ip(v_hops[v_at]);
end
$$;

-- The limiter's key for an address: IPv4 whole, IPv4-mapped IPv6 as its
-- IPv4 address, other IPv6 as its /64 (PRD §8.4, AC-IDN-07), and 'none'
-- for a missing address.
create or replace function private.ip_prefix(p_ip inet)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ip is null then 'none'
    when family(p_ip) = 4 then host(p_ip)
    when p_ip <<= '::ffff:0.0.0.0/96'::inet
      then host('0.0.0.0'::inet + (p_ip - '::ffff:0.0.0.0'::inet))
    else text(network(set_masklen(p_ip, 64)))
  end
$$;

-- The salt of one UTC day, created on first use (§8.6).
create or replace function private.salt_for(p_day date)
returns bytea
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_salt bytea;
begin
  select s.salt into v_salt from private.ip_salts s where s.day = p_day;
  if v_salt is null then
    insert into private.ip_salts (day, salt)
    values (p_day, extensions.gen_random_bytes(32))
    on conflict (day) do nothing;
    select s.salt into v_salt from private.ip_salts s where s.day = p_day;
  end if;
  return v_salt;
end
$$;

-- sha256(bucket | key, salt of the day the window started): a window keeps
-- one salt from start to end, and no table holds a raw address or id.
create or replace function private.subject(p_bucket text, p_key text, p_window_start timestamptz)
returns bytea
language sql
volatile
set search_path = ''
as $$
  select sha256(
    convert_to(p_bucket || '|' || coalesce(p_key, ''), 'UTF8')
    || private.salt_for((p_window_start at time zone 'UTC')::date))
$$;

-- ---------------------------------------------------------------------------
-- The limiter (§8.6)
-- ---------------------------------------------------------------------------

-- Windows are aligned to the epoch, so every window of a day or less starts
-- and ends inside one UTC day.
create or replace function private.window_start(p_at timestamptz, p_window_s integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select to_timestamp(floor(extract(epoch from p_at) / p_window_s) * p_window_s)
$$;

-- The time left in a window, never below 1 ms.
create or replace function private.retry_after_ms(p_now timestamptz, p_end timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, ceil(extract(epoch from (p_end - p_now)) * 1000))::integer
$$;

-- Counts p_amount against one window and answers whether the total is
-- within p_max. The row keeps counting past the cap, so its refusals are
-- hits - cap, and a refusal reports the time left in the window.
create or replace function private.hit(
  p_bucket text,
  p_key text,
  p_window_s integer,
  p_max integer,
  p_amount integer default 1,
  p_scope text default null)
returns private.limit_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_start timestamptz;
  v_end timestamptz;
  v_hits integer;
begin
  if p_bucket is null or coalesce(p_window_s, 0) < 1 or coalesce(p_max, -1) < 0
     or coalesce(p_amount, 0) < 1 then
    raise exception 'hit: bad arguments for bucket %', coalesce(p_bucket, 'null');
  end if;
  v_start := private.window_start(v_now, p_window_s);
  v_end := v_start + make_interval(secs => p_window_s);
  insert into private.rate_counters as r (bucket, subject, window_start, window_end, hits, cap)
  values (p_bucket, private.subject(p_bucket, p_key, v_start), v_start, v_end, p_amount, p_max)
  on conflict (bucket, subject, window_start) do update
    set hits = r.hits + excluded.hits, cap = excluded.cap
  returning r.hits into v_hits;
  if v_hits <= p_max then
    return row(true, null, p_scope)::private.limit_result;
  end if;
  return row(false, private.retry_after_ms(v_now, v_end), p_scope)::private.limit_result;
end
$$;

-- For failure-only limits that refuse before checking (sync codes, claims,
-- wrong room codes): counts nothing it allows. A refusal adds to the
-- window, so hits - cap counts refusals here too.
create or replace function private.peek(
  p_bucket text,
  p_key text,
  p_window_s integer,
  p_max integer,
  p_amount integer default 1,
  p_scope text default null)
returns private.limit_result
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_start timestamptz;
  v_end timestamptz;
  v_subject bytea;
  v_hits integer;
begin
  if p_bucket is null or coalesce(p_window_s, 0) < 1 or coalesce(p_max, -1) < 0
     or coalesce(p_amount, 0) < 1 then
    raise exception 'peek: bad arguments for bucket %', coalesce(p_bucket, 'null');
  end if;
  v_start := private.window_start(v_now, p_window_s);
  v_end := v_start + make_interval(secs => p_window_s);
  v_subject := private.subject(p_bucket, p_key, v_start);
  select r.hits into v_hits
    from private.rate_counters r
   where r.bucket = p_bucket and r.subject = v_subject and r.window_start = v_start;
  if coalesce(v_hits, 0) + p_amount <= p_max then
    return row(true, null, p_scope)::private.limit_result;
  end if;
  insert into private.rate_counters as r (bucket, subject, window_start, window_end, hits, cap)
  values (p_bucket, v_subject, v_start, v_end, p_amount, p_max)
  on conflict (bucket, subject, window_start) do update
    set hits = r.hits + excluded.hits, cap = excluded.cap;
  return row(false, private.retry_after_ms(v_now, v_end), p_scope)::private.limit_result;
end
$$;

-- Gives back what a hit counted: when a later bucket refuses a request,
-- the earlier ones it passed are released, so a refused request consumes
-- no counter but the one that refused (§8.6).
create or replace function private.unhit(
  p_bucket text,
  p_key text,
  p_window_s integer,
  p_amount integer default 1)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_start timestamptz := private.window_start(private.now(), p_window_s);
  v_subject bytea := private.subject(p_bucket, p_key, v_start);
begin
  update private.rate_counters r
     set hits = greatest(r.hits - p_amount, 0)
   where r.bucket = p_bucket and r.subject = v_subject and r.window_start = v_start;
end
$$;

-- A bucket's { cap, window_s } from private.config.limits. A bucket that is
-- not configured is a bug and raises.
create or replace function private.limit_spec(p_bucket text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_spec jsonb := private.cfg('limits') -> p_bucket;
begin
  if v_spec is null
     or jsonb_typeof(v_spec -> 'cap') is distinct from 'number'
     or jsonb_typeof(v_spec -> 'window_s') is distinct from 'number' then
    raise exception 'limits: no cap and window for bucket %', coalesce(p_bucket, 'null');
  end if;
  return v_spec;
end
$$;

create or replace function private.limit(p_bucket text)
returns integer
language sql
stable
set search_path = ''
as $$
  select (private.limit_spec(p_bucket) ->> 'cap')::integer
$$;

create or replace function private.limit_window(p_bucket text)
returns integer
language sql
stable
set search_path = ''
as $$
  select (private.limit_spec(p_bucket) ->> 'window_s')::integer
$$;

-- The subject builders. Each comes in two forms: with the window and cap
-- given (hit_ip(bucket, ip, window_s, max), as the pre-request hook calls
-- it) and with both read from private.config.limits (hit_ip(bucket, ip)).
-- p_amount counts bytes for the byte caps; it is 1 for everything else.

create or replace function private.hit_ip(
  p_bucket text, p_ip inet, p_window_s integer, p_max integer, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.hit(p_bucket, 'ip:' || private.ip_prefix(p_ip), p_window_s, p_max, p_amount, 'ip')
$$;

create or replace function private.hit_ip(p_bucket text, p_ip inet, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.hit_ip(p_bucket, p_ip, private.limit_window(p_bucket), private.limit(p_bucket), p_amount)
$$;

create or replace function private.hit_player(
  p_bucket text, p_player uuid, p_window_s integer, p_max integer, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.hit(p_bucket, 'player:' || p_player::text, p_window_s, p_max, p_amount, 'player')
$$;

create or replace function private.hit_player(p_bucket text, p_player uuid, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.hit_player(p_bucket, p_player, private.limit_window(p_bucket), private.limit(p_bucket), p_amount)
$$;

create or replace function private.hit_global(
  p_bucket text, p_window_s integer, p_max integer, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.hit(p_bucket, 'project', p_window_s, p_max, p_amount, 'project')
$$;

create or replace function private.hit_global(p_bucket text, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.hit_global(p_bucket, private.limit_window(p_bucket), private.limit(p_bucket), p_amount)
$$;

create or replace function private.peek_ip(
  p_bucket text, p_ip inet, p_window_s integer, p_max integer, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.peek(p_bucket, 'ip:' || private.ip_prefix(p_ip), p_window_s, p_max, p_amount, 'ip')
$$;

create or replace function private.peek_ip(p_bucket text, p_ip inet, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.peek_ip(p_bucket, p_ip, private.limit_window(p_bucket), private.limit(p_bucket), p_amount)
$$;

create or replace function private.peek_player(
  p_bucket text, p_player uuid, p_window_s integer, p_max integer, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.peek(p_bucket, 'player:' || p_player::text, p_window_s, p_max, p_amount, 'player')
$$;

create or replace function private.peek_player(p_bucket text, p_player uuid, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.peek_player(p_bucket, p_player, private.limit_window(p_bucket), private.limit(p_bucket), p_amount)
$$;

create or replace function private.peek_global(
  p_bucket text, p_window_s integer, p_max integer, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.peek(p_bucket, 'project', p_window_s, p_max, p_amount, 'project')
$$;

create or replace function private.peek_global(p_bucket text, p_amount integer default 1)
returns private.limit_result
language sql
volatile
set search_path = ''
as $$
  select private.peek_global(p_bucket, private.limit_window(p_bucket), private.limit(p_bucket), p_amount)
$$;

create or replace function private.unhit_ip(p_bucket text, p_ip inet, p_amount integer default 1)
returns void
language sql
volatile
set search_path = ''
as $$
  select private.unhit(p_bucket, 'ip:' || private.ip_prefix(p_ip), private.limit_window(p_bucket), p_amount)
$$;

create or replace function private.unhit_player(p_bucket text, p_player uuid, p_amount integer default 1)
returns void
language sql
volatile
set search_path = ''
as $$
  select private.unhit(p_bucket, 'player:' || p_player::text, private.limit_window(p_bucket), p_amount)
$$;

create or replace function private.unhit_global(p_bucket text, p_amount integer default 1)
returns void
language sql
volatile
set search_path = ''
as $$
  select private.unhit(p_bucket, 'project', private.limit_window(p_bucket), p_amount)
$$;

-- The refusal envelope for a limit_result that refused.
create or replace function private.rate_limited(p_limit private.limit_result)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.err(
    'rate_limited',
    p_retry_after_ms => (p_limit).retry_after_ms,
    p_limit_scope => (p_limit).scope)
$$;

-- ---------------------------------------------------------------------------
-- Write keys (§8.6)
-- ---------------------------------------------------------------------------

-- Call after validation, just before the first write. Null means "go on:
-- the key is yours". Otherwise it returns the envelope to answer with: the
-- first call's data for a repeat by the same function and player, or
-- conflict for the same key from another function or player. A concurrent
-- first call with the same key waits on the key's row, then sees the
-- winner's result. A key whose call never finished is taken over.
create or replace function private.write_key_claim(p_client_id uuid, p_fn text, p_player uuid default null)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_key private.write_keys;
begin
  if p_client_id is null or p_fn is null then
    return private.err('invalid_input');
  end if;
  insert into private.write_keys (client_id, fn, player_id, result)
  values (p_client_id, p_fn, p_player, 'null'::jsonb)
  on conflict (client_id) do nothing;
  if found then
    return null;
  end if;
  select k.* into v_key from private.write_keys k where k.client_id = p_client_id for update;
  if v_key.fn is distinct from p_fn or v_key.player_id is distinct from p_player then
    return private.err('conflict');
  end if;
  if v_key.result = 'null'::jsonb then
    return null;
  end if;
  return private.ok(v_key.result);
end
$$;

-- Stores the data a claimed key's call created and answers with it.
create or replace function private.write_key_finish(p_client_id uuid, p_data jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'write_key_finish: the data of a created record is an object';
  end if;
  update private.write_keys k set result = p_data where k.client_id = p_client_id;
  if not found then
    raise exception 'write_key_finish: no claimed key';
  end if;
  return private.ok(p_data);
end
$$;

-- ---------------------------------------------------------------------------
-- Codes and tokens (§2.4)
-- ---------------------------------------------------------------------------

-- Crockford base32 of the bytes, most significant bit first: 5 bytes give
-- 8 characters, 10 bytes 16.
create or replace function private.crockford(p_bytes bytea)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_out text := '';
  v_buffer integer := 0;
  v_bits integer := 0;
  v_index integer;
begin
  if p_bytes is null then
    return null;
  end if;
  for v_index in 0 .. length(p_bytes) - 1 loop
    v_buffer := (v_buffer << 8) | get_byte(p_bytes, v_index);
    v_bits := v_bits + 8;
    while v_bits >= 5 loop
      v_bits := v_bits - 5;
      v_out := v_out || substr(c_alphabet, ((v_buffer >> v_bits) & 31) + 1, 1);
    end loop;
    v_buffer := v_buffer & ((1 << v_bits) - 1);
  end loop;
  if v_bits > 0 then
    v_out := v_out || substr(c_alphabet, ((v_buffer << (5 - v_bits)) & 31) + 1, 1);
  end if;
  return v_out;
end
$$;

-- Typed Crockford input, the way the engine's normalizeCrockford reads it:
-- upper case, spaces and hyphens gone, I and L as 1, O as 0.
create or replace function private.crockford_normalize(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    regexp_replace(upper(p_text), '[\s\u2010-\u2015\u2212-]+', '', 'g'),
    'ILO', '110')
$$;

create or replace function private.random_code(p_bytes integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select private.crockford(extensions.gen_random_bytes(p_bytes))
$$;

-- Unpadded base64url of random bytes: 32 bytes give the 43 characters of a
-- token.
create or replace function private.random_token(p_bytes integer default 32)
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
    rtrim(replace(encode(extensions.gen_random_bytes(p_bytes), 'base64'), E'\n', ''), '='),
    '+/', '-_')
$$;

-- ---------------------------------------------------------------------------
-- Unexpected exceptions (§7.3 internal, §8.3 rpc_errors)
-- ---------------------------------------------------------------------------

-- Stores a redacted error and returns its reference: 8 Crockford characters.
create or replace function private.log_error(
  p_fn text,
  p_sqlstate text,
  p_detail text,
  p_room uuid default null,
  p_question smallint default null)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ref text := private.random_code(5);
begin
  insert into private.rpc_errors (fn, sqlstate, ref, room_id, question_index, detail)
  values (
    left(coalesce(nullif(p_fn, ''), 'unknown'), 64),
    left(coalesce(nullif(p_sqlstate, ''), 'XX000'), 5),
    v_ref,
    p_room,
    p_question,
    left(private.redact(p_detail), 2000));
  return v_ref;
end
$$;

-- The answer to an unexpected exception. An RPC body ends with
--   exception when others then
--     return private.fail_internal('<rpc name>', sqlstate, sqlerrm);
-- so its work rolls back to the block while the error row commits.
create or replace function private.fail_internal(
  p_fn text,
  p_sqlstate text,
  p_detail text,
  p_room uuid default null,
  p_question smallint default null)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select private.err('internal', p_ref => private.log_error(p_fn, p_sqlstate, p_detail, p_room, p_question))
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (§8.15). SQL-8 schedules them; until then the orchestrator
-- runs select private.hourly() by hand. Every hook returns void and belongs
-- to one ticket, which replaces only its own body with create or replace.
-- ---------------------------------------------------------------------------

-- Runs one step in its own subtransaction, so a failing step rolls back
-- alone, leaves an owner alert and lets the job's other steps run.
create or replace function private.run_job_step(p_job text, p_step text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_step !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'run_job_step: % is not a step name', coalesce(p_step, 'null');
  end if;
  begin
    execute format('select private.%I()', p_step);
    return true;
  exception
    when others then
      insert into private.alerts (kind, detail)
      values ('job_step_failed', jsonb_build_object(
        'job', p_job, 'step', p_step, 'sqlstate', sqlstate, 'message', private.redact(sqlerrm)));
      return false;
  end;
end
$$;

-- Adds each ended window's refusals (hits - cap) and the pre-request
-- hook's refusals (the growth of its sequence) to daily_aggregates, as
-- metric rate_limited with dims bucket=<name>, each exactly once. Tests
-- pass their own sequence: nextval outlives a rollback, so advancing the
-- real one would count refusals that never happened.
create or replace function private.fold_refusals(
  p_now timestamptz,
  p_hook_sequence regclass default 'private.refused_general_ip_5m')
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_last bigint := coalesce(pg_sequence_last_value(p_hook_sequence), 0);
  v_seen bigint;
begin
  with folded as (
    update private.rate_counters r
       set folded = true
     where not r.folded and r.window_end <= p_now
    returning r.bucket, r.window_start, greatest(r.hits - r.cap, 0) as refused
  ), per_day as (
    select (f.window_start at time zone 'UTC')::date as day,
           'bucket=' || f.bucket as dims,
           sum(f.refused)::bigint as value
      from folded f
     where f.refused > 0
     group by 1, 2
  )
  insert into private.daily_aggregates as a (day, metric, dims, value)
  select d.day, 'rate_limited', d.dims, d.value from per_day d
  on conflict (day, metric, dims) do update set value = a.value + excluded.value;

  v_seen := coalesce((private.cfg('hook_refusals_seen') #>> '{}')::bigint, 0);
  if v_last > v_seen then
    insert into private.daily_aggregates as a (day, metric, dims, value)
    values ((p_now at time zone 'UTC')::date, 'rate_limited', 'bucket=general_ip_5m', v_last - v_seen)
    on conflict (day, metric, dims) do update set value = a.value + excluded.value;
  end if;
  insert into private.config as c (key, value)
  values ('hook_refusals_seen', to_jsonb(v_last))
  on conflict (key) do update set value = excluded.value, updated_at = private.now();
end
$$;

-- SQL-1's hourly step: refusals folded first, then salts for days before
-- yesterday, counters older than 2 days and write keys older than 48 hours
-- pruned, and cron.job_run_details and heartbeats (once SQL-8 creates them)
-- kept to 7 days.
create or replace function private.hourly_platform()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_today date := (v_now at time zone 'UTC')::date;
begin
  perform private.fold_refusals(v_now);
  delete from private.ip_salts s where s.day < v_today - 1;
  delete from private.rate_counters r where r.window_start < v_now - interval '2 days';
  delete from private.write_keys k where k.created_at < v_now - interval '48 hours';
  if to_regclass('private.heartbeats') is not null then
    delete from private.heartbeats h where h.ts < v_now - interval '7 days';
  end if;
  if to_regclass('cron.job_run_details') is not null then
    begin
      delete from cron.job_run_details d where d.end_time < v_now - interval '7 days';
    exception
      when insufficient_privilege then
        -- SQL-8's grant on cron's tables has not been made yet.
        null;
    end;
  end if;
end
$$;

-- SQL-1's nightly step: time_zones follows pg_timezone_names (§8.7). A
-- catalog that comes back nearly empty is ignored rather than copied.
create or replace function private.nightly_platform()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if (select count(*) from pg_catalog.pg_timezone_names) < 100 then
    raise exception 'nightly_platform: pg_timezone_names looks broken';
  end if;
  insert into private.time_zones (name)
  select z.name from pg_catalog.pg_timezone_names z
  on conflict (name) do nothing;
  delete from private.time_zones t
   where not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = t.name);
end
$$;

-- The hooks other tickets fill (§8.15). Each is a no-op until its owner
-- replaces it.
create or replace function private.hourly_attempts() returns void        -- SQL-4
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.hourly_results() returns void         -- SQL-7
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.hourly_ops() returns void             -- SQL-8
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_players() returns void        -- SQL-2
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_attempts() returns void       -- SQL-4
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_results() returns void        -- SQL-7
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_reports() returns void        -- SQL-9
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_analytics() returns void      -- SQL-10
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_rooms() returns void          -- SQL-14
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.nightly_quizzes() returns void        -- SQL-15
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.weekly_calibration() returns void     -- SQL-9
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.rooms_sweep_lobby() returns void      -- SQL-13
language plpgsql volatile set search_path = '' as $$ begin null; end $$;
create or replace function private.rooms_sweep_game() returns void       -- SQL-14
language plpgsql volatile set search_path = '' as $$ begin null; end $$;

-- The job bodies pg_cron will call (§8.15). They never change: each
-- ticket fills its own hook instead.
create or replace function private.hourly()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.run_job_step('hourly', 'hourly_platform');
  perform private.run_job_step('hourly', 'hourly_attempts');
  perform private.run_job_step('hourly', 'hourly_results');
  perform private.run_job_step('hourly', 'hourly_ops');
end
$$;

create or replace function private.nightly()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.run_job_step('nightly', 'nightly_platform');
  perform private.run_job_step('nightly', 'nightly_players');
  perform private.run_job_step('nightly', 'nightly_attempts');
  perform private.run_job_step('nightly', 'nightly_results');
  perform private.run_job_step('nightly', 'nightly_reports');
  perform private.run_job_step('nightly', 'nightly_analytics');
  perform private.run_job_step('nightly', 'nightly_rooms');
  perform private.run_job_step('nightly', 'nightly_quizzes');
end
$$;

create or replace function private.weekly()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.run_job_step('weekly', 'weekly_calibration');
end
$$;

create or replace function private.rooms_sweep()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.run_job_step('rooms_sweep', 'rooms_sweep_lobby');
  perform private.run_job_step('rooms_sweep', 'rooms_sweep_game');
end
$$;

-- SQL-3 replaces this body with the publisher (§8.7).
create or replace function private.publish()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  null;
end
$$;

-- ---------------------------------------------------------------------------
-- SQL test helpers (§8.17). They only set transaction-local settings or
-- compute values, so a test's rollback leaves nothing behind.
-- ---------------------------------------------------------------------------

-- Moves private.now() for the rest of the transaction. MCP sessions run as
-- postgres, the only session user the clock listens to.
create or replace function private.t_now(p_at timestamptz)
returns timestamptz
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform set_config('qz.now', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  return private.now();
end
$$;

-- Simulates what PostgREST sets for a request: the headers (with
-- X-Forwarded-For when p_ip is given), the method and the path.
create or replace function private.t_request(
  p_ip text default null,
  p_headers jsonb default '{}'::jsonb,
  p_method text default 'POST',
  p_path text default '/rpc/t_request')
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(p_headers, '{}'::jsonb)
    || case when p_ip is null then '{}'::jsonb else jsonb_build_object('x-forwarded-for', p_ip) end;
begin
  perform set_config('request.headers', v_headers::text, true);
  perform set_config('request.method', coalesce(p_method, ''), true);
  perform set_config('request.path', coalesce(p_path, ''), true);
end
$$;

-- A deterministic player id and secret for a seed. Ordinary ids by default,
-- since production limits apply to them; p_test gives a reserved
-- e2e2e2e2- test id (§8.17).
create or replace function private.t_player(p_seed text, p_test boolean default false)
returns table (player_id uuid, secret text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hash bytea := sha256(convert_to('qz-test-player|' || p_seed, 'UTF8'));
  v_hex text := encode(v_hash, 'hex');
begin
  player_id := (
    case when p_test then 'e2e2e2e2' else substr(v_hex, 1, 8) end
    || '-' || substr(v_hex, 9, 4)
    || '-4' || substr(v_hex, 14, 3)
    || '-' || substr('89ab', (get_byte(v_hash, 8) & 3) + 1, 1) || substr(v_hex, 18, 3)
    || '-' || substr(v_hex, 21, 12))::uuid;
  secret := translate(
    rtrim(encode(sha256(convert_to('qz-test-secret|' || p_seed, 'UTF8')), 'base64'), '='),
    '+/', '-_');
  return next;
end
$$;
