-- SQL-1 (ARCHITECTURE §8.15): the bodies of SQL-1's own scheduled-job
-- steps, which delete expired rows.
--
-- ATTENDED: apply this file only when someone can answer the Supabase MCP's
-- confirmation. The MCP asks a human to confirm any SQL holding a DELETE,
-- even one with a narrow WHERE inside a function body, so this file cannot
-- apply unattended (supabase/README.md, "Attended migrations"). Nothing here
-- deletes anything when it is applied: it only replaces two placeholders
-- that 20261104000100_helpers.sql created, and pg_cron starts calling them
-- once SQL-8 schedules the jobs. Until this file is applied, the hourly and
-- nightly jobs simply skip SQL-1's pruning.
--
-- Every DELETE names the rows it removes with a WHERE on time, and each
-- table it touches is one whose retention §8.1 and §8.15 fix: salts after
-- 48 hours, counters after 2 days, write keys after 48 hours, heartbeats and
-- cron.job_run_details after 7 days, and zone names tzdata no longer lists.

-- SQL-1's hourly step: refusals folded first, then salts for days before
-- yesterday, counters older than 2 days and write keys older than 48 hours
-- pruned, and cron.job_run_details and heartbeats (once SQL-8 creates them)
-- kept to 7 days.
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
  perform private.fold_refusals(v_now);
  delete from private.ip_salts s where s.day < v_today - 1;
  delete from private.rate_counters r where r.window_start < v_now - interval '2 days';
  delete from private.write_keys k where k.created_at < v_now - interval '48 hours';
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
