-- Claim links (ARCHITECTURE §8.4, §9.5; SQL-2): the device mints the
-- token and the server keeps its hash for 10 minutes; a retry with the
-- same token is the same claim; redeeming adds a credential for the same
-- player, once; peeks and redemptions are limited per address, and failed
-- ones are counted project-wide, a bound that alerts and never refuses.
begin;

create or replace function private.t_claim_limits()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  update private.config set value = '0' where key = 'egress_sample_rate';
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first", "verified": false}')
  on conflict (key) do update set value = excluded.value;
  update private.config
     set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                            "identity_1m": {"cap": 20, "window_s": 60},
                            "general_player_5m": {"cap": 300, "window_s": 300},
                            "claim_player_1h": {"cap": 5, "window_s": 3600},
                            "claim_ip_1h": {"cap": 10, "window_s": 3600},
                            "claim_fail_all_1h": {"cap": 1000, "window_s": 3600}}'
   where key = 'limits';
end
$$;

-- AC-IAB-04: the claim made in the in-app browser, redeemed in a second
-- context, yields the same player id, and the in-app credential keeps
-- working; a second redemption of the token fails; and so does a
-- redemption at 10 minutes 1 second.
do $$
declare
  v_id uuid;
  v_secret text;
  v_token text := (select t.secret from private.t_player('claims-token') t);
  v_browser text := (select t.secret from private.t_player('claims-browser') t);
  v_reply jsonb;
begin
  perform private.t_claim_limits();
  perform private.t_now('2026-10-29T08:00:00Z');
  perform private.t_request('198.51.100.150');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('claims-player') t;
  assert public.register_player(v_id, v_secret, 'in_app', 'whatsapp') ->> 'ok' = 'true', 'setup: register';

  v_reply := public.create_claim(v_id, v_secret, v_token);
  assert v_reply ->> 'ok' = 'true'
     and (v_reply -> 'data' ->> 'expires_at')::bigint = private.epoch_ms('2026-10-29T08:10:00Z'),
    format('create_claim: %s', v_reply);
  assert (select k.token_hash from private.claims k where k.player_id = v_id) = sha256(convert_to(v_token, 'UTF8')),
    'the stored hash is not sha256(token)';

  perform private.t_now('2026-10-29T08:04:00Z');
  perform private.t_request('203.0.113.151');
  v_reply := public.redeem_claim(v_token, v_browser);
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'player_id' = v_id::text, format('redeem_claim: %s', v_reply);
  assert v_reply -> 'data' -> 'profile' = private.profile_json(v_id), format('profile: %s', v_reply);
  assert exists (select 1 from private.credentials c
                  where c.player_id = v_id and c.source = 'claim' and c.secret_hash = sha256(convert_to(v_browser, 'UTF8'))),
    'no claim credential';
  assert public.get_profile(v_id, v_browser) ->> 'ok' = 'true', 'the browser cannot write';
  assert public.get_profile(v_id, v_secret) ->> 'ok' = 'true', 'the in-app copy stopped working';
  assert (select k.redeemed_at from private.claims k where k.player_id = v_id) = '2026-10-29T08:04:00Z', 'redeemed_at';

  v_reply := public.redeem_claim(v_token, (select t.secret from private.t_player('claims-third') t));
  assert v_reply ->> 'code' = 'expired' and v_reply -> 'current' = '{"used": true}', format('a second redemption: %s', v_reply);
  assert public.redeem_claim(v_token, v_browser) ->> 'code' = 'expired', 'a second redemption with the same secret';

  -- A fresh claim, redeemed at 10 minutes and 1 second.
  perform private.t_request('198.51.100.150');
  v_token := (select t.secret from private.t_player('claims-token-late') t);
  assert public.create_claim(v_id, v_secret, v_token) ->> 'ok' = 'true', 'a second claim';
  perform private.t_now('2026-10-29T08:14:01Z');
  perform private.t_request('203.0.113.151');
  v_reply := public.redeem_claim(v_token, (select t.secret from private.t_player('claims-late') t));
  assert v_reply ->> 'code' = 'expired' and v_reply -> 'current' = '{"used": false}', format('at 10 min 1 s: %s', v_reply);
  assert (select count(*) from private.credentials c where c.player_id = v_id) = 2, 'an expired claim added a credential';
end
$$;
select 'PASS AC-IAB-04 a claim redeems once for the same player id, and not after 10 minutes';

-- Creating: the token doubles as the call's key, so a retry returns the
-- same claim and counts once, and another player's token is conflict; a
-- new claim ends the previous token; 5 a player an hour.
do $$
declare
  v_id uuid;
  v_secret text;
  v_other uuid;
  v_other_secret text;
  v_token text := (select t.secret from private.t_player('claims-retry-token') t);
  v_reply jsonb;
  v_index integer;
