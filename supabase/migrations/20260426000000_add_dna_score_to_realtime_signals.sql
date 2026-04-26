-- realtime_signals에 dna_score 컬럼 추가
-- run_pulse_engine()이 payload["dna_score"]를 최상위로 반환하므로 DB에도 저장
ALTER TABLE realtime_signals
  ADD COLUMN IF NOT EXISTS dna_score numeric;
