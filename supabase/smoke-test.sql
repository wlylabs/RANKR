-- Smoke test for the Rankr migration. Runs in a transaction and rolls back, so it leaves nothing behind.
-- Run it against a local / throwaway database after applying all migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/smoke-test.sql
\set QUIET on
begin;

do $$
declare
  r jsonb;
  q jsonb;
  s jsonb;
  t0 timestamptz := '2026-09-27 05:42:00.123+00';
  failed boolean;
begin
  -- 1. First paste creates the token with a sealed entry.
  r := public.rankr_record_paste(jsonb_build_object(
    'id', 'solana:AAA', 'chain_id', 'solana', 'address', 'AAA', 'name', 'Alpha 100%', 'symbol', 'ALPHA',
    'entry_price_usd', 0.00001234, 'entry_market_cap', 12340, 'first_pasted_at', t0, 'last_pasted_at', t0,
    'peak_price_usd', 0.00001234, 'peak_at', t0, 'low_price_usd', 0.00001234, 'low_at', t0,
    'last_price_usd', 0.00001234, 'market', '{"priceUsd": 0.00001234}', 'last_checked_at', t0));
  assert (r->>'created')::boolean, 'first paste should create';
  assert (r->'record'->>'paste_count')::int = 1;
  assert r->'record'->>'first_pasted_at' = '2026-09-27T05:42:00.123+00:00', 'ms must round-trip: ' || (r->'record'->>'first_pasted_at');
  assert (r->'record'->>'entry_price_usd')::float8 = 0.00001234;
  assert (r->'record'->>'multiple')::float8 = 1;

  -- 2. Second paste of the same token: counter +1, entry untouched, market folded in.
  r := public.rankr_record_paste(jsonb_build_object(
    'id', 'solana:AAA', 'chain_id', 'solana', 'address', 'AAA', 'name', 'Alpha 100%', 'symbol', 'ALPHA',
    'entry_price_usd', 0.00009999, 'entry_market_cap', 99990, 'first_pasted_at', t0 + interval '1 hour',
    'last_pasted_at', t0 + interval '1 hour',
    'peak_price_usd', 0.00002468, 'peak_at', t0 + interval '1 hour', 'low_price_usd', 0.00002468, 'low_at', t0 + interval '1 hour',
    'last_price_usd', 0.00002468, 'market', '{"priceUsd": 0.00002468}', 'last_checked_at', t0 + interval '1 hour'));
  assert not (r->>'created')::boolean, 'second paste should not create';
  assert (r->'record'->>'paste_count')::int = 2;
  assert (r->'record'->>'entry_price_usd')::float8 = 0.00001234, 'entry must stay sealed';
  assert (r->'record'->>'first_pasted_at') = '2026-09-27T05:42:00.123+00:00';
  assert (r->'record'->>'multiple')::float8 = 2, 'doubled = 2x';
  assert (r->'record'->>'peak_price_usd')::float8 = 0.00002468;

  -- 3. Market refresh: peak/low only move outward.
  assert public.rankr_apply_market(jsonb_build_array(
    jsonb_build_object('id', 'solana:AAA', 'name', '', 'symbol', '', 'image_url', null,
                       'market', '{"priceUsd": 0.000006}', 'last_price_usd', 0.000006, 'checked_at', t0 + interval '2 hours'),
    jsonb_build_object('id', 'solana:missing', 'last_price_usd', 1, 'checked_at', t0))) = 1;
  select to_jsonb(t) into r from public.tokens t where id = 'solana:AAA';
  assert (r->>'peak_price_usd')::float8 = 0.00002468, 'peak kept';
  assert (r->>'low_price_usd')::float8 = 0.000006, 'low moved down';
  assert r->>'name' = 'Alpha 100%', 'empty name does not overwrite';

  -- 4. The entry cannot be edited, even directly.
  failed := false;
  begin
    update public.tokens set entry_price_usd = 1 where id = 'solana:AAA';
  exception when check_violation then failed := true;
  end;
  assert failed, 'entry update must be rejected';

  -- More tokens for the leaderboard.
  perform public.rankr_record_paste(jsonb_build_object(
    'id', 'base:0xbbb', 'chain_id', 'base', 'address', '0xBBB', 'name', 'Bravo', 'symbol', 'BRAVO',
    'entry_price_usd', 1, 'entry_market_cap', 1000000, 'first_pasted_at', t0 - interval '10 days', 'last_pasted_at', t0,
    'peak_price_usd', 12, 'peak_at', t0, 'low_price_usd', 1, 'low_at', t0,
    'last_price_usd', 11, 'market', '{}', 'last_checked_at', t0));
  perform public.rankr_record_paste(jsonb_build_object(
    'id', 'solana:CCC', 'chain_id', 'solana', 'address', 'CCC', 'name', 'Charlie_x', 'symbol', 'CHAR',
    'entry_price_usd', 2, 'entry_market_cap', 2000, 'first_pasted_at', t0 + interval '3 hours', 'last_pasted_at', t0,
    'peak_price_usd', 2, 'peak_at', t0, 'low_price_usd', 0.1, 'low_at', t0,
    'last_price_usd', 0.2, 'market', '{}', 'last_checked_at', t0));

  -- 5. Sorting, filters, paging.
  q := public.rankr_query('top');
  assert (q->>'total')::int = 3;
  assert q->'records'->0->>'id' = 'base:0xbbb' and q->'records'->2->>'id' = 'solana:CCC', 'top: ' || (q->'records')::text;
  assert not (q->'records'->0 ? 'rn'), 'helper column stripped';
  q := public.rankr_query('losers');
  assert q->'records'->0->>'id' = 'solana:CCC';
  q := public.rankr_query('peak');
  assert q->'records'->0->>'id' = 'base:0xbbb';
  q := public.rankr_query('new');
  assert q->'records'->0->>'id' = 'solana:CCC' and q->'records'->2->>'id' = 'base:0xbbb';
  q := public.rankr_query('hot');
  assert q->'records'->0->>'id' = 'solana:AAA';
  q := public.rankr_query('top', p_chain => 'solana');
  assert (q->>'total')::int = 2;
  q := public.rankr_query('top', p_since => t0 - interval '1 day');
  assert (q->>'total')::int = 2, 'since filter';
  q := public.rankr_query('top', p_q => 'brav');
  assert (q->>'total')::int = 1 and q->'records'->0->>'symbol' = 'BRAVO';
  q := public.rankr_query('top', p_q => '0xbbb');
  assert (q->>'total')::int = 1, 'address match is case-insensitive';
  q := public.rankr_query('top', p_q => '%');
  assert (q->>'total')::int = 1, '% is literal (only "Alpha 100%" matches)';
  q := public.rankr_query('top', p_q => '_');
  assert (q->>'total')::int = 1, '_ is literal (only "Charlie_x" matches)';
  q := public.rankr_query('top', p_ids => array['solana:CCC', 'nope']);
  assert (q->>'total')::int = 1;
  q := public.rankr_query('top', p_limit => 1, p_offset => 1);
  assert (q->>'total')::int = 3 and jsonb_array_length(q->'records') = 1 and q->'records'->0->>'id' = 'solana:AAA';
  q := public.rankr_query('top', p_chain => 'nochain');
  assert (q->>'total')::int = 0 and q->'records' = '[]'::jsonb;
  -- Dead tokens (0.3x or below) leave the boards; a search or an id lookup still finds them.
  q := public.rankr_query('losers', p_hide_dead => true);
  assert (q->>'total')::int = 2 and q->'records'->0->>'id' = 'solana:AAA', 'CHAR at 0.1x is off the board: ' || (q->'records')::text;
  assert (public.rankr_query('top', p_q => 'char', p_hide_dead => false)->>'total')::int = 1;
  assert (public.rankr_query('top', p_ids => array['solana:CCC'])->>'total')::int = 1;
  assert to_regprocedure('public.rankr_query(text,text,timestamptz,text,text[],integer,integer)') is null, 'no 7-argument leftover';

  -- 6. Stats.
  s := public.rankr_stats();
  assert (s->>'total')::int = 3;
  assert (s->>'doubled')::int = 2, 'AAA (2x price) and BRAVO: ' || s::text;
  assert (s->>'in_red')::int = 2, 'AAA now below entry, CHAR';
  assert s->'best'->>'id' = 'base:0xbbb';
  assert s->'chains' = '["base", "solana"]'::jsonb;

  -- 7. Privileges.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    assert not has_function_privilege('anon', 'public.rankr_record_paste(jsonb)', 'execute'), 'anon cannot write';
    assert not has_function_privilege('anon', 'public.rankr_apply_market(jsonb)', 'execute'), 'anon cannot write';
    assert has_function_privilege('service_role', 'public.rankr_record_paste(jsonb)', 'execute');
    assert has_function_privilege('anon', 'public.rankr_query(text,text,timestamptz,text,text[],integer,integer,boolean)', 'execute');
  end if;

  raise notice 'rankr smoke test: tokens ok';
