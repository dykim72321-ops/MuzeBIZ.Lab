export interface DiscoveryStock {
  ticker: string;
  dna_score: number;
  price: number | null;
  sector?: string;
  rsi?: number;
  macd?: number;
  macdDiff?: number;
  adx?: number;
  rvol?: number;
  change_percent?: number;
  changePercent?: number;
  rawAiSummary?: string;
  quant_metadata?: Record<string, unknown>;
  efficiency_ratio?: number;
  efficiencyRatio?: number;
  kelly_weight?: number;
  kellyWeight?: number;
  history?: { price: number; date: string }[];
  updated_at?: string;
  created_at?: string;
}

export interface PaperPosition {
  ticker: string;
  units: number;
  entry_price: number;
  current_price: number | null;
  trailing_stop: number;
  ts_threshold?: number;
  highest_price: number;
  status: string;
  is_penny?: boolean;
  created_at?: string;
  // computed on load
  unrealized_pl: number | null;
  unrealized_plpc: number | null;
  isPenny: boolean;
}

export interface PaperHistory {
  id: string;
  ticker: string;
  units: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  profit_amt?: number;
  exit_reason: string;
  is_penny?: boolean;
  created_at?: string;
  closed_at?: string;
  isPenny?: boolean;
}

export interface PaperAccount {
  cash: number;
  equity: number;
  cash_available?: number;
  total_assets?: number;
  total_invested: number;
  unrealized_pnl: number;
  realized_pnl: number;
}

export interface AlpacaAccount {
  buying_power: number;
  equity: number;
  today_pnl: number;
  today_pnl_pct: number;
  current_drawdown: number;
  currency: string;
  status: string;
}

// Matches StockTerminalModal's `data` prop interface
export interface TerminalData {
  ticker: string;
  dnaScore: number;
  popProbability?: number;
  bullPoints: string[];
  bearPoints: string[];
  riskLevel: string;
  formulaVerdict: string;
  price?: number;
  change?: string;
  kellyWeight?: number;
  efficiencyRatio?: number;
  targetPrice?: number;
  stopPrice?: number;
  quantData?: Record<string, unknown> | null;
  matchedLegend?: { ticker: string; similarity: number };
  quantSummary?: string;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  rsi?: number;
  macdDiff?: number;
  adx?: number;
  rvol?: number;
  changePercent?: number;
  history?: { price: number; date: string }[];
  buyPrice?: number;
  ohlcData?: { date: string; open: number; high: number; low: number; close: number }[];
}
