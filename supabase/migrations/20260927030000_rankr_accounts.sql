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
