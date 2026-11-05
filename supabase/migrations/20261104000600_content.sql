-- SQL-3 (ARCHITECTURE §5.4, §8.3, §8.7, §8.15, §8.16): the sealed content
-- tables and the release pipeline.
--
--   * The content tables of §8.3: categories, answer entities with their
--     clue-4 option labels and active flag, practice item ids, mysteries,
--     encores, sealed choice questions, room packs, challenge packs, the
--     Dailies of each track, the spare sets of each track, and one row per
--     recorded release.
--   * The release loaders. scripts/content/release.ts writes a release as
--     one statement per chunk, each a call to one loader with its rows as
--     JSON, in a fixed order (§5.4): content rows (mysteries, encores,
--     sealed questions, room packs, challenge packs), then schedule rows
--     (Dailies, spare sets), then verify_release, then record_release,
--     which writes the content_releases row last. Answer entities load
--     before any release, from supabase/seed/answer-entities.sql.
--   * publish(), the hourly publisher of §8.7, and content_queue, the
--     owner's view of what needs a person, with the Daily runway.
--
-- Like every unattended file it only creates and overwrites (supabase/
-- README.md §1), and nothing here ever removes a row:
--   * A retired item keeps its row, marked retired: attempts and old
--     guesses still name it (§5.5).
--   * A Daily the schedule stops naming keeps its row too. record_release
--     marks it not ready, so it never freezes and a spare takes its date
--     when it comes due. A spare set the release stops naming is marked
--     inactive, so publish never picks it.
--   * A spare that filled a date keeps its row, with that date.
--
-- Tracks. Content rows carry their track, and the e2e track holds fixture
-- content only: a check ties every fx. id to the e2e track and every other
-- id to main, so the real-backend job, whose artifacts are public, can
-- never be served real sealed content (§8.17). A Daily or spare set names
-- items of its own track only (verify_release), and a gap takes a spare of
-- its own track only (publish).
--
-- Frozen rows (§8.7). The database alone decides what is frozen. A release
-- refuses to change the rounds of a frozen Daily, or an item on a frozen or
-- opened Daily, a used spare set or a published challenge pack, unless the
-- loader is called with p_allow_frozen (content:release --allow-frozen, for
-- a correction). No release changes the rounds of a Daily whose window has
-- opened: corrections after play go through the admin functions (SQL-9).
--
-- Every function here is SECURITY INVOKER in private with an empty
-- search_path. Only postgres reaches them, through MCP and pg_cron.

-- ---------------------------------------------------------------------------
-- Tables (§8.3)
-- ---------------------------------------------------------------------------

-- The 12 categories, loaded by supabase/seed/practice-items.sql.
create table if not exists private.categories (
  id text primary key check (id ~ '^[a-z]{2,8}$'),
  slug text not null unique,
  name text not null,
  short_name text not null
);
select private.secure_table('private.categories');

-- Every answer-list entry ever published (§5.5), from
-- supabase/seed/answer-entities.sql: a retired entry stays, inactive, so an
-- old guess still resolves and displays, while round_action refuses it
-- (§8.8). An x.<type>.<slug> id belongs to the list of its type.
create table if not exists private.answer_entities (
  answer_type text not null check (answer_type ~ '^[a-z_]{2,20}$'),
  entity_id text not null
    check (entity_id ~ '^(fx\.)?(Q[1-9][0-9]*|x\.[a-z_]+\.[a-z0-9]+(-[a-z0-9]+)*)$'),
  display text not null check (display <> ''),
  option_label text not null check (option_label <> ''),     -- 'Queen (band)' (§5.5)
  active boolean not null default true,
  primary key (answer_type, entity_id),
  check (entity_id !~ '^(fx\.)?x\.' or split_part(regexp_replace(entity_id, '^fx\.', ''), '.', 2) = answer_type)
);
select private.secure_table('private.answer_entities');

-- Practice item ids (supabase/seed/practice-items.sql): reports, the pull
-- list and calibration name them. ord is the item's bit in
-- practice_firsts (§8.12), handed out once and never reused.
create table if not exists private.practice_items (
  id text primary key check (id ~ '^(fx\.)?p\.[a-z]+\.[0-9]{4}$'),
  category text not null references private.categories (id),
  ord smallint not null unique check (ord >= 0),
  option_count smallint not null check (option_count between 2 and 4),
  status text not null default 'active' check (status in ('active', 'pulled'))
);
create index if not exists practice_items_category_idx on private.practice_items (category);
select private.secure_table('private.practice_items');

-- Sealed items. status: active; retired by a release (the source retired
-- it); pulled by the owner, which no release undoes. content_hash is
-- sha256 of the item's content as stored (content_hash()), so a release
-- can tell a changed item from an unchanged one.
create table if not exists private.mysteries (
  id text primary key check (id ~ '^(fx\.)?m\.[a-z]+\.[0-9]{4}$'),
  track text not null default 'main' check (track in ('main', 'e2e')),
  category text not null references private.categories (id),
  answer_type text not null,
  answer_entity text not null,
  accepted_entities text[] not null default '{}' check (cardinality(accepted_entities) <= 2),
  clues text[] not null check (cardinality(clues) = 4),
  distractors text[] not null check (cardinality(distractors) = 3),
  slot smallint not null check (slot between 1 and 3),
  explanation text not null,
  learn_more text not null,
  source_labels text[] not null default '{}',
  review_by date,
  status text not null default 'active' check (status in ('active', 'pulled', 'retired')),
  content_hash text not null,
  foreign key (answer_type, answer_entity) references private.answer_entities (answer_type, entity_id),
  check ((track = 'e2e') = (id like 'fx.%'))
);
create index if not exists mysteries_category_idx on private.mysteries (category);
create index if not exists mysteries_answer_idx on private.mysteries (answer_type, answer_entity);
select private.secure_table('private.mysteries');

-- bullseye and close are null when the encore takes the default bands
-- (config encore_bands, §4.6).
create table if not exists private.encores (
  id text primary key check (id ~ '^(fx\.)?e\.[0-9]{4}$'),
  track text not null default 'main' check (track in ('main', 'e2e')),
  category text references private.categories (id),
  question text not null,
  unit text not null,
  unit_short text not null,
  unit_label text not null,
  value_kind text not null check (value_kind in ('quantity', 'year')),
  answer numeric not null check (answer > 0),
  decimals smallint not null default 0 check (decimals between 0 and 2),
  bullseye numeric check (bullseye > 0),
  close numeric check (close > 0),
  explanation text not null,
  learn_more text not null,
  source_labels text[] not null default '{}',
  review_by date,
  status text not null default 'active' check (status in ('active', 'pulled', 'retired')),
  content_hash text not null,
  check (value_kind <> 'year' or (answer = trunc(answer) and answer <= 9999)),
  check ((bullseye is null) = (close is null) and (bullseye is null or bullseye < close)),
  check ((track = 'e2e') = (id like 'fx.%'))
);
create index if not exists encores_category_idx on private.encores (category);
select private.secure_table('private.encores');

