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
