-- The rest of the identity RPCs (ARCHITECTURE §8.4; SQL-2): the age band,
-- the data export, delete_player while its attended body waits,
-- t_client_ip for the client-ip contract test, and nightly_players.
begin;

create or replace function private.t_account_limits()
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
                            "identity_test_1h": {"cap": 200, "window_s": 3600},
                            "identity_test_all_1h": {"cap": 1000, "window_s": 3600},
                            "general_player_5m": {"cap": 300, "window_s": 300},
                            "age_band_1d": {"cap": 10, "window_s": 86400},
                            "export_1d": {"cap": 5, "window_s": 86400},
                            "sync_create_1d": {"cap": 5, "window_s": 86400},
                            "claim_player_1h": {"cap": 5, "window_s": 3600},
                            "t_client_ip_1h": {"cap": 30, "window_s": 3600}}'
   where key = 'limits';
end
$$;

-- The age band (PRD §3.10.6): 13_17 or 18_plus at one of the five moments,
-- changeable both ways, never under_13; its time is kept until it changes;
-- 10 a player a day.
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_index integer;
begin
  perform private.t_account_limits();
  perform private.t_now('2026-10-30T08:00:00Z');
  perform private.t_request('198.51.100.160');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('account-age') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';

  v_reply := public.set_age_band(v_id, v_secret, '13_17', 'group');
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'age_band' = '13_17', format('13_17: %s', v_reply);
  assert (select p.age_band_set_at from private.players p where p.id = v_id) = '2026-10-30T08:00:00Z', 'age_band_set_at';
  perform private.t_now('2026-10-30T08:05:00Z');
  assert public.set_age_band(v_id, v_secret, '13_17', 'nickname') ->> 'ok' = 'true', 'the same band again';
  assert (select p.age_band_set_at from private.players p where p.id = v_id) = '2026-10-30T08:00:00Z',
    'the same band again moved age_band_set_at';
  v_reply := public.set_age_band(v_id, v_secret, '18_plus', 'quiz_share');
  assert v_reply -> 'data' ->> 'age_band' = '18_plus', format('18_plus: %s', v_reply);
  assert (select p.age_band_set_at from private.players p where p.id = v_id) = '2026-10-30T08:05:00Z', 'a change keeps its time';

  assert public.set_age_band(v_id, v_secret, 'under_13', 'group') ->> 'code' = 'invalid_input', 'under_13 is never stored';
  assert public.set_age_band(v_id, v_secret, '18_plus', 'birthday') ->> 'code' = 'invalid_input', 'an unknown moment';
  assert public.set_age_band(v_id, v_secret, null, 'group') ->> 'code' = 'invalid_input', 'no band';
  assert (select p.age_band from private.players p where p.id = v_id) = '18_plus', 'a refused call changed the band';
  for v_index in 7 .. 10 loop
    perform public.set_age_band(v_id, v_secret, '18_plus', 'reminder');
  end loop;
  v_reply := public.set_age_band(v_id, v_secret, '13_17', 'room_name');
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'player', format('the 11th of the day: %s', v_reply);
end
$$;
select 'PASS SQL-2 set_age_band stores 13_17 or 18_plus, refuses under_13 and allows 10 a day';

-- The export: the profile, the account block with the devices but never a
-- hash, a token or the secret, and the arrays later tickets fill. 5 a day.
do $$
declare
  v_id uuid;
  v_secret text;
  v_token text := (select t.secret from private.t_player('account-export-token') t);
  v_reply jsonb;
  v_data jsonb;
  v_index integer;
