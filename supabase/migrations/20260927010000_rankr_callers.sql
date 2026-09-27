-- Wallet accounts and per-user calls (Supabase Auth, "Sign in with Web3").
--
-- A call is a user's own entry on a token: the price at the moment *they* pasted it while signed
-- in. Calls are written by the server only, from server-side market data, so nobody can
-- backdate or invent an entry. They are what the caller leaderboard ranks.

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
