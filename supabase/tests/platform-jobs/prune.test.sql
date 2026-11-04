-- SQL-1's own job steps (ARCHITECTURE §8.15), from the attended migration
-- 20261104000200_platform_jobs_attended.sql: the hourly step folds refusals
-- and then prunes, and the nightly step follows tzdata. Bundle it with
--   npm run sql:bundle -- --attended --area baseline --area platform-jobs \
--     --after <last applied migration>
begin;

do $$
begin
  assert pg_catalog.pg_get_functiondef('private.hourly_platform()'::regprocedure) like '%fold_refusals%',
    'private.hourly_platform() is still the placeholder: apply 20261104000200_platform_jobs_attended.sql';
  assert pg_catalog.pg_get_functiondef('private.nightly_platform()'::regprocedure) like '%pg_timezone_names%',
    'private.nightly_platform() is still the placeholder: apply 20261104000200_platform_jobs_attended.sql';
end
$$;
select 'PASS SQL-1 the attended migration replaced both platform placeholders';

-- hourly_platform prunes salts before yesterday, counters older than 2
-- days and write keys older than 48 hours, after folding their refusals.
do $$
declare
  v_player uuid := (select t.player_id from private.t_player('jobs-prune') t);
  v_failed bigint := (select count(*) from private.alerts a where a.kind = 'job_step_failed');
begin
  perform private.t_now('2026-11-01T08:00:00Z');
  perform private.hit_ip('t_prune_1h', '198.51.100.21', 3600, 0);
  perform private.write_key_claim('3c2b1a0f-9e8d-4c7b-8a6f-5e4d3c2b1a0f', 'create_group', v_player);
  perform private.t_now('2026-11-02T08:00:00Z');
  perform private.hit_ip('t_prune_1h', '198.51.100.21', 3600, 0);
  perform private.t_now('2026-11-03T08:30:00Z');
  perform private.hit_ip('t_prune_1h', '198.51.100.21', 3600, 0);
  perform private.write_key_claim('4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a', 'create_group', v_player);
  assert (select count(*) from private.ip_salts s where s.day between '2026-11-01' and '2026-11-03') = 3, 'three day salts';

  perform private.t_now('2026-11-03T09:13:00Z');
  perform private.hourly();
  assert (select count(*) from private.alerts a where a.kind = 'job_step_failed') = v_failed, 'hourly failed a step';
  assert not exists (select 1 from private.ip_salts s where s.day = '2026-11-01'), 'the salt of the day before yesterday stayed';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-02'), 'yesterday''s salt was pruned';
  assert exists (select 1 from private.ip_salts s where s.day = '2026-11-03'), 'today''s salt was pruned';
  assert (select count(*) from private.rate_counters r where r.bucket = 't_prune_1h') = 2,
    'counters older than 2 days were kept, or newer ones pruned';
  assert not exists (select 1 from private.write_keys k where k.client_id = '3c2b1a0f-9e8d-4c7b-8a6f-5e4d3c2b1a0f'),
    'a write key older than 48 hours was kept';
  assert exists (select 1 from private.write_keys k where k.client_id = '4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a'),
    'a fresh write key was pruned';
  assert (select sum(a.value) from private.daily_aggregates a where a.dims = 'bucket=t_prune_1h') = 3,
    'refusals were pruned before they were folded';
end
$$;
select 'PASS SQL-1 hourly_platform folds refusals, then prunes salts, counters and write keys';

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
