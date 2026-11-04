# supabase/

The database of the Supabase project `zcodouduyvxwefxebvmv`: its migrations,
the SQL tests and the advisor findings it is allowed to have. ARCHITECTURE §8
is the design. This file holds the working rules every SQL ticket follows,
starting with SQL-1, which laid the baseline.

| Path                                      | What it holds                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `migrations/`                             | One file per change, applied in name order with `apply_migration`. Applied files are never edited. |
| `tests/<area>/*.test.sql`                 | SQL tests, each one transaction that rolls back (§8.17).                                           |
| `tests/<area>/*.payloads.sql`             | RPC replies to record as fixtures for the TypeScript decoders (§11.1).                             |
| `tests/baseline/standing-checks.test.sql` | The standing checks. Every bundle runs them last.                                                  |
| `expected-advisors.json`                  | The advisor findings the project may have, each with its reason (§8.2 rule 4).                     |

The scripts that work on these files are in `scripts/sql/`:

| Command                | What it does                                                                     |
| ---------------------- | -------------------------------------------------------------------------------- |
| `npm run sql:bundle`   | Builds the one-transaction dry-run script to paste into the MCP's `execute_sql`. |
| `npm run sql:drift`    | Compares `migrations/` with pasted `list_migrations` output.                     |
| `npm run sql:advisors` | Compares pasted `get_advisors` output with `expected-advisors.json`.             |

## 1. Everything applies unattended