begin
  perform private.t_account_limits();
  perform private.t_now('2026-10-30T10:00:00Z');
  perform private.t_request('198.51.100.161');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('account-export') t;
  assert public.register_player(v_id, v_secret, 'in_app', 'telegram') ->> 'ok' = 'true', 'setup: register';
  assert public.set_age_band(v_id, v_secret, '18_plus', 'nickname') ->> 'ok' = 'true', 'setup: age band';
  assert public.create_sync_code(v_id, v_secret) ->> 'ok' = 'true', 'setup: sync code';
  assert public.create_claim(v_id, v_secret, v_token) ->> 'ok' = 'true', 'setup: claim';

  v_reply := public.export_my_data(v_id, v_secret);
  assert v_reply ->> 'ok' = 'true', format('export_my_data: %s', v_reply);
  v_data := v_reply -> 'data';
  assert (v_data ->> 'exported_at')::bigint = private.epoch_ms('2026-10-30T10:00:00Z'), 'exported_at';
  assert v_data -> 'profile' = private.profile_json(v_id), format('profile: %s', v_data -> 'profile');
  assert v_data -> 'account' ->> 'first_context' = 'in_app' and v_data -> 'account' ->> 'first_app' = 'telegram'
     and v_data -> 'account' ->> 'track' = 'main'
     and (v_data -> 'account' ->> 'age_band_set_at')::bigint = private.epoch_ms('2026-10-30T10:00:00Z'),
    format('account: %s', v_data -> 'account');
  assert jsonb_array_length(v_data -> 'account' -> 'devices') = 1
     and v_data -> 'account' -> 'devices' -> 0 ->> 'source' = 'mint', format('devices: %s', v_data -> 'account' -> 'devices');
  assert v_data -> 'account' -> 'sync_code' ? 'created_at' and v_data -> 'account' -> 'claim' ? 'expires_at',
    format('sync code and claim: %s', v_data -> 'account');
  assert jsonb_typeof(v_data -> 'attempts') = 'array' and jsonb_typeof(v_data -> 'streak_days') = 'array'
     and jsonb_typeof(v_data -> 'groups') = 'array' and jsonb_typeof(v_data -> 'challenges') = 'array'
     and jsonb_typeof(v_data -> 'quizzes') = 'array', format('arrays: %s', v_data);
  assert strpos(v_reply::text, v_secret) = 0 and strpos(v_reply::text, v_token) = 0, 'the export holds a secret or token';
  assert strpos(v_reply::text, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex')) = 0
     and strpos(v_reply::text, 'hash') = 0 and strpos(v_reply::text, 'low_trust') = 0,
    'the export holds a hash or the trust mark';
  for v_index in 2 .. 5 loop
    assert public.export_my_data(v_id, v_secret) ->> 'ok' = 'true', format('export %s', v_index);
  end loop;
  v_reply := public.export_my_data(v_id, v_secret);
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'player', format('the sixth export: %s', v_reply);
end
$$;
select 'PASS SQL-2 export_my_data answers everything kept under the id, without hashes or secrets, 5 a day';

-- Until 20261104000500_identity_attended.sql lands, delete_player keeps
-- the player, answers unavailable with an hour's wait, and alerts the
-- owner once a day. (The attended body is tested in identity-attended/.)
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
begin
  if pg_catalog.pg_get_functiondef('public.delete_player(uuid, text)'::regprocedure) like '%attended body%' then
    return;
  end if;
  perform private.t_account_limits();
  perform private.t_now('2026-10-30T12:00:00Z');
  perform private.t_request('198.51.100.162');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('account-delete') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  v_reply := public.delete_player(v_id, v_secret);
  assert v_reply ->> 'code' = 'unavailable' and (v_reply ->> 'retry_after_ms')::integer = 3600000,
    format('delete_player: %s', v_reply);
  assert exists (select 1 from private.players p where p.id = v_id), 'the unattended version removed the player';
  perform public.delete_player(v_id, v_secret);
  assert (select count(*) from private.alerts a
           where a.kind = 'owner_queue' and a.detail ->> 'item' = '20261104000500_identity_attended'
             and a.at >= '2026-10-30T00:00:00Z' and a.at < '2026-10-31T00:00:00Z') = 1,
    'the owner was not alerted exactly once that day';
  assert not exists (select 1 from private.alerts a
                      where a.at >= '2026-10-30T00:00:00Z' and a.at < '2026-10-31T00:00:00Z'
                        and strpos(a.detail::text, v_id::text) > 0),
    'an alert names the player';
end
$$;
select 'PASS SQL-2 delete_player answers unavailable until its attended body is applied';

-- t_client_ip (§8.6): test identities only; it says whether the address
-- the limiter keys on is the forged 203.0.113.7, with booleans, hop kinds
-- and header names, never an address.
do $$
declare
  v_id uuid;
  v_secret text;
  v_main uuid;
  v_main_secret text;
  v_reply jsonb;
  v_index integer;
begin
  perform private.t_account_limits();
  perform private.t_now('2026-10-30T14:00:00Z');
  perform private.t_request('198.51.100.163');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('account-client-ip', true) t;
  select t.player_id, t.secret into v_main, v_main_secret from private.t_player('account-client-ip-main') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register a test id';
  assert public.register_player(v_main, v_main_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  assert public.t_client_ip(v_main, v_main_secret) ->> 'code' = 'not_found', 'an ordinary identity';

  perform private.t_request('203.0.113.7, 93.184.216.34, 10.1.2.3',
                            '{"x-real-ip": "93.184.216.34", "apikey": "sb_publishable_x"}');
  v_reply := public.t_client_ip(v_id, v_secret);
  assert v_reply ->> 'ok' = 'true', format('t_client_ip: %s', v_reply);
  assert (v_reply -> 'data' ->> 'chosen_forged')::boolean and (v_reply -> 'data' ->> 'first_hop_forged')::boolean
     and not (v_reply -> 'data' ->> 'last_hop_forged')::boolean and (v_reply -> 'data' ->> 'hops')::integer = 3,
    format('with the first-hop rule: %s', v_reply);
  assert v_reply -> 'data' -> 'hop_kinds' = '["forged", "public", "reserved"]', format('hop kinds: %s', v_reply);
  assert v_reply -> 'data' -> 'header_names' = '["apikey", "x-forwarded-for", "x-real-ip"]', format('header names: %s', v_reply);
  assert v_reply -> 'data' -> 'forged_headers' = '["x-forwarded-for"]', format('forged headers: %s', v_reply);
  assert v_reply -> 'data' -> 'rule' ->> 'hop' = 'first', format('rule: %s', v_reply);
  assert v_reply::text !~ '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' and strpos(v_reply::text, 'sb_publishable_x') = 0,
    format('the reply holds an address or a header value: %s', v_reply);

  update private.config set value = '{"header": "x-forwarded-for", "hop": 1, "verified": true}' where key = 'client_ip';
  v_reply := public.t_client_ip(v_id, v_secret);
  assert not (v_reply -> 'data' ->> 'chosen_forged')::boolean, format('one hop from the right: %s', v_reply);
  perform private.t_request(null, '{"x-real-ip": "203.0.113.7"}');
  v_reply := public.t_client_ip(v_id, v_secret);
  assert (v_reply -> 'data' ->> 'hops')::integer = 0 and v_reply -> 'data' -> 'forged_headers' = '["x-real-ip"]'
     and not (v_reply -> 'data' ->> 'first_hop_forged')::boolean, format('no X-Forwarded-For: %s', v_reply);

  for v_index in 4 .. 30 loop
    perform public.t_client_ip(v_id, v_secret);
  end loop;
  v_reply := public.t_client_ip(v_id, v_secret);
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'player', format('the 31st call: %s', v_reply);
end
$$;
select 'PASS SQL-2 t_client_ip reports where a forged first hop lands, for test identities, with no address';

-- nightly_players runs as a job step. Until its attended body lands it
-- removes nothing and alerts the owner once a day while test players
-- older than a day wait; while the address rule is unverified it says so.
do $$
declare
  v_id uuid;
  v_secret text;
  v_last_alert bigint := coalesce((select max(a.id) from private.alerts a), 0);
begin
  perform private.t_account_limits();
  perform private.t_now('2026-10-30T16:00:00Z');
  perform private.t_request('198.51.100.164');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('account-nightly', true) t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register a test id';
  update private.config set value = '{"header": "x-forwarded-for", "hop": "first"}' where key = 'client_ip';
  perform private.t_now('2026-10-31T16:00:01Z');
  assert private.run_job_step('nightly', 'nightly_players'), 'nightly_players failed';
  assert private.run_job_step('nightly', 'nightly_players'), 'nightly_players failed on its second run';
  assert exists (select 1 from private.alerts a
                  where a.id > v_last_alert and a.kind = 'owner_queue' and a.detail ->> 'item' = 'client_ip_unverified'),
    'no alert for the unverified address rule';
  assert (select count(*) from private.alerts a
           where a.id > v_last_alert and a.kind = 'owner_queue' and a.detail ->> 'item' = 'client_ip_unverified') = 1,
    'the unverified address rule alerted twice in a day';
  if pg_catalog.pg_get_functiondef('private.nightly_players()'::regprocedure) not like '%attended body%' then
    assert exists (select 1 from private.players p where p.id = v_id), 'the unattended version removed a test player';
    assert (select count(*) from private.alerts a
             where a.id > v_last_alert and a.kind = 'owner_queue'
               and a.detail ->> 'item' = '20261104000500_identity_attended') = 1,
      'the waiting test players did not alert the owner exactly once';
  end if;
end
$$;
select 'PASS SQL-2 nightly_players runs as a job step and alerts the owner about what waits';

rollback;
