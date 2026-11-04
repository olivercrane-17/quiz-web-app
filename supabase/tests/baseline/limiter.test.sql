-- The limiter (ARCHITECTURE §8.6; SQL-1): aligned windows, retry-after and
-- scope, counting past the cap, refusals folded into daily_aggregates once,
-- IPv6 /64 subjects, the salt chosen by window start, failure-only limits,
-- peek and unhit, and every configured bucket. Production limits are tested
-- with ordinary keys inside the rolled-back transaction (§8.17). Each block
-- writes the caps it relies on and folds with its own sequence, so the
-- file passes on a live database whose owner tuned config.limits or whose
-- pre-request hook has refusals still to fold.
begin;

-- One window: allowed up to the cap, then refused with the time left in
-- the window and the scope that refused; the next window starts fresh.
do $$
declare
  v private.limit_result;
  v_env jsonb;
  v_row record;
begin
  perform private.t_now('2026-11-01T10:02:30Z');
  v := private.hit_ip('t_win_5m', '198.51.100.7', 300, 2);
  assert v.allowed and v.retry_after_ms is null and v.scope = 'ip', format('first hit: %s', v);
  v := private.hit_ip('t_win_5m', '198.51.100.7', 300, 2);
  assert v.allowed, 'second hit is at the cap';
  v := private.hit_ip('t_win_5m', '198.51.100.7', 300, 2);
  assert not v.allowed and v.retry_after_ms = 150000 and v.scope = 'ip', format('third hit: %s', v);
  v_env := private.rate_limited(v);
  assert v_env ->> 'code' = 'rate_limited' and (v_env ->> 'retry_after_ms')::integer = 150000
     and v_env ->> 'limit_scope' = 'ip', format('envelope: %s', v_env);

  perform private.t_now('2026-11-01T10:04:59.5Z');
  v := private.hit_ip('t_win_5m', '198.51.100.7', 300, 2);
  assert not v.allowed and v.retry_after_ms = 500, format('half a second before the end: %s', v);

  select r.hits, r.cap, r.window_start, r.window_end into v_row
    from private.rate_counters r where r.bucket = 't_win_5m';
  assert v_row.hits = 4 and v_row.cap = 2, format('the row keeps counting past the cap: %s', v_row);
  assert v_row.window_start = '2026-11-01T10:00:00Z' and v_row.window_end = '2026-11-01T10:05:00Z',
    format('the window is aligned: %s', v_row);
  assert (select count(*) from private.rate_counters r where r.bucket = 't_win_5m') = 1, 'one row per window';

  perform private.t_now('2026-11-01T10:05:00Z');
  v := private.hit_ip('t_win_5m', '198.51.100.7', 300, 2);
  assert v.allowed, 'the next window starts fresh';

  -- Another address is another subject; no raw address is stored.
  v := private.hit_ip('t_win_5m', '198.51.100.8', 300, 2);
  assert v.allowed, 'a second address has its own count';
  assert not exists (
    select 1 from private.rate_counters r
     where position(convert_to('198.51.100', 'UTF8') in r.subject) > 0),
    'a subject holds the raw address';
  assert (select bool_and(octet_length(r.subject) = 32) from private.rate_counters r), 'subjects are sha256 digests';
end
$$;
select 'PASS SQL-1 limiter window, retry-after and scope';

-- Scopes and the config-driven forms: with the §8.6 numbers written into
-- config.limits, the 21st new identity inside a minute from one address is
-- refused with scope ip, a player's limit says player, a project-wide
-- ceiling says project, and a byte cap counts amounts (§8.5, §8.6).
do $$
declare
  v private.limit_result;
  v_player uuid := (select t.player_id from private.t_player('limiter-scope') t);
  v_index integer;
begin
  perform private.t_now('2026-11-01T12:00:10Z');
  update private.config
     set value = value || '{"identity_1m": {"cap": 20, "window_s": 60},
                            "ugc_bytes_player_1d": {"cap": 524288, "window_s": 86400}}'
   where key = 'limits';
  assert private.limit('identity_1m') = 20 and private.limit_window('identity_1m') = 60,
    'limit() and limit_window() read config.limits';
  for v_index in 1 .. 20 loop
    v := private.hit_ip('identity_1m', '203.0.113.50');
    assert v.allowed, format('registration %s was refused', v_index);
  end loop;
  v := private.hit_ip('identity_1m', '203.0.113.50');
  assert not v.allowed and v.scope = 'ip' and v.retry_after_ms = 50000, format('the 21st: %s', v);

  v := private.hit_player('t_player_1h', v_player, 3600, 0);
  assert not v.allowed and v.scope = 'player', format('player scope: %s', v);

  v := private.hit_global('t_project_1h', 3600, 1);
  assert v.allowed, 'first project-wide hit';
  v := private.hit_global('t_project_1h', 3600, 1);
  assert not v.allowed and v.scope = 'project' and v.retry_after_ms = 3590000, format('project scope: %s', v);

  -- Byte caps count amounts.
  v := private.hit_player('ugc_bytes_player_1d', v_player, 524288);
  assert v.allowed, '512 kB fits the daily byte cap';
  v := private.hit_player('ugc_bytes_player_1d', v_player, 1);
  assert not v.allowed and v.scope = 'player', 'one byte more does not';

  -- A tuned cap applies from the next call.
  update private.config
     set value = value || '{"identity_1m": {"cap": 25, "window_s": 60}}'
   where key = 'limits';
  v := private.hit_ip('identity_1m', '203.0.113.50');
  assert v.allowed, 'a raised cap was not read';

  begin
    perform private.limit('t_not_configured');
    raise exception 'limit() accepted an unknown bucket';
  exception
    when raise_exception then
      if sqlerrm not like 'limits: no cap and window for bucket%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-1 limiter scopes ip, player and project, from config.limits';

