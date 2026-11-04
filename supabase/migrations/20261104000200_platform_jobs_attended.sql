-- SQL-1 (ARCHITECTURE §8.15): the full bodies of SQL-1's own scheduled-job
-- steps, which delete expired rows.
--
-- ATTENDED: apply this file only when someone can answer the Supabase MCP's
-- confirmation. The MCP asks a human to confirm any SQL holding a DELETE,
-- even one with a narrow WHERE inside a function body, so this file cannot
-- apply unattended (supabase/README.md, "Attended migrations"). Nothing here
-- deletes anything when it is applied: it only replaces the two unattended
-- versions that 20261104000100_helpers.sql created, and pg_cron starts
-- calling them once SQL-8 schedules the jobs. Until this file is applied,
-- those versions fold refusals, retire old salts and add zone names, and
-- the hourly one leaves a daily owner_queue alert, because counters, write
-- keys and error rows are not pruned.
--
-- Every DELETE names the rows it removes with a WHERE on time, and each
-- table it touches is one whose retention §8.1 and §8.15 fix: salts after
-- 48 hours, counters after 2 days, write keys after 48 hours, caught errors
-- after 30 days, heartbeats and cron.job_run_details after 7 days, and zone
-- names tzdata no longer lists. Each body carries the comment "attended
-- body", which the tests read to tell it from the unattended version.

-- SQL-1's hourly step: refusals folded first, then salts for days before
-- yesterday, counters older than 2 days, write keys older than 48 hours and
-- rpc_errors rows older than 30 days pruned, and cron.job_run_details and
-- heartbeats (once SQL-8 creates them) kept to 7 days.
create or replace function private.hourly_platform()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_today date := (v_now at time zone 'UTC')::date;
begin
  -- attended body: 20261104000200_platform_jobs_attended
  perform private.fold_refusals(v_now);
  delete from private.ip_salts s where s.day < v_today - 1;
  delete from private.rate_counters r where r.window_start < v_now - interval '2 days';
  delete from private.write_keys k where k.created_at < v_now - interval '48 hours';
  delete from private.rpc_errors e where e.at < v_now - interval '30 days';
  if to_regclass('private.heartbeats') is not null then
    delete from private.heartbeats h where h.ts < v_now - interval '7 days';
  end if;
  if to_regclass('cron.job_run_details') is not null then
    begin
      delete from cron.job_run_details d where d.end_time < v_now - interval '7 days';
    exception
      when insufficient_privilege then
        -- SQL-8's grant on cron's tables has not been made yet.
        null;
    end;
  end if;
end
$$;

-- SQL-1's nightly step: time_zones follows pg_timezone_names (§8.7). A
-- catalog that comes back nearly empty is ignored rather than copied.
create or replace function private.nightly_platform()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  -- attended body: 20261104000200_platform_jobs_attended
  if (select count(*) from pg_catalog.pg_timezone_names) < 100 then
    raise exception 'nightly_platform: pg_timezone_names looks broken';
  end if;
  insert into private.time_zones (name)
  select z.name from pg_catalog.pg_timezone_names z
  on conflict (name) do nothing;
  delete from private.time_zones t
   where not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = t.name);
end
$$;
