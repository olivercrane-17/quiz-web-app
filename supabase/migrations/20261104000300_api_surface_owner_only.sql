-- OWNER ONLY. Never applied by agents or by the integrator: it needs a
-- confirmation that only the project owner can give, so it is a launch
-- report item (supabase/README.md, "Owner-only migrations").
--
-- SQL-1 (ARCHITECTURE §8.2). The baseline reaches §8.2's guarantees by
-- construction: no table in public, only allowlisted SECURITY DEFINER RPCs
-- there, and pg_graphql not installed. These two statements are the extra
-- hardening §8.2 asks for, and both change something that already exists:
--
--   1. pg_graphql is not installed today, so the first statement does
--      nothing. It is the guard for a project where someone enabled the
--      extension from the dashboard: /graphql/v1 would then reach every
--      anon-executable RPC, and one request could alias many mutations past
--      a per-request cap (lint 0028). The standing checks fail while it is
--      installed.
--   2. pgrst.openapi_mode = 'disabled' stops GET /rest/v1/ from listing
--      every RPC with its parameters. The backend-contract workflow checks
--      the root with the publishable key; apply this when that check fails
--      (or before marketing launch either way).
--
-- How to apply: in the dashboard SQL editor (or MCP execute_sql with the
-- owner confirming), run the file as one statement batch, then re-run the
-- backend-contract workflow. Record it with apply_migration only if it was
-- applied that way, so `npm run sql:drift` stays accurate.

drop extension if exists pg_graphql;

alter role authenticator set pgrst.openapi_mode = 'disabled';

notify pgrst, 'reload config';
