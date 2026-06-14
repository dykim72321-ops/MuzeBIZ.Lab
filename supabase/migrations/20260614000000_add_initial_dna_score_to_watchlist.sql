ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS initial_dna_score NUMERIC;
COMMENT ON COLUMN public.watchlist.initial_dna_score IS '최초 등록 시 DNA 점수 (스캐너 자동 등록 기록용)';
