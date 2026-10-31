# Sealed content

Every file in this folder except this one is an AES-256-GCM envelope, `<folder>/<id>.json.enc` (ARCHITECTURE §5.4). The plaintext never lands in git: the repository is public, and one plaintext mystery would publish a Daily answer. `npm run check:secrets` fails on anything else here.

| Folder        | Holds                                      |
| ------------- | ------------------------------------------ |
| `mysteries/`  | Daily mysteries, `m.<cat>.<BBSS>.json.enc` |
| `encores/`    | Encores, `e.<BBSS>.json.enc`               |
| `room-packs/` | Room packs, `<pack-id>.json.enc`           |
| `schedule/`   | Schedule months, `<yyyy-mm>.json.enc`      |
| `spares/`     | Spare sets, `spare-<NN>.json.enc`          |

## Working with it

```sh
npm run content:unseal            # envelopes -> content/.sealed-plain/ (git-ignored)
npm run content:check             # writers and checkers work in the workspace
npm run content:seal              # changed files -> envelopes; run at every checkpoint
npm run content:unseal -- --verify  # decrypt everything in memory, print only counts
```

The commands need the content key: `QZ_CONTENT_KEY` (base64) or `~/.config/quiz-web-app/content.key` (mode 0600). Never copy plaintext anywhere else, including the scratchpad, logs, messages or commit text.

## Recovering the key

The key never lives in the repository. Recover it from, in order: the owner's password manager, or the database escrow that ARCHITECTURE §5.4 describes, through MCP `execute_sql`: `select encode(key, 'base64') from private.key_escrow where kid = 'k1'`. Write it to `~/.config/quiz-web-app/content.key` with mode 600, then confirm with `npm run content:unseal -- --verify`. `npm run content:keygen -- --check` prints the key's fingerprint, never the key.

The `QZ_CONTENT_KEY` GitHub Actions secret is not a recovery source: secrets cannot be read back, and a job that exported the key would print it into this public repository's logs. It exists only so the `content-sealed` job can decrypt in memory.

See [content/README.md](../README.md) for the key derivation and the envelope format.
