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
