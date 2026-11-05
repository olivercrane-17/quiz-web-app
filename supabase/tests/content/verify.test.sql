-- verify_release (ARCHITECTURE §5.4; SQL-3) fails a release whose schedule
-- names a missing or inactive mystery, or whose mystery names an inactive
-- distractor, and the release then stays unrecorded. A Daily or spare set
-- of one track never names another track's items, a frozen Daily is
-- publish's to replace, not the release's to refuse, and a missing entity
-- is named by its field, never by its id. It plays in 2099 and writes the
-- config it reads, so it passes on a live database.
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
select t, p || 'x.' || t || '.qz-' || s, s, s
  from unnest(array['', 'fx.']) p, unnest(array['country', 'film', 'element']) t, unnest(array['a', 'b', 'c', 'd']) s
on conflict (answer_type, entity_id) do update set active = true;

create function private.t_m(p_id text, p_type text, p_slot integer, p_status text default 'active')
returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_object('id', p_id,
    'category', case p_type when 'country' then 'geo' when 'film' then 'film' else 'sci' end,
    'answer_type', p_type, 'answer_entity', coalesce(substring(p_id from '^fx\.'), '') || 'x.' || p_type || '.qz-a',
    'accepted_entities', '[]'::jsonb, 'clues', '["c1", "c2", "c3", "c4"]'::jsonb,
    'distractors', (select jsonb_agg(coalesce(substring(p_id from '^fx\.'), '') || 'x.' || p_type || '.qz-' || s)
                      from unnest(array['b', 'c', 'd']) s),
    'slot', p_slot, 'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb,
    'review_by', null, 'status', p_status)
$f$;
create function private.t_r(p_geo text, p_film text, p_sci text, p_encore text) returns jsonb
language sql immutable set search_path = '' as $f$
  select jsonb_build_array(
    jsonb_build_object('type', 'mystery', 'difficulty', 'easy', 'contentId', p_geo),
    jsonb_build_object('type', 'mystery', 'difficulty', 'medium', 'contentId', p_film),
    jsonb_build_object('type', 'mystery', 'difficulty', 'hard', 'contentId', p_sci),
    jsonb_build_object('type', 'encore', 'difficulty', null, 'contentId', p_encore))
$f$;
create function private.t_d(p_date date, p_rounds jsonb) returns jsonb
language sql immutable set search_path = '' as $f$
  select jsonb_build_object('date', p_date, 'daily_number', (p_date - date '2099-01-01') + 1,
    'rounds', p_rounds, 'ready', true, 'spare_order', '[]'::jsonb)
$f$;
-- verify_release's refusal, as the rule words it names.
create function private.t_refusal(p_version text, p_track text) returns text
language plpgsql volatile set search_path = '' as $f$
begin
  perform private.verify_release(p_version, p_track);
  return null;
exception
  when raise_exception then
    return sqlerrm;
end
$f$;

