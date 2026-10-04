-- No leaderboard: the caller board, a caller's place on it, the monthly reset and the months it kept are
-- gone. Tokens, calls and milestones now stay: nothing is wiped on the 1st. rankr_query stays (the app reads
-- tokens by id and the newest pastes through it).
--
-- Run after deploying the app that no longer reads them.

-- The reset's pg_cron job, where pg_cron is on (nested, so cron.job is only read when it exists).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'rankr-monthly-reset') then
      perform cron.unschedule('rankr-monthly-reset');
    end if;
  end if;
end $$;

drop function if exists public.rankr_end_month(timestamptz);
drop table if exists public.seasons;

drop function if exists public.rankr_caller_rank(uuid, text, integer);
drop function if exists public.rankr_callers(text, integer, integer, integer);
drop function if exists public.rankr_caller_board(text, integer);