end $$;

-- Accounts and callers (needs all migrations).
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  c uuid := '00000000-0000-4000-8000-00000000000c';
  d uuid := '00000000-0000-4000-8000-00000000000d';
  r jsonb;
  v text;
  failed boolean;
begin
  insert into auth.users (id) values (a), (b);

  -- Usernames: format, reserved words, case-insensitive uniqueness.
  assert public.rankr_set_username(a, 'x') = '{"ok": false, "error": "invalid"}'::jsonb;
  assert public.rankr_set_username(a, 'Admin')->>'error' = 'reserved';
  assert (public.rankr_set_username(a, 'Alpha_Caller')->>'ok')::boolean;
  assert public.rankr_set_username(b, 'alpha_caller')->>'error' = 'taken', 'case-insensitive';
  assert (public.rankr_set_username(a, 'alpha_caller')->>'ok')::boolean, 'own name, new case';
  assert (public.rankr_set_username(b, 'bravo')->>'ok')::boolean;
  assert public.rankr_username_problem('bravo') = 'taken';
  assert public.rankr_username_problem('charlie') is null;
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name in ('wallet', 'chain', 'handle')),
         'no wallet columns';

  -- AAA's price is now 0.000006, BRAVO 11, CHAR 0.2 (from the block above).
  r := public.rankr_record_call(a, 'base:0xbbb', 1, 1000000, now());
  assert (r->>'created')::boolean;
  r := public.rankr_record_call(a, 'base:0xbbb', 5, 5000000, now());
  assert not (r->>'created')::boolean and (r->'call'->>'entry_price_usd')::float8 = 1, 'first call wins';
  perform public.rankr_record_call(a, 'solana:CCC', 0.1, 100, now());      -- 2x
  perform public.rankr_record_call(b, 'solana:CCC', 2, 2000, now());       -- -90%
  perform public.rankr_record_call(b, 'solana:AAA', 0.000012, 12000, now()); -- -50%

  failed := false;
  begin
    update public.calls set entry_price_usd = 0.0001 where user_id = b;
  exception when check_violation then failed := true;
  end;
  assert failed, 'call entries are sealed';

  r := public.rankr_my_calls(a);
  assert jsonb_array_length(r) = 2 and r->0->'token'->>'id' is not null;

  r := public.rankr_callers('avg');
  assert (r->>'total')::int = 2;
  assert r->'callers'->0->>'username' = 'alpha_caller', 'A leads on avg: ' || r::text;
  assert (r->'callers'->0->>'calls')::int = 2 and (r->'callers'->0->>'hits')::int = 2;
  assert r->'callers'->0->'best_token'->>'symbol' = 'BRAVO';
  assert (r->'callers'->0->>'best_multiple')::float8 = 11;
  assert (r->'callers'->1->>'wins')::int = 0;
  r := public.rankr_callers('calls', p_min_calls => 3);
  assert (r->>'total')::int = 0, 'min calls filter';
  r := public.rankr_callers('avg', p_limit => 1, p_offset => 1);
  assert r->'callers'->0->>'username' = 'bravo';

  -- Feed: calls and milestones. CHAR goes 0.2 -> 0.55: A's call (entry 0.1) crosses 2x, 3x and 5x at once,
  -- B's (entry 2) nothing. Only the highest milestone of that jump shows.
  update public.tokens set last_price_usd = 0.55, last_checked_at = now() + interval '1 second' where id = 'solana:CCC';
  assert (select array_agg(tier order by tier) from public.call_milestones where token_id = 'solana:CCC') = array[2, 3, 5],
         'milestones noted once each, for A only';
  update public.tokens set last_price_usd = 0.56, last_checked_at = now() + interval '2 seconds' where id = 'solana:CCC';
  assert (select count(*) from public.call_milestones where token_id = 'solana:CCC') = 3, 'no repeats';

  r := public.rankr_feed();
  assert jsonb_array_length(r) = 5, 'feed: ' || r::text;
  assert r->0->>'kind' = 'milestone' and (r->0->>'tier')::int = 5 and r->0->>'username' = 'alpha_caller', r->0::text;
  assert (r->0->>'caller_calls')::int = 2 and (r->0->>'caller_hits')::int = 2, 'caller numbers: ' || r->0::text;
  assert r->0->'token'->>'symbol' = 'CHAR' and (r->0->>'entry_price_usd')::float8 = 0.1;
  assert jsonb_array_length(public.rankr_feed(p_kind => 'milestone')) = 1;
  assert jsonb_array_length(public.rankr_feed(p_kind => 'call')) = 4;
  assert jsonb_array_length(public.rankr_feed(p_users => array[b])) = 2, 'following filter';
  assert jsonb_array_length(public.rankr_feed(p_chain => 'base')) = 1, 'chain filter';
  assert jsonb_array_length(public.rankr_feed(2)) = 2 and jsonb_array_length(public.rankr_feed(2, 4)) = 1, 'paging';

  -- Calls can't be removed one by one (only the monthly reset clears them); the rest of the test goes on
  -- without this one.
  assert to_regprocedure('public.rankr_delete_call(uuid,text)') is null, 'no removing calls';
  delete from public.calls where user_id = b and token_id = 'solana:AAA';

  -- Default names: a crypto word + hex from sha256(user id). Stable, valid, and unique.
  v := public.rankr_default_username(c);
  assert v ~ '^(nonce|cipher|hash|salt|merkle|ledger|block|shard|vault|epoch|proof|oracle|genesis|keccak|satoshi|entropy)_[0-9a-f]{4}$', v;
  assert public.rankr_username_problem(v) is null and public.rankr_username_problem(public.rankr_default_username(c, 12)) is null;
  insert into auth.users (id) values (c), (d);
  assert (public.rankr_set_username(d, v)->>'ok')::boolean;                -- somebody took c's default name
  assert public.rankr_ensure_profile(c) = public.rankr_default_username(c, 6), 'taken default gets more hex';
  assert public.rankr_ensure_profile(c) = public.rankr_default_username(c, 6), 'idempotent';
  assert public.rankr_ensure_profile(a) = 'alpha_caller', 'existing name kept';

  -- Official accounts: the owner sets the badge (reserved names allowed), the name is then locked,
  -- and look-alikes of the project are reserved for everyone else.
  assert public.rankr_username_problem('Rankr_Team') = 'reserved';
  assert public.rankr_username_problem('the_official') = 'reserved';
  assert public.rankr_username_problem('ranker') is null, 'only the rankr prefix';
  assert public.rankr_set_official('nobody_here')->>'error' = 'not_found';
  assert public.rankr_set_official('bravo', p_rename => 'no spaces')->>'error' = 'invalid';
  r := public.rankr_set_official('BRAVO', p_rename => 'rankr');
  assert (r->>'ok')::boolean and r->>'username' = 'rankr' and (r->>'official')::boolean, r::text;
  assert public.rankr_set_official('alpha_caller', p_rename => 'Rankr')->>'error' = 'taken';
  assert public.rankr_set_username(b, 'bravo_again')->>'error' = 'locked', 'official names only change via rankr_set_official';
  assert public.rankr_ensure_profile(b) = 'rankr';
  r := public.rankr_callers('calls');
  assert (select bool_and((x->>'official')::boolean = (x->>'username' = 'rankr')) from jsonb_array_elements(r->'callers') x),
         'official flag on the board: ' || r::text;
  assert not (public.rankr_set_official('rankr', p_official => false)->>'official')::boolean;
  assert (public.rankr_set_username(b, 'bravo')->>'ok')::boolean, 'unlocked again';

  -- Profiles: bio, X, Telegram and website. A new X account starts unverified; one Rankr account per verified X account.
  r := public.rankr_set_profile(a, '  Early on cats.  ', 'Alpha_X', 'alpha_tg', 'https://alpha.example');
  assert r = '{"ok": true, "bio": "Early on cats.", "x": "Alpha_X", "x_verified": false, "telegram": "alpha_tg",
               "website": "https://alpha.example"}'::jsonb, r::text;
  assert public.rankr_set_profile(a, null, null, null, 'javascript:alert(1)')->>'error' = 'invalid', 'only http(s) links';
  assert public.rankr_set_profile(a, null, null, null, 'https://' || repeat('w', 200))->>'error' = 'invalid', 'website too long';
  assert public.rankr_set_profile(a, repeat('b', 161), null, null)->>'error' = 'invalid', 'bio too long';
  assert public.rankr_set_profile(a, null, 'no spaces', null)->>'error' = 'invalid';
  assert public.rankr_set_profile(a, null, null, '1abcd')->>'error' = 'invalid', 'telegram starts with a letter';
  assert public.rankr_set_profile('00000000-0000-4000-8000-0000000000ff', null, null, null)->>'error' = 'not_found';
  assert (select bio = 'Early on cats.' and website = 'https://alpha.example' from public.profiles where user_id = a),
         'a failed save changes nothing';
  assert public.rankr_verify_x(a, 'someone_else')->>'error' = 'changed';
  assert (public.rankr_verify_x(a, 'alpha_x')->>'ok')::boolean;
  r := public.rankr_set_profile(a, 'Early on cats.', 'ALPHA_X', '', '');
  assert (r->>'x_verified')::boolean and r->>'x' = 'ALPHA_X' and r->'telegram' = 'null'::jsonb and r->'website' = 'null'::jsonb,
         'same X in another case stays verified: ' || r::text;
  assert (public.rankr_set_profile(b, '', 'alpha_x', null)->>'ok')::boolean, 'anyone can type it in, unverified';
  assert (public.rankr_verify_x(b, 'Alpha_X')->>'ok')::boolean;
  assert (select x_verified_at is null from public.profiles where user_id = a), 'the newest verification wins';
  assert (select x_verified_at is not null and bio is null from public.profiles where user_id = b);
  assert not (public.rankr_set_profile(b, null, 'bravo_x', null)->>'x_verified')::boolean, 'another X account starts over';
  assert public.rankr_ensure_profile(a) = 'alpha_caller';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    assert not has_function_privilege('anon', 'public.rankr_set_profile(uuid,text,text,text,text)', 'execute');
    assert to_regprocedure('public.rankr_set_profile(uuid,text,text,text)') is null, 'no 4-argument leftover';
    assert not has_function_privilege('authenticated', 'public.rankr_verify_x(uuid,text)', 'execute');
    assert has_function_privilege('service_role', 'public.rankr_verify_x(uuid,text)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_record_call(uuid,text,double precision,double precision,timestamptz)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_my_calls(uuid)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_feed(integer,integer,uuid[],text,text)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_set_username(uuid,text)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_ensure_profile(uuid)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_set_official(text,text,boolean)', 'execute');
    assert not has_function_privilege('authenticated', 'public.rankr_set_official(text,text,boolean)', 'execute');
    assert has_function_privilege('service_role', 'public.rankr_set_official(text,text,boolean)', 'execute');
    assert has_function_privilege('anon', 'public.rankr_callers(text,integer,integer,integer)', 'execute');
  end if;

  raise notice 'rankr smoke test: accounts ok';
