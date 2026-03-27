-- 20260215000004_standardize_persona_performance.sql
-- Ensure persona_performance has ROI and hit rate metrics

ALTER TABLE public.persona_performance
ADD COLUMN IF NOT EXISTS avg_roi numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone DEFAULT now();

-- Update current script dependencies
-- We keep 'correct_predictions' and 'total_predictions' for the generated 'win_rate'
