-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Schedule the Daily Quant Scan (Mon-Fri 21:00 UTC / Tue-Sat 06:00 KST)
-- Note: Project Ref: drnxydtrsjumjksqmdgi
-- Note: Service Role Key: ejY... (from .env.local)
SELECT cron.schedule(
    'daily-quant-scan-autopilot',
    '0 21 * * 1-5', -- Every Monday to Friday at 21:00 UTC (Post Market Close)
    $$
    SELECT net.http_post(
        url := 'https://drnxydtrsjumjksqmdgi.supabase.co/functions/v1/run-quant-scanner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybnh5ZHRyc2p1bWprc3FtZGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY2NTEwNSwiZXhwIjoyMDg1MjQxMTA1fQ.fPa3_J8TvzQ3iTLeq2101tJYxj3REpJBUBoUlmat57g'
        ),
        body := '{}'
    );
    $$
);

-- 4. (Optional) Schedule the Portfolio Rebalancer (Mon-Fri 22:00 UTC)
SELECT cron.schedule(
    'daily-portfolio-rebalance-autopilot',
    '0 22 * * 1-5', 
    $$
    SELECT net.http_post(
        url := 'https://drnxydtrsjumjksqmdgi.supabase.co/functions/v1/run-quant-portfolio',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybnh5ZHRyc2p1bWprc3FtZGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY2NTEwNSwiZXhwIjoyMDg1MjQxMTA1fQ.fPa3_J8TvzQ3iTLeq2101tJYxj3REpJBUBoUlmat57g'
        ),
        body := '{}'
    );
    $$
);
