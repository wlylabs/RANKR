-- No leaderboard: the caller board, a caller's place on it and the months the reset kept (public.seasons)
-- are gone. The monthly reset stays, so Rankr starts clean every month: at 00:00 UTC on the 1st every token
-- goes, and with it every call and milestone (on delete cascade). Accounts stay. No top 10s are kept (each
-- caller's own private recap comes with …_rankr_recaps.sql). rankr_query stays (the app reads tokens by id
-- and the newest pastes through it).
--
-- Run after deploying the app that no longer reads the board.
--
-- By hand:   select rankr_end_month();
-- Stop it:   select cron.unschedule('rankr-monthly-reset');

-- Ends the month: deletes every token (calls and milestones go with them). The month is the one that just
-- ended when run in the first hours of the 1st, else the current one. Nothing to clear (no tokens): nothing
-- happens. Returns {ok, month, tokens, calls, callers} or {ok, skipped}. Left alone once the recaps migration
-- (…_rankr_recaps.sql) has run, whichever order they run in: its version keeps each caller's month first.
do $do$
begin
  if to_regclass('public.recaps') is not null then
    raise notice 'rankr: public.recaps exists, so rankr_end_month (which keeps them) stays as it is';
    return;
  end if;
  execute $fn$
    create or replace function public.rankr_end_month(p_at timestamptz default now()) returns jsonb
    language plpgsql as $body$
    declare
      v_month  date := date_trunc('month', (p_at at time zone 'UTC') - interval '12 hours')::date;
      v_counts jsonb;
    begin
      select jsonb_build_object(
        'tokens',  (select count(*) from public.tokens),
        'calls',   (select count(*) from public.calls),
        'callers', (select count(distinct user_id) from public.calls)
      ) into v_counts;
      if (v_counts->>'tokens')::int = 0 then
        return jsonb_build_object('ok', true, 'skipped', true);
      end if;

      -- "where true": Supabase's safeupdate refuses a delete without a where clause.
      delete from public.tokens where true;

      return jsonb_build_object('ok', true, 'month', v_month) || v_counts;
    end $body$;
  $fn$;
end $do$;

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

drop table if exists public.seasons;

drop function if exists public.rankr_caller_rank(uuid, text, integer);
drop function if exists public.rankr_callers(text, integer, integer, integer);
drop function if exists public.rankr_caller_board(text, integer);
