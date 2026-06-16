-- realtime_signals에 adx, rvol 컬럼 추가
-- Pulse Engine이 실시간 전송하는 adx, rvol 지표를 DB에 기록하고 프론트엔드에서 조회할 수 있도록 함.
ALTER TABLE public.realtime_signals
  ADD COLUMN IF NOT EXISTS adx NUMERIC,
  ADD COLUMN IF NOT EXISTS rvol NUMERIC;
