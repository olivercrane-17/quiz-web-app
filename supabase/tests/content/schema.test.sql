-- The content schema (ARCHITECTURE §4.9, §8.3, §8.7; SQL-3): compositions
-- and maximum points as the engine computes them, each Daily's window and
-- number from DAILY_EPOCH, the e2e track holding fixture ids only and the
-- main track none, and an x. entity id belonging to its own type's list.
-- Every block writes the config it reads, so the file passes on a live
-- database.
begin;

do $$
declare
  v_m3e1 jsonb := '[{"type": "mystery"}, {"type": "mystery"}, {"type": "mystery"}, {"type": "encore"}]';
  v_c9e1 jsonb := (select jsonb_agg('{"type": "mc"}'::jsonb) from generate_series(1, 9)) || '[{"type": "encore"}]';
  v_c5m1e1 jsonb := (select jsonb_agg('{"type": "mc"}'::jsonb) from generate_series(1, 5))
                    || '[{"type": "mystery"}, {"type": "encore"}]';
begin
  assert private.composition_of(v_m3e1) = 'm3e1', private.composition_of(v_m3e1);
  assert private.composition_of(v_c9e1) = 'c9e1', private.composition_of(v_c9e1);
  assert private.composition_of(v_c5m1e1) = 'c5m1e1', private.composition_of(v_c5m1e1);
  assert private.composition_of('[{"type": "tf"}, {"type": "comparison"}, {"type": "tf"}]') = 't1p1t1', 'runs restart';
  assert private.max_points_of(v_m3e1) = 12 and private.max_points_of(v_c9e1) = 9
     and private.max_points_of(v_c5m1e1) = 9, 'maximum points: 4 a mystery, 1 a choice round, 0 an encore';
  begin
    perform private.composition_of('[{"type": "riddle"}]');
    raise exception 'composition_of took an unknown round type';
  exception
    when raise_exception then
      if sqlerrm not like 'composition_of:%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-3 compositions and maximum points follow the engine: m3e1, c9e1 and c5m1e1';

do $$
begin
  insert into private.config (key, value) values ('daily_epoch', '"2026-09-21"')
  on conflict (key) do update set value = excluded.value;
  assert private.daily_opens_at('2026-11-01') = '2026-10-31T10:00:00Z', 'D opens at D 00:00 in UTC+14';
  assert private.daily_closes_at('2026-11-01') = '2026-11-02T12:00:00Z', 'D closes at D+1 00:00 in UTC-12';
  assert private.daily_number_for('2026-09-21') = 1 and private.daily_number_for('2026-11-01') = 42
     and private.daily_number_for('2028-12-31') = 833, 'numbers count days from the epoch';
  assert private.daily_number_for('2026-09-20') is null, 'nothing before the epoch';
  update private.config set value = 'null' where key = 'daily_epoch';
  assert private.daily_epoch() is null and private.daily_number_for('2026-11-01') is null, 'no epoch, no numbers';
end
$$;
select 'PASS SQL-3 Daily numbers count from DAILY_EPOCH and each window runs from UTC+14 to UTC-12';

do $$
declare
  v_row jsonb := jsonb_build_object(
    'id', 'm.geo.9901', 'category', 'geo', 'answer_type', 'country', 'answer_entity', 'x.country.qz-a',
    'accepted_entities', '[]'::jsonb, 'clues', '["c1", "c2", "c3", "c4"]'::jsonb,
    'distractors', '["x.country.qz-b", "x.country.qz-c", "x.country.qz-d"]'::jsonb, 'slot', 1,
    'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null, 'status', 'active');
begin
  insert into private.categories (id, slug, name, short_name) values ('geo', 'geography', 'Geography', 'Geography')
  on conflict (id) do nothing;
  insert into private.answer_entities (answer_type, entity_id, display, option_label)
  select 'country', p || 'x.country.qz-' || s, s, s
    from unnest(array['', 'fx.']) p, unnest(array['a', 'b', 'c', 'd']) s
  on conflict (answer_type, entity_id) do update set active = true;
  begin
    insert into private.answer_entities (answer_type, entity_id, display, option_label)
    values ('country', 'x.film.qz-a', 'A', 'A');
    raise exception 'a film id joined the country list';
  exception
    when check_violation then null;
  end;
  begin
    perform private.release_mysteries('t-schema', 'e2e', jsonb_build_array(v_row));
    raise exception 'the e2e track took a real mystery';
  exception
    when check_violation then null;
  end;
  begin
    perform private.release_mysteries('t-schema', 'main', jsonb_build_array(v_row || '{"id": "fx.m.geo.9901"}'));
    raise exception 'the main track took a fixture mystery';
  exception
    when check_violation then null;
  end;
  begin
    perform private.release_room_packs('t-schema', 'main', jsonb_build_array(jsonb_build_object(
      'id', 'fx-qz', 'title', 't', 'theme', 't',
      'question_ids', (select jsonb_agg('fx.r.fx-qz.' || lpad(n::text, 2, '0')) from generate_series(1, 15) n))));
    raise exception 'the main track took a fixture room pack';
  exception
    when check_violation then null;
  end;
  perform private.release_mysteries('t-schema', 'e2e',
    jsonb_build_array(v_row || '{"id": "fx.m.geo.9901", "answer_entity": "fx.x.country.qz-a"}'
                            || '{"distractors": ["fx.x.country.qz-b", "fx.x.country.qz-c", "fx.x.country.qz-d"]}'));
  assert exists (select 1 from private.mysteries m where m.id = 'fx.m.geo.9901' and m.track = 'e2e'),
    'the e2e track holds its fixture mystery';
end
$$;
select 'PASS SQL-3 the e2e track holds fixture ids only and the main track none, and an entity id belongs to its own list';

rollback;