-- Room-pack questions and the sealed choice rounds of a Daily (§3.2
-- SealedChoiceContent): options in source order, the key at `correct`.
create table if not exists private.sealed_questions (
  id text primary key check (id ~ '^(fx\.)?r\.[a-z0-9]+(-[a-z0-9]+)*\.[0-9]{2}$'),
  track text not null default 'main' check (track in ('main', 'e2e')),
  format text not null check (format in ('mc', 'tf', 'comparison')),
  category text references private.categories (id),
  stem text not null,
  options text[] not null check (cardinality(options) between 2 and 4),
  correct smallint not null,
  option_order text not null check (option_order in ('shuffle', 'ascending', 'fixed')),
  value_display text[] check (value_display is null or cardinality(value_display) = 2),
  explanation text not null,
  learn_more text not null,
  review_by date,
  status text not null default 'active' check (status in ('active', 'pulled', 'retired')),
  content_hash text not null,
  check (correct >= 0 and correct < cardinality(options)),
  check ((track = 'e2e') = (id like 'fx.%'))
);
create index if not exists sealed_questions_category_idx on private.sealed_questions (category);
select private.secure_table('private.sealed_questions');

-- The Dailies (§8.7). rounds: RoundSpec[] (§3.3), each with "voided".
-- status 'frozen' is the only frozen state; ready says every item passed
-- pass D for this date (CONTENT_GUIDE §9.9 rule 7), as the release
-- computed it. spare_order ranks the spares for this date, best first:
-- [{ "spare": id, "breaks": [rule codes] }] (CONTENT_GUIDE §10.7).
-- spare_id names the spare publish put here; release_version the last
-- release that named the date.
create table if not exists private.dailies (
  track text not null check (track in ('main', 'e2e')),
  daily_number integer not null check (daily_number >= 1),
  local_date date not null,
  rounds jsonb not null check (jsonb_typeof(rounds) = 'array' and jsonb_array_length(rounds) > 0),
  composition text not null,
  max_points smallint not null check (max_points >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'frozen')),
  ready boolean not null default false,
  spare_order jsonb not null default '[]' check (jsonb_typeof(spare_order) = 'array'),
  frozen_at timestamptz,
  spare_id text,
  release_version text,
  primary key (track, daily_number),
  unique (track, local_date),
  check ((status = 'frozen') = (frozen_at is not null))
);
select private.secure_table('private.dailies');

-- Spare sets by track (CONTENT_GUIDE §10.7): a date only ever takes a
-- spare of its own track, so the key is (track, id) and each track
-- numbers its own. used_for_date is the date it filled; active is false
-- once a release stops naming it.
create table if not exists private.daily_spares (
  track text not null check (track in ('main', 'e2e')),
  id text not null check (id ~ '^spare\.[0-9]{2}$'),
  rounds jsonb not null check (jsonb_typeof(rounds) = 'array' and jsonb_array_length(rounds) > 0),
  composition text not null,
  max_points smallint not null check (max_points >= 0),
  used_for_date date,
  active boolean not null default true,
  release_version text,
  primary key (track, id)
);
select private.secure_table('private.daily_spares');

-- PRD §3.6.1: packs drawn from past Dailies. A release loads them as
-- drafts; publish() publishes one once 30 Dailies of its track have
-- closed and every round already played on a closed Daily. None at launch.
create table if not exists private.challenge_packs (
  id text primary key check (id ~ '^(fx-)?[a-z0-9]+(-[a-z0-9]+)*$'),
  track text not null default 'main' check (track in ('main', 'e2e')),
  title text not null,
  theme text not null,
  rounds jsonb not null check (jsonb_typeof(rounds) = 'array' and jsonb_array_length(rounds) > 0),
  composition text not null,
  max_points smallint not null check (max_points >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  check ((track = 'e2e') = (id like 'fx-%'))
);
select private.secure_table('private.challenge_packs');

create table if not exists private.room_packs (
  id text primary key check (id ~ '^(fx-)?[a-z0-9]+(-[a-z0-9]+)*$'),
  track text not null default 'main' check (track in ('main', 'e2e')),
  title text not null,
  theme text not null,
  question_ids text[] not null check (cardinality(question_ids) = 15),
  status text not null default 'active' check (status in ('active', 'retired')),
  check ((track = 'e2e') = (id like 'fx-%'))
);
select private.secure_table('private.room_packs');

-- One row per recorded release, written last, after verify_release
-- (§5.4). A version is recorded once: the same version with other
-- content is refused, so history never changes.
create table if not exists private.content_releases (
  version text primary key check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  track text not null check (track in ('main', 'e2e')),
  applied_at timestamptz not null default private.now(),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  counts jsonb not null check (jsonb_typeof(counts) = 'object')
);
select private.secure_table('private.content_releases');

-- The freeze rule of §8.7: days_initial ahead until switch_on, days after
-- it. switch_on null means DAILY_EPOCH plus 28 days; the owner sets it
-- once two calm weeks have passed. runway_alarm: the content queue alarms
-- below this many Dailies from today (PRD §3.18.2). Values an owner
-- already set win.
insert into private.config (key, value)
values ('freeze', '{"days_initial": 3, "days": 7, "switch_on": null}'),
       ('runway_alarm', '30')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Dates and compositions
-- ---------------------------------------------------------------------------

-- The global window of local date D (§8.7): it opens at D 00:00 in UTC+14
-- and closes at D+1 00:00 in UTC-12.
create or replace function private.daily_opens_at(p_date date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_date::timestamp - interval '14 hours') at time zone 'UTC'
$$;

create or replace function private.daily_closes_at(p_date date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date + 1)::timestamp + interval '12 hours') at time zone 'UTC'
$$;

