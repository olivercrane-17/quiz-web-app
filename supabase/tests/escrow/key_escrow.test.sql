-- CNT-0 (ARCHITECTURE §5.4, §8.2, §8.17): the content-key escrow table.
--
-- Run it through the Supabase MCP execute_sql tool, as one call, on the live
-- project, after migration 20261031000000_key_escrow (applied; this file never
-- re-applies it). It is one transaction that ends in rollback, so nothing
-- persists, and it runs none of the statements 01-ENGINEERING-CONSTRAINTS.md
-- keeps out of unattended SQL. A failed assert raises, so the call reports
-- the failure and never reaches the PASS lines. On success it reaches one
-- `select 'PASS ...';` line per check, the form supabase/README.md §5 sets,
-- so a dry run built by `npm run sql:bundle` (README §6) returns them all,
-- while a call with this file alone shows only the last.
--
-- It never touches a real key. Check 5 inserts a throwaway key (the bytes 0 to
-- 31, the same one src/content/pipeline/sealed-safety.test.ts restores) under
-- kid 'test-cnt0', which is no real kid, reads it back with the recovery query
-- of content/sealed/README.md, and the final rollback removes it.

begin;

-- Guard for check 5. SET LOCAL outside a transaction block changes nothing,
-- so if the begin above were ever lost, check 5 would stop before inserting.
set local qz.cnt0_escrow_test = 'in-transaction';

-- 1. The table and its schema, as the migration made them.
do $$
declare
  t oid := to_regclass('private.key_escrow');
begin
  assert t is not null,
    'private.key_escrow is missing (migration 20261031000000_key_escrow)';
  assert (select relkind from pg_class where oid = t) = 'r',
    'private.key_escrow is not a plain table';
  assert (select nspowner::regrole::text from pg_namespace where nspname = 'private') = 'postgres',
    'schema private is not owned by postgres';
  assert (select relowner::regrole::text from pg_class where oid = t) = 'postgres',
    'private.key_escrow is not owned by postgres (ARCHITECTURE §8.2 rule 7)';
  assert (
    select string_agg(
      format('%s %s%s', attname, format_type(atttypid, atttypmod), case when attnotnull then ' not null' else '' end),
      ', ' order by attnum)
    from pg_attribute
    where attrelid = t and attnum > 0 and not attisdropped
  ) = 'kid text not null, key bytea not null, created_at timestamp with time zone not null',
    'private.key_escrow columns differ from the migration';
  assert (select pg_get_constraintdef(oid) from pg_constraint where conrelid = t and contype = 'p') = 'PRIMARY KEY (kid)',
    'private.key_escrow is not keyed by kid';
end $$;

-- 2. Row level security on, not forced, and the one deny-all policy.
do $$
declare
  t oid := 'private.key_escrow'::regclass;
begin
  assert (select relrowsecurity from pg_class where oid = t),
    'row level security is off on private.key_escrow';
  assert not (select relforcerowsecurity from pg_class where oid = t),
    'private.key_escrow forces row level security (ARCHITECTURE §8.2 rule 7)';
  assert exists (
    select 1 from pg_policies
    where schemaname = 'private' and tablename = 'key_escrow'
      and policyname = 'key_escrow_deny_all' and permissive = 'RESTRICTIVE'
      and roles = array['public']::name[] and cmd = 'ALL'
      and qual = 'false' and with_check = 'false'
  ), 'the deny-all policy key_escrow_deny_all is missing or changed';
  assert (select count(*) from pg_policies where schemaname = 'private' and tablename = 'key_escrow') = 1,
    'private.key_escrow has a policy besides its deny-all';
end $$;

