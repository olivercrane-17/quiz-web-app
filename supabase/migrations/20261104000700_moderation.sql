-- MOD-1 (ARCHITECTURE §8.3, §8.4, §8.13; PRD §3.9.4, §3.10.6): the slur
-- filter in SQL, the authority behind every text a player shows to others,
-- and set_nickname.
--
-- The filter is src/engine/text/moderation.ts written a second time, step
-- for step, so the client's instant feedback and the server's verdict agree
-- (AC-LNT-03):
--   * private.fold_text: NFKD, then every combining mark, default-ignorable
--     character and control removed, then the engine's folding table as a
--     translate() map (case, letters with no decomposition, look-alike
--     letters, small capitals, enclosed alphabets). private.moderation_swaps
--     reads digits and symbols for one of the ten passes, and
--     private.moderation_pass_text gives the flips pass its capital I as l.
--     scripts/codegen/moderation-sql.ts writes these, the plural and the
--     pass list from the engine into the generated block below; edit the
--     engine, never the block, and a later change goes into a new migration
--     with its own block.
--   * private.moderation_split and private.moderation_words: the words one
--     pass reads, with runs of single letters joined.
--   * private.moderation_runs, private.moderation_spaced and
--     private.moderation_list compile the active terms into two regular
--     expressions, the same sources the engine's moderationPatterns builds.
--   * private.text_blocked_by(text, list) is the verdict for a compiled list;
--     private.text_is_blocked(text) compiles the active list first. A caller
--     that checks many texts (save_quiz, SQL-15) compiles once and calls
--     text_blocked_by for each.
--   * public.set_age_band is replaced so that moving to 13_17 clears a
--     custom nickname, which only 18_plus may hold (PRD §3.10.6).
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

