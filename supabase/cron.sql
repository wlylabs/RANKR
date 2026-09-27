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
