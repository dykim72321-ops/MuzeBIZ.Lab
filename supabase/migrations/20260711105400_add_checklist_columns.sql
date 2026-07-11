-- live_transition_checklist 테이블에 자동화 여부와 측정값을 저장할 컬럼 추가
ALTER TABLE live_transition_checklist
ADD COLUMN is_automated BOOLEAN DEFAULT false,
ADD COLUMN auto_note TEXT;

-- 기존 4가지 퀀트 성과 검증 항목들을 자동화 항목으로 지정
UPDATE live_transition_checklist
SET is_automated = true
WHERE item_key IN (
  'min_3month_period',
  'min_trade_count',
  'win_rate_threshold',
  'mdd_acceptable'
);
