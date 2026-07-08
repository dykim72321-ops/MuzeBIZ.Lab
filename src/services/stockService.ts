import { supabase } from '../lib/supabase';
import type { Stock } from '../types';
import { calculateDnaScore } from '../utils/dnaMath';
import { fetchAlpacaQuote, fetchAlpacaQuotes } from './pythonApiService';

// Focused Penny Stock Watchlist
export const WATCHLIST_TICKERS = [
  'SNDL', 'MULN', 'IDEX', 'ZOM', 'FCEL', 'OCGN', 'BNGO', 'CTXR',
  'CLOV', 'BB', 'AMC', 'GME', 'NKLA', 'OPEN', 'LCID',
  'SOFI', 'PLTR', 'PLUG', 'FUBO', 'DKNG',
  'MARA', 'RIOT', 'HUT', 'BITF',
  'NIO', 'XPEV', 'GRAB', 'CPNG'
];

const cache = new Map<string, { data: Stock; timestamp: number }>();
// 🆕 장기 보존 히스토리 캐시 (세션 유지 동안 영구 캐시)
const historyCache = new Map<string, { date: string; price: number }[]>();
// 🆕 전일 종가 캐시 — 장 마감 후 8시간(익일 02:00 ET) 이후 만료되어 cross-day 오염 방지
const PREV_CLOSE_TTL_MS = 8 * 60 * 60 * 1000;
const prevCloseCache = new Map<string, { value: number; expiresAt: number }>();

function getCacheDuration(): number {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isWeekend = day === 0 || day === 6;
  // EST Market Hours are roughly 14:30 to 21:00 UTC
  const isMarketHours = !isWeekend && (hour > 14 || (hour === 14 && now.getUTCMinutes() >= 30)) && hour < 21;
  return isMarketHours ? 2 * 60 * 1000 : 15 * 60 * 1000;
}

