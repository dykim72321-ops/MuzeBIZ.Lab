-- 눌림목(Pullback) 2차 대기 지정가 진입 알고리즘 지원.
-- 1) 신호 발생 후 즉시매수 대신 되돌림을 감시하는 pullback_watches 테이블 신규 생성
--    (paper_positions의 ENTERING/HOLD/CLOSING 상태 머신과는 별개 개념이라 분리)
-- 2) 개선 검증 트래커(routers/checklist.py)의 자동 롤백 대상으로 편입하기 위한
--    system_settings.pullback_entry_enabled 런타임 설정 컬럼 추가

CREATE TABLE IF NOT EXISTS pullback_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  is_penny boolean NOT NULL DEFAULT false,
  dna_score double precision NOT NULL DEFAULT 0,
  atr double precision NOT NULL DEFAULT 0,
  recommended_weight double precision NOT NULL DEFAULT 0,
  signal_type text NOT NULL,
  strength text NOT NULL,
  rsi_at_signal double precision,
  signal_price double precision NOT NULL,
  peak_price double precision NOT NULL,
  last_price double precision NOT NULL,
  status text NOT NULL DEFAULT 'WATCHING',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pullback_watches_ticker_watching
  ON pullback_watches (ticker)
  WHERE status = 'WATCHING';

CREATE INDEX IF NOT EXISTS idx_pullback_watches_status_expires
  ON pullback_watches (status, expires_at);

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS pullback_entry_enabled boolean NOT NULL DEFAULT true;