begin
  perform private.t_claim_limits();
  perform private.t_now('2026-10-29T10:00:00Z');
  perform private.t_request('198.51.100.152');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('claims-retry') t;
  select t.player_id, t.secret into v_other, v_other_secret from private.t_player('claims-retry-other') t;
  assert public.register_player(v_id, v_secret, 'in_app', 'instagram') ->> 'ok' = 'true', 'setup: register';
  assert public.register_player(v_other, v_other_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register other';

  v_reply := public.create_claim(v_id, v_secret, v_token);
  perform private.t_now('2026-10-29T10:00:30Z');
  assert public.create_claim(v_id, v_secret, v_token) = jsonb_set(v_reply, '{server_time}', to_jsonb(private.epoch_ms(private.now()))),
    'a retry with the same token is not the same claim';
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'claim_player_1h' and r.window_start = '2026-10-29T10:00:00Z'
             and r.subject = private.subject('claim_player_1h', 'player:' || v_id, '2026-10-29T10:00:00Z')) = 1,
    'a retry counted twice';
  assert public.create_claim(v_other, v_other_secret, v_token) ->> 'code' = 'conflict', 'another player''s token';
  assert public.create_claim(v_id, v_secret, 'too-short') ->> 'code' = 'invalid_input', 'a malformed token';

  assert public.create_claim(v_id, v_secret, (select t.secret from private.t_player('claims-retry-token-2') t)) ->> 'ok' = 'true',
    'a new claim';
  assert (select count(*) from private.claims k where k.player_id = v_id) = 1, 'a player holds two claims';
  assert public.peek_claim(v_token) ->> 'code' = 'not_found', 'a new claim left the previous token working';

  for v_index in 3 .. 5 loop
    assert public.create_claim(v_id, v_secret, (select t.secret from private.t_player('claims-retry-token-' || v_index) t)) ->> 'ok' = 'true',
      format('claim %s', v_index);
  end loop;
  v_reply := public.create_claim(v_id, v_secret, (select t.secret from private.t_player('claims-retry-token-6') t));
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'player'
     and (v_reply ->> 'retry_after_ms')::integer = 3570000, format('the sixth claim in an hour: %s', v_reply);
end
$$;
select 'PASS SQL-2 a retried claim is the same claim, a new claim ends the old token, and 5 a player an hour';

-- Peeking: the confirm step's preview of a valid claim, expired with
-- used false or true otherwise, not_found for a token nobody holds.
do $$
declare
  v_id uuid;
  v_secret text;
  v_token text := (select t.secret from private.t_player('claims-peek-token') t);
  v_reply jsonb;
begin
  perform private.t_claim_limits();
  perform private.t_now('2026-10-29T12:00:00Z');
  perform private.t_request('198.51.100.153');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('claims-peek') t;
  assert public.register_player(v_id, v_secret, 'in_app', 'tiktok') ->> 'ok' = 'true', 'setup: register';
  assert public.create_claim(v_id, v_secret, v_token) ->> 'ok' = 'true', 'setup: claim';

  perform private.t_request('203.0.113.154');
  v_reply := public.peek_claim(v_token);
  assert v_reply ->> 'ok' = 'true', format('peek_claim: %s', v_reply);
  assert v_reply -> 'data' ->> 'friendly_name' = private.friendly_name_for(v_id)
     and v_reply -> 'data' -> 'nickname' = 'null'::jsonb
     and jsonb_typeof(v_reply -> 'data' -> 'streak') = 'number'
     and v_reply -> 'data' ? 'last_daily'
     and (v_reply -> 'data' ->> 'expires_at')::bigint = private.epoch_ms('2026-10-29T12:10:00Z'),
    format('preview: %s', v_reply);
  assert not (v_reply -> 'data' ? 'player_id'), 'the preview names the player id';

  assert public.peek_claim((select t.secret from private.t_player('claims-peek-nobody') t)) ->> 'code' = 'not_found', 'unknown token';
  assert public.peek_claim('not a token') ->> 'code' = 'not_found', 'malformed token';
  perform private.t_now('2026-10-29T12:10:00Z');
  v_reply := public.peek_claim(v_token);
  assert v_reply ->> 'code' = 'expired' and v_reply -> 'current' = '{"used": false}', format('expired: %s', v_reply);

  perform private.t_now('2026-10-29T12:20:00Z');
  perform private.t_request('198.51.100.153');
  v_token := (select t.secret from private.t_player('claims-peek-token-2') t);
  assert public.create_claim(v_id, v_secret, v_token) ->> 'ok' = 'true', 'setup: a second claim';
  perform private.t_request('203.0.113.155');
  assert public.redeem_claim(v_token, (select t.secret from private.t_player('claims-peek-browser') t)) ->> 'ok' = 'true', 'redeem';
  v_reply := public.peek_claim(v_token);
  assert v_reply ->> 'code' = 'expired' and v_reply -> 'current' = '{"used": true}', format('used: %s', v_reply);
