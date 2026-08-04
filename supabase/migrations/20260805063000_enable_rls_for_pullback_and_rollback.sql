-- Enable RLS and create public policies for improvement_rollback_log
ALTER TABLE public.improvement_rollback_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access for improvement_rollback_log" ON public.improvement_rollback_log FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS and create public policies for pullback_watches
ALTER TABLE public.pullback_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access for pullback_watches" ON public.pullback_watches FOR ALL USING (true) WITH CHECK (true);
