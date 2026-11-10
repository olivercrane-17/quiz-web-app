-- set_nickname (ARCHITECTURE §8.4; PRD §3.10.6, §3.12.1; MOD-1): generated
-- names at any age band, custom names for 18_plus only and only through
-- the filter, blocked_text that stores nothing, the friendly name clearing
-- the column, cleaning and the 24-character limit, 20 a player a day, and
-- set_age_band clearing a custom name when the band becomes 13_17.
-- The test loads a list and name parts of its own, since the live ones may
-- hold anything.
begin;

create or replace function private.t_nickname_setup()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  update private.config set value = '0' where key = 'egress_sample_rate';
  insert into private.config (key, value)
  values ('client_ip', '{"header": "x-forwarded-for", "hop": "first", "verified": false}')
  on conflict (key) do update set value = excluded.value;
  update private.config
     set value = value || '{"identity_all_1h": {"cap": 5000, "window_s": 3600},
                            "identity_1m": {"cap": 20, "window_s": 60},
                            "general_player_5m": {"cap": 300, "window_s": 300},
                            "age_band_1d": {"cap": 10, "window_s": 86400},
                            "nickname_1d": {"cap": 20, "window_s": 86400}}'
   where key = 'limits';
  update private.moderation_terms set active = false where active;
  update private.moderation_allow set active = false where active;
  insert into private.moderation_terms (term, match, active)
  values ('zorblax', 'substring', true), ('hen', 'word', true)
  on conflict (term) do update set match = excluded.match, active = true;
  insert into private.name_parts (kind, word, active)
  values ('adjective', 'Brave', true), ('animal', 'Heron', true),
         ('adjective', 'Gloomy', false), ('animal', 'Otter', true)
  on conflict (kind, word) do update set active = excluded.active;
end
$$;

-- Generated names: an active pair or the player's own friendly name, at
-- any band, cleaned first; the friendly name itself clears the column.
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_friendly text;
begin
  perform private.t_nickname_setup();
  perform private.t_now('2026-11-05T09:00:00Z');
  perform private.t_request('198.51.100.200');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('nickname-generated') t;
  v_reply := public.register_player(v_id, v_secret, 'browser', 'none');
  assert v_reply ->> 'ok' = 'true', format('setup: register %s', v_reply);
  v_friendly := v_reply -> 'data' ->> 'friendly_name';

  v_reply := public.set_nickname(v_id, v_secret, 'Brave Heron', true);
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'nickname' = 'Brave Heron',
    format('an active pair: %s', v_reply);
  assert (select p.nickname from private.players p where p.id = v_id) = 'Brave Heron', 'the pair is stored';
  v_reply := public.set_nickname(v_id, v_secret, '  Brave   Heron ', true);
  assert v_reply -> 'data' ->> 'nickname' = 'Brave Heron', format('cleaned before it is checked: %s', v_reply);

  v_reply := public.set_nickname(v_id, v_secret, v_friendly, true);
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' -> 'nickname' = 'null'::jsonb,
    format('the friendly name clears the column: %s', v_reply);
  assert (select p.nickname from private.players p where p.id = v_id) is null, 'no chosen name';

  assert public.set_nickname(v_id, v_secret, 'Gloomy Otter', true) ->> 'code' = 'invalid_input', 'a retired word';
  assert public.set_nickname(v_id, v_secret, 'Otter Brave', true) ->> 'code' = 'invalid_input', 'the wrong order';
  assert public.set_nickname(v_id, v_secret, 'Brave Heron Otter', true) ->> 'code' = 'invalid_input', 'three words';
  assert public.set_nickname(v_id, v_secret, 'brave heron', true) ->> 'code' = 'invalid_input', 'another case';
  assert public.set_nickname(v_id, v_secret, 'Dee', true) ->> 'code' = 'invalid_input', 'custom text sent as generated';
  assert (select p.nickname from private.players p where p.id = v_id) is null, 'a refusal changed the name';
