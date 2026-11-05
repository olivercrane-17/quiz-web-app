-- The release loaders (ARCHITECTURE §5.4; SQL-3): a release loads content
-- before schedule, so a schedule ahead of its content never verifies or
-- records; record_release writes the record last and once per version;
-- Daily numbers match the epoch; loading a release again changes nothing;
-- room packs load whole; what the next release stops naming is withdrawn;
-- a release whose chunks did not all load is never recorded and withdraws
-- nothing; an older release is never sent again; and a hostable room pack
-- never shares a question with a Daily still to close or an unused spare
-- set. It plays in 2099, after every real Daily, and writes the config it
-- reads, so it passes on a live database.
begin;

select private.t_now('2099-01-01T00:00:00Z');
insert into private.config (key, value)
values ('daily_epoch', '"2099-01-01"'), ('egress_sample_rate', '0')
on conflict (key) do update set value = excluded.value;
insert into private.categories (id, slug, name, short_name)
values ('geo', 'geography', 'Geography', 'Geography'), ('film', 'film-tv', 'Film & TV', 'Film & TV'),
       ('sci', 'science-tech', 'Science & Tech', 'Science & Tech'), ('art', 'art-design', 'Art & Design', 'Art & Design')
on conflict (id) do nothing;
insert into private.answer_entities (answer_type, entity_id, display, option_label)
select t, 'x.' || t || '.qz-' || s, s, s
  from unnest(array['country', 'film', 'element']) t, unnest(array['a', 'b', 'c', 'd']) s
on conflict (answer_type, entity_id) do update set active = true;

create function private.t_m(p_id text, p_type text, p_slot integer, p_clue text default 'c1')
returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_object('id', p_id,
    'category', case p_type when 'country' then 'geo' when 'film' then 'film' else 'sci' end,
    'answer_type', p_type, 'answer_entity', 'x.' || p_type || '.qz-a', 'accepted_entities', '[]'::jsonb,
    'clues', jsonb_build_array(p_clue, 'c2', 'c3', 'c4'),
    'distractors', jsonb_build_array('x.' || p_type || '.qz-b', 'x.' || p_type || '.qz-c', 'x.' || p_type || '.qz-d'),
    'slot', p_slot, 'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb,
    'review_by', null, 'status', 'active')