-- DAILY_EPOCH (src/config/shared.json, loaded by supabase/seed/config.sql),
-- or null before that seed is loaded.
create or replace function private.daily_epoch()
returns date
language sql
stable
set search_path = ''
as $$
  select case when jsonb_typeof(private.cfg('daily_epoch')) = 'string'
              then (private.cfg('daily_epoch') #>> '{}')::date end
$$;

-- daily_number = (D - daily_epoch) + 1 (§8.7), or null before the epoch.
create or replace function private.daily_number_for(p_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_date >= e.epoch then (p_date - e.epoch) + 1 end
    from (select private.daily_epoch() as epoch) e
$$;

-- A composition id (§4.9, src/engine/composition.ts): each run of one
-- round type becomes its letter and a count, so [mystery x3, encore] is
-- m3e1 and [mc x5, mystery, encore] is c5m1e1.
create or replace function private.composition_of(p_rounds jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := '';
  v_run text;
  v_count integer := 0;
  v_type text;
  v_letter text;
begin
  for v_type in
    select r ->> 'type' from jsonb_array_elements(p_rounds) with ordinality x(r, n) order by n
  loop
    v_letter := case v_type
      when 'mystery' then 'm' when 'encore' then 'e' when 'mc' then 'c'
      when 'tf' then 't' when 'comparison' then 'p' when 'ordering' then 'o' end;
    if v_letter is null then
      raise exception 'composition_of: % is not a round type', coalesce(v_type, 'null');
    end if;
    if v_letter = v_run then
      v_count := v_count + 1;
    else
      if v_run is not null then
        v_out := v_out || v_run || v_count;
      end if;
      v_run := v_letter;
      v_count := 1;
    end if;
  end loop;
  if v_run is not null then
    v_out := v_out || v_run || v_count;
  end if;
  return v_out;
end
$$;

-- The most a run of these rounds scores: 4 a mystery, 1 a choice round, 0
-- an encore (each round plugin's maxPoints, src/engine/rounds/).
create or replace function private.max_points_of(p_rounds jsonb)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(case r ->> 'type' when 'mystery' then 4 when 'encore' then 0 else 1 end), 0)::smallint
    from jsonb_array_elements(p_rounds) r
$$;

-- Rounds without their void flags, for comparing two versions of a Daily.
create or replace function private.bare_rounds(p_rounds jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(r - 'voided' order by n), '[]'::jsonb)
    from jsonb_array_elements(p_rounds) with ordinality x(r, n)
$$;

-- ---------------------------------------------------------------------------
-- What keeps rounds from publishing
-- ---------------------------------------------------------------------------

-- One { round, id, problem } object for each round that cannot publish on
-- p_date: its item is missing for the round's type, on another track, not
-- active, or due for review on or before p_date, or (a mystery) names an
-- answer, accepted or distractor entity that is missing from its type's
-- list or inactive. Empty when every round can publish. A null p_date
-- skips the review date, which means nothing for a spare set until it
-- fills a date.
create or replace function private.round_problems(p_track text, p_rounds jsonb, p_date date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('round', x.ord - 1, 'id', x.id, 'problem', x.problem) order by x.ord), '[]'::jsonb)
    from (
      select r.ord, r.item ->> 'contentId' as id,
             case
               when i.id is null then 'missing'
               when i.track <> p_track then 'track'
               when i.status <> 'active' then 'inactive'
               when p_date is not null and i.review_by is not null and i.review_by <= p_date then 'review_by'
               when i.entities is not null and exists (
                 select 1 from unnest(i.entities) e(id)
                  where not exists (
                    select 1 from private.answer_entities a
                     where a.answer_type = i.answer_type and a.entity_id = e.id and a.active)) then 'entity'
             end as problem
        from jsonb_array_elements(p_rounds) with ordinality r(item, ord)
        left join lateral (
          select m.id, m.track, m.status, m.review_by, m.answer_type,
                 array[m.answer_entity] || m.accepted_entities || m.distractors as entities
            from private.mysteries m
           where r.item ->> 'type' = 'mystery' and m.id = r.item ->> 'contentId'
          union all
          select e.id, e.track, e.status, e.review_by, null::text, null::text[]
            from private.encores e
           where r.item ->> 'type' = 'encore' and e.id = r.item ->> 'contentId'
          union all
          select q.id, q.track, q.status, q.review_by, null::text, null::text[]
            from private.sealed_questions q
           where q.format = r.item ->> 'type' and q.id = r.item ->> 'contentId'
        ) i on true
    ) x
   where x.problem is not null
$$;

-- What keeps a Daily from publishing on its date: not ready, then its
-- rounds' problems.
create or replace function private.daily_problems(p_daily private.dailies)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_daily.ready then '[]'::jsonb else '[{"problem": "not_ready"}]'::jsonb end
         || private.round_problems(p_daily.track, p_daily.rounds, p_daily.local_date)
$$;

-- The items a release changes only with p_allow_frozen: those on a Daily
-- of the track that is frozen or has opened, on a spare set that filled a
-- date, or in a published challenge pack.
create or replace function private.locked_items(p_track text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.id), '{}')
    from (
      select r ->> 'contentId' as id
        from private.dailies d
        cross join lateral jsonb_array_elements(d.rounds) r
       where d.track = p_track
         and (d.status = 'frozen' or private.daily_opens_at(d.local_date) <= private.now())
      union all
      select r ->> 'contentId'
        from private.daily_spares s
        cross join lateral jsonb_array_elements(s.rounds) r
       where s.track = p_track and s.used_for_date is not null
      union all
      select r ->> 'contentId'
        from private.challenge_packs c
        cross join lateral jsonb_array_elements(c.rounds) r
       where c.track = p_track and c.status = 'published'
    ) x
$$;

-- ---------------------------------------------------------------------------
-- Release loaders (§5.4). Each takes the release version, the track and a
-- JSON array of rows, and answers counts. A refusal raises, naming ids,
-- dates and rule words only, never content, so the call's whole chunk
-- rolls back.
-- ---------------------------------------------------------------------------

create or replace function private.release_args(p_version text, p_track text, p_rows jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_version is null or p_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then
    raise exception 'content release: % is not a release version', coalesce(p_version, 'null');
  end if;
  if p_track is null or p_track not in ('main', 'e2e') then
    raise exception 'content release %: % is not a track', p_version, coalesce(p_track, 'null');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'content release %: the rows are not a JSON array', p_version;
  end if;
end
$$;

-- sha256 of a value's canonical jsonb text: equal content, equal hash.
create or replace function private.content_hash(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_value::text, 'UTF8')), 'hex')
$$;

-- The status a release asks for (active or retired), applied over the
-- stored one: a pulled item stays pulled until the owner restores it.
create or replace function private.release_status(
  p_version text, p_id text, p_asked text, p_stored text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_asked is null or p_asked not in ('active', 'retired') then
    raise exception 'content release %: % asks for status %', p_version, coalesce(p_id, 'null'), coalesce(p_asked, 'null');
  end if;
  return case when p_stored = 'pulled' and p_asked = 'active' then 'pulled' else p_asked end;
end
$$;

-- The one refusal every content loader makes: an item moving tracks, or a
-- changed item that is locked (locked_items) without p_allow_frozen.
create or replace function private.release_guard(
  p_version text, p_kind text, p_id text, p_stored_track text, p_track text,
  p_changed boolean, p_locked boolean, p_allow_frozen boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_stored_track <> p_track then
    raise exception 'content release %: % % is on the % track, not %', p_version, p_kind, p_id, p_stored_track, p_track;
  end if;
  if p_changed and p_locked and not coalesce(p_allow_frozen, false) then
    raise exception 'content release %: % % is on a frozen or opened Daily, a used spare set or a published challenge pack, so it is refused; pass --allow-frozen for a correction',
      p_version, p_kind, p_id;
  end if;
end
$$;

-- Rounds as a release sends them, checked and given their void flags:
-- [{ type, difficulty, contentId, voided: false }].
create or replace function private.release_rounds(p_version text, p_what text, p_rounds jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out jsonb := '[]';
  v_round jsonb;
begin
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then
    raise exception 'content release %: % has no rounds', p_version, p_what;
  end if;
  for v_round in select r from jsonb_array_elements(p_rounds) with ordinality x(r, n) order by n loop
    if not coalesce(
         jsonb_typeof(v_round) = 'object'
         and v_round ->> 'type' in ('mystery', 'encore', 'mc', 'tf', 'comparison')
         and v_round ->> 'contentId' <> ''
         and (v_round -> 'difficulty' = 'null'::jsonb or v_round ->> 'difficulty' in ('easy', 'medium', 'hard')),
         false) then
      raise exception 'content release %: % has a round that is not { type, difficulty, contentId }', p_version, p_what;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'type', v_round ->> 'type', 'difficulty', v_round -> 'difficulty',
      'contentId', v_round ->> 'contentId', 'voided', false));
  end loop;
  return v_out;
end
$$;

-- A new version of rounds that keeps each void flag whose round still
-- names the same item.
create or replace function private.carry_voided(p_stored jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           case when o.r ->> 'contentId' = n.r ->> 'contentId' and o.r ->> 'type' = n.r ->> 'type'
                then n.r || jsonb_build_object('voided', coalesce((o.r ->> 'voided')::boolean, false))
                else n.r end
           order by n.i), '[]'::jsonb)
    from jsonb_array_elements(p_new) with ordinality n(r, i)
    left join jsonb_array_elements(p_stored) with ordinality o(r, i) on o.i = n.i