end
$$;
select 'PASS MOD-1 set_nickname takes an active generated pair or the friendly name at any band, and the friendly name clears the column';

-- Custom names: the band first (age_required, then age_forbidden for
-- 13_17), then cleaning and 1 to 24 characters, then the filter, whose
-- refusal stores nothing and echoes nothing.
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
  v_errors bigint;
begin
  perform private.t_nickname_setup();
  perform private.t_now('2026-11-05T10:00:00Z');
  perform private.t_request('198.51.100.201');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('nickname-custom') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';

  assert public.set_nickname(v_id, v_secret, 'Dee', false) ->> 'code' = 'age_required', 'no band yet';
  assert public.set_age_band(v_id, v_secret, '13_17', 'nickname') ->> 'ok' = 'true', 'setup: 13_17';
  assert public.set_nickname(v_id, v_secret, 'Dee', false) ->> 'code' = 'age_forbidden', '13_17 keeps generated names';
  assert public.set_nickname(v_id, v_secret, 'Brave Heron', true) ->> 'ok' = 'true', '13_17 may pick a generated name';
  assert public.set_age_band(v_id, v_secret, '18_plus', 'nickname') ->> 'ok' = 'true', 'setup: 18_plus';

  v_reply := public.set_nickname(v_id, v_secret, '  Dee   the  Great ', false);
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' ->> 'nickname' = 'Dee the Great',
    format('a cleaned custom name: %s', v_reply);
  assert public.set_nickname(v_id, v_secret, repeat('x', 24), false) ->> 'ok' = 'true', '24 characters';
  assert public.set_nickname(v_id, v_secret, repeat('x', 25), false) ->> 'code' = 'invalid_input', '25 characters';
  assert public.set_nickname(v_id, v_secret, '    ', false) ->> 'code' = 'invalid_input', 'spaces only';
  assert public.set_nickname(v_id, v_secret, null, false) ->> 'code' = 'invalid_input', 'no name';
  assert public.set_nickname(v_id, v_secret, 'Dee', null) ->> 'code' = 'invalid_input', 'no generated flag';
  assert public.set_nickname(v_id, v_secret, repeat('x', 9000), false) ->> 'code' = 'invalid_input', 'over the size cap';
  assert public.set_nickname(v_id, v_secret, 'Hence', false) ->> 'ok' = 'true', 'a word term inside an innocent word';
  assert (select p.nickname from private.players p where p.id = v_id) = 'Hence', 'setup: the last name stored';

  select count(*) into v_errors from private.rpc_errors;
  v_reply := public.set_nickname(v_id, v_secret, 'XX zorb.lax YY', false);
  assert v_reply ->> 'code' = 'blocked_text', format('a substring term: %s', v_reply ->> 'code');
  assert public.set_nickname(v_id, v_secret, 'XXzorblaxYY', false) ->> 'code' = 'blocked_text', 'inside a word';
  assert position('zorb' in lower(v_reply::text)) = 0, 'the refusal echoes the text';
  assert public.set_nickname(v_id, v_secret, 'my h3n', false) ->> 'code' = 'blocked_text', 'a word term';
  assert (select p.nickname from private.players p where p.id = v_id) = 'Hence', 'a refusal changed the name';
  assert (select count(*) from private.rpc_errors) = v_errors, 'a refusal stored an error row';
  assert not exists (
    select 1 from private.players p where p.id = v_id and p.nickname ilike '%zorb%'), 'the blocked text was stored';
end
$$;
select 'PASS MOD-1 set_nickname asks the band first, cleans and caps custom names at 24 characters, and refuses filtered text with blocked_text, storing nothing';

-- 20 a player a day, refusals included; anon may call it.
do $$
declare
  v_id uuid;
  v_secret text;
begin
  perform private.t_nickname_setup();
  perform private.t_now('2026-11-05T11:00:00Z');
  perform private.t_request('198.51.100.202');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('nickname-limit') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  perform set_config('qz.t_nickname_player', v_id::text, true);
  perform set_config('qz.t_nickname_secret', v_secret, true);
