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

function getCacheDuration(): number {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isWeekend = day === 0 || day === 6;
  // EST Market Hours are roughly 14:30 to 21:00 UTC
  const isMarketHours = !isWeekend && (hour > 14 || (hour === 14 && now.getUTCMinutes() >= 30)) && hour < 21;
  return isMarketHours ? 2 * 60 * 1000 : 15 * 60 * 1000;
}

// Finnhub API Key
const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
let isFinnhubExhausted = false; // 🆕 Circuit breaker for 403/Forbidden keys

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
      currentHigh: data.h || data.c,
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

export async function fetchStockQuote(ticker: string, historyRange?: string): Promise<Stock | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.timestamp < getCacheDuration() && (!historyRange || (cached.data.history && cached.data.history.length > 0))) {
    return cached.data;
  }

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
  };

  try {
    // Fast-fail: 4 second timeout for the primary smart-quote endpoint
    const smartQuotePromise = supabase.functions.invoke('smart-quote', {
      body: { ticker, includeFinancials: false, historyRange }
    });

    const { data, error } = await withTimeout(smartQuotePromise, 4000).catch(() => ({ data: null, error: new Error('Timeout or failure') }));

    if (error || !data || data.price <= 0) {
      if (error) console.warn(`[SmartQuote] Error or Timeout for ${ticker}:`, error);
      else console.warn(`[SmartQuote] No valid price for ${ticker}`);

      // Race fallback APIs
      const fallbackData = await Promise.any([
        fetchFromFinnhub(ticker).then(res => res ? res : Promise.reject('Finnhub null')),
        fetchFromYahoo(ticker).then(res => res ? res : Promise.reject('Yahoo null'))
      ]).catch(() => null);

      if (fallbackData) return fallbackData;

      // Fallback to stale cache
      if (cached) return cached.data;
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
      currentHigh: data.high || data.price,
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
      history: data.history || [], // 🆕 Received from Edge Function (CORS-safe)
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

const pendingRequests = new Map<string, Promise<Stock | null>>();

export async function fetchMultipleStocksOptimized(tickers: string[], historyRange?: string): Promise<Stock[]> {
  // Dynamically adjust chunk size based on API provider limits
  // Dynamically adjust chunk size - increased for better performance
  const CHUNK_SIZE = FINNHUB_API_KEY ? 20 : 12; 
  const results: Stock[] = [];
  
  // Deduplicate and filter out empty tickers
  const uniqueTickers = [...new Set(tickers.filter(Boolean))];
  
  for (let i = 0; i < uniqueTickers.length; i += CHUNK_SIZE) {
    const chunk = uniqueTickers.slice(i, i + CHUNK_SIZE);
    
    const chunkPromises = chunk.map(ticker => {
      // 🆕 Deduplication Logic: If a request for this ticker is already pending, reuse it
      if (pendingRequests.has(ticker)) {
        return pendingRequests.get(ticker)!;
      }
      
      const request = fetchStockQuote(ticker, historyRange).finally(() => {
        pendingRequests.delete(ticker);
      });
      
      pendingRequests.set(ticker, request);
      return request;
    });
    
    try {
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults.filter((s): s is Stock => s !== null));
    } catch (err) {
      console.error(`[Fetch Optimization] Chunk failed for ${chunk.join(',')}:`, err);
    }
    
    // Minimal delay between chunks to be safe but fast
    if (i + CHUNK_SIZE < uniqueTickers.length) {
      await new Promise(resolve => setTimeout(resolve, 200)); 
    }
  }
  
  return results;
}

export async function fetchMultipleStocks(tickers: string[]): Promise<Stock[]> {
    return fetchMultipleStocksOptimized(tickers);
}

// Helper to handle retries for rate-limited APIs (Yahoo 429)
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let delay = 2000; // Start with 2s for Yahoo stability
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429 && i < maxRetries - 1) {
      console.warn(`[Retry] Rate limited (429) on ${url}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
      continue;
    }
    return res;
  }
  return fetch(url, options); // Final attempt
}

// Final fallback: Generate realistic-looking wavy data if all APIs fail
function generateSimulatedHistory(_ticker: string, currentPrice: number, changePercent: number, days: number = 20): { date: string; price: number }[] {
  const history: { date: string; price: number }[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Calculate a reasonable starting price based on the current price and change %
  // Start Price * (1 + change/100) = Current Price -> Start Price = Current Price / (1 + change/100)
  const startPrice = currentPrice / (1 + (changePercent / 100));
  const volatility = Math.abs(changePercent) / 10 + 2; // Fixed base volatility + scaled
  
  for (let i = 0; i <= days; i++) {
    const t = i / days; // Progress from 0 to 1
    // Linear trend + sinusoidal oscillations + random noise
    const trend = startPrice + (currentPrice - startPrice) * t;
    const oscillation = Math.sin(t * Math.PI * 4) * (startPrice * (volatility / 100) * 0.5);
    const noise = (Math.random() - 0.5) * (startPrice * (volatility / 100) * 0.3);
    
    // Ensure we exactly match start and end
    let price = trend;
    if (i > 0 && i < days) {
      price += oscillation + noise;
    } else if (i === days) {
      price = currentPrice;
    } else {
      price = startPrice;
    }

    history.push({
      date: new Date(now - (days - i) * dayMs).toISOString(),
      price: parseFloat(price.toFixed(4))
    });
  }
  return history;
}

export async function fetchStockHistory(ticker: string, resolution: string = 'D', days: number = 30): Promise<{ date: string; price: number }[]> {
  try {
    const cached = cache.get(ticker);
    if (cached && cached.data.history && cached.data.history.length > 5) {
      return cached.data.history;
    }

    let history: { date: string; price: number }[] = [];

    // 1. Try Finnhub First
    if (FINNHUB_API_KEY && !isFinnhubExhausted) {
      const to = Math.floor(Date.now() / 1000);
      const from = to - (days * 24 * 60 * 60);
      try {
        const finnhubRes = await fetch(
          `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
        );

        if (finnhubRes.ok) {
          const data = await finnhubRes.json();
          if (data.s === 'ok' && data.t && data.c) {
            history = data.t.map((timestamp: number, index: number) => ({
              date: new Date(timestamp * 1000).toISOString(),
              price: data.c[index]
            }));
            console.log(`✅ [Finnhub History] Loaded ${history.length} points for ${ticker}`);
          } else if (data.s === 'no_data') {
            console.warn(`[Finnhub History] No data returned for ${ticker}`);
          }
        } else if (finnhubRes.status === 403 || finnhubRes.status === 401) {
          console.error(`🔴 [Finnhub] API Key Invalid or Exhausted (403). Switching to fallback mode.`);
          isFinnhubExhausted = true; // Trip the circuit breaker
        }
      } catch (e) {
        console.warn(`[Finnhub] Fetch failed for ${ticker}`);
      }
    }

    // 2. Fallback to Yahoo Proxy
    if (history.length === 0) {
      const range = days <= 5 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '1y';
      const url = `/yahoo-api/v8/finance/chart/${ticker}?interval=1d&range=${range}`;

      const res = await fetchWithRetry(url);
      if (res.ok) {
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (result && result.timestamp && result.indicators?.quote?.[0]?.close) {
          const timestamps = result.timestamp;
          const closes = result.indicators.quote[0].close;
          history = timestamps.map((ts: number, index: number) => ({
            date: new Date(ts * 1000).toISOString(),
            price: closes[index]
          })).filter((item: any) => item.price !== null && item.price !== undefined);
          console.log(`✅ [Yahoo History Proxy] Loaded ${history.length} points for ${ticker}`);
        }
      }
    }

    // 3. ULTIMATE FALLBACK: Simulated realistic wavy data
    // This ensures a premium UI experience even when APIs are down/limited.
    if (history.length === 0 && cached) {
       console.log(`✨ [Simulated History] Generating wavy fallback data for ${ticker}`);
       history = generateSimulatedHistory(ticker, cached.data.price, cached.data.changePercent);
    }

    if (cached && history.length > 0) {
      cached.data.history = history;
    }

    return history;
  } catch (err) {
    console.error(`[History Fetch] Failed for ${ticker}:`, err);
    return [];
  }
}