-- Every configured bucket is well formed, and a refusal from each carries a
-- retry-after inside its window (table-driven, §8.6).
do $$
declare
  v_bucket record;
  v private.limit_result;
  v_env jsonb;
begin
  perform private.t_now('2026-11-01T13:21:07Z');
  for v_bucket in
    select l.key as name, (l.value ->> 'cap')::integer as cap, (l.value ->> 'window_s')::integer as window_s
      from jsonb_each(private.cfg('limits')) l
  loop
    assert v_bucket.cap > 0, format('%s has no positive cap', v_bucket.name);
    assert v_bucket.window_s in (60, 300, 900, 3600, 86400), format('%s has an unusual window', v_bucket.name);
    assert v_bucket.name ~ '^[a-z][a-z0-9_]*_(1m|5m|15m|1h|1d)$', format('%s does not name its window', v_bucket.name);
    assert right(v_bucket.name, 3) = (case v_bucket.window_s
      when 60 then '_1m' when 300 then '_5m' when 900 then '15m' when 3600 then '_1h' else '_1d' end),
      format('%s says another window than %s s', v_bucket.name, v_bucket.window_s);
    v := private.hit(v_bucket.name, 'table-driven', v_bucket.window_s, 0, 1, 'project');
    assert not v.allowed, format('%s did not refuse over its cap', v_bucket.name);
    assert v.retry_after_ms between 1 and v_bucket.window_s * 1000,
      format('%s refused with retry_after_ms %s', v_bucket.name, v.retry_after_ms);
    v_env := private.rate_limited(v);
    assert (v_env ->> 'retry_after_ms')::integer = v.retry_after_ms and v_env ->> 'limit_scope' = 'project',
      format('%s envelope %s', v_bucket.name, v_env);
  end loop;
  assert (select count(*) from jsonb_object_keys(private.cfg('limits'))) >= 31, 'the §8.6 buckets are configured';
  assert private.cfg('limits') ? 'rpc_errors_1h', 'rpc_errors_1h is configured';
end
$$;
select 'PASS SQL-1 every configured bucket refuses with a retry-after inside its window';

-- Refusals are hits - cap per ended window, folded into daily_aggregates
-- exactly once, together with the pre-request hook's sequence. Every fold
-- here reads the test's own sequence: the real one may hold refusals that
-- no job has folded yet.
do $$
declare
  v_count bigint;
begin
  create sequence private.t_hook_refusals;
  insert into private.config (key, value) values ('hook_refusals_seen', '0')
  on conflict (key) do update set value = '0';

  perform private.t_now('2026-11-01T10:02:30Z');
  perform private.hit_ip('t_fold_5m', '198.51.100.9', 300, 1);
  perform private.hit_ip('t_fold_5m', '198.51.100.9', 300, 1);
  perform private.hit_ip('t_fold_5m', '198.51.100.9', 300, 1);
  perform private.hit_ip('t_fold_5m', '198.51.100.10', 300, 1);

  perform private.fold_refusals('2026-11-01T10:04:00Z', 'private.t_hook_refusals');
  assert not exists (select 1 from private.daily_aggregates a where a.dims = 'bucket=t_fold_5m'),
    'a window still open was folded';

  perform nextval('private.t_hook_refusals');
  perform nextval('private.t_hook_refusals');

  perform private.fold_refusals('2026-11-01T10:05:00Z', 'private.t_hook_refusals');
  select a.value into v_count from private.daily_aggregates a
   where a.day = '2026-11-01' and a.metric = 'rate_limited' and a.dims = 'bucket=t_fold_5m';
  assert v_count = 2, format('t_fold_5m refusals: %s', v_count);
  select a.value into v_count from private.daily_aggregates a
   where a.day = '2026-11-01' and a.metric = 'rate_limited' and a.dims = 'bucket=general_ip_5m';
  assert v_count = 2, format('hook refusals: %s', v_count);
  assert (select bool_and(r.folded) from private.rate_counters r where r.bucket = 't_fold_5m'), 'ended windows are marked folded';

  perform private.fold_refusals('2026-11-01T11:00:00Z', 'private.t_hook_refusals');
  assert (select a.value from private.daily_aggregates a
           where a.day = '2026-11-01' and a.dims = 'bucket=t_fold_5m') = 2, 'a window was folded twice';
  assert (select a.value from private.daily_aggregates a
           where a.day = '2026-11-01' and a.dims = 'bucket=general_ip_5m') = 2, 'hook refusals were counted twice';

  perform nextval('private.t_hook_refusals');
  perform private.fold_refusals('2026-11-01T12:00:00Z', 'private.t_hook_refusals');
  assert (select a.value from private.daily_aggregates a
           where a.day = '2026-11-01' and a.dims = 'bucket=general_ip_5m') = 3, 'a new hook refusal was missed';