end
$$;
set local role anon;
do $$
declare
  v_reply jsonb := public.set_nickname(
    current_setting('qz.t_nickname_player')::uuid, current_setting('qz.t_nickname_secret'), 'Brave Heron', true);
begin
  assert v_reply ->> 'ok' = 'true', format('anon calls set_nickname: %s', v_reply);
end
$$;
reset role;
do $$
declare
  v_id uuid := current_setting('qz.t_nickname_player')::uuid;
  v_secret text := current_setting('qz.t_nickname_secret');
  v_friendly text := (select p.friendly_name from private.players p where p.id = current_setting('qz.t_nickname_player')::uuid);
  v_reply jsonb;
  v_index integer;
begin
  -- Calls 2 to 20: the friendly name on even calls, a refused custom name
  -- (no band yet) on odd ones, so 9 refusals count too.
  for v_index in 2 .. 20 loop
    v_reply := public.set_nickname(v_id, v_secret,
      case when v_index % 2 = 0 then v_friendly else 'Dee' end, v_index % 2 = 0);
    assert v_reply ->> 'code' is not distinct from case when v_index % 2 = 0 then null else 'age_required' end,
      format('call %s: %s', v_index, v_reply);
  end loop;
  v_reply := public.set_nickname(v_id, v_secret, 'Brave Heron', true);
  assert v_reply ->> 'code' = 'rate_limited' and v_reply ->> 'limit_scope' = 'player'
     and (v_reply ->> 'retry_after_ms')::integer > 0, format('the 21st of the day: %s', v_reply);
  perform private.t_now('2026-11-06T00:00:01Z');
  assert public.set_nickname(v_id, v_secret, 'Brave Heron', true) ->> 'ok' = 'true', 'the next day';
end
$$;
select 'PASS MOD-1 set_nickname allows 20 calls a player a day, refusals included, and anon may call it';

-- 13 to 17 get generated names only (PRD §3.10.6): moving to 13_17 clears
-- a custom name, and keeps a generated one.
do $$
declare
  v_id uuid;
  v_secret text;
  v_reply jsonb;
begin
  perform private.t_nickname_setup();
  perform private.t_now('2026-11-05T13:00:00Z');
  perform private.t_request('198.51.100.204');
  select t.player_id, t.secret into v_id, v_secret from private.t_player('nickname-band') t;
  assert public.register_player(v_id, v_secret, 'browser', 'none') ->> 'ok' = 'true', 'setup: register';
  assert public.set_age_band(v_id, v_secret, '18_plus', 'nickname') ->> 'ok' = 'true', 'setup: 18_plus';
  assert public.set_nickname(v_id, v_secret, 'Dee', false) ->> 'ok' = 'true', 'setup: a custom name';

  v_reply := public.set_age_band(v_id, v_secret, '13_17', 'group');
  assert v_reply ->> 'ok' = 'true' and v_reply -> 'data' -> 'nickname' = 'null'::jsonb,
    format('13_17 clears the custom name: %s', v_reply);
  assert (select p.nickname is null and p.age_band = '13_17' from private.players p where p.id = v_id),
    'the custom name stayed stored';

  assert public.set_nickname(v_id, v_secret, 'Brave Heron', true) ->> 'ok' = 'true', 'setup: a generated name';
  assert public.set_age_band(v_id, v_secret, '18_plus', 'group') ->> 'ok' = 'true', 'setup: 18_plus again';
  v_reply := public.set_age_band(v_id, v_secret, '13_17', 'group');
  assert v_reply -> 'data' ->> 'nickname' = 'Brave Heron', format('a generated name stays: %s', v_reply);
  assert public.set_age_band(v_id, v_secret, '13_17', 'group') -> 'data' ->> 'nickname' = 'Brave Heron',
    'the same band again changes nothing';
end
$$;
select 'PASS MOD-1 set_age_band clears a custom nickname when the band becomes 13_17 and keeps a generated one';
rollback;
