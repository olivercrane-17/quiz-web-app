-- SQL-1's own job steps (ARCHITECTURE §8.15), from the attended migration
-- 20261104000200_platform_jobs_attended.sql: the hourly step folds refusals
-- and then prunes, and the nightly step follows tzdata. sql:bundle skips
-- this file unless that migration is in the bundle or already applied:
--   npm run sql:bundle -- --all --attended --applied list_migrations.json
-- requires: 20261104000200_platform_jobs_attended
begin;

do $$
begin
  assert pg_catalog.pg_get_functiondef('private.hourly_platform()'::regprocedure) like '%attended body%',
    'private.hourly_platform() is still the unattended version: apply 20261104000200_platform_jobs_attended.sql';
  assert pg_catalog.pg_get_functiondef('private.nightly_platform()'::regprocedure) like '%attended body%',
    'private.nightly_platform() is still the unattended version: apply 20261104000200_platform_jobs_attended.sql';
end
$$;
select 'PASS SQL-1 the attended migration replaced both unattended platform steps';

-- hourly_platform prunes salts before yesterday, counters older than 2
-- days, write keys older than 48 hours and caught errors older than 30
-- days, after folding the counters' refusals.
do $$
declare
  v_player uuid := (select t.player_id from private.t_player('jobs-prune') t);
  v_last_alert bigint := coalesce((select max(a.id) from private.alerts a), 0);
  v_old_ref text;
  v_new_ref text;
begin
  update private.config
     set value = value || '{"rpc_errors_1h": {"cap": 1000, "window_s": 3600}}'
   where key = 'limits';
  perform private.t_now('2026-10-02T08:00:00Z');
  v_old_ref := private.log_error('t_prune', 'XX000', 'an old error');
  perform private.t_now('2026-11-01T08:00:00Z');
  perform private.hit_ip('t_prune_1h', '198.51.100.21', 3600, 0);
  perform private.write_key_claim('3c2b1a0f-9e8d-4c7b-8a6f-5e4d3c2b1a0f', 'create_group', v_player);
  perform private.t_now('2026-11-02T08:00:00Z');
  perform private.hit_ip('t_prune_1h', '198.51.100.21', 3600, 0);
  v_new_ref := private.log_error('t_prune', 'XX000', 'a recent error');
  perform private.t_now('2026-11-03T08:30:00Z');
  perform private.hit_ip('t_prune_1h', '198.51.100.21', 3600, 0);
  perform private.write_key_claim('4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a', 'create_group', v_player);
  assert (select count(*) from private.ip_salts s where s.day between '2026-11-01' and '2026-11-03') = 3, 'three day salts';

  perform private.t_now('2026-11-03T09:13:00Z');
  perform private.hourly();
  assert not exists (select 1 from private.alerts a where a.id > v_last_alert and a.kind = 'job_step_failed'),
    'hourly failed a step';
  assert not exists (select 1 from private.ip_salts s where s.day = '2026-11-01'), 'the salt of the day before yesterday stayed';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-02'), 'yesterday''s salt was pruned';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-03'), 'today''s salt was pruned';
  assert (select count(*) from private.rate_counters r where r.bucket = 't_prune_1h') = 2,
    'counters older than 2 days were kept, or newer ones pruned';
  assert not exists (select 1 from private.write_keys k where k.client_id = '3c2b1a0f-9e8d-4c7b-8a6f-5e4d3c2b1a0f'),
    'a write key older than 48 hours was kept';
  assert exists (select 1 from private.write_keys k where k.client_id = '4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a'),
    'a fresh write key was pruned';
  assert not exists (select 1 from private.rpc_errors e where e.ref = v_old_ref), 'an error older than 30 days was kept';
  assert exists (select 1 from private.rpc_errors e where e.ref = v_new_ref), 'a recent error was pruned';
  assert (select sum(a.value) from private.daily_aggregates a where a.dims = 'bucket=t_prune_1h') = 3,
    'refusals were pruned before they were folded';
  assert not exists (select 1 from private.alerts a where a.id > v_last_alert and a.kind = 'owner_queue'),
    'the attended step still asks the owner to apply itself';
end
$$;
select 'PASS SQL-1 hourly_platform folds refusals, then prunes salts, counters, write keys and old errors';

-- nightly_platform keeps time_zones equal to pg_timezone_names.
do $$
begin
  update private.time_zones set name = 'Qz/Gone' where name = 'Europe/London';
  assert private.valid_tz('Europe/London') is null and private.valid_tz('Qz/Gone') is not null, 'setup';
  perform private.nightly_platform();
  assert private.valid_tz('Europe/London') = 'Europe/London', 'a zone that tzdata lists was not added back';
  assert private.valid_tz('Qz/Gone') is null, 'a zone that tzdata no longer lists stayed';
  assert (select count(*) from private.time_zones) = (select count(*) from pg_catalog.pg_timezone_names),
    'time_zones differs from pg_timezone_names';
end
$$;
select 'PASS SQL-1 nightly_platform refreshes time_zones from pg_timezone_names';

rollback;
