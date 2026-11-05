-- Client addresses (ARCHITECTURE §8.6; SQL-1, with SQL-2's identity limits
-- built on them): the hop rule, rules it does not recognize, malformed
-- headers, IPv6 /64 prefixes and a forged first hop. Each block writes the
-- rule it relies on, since CI-0 may move the live rule off "first".
begin;

do $$
declare
  v_case record;
begin
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first"}')
  on conflict (key) do update set value = excluded.value;
  perform private.t_request('203.0.113.7, 10.0.0.1');
  assert private.client_ip() = '203.0.113.7'::inet, format('first hop: %s', private.client_ip());

  -- The rule is data: the last hop, a position from the right, another header.
  update private.config set value = '{"header": "x-forwarded-for", "hop": "last"}' where key = 'client_ip';
  assert private.client_ip() = '10.0.0.1'::inet, 'last hop';
  perform private.t_request('198.51.100.1, 203.0.113.7, 10.0.0.1');
  update private.config set value = '{"header": "x-forwarded-for", "hop": 1}' where key = 'client_ip';
  assert private.client_ip() = '203.0.113.7'::inet, 'one hop from the right';
  update private.config set value = '{"header": "x-forwarded-for", "hop": 1.0}' where key = 'client_ip';
  assert private.client_ip() = '203.0.113.7'::inet, 'a whole number written with a fraction';
  update private.config set value = '{"header": "x-forwarded-for", "hop": 0}' where key = 'client_ip';
  assert private.client_ip() = '10.0.0.1'::inet, 'zero from the right is the last hop';
  update private.config set value = '{"header": "x-forwarded-for", "hop": 5}' where key = 'client_ip';
  assert private.client_ip() is null, 'a position past the first hop';
  update private.config set value = '{"header": "X-Real-IP", "hop": "first"}' where key = 'client_ip';
  perform private.t_request(null, '{"x-real-ip": "192.0.2.44"}');
  assert private.client_ip() = '192.0.2.44'::inet, 'another header, matched in lower case';

  -- A rule it does not recognize gives null (every request then shares one
  -- subject, so the mistake shows at once), never the first hop a client
  -- may control.
  perform private.t_request('203.0.113.7, 10.0.0.1');
  for v_case in
    select * from (values
      ('{"header": "x-forwarded-for", "hop": "1"}'),            -- a number written as a string
      ('{"header": "x-forwarded-for", "hop": "Last"}'),         -- the wrong case
      ('{"header": "x-forwarded-for", "hop": "last "}'),        -- a stray space
      ('{"header": "x-forwarded-for", "hop": 1.5}'),            -- not a whole number
      ('{"header": "x-forwarded-for", "hop": -1}'),             -- counted from nowhere
      ('{"header": "x-forwarded-for", "hop": 1e30}'),           -- far too far
      ('{"header": "x-forwarded-for", "hop": null}'),
      ('{"header": "x-forwarded-for", "hop": ["last"]}'),
      ('{"header": "x-forwarded-for", "hops": "last"}'),        -- a misspelt key
      ('{"hop": "last"}'),                                      -- no header
      ('{"header": "x-forwarded-for, x-real-ip", "hop": "last"}'),
      ('{"header": 7, "hop": "last"}'),
      ('"x-forwarded-for"'),                                    -- not an object
      ('[]')
    ) t(rule)
  loop
    update private.config set value = v_case.rule::jsonb where key = 'client_ip';
    assert private.client_ip() is null, format('client_ip under rule %s = %s, want null', v_case.rule, private.client_ip());
  end loop;

  -- Hop forms the proxy may write, and everything malformed.
  update private.config set value = '{"header": "x-forwarded-for", "hop": "first"}' where key = 'client_ip';
  for v_case in
    select * from (values
      ('[2001:db8::1]:443', '2001:db8::1'),
      ('[2001:db8::2]', '2001:db8::2'),
      ('192.0.2.9:51234', '192.0.2.9'),
      ('  192.0.2.10  ', '192.0.2.10'),
      ('::ffff:192.0.2.11', '::ffff:192.0.2.11'),
      ('not-an-address', null),
      ('', null),
      ('192.0.2.0/24', null),
      ('fe80::1%eth0', null),
      ('999.1.1.1', null),
      ('unknown', null)
    ) t(raw, want)
  loop
    perform private.t_request(v_case.raw);
    assert private.client_ip() is not distinct from v_case.want::inet,
      format('client_ip for %L = %s, want %s', v_case.raw, private.client_ip(), v_case.want);
  end loop;

  perform set_config('request.headers', '', true);
  assert private.client_ip() is null, 'no headers at all';
  perform set_config('request.headers', '{not json', true);
  assert private.client_ip() is null, 'headers that are not JSON';
  perform set_config('request.headers', '["x-forwarded-for"]', true);
  assert private.client_ip() is null, 'headers that are not an object';
end
$$;
select 'PASS SQL-1 client_ip follows the configured hop rule and refuses malformed hops and unknown rules';

-- The limiter's key: IPv4 whole, IPv4-mapped IPv6 as IPv4, IPv6 by /64,
-- and one shared key for every request without an address.
do $$
begin
  assert private.ip_prefix('203.0.113.7') = '203.0.113.7', 'IPv4 whole';
  assert private.ip_prefix('::ffff:203.0.113.7') = '203.0.113.7', 'IPv4-mapped IPv6 counts as IPv4';
  assert private.ip_prefix('2001:db8:aaaa:bbbb:1:2:3:4') = '2001:db8:aaaa:bbbb::/64', 'IPv6 by /64';
  assert private.ip_prefix('2001:db8:aaaa:bbbb:ffff:ffff:ffff:ffff') = private.ip_prefix('2001:db8:aaaa:bbbb::1'),
    'one /64 is one key';
  assert private.ip_prefix('2001:db8:aaaa:bbbc::1') <> private.ip_prefix('2001:db8:aaaa:bbbb::1'),
    'the next /64 is another key';
  assert private.ip_prefix(null) = 'none', 'requests without an address share one key';
end
$$;
select 'PASS AC-IDN-07 two IPv6 addresses in one /64 share a limiter key and two /64s do not';

-- A forged first hop moves the subject only while the rule says first:
-- with "last", the hop Supabase's proxy appends decides.
do $$
declare
  v_real bytea;
  v_forged bytea;
begin
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first"}')
  on conflict (key) do update set value = excluded.value;
  perform private.t_now('2026-11-01T09:00:00Z');
  perform private.t_request('198.51.100.20');
  v_real := private.subject('t_forge_1m', 'ip:' || private.ip_prefix(private.client_ip()), private.window_start(private.now(), 60));
  perform private.t_request('203.0.113.7, 198.51.100.20');
  v_forged := private.subject('t_forge_1m', 'ip:' || private.ip_prefix(private.client_ip()), private.window_start(private.now(), 60));
  assert v_real <> v_forged, 'with the first-hop rule a forged hop changes the subject';

  update private.config set value = '{"header": "x-forwarded-for", "hop": "last"}' where key = 'client_ip';
  v_forged := private.subject('t_forge_1m', 'ip:' || private.ip_prefix(private.client_ip()), private.window_start(private.now(), 60));
  assert v_real = v_forged, 'with the last-hop rule a forged first hop cannot move the subject';
end
$$;
select 'PASS SQL-1 a forged first hop changes the subject only while client_ip says first';

rollback;
