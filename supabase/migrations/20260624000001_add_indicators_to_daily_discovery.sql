-- daily_discovery 테이블에 DNA 시뮬레이터 연동용 지표 컬럼 추가
ALTER TABLE daily_discovery
  ADD COLUMN IF NOT EXISTS rsi         numeric,
  ADD COLUMN IF NOT EXISTS rvol        numeric,
  ADD COLUMN IF NOT EXISTS adx         numeric,
  ADD COLUMN IF NOT EXISTS macd_diff   numeric,
  ADD COLUMN IF NOT EXISTS macd_diff_prev numeric,
  ADD COLUMN IF NOT EXISTS di_positive boolean,
  ADD COLUMN IF NOT EXISTS is_extended boolean,
  ADD COLUMN IF NOT EXISTS atr_pct     numeric,
  ADD COLUMN IF NOT EXISTS change_percent numeric;
