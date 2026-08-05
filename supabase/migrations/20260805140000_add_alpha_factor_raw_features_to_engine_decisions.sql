-- 신규 알파 팩터 가설(평균회귀/모멘텀/변동성 돌파) 검증을 위한 원자재 컬럼 추가.
-- DNA_Score(합성값)만 기록되던 기존 구조로는 어느 팩터가 실제 예측력을 갖는지
-- 분해할 수 없어, 신호 시점의 raw 값 3개를 개별 컬럼으로 남긴다
-- (services/quant_engine.py calculate_advanced_signals() 산출부 참고).
alter table engine_decisions
  add column if not exists z_score_20 float,          -- 평균회귀: (Close - MA20) / STD20
  add column if not exists ma20_deviation_pct float,   -- 모멘텀: (Close - MA20) / MA20 * 100
  add column if not exists breakout_deviation_pct float; -- 변동성 돌파: (Close - 목표가) / 목표가 * 100 (목표가 = 당일시가 + 전일진폭×0.5)
