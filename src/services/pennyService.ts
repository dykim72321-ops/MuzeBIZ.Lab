import { fetchPaperPositions, fetchPaperHistory, fetchPaperAccount } from './pythonApiService';

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

}

/**
 * 페이퍼 트레이딩 포지션 조회 (기존 서비스 재사용)
 */
export { fetchPaperPositions, fetchPaperHistory, fetchPaperAccount };
