-- MOD-1 (ARCHITECTURE §8.3, §8.4, §8.13; PRD §3.9.4, §3.10.6): the slur
-- filter in SQL, the authority behind every text a player shows to others,
-- and set_nickname.
--
-- The filter is src/engine/text/moderation.ts written a second time, step
-- for step, so the client's instant feedback and the server's verdict agree
-- (AC-LNT-03):
--   * private.fold_text: NFKC, then the engine's folding table as a
--     translate() map (case, marks, look-alike letters, invisible characters
--     removed). scripts/codegen/moderation-sql.ts writes the maps from the
--     engine's table into the generated block below; edit the engine, never
--     the block, and a later change goes into a new migration with its own
--     block.
--   * private.moderation_swaps: the digit and symbol swaps for one of the
--     four passes (swaps, bangs, edges, plain).
--   * private.moderation_words: the words one pass reads, with runs of
--     single letters joined.
--   * private.moderation_runs and private.moderation_list compile the active
--     terms into two regular expressions, the same sources the engine's
--     moderationPatterns builds: a run of k equal letters wants k or more,
--     and a run of i and a run of l stand for each other.
--   * private.text_blocked_by(text, list) is the verdict for a compiled list;
--     private.text_is_blocked(text) compiles the active list first. A caller
--     that checks many texts (save_quiz, SQL-15) compiles once and calls
--     text_blocked_by for each.
--
-- The lists load as seed data (supabase/seed/moderation.sql, from the ROT13
-- files in content/safety/; supabase/seed/name-parts.sql, from
-- content/names/), never in a migration. A term, an allowlisted word or a
-- name part leaves its list by active = false, never by removal, so routine
-- loads apply unattended (supabase/README.md §1). Nothing here stores, logs
-- or echoes a text the filter blocks: set_nickname answers blocked_text
-- before any write.

-- ---------------------------------------------------------------------------
-- Tables (§8.3)
-- ---------------------------------------------------------------------------

-- The listed terms, decoded as the seed loads them. match is 'word' (whole
-- words, for terms of 5 letters or fewer) or 'substring' (anywhere once
-- separators go); the engine's termMatchOf decides, and the seed records it.
create table if not exists private.moderation_terms (
  term text primary key check (char_length(term) between 1 and 64),
  match text not null check (match in ('word', 'substring')),
  active boolean not null default true
);
select private.secure_table('private.moderation_terms');

-- Innocent words that contain a substring term. The filter sets them aside
-- before matching, so the term inside never hits.
create table if not exists private.moderation_allow (
  word text primary key check (char_length(word) between 1 and 64),
  active boolean not null default true
);
select private.secure_table('private.moderation_allow');

-- The active lists, compiled: the allowlisted words as the filter reads
-- them, and the two expressions (null when the list has no such terms).
do $$
begin
  create type private.moderation_list as (
    allow text[],
    word_re text,
    substring_re text);
exception
  when duplicate_object then null;
end
$$;

