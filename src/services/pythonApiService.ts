/**
 * pythonApiService.ts — Python Engine API Service Layer (Refactored)
 *
 * 변경 사항:
 *   1. 모든 `any` 타입을 `src/types/api.ts`의 엄격한 인터페이스로 대체
 *   2. 기존 apiFetch / brokerApiFetch → `apiClient`로 통합 (Retry + Timeout 자동 적용)
 *   3. adminApiFetch는 Supabase Edge Proxy를 사용하므로 별도 유지
 *   4. 기존 export 시그니처는 100% 호환 유지 (breaking change 없음)
 */

import { supabase } from '../lib/supabase';
import { apiClient } from './apiClient';
import type {
  BrokerAccountResponse,
  BrokerStatusResponse,
  BrokerArmResponse,
  BrokerPositionRaw,
  ClosedTradeRaw,
  ClosePositionResponse,
  PaperSellResponse,
  ManualOrderRequest,
  ManualOrderResponse,
  AlpacaQuoteResponse,
  AlpacaBatchQuotesResponse,
  PennyScanStatusResponse,
  WebhookUpdateResponse,
  WebhookTestResponse,
  PaperAccountResponse,
  PaperPositionRaw,
  PaperHistoryRaw,
} from '../types/api';

// ─── Re-export Types (하위 호환) ─────────────────────────────────────────────

export type { PennyScanStatusResponse as PennyScanStatus } from '../types/api';

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
  recent_win_rate: number | null;
  baseline_win_rate: number | null;
  drift: number | null;
  recent_trades_count: number;
}

export interface StrategyReportBucket {
  period_label: string;
  win_rate: number;
  profit_factor: number;
  mdd: number;
  avg_pnl: number;
  total_trades: number;
  gross_profit: number;
  gross_loss: number;
}

export interface StrategyReportsResponse {
  period: 'week' | 'month';
  buckets: StrategyReportBucket[];
  message: string;
}

export interface BacktestRunParams {
  tickers?: string[];
  start_date?: string;
  end_date?: string;
  gamma?: number;
  delta?: number;
  lambda_val?: number;
  deviation_threshold?: number;
  target_atr?: number;
}

export interface BacktestResult {
  total_trades: number;
  win_rate: number;
  avg_pnl: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  mdd: number;
  recovery_days: number;
  avg_days: number;
  equity_curve?: { trade: number; value: number }[];
  is_empty?: boolean;
}

export type MacdStatus = 'golden' | 'dead' | 'rising' | 'falling';

export interface SimulateRequest {
  rsi: number;
  rvol: number;
  macd_status: MacdStatus;
  adx: number;
  di_positive: boolean;
  is_extended: boolean;
  is_penny: boolean;
  win_rate?: number;
  profit_ratio?: number;
  atr_pct?: number;
  entry_price?: number;
  highest_pct?: number;
}

