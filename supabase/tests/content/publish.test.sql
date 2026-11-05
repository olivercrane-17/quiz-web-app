-- The publisher (ARCHITECTURE §8.7, §8.15; SQL-3). A Daily without pass D
-- on every item never freezes and is replaced by a spare at its date; a
-- scheduled Daily naming a retired item publishes the first unused spare in
-- its date's order, with an alert naming the rules it breaks; a gap on the
-- e2e track never takes a main-track spare; the freeze runs 3 days ahead,
-- then 7 from switch_on; an opened Daily is never changed; and a challenge
-- pack publishes once 30 Dailies have closed. It plays in 2099, sets aside
-- every real spare set, and writes the config it reads.
begin;

select private.t_now('2099-01-01T00:00:00Z');
insert into private.config (key, value)
values ('daily_epoch', '"2099-01-01"'), ('freeze', '{"days_initial": 3, "days": 7, "switch_on": null}'),
       ('runway_alarm', '30'), ('egress_sample_rate', '0')
on conflict (key) do update set value = excluded.value;
insert into private.categories (id, slug, name, short_name)
values ('geo', 'geography', 'Geography', 'Geography'), ('film', 'film-tv', 'Film & TV', 'Film & TV'),
       ('sci', 'science-tech', 'Science & Tech', 'Science & Tech'), ('art', 'art-design', 'Art & Design', 'Art & Design')
on conflict (id) do nothing;
insert into private.answer_entities (answer_type, entity_id, display, option_label)
select t, p || 'x.' || t || '.qz-' || s, s, s
  from unnest(array['', 'fx.']) p, unnest(array['country', 'film', 'element']) t, unnest(array['a', 'b', 'c', 'd']) s
on conflict (answer_type, entity_id) do update set active = true;
update private.daily_spares set active = false where active;

-- Items m.<cat>.99<set>, or fx.m.<cat>.99<set> on the e2e track; encore e.99<set>.
create function private.t_items(p_track text, p_sets text[]) returns void
language plpgsql volatile set search_path = '' as $f$
declare
  v_fx text := case when p_track = 'e2e' then 'fx.' else '' end;
begin
  perform private.release_mysteries('t-p', p_track, (
    select jsonb_agg(jsonb_build_object('id', v_fx || c || '.99' || s, 'category', split_part(c, '.', 2),
             'answer_type', t, 'answer_entity', v_fx || 'x.' || t || '.qz-a', 'accepted_entities', '[]'::jsonb,
             'clues', '["c1", "c2", "c3", "c4"]'::jsonb,
             'distractors', jsonb_build_array(v_fx || 'x.' || t || '.qz-b', v_fx || 'x.' || t || '.qz-c', v_fx || 'x.' || t || '.qz-d'),
             'slot', n, 'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb, 'review_by', null,
             'status', 'active'))
      from unnest(array['m.geo', 'm.film', 'm.sci'], array['country', 'film', 'element'], array[1, 2, 3]) x(c, t, n),
           unnest(p_sets) s));
  perform private.release_encores('t-p', p_track, (
    select jsonb_agg(jsonb_build_object('id', v_fx || 'e.99' || s, 'category', 'art', 'question', 'q', 'unit', 'steps',
             'unit_short', 'steps', 'unit_label', 'steps', 'value_kind', 'quantity', 'answer', 212, 'decimals', 0,
             'bullseye', null, 'close', null, 'explanation', 'x', 'learn_more', 'x', 'source_labels', '[]'::jsonb,
             'review_by', null, 'status', 'active'))
      from unnest(p_sets) s));
end
$f$;
create function private.t_r(p_track text, p_set text) returns jsonb language sql immutable set search_path = '' as $f$
  select jsonb_build_array(
    jsonb_build_object('type', 'mystery', 'difficulty', 'easy', 'contentId', f || 'm.geo.99' || p_set),
    jsonb_build_object('type', 'mystery', 'difficulty', 'medium', 'contentId', f || 'm.film.99' || p_set),
    jsonb_build_object('type', 'mystery', 'difficulty', 'hard', 'contentId', f || 'm.sci.99' || p_set),
    jsonb_build_object('type', 'encore', 'difficulty', null, 'contentId', f || 'e.99' || p_set))
    from (select case when p_track = 'e2e' then 'fx.' else '' end as f) x
$f$;
create function private.t_days(p_track text, p_from date, p_to date, p_set text, p_ready boolean default true,
                               p_order jsonb default '[]') returns jsonb
language sql immutable set search_path = '' as $f$
  select jsonb_agg(jsonb_build_object('date', d::date, 'daily_number', (d::date - date '2099-01-01') + 1,
           'rounds', private.t_r(p_track, p_set), 'ready', p_ready, 'spare_order', p_order) order by d)
    from generate_series(p_from, p_to, interval '1 day') d
$f$;
create function private.t_spare(p_track text, p_id text, p_set text) returns jsonb
language sql immutable set search_path = '' as $f$
  select jsonb_build_object('id', p_id, 'rounds', private.t_r(p_track, p_set))
