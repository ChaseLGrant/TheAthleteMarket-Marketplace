-- Run the marketplace's background sweep every 10 minutes from Supabase (free on your plan; no Vercel Pro needed).
-- 1) Replace YOUR_CRON_SECRET with the same value as CRON_SECRET in Vercel.
-- 2) Paste into Supabase → SQL Editor → Run. Run it again any time to update the schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('tam-marketplace-sweep') where exists (select 1 from cron.job where jobname = 'tam-marketplace-sweep');

select cron.schedule(
  'tam-marketplace-sweep',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://marketplace.theathletemarket.com/api/cron',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it's running:  select * from cron.job_run_details order by start_time desc limit 5;
