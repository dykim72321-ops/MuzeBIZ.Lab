-- penny_universe_pool: 누적형 페니 주식 유니버스 풀
-- 조건($0.01 < P ≤ 1.00)을 한 번이라도 충족한 종목을 누적하여
-- 다음 스캔 시 [랜덤 500개] + [기존 검증 풀 최대 100개] 믹스에 활용
CREATE TABLE IF NOT EXISTS penny_universe_pool (
    ticker          TEXT PRIMARY KEY,
    last_price      FLOAT NOT NULL,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scan_count      INTEGER NOT NULL DEFAULT 1
);

-- 최근 30일 이내에 관찰된 종목만 인덱스로 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_penny_pool_last_seen
    ON penny_universe_pool (last_seen_at DESC);

-- RLS: service role만 읽기/쓰기 허용 (anon 차단)
ALTER TABLE penny_universe_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON penny_universe_pool
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
