-- The scheduled-job bodies (ARCHITECTURE §8.15; SQL-1): every hook other
-- tickets fill runs as a no-op until its ticket fills it, and without
-- failing after; SQL-1's own steps fold refusals, retire old salts and add
-- zone names, in their unattended form or once
-- 20261104000200_platform_jobs_attended.sql is applied; every job body runs;
-- and a failing step rolls back alone with an owner alert. The attended
-- pruning itself is tested in supabase/tests/platform-jobs/.
begin;

-- A hook still holding its no-op body changes no row anywhere in private.
-- A hook its ticket has filled may change rows, so it only has to run
-- through run_job_step without failing. Then every job body runs with no
-- step failing.
do $$
declare
  v_table text;
  v_count bigint;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_hook text;
  v_noop text[] := '{}';
  v_filled text[] := '{}';
  v_last_alert bigint := coalesce((select max(a.id) from private.alerts a), 0);
begin
  perform private.t_now('2026-11-01T03:17:00Z');
  foreach v_hook in array array[
    'hourly_attempts', 'hourly_results', 'hourly_ops',
    'nightly_players', 'nightly_attempts', 'nightly_results', 'nightly_reports',
    'nightly_analytics', 'nightly_rooms', 'nightly_quizzes',
    'weekly_calibration', 'rooms_sweep_lobby', 'rooms_sweep_game', 'publish']
  loop
    assert to_regprocedure(format('private.%I()', v_hook)) is not null, format('hook private.%s() is missing', v_hook);
    if btrim(regexp_replace(
         (select p.prosrc from pg_catalog.pg_proc p where p.oid = to_regprocedure(format('private.%I()', v_hook))),
         '\s+', ' ', 'g')) = 'begin null; end' then
      v_noop := v_noop || v_hook;
    else
      v_filled := v_filled || v_hook;
    end if;
  end loop;

  for v_table in
    select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relkind in ('r', 'p') order by c.relname
  loop
    execute format('select count(*) from private.%I', v_table) into v_count;
    v_before := v_before || jsonb_build_object(v_table, v_count);
  end loop;
  foreach v_hook in array v_noop loop
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

  foreach v_hook in array v_filled loop
    if not private.run_job_step('t_jobs', v_hook) then
      raise exception 'the filled hook private.%() failed: %', v_hook,
        (select a.detail from private.alerts a where a.kind = 'job_step_failed' order by a.id desc limit 1);
    end if;
  end loop;

  perform private.hourly();
  perform private.nightly();
  perform private.weekly();
  perform private.rooms_sweep();
  perform private.publish();
  assert not exists (select 1 from private.alerts a where a.id > v_last_alert and a.kind = 'job_step_failed'),
    format('a job step failed: %s', (select string_agg(a.detail::text, '; ') from private.alerts a
                                      where a.id > v_last_alert and a.kind = 'job_step_failed'));
end
$$;
select 'PASS SQL-1 the hook bodies run as no-ops until filled, and every job body runs';

-- SQL-1's own steps. hourly_platform folds each ended window's refusals
-- once and retires the salts of days before yesterday (the unattended
-- version replaces them with fresh bytes, the attended one deletes them),
-- keeping yesterday's and today's. While it is the unattended version it
-- also leaves one owner_queue alert a day naming the attended migration.
-- nightly_platform adds the zone names tzdata lists.
do $$
declare
  v_old bytea;
  v_yesterday bytea;
  v_today bytea;
  v_alerts bigint;
  v_last_alert bigint := coalesce((select max(a.id) from private.alerts a), 0);
  v_attended boolean :=
    pg_catalog.pg_get_functiondef('private.hourly_platform()'::regprocedure) like '%attended body%';
