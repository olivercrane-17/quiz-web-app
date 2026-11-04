-- Registration (ARCHITECTURE §8.4 register_player, §8.5; SQL-2): only a
-- hash of the secret is kept, a first write creates the player once with a
-- generated friendly name and a mint credential, test ids play the e2e
-- track, input is validated, and two first writes racing on one id create
-- one player. Each block writes the caps and the client-address rule it
-- relies on, so the file passes on a live database an owner has tuned.
begin;

do $$
begin
  update private.config set value = '0' where key = 'egress_sample_rate';
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first", "verified": true}')
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

-- AC-IDN-02: the player row has no secret column, the credential is
-- sha256(secret), and no column anywhere in private holds the secret.
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_profile jsonb;
  v_cred record;
  v_player record;
  v_column record;
  v_found boolean;
begin
  perform private.t_now('2026-10-20T08:00:00Z');
  perform private.t_request('198.51.100.61');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('register-basic') t;

  v_reply := public.register_player(v_id, v_secret, 'in_app', 'whatsapp');
  assert v_reply ->> 'ok' = 'true', format('register_player: %s', v_reply);
  v_profile := v_reply -> 'data';
  assert v_profile ->> 'player_id' = v_id::text, format('player_id: %s', v_profile);
  assert v_profile ->> 'friendly_name' ~ '^[A-Z][a-z]+ [A-Z][a-z]+$', format('friendly name: %s', v_profile);
  assert exists (select 1 from private.name_parts n
                  where n.kind = 'adjective' and n.active and n.word = split_part(v_profile ->> 'friendly_name', ' ', 1))
     and exists (select 1 from private.name_parts n
                  where n.kind = 'animal' and n.active and n.word = split_part(v_profile ->> 'friendly_name', ' ', 2)),
    format('%s is not built from name_parts', v_profile ->> 'friendly_name');
  assert v_profile -> 'nickname' = 'null'::jsonb and v_profile -> 'age_band' = 'null'::jsonb, format('profile: %s', v_profile);
  assert (v_profile ->> 'created_at')::bigint = private.epoch_ms('2026-10-20T08:00:00Z'), format('created_at: %s', v_profile);
  assert v_profile ->> 'friendly_name' = private.friendly_name_for(v_id), 'the name is not the one the id picks';

  select * into v_cred from private.credentials c where c.player_id = v_id;
  assert (select count(*) from private.credentials c where c.player_id = v_id) = 1, 'one credential';
  assert v_cred.secret_hash = sha256(convert_to(v_secret, 'UTF8')), 'the credential is not sha256(secret)';
  assert v_cred.source = 'mint' and v_cred.created_at = '2026-10-20T08:00:00Z', format('credential: %s', v_cred);

  select * into v_player from private.players p where p.id = v_id;
  assert v_player.track = 'main' and not v_player.is_test and not v_player.low_trust, format('player: %s', v_player);
  assert v_player.first_context = 'in_app' and v_player.first_app = 'whatsapp', format('first context: %s', v_player);
  assert v_player.last_seen_at = '2026-10-20T08:00:00Z', 'registration did not record the call';

  assert not exists (
    select 1 from information_schema.columns c
     where c.table_schema = 'private' and c.table_name = 'players'
       and (c.column_name ~ '(secret|token|hash|code)' or c.data_type = 'bytea')),
    'private.players has a column that could hold a secret';

  for v_column in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'private' and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'character', 'jsonb', 'json', 'bytea', 'ARRAY')
  loop
    if v_column.data_type = 'bytea' then
      execute format('select exists (select 1 from private.%I x where position(%L::bytea in x.%I) > 0)',
                     v_column.table_name, convert_to(v_secret, 'UTF8'), v_column.column_name) into v_found;
    else
      execute format('select exists (select 1 from private.%I x where strpos(x.%I::text, %L) > 0)',
                     v_column.table_name, v_column.column_name, v_secret) into v_found;
    end if;
    assert not v_found, format('private.%s.%s holds the secret', v_column.table_name, v_column.column_name);
  end loop;
end
$$;
select 'PASS AC-IDN-02 the players table has no secret column and the stored credential is sha256(secret)';

