-- 모든 체크리스트 항목을 자동화 항목으로 지정
UPDATE live_transition_checklist
SET is_automated = true;
