-- Frozen rows are refused (ARCHITECTURE §5.4, §8.7; SQL-3): a release cannot
-- change a frozen Daily's rounds, an item on a frozen or opened Daily, or a
-- spare set that filled a date, unless --allow-frozen is passed for a
-- correction; no release changes the rounds of a Daily that has opened;
-- unchanged rows still load; and a date a spare took keeps it. It plays in
-- 2099 and writes the config it reads, so it passes on a live database.
begin;

select private.t_now('2099-01-01T00:00:00Z');
insert into private.config (key, value)
values ('daily_epoch', '"2099-01-01"'), ('freeze', '{"days_initial": 3, "days": 7, "switch_on": null}'),
       ('egress_sample_rate', '0')
on conflict (key) do update set value = excluded.value;
insert into private.categories (id, slug, name, short_name)
values ('geo', 'geography', 'Geography', 'Geography'), ('film', 'film-tv', 'Film & TV', 'Film & TV'),
       ('sci', 'science-tech', 'Science & Tech', 'Science & Tech'), ('art', 'art-design', 'Art & Design', 'Art & Design')
on conflict (id) do nothing;
insert into private.answer_entities (answer_type, entity_id, display, option_label)
select t, 'x.' || t || '.qz-' || s, s, s
  from unnest(array['country', 'film', 'element']) t, unnest(array['a', 'b', 'c', 'd']) s
on conflict (answer_type, entity_id) do update set active = true;
-- Spare sets of the real schedule must not fill this file's gaps.
update private.daily_spares set active = false where track = 'main' and active;

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
create function private.t_r(p_set text) returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_array(
    jsonb_build_object('type', 'mystery', 'difficulty', 'easy', 'contentId', 'm.geo.99' || p_set),
    jsonb_build_object('type', 'mystery', 'difficulty', 'medium', 'contentId', 'm.film.99' || p_set),
    jsonb_build_object('type', 'mystery', 'difficulty', 'hard', 'contentId', 'm.sci.99' || p_set),
    jsonb_build_object('type', 'encore', 'difficulty', null, 'contentId', 'e.9901'))
$f$;
create function private.t_d(p_date date, p_set text, p_order jsonb default '[]')
returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_object('date', p_date, 'daily_number', (p_date - date '2099-01-01') + 1,
    'rounds', private.t_r(p_set), 'ready', true, 'spare_order', p_order)
$f$;
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
  v jsonb;
