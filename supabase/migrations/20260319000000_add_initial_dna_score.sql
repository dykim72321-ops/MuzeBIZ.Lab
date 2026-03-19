-- Watchlist 테이블에 초기 스캐너 점수를 저장할 컬럼 추가
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS initial_dna_score numeric;

COMMENT ON COLUMN public.watchlist.initial_dna_score IS 'Scanner에서 종목을 발굴/추가했을 당시의 초기 DNA Score (잠재력)';
