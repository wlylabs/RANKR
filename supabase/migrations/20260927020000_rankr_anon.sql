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
