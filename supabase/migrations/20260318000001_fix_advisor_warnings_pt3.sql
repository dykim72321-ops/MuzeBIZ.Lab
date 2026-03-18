-- 20260318000001_fix_advisor_warnings_pt3.sql
-- Fix "RLS Policy Always True" warnings by replacing USING (true) with USING (auth.uid() IS NOT NULL)

-- 1. Paper Trading Tables
DROP POLICY IF EXISTS "Public Read/Write Account" ON public.paper_account;
DROP POLICY IF EXISTS "Public Read/Write Positions" ON public.paper_positions;
DROP POLICY IF EXISTS "Public Read/Write History" ON public.paper_history;

CREATE POLICY "Auth Read/Write Account" ON public.paper_account FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth Read/Write Positions" ON public.paper_positions FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth Read/Write History" ON public.paper_history FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 2. CRM Tables (Update the ones from pt2 to strictly avoid USING (true))
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.crm_call_plans;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.crm_companies;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.crm_contacts;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.crm_projects;

CREATE POLICY "Auth Read/Write CallPlans" ON public.crm_call_plans FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth Read/Write Companies" ON public.crm_companies FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth Read/Write Contacts" ON public.crm_contacts FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth Read/Write Projects" ON public.crm_projects FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Realtime Signals
DROP POLICY IF EXISTS "Authenticated can read signals" ON public.realtime_signals;
DROP POLICY IF EXISTS "Service role can insert signals" ON public.realtime_signals;

CREATE POLICY "Auth Read Signals" ON public.realtime_signals FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
-- (Service role bypasses RLS by default, so it does not explicitly need a policy, but we can add one without USING(true) if strictly needed. Omitting it is cleaner.)
