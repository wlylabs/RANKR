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
    assert has_function_privilege('anon', 'public.rankr_query(text,text,timestamptz,text,text[],integer,integer)', 'execute');
  end if;

  raise notice 'rankr smoke test: tokens ok';
end $$;

-- Accounts and callers (needs all migrations).
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  r jsonb;
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

  assert public.rankr_delete_call(b, 'solana:AAA');
  assert not public.rankr_delete_call(b, 'solana:AAA');

  if exists (select 1 from pg_roles where rolname = 'anon') then
    assert not has_function_privilege('anon', 'public.rankr_record_call(uuid,text,double precision,double precision,timestamptz)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_my_calls(uuid)', 'execute');
    assert not has_function_privilege('anon', 'public.rankr_set_username(uuid,text)', 'execute');
    assert has_function_privilege('anon', 'public.rankr_callers(text,integer,integer,integer)', 'execute');
  end if;

  raise notice 'rankr smoke test: accounts ok';
end $$;

rollback;