$f$;
create function private.t_alerts(p_kind text, p_item text) returns bigint language sql stable set search_path = '' as $f$
  select count(*) from private.alerts a where a.kind = p_kind and a.detail ->> 'item' = p_item
$f$;

do $$
declare
  v_spare jsonb;
begin
  perform private.t_items('main', array['01', '02', '03', '04', '05', '06']);
  perform private.release_dailies('t-p', 'main', private.t_days('main', '2099-01-01', '2099-01-20', '01'));
  perform private.release_dailies('t-p', 'main', private.t_days('main', '2099-01-10', '2099-01-10', '01', false,
    '[{"spare": "spare.02", "breaks": ["X23"]}, {"spare": "spare.01", "breaks": []}]'));
  perform private.release_spares('t-p', 'main', jsonb_build_array(
    private.t_spare('main', 'spare.01', '02'), private.t_spare('main', 'spare.02', '03'),
    private.t_spare('main', 'spare.03', '04'), private.t_spare('main', 'spare.04', '05')));

  -- Three days ahead it is inside the freeze window, but not ready: it stays editable, one alert a day.
  perform private.t_now('2099-01-07T00:07:00Z');
  perform private.publish_track('main');
  perform private.t_now('2099-01-07T01:07:00Z');
  perform private.publish_track('main');
  assert (select d.status from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10') = 'scheduled',
    'a Daily without pass D froze';
  assert (select d.status from private.dailies d where d.track = 'main' and d.local_date = '2099-01-09') = 'frozen',
    'a ready Daily in the window did not freeze';
  assert private.t_alerts('daily_unready', 'main:2099-01-10') = 1, 'one daily_unready alert a day';

  -- It comes due at the start of the UTC day before its date: the first unused spare in its order takes it.
  perform private.t_now('2099-01-09T00:07:00Z');
  perform private.publish_track('main');
  assert (select row(d.status, d.ready, d.spare_id, d.rounds -> 0 ->> 'contentId')::text
            from private.dailies d where d.track = 'main' and d.local_date = '2099-01-10')
         = row('frozen', true, 'spare.02', 'm.geo.9903')::text, 'spare.02 did not take the date';
  assert (select s.used_for_date from private.daily_spares s where s.track = 'main' and s.id = 'spare.02') = '2099-01-10'
     and (select s.used_for_date from private.daily_spares s where s.track = 'main' and s.id = 'spare.01') is null,
    'the spare sets were not marked as used';
  select a.detail into v_spare from private.alerts a where a.kind = 'daily_spare' and a.detail ->> 'item' = 'main:2099-01-10';
  assert v_spare ->> 'reason' = 'not_ready' and v_spare ->> 'spare' = 'spare.02' and v_spare -> 'breaks' = '["X23"]'
     and (v_spare ->> 'ranked')::boolean and v_spare -> 'replaced' = '["m.geo.9901", "m.film.9901", "m.sci.9901", "e.9901"]',
    format('the spare alert: %s', v_spare);
end
$$;
select 'PASS SQL-3 a Daily without pass D on every item never freezes and is replaced by a spare at its date';

do $$
declare
  v_spare jsonb;
begin
  -- 2099-01-14, beyond the freeze for now, names m.geo.9906, which no spare set names. Its order ranks a
  -- used set, then spare.04 (breaking X23 and X24), then spare.01. The item is retired before it comes due.
  perform private.release_dailies('t-p', 'main', jsonb_build_array(jsonb_build_object(
    'date', '2099-01-14', 'daily_number', 14, 'ready', true,
    'rounds', jsonb_set(private.t_r('main', '01'), '{0,contentId}', '"m.geo.9906"'),
    'spare_order', '[{"spare": "spare.02", "breaks": []}, {"spare": "spare.04", "breaks": ["X23", "X24"]},
                     {"spare": "spare.01", "breaks": []}]'::jsonb)));
  perform private.release_mysteries('t-p', 'main', (
    select jsonb_agg(to_jsonb(m) - 'track' - 'content_hash' || '{"status": "retired"}')
      from private.mysteries m where m.id = 'm.geo.9906'));
  perform private.t_now('2099-01-13T00:07:00Z');
  perform private.publish_track('main');
  assert (select d.spare_id from private.dailies d where d.track = 'main' and d.local_date = '2099-01-14') = 'spare.04',
    'the first unused spare in the order did not take the date';
  select a.detail into v_spare from private.alerts a where a.kind = 'daily_spare' and a.detail ->> 'item' = 'main:2099-01-14';
  assert v_spare ->> 'reason' = 'cannot_publish' and v_spare -> 'breaks' = '["X23", "X24"]'
     and v_spare -> 'problems' = '[{"id": "m.geo.9906", "round": 0, "problem": "inactive"}]',
    format('the alert names the rules the spare breaks: %s', v_spare);
end
$$;
select 'PASS SQL-3 a scheduled Daily naming a retired item publishes the first unused spare in the spare order of its date, with an alert naming the rules it breaks';

do $$
begin
  -- The e2e track has no Daily in 2099 and no usable spare set: its gaps stay empty while main keeps its spare.
  perform private.t_items('e2e', array['01']);
  perform private.t_now('2099-01-15T00:07:00Z');
  perform private.publish_track('e2e');
  assert not exists (select 1 from private.dailies d where d.track = 'e2e' and d.local_date between '2099-01-14' and '2099-01-18'),
    'an e2e gap was filled without an e2e spare set';
  assert (select s.used_for_date from private.daily_spares s where s.track = 'main' and s.id = 'spare.01') is null,
    'an e2e gap took a main-track spare';
  assert private.t_alerts('daily_no_spare', 'e2e:2099-01-14') = 1, 'no alert for the empty e2e date';

  perform private.release_spares('t-p', 'e2e', jsonb_build_array(private.t_spare('e2e', 'spare.01', '01')));
  perform private.t_now('2099-01-15T01:07:00Z');
  perform private.publish_track('e2e');
  assert (select row(d.spare_id, d.rounds -> 0 ->> 'contentId', d.daily_number, d.status)::text
            from private.dailies d where d.track = 'e2e' and d.local_date = '2099-01-14')
         = row('spare.01', 'fx.m.geo.9901', 14, 'frozen')::text, 'the e2e gap did not take the e2e spare set';
  assert (select s.used_for_date from private.daily_spares s where s.track = 'main' and s.id = 'spare.01') is null
     and (select s.used_for_date from private.daily_spares s where s.track = 'e2e' and s.id = 'spare.01') = '2099-01-14',
    'the wrong track''s spare set was used';
end
$$;
select 'PASS SQL-3 a gap on the e2e track never takes a main-track spare';

do $$
begin
  -- Before switch_on the freeze reaches 3 days ahead, from it 7.
  update private.config set value = '{"days_initial": 3, "days": 7, "switch_on": "2099-01-17"}' where key = 'freeze';
  perform private.t_now('2099-01-15T02:07:00Z');
  perform private.publish_track('main');
  assert (select d.status from private.dailies d where d.track = 'main' and d.local_date = '2099-01-18') = 'frozen'
     and (select d.status from private.dailies d where d.track = 'main' and d.local_date = '2099-01-19') = 'scheduled',
    'before switch_on the freeze is not 3 days ahead';
  perform private.t_now('2099-01-17T00:07:00Z');
  perform private.publish_track('main');
  assert (select count(*) from private.dailies d where d.track = 'main' and d.status = 'frozen'
           and d.local_date between '2099-01-16' and '2099-01-20') = 5, 'from switch_on the freeze is not 7 days ahead';

  -- A Daily that cannot publish once its window has opened is left alone, with an alert.
  perform private.release_mysteries('t-p', 'main', (
    select jsonb_agg(to_jsonb(m) - 'track' - 'content_hash' || '{"status": "retired"}')
      from private.mysteries m where m.id = 'm.film.9901'), true);
  perform private.t_now('2099-01-17T11:07:00Z');
  perform private.publish_track('main');
  assert (select d.spare_id is null and d.rounds -> 1 ->> 'contentId' = 'm.film.9901'
            from private.dailies d where d.track = 'main' and d.local_date = '2099-01-18'),
    'an opened Daily was changed';
  assert private.t_alerts('daily_late', 'main:2099-01-18') = 1, 'no daily_late alert';
end
$$;
select 'PASS SQL-3 the freeze runs 3 days ahead and 7 from switch_on, and an opened Daily is never changed';

do $$
begin
  perform private.release_challenge_packs('t-p', 'main', jsonb_build_array(
    jsonb_build_object('id', 'qz-played', 'title', 't', 'theme', 't', 'rounds', private.t_r('main', '03')),
    jsonb_build_object('id', 'qz-unplayed', 'title', 't', 'theme', 't',
                       'rounds', jsonb_set(private.t_r('main', '03'), '{0,contentId}', '"m.geo.9904"'))));
  -- Set 03 played on 2099-01-10 (spare.02); m.geo.9904 never played. By 2099-01-30T12:07Z 29 Dailies have closed.
  perform private.t_now('2099-01-30T12:07:00Z');
  perform private.release_dailies('t-p', 'main', private.t_days('main', '2099-01-21', '2099-02-05', '03'));
  perform private.publish_track('main');
  assert (select c.status from private.challenge_packs c where c.id = 'qz-played') = 'draft', 'a pack published before 30 Dailies closed';
  perform private.t_now('2099-01-31T12:07:00Z');
  perform private.publish_track('main');
  assert (select c.status from private.challenge_packs c where c.id = 'qz-played') = 'published'
     and (select c.status from private.challenge_packs c where c.id = 'qz-unplayed') = 'draft',
    'a pack drawn from closed Dailies did not publish, or one naming an unplayed item did';
end
$$;
select 'PASS SQL-3 a challenge pack publishes once 30 Dailies have closed, drawing only on items that played';

rollback;
