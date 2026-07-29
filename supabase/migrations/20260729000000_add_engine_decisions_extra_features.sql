-- feature significance 분석(scripts/run_feature_significance.py)이 daily_discovery의
-- 최신 스냅샷(시점 불일치)에 의존하지 않고, 결정 시점의 실제 피처로 예측력을 검증할 수
-- 있도록 engine_decisions에 ADX/MACD_diff/Is_Extended/ATR%를 함께 기록한다.
alter table engine_decisions
  add column if not exists adx float,
  add column if not exists macd_diff float,
  add column if not exists is_extended boolean,
  add column if not exists atr_pct float;
