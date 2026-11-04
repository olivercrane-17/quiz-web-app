-- Sync codes (ARCHITECTURE §8.4, §9.2; SQL-2): a code is 16 Crockford
-- characters kept only as a hash, a new code ends the old one, typed forms
-- redeem the same code, failed attempts are counted before the code is
-- looked at, a redemption adds a device credential, and the 11th device
-- overwrites the least recently used one.
begin;

create or replace function private.t_sync_limits()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  update private.config set value = '0' where key = 'egress_sample_rate';
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first", "verified": true}')
  on conflict (key) do update set value = excluded.value;
  update private.config
     set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                            "identity_1m": {"cap": 20, "window_s": 60},
                            "general_player_5m": {"cap": 300, "window_s": 300},
                            "sync_create_1d": {"cap": 5, "window_s": 86400},
                            "sync_fail_15m": {"cap": 5, "window_s": 900},
                            "sync_1d": {"cap": 20, "window_s": 86400},
                            "sync_fail_all_1h": {"cap": 1000, "window_s": 3600}}'
   where key = 'limits';
end
$$;

-- A new code is 16 Crockford characters whose sha256 alone is stored, and
-- after "Make a new code" the old one fails (AC-SYN-03).
do $$
declare
  v_id uuid;
  v_secret text;
  v_first jsonb;
  v_second jsonb;
  v_reply jsonb;
begin
  perform private.t_sync_limits();
  perform private.t_now('2026-10-28T08:00:00Z');
  perform private.t_request('198.51.100.140');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('sync-new-code') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';

  v_first := public.create_sync_code(v_id, v_secret);
  assert v_first ->> 'ok' = 'true', format('create_sync_code: %s', v_first);
  assert v_first -> 'data' ->> 'code' ~ '^[0-9A-HJKMNP-TV-Z]{16}$', format('code: %s', v_first);
  assert (v_first -> 'data' ->> 'created_at')::bigint = private.epoch_ms('2026-10-28T08:00:00Z'), 'created_at';
  assert (select s.code_hash from private.sync_codes s where s.player_id = v_id)
         = sha256(convert_to(v_first -> 'data' ->> 'code', 'UTF8')), 'the stored hash is not sha256(code)';

  perform private.t_now('2026-10-28T08:05:00Z');
  v_second := public.create_sync_code(v_id, v_secret);
  assert v_second ->> 'ok' = 'true' and v_second -> 'data' ->> 'code' <> v_first -> 'data' ->> 'code',
    format('a second code: %s', v_second);
  assert (select count(*) from private.sync_codes s where s.player_id = v_id) = 1, 'a player holds two codes';

  v_reply := public.redeem_sync_code(v_first -> 'data' ->> 'code', (select t.secret from private.t_player('sync-new-device-1') t));
  assert v_reply ->> 'code' = 'not_found', format('the old code: %s', v_reply);
  v_reply := public.redeem_sync_code(v_second -> 'data' ->> 'code', (select t.secret from private.t_player('sync-new-device-2') t));
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'player_id' = v_id::text, format('the new code: %s', v_reply);
end
$$;
select 'PASS AC-SYN-03 after Make a new code, the old code fails';

-- What a redemption answers and adds: the player id, its profile, streak
-- and last Daily, and a sync credential for the new secret, which then
-- authenticates; the same secret again only touches it. Typed forms
-- (lower case, groups, I and L for 1, O for 0) redeem the same code.
do $$
declare
  v_id uuid;
  v_secret text;
  v_code text;
  v_variant text;
  v_device text;
  v_reply jsonb;
  v_index integer := 0;
