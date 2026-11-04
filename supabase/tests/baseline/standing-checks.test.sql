-- Standing checks (ARCHITECTURE §8.2, §8.17; SQL-1). Every SQL ticket
-- re-runs them after its own migration: npm run sql:bundle appends this
-- file to every bundle. They read the catalogs and probe as each API role,
-- and write nothing.
begin;

-- RLS on, and a policy refusing every command to everyone, on every table
-- in private (lint 0008), CNT-0's key_escrow included.
do $$
declare
  v_bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private'
     and c.relkind in ('r', 'p')
     and (not c.relrowsecurity
          or not exists (
            select 1
              from pg_catalog.pg_policy p
             where p.polrelid = c.oid
               and p.polcmd = '*'
               and p.polroles = array[0::oid]
               and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'false'
               and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'false'));
  assert v_bad is null, format('tables in private without RLS and a deny-all policy: %s', v_bad);
end
$$;
select 'PASS SQL-1 standing: RLS and a deny-all policy on every table in private';

-- No table forces RLS: the definer RPCs rely on the owner's bypass.
do $$
declare
  v_bad text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by 1)
    into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relforcerowsecurity;
  assert v_bad is null, format('tables with FORCE ROW LEVEL SECURITY: %s', v_bad);
end
$$;
select 'PASS SQL-1 standing: no table forces row level security';

-- Nothing for the Data API, GraphQL or the OpenAPI root to show in public:
-- no tables, views or sequences there, since Supabase's default privileges
-- would hand each one to anon.
do $$
declare
  v_bad text;
begin
  select string_agg(c.relname || ' (' || c.relkind::text || ')', ', ' order by c.relname)
    into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S');
  assert v_bad is null, format('relations in public: %s', v_bad);
end
$$;
select 'PASS SQL-1 standing: public holds no tables, views or sequences';

-- The anon allowlist (§8.2 rule 4): every function anon can execute in
-- public is named in private.rpc_allowlist, every row names one function,
-- and no name is overloaded (PostgREST resolves an RPC by name).
do $$
declare
  v_outside text;
  v_stale text;
  v_overloaded text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
    into v_outside
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (select 1 from private.rpc_allowlist a where a.name = p.proname);
  assert v_outside is null, format('anon can execute functions outside private.rpc_allowlist: %s', v_outside);

  select string_agg(a.name, ', ' order by a.name)
    into v_stale
    from private.rpc_allowlist a
   where not exists (
     select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = a.name);
  assert v_stale is null, format('allowlist rows that name no function in public: %s', v_stale);

  select string_agg(x.proname, ', ' order by x.proname)
    into v_overloaded
    from (select p.proname
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
           group by p.proname
          having count(*) > 1) x;
  assert v_overloaded is null, format('overloaded function names in public: %s', v_overloaded);
end
$$;
select 'PASS SQL-1 standing: anon executes nothing in public outside private.rpc_allowlist';

-- Nothing in private is reachable by an API role (AC-INC-04, AC-UGS-05 for
-- the owner functions that later tickets add there): no USAGE or CREATE on
-- the schema for them or PUBLIC, no grant on anything inside it, and no
-- default privilege that would hand them future objects.
do $$
declare
  v_bad text;