do $$
begin
  perform private.release_mysteries('t-v', 'main', jsonb_build_array(
    private.t_m('m.geo.9901', 'country', 1), private.t_m('m.film.9901', 'film', 2),
    private.t_m('m.sci.9901', 'element', 3), private.t_m('m.geo.9902', 'country', 1, 'retired')));
  perform private.release_encores('t-v', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'e.9901', 'category', 'art', 'question', 'q', 'unit', 'steps', 'unit_short', 'steps', 'unit_label', 'steps',
    'value_kind', 'quantity', 'answer', 212, 'decimals', 0, 'bullseye', null, 'close', null, 'explanation', 'x',
    'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null, 'status', 'active')));
  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-10', private.t_r('m.geo.9901', 'm.film.9901', 'm.sci.9901', 'e.9901'))));
  assert private.t_refusal('t-v', 'main') is null, private.t_refusal('t-v', 'main');

  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-11', private.t_r('m.geo.9999', 'm.film.9901', 'm.sci.9901', 'e.9901'))));
  assert private.t_refusal('t-v', 'main') like '%"daily 2099-01-11", "id": "m.geo.9999", "round": 0, "problem": "missing"%',
    format('a missing mystery: %s', private.t_refusal('t-v', 'main'));
  begin
    perform private.record_release('t-v', 'main', repeat('e', 64), '{}');
    raise exception 'a release naming a missing mystery was recorded';
  exception
    when raise_exception then
      if sqlerrm not like 'content release t-v does not verify%' then
        raise;
      end if;
  end;
  assert not exists (select 1 from private.content_releases r where r.version = 't-v'), 'recorded anyway';

  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-11', private.t_r('m.geo.9902', 'm.film.9901', 'm.sci.9901', 'e.9901'))));
  assert private.t_refusal('t-v', 'main') like '%"daily 2099-01-11", "id": "m.geo.9902", "round": 0, "problem": "inactive"%',
    format('a retired mystery: %s', private.t_refusal('t-v', 'main'));

  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-11', private.t_r('m.geo.9901', 'm.film.9901', 'm.sci.9901', 'e.9901'))));
  assert private.t_refusal('t-v', 'main') is null, private.t_refusal('t-v', 'main');
  update private.answer_entities set active = false where answer_type = 'film' and entity_id = 'x.film.qz-d';
  assert private.t_refusal('t-v', 'main') like '%"daily 2099-01-10", "id": "m.film.9901", "round": 1, "problem": "entity"%',
    format('an inactive distractor: %s', private.t_refusal('t-v', 'main'));
end
$$;
select 'PASS SQL-3 verify_release fails a release whose schedule names a missing or inactive mystery, or whose mystery names an inactive distractor, and nothing is recorded';

do $$
begin
  update private.answer_entities set active = true where answer_type = 'film' and entity_id = 'x.film.qz-d';
  -- A frozen Daily naming an inactive item is publish's to replace: the release still verifies.
  update private.dailies set status = 'frozen', frozen_at = private.now()
   where track = 'main' and local_date = '2099-01-10';
  perform private.release_mysteries('t-v', 'main', jsonb_build_array(private.t_m('m.sci.9901', 'element', 3, 'retired')), true);
  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-11', private.t_r('m.geo.9901', 'm.film.9901', 'm.sci.9903', 'e.9901'))));
  perform private.release_mysteries('t-v', 'main', jsonb_build_array(private.t_m('m.sci.9903', 'element', 3)));
  assert private.t_refusal('t-v', 'main') is null, format('a frozen Daily blocked the release: %s', private.t_refusal('t-v', 'main'));

  -- An unused spare set must name active items; a main Daily never names an e2e item.
  perform private.release_spares('t-v', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'spare.01', 'rounds', private.t_r('m.geo.9902', 'm.film.9901', 'm.sci.9903', 'e.9901'))));
  assert private.t_refusal('t-v', 'main') like '%"spare spare.01", "id": "m.geo.9902", "round": 0, "problem": "inactive"%',
    format('a spare set naming a retired mystery: %s', private.t_refusal('t-v', 'main'));
  perform private.release_spares('t-v', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'spare.01', 'rounds', private.t_r('m.geo.9901', 'm.film.9901', 'm.sci.9903', 'e.9901'))));
  perform private.release_mysteries('t-v', 'e2e', jsonb_build_array(private.t_m('fx.m.geo.9901', 'country', 1)));
  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-12', private.t_r('fx.m.geo.9901', 'm.film.9901', 'm.sci.9903', 'e.9901'))));
  assert private.t_refusal('t-v', 'main') like '%"daily 2099-01-12", "id": "fx.m.geo.9901", "round": 0, "problem": "track"%',
    format('a main Daily naming an e2e item: %s', private.t_refusal('t-v', 'main'));
end
$$;
select 'PASS SQL-3 verify_release holds spare sets to active items and every round to its own track, and leaves frozen Dailies to publish';

do $$
declare
  v_refusal text;
begin
  -- A mystery whose accepted answer, or one distractor, is missing from its list. An x.<type>.<slug> id spells
  -- out a name, and verify_release runs for every later release of the track, so it names the field, never the id.
  perform private.release_dailies('t-v', 'main', jsonb_build_array(
    private.t_d('2099-01-12', private.t_r('m.geo.9901', 'm.film.9901', 'm.sci.9903', 'e.9901'))));
  perform private.release_mysteries('t-v', 'main', jsonb_build_array(
    private.t_m('m.geo.9906', 'country', 1) || '{"accepted_entities": ["x.country.qz-republic-of-zed"]}'
                                            || '{"distractors": ["x.country.qz-b", "x.country.qz-zz", "x.country.qz-d"]}'));
  v_refusal := private.t_refusal('t-later', 'main');
  assert v_refusal like '%"at": "mystery m.geo.9906", "field": "accepted_entities[0]", "problem": "entity_missing"%'
     and v_refusal like '%"at": "mystery m.geo.9906", "field": "distractors[1]", "problem": "entity_missing"%'
     and v_refusal not like '%qz-republic-of-zed%' and v_refusal not like '%qz-zz%',
    format('a missing entity: %s', v_refusal);
end
$$;
select 'PASS SQL-3 verify_release names a missing entity by its field, never by its id';

rollback;