begin
  perform private.t_sync_limits();
  perform private.t_now('2026-10-28T09:00:00Z');
  perform private.t_request('198.51.100.141');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('sync-redeem') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  -- A code that holds the digits 0 and 1 in known places, set as the
  -- stored hash, so every typed variant has something to map.
  v_code := '01AB2C3D4E5F6G7H';
  update private.sync_codes set code_hash = sha256(convert_to(v_code, 'UTF8')) where player_id = v_id;
  if not found then
    insert into private.sync_codes (player_id, code_hash) values (v_id, sha256(convert_to(v_code, 'UTF8')));
  end if;

  v_device := (select t.secret from private.t_player('sync-redeem-device') t);
  v_reply := public.redeem_sync_code(v_code, v_device);
  assert v_reply ->> 'ok' = 'true', format('redeem: %s', v_reply);
  assert v_reply -> 'data' ->> 'player_id' = v_id::text, 'player_id';
  assert v_reply -> 'data' -> 'profile' = private.profile_json(v_id), format('profile: %s', v_reply);
  assert jsonb_typeof(v_reply -> 'data' -> 'streak' -> 'current') = 'number'
     and jsonb_typeof(v_reply -> 'data' -> 'streak' -> 'best') = 'number', format('streak: %s', v_reply);
  assert v_reply -> 'data' ? 'last_daily', format('last_daily: %s', v_reply);
  assert exists (select 1 from private.credentials c
                  where c.player_id = v_id and c.secret_hash = sha256(convert_to(v_device, 'UTF8')) and c.source = 'sync'),
    'no sync credential for the new secret';
  assert public.get_profile(v_id, v_device) ->> 'ok' = 'true', 'the new secret does not authenticate';
  assert public.get_profile(v_id, v_secret) ->> 'ok' = 'true', 'the first device stopped working';
  assert public.redeem_sync_code(v_code, v_device) ->> 'ok' = 'true', 'a repeated redemption';
  assert (select count(*) from private.credentials c where c.player_id = v_id) = 2, 'a repeat added a credential';

  foreach v_variant in array array['01ab2c3d4e5f6g7h', '01AB-2C3D-4E5F-6G7H', ' 01AB 2C3D 4E5F 6G7H ',
                                   'OIAB2C3D4E5F6G7H', 'OLAB2C3D4E5F6G7H', 'oiab-2c3d-4e5f-6g7h'] loop
    v_index := v_index + 1;
    v_reply := public.redeem_sync_code(v_variant, (select t.secret from private.t_player('sync-variant-' || v_index) t));
    assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'player_id' = v_id::text,
      format('the variant %L: %s', v_variant, v_reply);
  end loop;
  assert public.redeem_sync_code('01AB2C3D4E5F6G7', v_device) ->> 'code' = 'invalid_input', '15 characters';
  assert public.redeem_sync_code('01AB2C3D4E5F6G7U', v_device) ->> 'code' = 'invalid_input', 'U is no Crockford digit';
  assert public.redeem_sync_code(v_code, 'not-a-secret') ->> 'code' = 'invalid_input', 'a malformed new secret';
  assert public.redeem_sync_code(repeat('A', 9000), v_device) ->> 'code' = 'invalid_input', 'an oversized code';
end
$$;
select 'PASS AC-SYN-02 typed variants of a sync code redeem it, and a redemption adds a sync credential';

-- AC-SYN-04: the sixth failed attempt in 15 minutes from one address is
-- refused without the code being looked at: even the right code is
-- refused, from that address only. Successes give their attempt back.
do $$
declare
  v_id uuid;
  v_secret text;
  v_code text;
  v_index integer;
  v_reply jsonb;
  v_day_before integer;
begin
  perform private.t_sync_limits();
  perform private.t_now('2026-10-28T10:00:00Z');
  perform private.t_request('198.51.100.142');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('sync-fail') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  v_code := public.create_sync_code(v_id, v_secret) -> 'data' ->> 'code';

  perform private.t_request('203.0.113.143');
  for v_index in 1 .. 6 loop
    v_reply := public.redeem_sync_code(v_code, (select t.secret from private.t_player('sync-ok-' || v_index) t));
    assert v_reply ->> 'ok' = 'true', format('success %s from one address: %s', v_index, v_reply);
  end loop;

  perform private.t_request('203.0.113.144');
  perform private.t_now('2026-10-28T10:02:00Z');
  for v_index in 1 .. 5 loop
    v_reply := public.redeem_sync_code('ZZZZZZZZZZZZZZZ' || v_index, v_secret);
    assert v_reply ->> 'code' = 'not_found', format('failure %s: %s', v_index, v_reply);
  end loop;
  v_day_before := (select r.hits from private.rate_counters r
                    where r.bucket = 'sync_1d' and r.window_start = '2026-10-28T00:00:00Z'
                      and r.subject = private.subject('sync_1d', 'ip:203.0.113.144', '2026-10-28T00:00:00Z'));
  v_reply := public.redeem_sync_code(v_code, (select t.secret from private.t_player('sync-sixth') t));
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'ip'
     and (v_reply ->> 'retry_after_ms')::integer = 780000, format('the sixth attempt: %s', v_reply);
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'sync_1d' and r.window_start = '2026-10-28T00:00:00Z'
             and r.subject = private.subject('sync_1d', 'ip:203.0.113.144', '2026-10-28T00:00:00Z')) = v_day_before,
    'the refused attempt counted toward sync_1d';
  assert not exists (select 1 from private.credentials c
                      where c.secret_hash = sha256(convert_to((select t.secret from private.t_player('sync-sixth') t), 'UTF8'))),
    'the refused attempt still redeemed the code';

  perform private.t_request('203.0.113.145');
  assert public.redeem_sync_code(v_code, (select t.secret from private.t_player('sync-elsewhere') t)) ->> 'ok' = 'true',
    'another address was refused';
  perform private.t_request('203.0.113.144');
  perform private.t_now('2026-10-28T10:15:00Z');
  assert public.redeem_sync_code(v_code, (select t.secret from private.t_player('sync-later') t)) ->> 'ok' = 'true',
    'the next 15-minute window still refused';