$f$;
create function private.t_e(p_id text) returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_object('id', p_id, 'category', 'art', 'question', 'q', 'unit', 'steps', 'unit_short', 'steps',
    'unit_label', 'steps', 'value_kind', 'quantity', 'answer', 212, 'decimals', 0, 'bullseye', null, 'close', null,
    'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null, 'status', 'active')
$f$;
create function private.t_r(p_set text) returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_array(
    jsonb_build_object('type', 'mystery', 'difficulty', 'easy', 'contentId', 'm.geo.99' || p_set),
    jsonb_build_object('type', 'mystery', 'difficulty', 'medium', 'contentId', 'm.film.99' || p_set),
    jsonb_build_object('type', 'mystery', 'difficulty', 'hard', 'contentId', 'm.sci.99' || p_set),
    jsonb_build_object('type', 'encore', 'difficulty', null, 'contentId', 'e.99' || p_set))
$f$;
create function private.t_d(p_date date, p_set text, p_ready boolean default true)
returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_object('date', p_date, 'daily_number', (p_date - date '2099-01-01') + 1,
    'rounds', private.t_r(p_set), 'ready', p_ready, 'spare_order', '[]'::jsonb)
$f$;

-- Content before schedule.
do $$
declare
  v jsonb;
begin
  perform private.release_dailies('t-early', 'main', jsonb_build_array(private.t_d('2099-01-10', '01')));
  begin
    perform private.record_release('t-early', 'main', repeat('a', 64), '{}');
    raise exception 'a release whose content never loaded was recorded';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-early does not verify on the main track%daily 2099-01-10%m.geo.9901%missing%' then
        raise;
      end if;
  end;
  assert not exists (select 1 from private.content_releases r where r.version = 't-early'), 'the early release was recorded';

  v := private.release_mysteries('t-1', 'main', jsonb_build_array(
    private.t_m('m.geo.9901', 'country', 1), private.t_m('m.film.9901', 'film', 2), private.t_m('m.sci.9901', 'element', 3),
    private.t_m('m.geo.9902', 'country', 1), private.t_m('m.film.9902', 'film', 2), private.t_m('m.sci.9902', 'element', 3)));
  assert v = '{"rows": 6, "table": "mysteries", "updated": 0, "inserted": 6, "unchanged": 0}', format('mysteries: %s', v);
  v := private.release_encores('t-1', 'main', jsonb_build_array(private.t_e('e.9901'), private.t_e('e.9902')));
  assert v ->> 'inserted' = '2', format('encores: %s', v);
  v := private.release_dailies('t-1', 'main', jsonb_build_array(
    private.t_d('2099-01-10', '01'), private.t_d('2099-01-11', '01', false), private.t_d('2099-01-13', '02')));
  assert v ->> 'inserted' = '2' and v ->> 'unchanged' = '1', format('dailies: %s', v);
  v := private.release_spares('t-1', 'main', jsonb_build_array(jsonb_build_object('id', 'spare.01', 'rounds', private.t_r('02'))));
  assert v ->> 'inserted' = '1', format('spares: %s', v);
  v := private.verify_release('t-1', 'main');
  assert v ->> 'dailies' = '3' and v ->> 'spares' = '1', format('verify_release: %s', v);
  v := private.record_release('t-1', 'main', repeat('b', 64),
    '{"mysteries": 6, "encores": 2, "sealed_questions": 0, "dailies": 3, "daily_spares": 1}');
  assert v ->> 'recorded' = 'true', format('record_release: %s', v);
  assert exists (select 1 from private.content_releases r where r.version = 't-1' and r.track = 'main'
                  and r.content_hash = repeat('b', 64) and r.counts ->> 'dailies' = '3'), 'the record';

  assert (select row(d.daily_number, d.composition, d.max_points, d.status, d.ready, d.release_version)::text
            from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10')
         = row(10, 'm3e1', 12::smallint, 'scheduled', true, 't-1')::text, 'the Daily for 2099-01-10';
  assert not (select d.ready from private.dailies d where d.track = 'main' and d.local_date = '2099-01-11'),
    'the Daily without pass D is not ready';
  assert (select d.rounds -> 3 from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10')
         = '{"type": "encore", "voided": false, "contentId": "e.9901", "difficulty": null}', 'rounds carry void flags';
  assert exists (select 1 from private.daily_spares s where s.track = 'main' and s.id = 'spare.01'
                  and s.composition = 'm3e1' and s.max_points = 12 and s.active and s.used_for_date is null), 'the spare set';
  assert (select m.content_hash ~ '^[0-9a-f]{64}$' and m.status = 'active' and m.track = 'main'
            from private.mysteries m where m.id = 'm.geo.9901'), 'the mystery row';
end
$$;
select 'PASS SQL-3 a release loads content before schedule: a schedule ahead of its content neither verifies nor records';

do $$
declare
  v jsonb;
begin
  v := private.release_mysteries('t-1', 'main', jsonb_build_array(
    private.t_m('m.geo.9901', 'country', 1), private.t_m('m.film.9901', 'film', 2), private.t_m('m.sci.9901', 'element', 3)));
  assert v ->> 'unchanged' = '3', format('mysteries again: %s', v);
  v := private.release_dailies('t-1', 'main', jsonb_build_array(
    private.t_d('2099-01-10', '01'), private.t_d('2099-01-11', '01', false), private.t_d('2099-01-13', '02')));
  assert v ->> 'unchanged' = '3', format('dailies again: %s', v);
  v := private.record_release('t-1', 'main', repeat('b', 64),
    '{"mysteries": 6, "encores": 2, "sealed_questions": 0, "dailies": 3, "daily_spares": 1}');
  assert v ->> 'recorded' = 'false', format('recorded twice: %s', v);
  begin
    perform private.record_release('t-1', 'main', repeat('c', 64), '{"dailies": 3}');
    raise exception 'a version was recorded again with other content';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-1: that version was recorded with other content%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-3 loading a release again changes nothing, and a version is recorded once, with its own content';

do $$
begin
  begin
    perform private.release_dailies('t-2', 'main', jsonb_build_array(
      private.t_d('2099-01-12', '01') || '{"daily_number": 13}'));
    raise exception 'a Daily numbered off the epoch loaded';
  exception
    when raise_exception then
      if sqlerrm not like '%the Daily for 2099-01-12 carries number 13, but DAILY_EPOCH 2099-01-01 makes it 12%' then
        raise;
      end if;
  end;
  update private.config set value = 'null' where key = 'daily_epoch';
  begin
    perform private.release_dailies('t-2', 'main', jsonb_build_array(private.t_d('2099-01-12', '01')));
    raise exception 'a Daily loaded with no epoch';
  exception
    when raise_exception then
      if sqlerrm not like '%daily_epoch is not set%' then
        raise;
      end if;
  end;
  update private.config set value = '"2099-01-01"' where key = 'daily_epoch';
  assert not exists (select 1 from private.dailies d
                      where d.local_date >= '2099-01-01' and d.daily_number <> private.daily_number_for(d.local_date)),
    'a Daily off the epoch';
end
$$;
select 'PASS SQL-3 Daily numbers match the epoch: a release numbered otherwise, or loaded with no epoch, is refused';

do $$
declare
  v_ids jsonb := (select jsonb_agg('r.qz-pack.' || lpad(n::text, 2, '0') order by n) from generate_series(1, 15) n);
begin
  perform private.release_questions('t-3', 'main', (
    select jsonb_agg(jsonb_build_object('id', q #>> '{}', 'format', 'mc', 'category', 'geo', 'stem', 's',
             'options', '["a", "b", "c", "d"]'::jsonb, 'correct', 0, 'option_order', 'shuffle', 'value_display', null,
             'explanation', 'x', 'learn_more', 'x', 'review_by', null, 'status', 'active'))
      from jsonb_array_elements(v_ids) q));
  perform private.release_room_packs('t-3', 'main', jsonb_build_array(
    jsonb_build_object('id', 'qz-pack', 'title', 't', 'theme', 't', 'question_ids', v_ids)));
  assert exists (select 1 from private.room_packs p where p.id = 'qz-pack' and p.track = 'main' and p.status = 'active'
                  and p.question_ids = array(select jsonb_array_elements_text(v_ids))), 'the room pack';
  perform private.verify_release('t-3', 'main');
  perform private.release_room_packs('t-3', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'qz-pack', 'title', 't', 'theme', 't', 'question_ids', (v_ids - 14) || '["r.qz-pack.99"]')));
  begin
    perform private.verify_release('t-3', 'main');
    raise exception 'a room pack naming a missing question verified';
  exception
    when raise_exception then
      if sqlerrm not like '%room pack qz-pack%r.qz-pack.99%missing%' then
        raise;
      end if;
  end;
  perform private.release_room_packs('t-3', 'main', jsonb_build_array(
    jsonb_build_object('id', 'qz-pack', 'title', 't', 'theme', 't', 'question_ids', v_ids)));
end
$$;
select 'PASS SQL-3 room packs load whole, and a pack naming a question the track lacks does not verify';

do $$
declare
  v jsonb;
begin
  perform private.t_now('2099-01-02T00:00:00Z');
  v := private.release_dailies('t-4', 'main', jsonb_build_array(private.t_d('2099-01-10', '01')));
  v := private.record_release('t-4', 'main', repeat('d', 64), '{"dailies": 1, "daily_spares": 0}');
  assert v ->> 'recorded' = 'true', format('record_release: %s', v);
  assert not (select d.ready from private.dailies d where d.track = 'main' and d.local_date = '2099-01-13')
     and (select d.ready from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10'),
    'the Daily the release no longer names loses its ready flag, the one it names keeps it';
  assert not (select s.active from private.daily_spares s where s.track = 'main' and s.id = 'spare.01'),
    'the spare set the release no longer names is inactive';
  assert exists (select 1 from private.alerts a where a.kind = 'content_withdrawn' and a.detail ->> 'item' = 'main:t-4'
                  and a.detail -> 'dailies' ? '2099-01-13' and a.detail -> 'spares' ? 'spare.01'), 'the owner hears of it';
end
$$;
select 'PASS SQL-3 a Daily or spare set the next release stops naming is withdrawn, with an alert';

do $$
declare
  v jsonb;
begin
  -- t-5 loads 2099-01-10 and 2099-01-12 in a chunk each, and records.
  perform private.t_now('2099-01-03T00:00:00Z');
  perform private.release_dailies('t-5', 'main', jsonb_build_array(private.t_d('2099-01-10', '01')));
  perform private.release_dailies('t-5', 'main', jsonb_build_array(private.t_d('2099-01-12', '02')));
  v := private.record_release('t-5', 'main', repeat('e', 64), '{"dailies": 2, "daily_spares": 0}');
  assert v ->> 'recorded' = 'true', format('t-5: %s', v);

  -- t-6 names the same two Dailies, but its second chunk never loads: recording it would withdraw 2099-01-12.
  perform private.t_now('2099-01-04T00:00:00Z');
  perform private.release_dailies('t-6', 'main', jsonb_build_array(private.t_d('2099-01-10', '01')));
  begin
    perform private.record_release('t-6', 'main', repeat('f', 64), '{"dailies": 2, "daily_spares": 0}');
    raise exception 'a release with a chunk missing was recorded';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-6: its chunks did not all load (rows loaded of rows in the release: dailies 1 of 2)%' then
        raise;
      end if;
  end;
  assert not exists (select 1 from private.content_releases r where r.version = 't-6'), 'the partial release was recorded';
  assert (select d.ready and d.release_version = 't-5' from private.dailies d
           where d.track = 'main' and d.local_date = '2099-01-12'), 'the Daily of the missing chunk was withdrawn';
  assert not exists (select 1 from private.alerts a where a.kind = 'content_withdrawn' and a.detail ->> 'item' = 'main:t-6'),
    'the partial release withdrew something';

  -- Every chunk, the first one twice: a chunk sent again counts once, and the release records.
  perform private.release_dailies('t-6', 'main', jsonb_build_array(private.t_d('2099-01-10', '01')));
  perform private.release_dailies('t-6', 'main', jsonb_build_array(private.t_d('2099-01-12', '02')));
  v := private.record_release('t-6', 'main', repeat('f', 64), '{"dailies": 2, "daily_spares": 0}');
  assert v ->> 'recorded' = 'true' and v ->> 'withdrawn_dailies' = '0', format('t-6: %s', v);
end
$$;
select 'PASS SQL-3 a release whose chunks did not all load is not recorded and withdraws nothing, and a chunk sent twice counts once';

do $$
declare
  v jsonb;
begin
  -- t-6 is the track's latest release: sending it again changes nothing.
  v := private.release_dailies('t-6', 'main', jsonb_build_array(private.t_d('2099-01-12', '02')));
  assert v ->> 'unchanged' = '1', format('the latest release again: %s', v);
  v := private.record_release('t-6', 'main', repeat('f', 64), '{"dailies": 2, "daily_spares": 0}');
  assert v ->> 'recorded' = 'false', format('the latest release recorded again: %s', v);

  -- t-5 and t-1 are older: their first chunk is refused before any row changes.
  begin
    perform private.release_mysteries('t-1', 'main', jsonb_build_array(private.t_m('m.geo.9901', 'country', 1, 'old clue')));
    raise exception 'an older release loaded again';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-1: superseded by release t-6 on the main track%' then
        raise;
      end if;
  end;
  assert (select m.clues[1] from private.mysteries m where m.id = 'm.geo.9901') = 'c1', 'the older release changed a mystery';
  begin
    perform private.release_dailies('t-5', 'main', jsonb_build_array(private.t_d('2099-01-12', '01')));
    raise exception 'an older release loaded again';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-5: superseded by release t-6 on the main track%' then
        raise;
      end if;
  end;
  assert (select d.rounds -> 0 ->> 'contentId' = 'm.geo.9902' and d.release_version = 't-6'
            from private.dailies d where d.track = 'main' and d.local_date = '2099-01-12'), 'the older release changed a Daily';

  -- A version recorded on one track is no release of the other.
  begin
    perform private.release_dailies('t-6', 'e2e', '[]');
    raise exception 'a main release loaded on the e2e track';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-6: that version is recorded on the main track, not e2e%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-3 an older release is never sent again: its first chunk is refused, while the latest one loads again as a no-op';

-- A loader call's refusal, or null when it loaded.
create function private.t_refused(p_sql text) returns text language plpgsql volatile set search_path = '' as $f$
begin
  execute p_sql;
  return null;
exception
  when raise_exception then
    return sqlerrm;
end
$f$;

do $$
declare
  v_ids jsonb := (select jsonb_agg('r.qz-quiz.' || lpad(n::text, 2, '0') order by n) from generate_series(1, 15) n);
  v_refusal text;
begin
  -- Fifteen choice questions; the Daily for 2099-01-14, which has not closed, plays the first.
  perform private.release_questions('t-7', 'main', (
    select jsonb_agg(jsonb_build_object('id', q #>> '{}', 'format', 'mc', 'category', 'geo', 'stem', 's',
             'options', '["a", "b", "c", "d"]'::jsonb, 'correct', 0, 'option_order', 'shuffle', 'value_display', null,
             'explanation', 'x', 'learn_more', 'x', 'review_by', null, 'status', 'active'))
      from jsonb_array_elements(v_ids) q));
  perform private.release_dailies('t-7', 'main', jsonb_build_array(jsonb_build_object(
    'date', '2099-01-14', 'daily_number', 14, 'ready', true, 'spare_order', '[]'::jsonb,
    'rounds', '[{"type": "mc", "difficulty": "easy", "contentId": "r.qz-quiz.01"},
                {"type": "encore", "difficulty": null, "contentId": "e.9901"}]'::jsonb)));

  -- A room pack is hostable as soon as it loads, so one holding that question is refused...
  v_refusal := private.t_refused(format($q$select private.release_room_packs('t-7', 'main', %L::jsonb)$q$,
    jsonb_build_array(jsonb_build_object('id', 'qz-quiz', 'title', 't', 'theme', 't', 'question_ids', v_ids))));
  assert v_refusal like '%room pack qz-quiz names question r.qz-quiz.01, which the main track plays on a Daily still to close%',
    format('a pack holding an upcoming Daily''s question: %s', v_refusal);
  assert not exists (select 1 from private.room_packs p where p.id = 'qz-quiz'), 'the pack loaded anyway';

  -- ...until that Daily has closed.
  perform private.t_now('2099-01-15T12:00:00Z');
  perform private.release_room_packs('t-7', 'main', jsonb_build_array(
    jsonb_build_object('id', 'qz-quiz', 'title', 't', 'theme', 't', 'question_ids', v_ids)));

  -- Then a Daily still to close, or a spare set that may yet fill one, may not play its questions.
  v_refusal := private.t_refused($q$select private.release_dailies('t-7', 'main', jsonb_build_array(jsonb_build_object(
    'date', '2099-01-20', 'daily_number', 20, 'ready', true, 'spare_order', '[]'::jsonb,
    'rounds', '[{"type": "mc", "difficulty": "easy", "contentId": "r.qz-quiz.02"},
                {"type": "encore", "difficulty": null, "contentId": "e.9901"}]'::jsonb)))$q$);
  assert v_refusal like '%the main Daily for 2099-01-20 plays question r.qz-quiz.02, which an active room pack holds%',
    format('a Daily playing a hostable question: %s', v_refusal);
  v_refusal := private.t_refused($q$select private.release_spares('t-7', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'spare.09', 'rounds', '[{"type": "mc", "difficulty": "easy", "contentId": "r.qz-quiz.03"},
                                  {"type": "encore", "difficulty": null, "contentId": "e.9901"}]'::jsonb)))$q$);
  assert v_refusal like '%main spare spare.09 plays question r.qz-quiz.03, which an active room pack holds%',
    format('a spare set playing a hostable question: %s', v_refusal);

  -- However such a row got there, verify_release names the pack and the question, and the release is not recorded.
  insert into private.dailies (track, daily_number, local_date, rounds, composition, max_points)
  values ('main', 21, '2099-01-21', '[{"type": "mc", "difficulty": "easy", "contentId": "r.qz-quiz.04", "voided": false},
                                      {"type": "encore", "difficulty": null, "contentId": "e.9901", "voided": false}]',
          'c1e1', 1);
  v_refusal := private.t_refused($q$select private.record_release('t-7', 'main', repeat('7', 64), '{"sealed_questions": 15, "room_packs": 1, "dailies": 1}')$q$);
  assert v_refusal like '%"at": "room pack qz-quiz", "id": "r.qz-quiz.04", "problem": "daily_question"%',
    format('verify_release and a hostable question on an upcoming Daily: %s', v_refusal);
  assert not exists (select 1 from private.content_releases r where r.version = 't-7'), 'recorded anyway';
end
$$;
select 'PASS SQL-3 a hostable room pack never holds a question that a Daily still to close or an unused spare set plays';

rollback;
