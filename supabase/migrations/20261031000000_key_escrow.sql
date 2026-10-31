-- CNT-0 (ARCHITECTURE §5.4): escrow for the content master key.
--
-- The key itself is inserted by the orchestrator through MCP execute_sql and is
-- never written to the repository. Only the postgres role can read this table.
--
-- Least privilege by construction, with no REVOKE or DROP statements (the
-- Supabase MCP asks a human to confirm those, and migrations must apply
-- unattended):
--   * A new schema grants USAGE to nobody but its owner, so anon,
--     authenticated and service_role cannot reach anything inside it.
--   * The private schema is not in PostgREST's exposed schemas.
--   * RLS is on with a restrictive deny-all policy as defence in depth.
--   * No GRANT is ever issued on this table.

create schema if not exists private;

create table if not exists private.key_escrow (
  kid text primary key,
  key bytea not null,
  created_at timestamptz not null default now()
);

alter table private.key_escrow enable row level security;

create policy key_escrow_deny_all on private.key_escrow
  as restrictive for all to public
  using (false) with check (false);