-- A registered identity registers again idempotently; a known player with
-- another secret is auth_failed and changes nothing; get_profile answers
-- the same profile, and auth_failed for an unregistered id.
do $$
declare
  v_id uuid;
  v_secret text;
  v_other text;
  v_first jsonb;
  v_reply jsonb;
begin
  perform private.t_now('2026-10-20T09:00:00Z');
  perform private.t_request('198.51.100.62');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('register-again') t;
  select t.secret into v_other from private.t_player('register-again-other') t;

  v_first := public.register_player(v_id, v_secret, 'browser', 'none') -> 'data';
  perform private.t_now('2026-10-20T09:30:00Z');
  v_reply := public.register_player(v_id, v_secret, 'installed', 'none');
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' = v_first, format('a second registration: %s', v_reply);
  assert (select count(*) from private.players p where p.id = v_id) = 1, 'a second player row';
  assert (select p.first_context from private.players p where p.id = v_id) = 'browser', 'the first context changed';

  v_reply := public.register_player(v_id, v_other, 'browser', 'none');
  assert v_reply ->> 'code' = 'auth_failed', format('another secret for a known player: %s', v_reply);
  assert (select count(*) from private.credentials c where c.player_id = v_id) = 1, 'another secret added a credential';

  v_reply := public.get_profile(v_id, v_secret);
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' = v_first, format('get_profile: %s', v_reply);
  v_reply := public.get_profile((select t.player_id from private.t_player('register-never') t), v_secret);
  assert v_reply ->> 'code' = 'auth_failed', format('get_profile of an unknown id: %s', v_reply);
  v_reply := public.register_player(v_id, v_secret, 'browser', 'nope');
  assert v_reply ->> 'code' = 'invalid_input', format('an app outside its enum: %s', v_reply);
end
$$;
select 'PASS SQL-2 a registered identity registers again idempotently, and another secret is auth_failed';

-- Validation before anything is created: a v4 id, a 43-character
-- base64url secret, the context and app enums, and the size caps.
do $$
declare
  v_secret text := (select t.secret from private.t_player('register-validate') t);
  v_reply jsonb;
  v_case record;
begin
  perform private.t_now('2026-10-20T10:00:00Z');
  perform private.t_request('198.51.100.63');
  for v_case in
    select * from (values
      ('6f1d2c3b-4a5e-1f60-8a7b-9c8d7e6f5a4b'::uuid, v_secret, 'browser', 'none', 'invalid_input'),   -- not v4
      ('6f1d2c3b-4a5e-4f60-cb7b-9c8d7e6f5a4b', v_secret, 'browser', 'none', 'invalid_input'),         -- bad variant
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', v_secret, 'tv', 'none', 'invalid_input'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', v_secret, null, 'none', 'invalid_input'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', v_secret, 'browser', null, 'invalid_input'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', v_secret, repeat('x', 9000), 'none', 'invalid_input'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', left(v_secret, 42), 'browser', 'none', 'auth_failed'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', v_secret || 'A', 'browser', 'none', 'auth_failed'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', overlay(v_secret placing '+' from 5 for 1), 'browser', 'none', 'auth_failed'),
      ('6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b', null, 'browser', 'none', 'auth_failed'),
      (null, v_secret, 'browser', 'none', 'auth_failed')
    ) t(id, secret, context, app, want)
  loop
    v_reply := public.register_player(v_case.id, v_case.secret, v_case.context, v_case.app);
    assert v_reply ->> 'code' = v_case.want,
      format('register_player(%s, %s, %s, %s) = %s, want %s', v_case.id, left(v_case.secret, 6),
             left(v_case.context, 10), v_case.app, v_reply ->> 'code', v_case.want);
  end loop;
  assert not exists (select 1 from private.players p
                      where p.id in ('6f1d2c3b-4a5e-1f60-8a7b-9c8d7e6f5a4b', '6f1d2c3b-4a5e-4f60-cb7b-9c8d7e6f5a4b',
                                     '6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b')),
    'a refused registration created a player';
  assert not exists (select 1 from private.rate_counters r where r.bucket in ('identity_1m', 'identity_all_1h')
                        and r.window_start >= '2026-10-20T10:00:00Z' and r.window_start < '2026-10-20T11:00:00Z'),
    'a refused registration counted toward the identity limits';
