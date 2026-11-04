-- SQL-2's attended bodies (ARCHITECTURE §8.4 delete_player, §8.15
-- nightly_players, §8.17), from 20261104000500_identity_attended.sql:
-- delete_player leaves no trace of the player id in any table, and the
-- nightly step removes test players older than a day. sql:bundle skips
-- this file unless that migration is in the bundle or already applied:
--   npm run sql:bundle -- --all --attended --applied list_migrations.json
-- requires: 20261104000500_identity_attended
begin;

do $$
begin
  assert pg_catalog.pg_get_functiondef('public.delete_player(uuid, text)'::regprocedure) like '%attended body%',
    'public.delete_player is still the unattended version: apply 20261104000500_identity_attended.sql';
  assert pg_catalog.pg_get_functiondef('private.nightly_players()'::regprocedure) like '%attended body%',
    'private.nightly_players is still the unattended version: apply 20261104000500_identity_attended.sql';
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
                            "sync_create_1d": {"cap": 5, "window_s": 86400},
                            "claim_player_1h": {"cap": 5, "window_s": 3600},
                            "rpc_errors_1h": {"cap": 1000, "window_s": 3600}}'
   where key = 'limits';
end
$$;
select 'PASS SQL-2 the attended migration replaced delete_player and nightly_players';

-- AC-DAT-02, identity half: after delete_player, a scan of every uuid,
-- text, bytea and json column of every table in private finds the player
-- id in no form; rate counters keep only salted hashes. A wrong secret
-- removes nothing.
do $$
declare
  v_id uuid;
  v_secret text;
  v_other uuid;
  v_other_secret text;
  v_reply jsonb;
  v_code text;
  v_column record;
  v_found boolean;
  v_forms text[];
  v_form text;
begin
  perform private.t_now('2026-10-30T09:00:00Z');
  perform private.t_request('198.51.100.170');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('delete-me') t;
  select t.player_id, t.secret into v_other, v_other_secret from private.t_player('delete-keep') t;
  assert public.register_player(v_id, v_secret, 'in_app', 'whatsapp') ->> 'ok' = 'true', 'setup: register';
  assert public.register_player(v_other, v_other_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register other';
  assert public.set_age_band(v_id, v_secret, '18_plus', 'nickname') ->> 'ok' = 'true', 'setup: age band';
  v_code := public.create_sync_code(v_id, v_secret) -> 'data' ->> 'code';
  assert public.redeem_sync_code(v_code, (select t.secret from private.t_player('delete-me-device') t)) ->> 'ok' = 'true',
    'setup: a second device';
  assert public.create_claim(v_id, v_secret, (select t.secret from private.t_player('delete-me-token') t)) ->> 'ok' = 'true',
    'setup: claim';
  assert private.write_key_claim('7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d', 'create_group', v_id) is null, 'setup: a write key';
  perform private.write_key_finish('7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d', jsonb_build_object('group', 'g'));
  perform private.log_error('t_delete', 'XX000', 'failed for ' || v_id::text);

  v_reply := public.delete_player(v_id, v_other_secret);
  assert v_reply ->> 'code' = 'auth_failed', format('a wrong secret: %s', v_reply);
  assert exists (select 1 from private.players p where p.id = v_id), 'a wrong secret removed the player';

  v_reply := public.delete_player(v_id, v_secret);
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' = '{}'::jsonb, format('delete_player: %s', v_reply);
  assert public.get_profile(v_id, v_secret) ->> 'code' = 'auth_failed', 'the deleted credential still works';
  assert public.get_profile(v_other, v_other_secret) ->> 'ok' = 'true', 'another player was touched';

  v_forms := array[v_id::text, upper(v_id::text), replace(v_id::text, '-', ''), upper(replace(v_id::text, '-', ''))];
  for v_column in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'private' and t.table_type = 'BASE TABLE'
       and c.data_type in ('uuid', 'text', 'character varying', 'character', 'jsonb', 'json', 'bytea', 'ARRAY')
  loop
    if v_column.data_type = 'bytea' then
      execute format('select exists (select 1 from private.%I x where position(%L::bytea in x.%I) > 0 or position(%L::bytea in x.%I) > 0)',
                     v_column.table_name, uuid_send(v_id), v_column.column_name,
                     convert_to(v_id::text, 'UTF8'), v_column.column_name) into v_found;
      assert not v_found, format('private.%s.%s holds the player id as bytes', v_column.table_name, v_column.column_name);
    else
      foreach v_form in array v_forms loop
        execute format('select exists (select 1 from private.%I x where strpos(x.%I::text, %L) > 0)',
                       v_column.table_name, v_column.column_name, v_form) into v_found;
        assert not v_found, format('private.%s.%s holds the player id', v_column.table_name, v_column.column_name);
      end loop;
    end if;
  end loop;
  assert exists (select 1 from private.rate_counters r
                  where r.bucket = 'general_player_5m' and r.window_start = '2026-10-30T09:00:00Z'
                    and r.subject = private.subject('general_player_5m', 'player:' || v_id, '2026-10-30T09:00:00Z')),
    'setup: the player''s counter, a salted hash, should stay';
end
$$;
select 'PASS AC-DAT-02 after delete_player no table in private holds the player id';

-- nightly_players removes test players older than a day with everything
-- under their ids, and keeps younger test players and every other player.
do $$
declare
  v_old uuid;
  v_old_secret text;
  v_young uuid;
  v_young_secret text;
  v_main uuid;
  v_main_secret text;
begin
  perform private.t_now('2026-10-30T10:00:00Z');
  perform private.t_request('198.51.100.171');
  select t.player_id, t.secret into v_old, v_old_secret from private.t_player('delete-old-test', true) t;
  select t.player_id, t.secret into v_main, v_main_secret from private.t_player('delete-old-main') t;
  assert public.register_player(v_old, v_old_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: an old test player';
  assert public.create_sync_code(v_old, v_old_secret) ->> 'ok' = 'true', 'setup: its sync code';
  assert public.register_player(v_main, v_main_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: an old player';
  perform private.t_now('2026-10-31T09:00:00Z');
  select t.player_id, t.secret into v_young, v_young_secret from private.t_player('delete-young-test', true) t;
  assert public.register_player(v_young, v_young_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: a young test player';

  perform private.t_now('2026-10-31T10:00:01Z');
  assert private.run_job_step('nightly', 'nightly_players'), 'nightly_players failed';
  assert not exists (select 1 from private.players p where p.id = v_old), 'a test player older than a day stayed';
  assert not exists (select 1 from private.credentials c where c.player_id = v_old)
     and not exists (select 1 from private.sync_codes s where s.player_id = v_old), 'its rows stayed';
  assert exists (select 1 from private.players p where p.id = v_young), 'a young test player was removed';
  assert exists (select 1 from private.players p where p.id = v_main), 'an ordinary player was removed';
end
$$;
select 'PASS SQL-2 nightly_players removes test players older than a day and nobody else';

rollback;
