-- The identity limits (ARCHITECTURE §8.5, §8.6; SQL-2): the burst limit
-- and the project ceiling refuse with their wait and scope, the soft
-- thresholds register low trust, low trust lifts, IPv6 counts by /64, and
-- a forged client address escapes nothing a project-wide bound holds.
-- Production limits are tested with ordinary ids inside the rolled-back
-- transaction (§8.17), each block writing the caps and the client-address
-- rule it relies on.
begin;

-- The state every block starts from: the documented caps, the first-hop
-- rule marked verified (or not), and the low-trust lift.
create or replace function private.t_identity_limits(p_verified boolean default true)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  update private.config set value = '0' where key = 'egress_sample_rate';
  insert into private.config (key, value)
  values ('client_ip', jsonb_build_object('header', 'x-forwarded-for', 'hop', 'first', 'verified', p_verified))
  on conflict (key) do update set value = excluded.value;
  insert into private.config (key, value)
  values ('low_trust', '{"lift_after_s": 86400, "lift_after_finishes": 2}')
  on conflict (key) do update set value = excluded.value;
  update private.config
     set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                            "identity_1m": {"cap": 20, "window_s": 60},
                            "identity_soft_1h": {"cap": 60, "window_s": 3600},
                            "identity_soft_all_1h": {"cap": 1000, "window_s": 3600},
                            "identity_test_1h": {"cap": 200, "window_s": 3600},
                            "identity_test_all_1h": {"cap": 1000, "window_s": 3600},
                            "general_player_5m": {"cap": 300, "window_s": 300}}'
   where key = 'limits';
end
$$;

-- AC-IDN-04, server half: 30 registrations from one address in 10 minutes
-- all pass at normal trust; a 21st inside one minute is refused with the
-- time left in the minute and scope ip, consuming nothing but the burst
-- counter; and the project ceiling refuses with scope project and alerts
-- the owner once.
do $$
declare
  v_index integer;
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_all_before integer;
begin
  perform private.t_identity_limits();
  perform private.t_request('198.51.100.70');
  for v_index in 1 .. 30 loop
    perform private.t_now(timestamptz '2026-10-21T08:00:00Z' + make_interval(secs => v_index * 19));
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-office-' || v_index) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    assert v_reply ->> 'ok' = 'true', format('registration %s: %s', v_index, v_reply);
    assert not (select p.low_trust from private.players p where p.id = v_id), format('registration %s is low trust', v_index);
  end loop;

  perform private.t_now('2026-10-21T09:00:05Z');
  for v_index in 1 .. 20 loop
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-burst-' || v_index) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    assert v_reply ->> 'ok' = 'true', format('burst registration %s: %s', v_index, v_reply);
  end loop;
  v_all_before := (select r.hits from private.rate_counters r
                    where r.bucket = 'identity_all_1h' and r.window_start = '2026-10-21T09:00:00Z'
                      and r.subject = private.subject('identity_all_1h', 'project', '2026-10-21T09:00:00Z'));
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-burst-21') t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'ip'
     and (v_reply ->> 'retry_after_ms')::integer = 55000, format('the 21st in a minute: %s', v_reply);
  assert not exists (select 1 from private.players p where p.id = v_id), 'the refused registration created a player';
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'identity_all_1h' and r.window_start = '2026-10-21T09:00:00Z'
             and r.subject = private.subject('identity_all_1h', 'project', '2026-10-21T09:00:00Z')) = v_all_before,
    'the refused registration consumed the project ceiling';
  perform private.t_request('198.51.100.71');
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'ok' = 'true', format('another address inside the same minute: %s', v_reply);

  -- The project ceiling: with the hour's count at the cap, the next
  -- registration from a fresh address is refused for the rest of the hour.
  update private.config
     set value = value || jsonb_build_object('identity_all_1h', jsonb_build_object('cap', v_all_before + 1, 'window_s', 3600))
   where key = 'limits';
  perform private.t_now('2026-10-21T09:10:00Z');
  for v_index in 1 .. 3 loop
    perform private.t_request('198.51.100.' || (80 + v_index));
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-ceiling-' || v_index) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'project'
       and (v_reply ->> 'retry_after_ms')::integer = 3000000, format('past the ceiling: %s', v_reply);
  end loop;
  assert (select count(*) from private.alerts a
           where a.kind = 'identity_ceiling' and a.detail ->> 'item' = 'identity_all_1h'
             and a.at >= '2026-10-21T09:00:00Z' and a.at < '2026-10-21T10:00:00Z') = 1, 'the tripped ceiling did not alert the owner exactly once';
  assert coalesce((select r.hits from private.rate_counters r
                    where r.bucket = 'identity_1m' and r.window_start = '2026-10-21T09:10:00Z'
                      and r.subject = private.subject('identity_1m', 'ip:198.51.100.81', '2026-10-21T09:10:00Z')), 0) = 0,
    'a registration the ceiling refused counted toward the address''s burst';