end
$$;
select 'PASS SQL-2 registration refuses a non-v4 id, a malformed secret, unknown enums and oversized text';

-- Test identities (§8.17): the e2e track, never low trust, their own
-- buckets only.
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_player record;
begin
  perform private.t_now('2026-10-20T11:00:00Z');
  perform private.t_request('198.51.100.64');
  update private.config
     set value = '{"header": "x-forwarded-for", "hop": "first", "verified": false}'
   where key = 'client_ip';
  select t.player_id, t.secret into v_id, v_secret from private.t_player('register-test-id', true) t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'ok' = 'true', format('a test registration: %s', v_reply);
  select * into v_player from private.players p where p.id = v_id;
  assert v_player.is_test and v_player.track = 'e2e' and not v_player.low_trust,
    format('test player: is_test %s, track %s, low_trust %s', v_player.is_test, v_player.track, v_player.low_trust);
  assert (select r.hits from private.rate_counters r
           where r.bucket = 'identity_test_1h' and r.window_start = '2026-10-20T11:00:00Z'
             and r.subject = private.subject('identity_test_1h', 'ip:198.51.100.64', '2026-10-20T11:00:00Z')) = 1,
    'identity_test_1h did not count it';
  assert not exists (select 1 from private.rate_counters r
                      where r.bucket in ('identity_1m', 'identity_all_1h', 'identity_soft_1h', 'identity_soft_all_1h')
                        and r.window_start >= '2026-10-20T11:00:00Z' and r.window_start < '2026-10-20T12:00:00Z'),
    'a test registration counted in the main identity buckets';
end
$$;
select 'PASS SQL-2 test identities play the e2e track, count in their own buckets and are never low trust';

-- Two first writes racing on one id (§8.5 step 5). The insert of the
-- player is on conflict do nothing: the loser finds the winner's row, gives
-- back what it counted and authenticates as step 3. The race is staged
-- with a stand-in for create_player that lets the winner's write land
-- first, as a concurrent transaction committing would.
create or replace function private.create_player(
  p_player uuid, p_hash bytea, p_low_trust boolean, p_context text, p_app text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  insert into private.players (id, created_at, friendly_name, first_context, first_app)
  values (p_player, private.now(), 'Winner Wren', 'browser', 'none');
  insert into private.credentials (player_id, secret_hash, source)
  values (p_player, p_hash, 'mint');
  insert into private.players (id, created_at, friendly_name)
  values (p_player, private.now(), 'Loser Lynx')
  on conflict (id) do nothing;
  return found;
end
$$;
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_window timestamptz;
begin
  perform private.t_now('2026-10-20T12:00:30Z');
  perform private.t_request('198.51.100.65');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('register-race') t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'ok' = 'true', format('the loser of the race: %s', v_reply);
  assert v_reply -> 'data' ->> 'friendly_name' = 'Winner Wren', format('the loser saw %s', v_reply);
  assert (select count(*) from private.players p where p.id = v_id) = 1, 'the race created two players';
  assert (select count(*) from private.credentials c where c.player_id = v_id) = 1, 'the race added two credentials';
  v_window := private.window_start(private.now(), 60);
  assert coalesce((select r.hits from private.rate_counters r
                    where r.bucket = 'identity_1m' and r.window_start = v_window
                      and r.subject = private.subject('identity_1m', 'ip:198.51.100.65', v_window)), 0) = 0,
    'the loser kept its identity_1m hit';
  v_window := private.window_start(private.now(), 3600);
  assert coalesce((select r.hits from private.rate_counters r
                    where r.bucket = 'identity_all_1h' and r.window_start = v_window
                      and r.subject = private.subject('identity_all_1h', 'project', v_window)), 0) = 0,
    'the loser kept its identity_all_1h hit';
end
$$;
select 'PASS SQL-2 two concurrent first writes of one id create one player and count one registration';

rollback;