end $$;

-- Paste limits and the hit-rate caller board (needs all migrations).
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  s uuid := '00000000-0000-4000-8000-00000000000e';
  r jsonb;
begin
  -- Fixed window: up to p_max hits pass, the next one doesn't, a new window starts over.
  r := public.rankr_rate_hit('test:bucket', 60, 2);
  assert (r->>'ok')::boolean and (r->>'hits')::int = 1, r::text;
  r := public.rankr_rate_hit('test:bucket', 60, 2);
  assert (r->>'ok')::boolean and (r->>'hits')::int = 2;
  r := public.rankr_rate_hit('test:bucket', 60, 2);
  assert not (r->>'ok')::boolean and (r->>'hits')::int = 3, 'over the limit';
  assert (r->>'reset_at')::timestamptz > now(), 'reset is ahead';
  assert (public.rankr_rate_hit('test:other', 60, 2)->>'ok')::boolean, 'buckets are separate';
  update public.rate_limits set window_start = window_start - interval '61 seconds' where bucket = 'test:bucket';
  r := public.rankr_rate_hit('test:bucket', 60, 2);
  assert (r->>'ok')::boolean and (r->>'hits')::int = 1, 'new window: ' || r::text;

  -- A sprayer: 10 calls, 3 at 2x+. alpha_caller: 2 calls, both at 2x+ (from the blocks above).
  insert into auth.users (id) values (s);
  assert (public.rankr_set_username(s, 'sprayer')->>'ok')::boolean;
  for i in 1..10 loop
    perform public.rankr_record_paste(jsonb_build_object(
      'id', 'solana:S' || i, 'chain_id', 'solana', 'address', 'S' || i, 'name', 'Spray ' || i, 'symbol', 'S' || i,
      'entry_price_usd', 1, 'entry_market_cap', 1000, 'first_pasted_at', now(), 'last_pasted_at', now(),
      'peak_price_usd', 1, 'peak_at', now(), 'low_price_usd', 1, 'low_at', now(),
      'last_price_usd', case when i <= 3 then 3 else 0.5 end, 'market', '{}', 'last_checked_at', now()));
    perform public.rankr_record_call(s, 'solana:S' || i, 1, 1000, now());
  end loop;

  r := public.rankr_callers('hits');
  assert r->'callers'->0->>'username' = 'sprayer', 'by count, volume wins: ' || r::text;
  r := public.rankr_callers('rate');
  assert r->'callers'->0->>'username' = 'alpha_caller', 'by rate, judgment wins: ' || r::text;
  r := public.rankr_callers('rate', p_min_calls => 5);
  assert (r->>'total')::int = 1 and r->'callers'->0->>'username' = 'sprayer', 'min calls keeps flukes off';
  assert (public.rankr_callers()->'callers'->0->>'username') = 'alpha_caller', 'rate is the default';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    assert not has_function_privilege('anon', 'public.rankr_rate_hit(text,integer,integer)', 'execute');
    assert not has_function_privilege('authenticated', 'public.rankr_rate_hit(text,integer,integer)', 'execute');
    assert has_function_privilege('service_role', 'public.rankr_rate_hit(text,integer,integer)', 'execute');
  end if;

  raise notice 'rankr smoke test: limits ok';
