-- Rankr: complete database setup. Paste this whole file into the Supabase SQL editor and run it.
-- Safe to run again. Generated from supabase/migrations by `npm run db:bundle`; edit those, not this.

-- Older migrations define functions over columns that later ones drop; like pg_dump, skip body checks
-- while (re)creating them. The final functions are defined by the last migrations anyway.
set check_function_bodies = off;

-- ===== 20260927000000_rankr_tokens.sql =====

-- Rankr schema: one row per token, entry sealed at the first paste.
--
-- The web app talks to this through the RPC functions below using the secret (service role) key,
-- from the server only. Browsers never write; public reads are allowed by RLS.

create table if not exists public.tokens (
  id               text primary key,                 -- "<chain>:<address>", EVM addresses lowercased
  chain_id         text not null,
  address          text not null,
  name             text not null,
  symbol           text not null,
  image_url        text,

  -- Sealed entry: set once by the first paste, never updated (see rankr_lock_entry).
  entry_price_usd  double precision not null check (entry_price_usd > 0),
  entry_market_cap double precision,
  first_pasted_at  timestamptz not null,

  last_pasted_at   timestamptz not null,
  paste_count      integer not null default 1 check (paste_count > 0),

  peak_price_usd   double precision not null,
  peak_at          timestamptz not null,
  low_price_usd    double precision not null,
  low_at           timestamptz not null,

  last_price_usd   double precision not null check (last_price_usd > 0),
  market           jsonb,                            -- latest DexScreener snapshot
  last_checked_at  timestamptz not null,

  -- Price now / entry price: 2 = 2x (doubled), 0.5 = -50%.
  multiple         double precision generated always as (last_price_usd / entry_price_usd) stored,
  peak_multiple    double precision generated always as (peak_price_usd / entry_price_usd) stored
);

create index if not exists tokens_multiple_idx        on public.tokens (multiple desc);
create index if not exists tokens_peak_multiple_idx   on public.tokens (peak_multiple desc);
create index if not exists tokens_first_pasted_at_idx on public.tokens (first_pasted_at desc);
create index if not exists tokens_paste_count_idx     on public.tokens (paste_count desc, last_pasted_at desc);
create index if not exists tokens_last_checked_at_idx on public.tokens (last_checked_at);
create index if not exists tokens_chain_idx           on public.tokens (chain_id);

-- "No backdating", enforced by the database: the entry of a token can never change.
create or replace function public.rankr_lock_entry() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.chain_id is distinct from old.chain_id
     or new.address is distinct from old.address
     or new.entry_price_usd is distinct from old.entry_price_usd
     or new.entry_market_cap is distinct from old.entry_market_cap
     or new.first_pasted_at is distinct from old.first_pasted_at then
    raise exception 'rankr: the entry of % is sealed and cannot change', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists tokens_lock_entry on public.tokens;
create trigger tokens_lock_entry
  before update on public.tokens
  for each row execute function public.rankr_lock_entry();

-- Public read, no public write.
alter table public.tokens enable row level security;
drop policy if exists "tokens are public" on public.tokens;
create policy "tokens are public" on public.tokens for select to anon, authenticated using (true);