begin
  select string_agg(r.role || ' ' || r.priv, ', ')
    into v_bad
    from (select role, priv
            from unnest(array['anon', 'authenticated', 'service_role', 'authenticator']) role,
                 unnest(array['USAGE', 'CREATE']) priv) r
   where has_schema_privilege(r.role, 'private', r.priv);
  assert v_bad is null, format('API roles with privileges on schema private: %s', v_bad);

  select string_agg(a.privilege_type, ', ')
    into v_bad
    from pg_catalog.pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
   where n.nspname = 'private' and a.grantee <> n.nspowner;
  assert v_bad is null, format('grants on schema private beyond its owner: %s', v_bad);

  select string_agg(c.relname || ':' || pg_catalog.pg_get_userbyid(a.grantee), ', ' order by 1)
    into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'private' and c.relacl is not null and a.grantee <> c.relowner;
  assert v_bad is null, format('grants on relations in private: %s', v_bad);

  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
    into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
   where n.nspname = 'private' and p.proacl is not null
     and a.grantee not in (p.proowner, 0);
  assert v_bad is null, format('functions in private granted to a role: %s', v_bad);

  select string_agg(p.oid::regprocedure::text || ' by ' || r.role, ', ' order by 1)
    into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join unnest(array['anon', 'authenticated', 'service_role']) r(role)
   where n.nspname = 'private'
     and has_schema_privilege(r.role, n.oid, 'USAGE')
     and has_function_privilege(r.role, p.oid, 'EXECUTE');
  assert v_bad is null, format('functions in private executable by an API role: %s', v_bad);

  select string_agg(coalesce(n.nspname, 'every schema') || ':' || d.defaclobjtype::text || ':'
                    || case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end, ', ')
    into v_bad
    from pg_catalog.pg_default_acl d
    left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
   where (d.defaclnamespace = 0 or n.nspname = 'private')
     and (a.grantee = 0 or pg_catalog.pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role', 'authenticator'));
  assert v_bad is null, format('default privileges that reach private: %s', v_bad);
end
$$;
select 'PASS AC-INC-04 AC-UGS-05 standing: nothing in private is executable by anon or authenticated';

-- The same, proved from inside each API role: the schema itself refuses.
set local role anon;
do $$
begin
  begin
    perform 1 from private.config limit 1;
    raise exception 'anon read private.config';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform private.now();
    raise exception 'anon called private.now()';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;
set local role authenticated;
do $$
begin
  begin
    perform 1 from private.config limit 1;
    raise exception 'authenticated read private.config';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform private.now();
    raise exception 'authenticated called private.now()';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;
set local role service_role;
do $$
begin
  begin
    perform 1 from private.config limit 1;
    raise exception 'service_role read private.config';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;
select 'PASS SQL-1 standing: anon, authenticated and service_role are refused at schema private';

-- Every function in public and private sets search_path to empty (lint
-- 0011); every public function is SECURITY DEFINER, and no private one is,
-- because PUBLIC keeps EXECUTE there and lints 0028 and 0029 would flag it.
do $$
declare
  v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
    into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prokind <> 'a'
     and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not ('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])));
  assert v_bad is null, format('functions without search_path = '''': %s', v_bad);

  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
    into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not p.prosecdef;
  assert v_bad is null, format('functions in public that are not SECURITY DEFINER: %s', v_bad);

  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
    into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.prosecdef;
  assert v_bad is null, format('SECURITY DEFINER functions in private: %s', v_bad);
end
$$;
select 'PASS SQL-1 standing: empty search_path everywhere, definer RPCs in public only';

-- postgres owns everything in both schemas, since default privileges only
-- describe objects that role creates (§8.2 rule 7).
do $$
declare
  v_bad text;
begin
  select string_agg(x.what, ', ' order by x.what)
    into v_bad
    from (
      select n.nspname || '.' || c.relname || ' (' || c.relkind::text || ') owned by '
             || pg_catalog.pg_get_userbyid(c.relowner) as what
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'S', 'v', 'm', 'f')
         and pg_catalog.pg_get_userbyid(c.relowner) <> 'postgres'
      union all
      select p.oid::regprocedure::text || ' owned by ' || pg_catalog.pg_get_userbyid(p.proowner)
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
         and pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
      union all
      select n.nspname || '.' || t.typname || ' owned by ' || pg_catalog.pg_get_userbyid(t.typowner)
        from pg_catalog.pg_type t
        join pg_catalog.pg_namespace n on n.oid = t.typnamespace
       where n.nspname in ('public', 'private')
         and t.typtype in ('c', 'd', 'e', 'r')
         and (t.typrelid = 0 or (select c.relkind from pg_catalog.pg_class c where c.oid = t.typrelid) = 'c')
         and pg_catalog.pg_get_userbyid(t.typowner) <> 'postgres'
      union all
      select 'schema private owned by ' || pg_catalog.pg_get_userbyid(n.nspowner)
        from pg_catalog.pg_namespace n
       where n.nspname = 'private' and pg_catalog.pg_get_userbyid(n.nspowner) <> 'postgres'
    ) x;
  assert v_bad is null, format('objects not owned by postgres: %s', v_bad);
end
$$;
select 'PASS SQL-1 standing: postgres owns every table, sequence, function and type';

-- pg_graphql stays out: installed, it would expose every anon-executable
-- RPC at /graphql/v1 (§8.2). Turning it back off is an owner step
-- (20261104000300_api_surface_owner_only.sql).
do $$
begin
  assert not exists (select 1 from pg_catalog.pg_extension e where e.extname = 'pg_graphql'),
    'pg_graphql is installed: the owner must turn it off (see supabase/README.md)';
end
$$;
select 'PASS SQL-1 standing: pg_graphql is not installed';

-- CNT-0's escrow table, named so a change to it can never pass unnoticed.
do $$
declare
  v_rls boolean;
  v_role text;
begin
  assert to_regclass('private.key_escrow') is not null, 'private.key_escrow is missing';
  select c.relrowsecurity into v_rls from pg_catalog.pg_class c where c.oid = 'private.key_escrow'::regclass;
  assert v_rls, 'private.key_escrow has RLS off';
  assert exists (
    select 1
      from pg_catalog.pg_policy p
     where p.polrelid = 'private.key_escrow'::regclass
       and p.polcmd = '*' and p.polroles = array[0::oid]
       and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'false'
       and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'false'),
    'private.key_escrow lost its deny-all policy';
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_table_privilege(v_role, 'private.key_escrow', 'SELECT, INSERT, UPDATE'),
      format('%s holds a privilege on private.key_escrow', v_role);
  end loop;
  assert not exists (
    select 1
      from pg_catalog.pg_class c
      cross join lateral aclexplode(c.relacl) a
     where c.oid = 'private.key_escrow'::regclass and a.grantee <> c.relowner),
    'private.key_escrow carries a grant';
  assert pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid = 'private.key_escrow'::regclass)) = 'postgres',
    'private.key_escrow is not owned by postgres';
end
$$;
set local role anon;
do $$
begin
  begin
    perform 1 from private.key_escrow limit 1;
    raise exception 'anon read private.key_escrow';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;
select 'PASS SQL-1 standing: private.key_escrow keeps RLS, its deny-all policy and no grants';

rollback;
