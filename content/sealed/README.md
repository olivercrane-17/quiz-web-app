# Sealed content

Every file in this folder except this README is an AES-256-GCM envelope, `<folder>/<id>.json.enc`, in the format of ARCHITECTURE §5.4, implemented once in `scripts/content/crypto.ts`. The plaintext never lands in git: the repository is public, and one plaintext mystery would publish a Daily answer. `npm run check:secrets` fails on anything else here, including an envelope whose data reads as text.

| Folder             | Holds                                          |
| ------------------ | ---------------------------------------------- |
| `mysteries/`       | Daily mysteries, `m.<cat>.<BBSS>.json.enc`     |
| `encores/`         | Encores, `e.<BBSS>.json.enc`                   |
| `room-packs/`      | Room packs, `<pack-id>.json.enc`               |
| `schedule/`        | Schedule months, `<yyyy-mm>.json.enc`          |
| `spares/`          | Spare sets, `spare.<NN>.json.enc`              |
| `challenge-packs/` | Challenge packs (none before 30 Dailies close) |
| `list-requests/`   | List requests, `lr.<batch>.<NN>.json.enc`      |
| `audits/`          | Seeded audit records (CONTENT_GUIDE §9.10)     |

## Working with it

```sh
npm run content:unseal              # envelopes -> content/.sealed-plain/ (git-ignored)
npm run content:check               # writers and checkers work in the workspace
npm run content:seal                # changed files -> envelopes; run at every checkpoint
npm run content:unseal -- --verify  # decrypt everything in memory, print only counts
```

Unchanged plaintext seals to a byte-identical envelope, so `git status` shows only real edits. Never copy plaintext anywhere else, including the scratchpad, logs, messages or commit text.

## The key

One 32-byte master key, kid `k1`, fingerprint `fdbb8dadfae803ab`. The tools read it from `QZ_CONTENT_KEY` (base64) or from `~/.config/quiz-web-app/content.key` (base64, mode 0600), never from the repository, and they print only its fingerprint; `npm run content:keygen -- --check` shows the fingerprint of whatever key a machine holds. These are all the places the key can be:

- **The owner's password manager.** The key was delivered to the owner as a file (decisions memo §17). Recovery starts from this copy.
- **The `QZ_CONTENT_KEY` repository secret on GitHub**, set by the owner for the `content-sealed` CI job alone. Secrets cannot be read back, and a job that exported the key would print it into this public repository's logs, so this copy is not a recovery source. The secret scan holds every workflow to memo §17: only the `content-sealed` job references the secret, that job declares no `environment:`, and no line prints or exports it.
- **The sandbox's key file**, `~/.config/quiz-web-app/content.key`, which dies with the sandbox.
- **Not the database escrow.** `private.key_escrow` exists (migration `20261031000000_key_escrow`, applied) and only `postgres` can touch it: row level security with a deny-all policy, and no grants. `supabase/tests/escrow/key_escrow.test.sql` proves that through MCP. Escrowing the key means reading it into an agent's transcript, which session policy blocks, so memo §17 records that the table stays empty, and it is.

That settles the step CNT-0 left to the orchestrator after merge, "create the key with `npm run content:keygen` and escrow it through MCP": the key was created once, before sealed writing began, and it is not escrowed. Once SQL-3's `content:release` loads sealed content into the database, that content is the second copy memo §17 counts on. Until the first release, the password-manager copy is the only one outside the sandbox.

## Recovering the key

On a machine with the envelopes but no key, `content:unseal` stops with "no content key". Do not run `npm run content:keygen` then: a new key opens none of these envelopes. It refuses while envelopes exist, and `content:seal` refuses a key that opens none of them, so a wrong key can never split this folder between two keys.

1. **Get the key's base64 text**: one line of 44 characters ending in `=`, from the owner's password manager. Only if the owner ever escrows it, the database has it too: through MCP `execute_sql`, `select encode(key, 'base64') from private.key_escrow where kid = 'k1'`. Today that returns no row.
2. **Restore it** with `npm run content:keygen -- --restore`, which reads the key from stdin. Pipe the owner's file in (`npm run content:keygen -- --restore < /path/to/content.key`), or paste the line and press Ctrl-D. It refuses a key that opens none of the envelopes, never overwrites an existing key file, writes `~/.config/quiz-web-app/content.key` with mode 0600 in a 0700 directory, and prints only the fingerprint. Never echo the key or pass it as an argument: both end up in logs or shell history. Writing that file by hand with mode 600 also works.
3. **Check it.** `npm run content:keygen -- --check` must print fingerprint `fdbb8dadfae803ab`. Then `npm run content:unseal -- --verify` decrypts every envelope in memory and prints only a count, such as `content:unseal: 345 envelope(s) decrypt with key fdbb8dadfae803ab, 0 failed.`, and it writes nothing. An envelope it names did not open: look at its git history before sealing over it.

The steps are tested with a throwaway key under a temporary `HOME`, never with the real key. "CNT-0 the recovery steps restore a key that content:unseal -- --verify accepts" in `src/content/pipeline/sealed-safety.test.ts` runs steps 2 and 3 end to end, and the escrow SQL test checks, inside a rolled-back transaction, that the query of step 1 returns that same throwaway key as exactly the line step 2 reads.

## If the key is lost

No envelope opens without the key, and nothing in this repository can rebuild it. After the first release, the sealed content can be read back from `private.*` through MCP and sealed again under a new key with a new kid (`k2`), never under `k1`. Before it, an envelope nobody can open means writing its content again. A new key also needs a new password-manager copy, a new `QZ_CONTENT_KEY` secret, and a new fingerprint in this file.

See [content/README.md](../README.md) for the key derivation and the content commands in full.
