import { supabase } from '../lib/supabase';
import type { Stock } from '../types';

// Focused Penny Stock Watchlist
export const WATCHLIST_TICKERS = [
  'SNDL', 'MULN', 'IDEX', 'ZOM', 'FCEL', 'OCGN', 'BNGO', 'CTXR',
  'CLOV', 'BB', 'AMC', 'GME', 'NKLA', 'OPEN', 'LCID',
  'SOFI', 'PLTR', 'PLUG', 'FUBO', 'DKNG',
  'MARA', 'RIOT', 'HUT', 'BITF',
  'NIO', 'XPEV', 'GRAB', 'CPNG'
];

const cache = new Map<string, { data: Stock; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000;

// Finnhub API Key
const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

// Finnhub API fallback for real-time quotes
async function fetchFromFinnhub(ticker: string): Promise<Stock | null> {
  if (!FINNHUB_API_KEY) {
    console.warn('Finnhub API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();

    // Finnhub returns: c=current, d=change, dp=percent change, h=high, l=low, o=open, pc=previous close
    if (!data || data.c === 0 || data.c === undefined) {
      console.warn(`[Finnhub] No data for ${ticker}`);
      return null;
    }

    const stock: Stock = {
      id: ticker,
      ticker: ticker,
      name: getCompanyName(ticker),
      price: data.c,
      changePercent: data.dp || 0,
      volume: 0, // Finnhub quote doesn't include volume, would need separate call
      marketCap: 'N/A',
      dnaScore: calculateDnaScore(data.c, data.dp || 0, 0),
      sector: getSector(ticker),
      description: '',
      relevantMetrics: {
        debtToEquity: 0,
        rndRatio: 0,
        sentimentScore: 0,
        institutionalOwnership: 0,
      }
    };

    console.log(`[Finnhub] Successfully fetched ${ticker}: $${data.c}`);

    // Cache the result
    cache.set(ticker, { data: stock, timestamp: Date.now() });

    return stock;
  } catch (err) {
    console.error(`[Finnhub] Failed for ${ticker}:`, err);
    return null;
  }
}

// Yahoo Finance API fallback (via Edge Function) - provides richer data
async function fetchFromYahoo(ticker: string): Promise<Stock | null> {
  try {
    const { data, error } = await supabase.functions.invoke('get-yahoo-quote', {
      body: { ticker }
    });

    if (error || !data || data.error) {
      console.warn(`[Yahoo] Failed for ${ticker}:`, error || data?.error);
      return null;
    }

    // Calculate enhanced DNA score using Yahoo data
    let dnaScore = calculateDnaScore(data.price, data.changePercent, data.volume);

    // Boost score based on analyst recommendations
    if (data.recommendationScore >= 4) dnaScore += 15; // Buy/Strong Buy
    else if (data.recommendationScore === 3) dnaScore += 5; // Hold

    // Boost if near 52-week low (potential upside)
    if (data.fiftyTwoWeekPosition < 30) dnaScore += 10;

    // Boost if significant upside potential
    if (data.upsidePotential > 50) dnaScore += 10;
    else if (data.upsidePotential > 20) dnaScore += 5;

    dnaScore = Math.min(100, Math.max(0, dnaScore));

    const stock: Stock = {
      id: ticker,
      ticker: ticker,
      name: getCompanyName(ticker),
      price: data.price,
      changePercent: data.changePercent,
      volume: data.volume,
      marketCap: formatMarketCap(data.marketCap),
      dnaScore: dnaScore,
      sector: getSector(ticker),
      description: '',
      relevantMetrics: {
        debtToEquity: 0,
        rndRatio: 0,
        sentimentScore: data.recommendationScore * 20, // Convert 0-5 to 0-100
        institutionalOwnership: 0,
        // Extended Yahoo data
        targetPrice: data.targetMeanPrice,
        upsidePotential: data.upsidePotential,
        fiftyTwoWeekPosition: data.fiftyTwoWeekPosition,
        analystCount: data.numberOfAnalystOpinions,
        recommendation: data.recommendationKey,
      }
    };

    console.log(`[Yahoo] Successfully fetched ${ticker}: $${data.price} (Target: $${data.targetMeanPrice})`);

    // Cache the result
    cache.set(ticker, { data: stock, timestamp: Date.now() });

    return stock;
  } catch (err) {
    console.error(`[Yahoo] Failed for ${ticker}:`, err);
    return null;
  }
}

// Helper to format market cap
function formatMarketCap(value: number): string {
  if (!value || value === 0) return 'N/A';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

export async function fetchStockQuote(ticker: string): Promise<Stock | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Use new unified smart-quote endpoint
    const { data, error } = await supabase.functions.invoke('smart-quote', {
      body: { ticker, includeFinancials: false }
    });

    if (error) {
      console.warn(`[SmartQuote] Error for ${ticker}:`, error);
      // Fallback to direct Finnhub
      const finnhubData = await fetchFromFinnhub(ticker);
      if (finnhubData) return finnhubData;

      // Fallback to Yahoo
      const yahooData = await fetchFromYahoo(ticker);
      if (yahooData) return yahooData;

      // Fallback to stale cache
      if (cached) return cached.data;
      return null;
    }

    if (!data || data.price <= 0) {
      console.warn(`[SmartQuote] No valid price for ${ticker}`);
      // Try direct APIs as fallback
      const finnhubData = await fetchFromFinnhub(ticker);
      if (finnhubData && finnhubData.price > 0) return finnhubData;
      return null;
    }

    const stock: Stock = {
      id: ticker,
      ticker: ticker,
      name: getCompanyName(ticker),
      price: data.price,
      changePercent: data.changePercent || 0,
      volume: data.volume || 0,
      marketCap: formatMarketCap(data.marketCap),
      dnaScore: data.dnaScore || calculateDnaScore(data.price, data.changePercent, data.volume),
      sector: getSector(ticker),
      description: getDescription(ticker),
      relevantMetrics: {
        debtToEquity: 0,
        rndRatio: 0,
        sentimentScore: 0,
        institutionalOwnership: 0,
        targetPrice: data.targetPrice,
        upsidePotential: data.upsidePotential,
        recommendation: data.recommendation,
        numberOfAnalysts: data.numberOfAnalysts,
        // 🆕 Momentum Indicators
        averageVolume10d: data.averageVolume10d,
        relativeVolume: data.relativeVolume,
      },
      newsHeadlines: data.newsHeadlines || [],
    };

    // Log source information
    console.log(`[SmartQuote] ${ticker}: $${data.price} (Sources: ${JSON.stringify(data.sources)})`);

    cache.set(ticker, { data: stock, timestamp: Date.now() });
    return stock;

  } catch (err) {
    console.error(`[SmartQuote] Failed for ${ticker}:`, err);

    // Final fallback chain
    const finnhubData = await fetchFromFinnhub(ticker);
    if (finnhubData) return finnhubData;

    if (cached) return cached.data;
    return null;
  }
}

export async function fetchMultipleStocks(tickers: string[]): Promise<Stock[]> {
  // Sequential execution to prevent Yahoo rate limiting / race conditions
  const results: Stock[] = [];
  for (const ticker of tickers) {
    const stock = await fetchStockQuote(ticker);
    if (stock) results.push(stock);
    // Small delay between requests to be gentle on APIs
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return results;
}

export async function getTopStocks(historical: boolean = false): Promise<Stock[]> {
  try {
    // 1. 데이터 조회 (historical이면 시간 제한 해제)
    let query = supabase
      .from('daily_discovery')
      .select('*, stock_analysis_cache(analysis)');
    
    if (!historical) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('updated_at', twentyFourHoursAgo);
    }

    const { data: discoveryData, error: discoveryError } = await query
      .order('updated_at', { ascending: false })
      .limit(historical ? 100 : 30);


    if (discoveryError) throw discoveryError;

    const tickersToSync = (discoveryData && discoveryData.length > 0)
      ? discoveryData.map((item: any) => item.ticker)
      : WATCHLIST_TICKERS.slice(0, 10);

    const { data: realTimeData, error: syncError } = await supabase.functions.invoke('get-market-scanner', {
      body: { tickers: tickersToSync }
    });

    if (syncError) throw syncError;
    if (!realTimeData) return [];

    const stocks: Stock[] = realTimeData.map((rtItem: any) => {
      const discoveryInfo = discoveryData?.find(d => d.ticker === rtItem.ticker);
      const price = rtItem.price || 0;
      const changePercent = rtItem.changePercent || 0;
      const volume = rtItem.rawVolume || 0;

      return {
        id: rtItem.ticker,
        ticker: rtItem.ticker,
        name: discoveryInfo?.name || getCompanyName(rtItem.ticker),
        price,
        changePercent,
        volume,
        marketCap: discoveryInfo?.market_cap || 'N/A',
        dnaScore: calculateDnaScore(price, changePercent, volume),
        sector: discoveryInfo?.sector || getSector(rtItem.ticker),
        description: discoveryInfo?.description || getDescription(rtItem.ticker),
        relevantMetrics: {
          sentimentScore: discoveryInfo?.sentiment_score || 0,
          institutionalOwnership: discoveryInfo?.institutional_ownership || 0,
        },
        stock_analysis_cache: discoveryInfo?.stock_analysis_cache,
        rawAiSummary: discoveryInfo?.ai_summary
      };
    });

    // 2. 섹터별 그룹화 및 다양성 적용
    const bySector = stocks.reduce((acc, stock) => {
      const sector = stock.sector || 'Unknown';
      if (!acc[sector]) acc[sector] = [];
      acc[sector].push(stock);
      return acc;
    }, {} as Record<string, Stock[]>);

    // 3. 각 섹터에서 최대 3개씩 선택하여 다양성 확보
    const diverseStocks = Object.values(bySector)
      .flatMap(sectorStocks =>
        sectorStocks
          .sort((a, b) => b.dnaScore - a.dnaScore)
          .slice(0, 3)
      )
      .sort((a, b) => b.dnaScore - a.dnaScore)
      .slice(0, 30);

    return diverseStocks;
  } catch (err) {
    console.warn('Real-time sync failed, falling back to cache:', err);
    return fetchMultipleStocks(WATCHLIST_TICKERS.slice(0, 5));
  }
}

function calculateDnaScore(price: number, change: number, volume: number): number {
  let score = 50;
  if (price < 1.0) score += 30;
  else if (price < 3.0) score += 20;
  if (change > 15) score += 20;
  else if (change > 5) score += 10;
  if (volume > 10000000) score += 20;
  return Math.min(100, Math.max(0, score));
}

// ... (Keep existing helper functions getCompanyName, getSector, getDescription at the bottom)
export function getCompanyName(ticker: string): string {
  const names: Record<string, string> = {
    SNDL: 'Sundial Growers', CLOV: 'Clover Health', SOFI: 'SoFi Technologies',
    PLTR: 'Palantir Technologies', BB: 'BlackBerry Limited', MULN: 'Mullen Automotive'
  };
  return names[ticker] || ticker;
}

export function getSector(ticker: string | any): string {
  if (typeof ticker === 'object' && ticker !== null) return ticker.sector || 'Tech/Growth';
  const sectors: Record<string, string> = { SNDL: 'Cannabis', CLOV: 'Healthcare', SOFI: 'Fintech' };
  return sectors[ticker] || 'Tech/Growth';
}

function getDescription(ticker: string): string {
  const descriptions: Record<string, string> = { SNDL: 'Cannabis company', CLOV: 'Healthcare AI' };
  return descriptions[ticker] || 'High-growth potential stock.';
}