begin
  perform private.t_now('2026-11-01T08:00:00Z');
  perform private.hit_ip('t_platform_1h', '198.51.100.40', 3600, 0);
  perform private.t_now('2026-11-02T08:00:00Z');
  perform private.hit_ip('t_platform_1h', '198.51.100.40', 3600, 0);
  perform private.t_now('2026-11-03T08:00:00Z');
  perform private.hit_ip('t_platform_1h', '198.51.100.40', 3600, 0);
  v_old := (select s.salt from private.ip_salts s where s.day = '2026-11-01');
  v_yesterday := (select s.salt from private.ip_salts s where s.day = '2026-11-02');
  v_today := (select s.salt from private.ip_salts s where s.day = '2026-11-03');
  assert v_old is not null and v_yesterday is not null and v_today is not null, 'setup: three day salts';

  perform private.t_now('2026-11-03T09:13:00Z');
  assert private.run_job_step('hourly', 'hourly_platform'), 'hourly_platform failed';
  assert private.run_job_step('hourly', 'hourly_platform'), 'hourly_platform failed on its second run';
  assert not exists (select 1 from private.ip_salts s where s.day = '2026-11-01' and s.salt = v_old),
    'the salt of the day before yesterday survived';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-02' and s.salt = v_yesterday),
    'yesterday''s salt changed';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-03' and s.salt = v_today),
    'today''s salt changed';
  assert (select sum(a.value) from private.daily_aggregates a
           where a.metric = 'rate_limited' and a.dims = 'bucket=t_platform_1h') = 3,
    'each ended window''s refusal was not folded exactly once';

  if not v_attended then
    select count(*) into v_alerts from private.alerts a
     where a.id > v_last_alert and a.kind = 'owner_queue'
       and a.detail ->> 'item' = '20261104000200_platform_jobs_attended';
    assert v_alerts = 1, format('owner_queue alerts on one day: %s, want 1', v_alerts);
    perform private.t_now('2026-11-04T00:13:00Z');
    perform private.hourly_platform();
    select count(*) into v_alerts from private.alerts a
     where a.id > v_last_alert and a.kind = 'owner_queue'
       and a.detail ->> 'item' = '20261104000200_platform_jobs_attended';
    assert v_alerts = 2, format('owner_queue alerts over two days: %s, want 2', v_alerts);
  end if;

  update private.time_zones set name = 'Qz/Gone' where name = 'Europe/London';
  assert private.valid_tz('Europe/London') is null, 'setup: Europe/London is gone';
  assert private.run_job_step('nightly', 'nightly_platform'), 'nightly_platform failed';
  assert private.valid_tz('Europe/London') = 'Europe/London', 'a zone that tzdata lists was not added back';
end
$$;
select 'PASS SQL-1 the platform steps fold refusals, retire salts before yesterday and add zone names';

-- A failing step rolls back alone and leaves an alert; the job goes on.
do $$
declare
  v_alert jsonb;
begin
  perform private.t_now('2026-11-01T10:13:00Z');
  create function private.t_failing_step() returns void
    language plpgsql volatile set search_path = ''
    as $f$ begin insert into private.alerts (kind, detail) values ('t_partial', '{}'); perform 1 / 0; end $f$;
  create function private.t_passing_step() returns void
    language plpgsql volatile set search_path = ''
    as $f$ begin insert into private.alerts (kind, detail) values ('t_passed', '{}'); end $f$;
  assert not private.run_job_step('t_job', 't_failing_step'), 'run_job_step reported success';
  assert not exists (select 1 from private.alerts a where a.kind = 't_partial'), 'the failed step''s work stayed';
  select a.detail into v_alert from private.alerts a
   where a.kind = 'job_step_failed' and a.detail ->> 'job' = 't_job';
  assert v_alert ->> 'job' = 't_job' and v_alert ->> 'step' = 't_failing_step' and v_alert ->> 'sqlstate' = '22012',
    format('alert: %s', v_alert);
  assert private.run_job_step('t_job', 't_passing_step'), 'a later step still runs';
  assert exists (select 1 from private.alerts a where a.kind = 't_passed'), 'the later step''s work was lost';
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