$$;

create or replace function private.release_mysteries(
  p_version text, p_track text, p_rows jsonb, p_allow_frozen boolean default false)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_new private.mysteries;
  v_old private.mysteries;
  v_locked text[];
  v_changed boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_same integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  v_locked := private.locked_items(p_track);
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    v_new := jsonb_populate_record(null::private.mysteries, v_row);
    if v_new.id is null then
      raise exception 'content release %: a mystery row has no id', p_version;
    end if;
    select * into v_old from private.mysteries m where m.id = v_new.id for update;
    v_new.track := p_track;
    v_new.status := private.release_status(p_version, v_new.id, v_row ->> 'status', v_old.status);
    v_new.content_hash := private.content_hash(to_jsonb(v_new) - array['track', 'status', 'content_hash']);
    if v_old.id is null then
      insert into private.mysteries values (v_new.*);
      v_inserted := v_inserted + 1;
      continue;
    end if;
    v_changed := v_old.content_hash <> v_new.content_hash or v_old.status <> v_new.status;
    perform private.release_guard(p_version, 'mystery', v_new.id, v_old.track, p_track,
      v_changed, v_new.id = any (v_locked), p_allow_frozen);
    if not v_changed then
      v_same := v_same + 1;
      continue;
    end if;
    update private.mysteries m
       set category = v_new.category, answer_type = v_new.answer_type, answer_entity = v_new.answer_entity,
           accepted_entities = v_new.accepted_entities, clues = v_new.clues, distractors = v_new.distractors,
           slot = v_new.slot, explanation = v_new.explanation, learn_more = v_new.learn_more,
           source_labels = v_new.source_labels, review_by = v_new.review_by, status = v_new.status,
           content_hash = v_new.content_hash
     where m.id = v_new.id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object('table', 'mysteries', 'rows', jsonb_array_length(p_rows),
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_same);
end
$$;

create or replace function private.release_encores(
  p_version text, p_track text, p_rows jsonb, p_allow_frozen boolean default false)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_new private.encores;
  v_old private.encores;
  v_locked text[];
  v_changed boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_same integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  v_locked := private.locked_items(p_track);
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    v_new := jsonb_populate_record(null::private.encores, v_row);
    if v_new.id is null then
      raise exception 'content release %: an encore row has no id', p_version;
    end if;
    select * into v_old from private.encores e where e.id = v_new.id for update;
    v_new.track := p_track;
    v_new.status := private.release_status(p_version, v_new.id, v_row ->> 'status', v_old.status);
    v_new.content_hash := private.content_hash(to_jsonb(v_new) - array['track', 'status', 'content_hash']);
    if v_old.id is null then
      insert into private.encores values (v_new.*);
      v_inserted := v_inserted + 1;
      continue;
    end if;
    v_changed := v_old.content_hash <> v_new.content_hash or v_old.status <> v_new.status;
    perform private.release_guard(p_version, 'encore', v_new.id, v_old.track, p_track,
      v_changed, v_new.id = any (v_locked), p_allow_frozen);
    if not v_changed then
      v_same := v_same + 1;
      continue;
    end if;
    update private.encores e
       set category = v_new.category, question = v_new.question, unit = v_new.unit,
           unit_short = v_new.unit_short, unit_label = v_new.unit_label, value_kind = v_new.value_kind,
           answer = v_new.answer, decimals = v_new.decimals, bullseye = v_new.bullseye, close = v_new.close,
           explanation = v_new.explanation, learn_more = v_new.learn_more,
           source_labels = v_new.source_labels, review_by = v_new.review_by, status = v_new.status,
           content_hash = v_new.content_hash
     where e.id = v_new.id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object('table', 'encores', 'rows', jsonb_array_length(p_rows),
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_same);
end
$$;

create or replace function private.release_questions(
  p_version text, p_track text, p_rows jsonb, p_allow_frozen boolean default false)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_new private.sealed_questions;
  v_old private.sealed_questions;
  v_locked text[];
  v_changed boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_same integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  v_locked := private.locked_items(p_track);
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    v_new := jsonb_populate_record(null::private.sealed_questions, v_row);
    if v_new.id is null then
      raise exception 'content release %: a question row has no id', p_version;
    end if;
    select * into v_old from private.sealed_questions q where q.id = v_new.id for update;
    v_new.track := p_track;
    v_new.status := private.release_status(p_version, v_new.id, v_row ->> 'status', v_old.status);
    v_new.content_hash := private.content_hash(to_jsonb(v_new) - array['track', 'status', 'content_hash']);
    if v_old.id is null then
      insert into private.sealed_questions values (v_new.*);
      v_inserted := v_inserted + 1;
      continue;
    end if;
    v_changed := v_old.content_hash <> v_new.content_hash or v_old.status <> v_new.status;
    perform private.release_guard(p_version, 'question', v_new.id, v_old.track, p_track,
      v_changed, v_new.id = any (v_locked), p_allow_frozen);
    if not v_changed then
      v_same := v_same + 1;
      continue;
    end if;
    update private.sealed_questions q
       set format = v_new.format, category = v_new.category, stem = v_new.stem, options = v_new.options,
           correct = v_new.correct, option_order = v_new.option_order, value_display = v_new.value_display,
           explanation = v_new.explanation, learn_more = v_new.learn_more, review_by = v_new.review_by,
           status = v_new.status, content_hash = v_new.content_hash
     where q.id = v_new.id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object('table', 'sealed_questions', 'rows', jsonb_array_length(p_rows),
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_same);
end
$$;

