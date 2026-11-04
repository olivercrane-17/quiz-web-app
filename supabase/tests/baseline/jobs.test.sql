-- The scheduled-job bodies (ARCHITECTURE §8.15; SQL-1): every hook other
-- tickets fill runs as a no-op, every job body runs, and a failing step
-- rolls back alone with an owner alert. SQL-1's own pruning steps are
-- tested in supabase/tests/platform-jobs/ with their attended migration.
begin;

-- The hook bodies run as no-ops: calling every hook another ticket fills
-- changes no row anywhere in private, and every job body runs with no step
-- failing.
do $$
declare
  v_table text;
  v_count bigint;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_hook text;
  v_failed bigint := (select count(*) from private.alerts a where a.kind = 'job_step_failed');
begin
  perform private.t_now('2026-11-01T03:17:00Z');
  for v_table in
    select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relkind in ('r', 'p') order by c.relname
  loop
    execute format('select count(*) from private.%I', v_table) into v_count;
    v_before := v_before || jsonb_build_object(v_table, v_count);
  end loop;

  foreach v_hook in array array[
    'hourly_attempts', 'hourly_results', 'hourly_ops',
    'nightly_players', 'nightly_attempts', 'nightly_results', 'nightly_reports',
    'nightly_analytics', 'nightly_rooms', 'nightly_quizzes',
    'weekly_calibration', 'rooms_sweep_lobby', 'rooms_sweep_game', 'publish']
  loop
    assert to_regprocedure(format('private.%I()', v_hook)) is not null, format('hook private.%s() is missing', v_hook);
    execute format('select private.%I()', v_hook);
  end loop;

  for v_table in
    select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relkind in ('r', 'p') order by c.relname
  loop
    execute format('select count(*) from private.%I', v_table) into v_count;
    v_after := v_after || jsonb_build_object(v_table, v_count);
  end loop;
  assert v_before = v_after, format('a no-op hook changed rows: %s -> %s', v_before, v_after);

  perform private.hourly();
  perform private.nightly();
  perform private.weekly();
  perform private.rooms_sweep();
  perform private.publish();
  assert (select count(*) from private.alerts a where a.kind = 'job_step_failed') = v_failed, 'a job step failed';
end
$$;
select 'PASS SQL-1 the hook bodies run as no-ops';

-- A failing step rolls back alone and leaves an alert; the job goes on.
do $$
declare
  v_alert jsonb;
begin
  perform private.t_now('2026-11-01T10:13:00Z');
  create function private.t_failing_step() returns void
    language plpgsql volatile set search_path = ''
    as $f$ begin insert into private.alerts (kind, detail) values ('t_partial', '{}'); perform 1 / 0; end $f$;
  assert not private.run_job_step('t_job', 't_failing_step'), 'run_job_step reported success';
  assert not exists (select 1 from private.alerts a where a.kind = 't_partial'), 'the failed step''s work stayed';
  select a.detail into v_alert from private.alerts a
   where a.kind = 'job_step_failed' and a.detail ->> 'job' = 't_job';
  assert v_alert ->> 'job' = 't_job' and v_alert ->> 'step' = 't_failing_step' and v_alert ->> 'sqlstate' = '22012',
    format('alert: %s', v_alert);
  assert private.run_job_step('t_job', 'hourly_ops'), 'a later step still runs';
  begin
    perform private.run_job_step('t_job', 'x; select 1');
    raise exception 'run_job_step accepted a step that is not a name';
  exception
    when raise_exception then
      if sqlerrm not like 'run_job_step:%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-1 a failing job step rolls back alone and alerts the owner';

rollback;
