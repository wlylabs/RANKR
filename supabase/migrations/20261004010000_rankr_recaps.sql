-- Monthly recaps: before the reset clears the month, each caller's own numbers for it are kept as a
-- private recap, for them alone. Not a board: nobody else can read them (no policies, so browsers get
-- nothing; the server reads one account's own with the secret key). The calls themselves still go.

do $$
begin
  if to_regprocedure('public.rankr_end_month(timestamptz)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create table if not exists public.recaps (
  user_id       uuid not null references public.profiles (user_id) on delete cascade,
  month         date not null,                -- the month it covers, e.g. 2026-09-01
  calls         integer not null,
  hits          integer not null,             -- calls at 2x or more when the month ended
  wins          integer not null,             -- calls above entry when the month ended
  avg_multiple  double precision not null,
  best_multiple double precision not null,
  best_token    jsonb,                        -- {id, chain_id, address, symbol, name} of the best call
  top_tier      integer,                      -- the highest milestone any call reached (null: none)
  created_at    timestamptz not null default now(),
  primary key (user_id, month)
);

-- No policies: only the server (secret key) reads and writes it.
alter table public.recaps enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.recaps from anon, authenticated;
  end if;
end $$;

-- Ends the month: keeps each caller's recap, then deletes every token (calls and milestones go with them).
-- Each call goes into the recap of the month it was made in (UTC), so a reset that runs late, or by hand,
-- never mixes two months; calls of a month already kept are added to its recap. Nothing to clear (no
-- tokens): nothing happens. Returns {ok, month, tokens, calls, callers} or {ok, skipped}, `month` being the
-- one that just ended when run in the first hours of the 1st, else the current one.
create or replace function public.rankr_end_month(p_at timestamptz default now()) returns jsonb
language plpgsql as $$
declare
  v_month  date := date_trunc('month', (p_at at time zone 'UTC') - interval '12 hours')::date;
  v_counts jsonb;
begin
  -- Pastes, calls, price refreshes and another reset wait until this one is done: every call it clears is
  -- in a recap, and only once.
  lock table public.tokens, public.calls in share row exclusive mode;

  select jsonb_build_object(
    'tokens',  (select count(*) from public.tokens),
    'calls',   (select count(*) from public.calls),
    'callers', (select count(distinct user_id) from public.calls)
  ) into v_counts;
  if (v_counts->>'tokens')::int = 0 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  -- Each call measured from the caller's own entry, as on their profile; its highest milestone is its own.
  insert into public.recaps as r (user_id, month, calls, hits, wins, avg_multiple, best_multiple, best_token, top_tier)
  select p.user_id, p.month,
         count(*)::int,
         count(*) filter (where p.m >= 2)::int,
         count(*) filter (where p.m > 1.005)::int,
         avg(p.m),
         max(p.m),
         (array_agg(p.token order by p.m desc, p.called_at))[1],
         max(p.tier)
  from (
    select c.user_id, c.called_at,
           date_trunc('month', c.called_at at time zone 'UTC')::date as month,
           t.last_price_usd / c.entry_price_usd as m,
           jsonb_build_object('id', t.id, 'chain_id', t.chain_id, 'address', t.address,
                              'symbol', t.symbol, 'name', t.name) as token,
           (select max(ms.tier) from public.call_milestones ms
             where ms.user_id = c.user_id and ms.token_id = c.token_id) as tier
    from public.calls c join public.tokens t on t.id = c.token_id
  ) p
  group by p.user_id, p.month
  on conflict (user_id, month) do update set
    calls         = r.calls + excluded.calls,
    hits          = r.hits + excluded.hits,
    wins          = r.wins + excluded.wins,
    avg_multiple  = (r.avg_multiple * r.calls + excluded.avg_multiple * excluded.calls) / (r.calls + excluded.calls),
    best_multiple = greatest(r.best_multiple, excluded.best_multiple),
    best_token    = case when excluded.best_multiple > r.best_multiple then excluded.best_token else r.best_token end,
    top_tier      = greatest(r.top_tier, excluded.top_tier);

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