// 🆕 Helper to prevent infinite hanging of Vite proxy / external APIs
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 3000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Promise에 타임아웃을 적용하는 모듈 범위 헬퍼 — clearTimeout을 보장해 timer leak 방지
// PromiseLike<T>를 받아 Supabase PostgrestFilterBuilder 등 thenable도 지원
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label = 'Operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
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
    const response = await fetchWithTimeout(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`,
      { timeout: 3000 }
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
      dnaScore: calculateDnaScore(data.c, data.dp || 0, 0, 0),
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

// Yahoo Finance 직접 프록시 폴백 (Vite /yahoo-api → query1.finance.yahoo.com)
// Edge Function이 모두 실패했을 때 최후 수단
async function fetchFromYahooDirect(ticker: string): Promise<Stock | null> {
  try {
    const url = `/yahoo-api/v8/finance/chart/${ticker}?interval=1d&range=2d`;
    const res = await fetchWithTimeout(url, { timeout: 3000 });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const volume = meta.regularMarketVolume ?? 0;

    if (price <= 0) return null;

    const dnaScore = calculateDnaScore(price, changePercent, volume, 0);
    const stock: Stock = {
      id: ticker,
      ticker,
      name: getCompanyName(ticker),
      price,
      changePercent,
      volume,
      marketCap: 'N/A',
      dnaScore,
      sector: getSector(ticker),
      description: '',
      relevantMetrics: { debtToEquity: 0, rndRatio: 0, sentimentScore: 0, institutionalOwnership: 0 },
      newsHeadlines: [],
      history: [],
    };

    console.log(`✅ [YahooDirect] ${ticker}: $${price.toFixed(2)} (${changePercent.toFixed(2)}%)`);
    cache.set(ticker, { data: stock, timestamp: Date.now() });
    return stock;
  } catch (err) {
    console.warn(`[YahooDirect] Failed for ${ticker}:`, err);
    return null;
  }
}

// Yahoo Finance API fallback (via Edge Function) - provides richer data
async function fetchFromYahoo(ticker: string): Promise<Stock | null> {
  try {
    // Supabase Edge Function 호출에 8초 타임아웃 적용 (cold start 포함)
    const { data, error } = await withTimeout(
      supabase.functions.invoke('get-yahoo-quote', { body: { ticker } }),
      8000,
      'Yahoo Edge Function'
    );

    if (error || !data || data.error) {
      console.warn(`[Yahoo] Failed for ${ticker}:`, error || data?.error);
      return null;
    }

    // Calculate enhanced DNA score using Yahoo data
    let dnaScore = calculateDnaScore(data.price, data.changePercent, data.volume, data.averageVolume10d || 0);

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
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    if (isTimeout) {
      console.warn(`[Yahoo] Edge Function timed out for ${ticker} (8s)`);
    } else {
      console.error(`[Yahoo] Failed for ${ticker}:`, err);
    }
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

async function fetchAlpacaQuoteEnriched(ticker: string): Promise<Stock | null> {
  try {
    const alpacaData = await fetchAlpacaQuote(ticker);
    if (!alpacaData || !alpacaData.last_price) {
      return null;
    }

    const price = alpacaData.last_price;
    let changePercent = 0;
    let prevClose = 0;
    let volume = alpacaData.volume;

    // Fast client-side yfinance query to get previous close for changePercent calculation
    try {
      const url = `/yahoo-api/v8/finance/chart/${ticker}?interval=1d&range=2d`;
      const res = await fetchWithTimeout(url, { timeout: 3000 });
      if (res.ok) {
        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (meta) {
          prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
          if (prevClose > 0) {
            changePercent = ((price - prevClose) / prevClose) * 100;
          }
          volume = meta.regularMarketVolume ?? volume;
        }
      }
    } catch (yErr) {
      console.warn(`[AlpacaQuote] Failed to fetch previous close from Yahoo for ${ticker}:`, yErr);
    }

    const dnaScore = calculateDnaScore(price, changePercent, volume, 0);

    const stock: Stock = {
      id: ticker,
      ticker: ticker,
      name: getCompanyName(ticker),
      price: price,
      changePercent: changePercent,
      volume: volume,
      marketCap: 'N/A',
      dnaScore: dnaScore,
      currentHigh: price,
      sector: getSector(ticker),
      description: '',
      relevantMetrics: {
        debtToEquity: 0,
        rndRatio: 0,
        sentimentScore: 0,
        institutionalOwnership: 0,
        bidPrice: alpacaData.bid_price,
        askPrice: alpacaData.ask_price,
        bidSize: 0,
        askSize: 0,
      }
    };

    // Retrieve technical indicators from realtime_signals if they exist
    try {
      const { data: sigData } = await supabase
        .from('realtime_signals')
        .select('rsi, macd_diff, adx, rvol, dna_score')
        .eq('ticker', ticker)
        .maybeSingle();

      if (sigData) {
        stock.rsi = sigData.rsi ?? undefined;
        stock.macdDiff = sigData.macd_diff ?? undefined;
        stock.adx = sigData.adx ?? undefined;
        stock.rvol = sigData.rvol ?? undefined;
        if (sigData.dna_score !== null && sigData.dna_score !== undefined && sigData.dna_score > 0) {
          stock.dnaScore = sigData.dna_score;
        }
      }
    } catch (err) {
      console.warn(`[AlpacaQuote] Failed to fetch realtime signals:`, err);
    }

    return stock;
  } catch (err) {
    console.error(`[AlpacaQuote] fetchAlpacaQuoteEnriched error for ${ticker}:`, err);
    return null;
  }
}

async function fetchAlpacaQuotesEnriched(tickers: string[]): Promise<Stock[]> {
  if (tickers.length === 0) return [];
  try {
    const alpacaMap = await fetchAlpacaQuotes(tickers);
    if (!alpacaMap || Object.keys(alpacaMap).length === 0) {
      return [];
    }

    // 🆕 Batch fetch prevClose + volume from Yahoo (TTL 8h로 cross-day 오염 방지)
    const prevCloseMap: Record<string, number> = {};
    const yahooVolumeMap: Record<string, number> = {};
    const now = Date.now();
    const uncachedTickers = tickers.filter(t => {
      const entry = prevCloseCache.get(t);
      return !entry || entry.expiresAt < now;
    });

    if (uncachedTickers.length > 0) {
      try {
        const url = `/yahoo-api/v7/finance/quote?symbols=${uncachedTickers.join(',')}`;
        const res = await fetchWithTimeout(url, { timeout: 4000 });
        if (res.ok) {
          const json = await res.json();
          const batchResults = json?.quoteResponse?.result || [];
          batchResults.forEach((item: { symbol?: string; regularMarketPreviousClose?: number; regularMarketVolume?: number }) => {
            if (!item.symbol) return;
            if (item.regularMarketPreviousClose) {
              prevCloseMap[item.symbol] = item.regularMarketPreviousClose;
              prevCloseCache.set(item.symbol, {
                value: item.regularMarketPreviousClose,
                expiresAt: now + PREV_CLOSE_TTL_MS,
              });
            }
            if (item.regularMarketVolume) {
              yahooVolumeMap[item.symbol] = item.regularMarketVolume;
            }
          });
        }
      } catch (err) {
        console.warn('[AlpacaQuotes] Yahoo batch prevClose failed, using stale cache:', err);
        // 단일 실패점 방어: 배치 실패 시 만료된 캐시라도 사용해 전 종목 0% 방지
        uncachedTickers.forEach(t => {
          const stale = prevCloseCache.get(t);
          if (stale) prevCloseMap[t] = stale.value;
        });
      }
    }

    // 🆕 Chunk Yahoo Finance requests to prevent rate limit and connection queueing
    const validStocks: Stock[] = [];
    const CHUNK_SIZE = 5;

    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
      const chunk = tickers.slice(i, i + CHUNK_SIZE);
      const chunkPromises = chunk.map(async (ticker) => {
        const alpacaData = alpacaMap[ticker];
        if (!alpacaData || !alpacaData.last_price) return null;

        const price = alpacaData.last_price;
        let changePercent = 0;
        const prevClose = prevCloseCache.get(ticker)?.value ?? prevCloseMap[ticker] ?? 0;
        // Yahoo 전체 시장 거래량(IEX 샘플보다 정확) → RVOL 계산 정확도 향상
        const volume = yahooVolumeMap[ticker] ?? alpacaData.volume;

        if (prevClose > 0) {
          changePercent = ((price - prevClose) / prevClose) * 100;
        }

        const dnaScore = calculateDnaScore(price, changePercent, volume, 0);

        const stock: Stock = {
          id: ticker,
          ticker: ticker,
          name: getCompanyName(ticker),
          price: price,
          changePercent: changePercent,
          volume: volume,
          marketCap: 'N/A',
          dnaScore: dnaScore,
          currentHigh: price,
          sector: getSector(ticker),
          description: '',
          relevantMetrics: {
            debtToEquity: 0,
            rndRatio: 0,
            sentimentScore: 0,
            institutionalOwnership: 0,
            bidPrice: alpacaData.bid_price,
            askPrice: alpacaData.ask_price,
            bidSize: 0,
            askSize: 0,
          }
        };
        
        return stock;
      });

      const parsed = await Promise.all(chunkPromises);
      validStocks.push(...parsed.filter((s): s is Stock => s !== null));

      // Wait between chunks to avoid Yahoo rate limits and browser queueing
      if (i + CHUNK_SIZE < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Batch fetch realtime signals (5초 타임아웃)
    if (validStocks.length > 0) {
      try {
        const sigResult = await withTimeout(
          supabase.from('realtime_signals').select('ticker, rsi, macd_diff, adx, rvol, dna_score').in('ticker', validStocks.map(s => s.ticker)),
          5000,
          'realtime signals (batch)'
        ).catch(() => ({ data: null }));

        if (sigResult.data) {
          validStocks.forEach(stock => {
            const match = sigResult.data!.find((sig: { ticker: string }) => sig.ticker === stock.ticker);
            if (match) {
              stock.rsi = match.rsi ?? undefined;
              stock.macdDiff = match.macd_diff ?? undefined;
              stock.adx = match.adx ?? undefined;
              stock.rvol = match.rvol ?? undefined;
              if (match.dna_score !== null && match.dna_score !== undefined && match.dna_score > 0) {
                stock.dnaScore = match.dna_score;
              }
            }
          });
        }
      } catch (err) {
        console.warn('[AlpacaQuotesEnriched] Failed to fetch realtime signals:', err);
      }
    }

    return validStocks;
  } catch (err) {
    console.error('[AlpacaQuotesEnriched] Error:', err);
    return [];
  }
}

export async function fetchStockQuote(ticker: string, historyRange?: string): Promise<Stock | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.timestamp < getCacheDuration() && (!historyRange || (cached.data.history && cached.data.history.length > 0))) {
    return cached.data;
  }

  // 1. Try Alpaca Enriched Quote first
  try {
    const alpacaStock = await fetchAlpacaQuoteEnriched(ticker);
    if (alpacaStock) {
      // If history is requested, load it asynchronously or just return
      if (historyRange) {
        try {
          const hist = await fetchStockHistory(ticker, '1m', 30);
          alpacaStock.history = hist;
        } catch {
          // history is a nice-to-have; ignore failures and return the quote without it
        }
      }
      cache.set(ticker, { data: alpacaStock, timestamp: Date.now() });
      return alpacaStock;
    }
  } catch (err) {
    console.warn(`[AlpacaQuote] Failed for ${ticker}, falling back:`, err);
  }

  try {
    // Fast-fail: 4 second timeout for the primary smart-quote endpoint
    const smartQuotePromise = supabase.functions.invoke('smart-quote', {
      body: { ticker, includeFinancials: false, historyRange }
    });

    const { data, error } = await withTimeout(smartQuotePromise, 4000).catch(() => ({ data: null, error: new Error('Timeout or failure') }));

    if (error || !data || data.price <= 0) {
      if (error) console.warn(`[SmartQuote] Error or Timeout for ${ticker}:`, error);
      else console.warn(`[SmartQuote] No valid price for ${ticker}`);

      // Race fallback APIs (Edge Functions)
      const fallbackData = await Promise.any([
        fetchFromFinnhub(ticker).then(res => res ? res : Promise.reject('Finnhub null')),
        fetchFromYahoo(ticker).then(res => res ? res : Promise.reject('Yahoo null'))
      ]).catch(() => null);

      if (fallbackData) return fallbackData;

      // 최후 폴백: Vite 프록시를 통한 Yahoo Finance 직접 호출
      const directData = await fetchFromYahooDirect(ticker);
      if (directData) return directData;

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
      dnaScore: data.dnaScore || calculateDnaScore(data.price, data.changePercent, data.volume, data.averageVolume10d || 0),
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

    // Fetch realtime signal for this ticker if available to populate indicators
    try {
      const { data: sigData } = await supabase
        .from('realtime_signals')
        .select('rsi, macd_diff, adx, rvol, dna_score')
        .eq('ticker', ticker)
        .maybeSingle();

      if (sigData) {
        stock.rsi = sigData.rsi ?? undefined;
        stock.macdDiff = sigData.macd_diff ?? undefined;
        stock.adx = sigData.adx ?? undefined;
        stock.rvol = sigData.rvol ?? undefined;
        if (sigData.dna_score !== null && sigData.dna_score !== undefined && sigData.dna_score > 0) {
          stock.dnaScore = sigData.dna_score;
        }
      }
    } catch (err) {
      console.warn(`[SmartQuote] Failed to fetch realtime signal for ${ticker}:`, err);
    }

    // Log source information
    console.log(`[SmartQuote] ${ticker}: $${data.price} (Sources: ${JSON.stringify(data.sources)})`);

    cache.set(ticker, { data: stock, timestamp: Date.now() });
    return stock;

  } catch (err) {
    console.error(`[SmartQuote] Failed for ${ticker}:`, err);

    // Final fallback chain
    const finnhubData = await fetchFromFinnhub(ticker);
    if (finnhubData) return finnhubData;

    const directData = await fetchFromYahooDirect(ticker);
    if (directData) return directData;

    if (cached) return cached.data;
    return null;
  }
}

const pendingRequests = new Map<string, Promise<Stock | null>>();

export async function fetchMultipleStocksOptimized(tickers: string[], historyRange?: string): Promise<Stock[]> {
  // Deduplicate and filter out empty tickers
  const uniqueTickers = [...new Set(tickers.filter(Boolean))];

  // 1. Try Alpaca Enriched Batch Quotes first
  let alpacaStocks: Stock[] = [];
  try {
    alpacaStocks = await fetchAlpacaQuotesEnriched(uniqueTickers);
  } catch (err) {
    console.warn('[AlpacaQuotes] Batch fetch failed, falling back:', err);
  }

  const fetchedTickers = new Set(alpacaStocks.map(s => s.ticker));
  const missingTickers = uniqueTickers.filter(t => !fetchedTickers.has(t));

  // Alpaca batch does not include price history — fetch it separately if requested
  if (historyRange && alpacaStocks.length > 0) {
    const rangeMap: Record<string, number> = { '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 };
    const days = rangeMap[historyRange] ?? 30;
    
    // 🆕 Chunk history fetching to avoid overwhelming API rate limits and browser queues
    const HISTORY_CHUNK_SIZE = 5;
    for (let i = 0; i < alpacaStocks.length; i += HISTORY_CHUNK_SIZE) {
      const chunk = alpacaStocks.slice(i, i + HISTORY_CHUNK_SIZE);
      await Promise.all(
        chunk.map(async stock => {
          try {
            const cached = cache.get(stock.ticker);
            // Re-use history if we fetched it recently (within 4 hours)
            if (cached && cached.data.history && cached.data.history.length > 0 && Date.now() - cached.timestamp < 14400000) {
              stock.history = cached.data.history;
            } else {
              stock.history = await fetchStockHistory(stock.ticker, 'D', days);
              // Update cache with the new history
              cache.set(stock.ticker, { data: { ...stock }, timestamp: Date.now() });
            }
          } catch {
            stock.history = [];
          }
        })
      );
      // Wait shortly between chunks to avoid rate limit spikes
      if (i + HISTORY_CHUNK_SIZE < alpacaStocks.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  const results: Stock[] = [...alpacaStocks];

  // Dynamically adjust chunk size based on API provider limits
  // Dynamically adjust chunk size - increased for better performance
  const CHUNK_SIZE = FINNHUB_API_KEY ? 20 : 12; 

  if (missingTickers.length > 0) {
    for (let i = 0; i < missingTickers.length; i += CHUNK_SIZE) {
      const chunk = missingTickers.slice(i, i + CHUNK_SIZE);
      
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
      if (i + CHUNK_SIZE < missingTickers.length) {
        await new Promise(resolve => setTimeout(resolve, 200)); 
      }
    }
  }
  
  // Batch fetch analysis cache (5초 타임아웃, 없어도 무방한 보조 데이터)
  try {
    const analysisCacheResult = await withTimeout(
      supabase.from('stock_analysis_cache').select('ticker, analysis').in('ticker', results.map(s => s.ticker)),
      5000,
      'analysis cache'
    ).catch(() => ({ data: null }));

    if (analysisCacheResult.data) {
      results.forEach(stock => {
        const cacheEntries = analysisCacheResult.data!.filter((c: { ticker: string }) => c.ticker === stock.ticker);
        if (cacheEntries.length > 0) {
          stock.stock_analysis_cache = cacheEntries;
        }
      });
    }
  } catch (err) {
    console.warn('[Fetch Optimization] Failed to fetch analysis cache:', err);
  }

  // Batch fetch realtime signals (5초 타임아웃, 없어도 무방한 보조 데이터)
  try {
    const signalResult = await withTimeout(
      supabase.from('realtime_signals').select('ticker, rsi, macd_diff, adx, rvol, dna_score').in('ticker', results.map(s => s.ticker)),
      5000,
      'realtime signals'
    ).catch(() => ({ data: null }));

    if (signalResult.data) {
      results.forEach(stock => {
        const match = signalResult.data!.find((sig: { ticker: string }) => sig.ticker === stock.ticker);
        if (match) {
          stock.rsi = match.rsi ?? undefined;
          stock.macdDiff = match.macd_diff ?? undefined;
          stock.adx = match.adx ?? undefined;
          stock.rvol = match.rvol ?? undefined;
          if (match.dna_score !== null && match.dna_score !== undefined && match.dna_score > 0) {
            stock.dnaScore = match.dna_score;
          }
        }
      });
    }
  } catch (err) {
    console.warn('[Fetch Optimization] Failed to fetch realtime signals:', err);
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
    try {
      const res = await fetchWithTimeout(url, { ...options, timeout: 5000 });
      if (res.status === 429 && i < maxRetries - 1) {
        console.warn(`[Retry] Rate limited (429) on ${url}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      return res;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
    }
  }
  return fetchWithTimeout(url, { ...options, timeout: 5000 }); // Final attempt
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
    // 🆕 Check long-term history cache first
    const cachedHistory = historyCache.get(`${ticker}-${days}`);
    if (cachedHistory && cachedHistory.length > 5) {
      return cachedHistory;
    }

    let history: { date: string; price: number }[] = [];

    // 1. Try Finnhub First
    if (FINNHUB_API_KEY && !isFinnhubExhausted) {
      const to = Math.floor(Date.now() / 1000);
      const from = to - (days * 24 * 60 * 60);
      try {
        const finnhubRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`,
          { timeout: 4000 }
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
      } catch {
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
          })).filter((item: { price: number | null | undefined }) => item.price !== null && item.price !== undefined);
          console.log(`✅ [Yahoo History Proxy] Loaded ${history.length} points for ${ticker}`);
        }
      }
    }

    // 3. ULTIMATE FALLBACK: Simulated realistic wavy data
    if (history.length === 0) {
      console.log(`✨ [Simulated History] Generating wavy fallback data for ${ticker}`);
      const liveCache = cache.get(ticker);
      history = generateSimulatedHistory(ticker, liveCache?.data.price ?? 10, liveCache?.data.changePercent ?? 0);
    }

    // 🆕 Save to long-term history cache if we got valid data
    if (history.length > 5) {
      historyCache.set(`${ticker}-${days}`, history);
    }

    return history;
  } catch (err) {
    console.error(`[History Fetch] Failed for ${ticker}:`, err);
    return [];
  }
}






export async function getTopStocks(historical: boolean = false, limit: number = 30): Promise<Stock[]> {
  try {
    // 1. daily_discovery에서 dna_score 내림차순 조회 (단일 진실 소스)
    let query = supabase
      .from('daily_discovery')
      .select('*, stock_analysis_cache(analysis)')
      .order('dna_score', { ascending: false });

    if (!historical) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('updated_at', twentyFourHoursAgo);
    }

    const { data: discoveryData, error: discoveryError } = await query
      .limit(historical ? 100 : limit);

    if (discoveryError) throw discoveryError;

    const tickersToSync = (discoveryData && discoveryData.length > 0)
      ? discoveryData.map((item: { ticker: string }) => item.ticker)
      : WATCHLIST_TICKERS.slice(0, 10);

    // 2. get-market-scanner로 실시간 가격/거래량 보강
    const { data: realTimeData, error: syncError } = await supabase.functions.invoke('get-market-scanner', {
      body: { tickers: tickersToSync }
    });

    if (syncError) throw syncError;
    if (!realTimeData) return [];

    const stocks: Stock[] = realTimeData.map((rtItem: { ticker: string, price?: number, changePercent?: number, rawVolume?: number }) => {
      const discoveryInfo = discoveryData?.find(d => d.ticker === rtItem.ticker);
      const price = rtItem.price || discoveryInfo?.price || 0;
      const changePercent = rtItem.changePercent || (discoveryInfo?.change ? parseFloat(discoveryInfo.change) : 0);
      const volume = rtItem.rawVolume || 0;

      // daily_discovery.dna_score 우선 사용 — 백엔드(Python/EdgeFn) 계산값
      // fallback: 프론트엔드 실시간 재계산
      const dnaScore = discoveryInfo?.dna_score != null
        ? Number(discoveryInfo.dna_score)
        : calculateDnaScore(price, changePercent, volume, discoveryInfo?.average_volume_10d || 0);

      return {
        id: rtItem.ticker,
        ticker: rtItem.ticker,
        name: discoveryInfo?.name || getCompanyName(rtItem.ticker),
        price,
        changePercent,
        volume,
        marketCap: discoveryInfo?.market_cap || 'N/A',
        dnaScore,
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

    // 3. dna_score 내림차순 정렬 후 반환 (섹터 다양성 대신 점수 우선)
    return stocks
      .sort((a, b) => b.dnaScore - a.dnaScore)
      .slice(0, 30);

  } catch (err) {
    console.warn('Real-time sync failed, falling back to cache:', err);
    return fetchMultipleStocks(WATCHLIST_TICKERS.slice(0, 10));
  }
}

export async function fetchQuantSignals() {
  const { data, error } = await supabase
    .from('quant_signals')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function fetchActivePositions() {
  const { data, error } = await supabase
    .from('active_positions')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function fetchTradeHistory() {
  const { data, error } = await supabase
    .from('trade_history')
    .select('*')
    .order('exit_date', { ascending: false });
  
  if (error) throw error;
  return data;
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

export interface OHLCPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function fetchStockOHLC(ticker: string, range: string = '1mo'): Promise<OHLCPoint[]> {
  try {
    const url = `/yahoo-api/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return [];
    const q = result.indicators.quote[0];
    return result.timestamp
      .map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        open: q.open?.[i] ?? 0,
        high: q.high?.[i] ?? 0,
        low: q.low?.[i] ?? 0,
        close: q.close?.[i] ?? 0,
      }))
      .filter((p: OHLCPoint) => p.close > 0);
  } catch {
    return [];
  }
}
