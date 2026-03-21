/**
 * Python API Service
 * 통합 파이썬 엔진과 통신하는 서비스 모듈
 */

const PY_API_BASE = '/py-api';

export interface TechnicalIndicators {
  ticker: string;
  period: string;
  current_price: number;
  rsi_14: number | null;
  sma_20: number | null;
  sma_50: number | null;
  ema_12: number | null;
  ema_26: number | null;
  macd: number | null;
  macd_signal: number | null;
  signal: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
}

export interface DiscoveryItem {
  id: number;
  ticker: string;
  sector: string;
  price: number;
  volume: string;
  change: string;
  dna_score: number;
  ai_summary: string;
  pop_probability?: number;
  risk_level?: string;
  matched_legend_ticker?: string;
  legend_similarity?: number;
  bull_case?: string[];
  bear_case?: string[];
  backtest_return: number | null;
  updated_at: string;
  created_at: string;
}

export interface StrategyStats {
  win_rate: number;
  profit_factor: number;
  mdd: number;
  recovery_days: number;
  avg_pnl: number;
  total_trades: number;
}

/**
 * 기술적 지표 분석 요청
 */
export async function fetchTechnicalAnalysis(
  ticker: string,
  period: string = '1mo'
): Promise<TechnicalIndicators | null> {
  try {
    const response = await fetch(`${PY_API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, period }),
    });

    if (!response.ok) {
      console.warn(`[PythonAPI] Analyze failed for ${ticker}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`[PythonAPI] Analyze error for ${ticker}:`, error);
    return null;
  }
}

/**
 * 최근 발견 종목 조회
 * @param limit 조회 개수
 * @param sortBy 정렬 기준: 'updated_at' (최신순) 또는 'performance' (수익률순)
 */
export async function fetchDiscoveries(
  limit: number = 10,
  sortBy: 'updated_at' | 'performance' = 'updated_at'
): Promise<DiscoveryItem[]> {
  try {
    const response = await fetch(`${PY_API_BASE}/api/discoveries?limit=${limit}&sort_by=${sortBy}`);

    if (!response.ok) {
      console.warn(`[PythonAPI] Discoveries fetch failed: ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('[PythonAPI] Discoveries error:', error);
    return [];
  }
}

/**
 * 수동 수집 트리거 (관리자 전용)
 */
export async function triggerHunt(adminKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${PY_API_BASE}/api/hunt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errorData.detail || `Error: ${response.status}`,
      };
    }

    const data = await response.json();
    return { success: true, message: data.message || 'Hunt triggered!' };
  } catch (error) {
    console.error('[PythonAPI] Hunt trigger error:', error);
    return { success: false, message: 'Network error' };
  }
}
/**
 * RSI 역추세 전략 백테스팅 실행
 */
export async function fetchBacktestData(
  ticker: string,
  period: string = '1y'
): Promise<any | null> {
  try {
    const response = await fetch(`${PY_API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, period }),
    });

    if (!response.ok) {
      console.warn(`[PythonAPI] Backtest failed for ${ticker}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`[PythonAPI] Backtest error for ${ticker}:`, error);
    return null;
  }
}

/**
 * 전략 통계 데이터 조회
 */
export async function fetchStrategyStats(): Promise<StrategyStats | null> {
  try {
    const response = await fetch(`${PY_API_BASE}/api/strategy/stats`);

    if (!response.ok) {
      console.warn(`[PythonAPI] Strategy stats fetch failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[PythonAPI] Strategy stats error:', error);
    return null;
  }
}
