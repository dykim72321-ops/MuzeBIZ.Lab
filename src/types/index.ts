export interface Stock {
  id: string;
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  marketCap: string;
  dnaScore: number;
  sector: string;
  description: string;
  relevantMetrics: {
    debtToEquity: number;
    rndRatio: number; // R&D as % of Revenue
    revenueGrowth?: number;
    // New Fundamentals
    peRatio?: number;
    eps?: number;
    revenue?: number; // Latest Annual Revenue
    grossProfit?: number; // Latest Annual Gross Profit
    operatingMargin?: number;
    sentimentScore?: number; // -1 to 1 (Bearish to Bullish)
    sentimentLabel?: string;
    institutionalOwnership?: number; // Percentage held by institutions
    topInstitution?: string; // Name of top institutional holder
    // Financial Health (v2)
    cashRunway?: number; // Months of runway
    netIncome?: string; // Formatted net income
    totalCash?: string; // Formatted total cash
    // Yahoo Finance Extended Data
    targetPrice?: number; // Analyst target mean price
    upsidePotential?: number; // % upside to target
    fiftyTwoWeekPosition?: number; // 0-100 position in 52-week range
    analystCount?: number; // Number of analyst opinions
    numberOfAnalysts?: number; // Alias for analystCount
    recommendation?: string; // strongBuy, buy, hold, sell, strongSell
    // 🆕 Momentum Indicators (Phase 1)
    averageVolume10d?: number; // 10-day average volume
    relativeVolume?: number; // Current volume / Avg volume (key momentum signal)
  };
  news?: { title: string; url: string; time_published: string }[];
  newsHeadlines?: string[]; // 🆕 Google News headlines
  stock_analysis_cache?: { analysis: any }[]; // 🆕 AI Analysis Cache for deep-dives
  rawAiSummary?: string; // Fallback text from daily_discovery
  history?: HistoricalDataPoint[];
}

export interface HistoricalDataPoint {
  date: string;
  price: number;
}

export interface Benchmark {
  id: string;
  name: string;
  period: string;
  description: string;
  historicalData: HistoricalDataPoint[];
}

export interface AnalysisReport {
  stockId: string;
  summary: string;
  bullCase: string[];
  bearCase: string[];
  matchReasoning: string;
  dnaScore: number;
  financialHealthAudit?: string;
  marketTrendAnalysis?: string;
}
