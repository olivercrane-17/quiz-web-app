-- AC-OPS-02 (PRD §3.18.6; ARCHITECTURE §8.4, §8.15; SQL-3): with 29
-- scheduled Dailies left on a track the content queue shows the runway
-- alarm, and with 30 it doesn't; the hourly publisher leaves a runway alert
-- only below 30. It plays in 2099, after every real Daily, numbers its
-- Dailies from an epoch of its own so they stay below every real Daily's
-- number (the key of a track's Dailies), and writes the config it reads, so
-- it passes on a live database.
begin;

select private.t_now('2099-03-01T00:07:00Z');
insert into private.config (key, value)
values ('daily_epoch', '"2099-02-28"'), ('runway_alarm', '30'), ('egress_sample_rate', '0')
on conflict (key) do update set value = excluded.value;
insert into private.categories (id, slug, name, short_name)
values ('geo', 'geography', 'Geography', 'Geography'), ('art', 'art-design', 'Art & Design', 'Art & Design')
on conflict (id) do nothing;
insert into private.answer_entities (answer_type, entity_id, display, option_label)
select 'country', 'x.country.qz-' || s, s, s from unnest(array['a', 'b', 'c', 'd']) s
on conflict (answer_type, entity_id) do update set active = true;
update private.daily_spares set active = false where active;

do $$
declare
  v_runway jsonb;
begin
  perform private.release_mysteries('t-r', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'm.geo.9901', 'category', 'geo', 'answer_type', 'country', 'answer_entity', 'x.country.qz-a',
    'accepted_entities', '[]'::jsonb, 'clues', '["c1", "c2", "c3", "c4"]'::jsonb,
    'distractors', '["x.country.qz-b", "x.country.qz-c", "x.country.qz-d"]'::jsonb, 'slot', 1,
    'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null, 'status', 'active')));
  perform private.release_encores('t-r', 'main', jsonb_build_array(jsonb_build_object(
    'id', 'e.9901', 'category', 'art', 'question', 'q', 'unit', 'steps', 'unit_short', 'steps', 'unit_label', 'steps',
    'value_kind', 'quantity', 'answer', 212, 'decimals', 0, 'bullseye', null, 'close', null, 'explanation', 'x',
    'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null, 'status', 'active')));
  -- 30 Dailies from today, 1 to 30 March 2099.
  perform private.release_dailies('t-r', 'main', (
    select jsonb_agg(jsonb_build_object('date', d::date, 'daily_number', (d::date - date '2099-02-28') + 1,
             'rounds', '[{"type": "mystery", "difficulty": "easy", "contentId": "m.geo.9901"},
                         {"type": "encore", "difficulty": null, "contentId": "e.9901"}]'::jsonb,
             'ready', true, 'spare_order', '[]'::jsonb))
      from generate_series(date '2099-03-01', date '2099-03-30', interval '1 day') d));

  select q.detail into v_runway from private.content_queue q where q.section = 'runway' and q.item = 'main';
  assert v_runway ->> 'left' = '30' and v_runway ->> 'alarm' = 'false' and v_runway ->> 'threshold' = '30',
    format('30 Dailies left: %s', v_runway);
  perform private.publish_track('main');
  assert not exists (select 1 from private.alerts a where a.kind = 'runway' and a.detail ->> 'item' = 'main'
                      and a.at >= '2099-03-01T00:00:00Z'), 'a runway alert with 30 Dailies left';
  assert not exists (select 1 from private.content_queue q where q.section = 'alert' and q.item = 'runway'
                      and q.detail ->> 'track' = 'main' and q.at >= '2099-03-01T00:00:00Z'), 'the queue lists a runway alert';

  -- A day later 29 are left: the queue shows the alarm and the publisher leaves its alert.
  perform private.t_now('2099-03-02T00:07:00Z');
  select q.detail into v_runway from private.content_queue q where q.section = 'runway' and q.item = 'main';
  assert v_runway ->> 'left' = '29' and v_runway ->> 'alarm' = 'true' and v_runway ->> 'last_date' = '2099-03-30',
    format('29 Dailies left: %s', v_runway);
  perform private.publish_track('main');
  assert exists (select 1 from private.content_queue q where q.section = 'alert' and q.item = 'runway'
                  and q.detail ->> 'track' = 'main' and q.detail ->> 'left' = '29' and q.at >= '2099-03-02T00:00:00Z'),
    'the content queue shows no runway alarm alert with 29 Dailies left';
end
$$;
select 'PASS AC-OPS-02 with 29 scheduled Dailies left on a track the content queue shows the runway alarm; with 30 it does not';

rollback;
