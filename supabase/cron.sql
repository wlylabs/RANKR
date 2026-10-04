-- Optional: refresh prices every minute from inside Supabase, so peaks / lows are recorded
-- even when nobody has the site open. Run once in the SQL editor after deploying the app.
--
-- 1. Dashboard -> Database -> Extensions: enable pg_cron and pg_net.
-- 2. Put your app URL and the same CRON_SECRET you set on the app into Vault:
select vault.create_secret('https://YOUR-APP-DOMAIN', 'rankr_url');
select vault.create_secret('YOUR_CRON_SECRET', 'rankr_cron_secret');

-- 3. Schedule the call (re-running replaces the job with the same name).
select cron.schedule(
  'rankr-refresh',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rankr_url') || '/api/cron/refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rankr_cron_secret')
    ),
    timeout_milliseconds := 20000
  );
  $$
);

-- Check it:   select * from cron.job_run_details order by start_time desc limit 5;
-- Stop it:    select cron.unschedule('rankr-refresh');

-- Monthly reset: every token, call and milestone goes at 00:00 UTC on the 1st, so Rankr starts clean every
-- month, after each caller's month is kept as their private recap (public.recaps; each call in the month it
-- was made, so a late or by-hand run adds to the right month). Accounts stay. supabase/setup.sql schedules
-- it when pg_cron is enabled; after enabling pg_cron later, run this (or setup.sql again):
select cron.schedule('rankr-monthly-reset', '0 0 1 * *', 'select public.rankr_end_month()');

-- Check it:   select * from cron.job where jobname = 'rankr-monthly-reset';
-- Stop it:    select cron.unschedule('rankr-monthly-reset');
