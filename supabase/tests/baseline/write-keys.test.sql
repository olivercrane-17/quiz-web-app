-- Write keys (ARCHITECTURE §8.6; SQL-1): a repeated client id returns the
-- first result, the same id from another function or player is conflict,
-- and an unfinished claim is taken over. Each creating RPC's own table-
-- driven test (same key twice, one row) lands with that RPC.
begin;

do $$
declare
  v_key uuid := '0b6f4e0a-1c2d-4e3f-8a9b-0c1d2e3f4a5b';
  v_player uuid := (select t.player_id from private.t_player('write-keys') t);
  v_other uuid := (select t.player_id from private.t_player('write-keys-other') t);
  v_env jsonb;
begin
  perform private.t_now('2026-11-01T15:00:00Z');

  assert private.write_key_claim(v_key, 'create_challenge', v_player) is null, 'a new key is claimed';
  v_env := private.write_key_finish(v_key, '{"code": "AB12CD34"}');
  assert v_env ->> 'ok' = 'true' and v_env -> 'data' = '{"code": "AB12CD34"}', format('finish answers: %s', v_env);

  v_env := private.write_key_claim(v_key, 'create_challenge', v_player);
  assert v_env ->> 'ok' = 'true' and v_env -> 'data' = '{"code": "AB12CD34"}', format('a repeat returns the first result: %s', v_env);
  assert (select count(*) from private.write_keys k where k.client_id = v_key) = 1, 'one row per key';

  v_env := private.write_key_claim(v_key, 'create_group', v_player);
  assert v_env ->> 'code' = 'conflict', format('another function: %s', v_env);
  v_env := private.write_key_claim(v_key, 'create_challenge', v_other);
  assert v_env ->> 'code' = 'conflict', format('another player: %s', v_env);
  v_env := private.write_key_claim(v_key, 'create_challenge', null);
  assert v_env ->> 'code' = 'conflict', format('no player: %s', v_env);

  assert private.write_key_claim(null, 'create_challenge', v_player) ->> 'code' = 'invalid_input', 'a missing key';

  -- A call that claimed a key and never finished leaves result null; the
  -- next call with that key takes it over.
  assert private.write_key_claim('9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', 'save_quiz', v_player) is null, 'claimed';
  assert private.write_key_claim('9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', 'save_quiz', v_player) is null, 'taken over';

  begin
    perform private.write_key_finish('9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', '"a string"');
    raise exception 'write_key_finish stored data that is not an object';
  exception
    when raise_exception then
      if sqlerrm not like 'write_key_finish:%' then
        raise;
      end if;
  end;
  begin
    perform private.write_key_finish('5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b', '{}');
    raise exception 'write_key_finish accepted a key nobody claimed';
  exception
    when raise_exception then
      if sqlerrm not like 'write_key_finish:%' then
        raise;
      end if;
  end;

  assert (select k.created_at from private.write_keys k where k.client_id = v_key) = '2026-11-01T15:00:00Z',
    'created_at reads private.now()';
end
$$;
select 'PASS SQL-1 write keys return the first result and refuse reuse by another call';

rollback;