end
$$;
select 'PASS AC-IDN-04 30 registrations from one address in 10 minutes pass, the 21st in a minute is refused (ip), the ceiling refuses (project)';

-- AC-IDN-06, SQL half: from one address the 61st new identity in an hour
-- registers as low trust, with the same profile as any other, and the
-- mark lifts once the identity is 24 hours old or has finished 2 Dailies.
do $$
declare
  v_index integer;
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_second uuid;
  v_second_secret text;
begin
  perform private.t_identity_limits();
  perform private.t_request('203.0.113.90');
  for v_index in 1 .. 60 loop
    perform private.t_now(timestamptz '2026-10-22T10:00:00Z' + make_interval(secs => v_index * 30));
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-campus-' || v_index) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    assert v_reply ->> 'ok' = 'true', format('registration %s: %s', v_index, v_reply);
    assert not (select p.low_trust from private.players p where p.id = v_id), format('registration %s is low trust', v_index);
  end loop;
  perform private.t_now('2026-10-22T10:31:00Z');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-campus-61') t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'ok' = 'true', format('the 61st: %s', v_reply);
  assert (select p.low_trust from private.players p where p.id = v_id), 'the 61st is not low trust';
  assert v_reply -> 'data' = private.profile_json(v_id) and not (v_reply -> 'data' ? 'low_trust'),
    'a low-trust profile differs from any other';
  select t.player_id, t.secret into v_second, v_second_secret from private.t_player('limits-campus-62') t;
  assert public.register_player(v_second, v_second_secret, 'browser', 'none') ->> 'ok' = 'true', 'the 62nd';
  assert (select p.low_trust from private.players p where p.id = v_second), 'the 62nd is not low trust';

  -- Still low trust the same day; lifted at 24 hours, by the next call.
  perform private.t_now('2026-10-23T10:30:59Z');
  assert public.get_profile(v_id, v_secret) ->> 'ok' = 'true', 'get_profile before 24 hours';
  assert (select p.low_trust from private.players p where p.id = v_id), 'low trust lifted before 24 hours';
  perform private.t_now('2026-10-23T10:31:00Z');
  assert public.get_profile(v_id, v_secret) ->> 'ok' = 'true', 'get_profile at 24 hours';
  assert not (select p.low_trust from private.players p where p.id = v_id), 'low trust did not lift at 24 hours';

  -- Two finished Dailies lift it sooner. SQL-4 fills finished_dailies; a
  -- stand-in answers 2 here.
  perform private.t_now('2026-10-22T12:00:00Z');
  assert public.get_profile(v_second, v_second_secret) ->> 'ok' = 'true', 'get_profile';
  assert (select p.low_trust from private.players p where p.id = v_second), 'lifted without finishes';
  create or replace function private.finished_dailies(p_player uuid)
  returns integer language sql stable set search_path = '' as $f$ select 2 $f$;
  assert public.get_profile(v_second, v_second_secret) ->> 'ok' = 'true', 'get_profile after two finishes';
  assert not (select p.low_trust from private.players p where p.id = v_second), 'low trust did not lift after 2 finished Dailies';
  create or replace function private.finished_dailies(p_player uuid)
  returns integer language sql stable set search_path = '' as $f$ select 0 $f$;
end
$$;
select 'PASS AC-IDN-06 the 61st new identity from one address in an hour registers as low trust, lifted at 24 hours or 2 finished Dailies';

-- AC-IDN-07: two IPv6 addresses in one /64 share the burst counter, and
-- another /64 has its own.
do $$
declare
  v_index integer;
  v_id uuid;
  v_secret text;
  v_reply jsonb;
