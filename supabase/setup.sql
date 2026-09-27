-- Rankr: complete database setup. Paste this whole file into the Supabase SQL editor and run it.
-- Safe to run again. Generated from supabase/migrations by `npm run db:bundle`; edit those, not this.

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

-- ===== 20260927020000_rankr_anon.sql =====

-- Anonymous callers (Supabase Auth anonymous sign-ins) instead of wallets.
--
-- Every caller gets a public handle derived from their user id: "anon-" + the first 6 hex chars
-- of sha256(user_id). No wallet, email or name is stored or shown.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create or replace function public.rankr_handle(p_user uuid) returns text
language sql immutable as $$
  select 'anon-' || left(encode(sha256(convert_to(p_user::text, 'UTF8')), 'hex'), 6);
$$;

alter table public.profiles add column if not exists handle text;
alter table public.profiles alter column chain drop not null;
alter table public.profiles alter column wallet drop not null;
update public.profiles set handle = public.rankr_handle(user_id) where handle is null;
alter table public.profiles alter column handle set not null;

-- Profiles are now just a handle.
drop function if exists public.rankr_upsert_profile(uuid, text, text);
create or replace function public.rankr_upsert_profile(p_user uuid) returns text
language sql as $$
  insert into public.profiles (user_id, handle) values (p_user, public.rankr_handle(p_user))
  on conflict (user_id) do update set handle = excluded.handle
  returning handle;
$$;

-- Caller leaderboard, now keyed by handle. sort: avg | hits | best | calls. Returns {total, callers}.
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
    select a.*, p.handle
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

revoke all on function public.rankr_upsert_profile(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_upsert_profile(uuid) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_upsert_profile(uuid) to service_role;
  end if;
end $$;