begin
  perform private.release_mysteries('t-f', 'main', (
    select jsonb_agg(private.t_m(c || '.99' || s, t, n))
      from unnest(array['m.geo', 'm.film', 'm.sci'], array['country', 'film', 'element'], array[1, 2, 3]) x(c, t, n),
           unnest(array['01', '02', '03']) s));
  perform private.release_encores('t-f', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'e.9901', 'category', 'art', 'question', 'q', 'unit', 'steps', 'unit_short', 'steps', 'unit_label', 'steps',
    'value_kind', 'quantity', 'answer', 212, 'decimals', 0, 'bullseye', null, 'close', null, 'explanation', 'x',
    'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null, 'status', 'active')));
  perform private.release_dailies('t-f', 'main', (
    select jsonb_agg(private.t_d(d::date, '01')) from generate_series(date '2099-01-01', date '2099-01-11', '1 day') d));
  perform private.release_spares('t-f', 'main', jsonb_build_array(
    jsonb_build_object('id', 'spare.01', 'rounds', private.t_r('03'))));

  -- Three days ahead before switch_on (DAILY_EPOCH + 28): 2099-01-10 freezes on 2099-01-07.
  perform private.t_now('2099-01-07T00:07:00Z');
  perform private.publish_track('main');
  assert (select d.status from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10') = 'frozen',
    'setup: the Daily froze';

  assert private.t_refused($q$select private.release_dailies('t-f', 'main', jsonb_build_array(private.t_d('2099-01-10', '02')))$q$)
         like '%the main Daily for 2099-01-10 is frozen, so it is refused; pass --allow-frozen for a correction%',
    'a frozen Daily took new rounds';
  v := private.release_dailies('t-f', 'main', jsonb_build_array(
    private.t_d('2099-01-10', '01', '[{"spare": "spare.01", "breaks": ["X23"]}]') || '{"ready": false}'));
  assert v ->> 'unchanged' = '1', format('an unchanged frozen Daily: %s', v);
  assert (select d.ready and d.spare_order = '[{"spare": "spare.01", "breaks": ["X23"]}]'
            from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10'),
    'an unchanged frozen Daily keeps the ready flag the freeze decided and takes the new spare order';

  assert private.t_refused($q$select private.release_mysteries('t-f', 'main', jsonb_build_array(private.t_m('m.geo.9901', 'country', 1, 'new')))$q$)
         like '%mystery m.geo.9901 is on a frozen or opened Daily%pass --allow-frozen for a correction%',
    'an item on a frozen Daily changed';
  v := private.release_mysteries('t-f', 'main', jsonb_build_array(private.t_m('m.geo.9901', 'country', 1, 'new')), true);
  assert v ->> 'updated' = '1', format('a correction with --allow-frozen: %s', v);
  assert (select m.clues[1] from private.mysteries m where m.id = 'm.geo.9901') = 'new', 'the correction landed';

  update private.dailies set rounds = jsonb_set(rounds, '{3,voided}', 'true')
   where track = 'main' and local_date = '2099-01-10';
  v := private.release_dailies('t-f', 'main', jsonb_build_array(private.t_d('2099-01-10', '02')), true);
  assert v ->> 'updated' = '1', format('a frozen Daily corrected: %s', v);
  assert (select d.status = 'frozen' and d.rounds -> 0 ->> 'contentId' = 'm.geo.9902' and (d.rounds -> 0 ->> 'voided')::boolean = false
             and (d.rounds -> 3 ->> 'voided')::boolean
            from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10'),
    'the corrected Daily stays frozen and keeps the void flag of the round that still names its item';
end
$$;
select 'PASS SQL-3 frozen rows are refused: a frozen Daily, or an item on one, changes only with --allow-frozen';

do $$
declare
  v jsonb;
begin
  -- 2099-01-10 opens at 2099-01-09T10:00Z: from then its rounds never change.
  perform private.t_now('2099-01-09T10:00:00Z');
  assert private.t_refused($q$select private.release_dailies('t-f', 'main', jsonb_build_array(private.t_d('2099-01-10', '01')), true)$q$)
         like '%the main Daily for 2099-01-10 has opened, so its rounds never change%',
    'an opened Daily took new rounds';

  -- A gap that comes due takes the spare set, and the date keeps it through every later release.
  perform private.t_now('2099-01-11T00:07:00Z');
  perform private.publish_track('main');
  assert (select d.spare_id from private.dailies d where d.track = 'main' and d.local_date = '2099-01-12') = 'spare.01',
    'setup: the gap took spare.01';
  v := private.release_dailies('t-f', 'main', jsonb_build_array(private.t_d('2099-01-12', '01')));
  assert v ->> 'kept_by_spare' = '1', format('a date a spare took: %s', v);
  assert (select d.rounds -> 0 ->> 'contentId' from private.dailies d where d.track = 'main' and d.local_date = '2099-01-12')
         = 'm.geo.9903', 'the spare''s rounds stay';

  assert private.t_refused($q$select private.release_spares('t-f', 'main', jsonb_build_array(jsonb_build_object('id', 'spare.01', 'rounds', private.t_r('02'))))$q$)
         like '%main spare spare.01 filled 2099-01-12 already, so it is refused%',
    'a used spare set took new rounds';
  v := private.release_spares('t-f', 'main', jsonb_build_array(jsonb_build_object('id', 'spare.01', 'rounds', private.t_r('03'))));
  assert v ->> 'unchanged' = '1', format('an unchanged used spare set: %s', v);
  assert private.t_refused($q$select private.release_mysteries('t-f', 'main', jsonb_build_array(private.t_m('m.geo.9903', 'country', 1, 'new')))$q$)
         like '%mystery m.geo.9903 is on a frozen or opened Daily, a used spare set%',
    'an item of a used spare set changed';
end
$$;
select 'PASS SQL-3 no release changes an opened Daily, and a date a spare took keeps it while a used spare set stays as it was';

rollback;
