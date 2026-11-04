-- AC-IDN-03 (PRD §3.10.1, ARCHITECTURE §8.4): every RPC that takes a
-- player's credential first (p_player uuid, p_secret text) answers a wrong,
-- malformed or missing secret with the same auth_failed and changes no row.
-- Table-driven over the allowlist, so each RPC a later ticket adds is held
-- to it too. Every other argument is null: authentication comes right
-- after the size caps, before any validation (supabase/README.md §3). The
-- exceptions by design take no player credential in that place:
-- log_practice_answers (its secret is optional and last, SQL-9 tests
-- that), room seat and host RPCs, and the sync-code and claim redemptions,
-- which authenticate with what they redeem (sync.test.sql, claims.test.sql).
begin;

do $$
declare
  v_id uuid;
  v_secret text;
  v_wrong text;
  v_unknown uuid;
  v_fn record;
  v_case record;
  v_index integer;
  v_args text;
  v_reply jsonb;
  v_before bigint;
  v_after bigint;
  v_checked text[] := '{}';
  c_failed constant jsonb := '{"ok": false, "code": "auth_failed", "current": null,
                               "retry_after_ms": null, "limit_scope": null, "ref": null}';
begin
  perform private.t_now('2026-10-27T09:00:00Z');
  update private.config set value = '0' where key = 'egress_sample_rate';
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first", "verified": true}')
  on conflict (key) do update set value = excluded.value;
  update private.config
     set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                            "identity_1m": {"cap": 20, "window_s": 60},
                            "general_player_5m": {"cap": 300, "window_s": 300}}'
   where key = 'limits';
  perform private.t_request('198.51.100.130');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('auth-known') t;
  v_wrong := (select t.secret from private.t_player('auth-wrong') t);
  v_unknown := (select t.player_id from private.t_player('auth-unknown') t);
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';

  for v_fn in
    select p.proname,
           p.pronargs,
           p.proargnames as names,
           array(select format_type(u.t, null) from unnest(p.proargtypes) with ordinality u(t, n) order by u.n) as types
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (select a.name from private.rpc_allowlist a)
       and p.pronargs >= 2
       and p.proargtypes[0] = 'uuid'::regtype and p.proargtypes[1] = 'text'::regtype
       and p.proargnames[1] = 'p_player' and p.proargnames[2] = 'p_secret'
     order by p.proname
  loop
    for v_case in
      select * from (values
        (v_id, v_wrong, 'a wrong secret'),
        (v_id, v_secret || 'A', 'a secret one character too long'),
        (v_id, replace(v_secret, substr(v_secret, 1, 1), '+'), 'a secret outside base64url'),
        (v_id, null, 'no secret'),
        (null, v_secret, 'no player id'),
        (v_unknown, v_secret, 'an id the server has never seen')
      ) c(player, secret, what)
    loop
      -- An unknown id registers through register_player (and the other
      -- "(auth, registers)" RPCs of later tickets); every other RPC refuses it.
      continue when v_case.player = v_unknown
                and v_fn.proname not in ('get_profile', 'set_age_band', 'create_sync_code', 'create_claim',
                                         'export_my_data', 'delete_player', 't_client_ip');
      v_args := format('%L::uuid, %L::text', v_case.player, v_case.secret);
      for v_index in 3 .. v_fn.pronargs loop
        v_args := v_args || format(', %I => null::%s', v_fn.names[v_index], v_fn.types[v_index]);
      end loop;
      select coalesce(sum(s.n_tup_ins + s.n_tup_upd + s.n_tup_del), 0) into v_before
        from pg_catalog.pg_stat_xact_user_tables s where s.schemaname = 'private';
      execute format('select public.%I(%s)', v_fn.proname, v_args) into v_reply;
      select coalesce(sum(s.n_tup_ins + s.n_tup_upd + s.n_tup_del), 0) into v_after
        from pg_catalog.pg_stat_xact_user_tables s where s.schemaname = 'private';
      assert v_reply - 'server_time' = c_failed, format('%s with %s answered %s', v_fn.proname, v_case.what, v_reply);
      assert v_after = v_before, format('%s with %s changed %s rows', v_fn.proname, v_case.what, v_after - v_before);
    end loop;
    v_checked := v_checked || v_fn.proname::text;
  end loop;
  assert v_checked @> array['create_claim', 'create_sync_code', 'delete_player', 'export_my_data', 'get_profile',
                            'register_player', 'set_age_band', 't_client_ip'],
    format('the identity RPCs were not all checked: %s', v_checked);

  assert not exists (select 1 from private.players p where p.id = v_unknown), 'an unknown player was registered';
end
$$;
select 'PASS AC-IDN-03 every authenticated RPC answers a wrong secret with the same auth_failed and changes nothing';

rollback;