-- 3. No grants: no API role, and nobody but the owner, holds a privilege on
--    the schema or the table. The aclexplode checks see a grant of any
--    privilege type to any role. (postgres and service_role bypass row level
--    security on this project, so for service_role the missing USAGE on the
--    schema is the barrier.)
do $$
declare
  t oid := 'private.key_escrow'::regclass;
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'public'] loop
    assert not has_schema_privilege(r, 'private', 'usage, create'),
      format('%s holds a privilege on schema private', r);
    assert not has_table_privilege(r, t, 'select, insert, update, references, trigger'),
      format('%s holds a privilege on private.key_escrow', r);
    assert not has_any_column_privilege(r, t, 'select, insert, update, references'),
      format('%s holds a column privilege on private.key_escrow', r);
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    assert not pg_has_role(r, 'postgres', 'usage'),
      format('%s can use the privileges of postgres, the owner', r);
  end loop;
  assert not exists (
    select 1 from pg_class c, aclexplode(c.relacl) a where c.oid = t and a.grantee <> c.relowner
  ), 'private.key_escrow is granted to a role other than its owner';
  assert not exists (
    select 1 from pg_namespace n, aclexplode(n.nspacl) a where n.nspname = 'private' and a.grantee <> n.nspowner
  ), 'schema private is granted to a role other than its owner';
end $$;

-- 4. anon and authenticated are refused, whatever they try. Each attempt runs
--    in its own block: the role switch and the refused statement roll back
--    together, so the next attempt starts as postgres again. A refused role
--    switch raises insufficient_privilege too, so a refusal counts only once
--    the switch is known to have happened: `became` is a plpgsql variable,
--    which keeps its value through the block's rollback.
do $$
declare
  r text;
  stmt text;
  became text;
  refused integer := 0;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach stmt in array array[
      'select kid, key from private.key_escrow',
      'select count(*) from private.key_escrow',
      $q$insert into private.key_escrow (kid, key) values ('probe-cnt0', '\x00'::bytea)$q$,
      $q$update private.key_escrow set created_at = created_at where kid = 'probe-cnt0'$q$
    ] loop
      became := null;
      begin
        execute format('set local role %I', r);
        became := current_user;
        execute stmt;
        raise exception 'CNT-0: % was allowed to run: %', r, stmt;
      exception when insufficient_privilege then
        assert became = r,
          format('could not switch to role %s, so nothing was tested as %s', r, r);
        refused := refused + 1;
      end;
    end loop;
  end loop;
  assert current_user = 'postgres', 'a role switch outlived its block';
  assert refused = 8, format('expected 8 refusals, got %s', refused);
end $$;

-- 5. The escrow statement and the recovery query of ARCHITECTURE §5.4 work for
--    postgres, the role MCP runs as, and the query returns the key as the one
--    44-character base64 line that content:keygen -- --restore reads.
do $$
declare
  recovered text;
begin
  assert current_setting('qz.cnt0_escrow_test', true) = 'in-transaction',
    'not inside the test transaction, so the throwaway key is not inserted';
  insert into private.key_escrow (kid, key)
    values ('test-cnt0', decode('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=', 'base64'));
  select encode(key, 'base64') into recovered from private.key_escrow where kid = 'test-cnt0';
  assert recovered = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
    'the recovery query does not return the escrowed key as stored';
  assert length(recovered) = 44 and position(E'\n' in recovered) = 0,
    'the recovery query wraps the key over more than one line';
  assert (select octet_length(key) from private.key_escrow where kid = 'test-cnt0') = 32,
    'the escrowed key is not 32 bytes';
end $$;

select 'PASS CNT-0 escrow table: private.key_escrow (kid text primary key, key bytea, created_at timestamptz), owned by postgres';
select 'PASS CNT-0 escrow deny-all policy: row level security on and not forced, one restrictive policy key_escrow_deny_all for all to public using (false) with check (false)';
select 'PASS CNT-0 escrow grants: anon, authenticated, service_role and public hold no privilege on schema private or the table, and nobody but postgres holds a grant';
select 'PASS CNT-0 escrow refuses anon and authenticated: select, count, insert and update each raise insufficient_privilege';
select 'PASS CNT-0 escrow recovery: postgres can escrow a key and the recovery query returns it as one 44-character base64 line';

rollback;
