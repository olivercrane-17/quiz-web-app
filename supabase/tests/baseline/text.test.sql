-- Text, codes, zones and payload caps (ARCHITECTURE §8.4, §8.6, §8.7,
-- §2.4; SQL-1).
begin;

-- clean_text: NFC, controls and invisible characters out, whitespace
-- collapsed, trimmed. Emoji joiners stay.
do $$
declare
  v_case record;
begin
  for v_case in
    select * from (values
      (U&'  Caf\0065\0301  ', U&'Caf\00E9'),                         -- NFC composes e + acute
      (E'one\ttwo\nthree\r\nfour', 'one two three four'),          -- line breaks and tabs are spaces
      (U&'a\00A0\2003\3000b', 'a b'),                               -- Unicode spaces collapse
      (U&'be\0007ll', 'bell'),                                       -- a C0 control goes
      (U&'zero\200Bwidth', 'zerowidth'),                             -- zero width space goes
      (U&'\202Eevil\202C name', 'evil name'),                        -- bidi overrides go
      (U&'\FEFFbom', 'bom'),                                         -- byte order mark goes
      (U&'\D83D\DC69\200D\D83D\DCBB coder', U&'\D83D\DC69\200D\D83D\DCBB coder'),   -- ZWJ emoji stays
      ('   ', ''),
      ('Plucky Otter', 'Plucky Otter')
    ) t(raw, want)
  loop
    assert private.clean_text(v_case.raw) = v_case.want,
      format('clean_text(%L) = %L, want %L', v_case.raw, private.clean_text(v_case.raw), v_case.want);
  end loop;
  assert private.clean_text(null) is null, 'clean_text(null) is null';
end
$$;
select 'PASS SQL-1 clean_text normalizes, strips controls and collapses whitespace';

-- strip_links: report notes keep their words, never a link.
do $$
declare
  v_case record;
begin
  for v_case in
    select * from (values
      ('see https://evil.example/x?y=1 now', 'see now'),
      ('HTTP://SHOUT.EXAMPLE', ''),
      ('visit www.spam.test today', 'visit today'),
      ('mail mailto:me@spam.test or tel:+15550100', 'mail or'),
      ('go to bit.ly/abc for prizes', 'go to for prizes'),
      ('cheap stuff at spam.com.', 'cheap stuff at .'),
      ('ask at quiz.co.uk, then wait', 'ask at , then wait'),
      ('The answer was 3.14 not 3', 'The answer was 3.14 not 3'),
      ('Node.js and e.g. U.S. stay', 'Node.js and e.g. U.S. stay'),
      ('The clue said Constantinople', 'The clue said Constantinople')
    ) t(raw, want)
  loop
    assert private.strip_links(v_case.raw) = v_case.want,
      format('strip_links(%L) = %L, want %L', v_case.raw, private.strip_links(v_case.raw), v_case.want);
  end loop;
end
$$;
select 'PASS SQL-1 strip_links removes links and keeps the words';

-- redact (the helper half of AC-DAT-02): no player id survives in text or
-- byte form, nor tokens, codes, e-mail or IP addresses; times and names stay.
do $$
declare
  v_case record;
  v_player uuid := '6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b';
  v_secret text := private.random_token(32);
  v_out text;
begin
  for v_case in
    select * from (values
      ('player 6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b failed', 'player <uuid> failed'),
      ('id 6F1D2C3B4A5E4F608A7B9C8D7E6F5A4B', 'id <uuid>'),
      ('hash \x6f1d2c3b4a5e4f608a7b9c8d7e6f5a4b', 'hash \x<uuid>'),
      ('digest \x0123456789abcdef', 'digest <bytes>'),
      ('mail bob.smith+quiz@example.co.uk now', 'mail <email> now'),
      ('code 7Q2K9M4XH3ZP8W1N used', 'code <code> used'),
      ('from 203.0.113.7 via 10.0.0.1', 'from <ip> via <ip>'),
      ('from 2001:db8:85a3:0:0:8a2e:370:7334 and 2001:db8::1:2', 'from <ip> and <ip>'),
      ('at 2026-11-01 12:30:45.123+00 in on_attempt_finished_challenges', 'at 2026-11-01 12:30:45.123+00 in on_attempt_finished_challenges'),
      ('relation "private.rate_counters" does not exist', 'relation "private.rate_counters" does not exist')
    ) t(raw, want)
  loop
    assert private.redact(v_case.raw) = v_case.want,
      format('redact(%L) = %L, want %L', v_case.raw, private.redact(v_case.raw), v_case.want);
  end loop;

  v_out := private.redact(format('secret=%s sha=%s b64=%s player=%s',
    v_secret,
    encode(sha256(convert_to(v_player::text, 'UTF8')), 'hex'),
    encode(uuid_send(v_player), 'base64'),
    v_player));
  assert position(v_secret in v_out) = 0, 'a secret survived redaction';
  assert position(replace(v_player::text, '-', '') in lower(v_out)) = 0, 'the player id survived as hex';
  assert position(v_player::text in v_out) = 0, 'the player id survived';
  assert position(rtrim(encode(uuid_send(v_player), 'base64'), '=') in v_out) = 0, 'the player id survived as base64';
