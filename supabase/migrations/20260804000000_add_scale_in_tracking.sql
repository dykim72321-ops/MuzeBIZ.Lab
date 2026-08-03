-- Scale-In(추가매수) 개선 검증 트래커 연동에 필요한 컬럼 2개.
--
-- 1) paper_history.scaled_in: 청산된 포지션이 생전에 Scale-In(추가매수)을
--    거쳤는지 표시. paper_positions.scaled_in은 포지션이 청산되며 행 자체가
--    삭제되므로, 청산 이력(paper_history)에도 남겨둬야 routers/checklist.py의
--    개선 검증 트래커가 "Scale-In을 실행한 거래만" 따로 골라 승률/기대값을
--    계산할 수 있다.
-- 2) system_settings.scale_in_enabled: 다른 개선 항목(atr_stop_enabled,
--    pullback_entry_enabled 등)과 동일한 패턴 — 개선 검증 트래커가 REGRESSED를
--    이틀 연속 판정하면 PaperTradingManager.scale_in_enabled를 자동으로 False로
--    내리고, 이 컬럼에 그 상태를 저장해 서버 재시작 후에도 롤백 상태가 유지되게 한다.
alter table paper_history
  add column if not exists scaled_in boolean not null default false;

comment on column paper_history.scaled_in is
  '이 거래가 청산되기 전 Scale-In(추가매수)을 1회 실행했는지 여부. 개선 검증 트래커(routers/checklist.py)의 scale_in 항목이 이 값으로 대상 거래를 필터링한다.';

alter table system_settings
  add column if not exists scale_in_enabled boolean;

comment on column system_settings.scale_in_enabled is
  'Scale-In 기능 런타임 on/off. NULL이면 엔진 기본값(True) 사용. 개선 검증 트래커가 REGRESSED 연속 확정 시 False로 자동 기록하며, 서버 재시작 시 이 값을 읽어 복원한다.';
