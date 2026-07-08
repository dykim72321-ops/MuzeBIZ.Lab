-- 20260708000001_create_live_transition_checklist.sql
-- 실계좌(LIVE) 전환 준비도 체크리스트 — paper trading 검증 기간(2026-07-08~) 종료 시 참고

CREATE TABLE IF NOT EXISTS public.live_transition_checklist (
    item_key TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.live_transition_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read/Write Checklist" ON public.live_transition_checklist
    FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.live_transition_checklist (item_key, category, label, sort_order) VALUES
  ('min_3month_period', '성과 검증', '최소 3개월 관찰 기간 경과 (시작: 2026-07-08)', 1),
  ('win_rate_threshold', '성과 검증', '승률 55% 이상 & Profit Factor 1.3 이상 유지', 2),
  ('mdd_acceptable', '성과 검증', 'MDD가 허용 리스크 범위 내', 3),
  ('min_trade_count', '성과 검증', '충분한 표본 거래 횟수 확보 (30건 이상)', 4),
  ('live_env_tested', '인프라/리스크', 'LIVE 모드 환경변수 전환 테스트 완료 (APCA_PAPER=false, TRADE_MODE=LIVE)', 5),
  ('pdt_reviewed', '인프라/리스크', 'PDT 규칙 및 실계좌 마진 조건 재검토', 6),
  ('risk_capital_defined', '인프라/리스크', '투입 자본 규모 및 최대 손실 한도(서킷브레이커) 결정', 7),
  ('alerting_verified', '인프라/리스크', 'Discord 알림 및 모니터링 정상 동작 확인', 8),
  ('live_account_funded', '운영 준비', 'Alpaca LIVE 계좌 개설 및 입금 완료', 9),
  ('kill_switch_verified', '운영 준비', '비상 정지(ARM/DISARM, 전량 청산) 절차 리허설 완료', 10)
ON CONFLICT (item_key) DO NOTHING;
