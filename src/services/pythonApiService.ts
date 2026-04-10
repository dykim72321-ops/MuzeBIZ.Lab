import { supabase } from '../lib/supabase';

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
    return await apiFetch('/api/analyze', 'POST', { ticker, period });
  } catch (error) {
    console.error(`[PythonAPI] Analyze error for ${ticker}:`, error);
    return null;
  }
}

/**
 * 최근 발견 종목 조회
 */
export async function fetchDiscoveries(
  limit: number = 10,
  sortBy: 'updated_at' | 'performance' = 'updated_at'
): Promise<DiscoveryItem[]> {
  try {
    return await apiFetch(`/api/discoveries?limit=${limit}&sort_by=${sortBy}`);
  } catch (error) {
    console.error('[PythonAPI] Discoveries error:', error);
    return [];
  }
}

/**
 * 수동 수집 트리거 (관리자 전용 - Edge Proxy 사용)
 */
export async function triggerHunt(): Promise<{ success: boolean; message: string }> {
  try {
    const data = await adminApiFetch('/api/hunt', 'POST');
    return { success: true, message: data.message || 'Hunt triggered!' };
  } catch (error: any) {
    console.error('[PythonAPI] Hunt trigger error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

/**
 * Broker API Direct Fetch — Vite 프록시(/py-api)를 통해 FastAPI에 직접 호출.
 * X-Admin-Key 헤더를 포함하여 인증을 처리합니다.
 */
export async function brokerApiFetch(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: any = null
): Promise<any> {
  const adminKey = import.meta.env.VITE_ADMIN_SECRET_KEY;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(adminKey ? { 'X-Admin-Key': adminKey } : {}),
    },
  };
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${PY_API_BASE}${endpoint}`, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP Error: ${response.status}`);
  }
  return await response.json();
}

/**
 * 브로커 계좌 현황 조회
 */
export async function fetchBrokerAccount(): Promise<any> {
  return brokerApiFetch('/api/broker/account');
}

/**
 * 모든 포지션 청산 (Panic Sell)
 */
export async function liquidateAllPositions(confirm: boolean = true): Promise<any> {
  return brokerApiFetch('/api/broker/liquidate-all', 'POST', { confirm });
}

/**
 * 브로커 및 시스템 상태 조회
 */
export async function fetchBrokerStatus(): Promise<any> {
  return brokerApiFetch('/api/broker/status');
}

/**
 * 페이퍼 트레이딩 계좌 현황 조회
 */
export async function fetchPaperAccount(): Promise<any> {
  return brokerApiFetch('/api/broker/paper/account');
}

/**
 * 페이퍼 트레이딩 현재 포지션 조회
 */
export async function fetchPaperPositions(): Promise<any[]> {
  try {
    const data = await brokerApiFetch('/api/broker/paper/positions');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Paper positions fetch error:', error);
    return [];
  }
}

/**
 * 페이퍼 트레이딩 매매 이력 조회
 */
export async function fetchPaperHistory(): Promise<any[]> {
  try {
    const data = await brokerApiFetch('/api/broker/paper/history');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Paper history fetch error:', error);
    return [];
  }
}

/**
 * 브로커 오픈 포지션 조회
 */
export async function fetchBrokerPositions(): Promise<any[]> {
  try {
    const data = await brokerApiFetch('/api/broker/positions');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Positions fetch error:', error);
    return [];
  }
}

/**
 * 브로커 최근 주문 내역 조회
 */
export async function fetchBrokerOrders(limit: number = 50): Promise<any[]> {
  try {
    const data = await brokerApiFetch(`/api/broker/orders?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Orders fetch error:', error);
    return [];
  }
}

/**
 * 시스템 자동 매매 무장/해제
 */
export async function toggleSystemArm(arm: boolean): Promise<any> {
  return brokerApiFetch('/api/broker/arm', 'POST', { arm });
}

/**
 * 수동 주문 실행
 */
export async function executeManualOrder(orderData: {
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  type?: 'market' | 'limit';
  price?: number;
}): Promise<any> {
  return brokerApiFetch('/api/broker/order', 'POST', orderData);
}

/**
 * 특정 포지션 청산
 */
export async function closePosition(ticker: string): Promise<any> {
  return brokerApiFetch('/api/broker/close-position', 'POST', { ticker });
}

/**
 * RSI 역추세 전략 백테스팅 실행
 */
export async function fetchBacktestData(
  ticker: string,
  period: string = '1y'
): Promise<any | null> {
  try {
    return await apiFetch('/api/backtest', 'POST', { ticker, period });
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
    return await apiFetch('/api/strategy/stats');
  } catch (error) {
    console.error('[PythonAPI] Strategy stats error:', error);
    return null;
  }
}

/**
 * [NEW] Admin API Fetch Utility
 * Supabase Edge Function Proxy를 통해 Python Engine 호출
 */
export async function adminApiFetch(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: any = null
): Promise<any> {
  const { data, error } = await supabase.functions.invoke(`admin-proxy${endpoint}`, {
    method,
    body,
  });

  if (error) {
    console.error(`[PythonAPI] adminApiFetch Error (${endpoint}):`, error);
    throw new Error(error.message || `Edge Function Error: ${error}`);
  }

  return data;
}

/**
 * Generic API Fetch Utility (Public/Non-Admin)
 */
export async function apiFetch(
  endpoint: string, 
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
  body: any = null
): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${PY_API_BASE}${endpoint}`, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`[PythonAPI] apiFetch Error (${endpoint}):`, error);
    throw error;
  }
}