end
$$;
select 'PASS SQL-2 peek_claim previews a valid claim and tells an expired one from a used one';

-- 10 peeks and redemptions an address an hour, shared. Tokens that name no
-- claim, and malformed ones, count project-wide, and a known token never
-- does; that bound never refuses: past it, guesses from forged addresses
-- still get not_found, a live token still peeks and redeems from anywhere,
-- and the owner hears once that hour.
do $$
declare
  v_id uuid;
  v_secret text;
  v_token text := (select t.secret from private.t_player('claims-limit-token') t);
  v_index integer;
  v_reply jsonb;
begin
  perform private.t_claim_limits();
  perform private.t_now('2026-10-29T14:00:00Z');
  perform private.t_request('198.51.100.156');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('claims-limit') t;
  assert public.register_player(v_id, v_secret, 'in_app', 'facebook') ->> 'ok' = 'true', 'setup: register';
  assert public.create_claim(v_id, v_secret, v_token) ->> 'ok' = 'true', 'setup: claim';

  perform private.t_request('203.0.113.157');
  for v_index in 1 .. 9 loop
    assert public.peek_claim(v_token) ->> 'ok' = 'true', format('peek %s', v_index);
  end loop;
  assert public.redeem_claim(v_token, (select t.secret from private.t_player('claims-limit-browser') t)) ->> 'ok' = 'true',
    'the tenth call, a redemption';
  v_reply := public.peek_claim(v_token);
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'ip', format('the eleventh call: %s', v_reply);
  assert coalesce((select r.hits from private.rate_counters r
                    where r.bucket = 'claim_fail_all_1h' and r.window_start = '2026-10-29T14:00:00Z'
                      and r.subject = private.subject('claim_fail_all_1h', 'project', '2026-10-29T14:00:00Z')), 0) = 0,
    'known tokens counted as failures';

  update private.config
     set value = value || '{"claim_fail_all_1h": {"cap": 2, "window_s": 3600}}'
   where key = 'limits';
  for v_index in 1 .. 5 loop
    perform private.t_request('192.0.2.' || (10 + v_index) || ', 198.51.100.158');
    if v_index = 5 then
      v_reply := public.redeem_claim('not a token', (select t.secret from private.t_player('claims-guess-browser') t));
    else
      v_reply := public.peek_claim((select t.secret from private.t_player('claims-guess-' || v_index) t));
    end if;
    assert v_reply ->> 'code' = 'not_found', format('guess %s from a forged address: %s', v_index, v_reply);
  end loop;
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'claim_fail_all_1h' and r.window_start = '2026-10-29T14:00:00Z'
             and r.subject = private.subject('claim_fail_all_1h', 'project', '2026-10-29T14:00:00Z')) = 5,
    'the guesses were not all counted project-wide';

  perform private.t_request('198.51.100.156');
  v_token := (select t.secret from private.t_player('claims-limit-token-2') t);
  assert public.create_claim(v_id, v_secret, v_token) ->> 'ok' = 'true', 'setup: a second claim';
  perform private.t_request('203.0.113.200');
  v_reply := public.peek_claim(v_token);
  assert v_reply ->> 'ok' = 'true', format('a live token''s peek past the project-wide bound: %s', v_reply);
  v_reply := public.redeem_claim(v_token, (select t.secret from private.t_player('claims-limit-browser-2') t));
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'player_id' = v_id::text,
    format('a live token''s redemption past the project-wide bound: %s', v_reply);
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'claim_fail_all_1h' and r.window_start = '2026-10-29T14:00:00Z'
             and r.subject = private.subject('claim_fail_all_1h', 'project', '2026-10-29T14:00:00Z')) = 5,
    'a live token counted as a failure';
  assert (select count(*) from private.alerts a
           where a.kind = 'owner_queue' and a.detail ->> 'item' = 'claim_fail_all_1h'
             and (a.detail ->> 'cap')::integer = 2
             and a.at >= '2026-10-29T14:00:00Z' and a.at < '2026-10-29T15:00:00Z') = 1,
    'the owner was not alerted exactly once that hour';
end
$$;
select 'PASS SQL-2 claim peeks and redemptions are capped per address, and past the project-wide failure bound a live token still redeems';

rollback;
