# content/names/

The parts of generated friendly names, such as "Plucky Otter" (PRD §3.10.1).
Registration gives every player one, it is the default nickname everywhere,
and the 13 to 17 band picks only from these names (PRD §3.10.6).

| File             | Holds                         |
| ---------------- | ----------------------------- |
| `adjectives.txt` | The first word, one per line  |
| `animals.txt`    | The second word, one per line |

Each word is a capital and lower-case letters, at most 11 letters, so any
pair fits a 24-character nickname. Lines that start with `#` are comments.

## Where the lists go

`npm run content:build` writes `src/content/generated/names.ts`, which the
nickname field's Shuffle picks from and the mock backend names players with.
`npm run codegen:moderation` writes `supabase/seed/name-parts.sql`, which
fills `private.name_parts`: `private.friendly_name_for` draws from its active
words, and `set_nickname` accepts a generated name only as an active pair.
The seed upserts every word and retires the rest with `active = false`,
never removing a row, so a player's stored name keeps its words.

## Review rules

Players are 13 and over and see each other's names in Groups and
challenges, so every word, and every pair, must be harmless to anyone.

- Adjectives are positive or neutral about character or mood. No colours
  (they can turn a pair into a racial slur), nothing about looks, bodies,
  intelligence, health or sexuality, and nothing with a common double
  meaning.
- Animals are ones nobody uses as an insult or a slur: no primates, no
  animals that stand for dirt, fat or stupidity, and none whose name is
  slang for a body part or sex (which rules out several birds).
- A pair must not form a known phrase with a bad meaning.

The tests check what a machine can: every pair passes the slur filter, the
words are unique, short enough and in the expected shape. The judgement
above is the reviewer's.
