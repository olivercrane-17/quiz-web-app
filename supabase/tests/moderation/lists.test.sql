-- The slur filter's lists in SQL (ARCHITECTURE §8.13; MOD-1): what
-- private.moderation_list compiles from the active rows, how retiring a term
-- or an allowlisted word (active = false, never a removal) takes it out of
-- the verdict, how the run patterns read, which names count as generated,
-- and that nothing is ever blocked without a list or a text. The fixture
-- and real-list parity tests are in tests/generated/.
begin;

-- The compiled list follows the active rows.
do $$
declare
  v_list private.moderation_list;
begin
  update private.moderation_terms set active = false where active;
  update private.moderation_allow set active = false where active;
  v_list := private.moderation_list();
  assert v_list.allow = '{}'::text[] and v_list.word_re is null and v_list.substring_re is null,
    format('no active rows compile to nothing: %s', v_list);
  assert not private.text_is_blocked('zorblax hen'), 'nothing is blocked without a list';

  insert into private.moderation_terms (term, match, active)
  values ('hen', 'word', true), ('zorblax', 'substring', true), ('no go', 'word', true),
         ('wibblewobble', 'substring', false)
  on conflict (term) do update set match = excluded.match, active = excluded.active;
  insert into private.moderation_allow (word, active)
  values ('Zorblaxton', true), ('two words', true), ('Zorblaxville', false)
  on conflict (word) do update set active = excluded.active;
  v_list := private.moderation_list();
  assert v_list.word_re = ' (?:h+e+n+(?:s+)?|n+o+ ?g+o+(?:s+|e+s+)?) ',
    format('the word pattern is %s', v_list.word_re);
  assert v_list.substring_re = '(?:z+o+r+b+l+a+x+)|(?: (?:z+ ?o+ ?r+ ?b+ ?l+ ?a+ ?x+(?:s+|e+s+)?) )',
    format('the substring pattern is %s', v_list.substring_re);
  assert v_list.allow = array['zorblaxton']::text[], format('one-word active entries only: %s', v_list.allow);

  assert private.text_is_blocked('XXzorblaxYY'), 'an active substring term';
  assert not private.text_is_blocked('Zorblaxton Road'), 'an allowlisted word';
  assert private.text_is_blocked('Zorblaxville'), 'a retired allowlist entry allows nothing';
  assert not private.text_is_blocked('wibblewobble'), 'a retired term blocks nothing';

  update private.moderation_terms set active = false where term = 'zorblax';
  assert not private.text_is_blocked('XXzorblaxYY'), 'retiring a term takes it out at once';
  update private.moderation_terms set active = true where term = 'zorblax';
  assert private.text_is_blocked('XXzorblaxYY'), 'and bringing it back returns it';
end
$$;
select 'PASS MOD-1 the compiled list follows the active rows: retired terms and allowlist entries leave the verdict without a removal';

-- The pieces: run patterns, null handling, generated names.
do $$
begin
  assert private.moderation_runs('hen', false) = 'h+e+n+', 'runs of one';
  assert private.moderation_runs('quibbler', false) = 'q+u+i+b{2,}l+e+r+', 'a substring term reads i and l as they are';
  assert private.moderation_runs('quibbler', true) = 'q+u+(?:i+|l+)b{2,}(?:i+|l+)e+r+', 'a word term: i and l alike';
  assert private.moderation_runs('ill', true) = '(?:i+|l+)[il]{2,}', 'a double i or l may mix them';
  assert private.moderation_runs('', true) = '' and private.moderation_runs(null, false) = '', 'no letters';
  assert private.moderation_spaced('hen') = 'h+ ?e+ ?n+(?:s+)?', 'spaced letters and a plural';
  assert private.moderation_spaced('box') = 'b+ ?o+ ?x+(?:s+|e+s+)?', 'es after x';
  assert private.moderation_plural(null) = '(?:s+)?', 'a plural for no letters';
  assert private.moderation_passes() = array['swaps', 'bangs', 'edges', 'leads', 'trims', 'starts',
    'finishes', 'ends', 'flips', 'plain']::text[], 'the passes in order';

  assert private.fold_text(null) is null, 'fold_text(null)';
  assert private.moderation_words(null, 'swaps') = '{}'::text[], 'no words in null';
  assert private.moderation_words('hen', 'no such pass') = '{}'::text[], 'an unknown pass reads nothing';
  assert not private.text_blocked_by(null, private.moderation_list()), 'null text';
  assert not private.text_blocked_by('hen', null), 'no list';
  assert not private.text_is_blocked(null), 'text_is_blocked(null)';

  insert into private.name_parts (kind, word, active)
  values ('adjective', 'Brave', true), ('animal', 'Heron', true), ('adjective', 'Gloomy', false)
  on conflict (kind, word) do update set active = excluded.active;
  assert private.is_generated_name('Brave Heron'), 'an active pair';
  assert not private.is_generated_name('Gloomy Heron'), 'a retired adjective';
  assert not private.is_generated_name('Heron Brave'), 'the wrong order';
  assert not private.is_generated_name('Brave  Heron'), 'two spaces';
  assert not private.is_generated_name('Brave Heron Heron'), 'three words';
  assert not private.is_generated_name(''), 'empty';
  assert not private.is_generated_name(null), 'null';
end
$$;
select 'PASS MOD-1 run patterns, null texts and lists, and generated names read as the engine and set_nickname expect';
rollback;