end $$;

-- Monthly reset (needs all migrations): the top 10s are kept, every token, call and milestone goes,
-- accounts stay.
do $$
declare
  r jsonb;
  s record;
  v_profiles int := (select count(*) from public.profiles);
begin
  assert (select count(*) from public.calls) > 0 and (select count(*) from public.call_milestones) > 0, 'something to reset';
  r := public.rankr_end_month('2026-10-01 00:05+00');
  assert (r->>'ok')::boolean and r->>'month' = '2026-09-01', 'the month that just ended: ' || r::text;
  assert (r->>'tokens')::int > 0 and (r->>'calls')::int > 0 and (r->>'callers')::int > 0, r::text;

  select * into s from public.seasons order by ended_at desc limit 1;
  assert s.month = '2026-09-01' and s.ended_at = '2026-10-01 00:05+00';
  assert s.callers->0->>'username' = 'sprayer', 'hit rate board, 5+ calls: ' || s.callers::text;
  assert jsonb_array_length(s.tokens) = least(10, (r->>'tokens')::int), 'top 10 tokens';
  assert (s.tokens->0->>'peak_multiple')::float8 >= (s.tokens->1->>'peak_multiple')::float8, 'by peak x';
  assert (select bool_and(t ? 'first_caller') from jsonb_array_elements(s.tokens) t);

  assert (select count(*) from public.tokens) = 0 and (select count(*) from public.calls) = 0, 'everything goes';
  assert (select count(*) from public.call_milestones) = 0;
  assert (select count(*) from public.profiles) = v_profiles, 'accounts stay';
  assert (public.rankr_callers()->>'total')::int = 0, 'the caller board starts from zero';

  r := public.rankr_end_month('2026-10-01 00:06+00');
  assert (r->>'skipped')::boolean and (select count(*) from public.seasons) = 1, 'nothing to keep, nothing written';
  assert date_trunc('month', timestamptz '2026-09-15 12:00+00' - interval '12 hours')::date = '2026-09-01', 'by hand mid-month: this month';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    assert not has_function_privilege('anon', 'public.rankr_end_month(timestamptz)', 'execute');
    assert not has_function_privilege('authenticated', 'public.rankr_end_month(timestamptz)', 'execute');
    assert has_function_privilege('service_role', 'public.rankr_end_month(timestamptz)', 'execute');
  end if;

  raise notice 'rankr smoke test: monthly reset ok';
end $$;

rollback;