export interface SimulateResponse {
  dna: {
    score: number;
    deltas: { base: number; rsi: number; macd: number; adx: number; rvol: number; ext: number };
    tier: string;
    tier_color: string;
    signal: string;
  };
  sizing: {
    ann_vol: number;
    vol_weight: number;
    kelly_f: number;
    optimal_kelly: number;
    final_weight: number;
    buy_budget_pct: number;
  };
  chandelier: {
    k: number;
    floor: number;
    ts_fixed: number;
    ts_chandelier: number;
    effective: number;
  };
  scale_out: {
    fires: boolean;
    rsi_trigger: boolean;
    profit_trigger: boolean;
    profit_ok: boolean;
    post_scale_ts: number;
    post_scale_ts_label: string;
  };
  constants: Record<string, number>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 기술적 지표 분석 요청
 */
export async function fetchTechnicalAnalysis(
  ticker: string,
  period: string = '1mo',
): Promise<TechnicalIndicators | null> {
  try {
    return await apiClient.post<TechnicalIndicators>('/api/analyze', { ticker, period });
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
  sortBy: 'updated_at' | 'performance' = 'updated_at',
): Promise<DiscoveryItem[]> {
  try {
    return await apiClient.get<DiscoveryItem[]>(`/api/discoveries?limit=${limit}&sort_by=${sortBy}`);
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
    const data = await adminApiFetch('/api/quant/scan', 'POST');
    return { success: true, message: (data.message as string) || 'Hunt triggered!' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Network error';
    console.error('[PythonAPI] Hunt trigger error:', error);
    return { success: false, message: msg };
  }
}

// ─── Broker API (X-Admin-Key 인증) ──────────────────────────────────────────

/**
 * 브로커 계좌 현황 조회
 */
export async function fetchBrokerAccount(): Promise<BrokerAccountResponse> {
  return apiClient.broker.get<BrokerAccountResponse>('/api/broker/account');
}

/**
 * 모든 포지션 청산 (Panic Sell)
 */
export async function liquidateAllPositions(confirm: boolean = true): Promise<ClosePositionResponse> {
  return apiClient.broker.post<ClosePositionResponse>('/api/broker/liquidate-all', { confirm });
}

/**
 * 브로커 및 시스템 상태 조회
 */
export async function fetchBrokerStatus(): Promise<BrokerStatusResponse> {
  return apiClient.broker.get<BrokerStatusResponse>('/api/broker/status');
}

/**
 * 페이퍼 트레이딩 계좌 현황 조회
 */
export async function fetchPaperAccount(): Promise<PaperAccountResponse> {
  return apiClient.broker.get<PaperAccountResponse>('/api/broker/paper/account');
}

/**
 * 페이퍼 트레이딩 현재 포지션 조회
 */
export async function fetchPaperPositions(): Promise<PaperPositionRaw[]> {
  const data = await apiClient.broker.get<PaperPositionRaw[]>('/api/broker/paper/positions');
  return Array.isArray(data) ? data : [];
}

/**
 * 페이퍼 트레이딩 매매 이력 조회
 */
export async function fetchPaperHistory(): Promise<PaperHistoryRaw[]> {
  const data = await apiClient.broker.get<PaperHistoryRaw[]>('/api/broker/paper/history');
  return Array.isArray(data) ? data : [];
}

/**
 * 브로커 오픈 포지션 조회
 */
export async function fetchBrokerPositions(): Promise<BrokerPositionRaw[]> {
  try {
    const data = await apiClient.broker.get<BrokerPositionRaw[]>('/api/broker/positions');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Positions fetch error:', error);
    return [];
  }
}

/**
 * 브로커 최근 주문 내역 조회
 */
export async function fetchBrokerOrders(limit: number = 50): Promise<ManualOrderResponse[]> {
  try {
    const data = await apiClient.broker.get<ManualOrderResponse[]>(`/api/broker/orders?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Orders fetch error:', error);
    return [];
  }
}

/**
 * 시스템 자동 매매 무장/해제
 */
export async function toggleSystemArm(arm: boolean): Promise<BrokerArmResponse> {
  return apiClient.broker.post<BrokerArmResponse>('/api/broker/arm', { arm });
}

/**
 * 수동 주문 실행
 */
export async function executeManualOrder(orderData: ManualOrderRequest): Promise<ManualOrderResponse> {
  return apiClient.broker.post<ManualOrderResponse>('/api/broker/order', orderData);
}

/**
 * 특정 포지션 청산
 */
export async function closePosition(ticker: string): Promise<ClosePositionResponse> {
  return apiClient.broker.post<ClosePositionResponse>('/api/broker/close-position', { ticker });
}

/**
 * Alpaca 실시간 단일 시세 조회
 */
export async function fetchAlpacaQuote(ticker: string): Promise<AlpacaQuoteResponse> {
  return apiClient.broker.get<AlpacaQuoteResponse>(`/api/broker/quote/${ticker.toUpperCase()}`);
}

/**
 * Alpaca 실시간 다중 시세 조회 (Batch)
 */
export async function fetchAlpacaQuotes(tickers: string[]): Promise<AlpacaBatchQuotesResponse> {
  return apiClient.broker.post<AlpacaBatchQuotesResponse>('/api/broker/quotes', {
    tickers: tickers.map((t) => t.toUpperCase()),
  });
}

/**
 * 페이퍼 트레이딩 포지션 수동 청산
 */
export async function sellPaperPosition(ticker: string): Promise<PaperSellResponse> {
  return apiClient.broker.post<PaperSellResponse>('/api/broker/paper/sell', { ticker });
}

/**
 * 청산 이력 단건 삭제
 */
export async function deletePaperHistory(historyId: string): Promise<{ status: string }> {
  return apiClient.broker.delete<{ status: string }>(`/api/broker/paper/history/${historyId}`);
}

/**
 * Alpaca 실계좌 체결 이력 조회 (FIFO PnL 매칭)
 */
export async function fetchClosedTrades(limit: number = 30): Promise<ClosedTradeRaw[]> {
  try {
    const data = await apiClient.broker.get<ClosedTradeRaw[]>(`/api/broker/paper/history?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Closed trades fetch error:', error);
    return [];
  }
}

/**
 * Alpaca 실제 포트폴리오 히스토리 조회
 */
export async function fetchPortfolioHistory(period: string = "all", timeframe: string = "1D"): Promise<unknown[]> {
  try {
    const data = await apiClient.broker.get<unknown[]>(`/api/broker/portfolio-history?period=${period}&timeframe=${timeframe}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[PythonAPI] Portfolio history fetch error:', error);
    return [];
  }
}

/**
 * Discord Webhook URL 저장 및 백엔드 메모리 즉시 반영
 */
export async function updateWebhookUrl(webhookUrl: string): Promise<WebhookUpdateResponse> {
  return apiClient.broker.post<WebhookUpdateResponse>('/api/settings/webhook', { webhook_url: webhookUrl });
}

/**
 * 저장된 Discord Webhook URL로 테스트 메시지 전송
 */
export async function testWebhook(): Promise<WebhookTestResponse> {
  return apiClient.broker.post<WebhookTestResponse>('/api/settings/webhook/test');
}

/**
 * RSI 역추세 전략 백테스팅 실행
 */
export async function fetchBacktestData(
  ticker: string,
  period: string = '1y',
): Promise<BacktestResult | null> {
  try {
    return await apiClient.post<BacktestResult>('/api/backtest', { ticker, period });
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
    return await apiClient.get<StrategyStats>('/api/strategy/stats');
  } catch (error) {
    console.error('[PythonAPI] Strategy stats error:', error);
    return null;
  }
}

/**
 * 일간/주간/월간 전략 성과 리포트 조회
 */
export async function fetchStrategyReports(period: 'day' | 'week' | 'month' = 'month'): Promise<StrategyReportsResponse | null> {
  try {
    return await apiClient.get<StrategyReportsResponse>(`/api/strategy/reports?period=${period}`);
  } catch (error) {
    console.error('[PythonAPI] Strategy reports error:', error);
    return null;
  }
}

export interface ChecklistItem {
  item_key: string;
  category: string;
  label: string;
  is_checked: boolean;
  checked_at: string | null;
  sort_order: number;
  is_automated?: boolean;
  auto_note?: string;
}

/**
 * 실계좌 전환 체크리스트 조회
 */
export async function fetchChecklist(): Promise<ChecklistItem[]> {
  try {
    return await apiClient.broker.get<ChecklistItem[]>('/api/checklist');
  } catch (error) {
    console.error('[PythonAPI] Checklist fetch error:', error);
    return [];
  }
}

/**
 * 실계좌 전환 체크리스트 항목 토글
 */
export async function toggleChecklistItem(itemKey: string): Promise<ChecklistItem> {
  return apiClient.broker.post<ChecklistItem>(`/api/checklist/${itemKey}/toggle`, {});
}

export type ImprovementStatus = 'COLLECTING' | 'ON_TRACK' | 'VERIFIED' | 'REGRESSED';

export interface ImprovementMetric {
  label: string;
  value: string;
}

export interface ImprovementItem {
  key: string;
  label: string;
  adopted_at: string;
  status: ImprovementStatus;
  progress_pct: number;
  metrics: ImprovementMetric[];
  note: string;
  /** REGRESSED가 연속 확정되어 파라미터가 자동으로 되돌려졌는지 (forward_return_logger는 항상 false) */
  auto_rollback_applied: boolean;
  /** 자동 롤백이 실제로 무엇을 바꿨는지 (auto_rollback_applied=false면 null) */
  auto_rollback_detail: string | null;
}

export interface ImprovementStatusResponse {
  generated_at: string;
  items: ImprovementItem[];
}

/**
 * 4대 개선 항목(Forward Return 로거/ATR 스탑/페니 게이트/Whipsaw) 검증 진행 현황
 */
export async function fetchImprovementStatus(): Promise<ImprovementStatusResponse | null> {
  try {
    return await apiClient.broker.get<ImprovementStatusResponse>('/api/checklist/improvements');
  } catch (error) {
    console.error('[PythonAPI] Improvement status error:', error);
    return null;
  }
}

export async function fetchPennyScanStatus(): Promise<PennyScanStatusResponse | null> {
  try {
    return await apiClient.get<PennyScanStatusResponse>('/api/quant/scan/status');
  } catch (error) {
    console.error('[PythonAPI] Penny scan status error:', error);
    return null;
  }
}

export async function runBacktest(params: BacktestRunParams): Promise<BacktestResult> {
  return apiClient.broker.post<BacktestResult>('/api/backtest/run', params);
}

export async function fetchSimulate(params: SimulateRequest): Promise<SimulateResponse | null> {
  try {
    return await apiClient.post<SimulateResponse>('/api/simulate', params);
  } catch (error) {
    console.error('[PythonAPI] Simulate error:', error);
    return null;
  }
}

// ─── Legacy Compatibility Exports ────────────────────────────────────────────
// 기존 코드에서 직접 import하던 함수들을 유지. 신규 코드에서는 apiClient를 직접 사용 권장.

/**
 * Admin API Fetch (Supabase Edge Function Proxy)
 */
export async function adminApiFetch(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: unknown = null,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke(`admin-proxy${endpoint}`, {
    method,
    body: body as Record<string, unknown>,
  });

  if (error) {
    console.error(`[PythonAPI] adminApiFetch Error (${endpoint}):`, error);
    throw new Error(error.message || `Edge Function Error: ${error}`);
  }

  return data as Record<string, unknown>;
}

/**
 * @deprecated — 하위 호환을 위해 남겨둠. 신규 코드에서는 `apiClient.get/post`를 사용하세요.
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: unknown = null,
): Promise<T> {
  if (method === 'GET') return apiClient.get<T>(endpoint);
  if (method === 'POST') return apiClient.post<T>(endpoint, body);
  if (method === 'PUT') return apiClient.put<T>(endpoint, body);
  return apiClient.delete<T>(endpoint);
}

/**
 * @deprecated — 하위 호환을 위해 남겨둠. 신규 코드에서는 `apiClient.broker.get/post`를 사용하세요.
 */
export async function brokerApiFetch<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: unknown = null,
): Promise<T> {
  if (method === 'GET') return apiClient.broker.get<T>(endpoint);
  if (method === 'POST') return apiClient.broker.post<T>(endpoint, body);
  if (method === 'PUT') return apiClient.broker.put<T>(endpoint, body);
  return apiClient.broker.delete<T>(endpoint);
}