end
$$;
select 'PASS AC-SYN-04 the sixth failed sync-code attempt in 15 minutes from one address is refused without checking the code';

-- 20 failures a day per address, and a project-wide bound on failures
-- that a forged address cannot escape.
do $$
declare
  v_index integer;
  v_reply jsonb;
  v_device text := (select t.secret from private.t_player('sync-daily-device') t);
begin
  perform private.t_sync_limits();
  perform private.t_request('203.0.113.146');
  for v_index in 1 .. 20 loop
    perform private.t_now(timestamptz '2026-10-28T12:00:00Z' + make_interval(mins => (v_index - 1) / 5 * 15));
    v_reply := public.redeem_sync_code('YYYYYYYYYYYYYYY' || (v_index % 10), v_device);
    assert v_reply ->> 'code' = 'not_found', format('daily failure %s: %s', v_index, v_reply);
  end loop;
  perform private.t_now('2026-10-28T13:00:00Z');
  v_reply := public.redeem_sync_code('YYYYYYYYYYYYYYYY', v_device);
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'ip'
     and (v_reply ->> 'retry_after_ms')::integer = 39600000, format('the 21st failure of the day: %s', v_reply);

  update private.config
     set value = value || '{"sync_fail_all_1h": {"cap": 3, "window_s": 3600}}'
   where key = 'limits';
  perform private.t_now('2026-10-28T15:00:00Z');
  for v_index in 1 .. 4 loop
    perform private.t_request('192.0.2.' || v_index || ', 198.51.100.147');
    v_reply := public.redeem_sync_code('XXXXXXXXXXXXXXX' || v_index, v_device);
    assert v_reply ->> 'code' = case when v_index <= 3 then 'not_found' else 'rate_limited' end,
      format('failure %s from a forged address: %s', v_index, v_reply);
  end loop;
  assert v_reply ->> 'limit_scope' = 'project', format('the bound that refused: %s', v_reply);
end
$$;
select 'PASS SQL-2 sync-code failures are capped per day and project-wide';

-- 5 new codes a player a day; the refusal gives back the general hit.
do $$
declare
  v_id uuid;
  v_secret text;
  v_index integer;
  v_reply jsonb;
  v_general integer;
begin
  perform private.t_sync_limits();
  perform private.t_now('2026-10-28T16:00:00Z');
  perform private.t_request('198.51.100.148');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('sync-create-limit') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  for v_index in 1 .. 5 loop
    assert public.create_sync_code(v_id, v_secret) ->> 'ok' = 'true', format('code %s', v_index);
  end loop;
  v_general := (select r.hits from private.rate_counters r
                 where r.bucket = 'general_player_5m' and r.window_start = '2026-10-28T16:00:00Z'
                   and r.subject = private.subject('general_player_5m', 'player:' || v_id, '2026-10-28T16:00:00Z'));
  v_reply := public.create_sync_code(v_id, v_secret);
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'player', format('the sixth code: %s', v_reply);
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'general_player_5m' and r.window_start = '2026-10-28T16:00:00Z'
             and r.subject = private.subject('general_player_5m', 'player:' || v_id, '2026-10-28T16:00:00Z')) = v_general,
    'the refused call kept its general hit';
end
$$;
select 'PASS SQL-2 a player makes at most 5 sync codes a day';

-- A player keeps 10 device credentials: the 11th overwrites the least
-- recently used one, which stops working, and the 10 newest still do.
do $$
declare
  v_id uuid;
  v_secret text;
  v_code text;
  v_index integer;
begin
  perform private.t_sync_limits();
  perform private.t_now('2026-10-01T08:00:00Z');
  perform private.t_request('198.51.100.149');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('sync-devices') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  v_code := public.create_sync_code(v_id, v_secret) -> 'data' ->> 'code';
  for v_index in 1 .. 10 loop
    perform private.t_now(timestamptz '2026-10-01T08:00:00Z' + make_interval(days => v_index));
    assert public.redeem_sync_code(v_code, (select t.secret from private.t_player('sync-device-' || v_index) t)) ->> 'ok' = 'true',
      format('device %s', v_index + 1);
    assert (select count(*) from private.credentials c where c.player_id = v_id) = least(v_index + 1, 10),
      format('after device %s the player holds %s credentials', v_index + 1,
             (select count(*) from private.credentials c where c.player_id = v_id));
  end loop;
  assert public.get_profile(v_id, v_secret) ->> 'code' = 'auth_failed', 'the least recently used device still works';
  for v_index in 1 .. 10 loop
    assert public.get_profile(v_id, (select t.secret from private.t_player('sync-device-' || v_index) t)) ->> 'ok' = 'true',
      format('device %s stopped working', v_index + 1);
  end loop;
end
$$;
select 'PASS SQL-2 the 11th device credential overwrites the least recently used one';

rollback;