begin
  perform private.t_identity_limits();
  perform private.t_now('2026-10-24T12:00:10Z');
  for v_index in 1 .. 20 loop
    perform private.t_request('2001:db8:aa:bb::' || to_hex(v_index));
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-v6-' || v_index) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    assert v_reply ->> 'ok' = 'true', format('IPv6 registration %s: %s', v_index, v_reply);
  end loop;
  perform private.t_request('[2001:db8:aa:bb:ffff:ffff:ffff:fffe]:443');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-v6-21') t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'ip',
    format('another address in the same /64: %s', v_reply);
  perform private.t_request('2001:db8:aa:bc::1');
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'ok' = 'true', format('the next /64: %s', v_reply);
end
$$;
select 'PASS AC-IDN-07 two IPv6 addresses in one /64 share the identity counter and two /64s do not';

-- Normal trust also needs the project under its soft threshold and a
-- verified client-address rule; test identities are never low trust.
do $$
declare
  v_index integer;
  v_id uuid;
  v_secret text;
begin
  perform private.t_identity_limits();
  perform private.t_now('2026-10-25T07:00:00Z');
  update private.config
     set value = value || '{"identity_soft_all_1h": {"cap": 3, "window_s": 3600}}'
   where key = 'limits';
  for v_index in 1 .. 4 loop
    perform private.t_request('198.51.100.' || (100 + v_index));
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-soft-all-' || v_index) t;
    assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'registration';
    assert (select p.low_trust from private.players p where p.id = v_id) = (v_index = 4),
      format('registration %s from its own address: low trust %s', v_index, (select p.low_trust from private.players p where p.id = v_id));
  end loop;

  perform private.t_now('2026-10-25T08:00:00Z');
  update private.config
     set value = '{"header": "x-forwarded-for", "hop": "first", "verified": false}'
   where key = 'client_ip';
  perform private.t_request('198.51.100.110');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-unverified') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'registration while unverified';
  assert (select p.low_trust from private.players p where p.id = v_id), 'normal trust from an unverified address rule';
  update private.config set value = '{"header": "x-forwarded-for", "hop": "first"}' where key = 'client_ip';
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-no-flag') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'registration without the flag';
  assert (select p.low_trust from private.players p where p.id = v_id), 'a rule without "verified" counted as verified';
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-unverified-test', true) t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'a test registration';
  assert not (select p.low_trust from private.players p where p.id = v_id), 'a test identity is low trust';
end
$$;
select 'PASS SQL-2 normal trust needs the project under its soft threshold and a verified address rule';

-- A forged first hop escapes the per-address counters while the rule
-- reads it, so the project-wide bounds hold: forged registrations stay
-- low trust while the rule is unverified and stop at the project ceiling.
-- Test identities stop at their own project bound.
do $$
declare
  v_index integer;
  v_id uuid;
  v_secret text;
  v_reply jsonb;
begin
  perform private.t_identity_limits(false);
  perform private.t_now('2026-10-26T06:00:00Z');
  update private.config
     set value = value || '{"identity_all_1h": {"cap": 4, "window_s": 3600},
                            "identity_1m": {"cap": 1, "window_s": 60},
                            "identity_test_1h": {"cap": 1, "window_s": 3600},
                            "identity_test_all_1h": {"cap": 2, "window_s": 3600}}'
   where key = 'limits';
  for v_index in 1 .. 5 loop
    perform private.t_request('192.0.2.' || v_index || ', 198.51.100.120');
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-forged-' || v_index) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    if v_index <= 4 then
      assert v_reply ->> 'ok' = 'true', format('forged registration %s: %s', v_index, v_reply);
      assert (select p.low_trust from private.players p where p.id = v_id), format('forged registration %s has normal trust', v_index);
    else
      assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'project',
        format('the project ceiling did not hold against forged hops: %s', v_reply);
    end if;
  end loop;

  for v_index in 1 .. 3 loop
    perform private.t_request('192.0.2.' || (50 + v_index) || ', 198.51.100.121');
    select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-forged-test-' || v_index, true) t;
    v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
    assert (v_reply ->> 'ok' = 'true') = (v_index <= 2), format('forged test registration %s: %s', v_index, v_reply);
  end loop;
  assert v_reply ->> 'limit_scope' = 'project', format('test registrations stopped by %s', v_reply);
  perform private.t_request('192.0.2.51, 198.51.100.121');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('limits-forged-test-4', true) t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'ip',
    format('a second test registration from one address: %s', v_reply);
end
$$;
select 'PASS SQL-2 forged first hops stay low trust and stop at the project-wide bounds';

rollback;