-- Steps 1 to 3 (the engine's foldText): NFKD, then the removals (every combining mark,
-- default-ignorable character and control: 6512 code points in 340 ranges), then the
-- folding table, 329 characters to their letters or digits. ASCII text skips NFKD,
-- which changes no ASCII, and uses the table's and the removals' ASCII rows alone.
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
      translate(
        regexp_replace(normalize(p_text, nfkd),
          U&'[\0001-\0008\000E-\001F\007F-\0084\0086-\009F\00AD\0300-\036F\0483-\0489\0591-\05BD' ||
          U&'\05BF\05C1-\05C2\05C4-\05C5\05C7\0610-\061A\061C\064B-\065F\0670\06D6-\06DC\06DF-' ||
          U&'\06E4\06E7-\06E8\06EA-\06ED\0711\0730-\074A\07A6-\07B0\07EB-\07F3\07FD\0816-\0819' ||
          U&'\081B-\0823\0825-\0827\0829-\082D\0859-\085B\0897-\089F\08CA-\08E1\08E3-\0903\093A-' ||
          U&'\093C\093E-\094F\0951-\0957\0962-\0963\0981-\0983\09BC\09BE-\09C4\09C7-\09C8\09CB-' ||
          U&'\09CD\09D7\09E2-\09E3\09FE\0A01-\0A03\0A3C\0A3E-\0A42\0A47-\0A48\0A4B-\0A4D\0A51' ||
          U&'\0A70-\0A71\0A75\0A81-\0A83\0ABC\0ABE-\0AC5\0AC7-\0AC9\0ACB-\0ACD\0AE2-\0AE3\0AFA-' ||
          U&'\0AFF\0B01-\0B03\0B3C\0B3E-\0B44\0B47-\0B48\0B4B-\0B4D\0B55-\0B57\0B62-\0B63\0B82' ||
          U&'\0BBE-\0BC2\0BC6-\0BC8\0BCA-\0BCD\0BD7\0C00-\0C04\0C3C\0C3E-\0C44\0C46-\0C48\0C4A-' ||
          U&'\0C4D\0C55-\0C56\0C62-\0C63\0C81-\0C83\0CBC\0CBE-\0CC4\0CC6-\0CC8\0CCA-\0CCD\0CD5-' ||
          U&'\0CD6\0CE2-\0CE3\0CF3\0D00-\0D03\0D3B-\0D3C\0D3E-\0D44\0D46-\0D48\0D4A-\0D4D\0D57' ||
          U&'\0D62-\0D63\0D81-\0D83\0DCA\0DCF-\0DD4\0DD6\0DD8-\0DDF\0DF2-\0DF3\0E31\0E34-\0E3A' ||
          U&'\0E47-\0E4E\0EB1\0EB4-\0EBC\0EC8-\0ECE\0F18-\0F19\0F35\0F37\0F39\0F3E-\0F3F\0F71-' ||
          U&'\0F84\0F86-\0F87\0F8D-\0F97\0F99-\0FBC\0FC6\102B-\103E\1056-\1059\105E-\1060\1062-' ||
          U&'\1064\1067-\106D\1071-\1074\1082-\108D\108F\109A-\109D\115F-\1160\135D-\135F\1712-' ||
          U&'\1715\1732-\1734\1752-\1753\1772-\1773\17B4-\17D3\17DD\180B-\180F\1885-\1886\18A9' ||
          U&'\1920-\192B\1930-\193B\1A17-\1A1B\1A55-\1A5E\1A60-\1A7C\1A7F\1AB0-\1ADD\1AE0-\1AEB' ||
          U&'\1B00-\1B04\1B34-\1B44\1B6B-\1B73\1B80-\1B82\1BA1-\1BAD\1BE6-\1BF3\1C24-\1C37\1CD0-' ||
          U&'\1CD2\1CD4-\1CE8\1CED\1CF4\1CF7-\1CF9\1DC0-\1DFF\200B-\200F\202A-\202E\2060-\206F' ||
          U&'\20D0-\20F0\2CEF-\2CF1\2D7F\2DE0-\2DFF\302A-\302F\3099-\309A\3164\A66F-\A672\A674-' ||
          U&'\A67D\A69E-\A69F\A6F0-\A6F1\A802\A806\A80B\A823-\A827\A82C\A880-\A881\A8B4-\A8C5' ||
          U&'\A8E0-\A8F1\A8FF\A926-\A92D\A947-\A953\A980-\A983\A9B3-\A9C0\A9E5\AA29-\AA36\AA43' ||
          U&'\AA4C-\AA4D\AA7B-\AA7D\AAB0\AAB2-\AAB4\AAB7-\AAB8\AABE-\AABF\AAC1\AAEB-\AAEF\AAF5-' ||
          U&'\AAF6\ABE3-\ABEA\ABEC-\ABED\FB1E\FE00-\FE0F\FE20-\FE2F\FEFF\FFA0\FFF0-\FFF8\+0101FD' ||
          U&'\+0102E0\+010376-\+01037A\+010A01-\+010A03\+010A05-\+010A06\+010A0C-\+010A0F' ||
          U&'\+010A38-\+010A3A\+010A3F\+010AE5-\+010AE6\+010D24-\+010D27\+010D69-\+010D6D' ||
          U&'\+010EAB-\+010EAC\+010EFA-\+010EFF\+010F46-\+010F50\+010F82-\+010F85\+011000-' ||
          U&'\+011002\+011038-\+011046\+011070\+011073-\+011074\+01107F-\+011082\+0110B0-' ||
          U&'\+0110BA\+0110C2\+011100-\+011102\+011127-\+011134\+011145-\+011146\+011173\+011180' ||
          U&'-\+011182\+0111B3-\+0111C0\+0111C9-\+0111CC\+0111CE-\+0111CF\+01122C-\+011237' ||
          U&'\+01123E\+011241\+0112DF-\+0112EA\+011300-\+011303\+01133B-\+01133C\+01133E-' ||
          U&'\+011344\+011347-\+011348\+01134B-\+01134D\+011357\+011362-\+011363\+011366-' ||
          U&'\+01136C\+011370-\+011374\+0113B8-\+0113C0\+0113C2\+0113C5\+0113C7-\+0113CA\+0113CC' ||
          U&'-\+0113D0\+0113D2\+0113E1-\+0113E2\+011435-\+011446\+01145E\+0114B0-\+0114C3' ||
          U&'\+0115AF-\+0115B5\+0115B8-\+0115C0\+0115DC-\+0115DD\+011630-\+011640\+0116AB-' ||
          U&'\+0116B7\+01171D-\+01172B\+01182C-\+01183A\+011930-\+011935\+011937-\+011938' ||
          U&'\+01193B-\+01193E\+011940\+011942-\+011943\+0119D1-\+0119D7\+0119DA-\+0119E0' ||
          U&'\+0119E4\+011A01-\+011A0A\+011A33-\+011A39\+011A3B-\+011A3E\+011A47\+011A51-' ||
          U&'\+011A5B\+011A8A-\+011A99\+011B60-\+011B67\+011C2F-\+011C36\+011C38-\+011C3F' ||
          U&'\+011C92-\+011CA7\+011CA9-\+011CB6\+011D31-\+011D36\+011D3A\+011D3C-\+011D3D' ||
          U&'\+011D3F-\+011D45\+011D47\+011D8A-\+011D8E\+011D90-\+011D91\+011D93-\+011D97' ||
          U&'\+011EF3-\+011EF6\+011F00-\+011F01\+011F03\+011F34-\+011F3A\+011F3E-\+011F42' ||
          U&'\+011F5A\+013440\+013447-\+013455\+01611E-\+01612F\+016AF0-\+016AF4\+016B30-' ||
          U&'\+016B36\+016F4F\+016F51-\+016F87\+016F8F-\+016F92\+016FE4\+016FF0-\+016FF1\+01BC9D' ||
          U&'-\+01BC9E\+01BCA0-\+01BCA3\+01CF00-\+01CF2D\+01CF30-\+01CF46\+01D165-\+01D169' ||
          U&'\+01D16D-\+01D182\+01D185-\+01D18B\+01D1AA-\+01D1AD\+01D242-\+01D244\+01DA00-' ||
          U&'\+01DA36\+01DA3B-\+01DA6C\+01DA75\+01DA84\+01DA9B-\+01DA9F\+01DAA1-\+01DAAF\+01E000' ||
          U&'-\+01E006\+01E008-\+01E018\+01E01B-\+01E021\+01E023-\+01E024\+01E026-\+01E02A' ||
          U&'\+01E08F\+01E130-\+01E136\+01E2AE\+01E2EC-\+01E2EF\+01E4EC-\+01E4EF\+01E5EE-' ||
          U&'\+01E5EF\+01E6E3\+01E6E6\+01E6EE-\+01E6EF\+01E6F5\+01E8D0-\+01E8D6\+01E944-\+01E94A' ||
          U&'\+0E0000-\+0E0FFF]',
          '', 'g'),
        U&'ABCDEFGHIJKLMNOPQRSTUVWXYZ\00E6\00C6\0251\0180\0253\0181\0188\0187\023C\023B\0111' ||
        U&'\0110\00F0\00D0\0257\018A\0256\0189\0221\0247\0246\025B\0190\0192\0191\01E5\01E4\0260' ||
        U&'\0193\0261\0127\0126\0131\0268\0197\0269\0196\0249\0248\0237\0199\0198\0138\0142\0141' ||
        U&'\019A\023D\026B\2C62\0234\026C\026D\0271\014B\014A\0272\019D\019E\0220\0235\00F8\00D8' ||
        U&'\0153\0152\0275\019F\01A5\01A4\024B\024A\024D\024C\027D\00DF\1E9E\0282\023F\0167\0166' ||
        U&'\01AD\01AC\0288\01AE\0236\00FE\00DE\0289\0244\028B\01B2\024F\024E\01B4\01B3\01B6\01B5' ||
        U&'\0225\0224\0290\0291\0240\0430\0410\03B1\0391\0432\0412\044C\042C\03B2\0392\0441\0421' ||
        U&'\03C2\0501\0500\0435\0415\0454\0404\03B5\0395\0581\04BB\04BA\043D\041D\0397\0456\0406' ||
        U&'\04C0\04CF\03B9\0399\0458\0408\03F3\043A\041A\03BA\039A\043C\041C\039C\039D\03B7\043F' ||
        U&'\0438\0418\0578\043E\041E\03BF\039F\0585\0440\0420\03C1\03A1\051B\051A\0433\0455\0405' ||
        U&'\0442\0422\03C4\03A4\03C5\057D\03BD\0475\0474\051D\051C\03C9\0448\0428\0445\0425\03C7' ||
        U&'\03A7\0443\0423\04AF\04AE\03B3\03A5\0396\1D00\0299\1D04\1D05\1D07\A730\0262\029C\026A' ||
        U&'\1D0A\1D0B\029F\1D0D\0274\1D0F\1D18\A7AF\0280\A731\1D1B\1D1C\1D20\1D21\028F\1D22' ||
        U&'\+01F150\+01F151\+01F152\+01F153\+01F154\+01F155\+01F156\+01F157\+01F158\+01F159' ||
        U&'\+01F15A\+01F15B\+01F15C\+01F15D\+01F15E\+01F15F\+01F160\+01F161\+01F162\+01F163' ||
        U&'\+01F164\+01F165\+01F166\+01F167\+01F168\+01F169\+01F170\+01F171\+01F172\+01F173' ||
        U&'\+01F174\+01F175\+01F176\+01F177\+01F178\+01F179\+01F17A\+01F17B\+01F17C\+01F17D' ||
        U&'\+01F17E\+01F17F\+01F180\+01F181\+01F182\+01F183\+01F184\+01F185\+01F186\+01F187' ||
        U&'\+01F188\+01F189\A7F1\+01CCD6\+01CCD7\+01CCD8\+01CCD9\+01CCDA\+01CCDB\+01CCDC\+01CCDD' ||
        U&'\+01CCDE\+01CCDF\+01CCE0\+01CCE1\+01CCE2\+01CCE3\+01CCE4\+01CCE5\+01CCE6\+01CCE7' ||
        U&'\+01CCE8\+01CCE9\+01CCEA\+01CCEB\+01CCEC\+01CCED\+01CCEE\+01CCEF\+01CCF0\+01CCF1' ||
        U&'\+01CCF2\+01CCF3\+01CCF4\+01CCF5\+01CCF6\+01CCF7\+01CCF8\+01CCF9',
        'abcdefghijklmnopqrstuvwxyzaaabbbccccdddddddddeeeeffggggghhiiiiijjjkkklllllllllmnnnnnnno' ||
        'oooooppqqrrrsssstttttttttuuvvyyyyzzzzzzzaaaabbbbbbcccddeeeeeeghhhhhiiiiiijjjkkkkmmmnnnn' ||
        'nnoooooppppqqrssttttuuvvvwwwwwxxxxyyyyyyzabcdefghijklmnopqrstuvwyzabcdefghijklmnopqrstu' ||
        'vwxyzabcdefghijklmnopqrstuvwxyzsabcdefghijklmnopqrstuvwxyz0123456789')
  end
