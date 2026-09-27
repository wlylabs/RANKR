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
