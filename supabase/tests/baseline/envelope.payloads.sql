-- The envelopes SQL-1's helpers build, recorded for the RPC wrapper's
-- decoder fixtures (src/backend/supabase/__fixtures__/envelope.*.json,
-- ARCHITECTURE §11.1). Record them with a dry run:
--   npm run sql:bundle -- --area baseline --after <last applied> \
--     --payloads supabase/tests/baseline/envelope.payloads.sql
select private.t_now('2026-11-04T12:00:00Z');
update private.config set value = '0' where key = 'egress_sample_rate';

-- payload: envelope.ok
select private.ok('{"code": "AB12CD34", "expires_at": 1795000000000}');

-- payload: envelope.ok-empty
select private.ok();

-- payload: envelope.rate-limited
select private.err('rate_limited', p_retry_after_ms => 42000, p_limit_scope => 'player');

-- payload: envelope.stale
select private.err('stale', p_current => '{"round": 1, "step": 2}');

-- payload: envelope.unavailable-shedding
select private.err('unavailable', p_retry_after_ms => 3600000);

-- payload: envelope.internal
select private.fail_internal('t_payload', 'XX000', 'unexpected: 6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b');
