-- 20260411000001_restrict_paper_trading_anon_rls.sql
-- Fix: Restrict anon role to SELECT only on paper trading tables.
-- The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely,
-- so INSERT/UPDATE/DELETE for anon is unnecessary and a security risk.
-- Any user with the public anon key could otherwise wipe or manipulate trading data.

-- paper_account
DROP POLICY IF EXISTS "Backend Read/Write Account" ON public.paper_account;
CREATE POLICY "Anon Read Account" ON public.paper_account
  FOR SELECT TO anon, authenticated USING (true);

-- paper_positions
DROP POLICY IF EXISTS "Backend Read/Write Positions" ON public.paper_positions;
CREATE POLICY "Anon Read Positions" ON public.paper_positions
  FOR SELECT TO anon, authenticated USING (true);

-- paper_history
DROP POLICY IF EXISTS "Backend Read/Write History" ON public.paper_history;
CREATE POLICY "Anon Read History" ON public.paper_history
  FOR SELECT TO anon, authenticated USING (true);