The Supabase MCP server asks a human to confirm SQL it considers destructive.
During autonomous work nobody is there to answer, so the call waits and then
times out (01-ENGINEERING-CONSTRAINTS.md, "Supabase MCP confirmation
prompts"). Every migration, seed, test and payload file we send must
therefore pass without a confirmation.

### What the MCP stops for

`@supabase/mcp-server-supabase` 0.15.0 runs one check before `execute_sql`
and before `apply_migration`. It removes `--` and `/* */` comments, then
splits the text on every `;`, ignoring quotes and dollar quotes. It asks for a
confirmation when:

- a piece starts with `DROP`, `DELETE` or `TRUNCATE`. Because the split
  ignores dollar quotes, this includes a `DELETE` inside a function body that
  follows another statement, and a `DELETE` that has a narrow `WHERE`;
- a piece is `ALTER TABLE t DROP [COLUMN] c`, or any `ALTER TABLE` is
  followed later by `DROP COLUMN`;
- `EXECUTE` runs a quoted or dollar-quoted string that starts with `DROP`,
  `DELETE`, `TRUNCATE` or `ALTER TABLE ... DROP COLUMN`, including through
  `format(...)` or `concat(...)`;
- a top-level `UPDATE` has no `WHERE`. An `UPDATE` inside a `DO` block or a
  function body is not checked.

The hosted server may differ from the published package. On 4 November 2026
a dry run that held `DELETE ... WHERE` statements inside function bodies
waited for a confirmation and timed out, which matches the package.
`mcpConfirmationReasons()` in `scripts/sql/lib.ts` reimplements this check, and
`sql:bundle` and `sql:drift` run it, so you find out before you send.

### What we never write

The project's own rule is stricter than the MCP's check. It covers comments
and function bodies too, and `scanForbidden()` enforces it:

- the words `DROP`, `REVOKE`, `TRUNCATE`, `RENAME` and `ALTER ROLE` (or
  `ALTER USER`), anywhere in the file, comments included;
- `DELETE FROM` without a `WHERE` in the same statement;
- invisible characters: C0 and C1 controls other than tab and line breaks,
  zero-width characters, and bidi controls. Write them as `\uXXXX` escapes
  in a regular expression instead;
- top-level transaction control (`begin;`, `commit;`, `savepoint`) in a
  migration. `apply_migration` and the dry run supply the transaction.

Write additive SQL instead: `create ... if not exists`, `create or replace
function`, `insert ... on conflict do update`, and a new migration file in
place of any edit to an old one. A function's signature cannot change without
`DROP`, so choose it once.

`20261031000000_key_escrow.sql` was applied before this rule existed, and its
comments name some of these words. It is never sent again, so the repository
test and the drift check skip it, and the bundler would refuse it.

### Attended migrations (`*_attended.sql`)

Some work needs SQL that the MCP always stops for. A pruning job has to
`DELETE`, even with a narrow `WHERE` on time. That SQL goes in a separate
migration whose name ends `_attended.sql`. We apply it ourselves, but only in
a session where someone can answer the confirmation.

- An attended file holds only what needs the confirmation. Usually that is a
  `create or replace` of a function whose placeholder an unattended migration
  already created, so nothing depends on when the attended file lands.
- `sql:bundle` leaves attended files out unless you pass `--attended`, and
  then it prints each statement the MCP will ask about.
- Tests that need an attended file live in their own area. The tests for
  `20261104000200_platform_jobs_attended.sql` are in `tests/platform-jobs/`.
- A repository test fails if an attended file holds nothing the MCP would
  stop for, so the label stays honest.

### Owner-only migrations (`*_owner_only.sql`)

Some changes need `DROP` or `ALTER ROLE` on something that already exists.
They go in a migration whose name ends `_owner_only.sql`. Agents and the
integrator never apply it, `sql:bundle` refuses it, and `sql:drift` lists it
as an owner item rather than as drift. Each one is a launch-report item (§9
below).

## 2. Least privilege by construction

ARCHITECTURE §8.2 gets its guarantees from revokes. Revokes stop for a
confirmation, so the baseline reaches the same guarantees by the way it
creates objects:

1. **Everything internal lives in `private`.** That covers tables,
   sequences, types and helper functions. A new schema grants `USAGE` only to
   its owner. Nothing ever grants `USAGE` on `private`, so `anon`,
   `authenticated` and `service_role` cannot name anything inside it, and the
   Data API does not expose it.
2. **Helpers are SECURITY INVOKER.** They keep PostgreSQL's built-in
   `EXECUTE` for `PUBLIC`, which is harmless without `USAGE`. Being invokers,
   they never trigger the advisor's definer lints (0028, 0029). Never make a
   function in `private` SECURITY DEFINER: the standing checks fail on one.
3. **Every table calls `private.secure_table()`**, which enables RLS and adds
   a restrictive `deny_all` policy (`for all to public using (false) with
check (false)`). The advisor sees a policy (lint 0008), and a permissive
   policy added by mistake still could not open a row. Nobody uses `FORCE ROW
LEVEL SECURITY`, because the definer RPCs rely on the owner's bypass.

   ```sql
   create table if not exists private.things (
     id uuid primary key,
     created_at timestamptz not null default private.now());
   select private.secure_table('private.things');
   ```

4. **Only deliberate RPCs live in `public`.** Each one is
   `security definer set search_path = ''` and has a row in
   `private.rpc_allowlist`. Supabase's default privileges already let `anon`
   execute it. There is no revoke to write, so nothing else may live in
   `public`: no tables, views, sequences or helper functions. The standing
   checks fail on any of them.
5. **`postgres` owns everything.** That is the role the MCP applies
   migrations as. The standing checks fail on any other owner.

The API surface has two further settings, which need the owner:
`drop extension pg_graphql` (not installed today, so a guard) and
`pgrst.openapi_mode = 'disabled'`. They are in
`20261104000300_api_surface_owner_only.sql`. Meanwhile the standing checks fail
if `pg_graphql` appears, and the `backend-contract` workflow checks
`GET /rest/v1/` and `/graphql/v1` over HTTP.

## 3. Writing an RPC (SQL-2 onward)

```sql
create or replace function public.save_thing(p_player uuid, p_secret text, p_client_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit private.limit_result;
  v_done jsonb;
begin
  if private.over_cap(p_name, 'default') then                       -- sizes first (rule 8)
    return private.err('invalid_input');
  end if;
  v_limit := private.hit_ip('general_ip_5m', private.client_ip());   -- cap and window from config.limits
  if not v_limit.allowed then
    return private.rate_limited(v_limit);
  end if;
  -- authenticate (SQL-2), then validate everything before the first write
  v_done := private.write_key_claim(p_client_id, 'save_thing', p_player);
  if v_done is not null then
    return v_done;                                                   -- a retry, or conflict
  end if;
  -- the writes
  return private.write_key_finish(p_client_id, jsonb_build_object('id', gen_random_uuid()));
exception
  when others then
    return private.fail_internal('save_thing', sqlstate, sqlerrm);
end
$$;

insert into private.rpc_allowlist (name) values ('save_thing') on conflict do nothing;
```

Then add `save_thing` to `rpc.functions` in `expected-advisors.json` in the
same pull request. The bundle's generated check fails while the allowlist and
that list differ, and the advisor diff expects lints 0028 and 0029 for every
name on it.

- **Envelope.** Answer with `private.ok(data)` or `private.err(code, ...)`.
  `err` raises on a code that is not in §7.3, on `rate_limited` without a
  wait and a scope, and on a scope given with any other code. Expected
  failures return; they never raise, so the limiter's counts commit.
  `private.ok` also samples about 1% of response sizes into
  `egress_samples` (`config.egress_sample_rate`).
- **Unexpected exceptions** end in
  `return private.fail_internal('<rpc>', sqlstate, sqlerrm);`. The block's
  work rolls back, and a redacted row in `rpc_errors` commits. The reply is
  `internal`, with the row's 8-character reference.
- **Clock.** Use `private.now()`, never `now()`.
- **Text.** Run free text through `private.clean_text()` before validating
  it. `private.payload_cap(kind)` and `private.over_cap(text, kind)` hold the
  size limits. `private.redact()` runs on everything stored in `rpc_errors`
  and `alerts`.
- **Limits.** Every bucket of §8.6 is in `config.limits` as
  `{cap, window_s}`, and an unconfigured bucket raises.
  `hit_ip(bucket, ip)`, `hit_player(bucket, player)` and `hit_global(bucket)`
  use those numbers and report scope `ip`, `player` or `project`. Pass
  `private.client_ip()` as the address. The explicit forms add
  `window_s, max` after the key, as the pre-request hook needs. A last
  `amount` argument counts bytes for the byte caps. `peek_*` serves limits
  that count only failures: call it before the check, and `hit_*` after a
  failure. `unhit_*` gives back an earlier bucket's hit when a later bucket
  refuses.
- **Write keys.** Call `private.write_key_claim(client_id, fn, player)` after
  validation, just before the first write. When it returns `null`, carry on.
  Otherwise return what it gave you: the first call's reply on a retry, or
  `conflict`. Finish with `private.write_key_finish(client_id, data)`.

### How the limiter keys its counters

- Windows align to the Unix epoch. A window of `window_s` seconds starts at
  `floor(epoch / window_s) * window_s`, and a refusal's `retry_after_ms` is
  the time left in that window, rounded up and at least 1.
- The subject of a counter is `sha256(bucket | key | salt)`. The salt is the
  one for the UTC day the window started, so a window that crosses midnight
  keeps one subject. Each day's salt is 32 random bytes in
  `private.ip_salts`, and the attended hourly step drops salts for days
  before yesterday. No raw address or player id is ever stored.
- IP keys go through `private.client_ip()`, which reads the
  `X-Forwarded-For` hop that `config.client_ip` names (`first`, `last`, or a
  count from the right), then `private.ip_prefix()`. IPv4 addresses are used
  whole, IPv4-mapped IPv6 addresses become their IPv4 form, and IPv6
  addresses are cut to their /64 (AC-IDN-07). A missing or malformed address
  becomes `none`.
- A counter keeps counting past its cap, so a window's refusals are
  `hits - cap`. `private.fold_refusals()` adds them to `daily_aggregates`
  (metric `rate_limited`, dims `bucket=<name>`) exactly once per ended
  window. It does the same for the growth of the pre-request hook's sequence
  (`private.refused_general_ip_5m`, SQL-8).

## 4. Scheduled jobs and hooks

`private.hourly()`, `nightly()`, `weekly()`, `rooms_sweep()` and `publish()`
are the job bodies of §8.15. Each runs its hooks through
`private.run_job_step(job, hook)`, in a subtransaction of its own. A failing
hook rolls back alone and leaves an alert (`job_step_failed`), and the job's
other hooks still run.

- Every hook already exists as a no-op that returns `void`, with its owning
  ticket in a comment next to it. Fill only your own hook, with
  `create or replace function`, and keep the signature.
- A hook that deletes rows (most pruning does) cannot apply unattended. Put
  it in an `_attended.sql` migration, as SQL-1 did with `hourly_platform` and
  `nightly_platform`. Until that file is applied, the placeholder keeps the
  job working.
- SQL-8 schedules the jobs. Until then nothing calls them on a timer.

## 5. Tests

A test file is one transaction:

```sql
-- What the file proves, in a sentence or two.
begin;
select private.t_now('2026-11-04T12:00:00Z');   -- the clock, for postgres sessions only
do $$
begin
  assert private.epoch_ms(private.now()) = 1793793600000, 'clock';
end
$$;
select 'PASS SQL-1 the clock moves';
rollback;
```

- The first statement is `begin;` and the last is `rollback;`. In between
  there is no transaction control and at least one `select 'PASS <AC id or
ticket> <what it proves>';` line. Start it with the AC id when the test
  proves an AC, so the AC coverage check (§11.9) finds it.
- A failing `assert` raises, so the whole dry run stops at the first failure
  and shows its message.
- Helpers: `private.t_now(at)` moves the clock, which only `postgres`
  sessions see. `private.t_request(ip, headers, method, path)` sets what
  PostgREST would set for a request. `private.t_player(seed, test)` gives a
  deterministic player id and secret; pass `true` for an `e2e2e2e2-` test
  id.
- Prove grants by switching roles: `set local role anon;` ...
  `reset role;`.
- Test files obey the same unattended rules as migrations, with one
  difference: they may contain their own `begin;` and `rollback;`. Never
  advance a real sequence: `nextval` survives the rollback. Make your own
  inside the test instead, as `jobs.test.sql` does. Measure changes as deltas
  or within your own rows, so tests pass against a live database too.

**Payload files** (`*.payloads.sql`) record replies for the TypeScript
fixtures. Each `-- payload: <name>` line is followed by one
`select <expression>;`, which the bundle turns into a `PAYLOAD <name> <json>`
result row. Copy each JSON value into
`src/backend/<area>/__fixtures__/<name>.json`.

## 6. The dry run (every SQL ticket)

ARCHITECTURE §8.16: a ticket never applies its migrations. It proves them in a
transaction that rolls back.

1. Build the bundle. `--after` names the newest migration the project has
   applied, according to `list_migrations`:

   ```sh
   npm run sql:bundle -- --area baseline --area <yours> \
     --after 20261031000000_key_escrow \
     --payloads supabase/tests/<area>/<name>.payloads.sql \
     --out /tmp/dry-run.sql
   ```

   It refuses a bundle that holds a forbidden word, transaction control in a
   migration, or anything the MCP would stop for. Each refusal names the file
   and the line.

2. Send the whole file as one `execute_sql` call. The reply is the last
   select's rows: every PASS line in order, any PAYLOAD lines, and
   `OK <n> checks`. A failure comes back as the first assertion's error, and
   nothing persists either way.
3. Paste the result lines into the pull request.

The integrator applies merged migrations with `apply_migration` in file
order, using each file's stem as the name. Before that, a check with
`npm run sql:bundle -- --all --after <newest applied>` confirms the order
still holds. After applying, the integrator re-runs the tests, the drift
check and the advisor diff. Attended files wait for an attended session:
`npm run sql:bundle -- --all --attended --after <newest applied>` lists what
the MCP will ask, and someone answers each confirmation.

## 7. Drift and advisors

```sh
npm run sql:drift -- --applied list_migrations.json [--strict]
npm run sql:advisors -- --security security.json --performance performance.json
```

- **Drift** fails in these cases:
  - an applied migration has no file in the repository;
  - a file was never applied but sorts before the newest applied one, so it
    would run out of order;
  - a file name breaks `<14-digit version>_<snake_case>.sql`;
  - a migration still to apply holds a forbidden word, or, if it is not
    attended, anything the MCP would stop for.

  Pending files are listed. They count as errors only with `--strict`, at a
  wave exit after everything was applied.

- **Advisors.** Each finding must match an entry in
  `expected-advisors.json`, and each required entry must have a finding. The
  RPC lints are required for every name in `rpc.functions`. Accepted entries
  say whether they are required, and each needs a `why`. A new finding is
  either fixed or explained in that file in the same pull request. The
  `live` block records the last time someone compared it with the project.

## 8. The standing checks

`tests/baseline/standing-checks.test.sql` runs at the end of every bundle.
It fails if any of these stop holding:

- RLS and a deny-all policy on every table in `private`;
- no table with `FORCE ROW LEVEL SECURITY`;
- no table, view or sequence in `public`;
- `anon` executes nothing in `public` outside `private.rpc_allowlist`, and
  the allowlist names no missing or overloaded function;
- nothing in `private` is executable by `anon` or `authenticated`
  (AC-INC-04, AC-UGS-05). This covers no `USAGE` and no grants or default
  privileges reaching the schema, and it is proved by probes that run as
  each API role;
- `search_path = ''` on every function in `public` and `private`, SECURITY
  DEFINER for every function in `public`, and none in `private`;
- `postgres` owns every table, sequence, function and type in both schemas;
- `pg_graphql` is not installed;
- `private.key_escrow` keeps RLS, its deny-all policy and no grants.

The bundle adds one generated check: `private.rpc_allowlist` names exactly
`rpc.functions` from `expected-advisors.json`.

## 9. Owner items (launch report)

| Item                                        | Why an agent cannot do it                      | How                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261104000300_api_surface_owner_only.sql` | `DROP EXTENSION` and `ALTER ROLE` need a human | In the dashboard SQL editor, or MCP `execute_sql` with the owner confirming. Then re-run the `backend-contract` workflow, and record it with `apply_migration` only if it was applied that way. |
| `20261104000200_platform_jobs_attended.sql` | The MCP asks to confirm its `DELETE`s          | In a session someone attends. Run the bundle with `--attended` first, then `apply_migration`. Until then the hourly and nightly jobs skip SQL-1's pruning.                                      |
