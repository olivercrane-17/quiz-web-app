-- private.secure_table() (ARCHITECTURE §8.2; SQL-1): RLS on and the
-- restrictive deny_all policy, added once. A permissive policy of the same
-- shape does not count as one, since any other permissive policy added
-- later would be OR-ed with it and open rows; only a restrictive policy
-- still refuses then.
begin;

do $$
begin
  create table private.t_secured (id integer primary key);
  perform private.secure_table('private.t_secured');
  perform private.secure_table('private.t_secured');
  assert (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'private.t_secured'::regclass),
    'secure_table left RLS off';
  assert (select count(*) from pg_catalog.pg_policy p
           where p.polrelid = 'private.t_secured'::regclass and p.polname = 'deny_all' and not p.polpermissive) = 1,
    'secure_table did not add exactly one restrictive deny_all';
  assert private.has_deny_all('private.t_secured'), 'has_deny_all missed the restrictive deny_all';

  -- A table that wrote its own permissive "deny all" first still gets the
  -- restrictive one.
  create table private.t_lookalike (id integer primary key);
  alter table private.t_lookalike enable row level security;
  create policy t_permissive_deny on private.t_lookalike for all to public using (false) with check (false);
  assert not private.has_deny_all('private.t_lookalike'), 'a permissive deny-all counted as the restrictive one';
  perform private.secure_table('private.t_lookalike');
  assert private.has_deny_all('private.t_lookalike'), 'secure_table kept the permissive look-alike alone';
  assert exists (select 1 from pg_catalog.pg_policy p
                  where p.polrelid = 'private.t_lookalike'::regclass and p.polname = 'deny_all' and not p.polpermissive),
    'secure_table did not add the restrictive deny_all';

  begin
    perform private.secure_table('pg_catalog.pg_class');
    raise exception 'secure_table accepted a table outside private';
  exception
    when raise_exception then
      if sqlerrm not like 'secure_table:%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-1 secure_table adds the restrictive deny_all, and a permissive look-alike does not count';

rollback;
