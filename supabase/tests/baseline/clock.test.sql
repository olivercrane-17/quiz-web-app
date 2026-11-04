-- private.now() honors qz.now only for postgres sessions (ARCHITECTURE
-- §8.17; SQL-1). PostgREST sessions run as authenticator, so a client can
-- never move the clock that dates and scoring read.
begin;

do $$
begin
  assert session_user = 'postgres', 'the SQL tests run in a postgres session (MCP)';

  perform set_config('qz.now', '', true);
  assert private.now() = now(), 'without qz.now the clock is the transaction time';

  perform set_config('qz.now', '2026-11-01T23:59:30Z', true);
  assert private.now() = '2026-11-01T23:59:30Z'::timestamptz, 'qz.now was not honored for postgres';
  assert private.now_as('postgres') = '2026-11-01T23:59:30Z'::timestamptz, 'now_as(postgres) ignored qz.now';

  -- Every other session user keeps the real time, whatever qz.now says.
  assert private.now_as('authenticator') = now(), 'qz.now reached an authenticator (PostgREST) session';
  assert private.now_as('anon') = now(), 'qz.now reached an anon session';
  assert private.now_as('service_role') = now(), 'qz.now reached a service_role session';
  assert private.now_as('supabase_admin') = now(), 'qz.now reached a supabase_admin session';

  -- The decision reads the session user, which no role switch changes.
  assert pg_catalog.pg_get_functiondef('private.now()'::regprocedure) like '%private.now_as(session_user)%',
    'private.now() no longer passes session_user to now_as';
end
$$;
select 'PASS SQL-1 private.now() honors qz.now only for postgres sessions';

do $$
begin
  assert private.t_now('2026-12-31T12:00:00.5Z') = '2026-12-31T12:00:00.5Z'::timestamptz,
    't_now does not move private.now()';
  insert into private.alerts (kind, detail) values ('t_clock', '{}');
  assert (select a.at from private.alerts a where a.kind = 't_clock') = '2026-12-31T12:00:00.5Z'::timestamptz,
    'column defaults do not call private.now()';
  assert private.epoch_ms('1970-01-01T00:00:01.5Z') = 1500, 'epoch_ms of 1.5 s';
  assert private.epoch_ms('2026-11-01T10:00:00.250Z') = 1793527200250, 'epoch_ms of a Daily morning';
end
$$;
select 'PASS SQL-1 t_now moves the clock, and column defaults read it';

rollback;
