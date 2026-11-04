-- SQL-2 (ARCHITECTURE §8.4, §8.15, §8.17): the identity work that removes
-- rows.
--
-- ATTENDED: apply this file only when someone can answer the Supabase
-- MCP's confirmation, which any DELETE triggers, even one with a narrow
-- WHERE inside a function body (supabase/README.md, "Attended migrations").
-- Nothing here removes anything when it is applied. It adds
-- private.purge_player and replaces two unattended versions that
-- 20261104000400_identity.sql created:
--
--   * public.delete_player removes the caller's player and everything kept
--     under its id (AC-DAT-02). Until this file lands it answers
--     unavailable.
--   * private.nightly_players removes test players older than a day
--     (§8.17). Until this file lands they stay, with a daily owner_queue
--     alert.
--
-- Every DELETE names its rows by player id or by a test player's age.
-- Each body carries the comment "attended body", which the tests read to
-- tell it from the unattended version.

-- Removes one player and everything kept under its id, each step an index
-- lookup (§8.4 delete_player). The purge hooks clear the rows no foreign
-- key cascades (SQL-9 reports, hearts and practice bitsets; SQL-10 events;
-- SQL-12 the admin handover), then the player's write keys go, then the
-- player row, which cascades to credentials, the sync code, the claim and
-- every later table that references players with on delete cascade.
-- Attempts keep their rows with player_id set to null (§8.3).
create or replace function private.purge_player(p_player uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  -- attended body: 20261104000500_identity_attended
  perform private.purge_player_reports(p_player);
  perform private.purge_player_events(p_player);
  perform private.purge_player_groups(p_player);
  delete from private.write_keys k where k.player_id = p_player;
  delete from private.players p where p.id = p_player;
end
$$;

-- Deletes the caller's data for good (PRD §3.10.7, §9.7). {}.
create or replace function public.delete_player(p_player uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
begin
  -- attended body: 20261104000500_identity_attended
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  begin
    perform private.purge_player(v_auth.player_id);
    return private.ok();
  exception
    when others then
      return private.fail_internal('delete_player', sqlstate, sqlerrm);
  end;
end
$$;

-- Removes test players older than a day, at most 2,000 a night so the job
-- stays short; any left over go the next night. Expired claims need
-- nothing (each player's one claim row is overwritten). While the
-- client-address rule is unverified, one owner_queue alert a day says so,
-- and what a forged hop can still do; the flag itself changes no limit.
create or replace function private.nightly_players()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_player uuid;
begin
  -- attended body: 20261104000500_identity_attended
  for v_player in
    select p.id
      from private.players p
     where p.is_test and p.created_at < v_now - interval '1 day'
     order by p.created_at
     limit 2000
  loop
    perform private.purge_player(v_player);
  end loop;
  if not private.client_ip_verified() then
    perform private.alert_once('owner_queue', 'client_ip_unverified',
      jsonb_build_object('why', 'The client-ip contract test has not verified the hop rule in private.config.client_ip. '
        || 'Until it does and "verified": true is set, a client that forges the hop escapes the per-address limits '
        || 'up to the project-wide bounds and can spend another address''s, so nothing may weigh players by '
        || 'low trust or by distinct addresses (ARCHITECTURE §8.6, CI-0, supabase/README.md section 9).'),
      date_trunc('day', v_now, 'UTC'));
  end if;
end
$$;