end
$$;
select 'PASS AC-DAT-02 redact leaves no player id, token, address or code in stored error text';

-- Codes and tokens (§2.4).
do $$
declare
  v_code text;
  v_token text;
begin
  assert private.crockford('\x0000000000'::bytea) = '00000000', 'crockford of zero bytes';
  assert private.crockford('\xffffffffff'::bytea) = 'ZZZZZZZZ', 'crockford of 0xff bytes';
  assert private.crockford('\x0123456789'::bytea) = '04HMASW9', format('crockford vector: %s', private.crockford('\x0123456789'::bytea));
  assert private.crockford('\x01'::bytea) = '04', 'crockford pads the last group';
  assert private.crockford(null) is null, 'crockford(null)';
  assert private.crockford_normalize(U&'  ab-cd\2013ef il o ') = 'ABCDEF110', 'crockford_normalize';
  v_code := private.random_code(10);
  assert v_code ~ '^[0-9A-HJKMNP-TV-Z]{16}$', format('random_code(10) = %s', v_code);
  assert private.random_code(10) <> v_code, 'two random codes match';
  v_token := private.random_token();
  assert v_token ~ '^[A-Za-z0-9_-]{43}$', format('random_token() = %s', v_token);
end
$$;
select 'PASS SQL-1 crockford codes and base64url tokens';

-- Zones (§8.7) and payload caps (§8.6).
do $$
begin
  assert private.valid_tz('Europe/London') = 'Europe/London', 'Europe/London is a zone';
  assert private.valid_tz('UTC') = 'UTC', 'UTC is a zone';
  assert private.valid_tz('Mars/Olympus_Mons') is null, 'an unknown zone';
  assert private.valid_tz('europe/london') is null, 'zone names are exact';
  assert private.valid_tz(null) is null, 'no zone';
  assert coalesce(private.valid_tz('Nowhere/Else'), private.valid_tz('Asia/Tokyo'), 'UTC') = 'Asia/Tokyo',
    'the documented fallback chain';
  assert (select count(*) from private.time_zones) = (select count(*) from pg_catalog.pg_timezone_names),
    'time_zones holds every zone name';

  assert not private.over_cap(repeat('x', 8192)), '8 kB is within the default cap';
  assert private.over_cap(repeat('x', 8193)), 'one byte more is over it';
  assert private.over_cap(repeat(U&'\00E9', 4097)), 'caps count bytes, not characters';
  assert not private.over_cap(repeat('x', 65536), 'events') and private.over_cap(repeat('x', 65537), 'events'), 'events cap';
  assert not private.over_cap(repeat('x', 65536), 'quiz') and private.over_cap(repeat('x', 65537), 'quiz'), 'quiz cap';
  assert not private.over_cap(repeat('x', 32768), 'practice') and private.over_cap(repeat('x', 32769), 'practice'), 'practice cap';
  assert not private.over_cap(repeat('x', 4096), 'report') and private.over_cap(repeat('x', 4097), 'report'), 'report cap';
  assert not private.over_cap(repeat('x', 2048), 'room') and private.over_cap(repeat('x', 2049), 'room'), 'room cap';
  assert not private.over_cap(null), 'nothing is never over';
  begin
    perform private.over_cap('x', 'novel');
    raise exception 'over_cap accepted an unknown kind';
  exception
    when raise_exception then
      if sqlerrm not like 'over_cap: unknown payload kind%' then
        raise;
      end if;
  end;
end
$$;
select 'PASS SQL-1 valid_tz and the payload caps';

rollback;