end
$$;
select 'PASS SQL-1 refusals are counted by bucket and folded into daily_aggregates once';

-- A day salt belongs to the window's start: a two-day window that starts on
-- 1 November keeps that day's salt on 2 November.
do $$
declare
  v private.limit_result;
begin
  perform private.t_now('2026-11-01T12:00:00Z');
  v := private.hit_ip('t_salt_2d', '198.51.100.11', 172800, 5);
  perform private.t_now('2026-11-02T12:00:00Z');
  v := private.hit_ip('t_salt_2d', '198.51.100.11', 172800, 5);
  assert (select r.hits from private.rate_counters r where r.bucket = 't_salt_2d') = 2,
    'the window changed subject when the day did';
  assert not exists (select 1 from private.ip_salts s where s.day = '2026-11-02'),
    'a hit on 2 November used that day''s salt';
  perform private.t_now('2026-11-03T00:00:00Z');
  v := private.hit_ip('t_salt_2d', '198.51.100.11', 172800, 5);
  assert v.allowed and (select count(*) from private.rate_counters r where r.bucket = 't_salt_2d') = 2,
    'the next window has its own row';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-03'), 'the next window uses its own day''s salt';
end
$$;
select 'PASS SQL-1 the salt is chosen by the day the window started';

-- Failure-only limits (sync codes, claims, wrong room codes) count the
-- attempt before the check and give it back when the check passes
-- (supabase/README.md §3), so attempts in flight can never pass the cap
-- together. peek counts nothing it allows, creates and locks the counter
-- row it read, and counts a refusal; unhit gives a hit back, so a request
-- refused by a later bucket consumes nothing else.
do $$
declare
  v private.limit_result;
  v_player uuid := (select t.player_id from private.t_player('limiter-peek') t);
begin
  perform private.t_now('2026-11-01T14:00:00Z');
  update private.config
     set value = value || '{"t_fail_15m": {"cap": 1, "window_s": 900},
                            "sync_fail_15m": {"cap": 5, "window_s": 900},
                            "general_player_5m": {"cap": 300, "window_s": 300}}'
   where key = 'limits';

  v := private.hit_ip('t_fail_15m', '198.51.100.14');
  assert v.allowed, 'the first attempt is counted and allowed';
  perform private.unhit_ip('t_fail_15m', '198.51.100.14');
  assert (select r.hits from private.rate_counters r where r.bucket = 't_fail_15m') = 0,
    'a passing check gave its attempt back';
  v := private.hit_ip('t_fail_15m', '198.51.100.14');
  assert v.allowed, 'the second attempt fails its check and keeps its count';
  v := private.hit_ip('t_fail_15m', '198.51.100.14');
  assert not v.allowed and v.scope = 'ip' and v.retry_after_ms = 900000, format('the third: %s', v);

  v := private.peek_ip('t_peek_15m', '198.51.100.12', 900, 1);
  assert v.allowed, 'peek under the cap';
  assert (select r.hits from private.rate_counters r where r.bucket = 't_peek_15m') = 0,
    'an allowed peek counted, or did not create the row it locks';
  perform private.hit_ip('t_peek_15m', '198.51.100.12', 900, 1);
  v := private.peek_ip('t_peek_15m', '198.51.100.12', 900, 1);
  assert not v.allowed and v.scope = 'ip' and v.retry_after_ms = 900000, format('peek at the cap: %s', v);
  assert (select r.hits from private.rate_counters r where r.bucket = 't_peek_15m') = 2, 'a refused peek is counted';

  assert (private.peek_ip('sync_fail_15m', '198.51.100.13')).allowed, 'config-driven peek';

  -- The first bucket passes, the second refuses: the first gives its hit back.
  perform private.hit_player('t_first_1h', v_player, 3600, 10);
  v := private.hit_player('t_second_1h', v_player, 3600, 0);
  assert not v.allowed, 'the second bucket refuses';
  perform private.unhit('t_first_1h', 'player:' || v_player::text, 3600);
  assert (select r.hits from private.rate_counters r where r.bucket = 't_first_1h') = 0, 'unhit gave the hit back';
  perform private.unhit('t_first_1h', 'player:' || v_player::text, 3600);
  assert (select r.hits from private.rate_counters r where r.bucket = 't_first_1h') = 0, 'unhit never goes below zero';

  perform private.hit_player('general_player_5m', v_player);
  perform private.unhit_player('general_player_5m', v_player);
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'general_player_5m' and r.window_start = '2026-11-01T14:00:00Z') = 0, 'unhit_player';
end
$$;
select 'PASS SQL-1 failure-only limits count first and give back, peek locks, unhit releases';

rollback;
