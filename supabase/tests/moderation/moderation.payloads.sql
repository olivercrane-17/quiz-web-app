-- set_nickname's replies, recorded for the adapter's decoder fixtures
-- (src/backend/supabase/__fixtures__/nickname.*.json, ARCHITECTURE §11.1).
-- Record them with a dry run:
--   npm run sql:bundle -- --area moderation --after <last applied> \
--     --payloads supabase/tests/moderation/moderation.payloads.sql
select private.t_now('2026-11-05T12:00:00Z');
update private.config set value = '0' where key = 'egress_sample_rate';
update private.config
   set value = '{"header": "x-forwarded-for", "hop": "first", "verified": false}'
 where key = 'client_ip';
update private.config
   set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                          "identity_1m": {"cap": 20, "window_s": 60},
                          "general_player_5m": {"cap": 300, "window_s": 300},
                          "age_band_1d": {"cap": 10, "window_s": 86400},
                          "nickname_1d": {"cap": 20, "window_s": 86400}}'
 where key = 'limits';
update private.moderation_terms set active = false where active;
insert into private.moderation_terms (term, match, active)
values ('zorblax', 'substring', true)
on conflict (term) do update set match = excluded.match, active = true;
select private.t_request('198.51.100.190');
select public.register_player(
  (select t.player_id from private.t_player('payload-nickname') t),
  (select t.secret from private.t_player('payload-nickname') t), 'browser', 'none');
select public.set_age_band(
  (select t.player_id from private.t_player('payload-nickname') t),
  (select t.secret from private.t_player('payload-nickname') t), '18_plus', 'nickname');

-- payload: nickname.custom
select public.set_nickname(
  (select t.player_id from private.t_player('payload-nickname') t),
  (select t.secret from private.t_player('payload-nickname') t), 'Dee', false);

-- payload: nickname.blocked
select public.set_nickname(
  (select t.player_id from private.t_player('payload-nickname') t),
  (select t.secret from private.t_player('payload-nickname') t), 'XXzorblaxYY', false);
