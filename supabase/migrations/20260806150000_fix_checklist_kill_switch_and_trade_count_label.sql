-- kill_switch_verified: ARMED/DISARMED 현재 상태만으로는 "비상 정지 절차 리허설을
-- 실제로 수행했는지" 알 수 없어 자동 판정 대상에서 제외 — evaluate_checklist()가
-- 상수 True로 항상 통과 처리하던 문제를 수정하며, 수동 체크로 전환한다.
UPDATE public.live_transition_checklist
SET is_automated = false
WHERE item_key = 'kill_switch_verified';

-- min_trade_count 라벨이 "30건 이상"으로 남아있었으나 실제 자동 판정 임계값
-- (CHECKLIST_MIN_TRADES)은 100건이라 화면에 두 숫자가 동시에 노출되던 불일치 수정.
UPDATE public.live_transition_checklist
SET label = '충분한 표본 거래 횟수 확보 (100건 이상)'
WHERE item_key = 'min_trade_count';