$$;

-- What a pass folds (the engine's passText): the text itself, or for the flips pass the
-- text with each capital I read as l.
create or replace function private.moderation_pass_text(p_text text, p_pass text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_pass = 'flips' then replace(p_text, 'I', 'l') else p_text end
$$;

-- Step 4 for one pass (the engine's applySwaps): swaps reads every swap character as its
-- letter; bangs first turns the exclamation marks that end a word into separators, edges
-- every swap character that ends a word, leads every one that starts a word, trims both,
-- starts only the text's first, finishes only its last and ends both; flips reads the i and l look-alikes the other
-- way round first; plain reads none. An unknown pass reads nothing (null).
create or replace function private.moderation_swaps(p_folded text, p_pass text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_pass
    when 'plain' then p_folded
    when 'swaps' then translate(p_folded, U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'bangs' then translate(
      regexp_replace(p_folded, U&'!+(?![abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])', ' ', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'edges' then translate(
      regexp_replace(p_folded, U&'[4@83\20AC691!\00A1|05$7+]+(?![abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])', ' ', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'leads' then translate(
      regexp_replace(p_folded, U&'(?<![abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])[4@83\20AC691!\00A1|05$7+]+', ' ', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'trims' then translate(
      regexp_replace(regexp_replace(p_folded, U&'(?<![abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])[4@83\20AC691!\00A1|05$7+]+', ' ', 'g'), U&'[4@83\20AC691!\00A1|05$7+]+(?![abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])', ' ', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'starts' then translate(
      regexp_replace(p_folded, U&'^([^abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+]*)[4@83\20AC691!\00A1|05$7+](?=[abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])', '\1 ', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'finishes' then translate(
      regexp_replace(p_folded, U&'(?<=[abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])[4@83\20AC691!\00A1|05$7+]([^abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+]*)$', ' \1', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'ends' then translate(
      regexp_replace(regexp_replace(p_folded, U&'^([^abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+]*)[4@83\20AC691!\00A1|05$7+](?=[abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])', '\1 ', 'g'), U&'(?<=[abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+])[4@83\20AC691!\00A1|05$7+]([^abcdefghijklmnopqrstuvwxyz4@83\20AC691!\00A1|05$7+]*)$', ' \1', 'g'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
    when 'flips' then translate(
      translate(p_folded, U&'1!\00A1|', 'llli'),
      U&'4@83\20AC691!\00A1|05$7+', 'aabeeggiiilosstt')
  end
$$;

-- What a term may add (the engine's pluralSuffix): s, or es after the letters that take it.
create or replace function private.moderation_plural(p_letters text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when right(coalesce(p_letters, ''), 1) <> '' and strpos('sxzho', right(p_letters, 1)) > 0
    then '(?:s+|e+s+)?' else '(?:s+)?' end
$$;

-- The passes every text is read in, in the engine's order (PASSES).
create or replace function private.moderation_passes()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['swaps', 'bangs', 'edges', 'leads', 'trims', 'starts', 'finishes', 'ends', 'flips', 'plain']::text[]
$$;
-- generated:moderation-sql:end

-- ---------------------------------------------------------------------------
-- Reading a text and compiling the list
-- ---------------------------------------------------------------------------

-- Steps 5 and 6 on swapped text (the engine's splitWords): everything but a
-- to z as separators, and a run of single letters joined into one word.
-- Empty for a text with no letters.
create or replace function private.moderation_split(p_swapped text)
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
  v_spaced := btrim(regexp_replace(p_swapped, '[^abcdefghijklmnopqrstuvwxyz]+', ' ', 'g'));
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

-- The words one pass reads in a text (the engine's normalizeForFilter).
create or replace function private.moderation_words(p_text text, p_pass text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select private.moderation_split(
    private.moderation_swaps(private.fold_text(private.moderation_pass_text(p_text, p_pass)), p_pass))
$$;

-- A string of letters run by run (the engine's runsPattern): each run of k
-- equal letters wants k or more ('+' for one, '{k,}' for more). With
-- p_lookalike (word terms) a lone i or l reads as a run of either, and a
-- longer run of i or l as that many of both mixed.
create or replace function private.moderation_runs(p_letters text, p_lookalike boolean)
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
      when coalesce(p_lookalike, false) and v_letter in ('i', 'l') and v_count = 1 then '(?:i+|l+)'
      when coalesce(p_lookalike, false) and v_letter in ('i', 'l') then '[il]' || v_bound
      else v_letter || v_bound
    end;
    v_at := v_at + v_count;
  end loop;
  return v_out;
end
$$;

-- A substring term split across whole words (the engine's spacedPattern):
-- one unit per letter with an optional space between units, then the
-- plural, so a match across separators starts at a word's first letter and
-- ends at a word's last.
create or replace function private.moderation_spaced(p_letters text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_to_string(array(
           select c.letter || '+'
             from regexp_split_to_table(p_letters, '') with ordinality as c(letter, n)
            order by c.n), ' ?'), '')
         || private.moderation_plural(p_letters)
$$;

-- The active lists compiled (the engine's moderationPatterns and
-- allowedWords). A word term adds its words run by run with look-alikes,
-- an optional space between them, then its plural; a substring term adds
-- its letters run by run (inside one word) and spaced (across whole
-- words). Alternatives are distinct and sorted in byte order, so both
-- sides build the same source.
create or replace function private.moderation_list()
returns private.moderation_list
language sql
stable
set search_path = ''
as $$
  with terms as (
    select t.match, w.words, array_to_string(w.words, '') as letters
      from private.moderation_terms t
     cross join lateral (select private.moderation_words(t.term, 'swaps') as words) w
     where t.active
       and cardinality(w.words) > 0
  ), alternatives as (
    select 'word' as kind,
           array_to_string(array(
             select private.moderation_runs(x.word, true)
               from unnest(t.words) with ordinality as x(word, n)
              order by x.n), ' ?') || private.moderation_plural(t.letters) as alternative
      from terms t
     where t.match = 'word'
    union
    select 'inside', private.moderation_runs(t.letters, false)
      from terms t
     where t.match = 'substring'
    union
    select 'whole', private.moderation_spaced(t.letters)
      from terms t
     where t.match = 'substring'
  ), allowed as (
    select distinct (private.moderation_words(a.word, 'swaps'))[1] as word
      from private.moderation_allow a
     where a.active
       and cardinality(private.moderation_words(a.word, 'swaps')) = 1
  )
  select row(
    coalesce((select array_agg(a.word order by a.word collate "C") from allowed a), '{}'::text[]),
    (select ' (?:' || string_agg(a.alternative, '|' order by a.alternative collate "C") || ') '
       from alternatives a
      where a.kind = 'word'),
    (select '(?:' || string_agg(a.alternative, '|' order by a.alternative collate "C") || ')'
       from alternatives a
      where a.kind = 'inside')
    || (select '|(?: (?:' || string_agg(a.alternative, '|' order by a.alternative collate "C") || ') )'
          from alternatives a
         where a.kind = 'whole')
  )::private.moderation_list
$$;

-- ---------------------------------------------------------------------------
-- The verdict
-- ---------------------------------------------------------------------------

-- True when the text holds a term of the list in any pass (the engine's
-- isBlocked). Each pass's words are tested with one space between and
-- around them, an allowlisted word standing as a | that no match can span;
-- word terms are tested again against all the words run together. Null
-- text is never blocked.
create or replace function private.text_blocked_by(p_text text, p_list private.moderation_list)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_folded text;
  v_flipped text;
  v_pass text;
  v_words text[];
  v_marked text[];
begin
  if p_text is null or p_list is null
     or (p_list.word_re is null and p_list.substring_re is null) then
    return false;
  end if;
  v_folded := private.fold_text(p_text);
  v_flipped := case
    when strpos(p_text, 'I') > 0 then private.fold_text(private.moderation_pass_text(p_text, 'flips'))
    else v_folded
  end;
  foreach v_pass in array private.moderation_passes() loop
    v_words := private.moderation_split(private.moderation_swaps(
      case when v_pass = 'flips' then v_flipped else v_folded end, v_pass));
    continue when cardinality(v_words) = 0;
    select array_agg(case when w.word = any(coalesce(p_list.allow, '{}'::text[])) then '|' else w.word end
                     order by w.n)
      into v_marked
      from unnest(v_words) with ordinality as w(word, n);
    if p_list.word_re is not null then
      if (' ' || array_to_string(v_marked, ' ') || ' ') ~ p_list.word_re then
        return true;
      end if;
      if cardinality(v_marked) > 1
         and (' ' || array_to_string(v_marked, '') || ' ') ~ p_list.word_re then
        return true;
      end if;
    end if;
    if p_list.substring_re is not null
       and (' ' || array_to_string(v_marked, ' ') || ' ') ~ p_list.substring_re then
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

-- True for a stored nickname that the player typed: neither null, nor the
-- friendly name, nor an active generated pair.
create or replace function private.is_custom_name(p_nickname text, p_friendly text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_nickname is not null
     and p_nickname is distinct from p_friendly
     and not private.is_generated_name(p_nickname)
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

-- ---------------------------------------------------------------------------
-- The age band
-- ---------------------------------------------------------------------------

-- 20261104000400_identity's set_age_band, with one rule added now that
-- set_nickname can store a custom name: moving to 13_17 clears a custom
-- nickname (one that is neither the friendly name nor an active generated
-- pair), since 13 to 17 get generated names only (PRD §3.10.6). The player
-- shows the friendly name again. Profile.
create or replace function public.set_age_band(p_player uuid, p_secret text, p_band text, p_moment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.auth_result;
  v_limit private.limit_result;
begin
  if private.over_cap(p_band) or private.over_cap(p_moment) then
    return private.err('invalid_input');
  end if;
  v_auth := private.authenticate(p_player, p_secret, false);
  if v_auth.code is not null then
    return private.auth_refusal(v_auth);
  end if;
  v_limit := private.hit_player('age_band_1d', v_auth.player_id);
  if not v_limit.allowed then
    return private.auth_limited(v_auth, v_limit);
  end if;
  if p_band is null or p_band not in ('13_17', '18_plus')
     or p_moment is null or p_moment not in ('nickname', 'group', 'reminder', 'quiz_share', 'room_name') then
    return private.err('invalid_input');
  end if;
  begin
    update private.players p
       set age_band = p_band,
           age_band_set_at = case when p.age_band is distinct from p_band then private.now() else p.age_band_set_at end,
           nickname = case when p_band = '13_17' and private.is_custom_name(p.nickname, p.friendly_name)
                           then null else p.nickname end
     where p.id = v_auth.player_id
       and (p.age_band is distinct from p_band
            or (p_band = '13_17' and private.is_custom_name(p.nickname, p.friendly_name)));
    return private.ok(private.profile_json(v_auth.player_id));
  exception
    when others then
      return private.fail_internal('set_age_band', sqlstate, sqlerrm);
  end;
end
$$;
