-- The identity RPCs' replies, recorded for the adapter's decoder fixtures
-- (src/backend/supabase/__fixtures__/identity.*.json, ARCHITECTURE §11.1).
-- Record them with a dry run:
--   npm run sql:bundle -- --area identity --after <last applied> \
--     --payloads supabase/tests/identity/identity.payloads.sql
select private.t_now('2026-11-04T12:00:00Z');
update private.config set value = '0' where key = 'egress_sample_rate';
update private.config
   set value = '{"header": "x-forwarded-for", "hop": "first", "verified": true}'
 where key = 'client_ip';
update private.config
   set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                          "identity_1m": {"cap": 20, "window_s": 60},
                          "identity_test_1h": {"cap": 200, "window_s": 3600},
                          "identity_test_all_1h": {"cap": 1000, "window_s": 3600},
                          "general_player_5m": {"cap": 300, "window_s": 300},
                          "sync_create_1d": {"cap": 5, "window_s": 86400},
                          "sync_fail_15m": {"cap": 5, "window_s": 900},
                          "sync_1d": {"cap": 20, "window_s": 86400},
                          "claim_player_1h": {"cap": 5, "window_s": 3600},
                          "claim_ip_1h": {"cap": 10, "window_s": 3600},
                          "export_1d": {"cap": 5, "window_s": 86400},
                          "t_client_ip_1h": {"cap": 30, "window_s": 3600}}'
 where key = 'limits';
select private.t_request('198.51.100.180');

-- payload: identity.profile
select public.register_player(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-player') t), 'in_app', 'whatsapp');

select public.set_age_band(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-player') t), '18_plus', 'nickname');

-- payload: identity.profile-aged
select public.get_profile(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-player') t));

-- payload: identity.auth-failed
select public.get_profile(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-wrong') t));

-- payload: identity.sync-code
select public.create_sync_code(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-player') t));

-- payload: identity.restored
select public.redeem_sync_code(
  public.create_sync_code(
    (select t.player_id from private.t_player('payload-player') t),
    (select t.secret from private.t_player('payload-player') t)) -> 'data' ->> 'code',
  (select t.secret from private.t_player('payload-device') t));

-- payload: identity.sync-not-found
select public.redeem_sync_code('ZZZZ-ZZZZ-ZZZZ-ZZZZ', (select t.secret from private.t_player('payload-device-2') t));

-- payload: identity.claim
select public.create_claim(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-token') t));

select private.t_request('203.0.113.181');

-- payload: identity.claim-preview
select public.peek_claim((select t.secret from private.t_player('payload-token') t));

-- payload: identity.claim-restored
select public.redeem_claim(
  (select t.secret from private.t_player('payload-token') t),
  (select t.secret from private.t_player('payload-browser') t));

-- payload: identity.claim-used
select public.peek_claim((select t.secret from private.t_player('payload-token') t));

-- payload: identity.export
select public.export_my_data(
  (select t.player_id from private.t_player('payload-player') t),
  (select t.secret from private.t_player('payload-player') t));

select public.register_player(
  (select t.player_id from private.t_player('payload-deleted') t),
  (select t.secret from private.t_player('payload-deleted') t), 'browser', 'none');

-- payload: identity.delete
select public.delete_player(
  (select t.player_id from private.t_player('payload-deleted') t),
  (select t.secret from private.t_player('payload-deleted') t));

select public.register_player(
  (select t.player_id from private.t_player('payload-test', true) t),
  (select t.secret from private.t_player('payload-test', true) t), 'browser', 'none');
select private.t_request('203.0.113.7, 93.184.216.34');

-- payload: identity.client-ip
select public.t_client_ip(
  (select t.player_id from private.t_player('payload-test', true) t),
  (select t.secret from private.t_player('payload-test', true) t));

update private.config
   set value = value || '{"identity_1m": {"cap": 0, "window_s": 60}}'
 where key = 'limits';

-- payload: identity.register-rate-limited
select public.register_player(
  (select t.player_id from private.t_player('payload-refused') t),
  (select t.secret from private.t_player('payload-refused') t), 'browser', 'none');