-- Hostable room packs: { id, title, theme, question_ids }. A pack keeps
-- its status; rooms copy their questions when created (§8.11), so a
-- changed pack never reaches a room already open.
create or replace function private.release_room_packs(p_version text, p_track text, p_rows jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_new private.room_packs;
  v_old private.room_packs;
  v_count integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    v_new := jsonb_populate_record(null::private.room_packs, v_row);
    if v_new.id is null then
      raise exception 'content release %: a room pack row has no id', p_version;
    end if;
    select * into v_old from private.room_packs p where p.id = v_new.id for update;
    perform private.release_guard(p_version, 'room pack', v_new.id, coalesce(v_old.track, p_track), p_track,
      false, false, false);
    insert into private.room_packs (id, track, title, theme, question_ids)
    values (v_new.id, p_track, v_new.title, v_new.theme, v_new.question_ids)
    on conflict (id) do update
      set title = excluded.title, theme = excluded.theme, question_ids = excluded.question_ids;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('table', 'room_packs', 'rows', v_count);
end
$$;

-- Challenge packs: { id, title, theme, rounds }, loaded as drafts. A
-- published pack's rounds change only with p_allow_frozen.
create or replace function private.release_challenge_packs(
  p_version text, p_track text, p_rows jsonb, p_allow_frozen boolean default false)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_rounds jsonb;
  v_old private.challenge_packs;
  v_count integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    if coalesce(v_row ->> 'id', '') = '' then
      raise exception 'content release %: a challenge pack row has no id', p_version;
    end if;
    v_rounds := private.release_rounds(p_version, 'challenge pack ' || (v_row ->> 'id'), v_row -> 'rounds');
    select * into v_old from private.challenge_packs c where c.id = v_row ->> 'id' for update;
    if v_old.id is not null then
      perform private.release_guard(p_version, 'challenge pack', v_old.id, v_old.track, p_track,
        private.bare_rounds(v_old.rounds) <> private.bare_rounds(v_rounds), v_old.status = 'published', p_allow_frozen);
    end if;
    insert into private.challenge_packs as c (id, track, title, theme, rounds, composition, max_points)
    values (v_row ->> 'id', p_track, v_row ->> 'title', v_row ->> 'theme', v_rounds,
            private.composition_of(v_rounds), private.max_points_of(v_rounds))
    on conflict (id) do update
      set title = excluded.title, theme = excluded.theme,
          rounds = private.carry_voided(c.rounds, excluded.rounds),
          composition = excluded.composition, max_points = excluded.max_points;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('table', 'challenge_packs', 'rows', v_count);
end
$$;

-- Dailies: { date, daily_number, rounds, ready, spare_order }. The number
-- must be the one the epoch gives (§8.7). A date a spare already took
-- keeps it. A frozen Daily takes new rounds only with p_allow_frozen, and
-- one whose window has opened never does; either keeps its ready flag,
-- which the freeze decided, and takes only a new spare order.
create or replace function private.release_dailies(
  p_version text, p_track text, p_rows jsonb, p_allow_frozen boolean default false)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_date date;
  v_number integer;
  v_rounds jsonb;
  v_ready boolean;
  v_order jsonb;
  v_entry jsonb;
  v_old private.dailies;
  v_opened boolean;
  v_epoch date := private.daily_epoch();
  v_inserted integer := 0;
  v_updated integer := 0;
  v_same integer := 0;
  v_kept integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  if v_epoch is null then
    raise exception 'content release %: daily_epoch is not set; load supabase/seed/config.sql first', p_version;
  end if;
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    if coalesce(v_row ->> 'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'content release %: a Daily row has no date', p_version;
    end if;
    v_date := (v_row ->> 'date')::date;
    v_number := case when jsonb_typeof(v_row -> 'daily_number') = 'number' then (v_row ->> 'daily_number')::integer end;
    if v_number is null or v_number is distinct from private.daily_number_for(v_date) then
      raise exception 'content release %: the Daily for % carries number %, but DAILY_EPOCH % makes it %',
        p_version, v_date, coalesce(v_number::text, 'null'), v_epoch, coalesce(private.daily_number_for(v_date)::text, 'none');
    end if;
    v_rounds := private.release_rounds(p_version, 'the Daily for ' || v_date, v_row -> 'rounds');
    if coalesce(jsonb_typeof(v_row -> 'ready'), '') <> 'boolean' then
      raise exception 'content release %: the Daily for % has no ready flag', p_version, v_date;
    end if;
    v_ready := (v_row ->> 'ready')::boolean;
    v_order := '[]';
    if coalesce(jsonb_typeof(v_row -> 'spare_order'), 'null') not in ('array', 'null') then
      raise exception 'content release %: the Daily for % has a spare order that is not an array', p_version, v_date;
    end if;
    for v_entry in
      select e from jsonb_array_elements(coalesce(nullif(v_row -> 'spare_order', 'null'::jsonb), '[]')) with ordinality x(e, n) order by n
    loop
      if not coalesce(
           v_entry ->> 'spare' ~ '^spare\.[0-9]{2}$'
           and jsonb_typeof(v_entry -> 'breaks') = 'array'
           and not exists (select 1 from jsonb_array_elements(v_entry -> 'breaks') b
                            where jsonb_typeof(b) <> 'string' or b #>> '{}' !~ '^[A-Z][0-9]{2}$'),
           false) then
        raise exception 'content release %: the Daily for % has a spare order entry that is not { spare, breaks }', p_version, v_date;
      end if;
      v_order := v_order || jsonb_build_array(jsonb_build_object('spare', v_entry ->> 'spare', 'breaks', v_entry -> 'breaks'));
    end loop;

    select * into v_old from private.dailies d where d.track = p_track and d.local_date = v_date for update;
    if v_old.local_date is null then
      insert into private.dailies (track, daily_number, local_date, rounds, composition, max_points,
                                   status, ready, spare_order, release_version)
      values (p_track, v_number, v_date, v_rounds, private.composition_of(v_rounds), private.max_points_of(v_rounds),
              'scheduled', v_ready, v_order, p_version);
      v_inserted := v_inserted + 1;
      continue;
    end if;
    v_opened := private.daily_opens_at(v_date) <= private.now();
    if v_old.spare_id is not null then
      update private.dailies d set release_version = p_version
       where d.track = p_track and d.local_date = v_date;
      v_kept := v_kept + 1;
    elsif private.bare_rounds(v_old.rounds) = private.bare_rounds(v_rounds) then
      update private.dailies d
         set ready = case when d.status = 'frozen' or v_opened then d.ready else v_ready end,
             spare_order = v_order, release_version = p_version
       where d.track = p_track and d.local_date = v_date;
      v_same := v_same + 1;
    else
      if v_opened then
        raise exception 'content release %: the % Daily for % has opened, so its rounds never change; correct a played Daily with admin_void_round or admin_correct_key',
          p_version, p_track, v_date;
      end if;
      if v_old.status = 'frozen' and not coalesce(p_allow_frozen, false) then
        raise exception 'content release %: the % Daily for % is frozen, so it is refused; pass --allow-frozen for a correction',
          p_version, p_track, v_date;
      end if;
      update private.dailies d
         set rounds = private.carry_voided(d.rounds, v_rounds), composition = private.composition_of(v_rounds),
             max_points = private.max_points_of(v_rounds), ready = v_ready, spare_order = v_order,
             release_version = p_version
       where d.track = p_track and d.local_date = v_date;
      v_updated := v_updated + 1;
    end if;
  end loop;
  return jsonb_build_object('table', 'dailies', 'rows', jsonb_array_length(p_rows),
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_same, 'kept_by_spare', v_kept);
end
$$;

-- Spare sets: { id, rounds }. Only sets whose every item passed pass D
-- for a spare reach a release (CONTENT_GUIDE §9.9 rule 7). A set that
-- already filled a date takes new rounds only with p_allow_frozen; the
-- Daily it filled keeps its own copy either way.
create or replace function private.release_spares(
  p_version text, p_track text, p_rows jsonb, p_allow_frozen boolean default false)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row jsonb;
  v_rounds jsonb;
  v_old private.daily_spares;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_same integer := 0;
begin
  perform private.release_args(p_version, p_track, p_rows);
  for v_row in select r from jsonb_array_elements(p_rows) with ordinality x(r, n) order by n loop
    if coalesce(v_row ->> 'id', '') !~ '^spare\.[0-9]{2}$' then
      raise exception 'content release %: a spare row has no spare.<NN> id', p_version;
    end if;
    v_rounds := private.release_rounds(p_version, 'spare ' || (v_row ->> 'id'), v_row -> 'rounds');
    select * into v_old from private.daily_spares s where s.track = p_track and s.id = v_row ->> 'id' for update;
    if v_old.id is null then
      insert into private.daily_spares (track, id, rounds, composition, max_points, release_version)
      values (p_track, v_row ->> 'id', v_rounds, private.composition_of(v_rounds), private.max_points_of(v_rounds), p_version);
      v_inserted := v_inserted + 1;
    elsif private.bare_rounds(v_old.rounds) = private.bare_rounds(v_rounds) then
      update private.daily_spares s set active = true, release_version = p_version
       where s.track = p_track and s.id = v_old.id;
      v_same := v_same + 1;
    else
      if v_old.used_for_date is not null and not coalesce(p_allow_frozen, false) then
        raise exception 'content release %: % spare % filled % already, so it is refused; pass --allow-frozen for a correction',
          p_version, p_track, v_old.id, v_old.used_for_date;
      end if;
      update private.daily_spares s
         set rounds = v_rounds, composition = private.composition_of(v_rounds),
             max_points = private.max_points_of(v_rounds), active = true, release_version = p_version
       where s.track = p_track and s.id = v_old.id;
      v_updated := v_updated + 1;
    end if;
  end loop;
  return jsonb_build_object('table', 'daily_spares', 'rows', jsonb_array_length(p_rows),
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_same);
end
$$;

-- ---------------------------------------------------------------------------
-- verify_release and record_release (§5.4)
-- ---------------------------------------------------------------------------

-- Raises unless the track is consistent after a release:
--   1. every round of every Daily, spare set and challenge pack names an
--      item of its round's type on the track, and every room pack question
--      exists on the track;
--   2. the Dailies this release named that can still freeze (scheduled,
--      not opened, no spare) and its spare sets that can still fill a date
--      name only items that can publish (round_problems): active, before
--      their review date, and for mysteries, active answer, accepted and
--      distractor entities;
--   3. every active mystery's entities exist on its type's list, and the
--      e2e track's mysteries name fixture entities only, the main track's
--      none;
--   4. a published challenge pack draws only on Dailies that have closed.
-- The message lists the first problems by date, id and rule word. Answers
-- what it checked.
create or replace function private.verify_release(p_version text, p_track text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_problems jsonb;
  v_dailies integer;
  v_spares integer;
begin
  perform private.release_args(p_version, p_track, '[]'::jsonb);
  select coalesce(jsonb_agg(p order by p ->> 'at', p ->> 'id'), '[]'::jsonb)
    into v_problems
    from (
      select jsonb_build_object('at', 'daily ' || d.local_date) || x.p as p
        from private.dailies d
        cross join lateral jsonb_array_elements(private.round_problems(
          p_track, d.rounds,
          case when d.release_version = p_version and d.status = 'scheduled' and d.spare_id is null
                and private.daily_opens_at(d.local_date) > v_now then d.local_date end)) x(p)
       where d.track = p_track
         and (x.p ->> 'problem' in ('missing', 'track')
              or (d.release_version = p_version and d.status = 'scheduled' and d.spare_id is null
                  and private.daily_opens_at(d.local_date) > v_now))
      union all
      select jsonb_build_object('at', 'spare ' || s.id) || x.p
        from private.daily_spares s
        cross join lateral jsonb_array_elements(private.round_problems(p_track, s.rounds, null)) x(p)
       where s.track = p_track
         and (x.p ->> 'problem' in ('missing', 'track')
              or (s.release_version = p_version and s.active and s.used_for_date is null))
      union all
      select jsonb_build_object('at', 'challenge pack ' || c.id) || x.p
        from private.challenge_packs c
        cross join lateral jsonb_array_elements(private.round_problems(p_track, c.rounds, null)) x(p)
       where c.track = p_track and x.p ->> 'problem' in ('missing', 'track')
      union all
      select jsonb_build_object('at', 'challenge pack ' || c.id, 'id', r ->> 'contentId', 'problem', 'not_played')
        from private.challenge_packs c
        cross join lateral jsonb_array_elements(c.rounds) r
       where c.track = p_track and c.status = 'published'
         and not exists (
           select 1 from private.dailies d
           cross join lateral jsonb_array_elements(d.rounds) dr
            where d.track = p_track and private.daily_closes_at(d.local_date) <= v_now
              and dr ->> 'contentId' = r ->> 'contentId')
      union all
      select jsonb_build_object('at', 'room pack ' || rp.id, 'id', q.id, 'problem', 'missing')
        from private.room_packs rp
        cross join lateral unnest(rp.question_ids) q(id)
       where rp.track = p_track
         and not exists (select 1 from private.sealed_questions sq where sq.id = q.id and sq.track = p_track)
      union all
      select jsonb_build_object('at', 'mystery ' || m.id, 'id', e.id,
               'problem', case when (e.id like 'fx.%') <> (p_track = 'e2e') then 'entity_track' else 'entity_missing' end)
        from private.mysteries m
        cross join lateral unnest(array[m.answer_entity] || m.accepted_entities || m.distractors) e(id)
       where m.track = p_track and m.status = 'active'
         and ((e.id like 'fx.%') <> (p_track = 'e2e')
              or not exists (select 1 from private.answer_entities a
                              where a.answer_type = m.answer_type and a.entity_id = e.id))
    ) problems;
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'content release % does not verify on the % track (% problem(s)): %', p_version, p_track,
      jsonb_array_length(v_problems), left(v_problems::text, 1500);
  end if;
  select count(*) into v_dailies from private.dailies d where d.track = p_track and d.release_version = p_version;
  select count(*) into v_spares from private.daily_spares s
   where s.track = p_track and s.release_version = p_version and s.active and s.used_for_date is null;
  return jsonb_build_object('version', p_version, 'track', p_track, 'verified', true,
    'dailies', v_dailies, 'spares', v_spares);
end
$$;

-- The last call of a release: verifies the track again, then marks what
-- the release no longer names (scheduled Dailies still to open lose their
-- ready flag; unused spare sets go inactive), with one owner alert when it
-- marks anything, and records the release. A version already recorded
-- with this content answers the earlier record; with other content it is
-- refused.
create or replace function private.record_release(
  p_version text, p_track text, p_content_hash text, p_counts jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_old private.content_releases;
  v_checked jsonb;
  v_withdrawn jsonb;
  v_inactive jsonb;
begin
  perform private.release_args(p_version, p_track, '[]'::jsonb);
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content release %: the content hash is not 64 hex digits', p_version;
  end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'content release %: the counts are not a JSON object', p_version;
  end if;
  select * into v_old from private.content_releases r where r.version = p_version for update;
  if v_old.version is not null then
    if v_old.content_hash <> p_content_hash or v_old.track <> p_track then
      raise exception 'content release %: that version was recorded with other content; give this release a new version', p_version;
    end if;
    return jsonb_build_object('version', p_version, 'track', p_track, 'recorded', false,
      'applied_at', v_old.applied_at);
  end if;
  v_checked := private.verify_release(p_version, p_track);

  with withdrawn as (
    update private.dailies d
       set ready = false
     where d.track = p_track and d.status = 'scheduled' and d.spare_id is null and d.ready
       and d.release_version is distinct from p_version
       and private.daily_opens_at(d.local_date) > private.now()
    returning d.local_date
  )
  select coalesce(jsonb_agg(w.local_date order by w.local_date), '[]'::jsonb) into v_withdrawn from withdrawn w;
  with inactive as (
    update private.daily_spares s
       set active = false
     where s.track = p_track and s.used_for_date is null and s.active
       and s.release_version is distinct from p_version
    returning s.id
  )
  select coalesce(jsonb_agg(i.id order by i.id), '[]'::jsonb) into v_inactive from inactive i;
  if jsonb_array_length(v_withdrawn) > 0 or jsonb_array_length(v_inactive) > 0 then
    insert into private.alerts (kind, detail)
    values ('content_withdrawn', jsonb_build_object(
      'item', p_track || ':' || p_version, 'track', p_track, 'version', p_version,
      'dailies', v_withdrawn, 'spares', v_inactive,
      'why', 'The release no longer names these. The Dailies will not freeze, and a spare takes each date when it comes due, '
             || 'unless a later release names it again; the spare sets will not be used.'));
  end if;

  insert into private.content_releases (version, track, content_hash, counts)
  values (p_version, p_track, p_content_hash, p_counts);
  return v_checked || jsonb_build_object('recorded', true,
    'withdrawn_dailies', jsonb_array_length(v_withdrawn), 'inactive_spares', jsonb_array_length(v_inactive));
end
$$;

-- ---------------------------------------------------------------------------
-- Publishing (§8.7, §8.15: qz_publish, hourly at :07)
-- ---------------------------------------------------------------------------

-- An owner alert of one kind and item at most once per UTC day, so the
-- hourly publisher repeats a notice daily, not hourly. Only alerts from the
-- day's start up to the clock count: tests move the clock, and an alert
-- written later on a live database must not hide theirs.
create or replace function private.content_alert(p_kind text, p_item text, p_detail jsonb)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.alerts a
     where a.kind = p_kind and a.detail ->> 'item' = p_item
       and a.at >= date_trunc('day', private.now(), 'UTC') and a.at <= private.now()) then
    return false;
  end if;
  insert into private.alerts (kind, detail)
  values (p_kind, coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('item', p_item));
  return true;
end
$$;

-- Fills one date of a track from that track's spares: the first unused,
-- active set in the date's spare order that can publish on the date, then
-- the track's others by id (unranked, so their broken rules are unknown).
-- Inserts the Daily, or replaces the rounds of the one there, frozen and
-- ready, marks the set used, and leaves an alert naming the reason and
-- the rules the set breaks. With no usable set it leaves one alert a day
-- and answers false.
create or replace function private.publish_spare(
  p_track text, p_date date, p_reason text, p_problems jsonb default '[]'::jsonb)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_row private.dailies;
  v_spare private.daily_spares;
  v_entry jsonb;
begin
  select * into v_row from private.dailies d where d.track = p_track and d.local_date = p_date for update;
  for v_entry in
    select c.entry
      from (
        select o.e as entry, o.n as rank
          from jsonb_array_elements(coalesce(v_row.spare_order, '[]'::jsonb)) with ordinality o(e, n)
        union all
        select jsonb_build_object('spare', s.id, 'breaks', null), 100000 + row_number() over (order by s.id)
          from private.daily_spares s
         where s.track = p_track and s.used_for_date is null and s.active
      ) c
     order by c.rank
  loop
    update private.daily_spares s
       set used_for_date = p_date
     where s.track = p_track and s.id = v_entry ->> 'spare' and s.used_for_date is null and s.active
       and jsonb_array_length(private.round_problems(p_track, s.rounds, p_date)) = 0
    returning s.* into v_spare;
    exit when v_spare.id is not null;
  end loop;

  if v_spare.id is null then
    perform private.content_alert('daily_no_spare', p_track || ':' || p_date,
      jsonb_build_object('track', p_track, 'date', p_date, 'reason', p_reason, 'problems', p_problems,
        'why', 'No spare set of this track can publish on this date, so it has no playable Daily until a release '
               || 'brings one (start_daily answers no_daily).'));
    return false;
  end if;

  if v_row.local_date is null then
    insert into private.dailies (track, daily_number, local_date, rounds, composition, max_points,
                                 status, ready, frozen_at, spare_id)
    values (p_track, private.daily_number_for(p_date), p_date, v_spare.rounds, v_spare.composition,
            v_spare.max_points, 'frozen', true, v_now, v_spare.id);
  else
    update private.dailies d
       set rounds = v_spare.rounds, composition = v_spare.composition, max_points = v_spare.max_points,
           status = 'frozen', ready = true, frozen_at = v_now, spare_id = v_spare.id
     where d.track = p_track and d.local_date = p_date;
  end if;
  insert into private.alerts (kind, detail)
  values ('daily_spare', jsonb_build_object(
    'item', p_track || ':' || p_date, 'track', p_track, 'date', p_date,
    'daily_number', private.daily_number_for(p_date), 'reason', p_reason, 'problems', p_problems,
    'spare', v_spare.id, 'ranked', jsonb_typeof(v_entry -> 'breaks') = 'array',
    'breaks', v_entry -> 'breaks',
    'replaced', case when v_row.local_date is null then null
                     else (select jsonb_agg(r ->> 'contentId' order by n)
                             from jsonb_array_elements(v_row.rounds) with ordinality x(r, n)) end));
  return true;
end
$$;

-- One track's hourly pass. In order:
--   1. A Daily in place for every date from yesterday to today plus 3
--      (UTC) whose window has not closed: a date with no row takes a
--      spare; a Daily that cannot publish (daily_problems) takes the first
--      usable spare in its order once it comes due, from the start of the
--      UTC day before its date, about 10 hours before it opens anywhere.
--      One that has opened is never changed: it leaves a daily_late alert.
--   2. The freeze (config freeze): a scheduled Daily up to days_initial
--      days ahead before switch_on, days after it, freezes when it can
--      publish, and otherwise stays editable with a daily_unready alert.
--   3. Draft challenge packs publish once 30 Dailies of the track have
--      closed and every round names an active item that played on one.
--   4. The runway: fewer than runway_alarm Dailies from today leaves a
--      runway alert, once a day.
-- Answers what it did.
create or replace function private.publish_track(p_track text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v_today date := (v_now at time zone 'UTC')::date;
  v_epoch date := private.daily_epoch();
  v_freeze jsonb := coalesce(private.cfg('freeze'), '{}'::jsonb);
  v_alarm integer := coalesce((private.cfg('runway_alarm') #>> '{}')::integer, 30);
  v_days integer;
  v_date date;
  v_row private.dailies;
  v_problems jsonb;
  v_filled integer := 0;
  v_frozen integer := 0;
  v_packs integer := 0;
  v_left integer;
begin
  if p_track is null or p_track not in ('main', 'e2e') then
    raise exception 'publish_track: % is not a track', coalesce(p_track, 'null');
  end if;
  if v_epoch is null then
    perform private.content_alert('owner_queue', 'publish:daily_epoch',
      jsonb_build_object('why', 'publish found no daily_epoch in private.config: load supabase/seed/config.sql.'));
    return jsonb_build_object('track', p_track, 'skipped', 'daily_epoch');
  end if;
  v_days := case
    when v_today < coalesce((v_freeze ->> 'switch_on')::date, v_epoch + 28)
      then coalesce((v_freeze ->> 'days_initial')::integer, 3)
    else coalesce((v_freeze ->> 'days')::integer, 7) end;

  for v_date in
    select greatest(v_today - 1, v_epoch) + i
      from generate_series(0, (v_today + 3) - greatest(v_today - 1, v_epoch)) i
  loop
    continue when private.daily_closes_at(v_date) <= v_now;
    select * into v_row from private.dailies d where d.track = p_track and d.local_date = v_date for update;
    if v_row.local_date is null then
      if private.publish_spare(p_track, v_date, 'gap') then
        v_filled := v_filled + 1;
      end if;
      continue;
    end if;
    continue when v_row.spare_id is not null;
    v_problems := private.daily_problems(v_row);
    continue when jsonb_array_length(v_problems) = 0;
    if private.daily_opens_at(v_date) <= v_now then
      perform private.content_alert('daily_late', p_track || ':' || v_date,
        jsonb_build_object('track', p_track, 'date', v_date, 'problems', v_problems,
          'why', 'This Daily cannot publish, but its window has opened, so it was left alone: '
                 || 'void its rounds (admin_void_round) if it is wrong.'));
    elsif v_date <= v_today + 1 then
      if private.publish_spare(p_track, v_date,
           case when v_problems -> 0 ->> 'problem' = 'not_ready' then 'not_ready' else 'cannot_publish' end,
           v_problems) then
        v_filled := v_filled + 1;
      end if;
    end if;
  end loop;

  for v_row in
    select * from private.dailies d
     where d.track = p_track and d.status = 'scheduled'
       and d.local_date between v_today - 1 and v_today + v_days
     order by d.local_date
       for update
  loop
    v_problems := private.daily_problems(v_row);
    if jsonb_array_length(v_problems) = 0 then
      update private.dailies d set status = 'frozen', frozen_at = v_now
       where d.track = p_track and d.local_date = v_row.local_date;
      v_frozen := v_frozen + 1;
    elsif private.daily_opens_at(v_row.local_date) > v_now then
      perform private.content_alert('daily_unready', p_track || ':' || v_row.local_date,
        jsonb_build_object('track', p_track, 'date', v_row.local_date, 'problems', v_problems,
          'why', 'Inside the freeze window but cannot publish yet (pass D, an inactive item or a review date). '
                 || 'Release a fix before it comes due, or a spare takes its date.'));
    end if;
  end loop;

  if (select count(*) from private.dailies d
       where d.track = p_track and private.daily_closes_at(d.local_date) <= v_now) >= 30 then
    with published as (
      update private.challenge_packs c
         set status = 'published', published_at = v_now
       where c.track = p_track and c.status = 'draft'
         and jsonb_array_length(private.round_problems(p_track, c.rounds, null)) = 0
         and not exists (
           select 1 from jsonb_array_elements(c.rounds) r
            where not exists (
              select 1 from private.dailies d
              cross join lateral jsonb_array_elements(d.rounds) dr
               where d.track = p_track and private.daily_closes_at(d.local_date) <= v_now
                 and dr ->> 'contentId' = r ->> 'contentId'))
      returning c.id
    )
    select count(*) into v_packs from published;
  end if;

  select count(*) into v_left from private.dailies d where d.track = p_track and d.local_date >= v_today;
  if v_left < v_alarm then
    perform private.content_alert('runway', p_track,
      jsonb_build_object('track', p_track, 'left', v_left, 'threshold', v_alarm,
        'why', 'Fewer scheduled Dailies are left than the runway alarm: the weekly content run has stalled '
               || 'or fallen behind (PRD §3.18.5).'));
  end if;
  return jsonb_build_object('track', p_track, 'filled', v_filled, 'frozen', v_frozen,
    'published_packs', v_packs, 'left', v_left, 'alarm', v_left < v_alarm);
end
$$;

-- The publisher pg_cron calls (SQL-8 schedules it). Each track runs in
-- its own subtransaction, so a failure on one track rolls back alone and
-- leaves a job_step_failed alert while the other still publishes.
create or replace function private.publish()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_track text;
begin
  foreach v_track in array array['main', 'e2e'] loop
    begin
      perform private.publish_track(v_track);
    exception
      when others then
        insert into private.alerts (kind, detail)
        values ('job_step_failed', jsonb_build_object(
          'job', 'publish', 'step', 'publish_track(' || v_track || ')',
          'sqlstate', sqlstate, 'message', private.redact(sqlerrm)));
    end;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- The content queue (§8.4): what needs the owner, read through MCP.
-- ---------------------------------------------------------------------------

-- One row per item, as (section, item, detail, at). SQL-3 starts it with
-- the Daily runway of each track (alarm below runway_alarm, AC-OPS-02)
-- and every open alert, which carries the publisher's spare, unready,
-- late and no-spare notices and the weekly run's owner_queue entries.
-- Later tickets add their sections (reports, the pull queue, refusals,
-- usage) with create or replace view, keeping these four columns.
create or replace view private.content_queue with (security_invoker = true) as
  select 'runway'::text as section,
         t.track as item,
         jsonb_build_object('track', t.track, 'left', t.left_count, 'threshold', t.alarm,
                            'alarm', t.left_count < t.alarm, 'last_date', t.last_date) as detail,
         private.now() as at
    from (
      select k.track,
             (select count(*) from private.dailies d
               where d.track = k.track and d.local_date >= (private.now() at time zone 'UTC')::date)::integer as left_count,
             (select max(d.local_date) from private.dailies d where d.track = k.track) as last_date,
             coalesce((private.cfg('runway_alarm') #>> '{}')::integer, 30) as alarm
        from (values ('main'), ('e2e')) k(track)
    ) t
  union all
  select 'alert', a.kind, a.detail || jsonb_build_object('alert_id', a.id), a.at
    from private.alerts a
   where a.resolved_at is null;
