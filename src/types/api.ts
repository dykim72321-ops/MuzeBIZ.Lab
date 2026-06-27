/**
 * api.ts — Backend API Response Contracts
 *
 * pythonApiService.ts 및 프론트엔드 전역에서 사용하던 `any` 타입을 대체하는
 * 엄격한 TypeScript 인터페이스 정의.
 *
 * 규칙:
 *   1. 백엔드(Python FastAPI) 엔드포인트 응답 스키마와 1:1 매핑
 *   2. snake_case(백엔드) → camelCase(프론트엔드) 변환은 서비스 레이어에서 수행
 *   3. 모든 숫자 필드는 `number`로 명시 (JSON에서는 string으로 올 수 있으므로 서비스에서 Number() 변환)
 */

// ─── Broker / Alpaca Responses ───────────────────────────────────────────────

/** GET /api/broker/account */
export interface BrokerAccountResponse {
  buying_power: number;
  equity: number;
  today_pnl: number;
  today_pnl_pct: number;
  current_drawdown: number;
  currency: string;
  status: string;
  error?: string;
}

/** GET /api/broker/status */
export interface BrokerStatusResponse {
  is_armed: boolean;
  mode: string;
  market_open: boolean;
  active_positions: number;
  paper_engine_status?: string;
}

/** POST /api/broker/arm */
export interface BrokerArmResponse {
  status: 'success' | 'error';
  is_armed: boolean;
  message?: string;
}

/** GET /api/broker/positions — single item */
export interface BrokerPositionRaw {
  ticker: string;
  quantity: number | string;
  entry_price: number | string;
  current_price: number | string;
  market_value?: number | string;
  unrealized_pl?: number | string;
  unrealized_plpc?: number | string;
  side?: string;
}

/** GET /api/broker/closed-trades — single item */
export interface ClosedTradeRaw {
  id: string;
  ticker: string;
  units: number | string;
  entry_price: number | string;
  exit_price: number | string;
  profit_amt: number | string;
  pnl_pct: number | string;
  exit_reason?: string;
  created_at?: string;
}

/** POST /api/broker/close-position */
export interface ClosePositionResponse {
  status?: 'success' | 'error';
  symbol?: string;
  id?: string;
  error?: string;
}

/** POST /api/broker/order */
export interface ManualOrderRequest {
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  type?: 'market' | 'limit';
  price?: number;
}

export interface ManualOrderResponse {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  status: string;
  filled_avg_price?: number;
  error?: string;
}

/** GET /api/broker/quote/:ticker */
export interface AlpacaQuoteResponse {
  ticker: string;
  bid_price: number;
  ask_price: number;
  last_price: number;
  volume: number;
  timestamp: string;
}

/** POST /api/broker/quotes (batch) */
export interface AlpacaBatchQuotesResponse {
  [ticker: string]: AlpacaQuoteResponse;
}

// ─── Penny Scan ──────────────────────────────────────────────────────────────

/** GET /api/penny/scan/status — re-exported for clarity (also in pythonApiService) */
export interface PennyScanStatusResponse {
  last_scan_at: string | null;
  cached_results: number;
  next_scan_in_seconds: number | null;
  auto_scan_active: boolean;
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** POST /api/settings/webhook */
export interface WebhookUpdateResponse {
  status: 'success' | 'error';
  message?: string;
}

/** POST /api/settings/webhook/test */
export interface WebhookTestResponse {
  status: 'success' | 'error';
  message?: string;
}

// ─── Paper Trading ───────────────────────────────────────────────────────────

/** GET /api/broker/paper/account */
export interface PaperAccountResponse {
  cash_available: number;
  total_assets: number;
  invested_capital: number;
  today_pnl: number;
  today_pnl_pct: number;
  total_pnl: number;
  total_pnl_pct: number;
  current_drawdown: number;
  currency: string;
}

/** GET /api/broker/paper/positions — single item */
export interface PaperPositionRaw {
  ticker: string;
  units: number | string;
  entry_price: number | string;
  current_price?: number | string | null;
  trailing_stop?: number | string;
  ts_threshold?: number | string;
  highest_price?: number | string;
  status: string;
  is_penny?: boolean;
  created_at?: string;
}

/** GET /api/broker/paper/history — single item */
export interface PaperHistoryRaw {
  id: string;
  ticker: string;
  units: number | string;
  entry_price: number | string;
  exit_price: number | string;
  pnl: number | string;
  pnl_pct: number | string;
  profit_amt?: number | string;
  exit_reason?: string;
  is_penny?: boolean;
  created_at?: string;
  closed_at?: string;
}

// ─── Generic API Error ───────────────────────────────────────────────────────

export interface ApiErrorDetail {
  detail: string;
  status_code?: number;
}
