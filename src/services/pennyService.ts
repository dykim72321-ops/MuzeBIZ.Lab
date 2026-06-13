import { brokerApiFetch, fetchPaperPositions, fetchPaperHistory, fetchPaperAccount } from './pythonApiService';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PennyScanResult {
  ticker: string;
  price: number;
  change_pct: number;
  volume: number;
  dna_score: number;
  rsi: number;
  macd_diff: number;
  adx: number;
  rvol: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: 'STRONG' | 'NORMAL';
  is_extended: boolean;
  rank: number;
  is_top: boolean;
  is_watchlisted?: boolean;
}

export interface PennyParams {
  max_price: number;
  data_lookback: string;
  trailing_stop_pct: number;
  breakeven_trigger_pct: number;
  scale_out_rsi: number;
  scale_out_profit_pct: number;
  tight_ts_pct: number;
  rvol_min: number;
}

export interface PennyScanResponse {
  scanned_at: string;
  total_scanned: number;
  penny_params: PennyParams;
  results: PennyScanResult[];
  auto_registered: string[];
}

// ── API Functions ──────────────────────────────────────────────────────────

/**
 * $1 이하 페니 주식 퀀트 스캔 실행
 * 2개월 일봉 기반 RSI/MACD/ADX/RVOL → DNA 점수 → Top N 자동 watchlist 등록
 */
export async function scanPennyStocks(
  maxPrice: number = 1.0,
  topN: number = 3
): Promise<PennyScanResponse> {
  return brokerApiFetch('/api/penny/scan', 'POST', {
    max_price: maxPrice,
    top_n: topN,
  });
}

/**
 * 페이퍼 트레이딩 포지션 조회 (기존 서비스 재사용)
 */
export { fetchPaperPositions, fetchPaperHistory, fetchPaperAccount };
