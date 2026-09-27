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