-- A paste: insert the token with its entry, or, if it is already tracked, bump the paste
-- counter and fold in the fresh market data. Atomic, so simultaneous pastes can't lose counts.
-- `p` is a tokens row as JSON (snake_case). Returns {created, record}.
create or replace function public.rankr_record_paste(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_created boolean;
  v_row jsonb;
begin
  insert into public.tokens as t (
    id, chain_id, address, name, symbol, image_url,
    entry_price_usd, entry_market_cap, first_pasted_at, last_pasted_at, paste_count,
    peak_price_usd, peak_at, low_price_usd, low_at,
    last_price_usd, market, last_checked_at
  )
  select
    r.id, r.chain_id, r.address, r.name, r.symbol, r.image_url,
    r.entry_price_usd, r.entry_market_cap, r.first_pasted_at, r.last_pasted_at, 1,
    r.peak_price_usd, r.peak_at, r.low_price_usd, r.low_at,
    r.last_price_usd, r.market, r.last_checked_at
  from jsonb_populate_record(null::public.tokens, p) as r
  on conflict (id) do update set
    paste_count     = t.paste_count + 1,
    last_pasted_at  = excluded.last_pasted_at,
    name            = coalesce(nullif(excluded.name, ''), t.name),
    symbol          = coalesce(nullif(excluded.symbol, ''), t.symbol),
    image_url       = coalesce(excluded.image_url, t.image_url),
    market          = excluded.market,
    last_price_usd  = excluded.last_price_usd,
    last_checked_at = excluded.last_checked_at,
    peak_at         = case when excluded.last_price_usd > t.peak_price_usd then excluded.last_checked_at else t.peak_at end,
    peak_price_usd  = greatest(t.peak_price_usd, excluded.last_price_usd),
    low_at          = case when excluded.last_price_usd < t.low_price_usd then excluded.last_checked_at else t.low_at end,
    low_price_usd   = least(t.low_price_usd, excluded.last_price_usd)
  returning (t.xmax = 0), to_jsonb(t) into v_created, v_row;

  return jsonb_build_object('created', v_created, 'record', v_row);
end $$;

-- Market refresh for many tokens. Only touches market fields; peak/low only move outward.
-- `updates` is [{id, name, symbol, image_url, market, last_price_usd, checked_at}]. Returns rows updated.
create or replace function public.rankr_apply_market(updates jsonb) returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  update public.tokens t set
    name            = coalesce(nullif(u.name, ''), t.name),
    symbol          = coalesce(nullif(u.symbol, ''), t.symbol),
    image_url       = coalesce(u.image_url, t.image_url),
    market          = u.market,
    last_price_usd  = u.last_price_usd,
    last_checked_at = u.checked_at,
    peak_at         = case when u.last_price_usd > t.peak_price_usd then u.checked_at else t.peak_at end,
    peak_price_usd  = greatest(t.peak_price_usd, u.last_price_usd),
    low_at          = case when u.last_price_usd < t.low_price_usd then u.checked_at else t.low_at end,
    low_price_usd   = least(t.low_price_usd, u.last_price_usd)
  from jsonb_to_recordset(updates) as u(
    id text, name text, symbol text, image_url text, market jsonb, last_price_usd double precision, checked_at timestamptz
  )
  where t.id = u.id and u.last_price_usd > 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Leaderboard page. sort: top | peak | losers | new | hot. Returns {total, records}.
create or replace function public.rankr_query(
  p_sort   text default 'top',
  p_chain  text default null,
  p_since  timestamptz default null,
  p_q      text default null,
  p_ids    text[] default null,
  p_limit  integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with f as (
    select t.* from public.tokens t
    where (p_chain is null or t.chain_id = p_chain)
      and (p_since is null or t.first_pasted_at >= p_since)
      and (p_ids is null or t.id = any (p_ids))
      and (
        p_q is null
        or t.symbol ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or t.name   ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or lower(t.address) = lower(p_q)
      )
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'top'    then f.multiple end desc nulls last,
        case when p_sort = 'peak'   then f.peak_multiple end desc nulls last,
        case when p_sort = 'losers' then f.multiple end asc nulls last,
        case when p_sort = 'hot'    then f.paste_count end desc nulls last,
        case when p_sort = 'hot'    then f.last_pasted_at end desc nulls last,
        f.first_pasted_at desc,
        f.id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'records', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

-- Numbers for the home page.
create or replace function public.rankr_stats() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total',   (select count(*) from public.tokens),
    'doubled', (select count(*) from public.tokens where peak_multiple >= 2),
    'in_red',  (select count(*) from public.tokens where multiple < 1),
    'best',    (select to_jsonb(t) from public.tokens t order by peak_multiple desc nulls last limit 1),
    'chains',  coalesce((select jsonb_agg(c order by c) from (select distinct chain_id as c from public.tokens) s), '[]'::jsonb)
  );
$$;

-- Writes are server-only (secret key). Reads may be called by anyone.
revoke all on function public.rankr_record_paste(jsonb) from public;
revoke all on function public.rankr_apply_market(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_record_paste(jsonb) from anon, authenticated;
    revoke all on function public.rankr_apply_market(jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_record_paste(jsonb) to service_role;
    grant execute on function public.rankr_apply_market(jsonb) to service_role;
  end if;
end $$;

-- ===== 20260927010000_rankr_callers.sql =====

-- Wallet accounts and per-user calls (Supabase Auth, "Sign in with Web3").
--
-- A call is a user's own entry on a token: the price at the moment *they* pasted it while signed
-- in. Calls are written by the server only, from server-side market data, so nobody can
-- backdate or invent an entry. They are what the caller leaderboard ranks.

-- This builds on public.tokens: fail with a clear message if the first migration hasn't run.
do $$
begin
  if to_regclass('public.tokens') is null then
    raise exception 'rankr: run 20260927000000_rankr_tokens.sql first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  chain      text not null,            -- 'solana' | 'ethereum'
  wallet     text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  user_id          uuid not null references public.profiles (user_id) on delete cascade,
  token_id         text not null references public.tokens (id) on delete cascade,
  entry_price_usd  double precision not null check (entry_price_usd > 0),
  entry_market_cap double precision,
  called_at        timestamptz not null,
  primary key (user_id, token_id)
);

create index if not exists calls_token_idx on public.calls (token_id);
create index if not exists calls_user_called_at_idx on public.calls (user_id, called_at desc);

-- A call's entry is sealed like a token's: it can be deleted by its owner, never edited.
create or replace function public.rankr_lock_call() returns trigger
language plpgsql as $$
begin
  raise exception 'rankr: the call on % is sealed and cannot change', old.token_id
    using errcode = 'check_violation';
end $$;

drop trigger if exists calls_lock on public.calls;
create trigger calls_lock before update on public.calls
  for each row execute function public.rankr_lock_call();

alter table public.profiles enable row level security;
alter table public.calls enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "calls are public" on public.calls;
create policy "calls are public" on public.calls for select to anon, authenticated using (true);

-- Creates or refreshes the profile of a signed-in wallet.
create or replace function public.rankr_upsert_profile(p_user uuid, p_chain text, p_wallet text) returns void
language sql as $$
  insert into public.profiles (user_id, chain, wallet) values (p_user, p_chain, p_wallet)
  on conflict (user_id) do update set chain = excluded.chain, wallet = excluded.wallet;
$$;

-- Records a user's call. The first call on a token wins; later pastes keep it.
-- Returns {created, call}.
create or replace function public.rankr_record_call(
  p_user uuid, p_token text, p_entry_price double precision, p_entry_market_cap double precision, p_at timestamptz
) returns jsonb
language plpgsql as $$
declare
  v_created boolean := false;
  v_call jsonb;
begin
  insert into public.calls (user_id, token_id, entry_price_usd, entry_market_cap, called_at)
  values (p_user, p_token, p_entry_price, p_entry_market_cap, p_at)
  on conflict (user_id, token_id) do nothing;
  v_created := found;
  select to_jsonb(c) into v_call from public.calls c where c.user_id = p_user and c.token_id = p_token;
  return jsonb_build_object('created', v_created, 'call', v_call);
end $$;

-- A user's calls with their tokens, newest first.
create or replace function public.rankr_my_calls(p_user uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('token', to_jsonb(t)) order by c.called_at desc), '[]'::jsonb)
  from public.calls c join public.tokens t on t.id = c.token_id
  where c.user_id = p_user;
$$;

create or replace function public.rankr_delete_call(p_user uuid, p_token text) returns boolean
language plpgsql as $$
begin
  delete from public.calls where user_id = p_user and token_id = p_token;
  return found;
end $$;

-- Caller leaderboard. A call's multiple = token price now / the caller's entry.
-- sort: avg | hits | best | calls. Returns {total, callers}.
create or replace function public.rankr_callers(
  p_sort text default 'avg',
  p_min_calls integer default 1,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with per_call as (
    select c.user_id, t.id as token_id, t.address, t.symbol, t.name, t.chain_id,
           t.last_price_usd / c.entry_price_usd as m
    from public.calls c join public.tokens t on t.id = c.token_id
  ),
  agg as (
    select user_id,
           count(*)::int                             as calls,
           count(*) filter (where m >= 2)::int      as hits,
           count(*) filter (where m > 1.005)::int   as wins,
           avg(m)                                    as avg_multiple,
           max(m)                                    as best_multiple,
           (array_agg(jsonb_build_object('id', token_id, 'address', address, 'symbol', symbol, 'name', name, 'chain_id', chain_id)
                      order by m desc))[1]          as best_token
    from per_call group by user_id
  ),
  f as (
    select a.*, p.chain, p.wallet
    from agg a join public.profiles p using (user_id)
    where a.calls >= greatest(p_min_calls, 1)
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'avg'   then f.avg_multiple end desc nulls last,
        case when p_sort = 'hits'  then f.hits end desc nulls last,
        case when p_sort = 'best'  then f.best_multiple end desc nulls last,
        case when p_sort = 'calls' then f.calls end desc nulls last,
        f.avg_multiple desc,
        f.user_id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'callers', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

-- Writes are server-only.
revoke all on function public.rankr_upsert_profile(uuid, text, text) from public;
revoke all on function public.rankr_record_call(uuid, text, double precision, double precision, timestamptz) from public;
revoke all on function public.rankr_delete_call(uuid, text) from public;
revoke all on function public.rankr_my_calls(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_upsert_profile(uuid, text, text) from anon, authenticated;
    revoke all on function public.rankr_record_call(uuid, text, double precision, double precision, timestamptz) from anon, authenticated;
    revoke all on function public.rankr_delete_call(uuid, text) from anon, authenticated;
    revoke all on function public.rankr_my_calls(uuid) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_upsert_profile(uuid, text, text) to service_role;
    grant execute on function public.rankr_record_call(uuid, text, double precision, double precision, timestamptz) to service_role;
    grant execute on function public.rankr_delete_call(uuid, text) to service_role;
    grant execute on function public.rankr_my_calls(uuid) to service_role;
  end if;
end $$;

-- ===== 20260927030000_rankr_accounts.sql =====

-- Accounts: sign in with an email magic link (Supabase Auth), then pick a username.
-- A profile is just the public username; no wallet, and the email is never exposed.
-- Pasting requires a profile, so every call belongs to a named account.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

-- Drop the wallet columns (and the short-lived anonymous handle, if it was ever applied).
alter table public.profiles drop column if exists chain;
alter table public.profiles drop column if exists wallet;
alter table public.profiles add column if not exists username text;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'handle') then
    update public.profiles set username = replace(handle, '-', '_') where username is null;
    alter table public.profiles drop column handle;
  end if;
end $$;
update public.profiles
   set username = 'user_' || left(encode(sha256(convert_to(user_id::text, 'UTF8')), 'hex'), 8)
 where username is null;
alter table public.profiles alter column username set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$');
  end if;
end $$;
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

drop function if exists public.rankr_handle(uuid);
drop function if exists public.rankr_upsert_profile(uuid);
drop function if exists public.rankr_upsert_profile(uuid, text, text);

-- Same rules as src/lib/username.ts.
create or replace function public.rankr_username_problem(p_username text, p_user uuid default null) returns text
language sql stable as $$
  select case
    when p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then 'invalid'
    when lower(p_username) in ('admin', 'rankr', 'support', 'root', 'system', 'null', 'undefined', 'anon', 'me') then 'reserved'
    when exists (select 1 from public.profiles
                 where lower(username) = lower(p_username) and user_id is distinct from p_user) then 'taken'
  end;
$$;

-- Sets or changes a user's username. Returns {ok, username} or {ok: false, error: invalid | reserved | taken}.
create or replace function public.rankr_set_username(p_user uuid, p_username text) returns jsonb
language plpgsql as $$
declare
  v_problem text := public.rankr_username_problem(p_username, p_user);
begin
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  insert into public.profiles (user_id, username) values (p_user, p_username)
  on conflict (user_id) do update set username = excluded.username;
  return jsonb_build_object('ok', true, 'username', p_username);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- Caller leaderboard, by username. sort: avg | hits | best | calls. Returns {total, callers}.
create or replace function public.rankr_callers(
  p_sort text default 'hits',
  p_min_calls integer default 1,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with per_call as (
    select c.user_id, t.id as token_id, t.address, t.symbol, t.name, t.chain_id,
           t.last_price_usd / c.entry_price_usd as m
    from public.calls c join public.tokens t on t.id = c.token_id
  ),
  agg as (
    select user_id,
           count(*)::int                             as calls,
           count(*) filter (where m >= 2)::int      as hits,
           count(*) filter (where m > 1.005)::int   as wins,
           avg(m)                                    as avg_multiple,
           max(m)                                    as best_multiple,
           (array_agg(jsonb_build_object('id', token_id, 'address', address, 'symbol', symbol, 'name', name, 'chain_id', chain_id)
                      order by m desc))[1]          as best_token
    from per_call group by user_id
  ),
  f as (
    select a.*, p.username
    from agg a join public.profiles p using (user_id)
    where a.calls >= greatest(p_min_calls, 1)
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'avg'   then f.avg_multiple end desc nulls last,
        case when p_sort = 'hits'  then f.hits end desc nulls last,
        case when p_sort = 'best'  then f.best_multiple end desc nulls last,
        case when p_sort = 'calls' then f.calls end desc nulls last,
        f.avg_multiple desc,
        f.user_id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'callers', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

revoke all on function public.rankr_set_username(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_set_username(uuid, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_set_username(uuid, text) to service_role;
  end if;
end $$;

-- ===== 20260927040000_rankr_default_names.sql =====

-- Default names. Every new account (a one-click guest or an email sign-in) starts with a name derived from
-- sha256(user id), in the style of the logo: a crypto word + hex from the same digest, e.g. nonce_7f3a.
-- It can be changed any time with rankr_set_username.

do $$
begin
  if to_regprocedure('public.rankr_set_username(uuid, text)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

-- The first hex digit picks the word, the next `p_hex` digits follow it.
create or replace function public.rankr_default_username(p_user uuid, p_hex integer default 4) returns text
language sql immutable as $$
  select (array['nonce', 'cipher', 'hash', 'salt', 'merkle', 'ledger', 'block', 'shard',
                'vault', 'epoch', 'proof', 'oracle', 'genesis', 'keccak', 'satoshi', 'entropy'])
           [1 + ('x' || left(h, 1))::bit(4)::int]
         || '_' || substr(h, 2, least(greatest(p_hex, 4), 12))
  from (select encode(sha256(convert_to(p_user::text, 'UTF8')), 'hex') as h) d;
$$;

-- The user's username, creating the profile with the default name on first sight. If someone already
-- took that name, more hex digits are used.
create or replace function public.rankr_ensure_profile(p_user uuid) returns text
language plpgsql as $$
declare
  v_name text;
  v_hex integer;
begin
  select username into v_name from public.profiles where user_id = p_user;
  if v_name is not null then
    return v_name;
  end if;
  foreach v_hex in array array[4, 6, 8, 12] loop
    begin
      insert into public.profiles (user_id, username)
      values (p_user, public.rankr_default_username(p_user, v_hex))
      returning username into v_name;
      return v_name;
    exception when unique_violation then
      -- Either the name is taken or a parallel request just created this user's profile.
      select username into v_name from public.profiles where user_id = p_user;
      if v_name is not null then
        return v_name;
      end if;
    end;
  end loop;
  raise exception 'rankr: no free default name for %', p_user;
end $$;

revoke all on function public.rankr_ensure_profile(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_ensure_profile(uuid) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_ensure_profile(uuid) to service_role;
  end if;
end $$;

-- ===== 20260927050000_rankr_official.sql =====

-- Official accounts: a check badge next to the name, on the caller board and in the app (e.g. @rankr).
-- Only the project owner sets it, from the SQL editor (or with the secret key), never the account itself:
--   select rankr_set_official('nonce_7f3a');                        -- badge on
--   select rankr_set_official('nonce_7f3a', p_rename => 'rankr');   -- badge on, with a reserved name
--   select rankr_set_official('rankr', p_official => false);        -- badge off
-- An official account's name is locked: only rankr_set_official changes it. Names that start with "rankr"
-- or contain "official" are reserved, so nobody else can pass for the project.

do $$
begin
  if to_regprocedure('public.rankr_ensure_profile(uuid)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

alter table public.profiles add column if not exists official boolean not null default false;

-- Same rules as src/lib/username.ts.
create or replace function public.rankr_username_problem(p_username text, p_user uuid default null) returns text
language sql stable as $$
  select case
    when p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then 'invalid'
    when lower(p_username) in ('admin', 'rankr', 'support', 'root', 'system', 'null', 'undefined', 'anon', 'me')
      or starts_with(lower(p_username), 'rankr')
      or strpos(lower(p_username), 'official') > 0 then 'reserved'
    when exists (select 1 from public.profiles
                 where lower(username) = lower(p_username) and user_id is distinct from p_user) then 'taken'
  end;
$$;

-- Sets or changes a user's username. Returns {ok, username} or {ok: false, error: invalid | reserved | taken | locked}.
create or replace function public.rankr_set_username(p_user uuid, p_username text) returns jsonb
language plpgsql as $$
declare
  v_problem text := public.rankr_username_problem(p_username, p_user);
begin
  if exists (select 1 from public.profiles where user_id = p_user and official) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  insert into public.profiles (user_id, username) values (p_user, p_username)
  on conflict (user_id) do update set username = excluded.username;
  return jsonb_build_object('ok', true, 'username', p_username);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- Turns the badge on or off for the account named p_username (any case), optionally renaming it; the new
-- name may be a reserved one. Returns {ok, username, official} or {ok: false, error: not_found | invalid | taken}.
create or replace function public.rankr_set_official(
  p_username text, p_rename text default null, p_official boolean default true
) returns jsonb
language plpgsql as $$
declare
  v_user uuid;
  v_name text;
  v_official boolean := coalesce(p_official, false);
begin
  select user_id, username into v_user, v_name from public.profiles where lower(username) = lower(p_username);
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_rename is not null then
    if p_rename !~ '^[A-Za-z0-9_]{3,20}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_name := p_rename;
  end if;
  update public.profiles set username = v_name, official = v_official where user_id = v_user;
  return jsonb_build_object('ok', true, 'username', v_name, 'official', v_official);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- Caller leaderboard, by username, now with the official flag. sort: avg | hits | best | calls. Returns {total, callers}.
create or replace function public.rankr_callers(
  p_sort text default 'hits',
  p_min_calls integer default 1,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with per_call as (
    select c.user_id, t.id as token_id, t.address, t.symbol, t.name, t.chain_id,
           t.last_price_usd / c.entry_price_usd as m
    from public.calls c join public.tokens t on t.id = c.token_id
  ),
  agg as (
    select user_id,
           count(*)::int                             as calls,
           count(*) filter (where m >= 2)::int      as hits,
           count(*) filter (where m > 1.005)::int   as wins,
           avg(m)                                    as avg_multiple,
           max(m)                                    as best_multiple,
           (array_agg(jsonb_build_object('id', token_id, 'address', address, 'symbol', symbol, 'name', name, 'chain_id', chain_id)
                      order by m desc))[1]          as best_token
    from per_call group by user_id
  ),
  f as (
    select a.*, p.username, p.official
    from agg a join public.profiles p using (user_id)
    where a.calls >= greatest(p_min_calls, 1)
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'avg'   then f.avg_multiple end desc nulls last,
        case when p_sort = 'hits'  then f.hits end desc nulls last,
        case when p_sort = 'best'  then f.best_multiple end desc nulls last,
        case when p_sort = 'calls' then f.calls end desc nulls last,
        f.avg_multiple desc,
        f.user_id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'callers', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

revoke all on function public.rankr_set_official(text, text, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_set_official(text, text, boolean) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_set_official(text, text, boolean) to service_role;
  end if;
end $$;

-- ===== 20260927060000_rankr_limits.sql =====

-- Abuse limits and a caller board that rewards judgment, not volume.
--
-- 1. Paste limits: fixed-window counters kept in Postgres, so every server instance sees the same count
--    (an in-memory limit resets on each cold start and differs per instance). The app checks a per-IP
--    burst limit and a per-account daily limit before each paste (src/lib/rate-limit.ts).
-- 2. Caller board: a "rate" sort, the share of a caller's calls at 2x or more (with a minimum number of
--    calls), so pasting every new token no longer wins by sheer count.

do $$
begin
  if to_regprocedure('public.rankr_ensure_profile(uuid)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create table if not exists public.rate_limits (
  bucket       text primary key,          -- e.g. 'paste:ip:203.0.113.7', 'paste:user:<uuid>:day'
  window_start timestamptz not null,
  hits         integer not null
);

-- No policies: browsers can't read or write it; only the server (secret key) uses it, through the function.
alter table public.rate_limits enable row level security;

-- Counts one hit on `p_bucket` and returns {ok, hits, reset_at}; ok is false once the window holds more
-- than `p_max` hits. A single upsert, so parallel requests can't slip past the limit.
create or replace function public.rankr_rate_hit(p_bucket text, p_window_seconds integer, p_max integer) returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  r public.rate_limits;
begin
  insert into public.rate_limits as l (bucket, window_start, hits) values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    window_start = case when l.window_start <= v_now - v_window then v_now else l.window_start end,
    hits         = case when l.window_start <= v_now - v_window then 1 else l.hits + 1 end
  returning * into r;

  -- Now and then, drop counters whose window ended long ago (windows are a day at most).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '2 days';
  end if;

  return jsonb_build_object('ok', r.hits <= p_max, 'hits', r.hits, 'reset_at', r.window_start + v_window);
end $$;

revoke all on function public.rankr_rate_hit(text, integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_rate_hit(text, integer, integer) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_rate_hit(text, integer, integer) to service_role;
  end if;
end $$;

-- Caller board, as before plus p_sort = 'rate': the share of calls at 2x+ right now, then the number of
-- 2x calls, then average x. With p_min_calls (the app passes 5 for rate and avg), one lucky call can't top it.
create or replace function public.rankr_callers(
  p_sort text default 'rate',
  p_min_calls integer default 1,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with per_call as (
    select c.user_id, t.id as token_id, t.address, t.symbol, t.name, t.chain_id,
           t.last_price_usd / c.entry_price_usd as m
    from public.calls c join public.tokens t on t.id = c.token_id
  ),
  agg as (
    select user_id,
           count(*)::int                             as calls,
           count(*) filter (where m >= 2)::int      as hits,
           count(*) filter (where m > 1.005)::int   as wins,
           avg(m)                                    as avg_multiple,
           max(m)                                    as best_multiple,
           (array_agg(jsonb_build_object('id', token_id, 'address', address, 'symbol', symbol, 'name', name, 'chain_id', chain_id)
                      order by m desc))[1]          as best_token
    from per_call group by user_id
  ),
  f as (
    select a.*, p.username, p.official
    from agg a join public.profiles p using (user_id)
    where a.calls >= greatest(p_min_calls, 1)
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'rate'  then f.hits::float8 / f.calls end desc nulls last,
        case when p_sort = 'rate'  then f.hits end desc nulls last,
        case when p_sort = 'avg'   then f.avg_multiple end desc nulls last,
        case when p_sort = 'hits'  then f.hits end desc nulls last,
        case when p_sort = 'best'  then f.best_multiple end desc nulls last,
        case when p_sort = 'calls' then f.calls end desc nulls last,
        f.avg_multiple desc,
        f.user_id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'callers', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

-- ===== 20260927070000_rankr_feed.sql =====

-- Live call feed: the newest calls across every caller ("@userx called $SHIB at $1.2B mc"), shown as a
-- ticker under the app header. Read by the server only, like the rest.

do $$
begin
  if to_regprocedure('public.rankr_ensure_profile(uuid)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create index if not exists calls_called_at_idx on public.calls (called_at desc);

-- The newest `p_limit` calls (at most 50), each with its caller's name and its token.
create or replace function public.rankr_recent_calls(p_limit integer default 20) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(
           to_jsonb(r.c) || jsonb_build_object('username', r.username, 'official', r.official, 'token', to_jsonb(r.t))
           order by (r.c).called_at desc),
         '[]'::jsonb)
  from (
    select c, t, p.username, p.official
    from public.calls c
    join public.profiles p on p.user_id = c.user_id
    join public.tokens t on t.id = c.token_id
    order by c.called_at desc
    limit least(greatest(p_limit, 1), 50)
  ) r;
$$;

revoke all on function public.rankr_recent_calls(integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_recent_calls(integer) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_recent_calls(integer) to service_role;
  end if;
end $$;

-- ===== 20260927080000_rankr_feed_events.sql =====

-- The feed grows past new calls:
--
-- 1. Milestones: "$PEPE hit 10x from @userx's call". A trigger on each price update notes every
--    milestone a call crosses (2x, 3x, 5x, 10x, 20x, 50x, 100x, 1000x from the caller's own entry), once.
-- 2. rankr_feed: calls and milestones, newest first, filtered by caller (Following / Top callers), chain
--    and kind, paged by offset, each with its caller's call count and 2x hits (the hit rate on the board).
--    It replaces rankr_recent_calls.

do $$
begin
  if to_regprocedure('public.rankr_recent_calls(integer)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create table if not exists public.call_milestones (
  user_id    uuid not null,
  token_id   text not null,
  tier       integer not null,           -- 2 = the call reached 2x
  reached_at timestamptz not null,
  primary key (user_id, token_id, tier),
  foreign key (user_id, token_id) references public.calls (user_id, token_id) on delete cascade
);

create index if not exists call_milestones_reached_at_idx on public.call_milestones (reached_at desc);

alter table public.call_milestones enable row level security;
drop policy if exists "milestones are public" on public.call_milestones;
create policy "milestones are public" on public.call_milestones for select to anon, authenticated using (true);

-- The milestones, the same as the app's (src/lib/metrics.ts MILESTONES).
create or replace function public.rankr_milestones() returns integer[]
language sql immutable as $$ select array[2, 3, 5, 10, 20, 50, 100, 1000] $$;

-- On a new price: every call on the token that is now at a milestone it hadn't reached gets it noted.
create or replace function public.rankr_note_milestones() returns trigger
language plpgsql as $$
begin
  if new.last_price_usd is distinct from old.last_price_usd then
    insert into public.call_milestones (user_id, token_id, tier, reached_at)
    select c.user_id, c.token_id, m.tier, new.last_checked_at
    from public.calls c
    cross join unnest(public.rankr_milestones()) as m(tier)
    where c.token_id = new.id and new.last_price_usd >= c.entry_price_usd * m.tier
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists tokens_milestones on public.tokens;
create trigger tokens_milestones after update of last_price_usd on public.tokens
  for each row execute function public.rankr_note_milestones();

-- Calls already past a milestone: noted at the last check, so they sit in the past rather than all
-- landing on top of the feed at the next refresh.
insert into public.call_milestones (user_id, token_id, tier, reached_at)
select c.user_id, c.token_id, m.tier, greatest(c.called_at, t.last_checked_at)
from public.calls c
join public.tokens t on t.id = c.token_id
cross join unnest(public.rankr_milestones()) as m(tier)
where t.last_price_usd >= c.entry_price_usd * m.tier
on conflict do nothing;

drop function if exists public.rankr_recent_calls(integer);

-- Newest calls and milestones. p_users: only these callers (null = everyone). p_chain: one chain.
-- p_kind: 'call' or 'milestone' (null = both). When one price jump crosses several milestones of a call,
-- only the highest shows. Each row: kind, tier, at, the call, username, official, caller_calls,
-- caller_hits, token.
create or replace function public.rankr_feed(
  p_limit integer default 20,
  p_offset integer default 0,
  p_users uuid[] default null,
  p_chain text default null,
  p_kind text default null
) returns jsonb
language sql stable as $$
  with lim as (
    select least(greatest(p_limit, 1), 50) as n, least(greatest(p_offset, 0), 500) as off
  ),
  ev as (
    (select 'call'::text as kind, c.user_id, c.token_id, null::integer as tier, c.called_at as at
       from public.calls c join public.tokens t on t.id = c.token_id
      where (p_kind is null or p_kind = 'call')
        and (p_users is null or c.user_id = any(p_users))
        and (p_chain is null or t.chain_id = p_chain)
      order by c.called_at desc
      limit (select n + off from lim))
    union all
    (select 'milestone', m.user_id, m.token_id, m.tier, m.reached_at
       from public.call_milestones m join public.tokens t on t.id = m.token_id
      where (p_kind is null or p_kind = 'milestone')
        and (p_users is null or m.user_id = any(p_users))
        and (p_chain is null or t.chain_id = p_chain)
        and not exists (
          select 1 from public.call_milestones h
           where h.user_id = m.user_id and h.token_id = m.token_id and h.tier > m.tier and h.reached_at = m.reached_at)
      order by m.reached_at desc
      limit (select n + off from lim))
  ),
  page as (
    select * from ev
    order by at desc, kind desc, tier desc nulls last, user_id, token_id
    offset (select off from lim) limit (select n from lim)
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'kind', e.kind, 'tier', e.tier, 'at', e.at,
             'user_id', e.user_id, 'token_id', e.token_id,
             'entry_price_usd', c.entry_price_usd, 'entry_market_cap', c.entry_market_cap, 'called_at', c.called_at,
             'username', p.username, 'official', p.official,
             'caller_calls', s.calls, 'caller_hits', s.hits,
             'token', to_jsonb(t))
           order by e.at desc, e.kind desc, e.tier desc nulls last, e.user_id, e.token_id),
         '[]'::jsonb)
  from page e
  join public.calls c on c.user_id = e.user_id and c.token_id = e.token_id
  join public.profiles p on p.user_id = e.user_id
  join public.tokens t on t.id = e.token_id
  cross join lateral (
    select count(*)::int as calls,
           count(*) filter (where t2.last_price_usd / c2.entry_price_usd >= 2)::int as hits
    from public.calls c2 join public.tokens t2 on t2.id = c2.token_id
    where c2.user_id = e.user_id
  ) s;
$$;

revoke all on function public.rankr_feed(integer, integer, uuid[], text, text) from public;
revoke all on function public.rankr_note_milestones() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_feed(integer, integer, uuid[], text, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_feed(integer, integer, uuid[], text, text) to service_role;
  end if;
end $$;

-- ===== 20260927090000_rankr_profile.sql =====

-- Caller profiles beyond the name: a short bio, an X account, a Telegram username and a website (same rules
-- as src/lib/profile.ts; for the website the app checks the domain, SQL the scheme and length). The X account shows on the public profile only once verified: the server has read
-- a public post from that X account carrying the code for this Rankr account (rankr_verify_x).
-- One Rankr account per verified X account; the newest verification wins.

do $$
begin
  if to_regprocedure('public.rankr_set_official(text, text, boolean)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists x_handle text;
alter table public.profiles add column if not exists x_verified_at timestamptz;
alter table public.profiles add column if not exists telegram text;
alter table public.profiles add column if not exists website text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length check (char_length(bio) between 1 and 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_x_handle_format') then
    alter table public.profiles add constraint profiles_x_handle_format check (x_handle ~ '^[A-Za-z0-9_]{1,15}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_telegram_format') then
    alter table public.profiles add constraint profiles_telegram_format check (telegram ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_website_format') then
    alter table public.profiles add constraint profiles_website_format
      check (website ~ '^https?://[^[:space:]]+$' and char_length(website) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_x_verified_has_handle') then
    alter table public.profiles add constraint profiles_x_verified_has_handle check (x_verified_at is null or x_handle is not null);
  end if;
end $$;

create unique index if not exists profiles_x_verified_key on public.profiles (lower(x_handle)) where x_verified_at is not null;

-- Sets the bio, X account, Telegram username and website (null or '' clears one). A different X account
-- starts unverified; the same one in another case stays verified.
-- Returns {ok, bio, x, x_verified, telegram, website} or {ok: false, error: not_found | invalid}.
drop function if exists public.rankr_set_profile(uuid, text, text, text);
create or replace function public.rankr_set_profile(
  p_user uuid, p_bio text, p_x text, p_telegram text, p_website text default null
) returns jsonb
language plpgsql as $$
declare
  v public.profiles;
begin
  update public.profiles
     set bio = nullif(btrim(p_bio), ''),
         x_verified_at = case when lower(x_handle) = lower(nullif(p_x, '')) then x_verified_at end,
         x_handle = nullif(p_x, ''),
         telegram = nullif(p_telegram, ''),
         website = nullif(p_website, '')
   where user_id = p_user
  returning * into v;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'bio', v.bio, 'x', v.x_handle, 'x_verified', v.x_verified_at is not null,
                            'telegram', v.telegram, 'website', v.website);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

-- Marks the account's X account (p_x, any case) verified, once the server has read the post. Another
-- account verified as the same X account loses it. {ok: false, error: changed} if the account's X account
-- is no longer p_x.
create or replace function public.rankr_verify_x(p_user uuid, p_x text) returns jsonb
language plpgsql as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_user and lower(x_handle) = lower(p_x)) then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;
  update public.profiles set x_verified_at = null
   where lower(x_handle) = lower(p_x) and x_verified_at is not null and user_id <> p_user;
  update public.profiles set x_verified_at = coalesce(x_verified_at, now()) where user_id = p_user;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.rankr_set_profile(uuid, text, text, text, text) from public;
revoke all on function public.rankr_verify_x(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_set_profile(uuid, text, text, text, text) from anon, authenticated;
    revoke all on function public.rankr_verify_x(uuid, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_set_profile(uuid, text, text, text, text) to service_role;
    grant execute on function public.rankr_verify_x(uuid, text) to service_role;
  end if;
end $$;

-- ===== 20260928000000_rankr_dead_tokens.sql =====

-- Dead tokens: at 0.3x or below (−70% or worse from the first paste, DEAD_MULTIPLE in src/lib/params.ts) a
-- token leaves the token boards, and comes back if it recovers. Nothing is deleted: calls on it stay and
-- still count on the caller board. rankr_query gets p_hide_dead (the boards pass true; searches and id
-- lookups don't). The background refresh checks dead tokens hourly (src/lib/store/supabase.ts, no SQL).

do $$
begin
  if to_regclass('public.tokens') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

-- A second signature next to the old one would make calls without p_hide_dead ambiguous.
drop function if exists public.rankr_query(text, text, timestamptz, text, text[], integer, integer);

create or replace function public.rankr_query(
  p_sort      text default 'top',
  p_chain     text default null,
  p_since     timestamptz default null,
  p_q         text default null,
  p_ids       text[] default null,
  p_limit     integer default 50,
  p_offset    integer default 0,
  p_hide_dead boolean default false
) returns jsonb
language sql stable as $$
  with f as (
    select t.* from public.tokens t
    where (p_chain is null or t.chain_id = p_chain)
      and (p_since is null or t.first_pasted_at >= p_since)
      and (p_ids is null or t.id = any (p_ids))
      and (not coalesce(p_hide_dead, false) or t.multiple > 0.3)
      and (
        p_q is null
        or t.symbol ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or t.name   ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or lower(t.address) = lower(p_q)
      )
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'top'    then f.multiple end desc nulls last,
        case when p_sort = 'peak'   then f.peak_multiple end desc nulls last,
        case when p_sort = 'losers' then f.multiple end asc nulls last,
        case when p_sort = 'hot'    then f.paste_count end desc nulls last,
        case when p_sort = 'hot'    then f.last_pasted_at end desc nulls last,
        f.first_pasted_at desc,
        f.id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'records', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

-- ===== 20260928010000_rankr_monthly_reset.sql =====

-- Monthly reset: on the 1st of every month at 00:00 UTC every token goes, and with it every call and
-- milestone (on delete cascade), so the boards start from zero. Accounts stay: names, keys, bios, links,
-- verified X accounts. Before the wipe, the month's top 10 callers (by hit rate, as on the caller board)
-- and top 10 tokens (by peak x since the first paste) are kept in public.seasons, shown as "Last month".
--
-- Calls can no longer be removed one by one (rankr_delete_call is dropped): they all go with the reset, and
-- a caller removing their losing calls would dress up their hit rate.
--
-- Scheduled with pg_cron when it is enabled (Dashboard -> Database -> Extensions); see supabase/cron.sql.
-- By hand:   select rankr_end_month();
-- Stop it:   select cron.unschedule('rankr-monthly-reset');

do $$
begin
  if to_regprocedure('public.rankr_callers(text, integer, integer, integer)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

drop function if exists public.rankr_delete_call(uuid, text);

create table if not exists public.seasons (
  id       bigint generated always as identity primary key,
  month    date not null,                     -- the month that ended, e.g. 2026-09-01
  ended_at timestamptz not null default now(),
  callers  jsonb not null default '[]',       -- top 10 by hit rate, callers with 5+ calls
  tokens   jsonb not null default '[]',       -- top 10 by peak x since the first paste
  counts   jsonb not null default '{}'        -- {tokens, calls, callers} when it ended
);

create index if not exists seasons_ended_at_idx on public.seasons (ended_at desc);

alter table public.seasons enable row level security;
drop policy if exists "seasons are public" on public.seasons;
create policy "seasons are public" on public.seasons for select to anon, authenticated using (true);

-- Ends the month: keeps its top 10s, then deletes every token (calls and milestones go with them). The
-- month is the one that just ended when run in the first hours of the 1st, else the current one. Nothing
-- to keep (no tokens): nothing is written. Returns {ok, month, tokens, calls, callers} or {ok, skipped}.
create or replace function public.rankr_end_month(p_at timestamptz default now()) returns jsonb
language plpgsql as $$
declare
  v_month  date := date_trunc('month', p_at - interval '12 hours')::date;
  v_counts jsonb;
  v_tokens jsonb;
begin
  select jsonb_build_object(
    'tokens',  (select count(*) from public.tokens),
    'calls',   (select count(*) from public.calls),
    'callers', (select count(distinct user_id) from public.calls)
  ) into v_counts;
  if (v_counts->>'tokens')::int = 0 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.peak_multiple desc, x.first_pasted_at), '[]'::jsonb) into v_tokens
  from (
    select t.id, t.chain_id, t.address, t.symbol, t.name, t.entry_market_cap, t.first_pasted_at,
           t.peak_multiple, t.multiple, first_call.user_id as first_caller
    from public.tokens t
    left join lateral (
      select c.user_id from public.calls c where c.token_id = t.id order by c.called_at, c.user_id limit 1
    ) first_call on true
    order by t.peak_multiple desc nulls last, t.first_pasted_at
    limit 10
  ) x;

  insert into public.seasons (month, ended_at, callers, tokens, counts)
  values (v_month, p_at, coalesce(public.rankr_callers('rate', 5, 10, 0)->'callers', '[]'::jsonb), v_tokens, v_counts);

  -- "where true": Supabase's safeupdate refuses a delete without a where clause.
  delete from public.tokens where true;

  return jsonb_build_object('ok', true, 'month', v_month) || v_counts;
end $$;

revoke all on function public.rankr_end_month(timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_end_month(timestamptz) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_end_month(timestamptz) to service_role;
  end if;
end $$;

-- 00:00 UTC on the 1st (pg_cron runs in UTC). Re-running replaces the job with the same name.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rankr-monthly-reset', '0 0 1 * *', 'select public.rankr_end_month()');
  else
    raise notice 'rankr: pg_cron is not enabled, so the monthly reset is not scheduled yet (see supabase/cron.sql)';
  end if;
end $$;
