-- "Your position" on the caller board: a caller's rank for a sort, their numbers, and the caller one place
-- up, shown as a row pinned under the board.
--
-- The ranking moves into rankr_caller_board, which both the board (rankr_callers) and one caller's place on
-- it (rankr_caller_rank) read, so the two always agree.

do $$
begin
  if to_regprocedure('public.rankr_callers(text, integer, integer, integer)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

-- Every caller with p_min_calls calls or more, numbered from 1 (rn) in board order.
create or replace function public.rankr_caller_board(p_sort text default 'rate', p_min_calls integer default 1)
returns table (
  user_id uuid, calls integer, hits integer, wins integer, avg_multiple double precision,
  best_multiple double precision, best_token jsonb, username text, official boolean, rn bigint
)
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
  )
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
  from f;
$$;

create or replace function public.rankr_callers(
  p_sort text default 'rate',
  p_min_calls integer default 1,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with ranked as (select * from public.rankr_caller_board(p_sort, p_min_calls))
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'callers', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

-- One caller's place on the board: {total, calls, rank, caller, ahead}. `calls` counts all their calls;
-- rank and caller are null off the board (fewer than p_min_calls calls), ahead is null at #1.
create or replace function public.rankr_caller_rank(
  p_user uuid,
  p_sort text default 'rate',
  p_min_calls integer default 1
) returns jsonb
language sql stable as $$
  with ranked as (select * from public.rankr_caller_board(p_sort, p_min_calls)),
  me as (select * from ranked where user_id = p_user)
  select jsonb_build_object(
    'total',  (select count(*) from ranked),
    'calls',  (select count(*) from public.calls where user_id = p_user),
    'rank',   (select rn from me),
    'caller', (select to_jsonb(me) - 'rn' from me),
    'ahead',  (select to_jsonb(r) - 'rn' from ranked r where r.rn = (select rn from me) - 1)
  );
$$;
