-- 신호 발생 후 30분/60분 뒤 실제 가격 변화(forward return)를 기록해,
-- DNA 컴포넌트(RSI/MACD/ADX/RVOL)가 실제로 수익률을 예측하는지 데이터로
-- 검증하기 위한 컬럼. 차단된(BLOCKED) 신호도 포함해 "게이트를 더 낮췄으면
-- 어땠을지"까지 추적 가능하게 한다 (2026-07-18 수익률 분석 후속 조치).
alter table engine_decisions
  add column if not exists forward_return_30m double precision,
  add column if not exists forward_return_60m double precision,
  add column if not exists forward_30m_checked boolean not null default false,
  add column if not exists forward_60m_checked boolean not null default false;

-- 스케줄러가 "아직 기록 안 된 건"만 빠르게 조회하기 위한 부분 인덱스
create index if not exists engine_decisions_fwd30_pending_idx
  on engine_decisions (ts) where forward_30m_checked = false;
create index if not exists engine_decisions_fwd60_pending_idx
  on engine_decisions (ts) where forward_60m_checked = false;