-- The bucket set_nickname counts (§8.4: 20 a player a day). Values already
-- stored (an owner's tuning) win over this default.
insert into private.config as c (key, value)
values ('limits', '{"nickname_1d": {"cap": 20, "window_s": 86400}}')
on conflict (key) do update
  set value = excluded.value || c.value,
      updated_at = private.now();

-- ---------------------------------------------------------------------------
-- Folding and swaps (generated)
-- ---------------------------------------------------------------------------

-- generated:moderation-sql:begin
-- Written by npm run codegen:moderation from src/engine/text/moderation.ts. Edit the
-- engine and regenerate; never edit this block.

-- Steps 1 and 2 (the engine's foldText): NFKC, then the folding table, 713
-- characters to their letters and 258 removed. ASCII text skips NFKC, which
-- changes no ASCII, and uses the table's ASCII rows alone.
create or replace function private.fold_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when octet_length(p_text) = char_length(p_text) then
      translate(p_text,
        U&'ABCDEFGHIJKLMNOPQRSTUVWXYZ\0001\0002\0003\0004\0005\0006\0007\0008\000E\000F\0010' ||
        U&'\0011\0012\0013\0014\0015\0016\0017\0018\0019\001A\001B\001C\001D\001E\001F\007F',
        'abcdefghijklmnopqrstuvwxyz')
    else
      translate(normalize(p_text, nfkc),
        U&'ABCDEFGHIJKLMNOPQRSTUVWXYZ\00C0\00C1\00C2\00C3\00C4\00C5\00E0\00E1\00E2\00E3\00E4' ||
        U&'\00E5\0100\0101\0102\0103\0104\0105\01CD\01CE\01DE\01DF\01E0\01E1\01FA\01FB\0200\0201' ||
        U&'\0202\0203\0226\0227\1E00\1E01\1EA0\1EA1\1EA2\1EA3\1EA4\1EA5\1EA6\1EA7\1EA8\1EA9\1EAA' ||
        U&'\1EAB\1EAC\1EAD\1EAE\1EAF\1EB0\1EB1\1EB2\1EB3\1EB4\1EB5\1EB6\1EB7\00E6\00C6\01E3\01E2' ||
        U&'\01FD\01FC\0251\1E02\1E03\1E04\1E05\1E06\1E07\0180\0253\0181\00C7\00E7\0106\0107\0108' ||
        U&'\0109\010A\010B\010C\010D\1E08\1E09\0188\0187\023C\023B\010E\010F\1E0A\1E0B\1E0C\1E0D' ||
        U&'\1E0E\1E0F\1E10\1E11\1E12\1E13\0111\0110\00F0\00D0\0257\018A\0256\0189\0221\00C8\00C9' ||
        U&'\00CA\00CB\00E8\00E9\00EA\00EB\0112\0113\0114\0115\0116\0117\0118\0119\011A\011B\0204' ||
        U&'\0205\0206\0207\0228\0229\1E14\1E15\1E16\1E17\1E18\1E19\1E1A\1E1B\1E1C\1E1D\1EB8\1EB9' ||
        U&'\1EBA\1EBB\1EBC\1EBD\1EBE\1EBF\1EC0\1EC1\1EC2\1EC3\1EC4\1EC5\1EC6\1EC7\0247\0246\025B' ||
        U&'\0190\1E1E\1E1F\0192\0191\011C\011D\011E\011F\0120\0121\0122\0123\01E6\01E7\01F4\01F5' ||
        U&'\1E20\1E21\01E5\01E4\0260\0193\0261\0124\0125\021E\021F\1E22\1E23\1E24\1E25\1E26\1E27' ||
        U&'\1E28\1E29\1E2A\1E2B\1E96\0127\0126\00CC\00CD\00CE\00CF\00EC\00ED\00EE\00EF\0128\0129' ||
        U&'\012A\012B\012C\012D\012E\012F\0130\01CF\01D0\0208\0209\020A\020B\1E2C\1E2D\1E2E\1E2F' ||
        U&'\1EC8\1EC9\1ECA\1ECB\0131\0268\0197\0269\0196\0134\0135\01F0\0249\0248\0237\0136\0137' ||
        U&'\01E8\01E9\1E30\1E31\1E32\1E33\1E34\1E35\0199\0198\0138\0139\013A\013B\013C\013D\013E' ||
        U&'\1E36\1E37\1E38\1E39\1E3A\1E3B\1E3C\1E3D\0142\0141\019A\023D\026B\2C62\0234\026C\026D' ||
        U&'\1E3E\1E3F\1E40\1E41\1E42\1E43\0271\00D1\00F1\0143\0144\0145\0146\0147\0148\01F8\01F9' ||
        U&'\1E44\1E45\1E46\1E47\1E48\1E49\1E4A\1E4B\014B\014A\0272\019D\019E\0220\0235\00D2\00D3' ||
        U&'\00D4\00D5\00D6\00F2\00F3\00F4\00F5\00F6\014C\014D\014E\014F\0150\0151\01A0\01A1\01D1' ||
        U&'\01D2\01EA\01EB\01EC\01ED\020C\020D\020E\020F\022A\022B\022C\022D\022E\022F\0230\0231' ||
        U&'\1E4C\1E4D\1E4E\1E4F\1E50\1E51\1E52\1E53\1ECC\1ECD\1ECE\1ECF\1ED0\1ED1\1ED2\1ED3\1ED4' ||
        U&'\1ED5\1ED6\1ED7\1ED8\1ED9\1EDA\1EDB\1EDC\1EDD\1EDE\1EDF\1EE0\1EE1\1EE2\1EE3\00F8\00D8' ||
        U&'\01FF\01FE\0153\0152\0275\019F\1E54\1E55\1E56\1E57\01A5\01A4\024B\024A\0154\0155\0156' ||
        U&'\0157\0158\0159\0210\0211\0212\0213\1E58\1E59\1E5A\1E5B\1E5C\1E5D\1E5E\1E5F\024D\024C' ||
        U&'\027D\015A\015B\015C\015D\015E\015F\0160\0161\0218\0219\1E60\1E61\1E62\1E63\1E64\1E65' ||
        U&'\1E66\1E67\1E68\1E69\00DF\1E9E\0282\023F\0162\0163\0164\0165\021A\021B\1E6A\1E6B\1E6C' ||
        U&'\1E6D\1E6E\1E6F\1E70\1E71\1E97\0167\0166\01AD\01AC\0288\01AE\0236\00FE\00DE\00D9\00DA' ||
        U&'\00DB\00DC\00F9\00FA\00FB\00FC\0168\0169\016A\016B\016C\016D\016E\016F\0170\0171\0172' ||
        U&'\0173\01AF\01B0\01D3\01D4\01D5\01D6\01D7\01D8\01D9\01DA\01DB\01DC\0214\0215\0216\0217' ||
        U&'\1E72\1E73\1E74\1E75\1E76\1E77\1E78\1E79\1E7A\1E7B\1EE4\1EE5\1EE6\1EE7\1EE8\1EE9\1EEA' ||
        U&'\1EEB\1EEC\1EED\1EEE\1EEF\1EF0\1EF1\0289\0244\1E7C\1E7D\1E7E\1E7F\028B\01B2\0174\0175' ||
        U&'\1E80\1E81\1E82\1E83\1E84\1E85\1E86\1E87\1E88\1E89\1E98\1E8A\1E8B\1E8C\1E8D\00DD\00FD' ||
        U&'\00FF\0176\0177\0178\0232\0233\1E8E\1E8F\1E99\1EF2\1EF3\1EF4\1EF5\1EF6\1EF7\1EF8\1EF9' ||
        U&'\024F\024E\01B4\01B3\0179\017A\017B\017C\017D\017E\1E90\1E91\1E92\1E93\1E94\1E95\01B6' ||
        U&'\01B5\0225\0224\0290\0291\0240\0430\0410\03B1\0391\0432\0412\044C\042C\03B2\0392\0441' ||
        U&'\0421\03C2\0501\0500\0435\0415\0451\0401\0454\0404\03B5\0395\03AD\04BB\04BA\043D\041D' ||
        U&'\0397\0456\0406\0457\0407\04C0\04CF\03B9\0399\03AF\03CA\03AA\0458\0408\03F3\043A\041A' ||
        U&'\03BA\039A\043C\041C\039C\039D\03B7\03AE\043E\041E\03BF\039F\03CC\038C\0440\0420\03C1' ||
        U&'\03A1\051B\051A\0455\0405\0442\0422\03C4\03A4\03C5\03CD\03CB\03BD\0475\0474\051D\051C' ||
        U&'\03C9\03CE\0445\0425\03C7\03A7\0443\0423\04AF\04AE\03B3\03A5\0396\0001\0002\0003\0004' ||
        U&'\0005\0006\0007\0008\000E\000F\0010\0011\0012\0013\0014\0015\0016\0017\0018\0019\001A' ||
        U&'\001B\001C\001D\001E\001F\007F\0080\0081\0082\0083\0084\0086\0087\0088\0089\008A\008B' ||
        U&'\008C\008D\008E\008F\0090\0091\0092\0093\0094\0095\0096\0097\0098\0099\009A\009B\009C' ||
        U&'\009D\009E\009F\00AD\0300\0301\0302\0303\0304\0305\0306\0307\0308\0309\030A\030B\030C' ||
        U&'\030D\030E\030F\0310\0311\0312\0313\0314\0315\0316\0317\0318\0319\031A\031B\031C\031D' ||
        U&'\031E\031F\0320\0321\0322\0323\0324\0325\0326\0327\0328\0329\032A\032B\032C\032D\032E' ||
        U&'\032F\0330\0331\0332\0333\0334\0335\0336\0337\0338\0339\033A\033B\033C\033D\033E\033F' ||
        U&'\0340\0341\0342\0343\0344\0345\0346\0347\0348\0349\034A\034B\034C\034D\034E\034F\0350' ||
        U&'\0351\0352\0353\0354\0355\0356\0357\0358\0359\035A\035B\035C\035D\035E\035F\0360\0361' ||
        U&'\0362\0363\0364\0365\0366\0367\0368\0369\036A\036B\036C\036D\036E\036F\061C\180E\200B' ||
        U&'\200C\200D\200E\200F\202A\202B\202C\202D\202E\2060\2061\2062\2063\2064\2066\2067\2068' ||
        U&'\2069\20D0\20D1\20D2\20D3\20D4\20D5\20D6\20D7\20D8\20D9\20DA\20DB\20DC\20DD\20DE\20DF' ||
        U&'\20E0\20E1\20E2\20E3\20E4\20E5\20E6\20E7\20E8\20E9\20EA\20EB\20EC\20ED\20EE\20EF\20F0' ||
        U&'\FE00\FE01\FE02\FE03\FE04\FE05\FE06\FE07\FE08\FE09\FE0A\FE0B\FE0C\FE0D\FE0E\FE0F\FE20' ||
        U&'\FE21\FE22\FE23\FE24\FE25\FE26\FE27\FE28\FE29\FE2A\FE2B\FE2C\FE2D\FE2E\FE2F\FEFF',
        'abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ||
        'aaaabbbbbbbbbccccccccccccccccdddddddddddddddddddddeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
        'eeeeeeeeeeeeeeeeeffffggggggggggggggggggghhhhhhhhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiiiiiiiii' ||
        'iiiiiijjjjjjkkkkkkkkkkkkklllllllllllllllllllllllmmmmmmmnnnnnnnnnnnnnnnnnnnnnnnnnooooooo' ||
        'oooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooppppppqqrrrrrrrrrr' ||
        'rrrrrrrrrrrssssssssssssssssssssssssttttttttttttttttttttttttuuuuuuuuuuuuuuuuuuuuuuuuuuuu' ||
        'uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuvvvvvvwwwwwwwwwwwwwxxxxyyyyyyyyyyyyyyyyyyyyyyyzzzzzzz' ||
        'zzzzzzzzzzzzaaaabbbbbbcccddeeeeeeeeehhhhhiiiiiiiiiiijjjkkkkmmmnnnooooooppppqqssttttuuuv' ||
        'vvwwwwxxxxyyyyyyz')
  end
$$;

-- Step 3 for one pass (the engine's applySwaps): swaps reads every swap
-- character as its letter; bangs first turns the exclamation marks that end
-- a word into separators, and edges every swap character that ends a word;
-- plain reads none.
create or replace function private.moderation_swaps(p_folded text, p_pass text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_pass
    when 'plain' then p_folded
    when 'swaps' then translate(p_folded, U&'4@3\20AC1!\00A1|05$7', 'aaeeiiilosst')
    when 'bangs' then translate(
      regexp_replace(p_folded, U&'!+(?![abcdefghijklmnopqrstuvwxyz4@3\20AC1!|\00A105$7])', ' ', 'g'),
      U&'4@3\20AC1!\00A1|05$7', 'aaeeiiilosst')
    when 'edges' then translate(
      regexp_replace(p_folded, U&'[4@3\20AC1!|\00A105$7]+(?![abcdefghijklmnopqrstuvwxyz4@3\20AC1!|\00A105$7])', ' ', 'g'),
      U&'4@3\20AC1!\00A1|05$7', 'aaeeiiilosst')
  end
$$;
-- generated:moderation-sql:end

-- ---------------------------------------------------------------------------
-- Reading a text and compiling the list
-- ---------------------------------------------------------------------------

-- The words one pass reads in a text (the engine's normalizeForFilter):
-- folded, swapped for the pass, everything but a to z as separators, and a
-- run of single letters joined into one word. Empty for a text with no
-- letters.
create or replace function private.moderation_words(p_text text, p_pass text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_spaced text;
  v_word text;
  v_run text := '';
  v_words text[] := '{}';
begin
  v_spaced := btrim(regexp_replace(
    private.moderation_swaps(private.fold_text(p_text), p_pass),
    '[^abcdefghijklmnopqrstuvwxyz]+', ' ', 'g'));
  if v_spaced is null or v_spaced = '' then
    return v_words;
  end if;
  foreach v_word in array string_to_array(v_spaced, ' ') loop
    if char_length(v_word) = 1 then
      v_run := v_run || v_word;
      continue;
    end if;
    if v_run <> '' then
      v_words := v_words || v_run;
      v_run := '';
    end if;
    v_words := v_words || v_word;
  end loop;
  if v_run <> '' then
    v_words := v_words || v_run;
  end if;
  return v_words;
end
$$;

-- A run-by-run pattern for a string of letters (the engine's runsPattern):
-- each run of k equal letters wants k or more ('+' for one, '{k,}' for
-- more), and a run of i or l either letter.
create or replace function private.moderation_runs(p_letters text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := '';
  v_at integer := 1;
  v_length integer := coalesce(char_length(p_letters), 0);
  v_letter text;
  v_count integer;
  v_bound text;
begin
  while v_at <= v_length loop
    v_letter := substr(p_letters, v_at, 1);
    v_count := 1;
    while v_at + v_count <= v_length and substr(p_letters, v_at + v_count, 1) = v_letter loop
      v_count := v_count + 1;
    end loop;
    v_bound := case when v_count = 1 then '+' else '{' || v_count || ',}' end;
    v_out := v_out || case
      when v_letter in ('i', 'l') then '(?:i' || v_bound || '|l' || v_bound || ')'
      else v_letter || v_bound
    end;
    v_at := v_at + v_count;
  end loop;
  return v_out;
end
$$;

-- The active lists compiled (the engine's moderationPatterns and
-- allowedWords): a word term adds its words, and its words run together
-- when it has several; a substring term adds its letters. Alternatives are
-- sorted in byte order, so both sides build the same source.
create or replace function private.moderation_list()
returns private.moderation_list
language sql
stable
set search_path = ''
as $$
  with terms as (
    select t.match, private.moderation_words(t.term, 'swaps') as words
      from private.moderation_terms t
     where t.active
  ), alternatives as (
    select t.match,
           array_to_string(array(
             select private.moderation_runs(w.word)
               from unnest(t.words) with ordinality as w(word, n)
              order by w.n), ' ') as alternative
      from terms t
     where t.match = 'word' and cardinality(t.words) > 0
    union
    select t.match, private.moderation_runs(array_to_string(t.words, '')) as alternative
      from terms t
     where cardinality(t.words) > 0
       and (t.match = 'substring' or cardinality(t.words) > 1)
  ), allowed as (
    select distinct (private.moderation_words(a.word, 'swaps'))[1] as word
      from private.moderation_allow a
     where a.active
       and cardinality(private.moderation_words(a.word, 'swaps')) = 1
  )
  select row(
    coalesce((select array_agg(a.word order by a.word collate "C") from allowed a), '{}'::text[]),
    (select ' (?:' || string_agg(a.alternative, '|' order by a.alternative collate "C")
            || ')(?:s+|e+s+)? '
       from alternatives a
      where a.match = 'word'),
    (select '(?:' || string_agg(a.alternative, '|' order by a.alternative collate "C") || ')'
       from alternatives a
      where a.match = 'substring')
  )::private.moderation_list
$$;

-- ---------------------------------------------------------------------------
-- The verdict
-- ---------------------------------------------------------------------------

-- True when the text holds a term of the list in any pass (the engine's
-- isBlocked): allowlisted words become a | that no match can span, word
-- terms match the words between spaces, substring terms match the words run
-- together. Null text is never blocked.
create or replace function private.text_blocked_by(p_text text, p_list private.moderation_list)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_pass text;
  v_words text[];
  v_marked text[];
begin
  if p_text is null or p_list is null
     or (p_list.word_re is null and p_list.substring_re is null) then
    return false;
  end if;
  foreach v_pass in array array['swaps', 'bangs', 'edges', 'plain'] loop
    v_words := private.moderation_words(p_text, v_pass);
    continue when cardinality(v_words) = 0;
    select array_agg(case when w.word = any(coalesce(p_list.allow, '{}'::text[])) then '|' else w.word end
                     order by w.n)
      into v_marked
      from unnest(v_words) with ordinality as w(word, n);
    if p_list.word_re is not null
       and (' ' || array_to_string(v_marked, ' ') || ' ') ~ p_list.word_re then
      return true;
    end if;
    if p_list.substring_re is not null
       and array_to_string(v_marked, '') ~ p_list.substring_re then
      return true;
    end if;
  end loop;
  return false;
end
$$;

-- The verdict against the active lists (§8.13). Every RPC that stores text
-- shown to other people calls it, after private.clean_text; the verdict is
-- the same before and after cleaning.
create or replace function private.text_is_blocked(p_text text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.text_blocked_by(p_text, private.moderation_list())
$$;

-- ---------------------------------------------------------------------------
-- Nicknames
-- ---------------------------------------------------------------------------

-- True for an active adjective and an active animal with one space between
-- them, as the nickname field's Shuffle and friendly_name_for make them.
create or replace function private.is_generated_name(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_name ~ '^[^ ]+ [^ ]+$', false)
     and exists (
       select 1 from private.name_parts n
        where n.kind = 'adjective' and n.active and n.word = split_part(p_name, ' ', 1))
     and exists (
       select 1 from private.name_parts n
        where n.kind = 'animal' and n.active and n.word = split_part(p_name, ' ', 2))
$$;

-- The display name (PRD §3.10.6, §3.12.1). A generated name must be the
-- player's own friendly name or an active pair of name parts, at any age
-- band. A custom name needs 18_plus (13_17 gets age_forbidden, no band yet
-- age_required), 1 to 24 characters once cleaned, and the filter's pass
-- (blocked_text, which stores nothing about the text). Choosing the
-- friendly name itself clears the column, so "no chosen name" stays one
-- state. 20 a player a day. Profile.
create or replace function public.set_nickname(
  p_player uuid, p_secret text, p_nickname text, p_generated boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
  v_limit private.limit_result;
  v_name text;
  v_friendly text;
  v_band text;
  v_stored text;
begin
  if private.over_cap(p_nickname) then
    return private.err('invalid_input');
  end if;
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  v_limit := private.hit_player('nickname_1d', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  v_name := private.clean_text(p_nickname);
  if p_generated is null or v_name is null or char_length(v_name) not between 1 and 24 then
    return private.err('invalid_input');
  end if;
  select p.friendly_name, p.age_band
    into v_friendly, v_band
    from private.players p
   where p.id = v_auth.player_id;
  if p_generated then
    if v_name is distinct from v_friendly and not private.is_generated_name(v_name) then
      return private.err('invalid_input');
    end if;
  elsif v_band is null then
    return private.err('age_required');
  elsif v_band <> '18_plus' then
    return private.err('age_forbidden');
  elsif private.text_is_blocked(v_name) then
    return private.err('blocked_text');
  end if;
  v_stored := case when p_generated and v_name = v_friendly then null else v_name end;
  begin
    update private.players p
       set nickname = v_stored
     where p.id = v_auth.player_id
       and p.nickname is distinct from v_stored;
    return private.ok(private.profile_json(v_auth.player_id));
  exception
    when others then
      return private.fail_internal('set_nickname', sqlstate, sqlerrm);
  end;
end
$$;

insert into private.rpc_allowlist (name) values ('set_nickname') on conflict do nothing;
