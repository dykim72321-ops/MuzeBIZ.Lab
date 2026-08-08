-- 신호 시점의 "시간대"와 "시장 레짐"을 engine_decisions에 직접 기록한다.
--
-- 배경(2026-08-08 재분석): 기존 로깅은 종목 개별 지표(DNA_Score/RSI/RVOL/ATR 등)만
-- 남기고 있어, 신호가 발생한 "환경"을 사후에 재구성할 방법이 없었다. 외부에서
-- SPY 15분봉을 따로 받아 조인해 본 결과 MIDDAY(11:30~14:00) × 시장 상승 레짐
-- 구간이 다른 조합보다 뚜렷이 나은 초과수익(베타 제거 후 +1.04%)을 보였으나,
-- 오염되지 않은 라벨이 4거래일치뿐이라(일자 클러스터 t=1.67, 3일 중 1일 음수)
-- 판정이 불가능했다. 기록하지 않는 변수는 표본이 아무리 쌓여도 검증 대상이 될 수
-- 없으므로, 판정 가능한 최소 표본(≥20거래일)을 모으기 위해 컬럼으로 승격한다.
--
-- 주의: 이 두 컬럼은 "관찰 전용"이다. 매매 게이트에 반영하지 않는다 —
-- 4거래일치 데이터에 베팅하는 것은 rsi_falling_knife_fix(도입 3일 만에 REGRESSED
-- 자동 롤백)와 동일한 실패 패턴이다.
alter table engine_decisions
  -- 정규장 기준 ET 시간대 버킷: OPEN(9:30-10:00) / MORNING(10:00-11:30) /
  -- MIDDAY(11:30-14:00) / AFTERNOON(14:00-15:30) / CLOSE(15:30-16:00) / EXTENDED
  add column if not exists time_bucket text,
  -- 신호 시점 시장 레짐: UPTREND / DOWNTREND
  -- (SPY 15분봉 종가 > 15분봉 20 EMA 이면 UPTREND — MomentumValidator가 개별
  --  종목에 쓰는 상위 추세 판정과 동일한 정의를 지수에 적용한 것)
  add column if not exists market_regime text;

-- 시간대 × 레짐 교차 집계가 이 테이블의 주 조회 패턴이 되므로 부분 인덱스를 둔다
-- (두 값이 채워지기 시작한 2026-08-08 이후 행만 대상 — 이전 행은 전부 NULL).
create index if not exists idx_engine_decisions_regime_bucket
  on engine_decisions (time_bucket, market_regime, ts desc)
  where time_bucket is not null;
