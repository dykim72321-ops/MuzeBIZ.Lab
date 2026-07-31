-- feature_significance 대안 피처 리서치(2026-07-31): DNA_Score 무용론이 4중 검증으로
-- 확정된 뒤, 대체 피처 후보 중 이미 계산 중이던 Efficiency Ratio(smoothed_er)를
-- engine_decisions에도 기록해 forward_return과의 상관관계를 검증할 수 있게 한다.
-- 또한 표본 축적 속도를 높이기 위해 OBSERVE_CANDIDATE 게이트(DNA>=50이지만 STRONG BUY에
-- 못 미치는 신호를 매매 로직과 무관하게 관찰 목적으로만 기록)를 추가한다.
alter table engine_decisions
  add column if not exists efficiency_ratio float;