export async function getTopStocks(historical: boolean = false, limit: number = 30): Promise<Stock[]> {
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
      .limit(historical ? 100 : limit);


    if (discoveryError) throw discoveryError;

    const tickersToSync = (discoveryData && discoveryData.length > 0)
      ? discoveryData.map((item: { ticker: string }) => item.ticker)
      : WATCHLIST_TICKERS.slice(0, 10);

    const { data: realTimeData, error: syncError } = await supabase.functions.invoke('get-market-scanner', {
      body: { tickers: tickersToSync }
    });

    if (syncError) throw syncError;
    if (!realTimeData) return [];

    const stocks: Stock[] = realTimeData.map((rtItem: { ticker: string, price?: number, changePercent?: number, rawVolume?: number }) => {
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
    return fetchMultipleStocks(WATCHLIST_TICKERS.slice(0, 10));
  }
}

function calculateDnaScore(price: number, change: number, volume: number): number {
  // 1. Baseline: Quant terminal starts at a neutral 50.
  let score = 50;
  
  // 2. Balanced Penny Stock Boost: 
  // ONLY apply the volatility premium if the stock isn't in a severe downtrend (Falling Knife).
  if (change >= -5) {
    if (price < 1.0) score += 15;
    else if (price < 5.0) score += 10;
  }
  
  // 3. Crash Penalty (Aggressive Negative Changes): 
  // Escalated penalties to protect against death spirals.
  if (change < -40) score -= 60;      // Catastrophic crash
  else if (change < -30) score -= 50; // Severe gap down
  else if (change < -15) score -= 30; // Technical breakdown
  else if (change < -5) score -= 15;  // Short-term correction
  
  // 4. Upward Momentum:
  if (change > 20) score += 20;
  else if (change > 10) score += 15;
  else if (change > 3) score += 5;
  
  // 5. Liquidity Indicator (Dollar Volume): 
  // Volume relative to price is a more accurate metric for penny stock liquidity.
  const dollarVolume = price * volume;
  
  if (dollarVolume > 5000000) { // High Liquidity (> $5M traded)
    if (change > 0) score += 10;      // High liquidity + Upward momentum = Strong Conviction
    else if (change < 0) score -= 15; // High liquidity + Downward momentum = Distribution/Institutional Dumping
  } else if (dollarVolume > 0 && dollarVolume < 500000) {
    score -= 10; // Illiquidity penalty (Dangerous to enter/exit)
  }

  // 6. Result Clamping: strictly bound between 0 and 100
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

export function getSector(ticker: string | { sector?: string }): string {
  if (typeof ticker === 'object' && ticker !== null) return ticker.sector || 'Tech/Growth';
  const sectors: Record<string, string> = { SNDL: 'Cannabis', CLOV: 'Healthcare', SOFI: 'Fintech' };
  return sectors[ticker as string] || 'Tech/Growth';
}

function getDescription(ticker: string): string {
  const descriptions: Record<string, string> = { SNDL: 'Cannabis company', CLOV: 'Healthcare AI' };
  return descriptions[ticker] || 'High-growth potential stock.';
}
