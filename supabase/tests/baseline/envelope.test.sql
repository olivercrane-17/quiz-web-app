-- The RPC envelope (ARCHITECTURE §8.2 rule 5, §7.3; SQL-1): private.ok()
-- with its response-size sample, private.err() and its guards, and the
-- internal-error path with a reference id.
begin;

do $$
declare
  v_ok jsonb;
  v_err jsonb;
begin
  perform private.t_now('2026-11-01T10:00:00.250Z');
  update private.config set value = '0' where key = 'egress_sample_rate';

  v_ok := private.ok(jsonb_build_object('code', 'AB12CD34'));
  assert v_ok = '{"ok": true, "data": {"code": "AB12CD34"}, "server_time": 1793527200250}'::jsonb,
    format('ok envelope: %s', v_ok);
  assert private.ok() = '{"ok": true, "data": {}, "server_time": 1793527200250}'::jsonb,
    'ok() without data answers {}';

  v_err := private.err('stale', p_current => '{"step": 2}');
  assert v_err = '{"ok": false, "code": "stale", "current": {"step": 2}, "retry_after_ms": null,
                   "limit_scope": null, "ref": null, "server_time": 1793527200250}'::jsonb,
    format('err envelope: %s', v_err);

  v_err := private.err('rate_limited', p_retry_after_ms => 1500, p_limit_scope => 'ip');
  assert v_err ->> 'code' = 'rate_limited' and (v_err ->> 'retry_after_ms')::integer = 1500
     and v_err ->> 'limit_scope' = 'ip', format('rate_limited envelope: %s', v_err);

  v_err := private.err('unavailable', p_retry_after_ms => 3600000);
  assert (v_err ->> 'retry_after_ms')::integer = 3600000, 'unavailable carries the shedding wait';
end
$$;
select 'PASS SQL-1 ok and err build the documented envelope';

-- Guards: these are bugs in an RPC, so they raise instead of returning.
do $$
declare
  v_case record;
  v_raised boolean;
begin
  for v_case in
    select * from (values
      ('offline', null::integer, null::text),        -- transport codes never come from SQL
      ('timeout', null, null),
      ('nope', null, null),                          -- not a code at all
      ('rate_limited', null, 'ip'),                  -- a refusal without its wait
      ('rate_limited', 1000, null),                  -- or without its scope
      ('rate_limited', 1000, 'galaxy'),              -- or with an unknown scope
      ('not_found', null, 'ip'),                     -- a scope on another code
      ('unavailable', -1, null)                      -- a negative wait
    ) t(code, retry_after_ms, limit_scope)
  loop
    v_raised := false;
    begin
      perform private.err(v_case.code, p_retry_after_ms => v_case.retry_after_ms, p_limit_scope => v_case.limit_scope);
    exception
      when raise_exception then
        v_raised := true;
    end;
    assert v_raised, format('err(%s, %s, %s) did not raise', v_case.code, v_case.retry_after_ms, v_case.limit_scope);
  end loop;
end
$$;
select 'PASS SQL-1 err refuses unknown codes and refusals without a wait and scope';

-- The response-size sample (§8.1): every call at rate 1, none at rate 0.
do $$
declare
  v_first jsonb;
  v_second jsonb;
  v_sample record;
begin
  perform private.t_now('2026-11-01T10:37:00Z');
  update private.config set value = '1' where key = 'egress_sample_rate';
  v_first := private.ok(jsonb_build_object('n', 1));
  v_second := private.ok(jsonb_build_object('n', 22));
  select s.calls, s.bytes into v_sample
    from private.egress_samples s where s.hour = '2026-11-01T10:00:00Z';
  assert v_sample.calls = 2, format('sampled calls: %s', v_sample.calls);
  assert v_sample.bytes = octet_length(v_first::text) + octet_length(v_second::text),
    format('sampled bytes: %s', v_sample.bytes);

  update private.config set value = '0' where key = 'egress_sample_rate';
  perform private.ok(jsonb_build_object('n', 333));
  assert (select s.calls from private.egress_samples s where s.hour = '2026-11-01T10:00:00Z') = 2,
    'a zero rate still sampled';
end
$$;
select 'PASS SQL-1 ok samples response sizes into egress_samples by the hour';

-- An unexpected exception answers internal with a reference, and the
-- stored detail is redacted.
do $$
declare
  v_env jsonb;
  v_row record;
begin
  perform private.t_now('2026-11-01T11:00:00Z');
  begin
    perform 1 / 0;
  exception
    when others then
      v_env := private.fail_internal('t_rpc', sqlstate,
        'player 6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b failed: ' || sqlerrm);
  end;
  assert v_env ->> 'code' = 'internal', format('fail_internal answered %s', v_env);
  assert v_env ->> 'ref' ~ '^[0-9A-HJKMNP-TV-Z]{8}$', format('reference %s is not 8 Crockford characters', v_env ->> 'ref');
  select e.fn, e.sqlstate, e.detail, e.at into v_row from private.rpc_errors e where e.ref = v_env ->> 'ref';
  assert v_row.fn = 't_rpc' and v_row.sqlstate = '22012', format('logged %s %s', v_row.fn, v_row.sqlstate);
  assert v_row.detail = 'player <uuid> failed: division by zero', format('stored detail: %s', v_row.detail);
  assert v_row.at = '2026-11-01T11:00:00Z'::timestamptz, 'rpc_errors.at reads private.now()';
end
$$;
select 'PASS SQL-1 fail_internal logs a redacted error and answers internal with its ref';

rollback;
