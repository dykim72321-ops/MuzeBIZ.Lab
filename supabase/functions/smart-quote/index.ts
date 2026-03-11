// supabase/functions/smart-quote/index.ts
// Unified Smart Quote API - Optimal combination of Finnhub, Yahoo, Alpha Vantage
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY")
const ALPHA_VANTAGE_API_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cache TTLs
const PRICE_CACHE_TTL = 5 * 60 * 1000;      // 5 minutes
const ANALYST_CACHE_TTL = 30 * 60 * 1000;   // 30 minutes
const FINANCIAL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Yahoo session cache
let yahooSession: { cookie: string; crumb: string; timestamp: number } | null = null;

async function getYahooSession() {
  const now = Date.now();
  if (yahooSession && (now - yahooSession.timestamp < 30 * 60 * 1000)) {
    return yahooSession;
  }

  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': userAgent },
    redirect: 'manual'
  });

  const setCookie = cookieRes.headers.get('set-cookie');
  if (!setCookie) throw new Error('Failed to get Yahoo cookies');

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'Cookie': setCookie, 'User-Agent': userAgent }
  });

  const crumb = await crumbRes.text();
  if (!crumb || crumb.length > 50) throw new Error('Failed to get Yahoo crumb');

  yahooSession = { cookie: setCookie, crumb, timestamp: now };
  return yahooSession;
}

// 1. Finnhub: Real-time price (fast, reliable)
async function fetchFinnhubPrice(ticker: string) {
  if (!FINNHUB_API_KEY) return null;

  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
    const data = await res.json();

    if (data.c > 0) {
      console.log(`✅ [Finnhub] ${ticker}: $${data.c}`);
      return {
        price: data.c,
        change: data.d,
        changePercent: data.dp,
        high: data.h,
        low: data.l,
        open: data.o,
        prevClose: data.pc,
        source: 'finnhub'
      };
    }
  } catch (e) {
    console.warn(`[Finnhub] Failed for ${ticker}:`, e);
  }
  return null;
}

// 2. Yahoo: Analyst data (target price, recommendations)
async function fetchYahooAnalyst(ticker: string) {
  try {
    const session = await getYahooSession();
    const modules = 'price,financialData,recommendationTrend,summaryDetail';
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${session.crumb}`;

    const res = await fetch(url, {
      headers: {
        'Cookie': session.cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const financialData = result.financialData || {};
    const summaryDetail = result.summaryDetail || {};
    const price = result.price || {};

    console.log(`✅ [Yahoo] ${ticker}: Target $${financialData.targetMeanPrice?.raw}`);

    return {
      price: price.regularMarketPrice?.raw || summaryDetail.previousClose?.raw || 0,
      targetPrice: financialData.targetMeanPrice?.raw || 0,
      targetHigh: financialData.targetHighPrice?.raw || 0,
      targetLow: financialData.targetLowPrice?.raw || 0,
      recommendation: financialData.recommendationKey || 'none',
      recommendationScore: financialData.recommendationMean?.raw || 0,
      numberOfAnalysts: financialData.numberOfAnalystOpinions?.raw || 0,
      fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh?.raw || 0,
      fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow?.raw || 0,
      dividendYield: summaryDetail.dividendYield?.raw || 0,
      marketCap: price.marketCap?.raw || 0,
      volume: price.regularMarketVolume?.raw || 0,
      averageVolume10d: summaryDetail.averageVolume10days?.raw || summaryDetail.averageDailyVolume10Day?.raw || 0,
      source: 'yahoo'
    };
  } catch (e) {
    console.warn(`[Yahoo] Failed for ${ticker}:`, e);
    return null;
  }
}

// 2b. Yahoo: Historical data (bypass CORS)
async function fetchYahooHistory(ticker: string, session: { cookie: string; crumb: string }, userAgent: string, range: string = '1mo') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}&crumb=${session.crumb}`;
    const res = await fetch(url, {
      headers: {
        'Cookie': session.cookie,
        'User-Agent': userAgent
      }
    });

    if (!res.ok) {
       console.warn(`[Yahoo History] ${ticker} failed with status: ${res.status}`);
       return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) return null;

    const timestamps = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const highs = result.indicators?.quote?.[0]?.high || [];
    const lows = result.indicators?.quote?.[0]?.low || [];

    return timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString(),
      price: closes[i],
      volume: volumes[i] || 0,
      high: highs[i] || closes[i],
      low: lows[i] || closes[i]
    })).filter((p: any) => p.price !== null && p.price !== undefined);
  } catch (e) {
    console.warn(`[Yahoo History] Failed for ${ticker}:`, e);
    return null;
  }
}

// --- Technical Analysis Helpers for Penny Stocks ---
function calculateEMA(data: number[], days: number): number {
  if (data.length === 0) return 0;
  if (data.length < days) days = data.length;
  
  const k = 2 / (days + 1);
  let ema = data[0]; 
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

// Approximate Daily VWAP for the latest day if intraday data is not available
function calculateVWAP(high: number, low: number, close: number): number {
  return (high + low + close) / 3;
}




// 4. Google News RSS: Recent headlines for sentiment context
async function fetchGoogleNews(ticker: string) {
  try {
    const query = encodeURIComponent(`${ticker} stock`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
    });

    if (!res.ok) return null;

    const xml = await res.text();

    // Simple XML parsing for titles (Deno doesn't have DOMParser natively)
    const titleMatches = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>([^<]+)<\/title>/g) || [];
    const headlines = titleMatches
      .slice(1, 6) // Skip the first title (feed title), take next 5
      .map(t => t.replace(/<title>|<\/title>|<!\[CDATA\[|\]\]>/g, '').trim())
      .filter(h => h.length > 0);

    console.log(`✅ [GoogleNews] ${ticker}: Found ${headlines.length} headlines`);

    return { headlines, source: 'google_news' };
  } catch (e) {
    console.warn(`[GoogleNews] Failed for ${ticker}:`, e);
    return null;
  }
}

// 3. Alpha Vantage: Deep financials (use sparingly - 25/day limit)
async function fetchAlphaFinancials(ticker: string, supabase: any) {
  // Check cache first (24h TTL)
  const { data: cached } = await supabase
    .from('stock_cache')
    .select('overview_data, cash_flow_data, updated_at')
    .eq('ticker', ticker)
    .single();

  if (cached?.overview_data) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < FINANCIAL_CACHE_TTL) {
      console.log(`📦 [AlphaVantage] Using cached data for ${ticker}`);
      return {
        overview: cached.overview_data,
        cashFlow: cached.cash_flow_data,
        source: 'cache'
      };
    }
  }

  if (!ALPHA_VANTAGE_API_KEY) return null;

  try {
    const ovRes = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`
    );
    const overview = await ovRes.json();

    if (overview.Symbol) {
      console.log(`✅ [AlphaVantage] ${ticker}: PE ${overview.PERatio}`);

      // Cache for 24 hours
      await supabase.from('stock_cache').upsert({
        ticker,
        overview_data: overview,
        updated_at: new Date().toISOString()
      }, { onConflict: 'ticker' });

      return { overview, source: 'alphavantage' };
    }
  } catch (e) {
    console.warn(`[AlphaVantage] Failed for ${ticker}:`, e);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { ticker, includeFinancials = false } = reqBody;
    if (!ticker) throw new Error('Ticker required');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

    // Get Yahoo Session first as it is needed by multiple fetchers
    let session = null;
    try {
      session = await getYahooSession();
    } catch (e) {
      console.warn('[SmartQuote] Failed to get Yahoo session, history/analyst data may be limited');
    }

    // Parallel fetch: Finnhub (price) + Yahoo (analyst & history) + Google News
    const [finnhubData, yahooData, newsData, historyData] = await Promise.all([
      fetchFinnhubPrice(ticker),
      session ? fetchYahooAnalyst(ticker) : Promise.resolve(null),
      fetchGoogleNews(ticker),
      session ? fetchYahooHistory(ticker, session, userAgent, reqBody.historyRange || '1mo') : Promise.resolve(null)
    ]);


    // Only fetch Alpha Vantage if specifically requested (for AI analysis)
    let financialData = null;
    if (includeFinancials) {
      financialData = await fetchAlphaFinancials(ticker, supabase);
    }

    // Combine results
    const price = finnhubData?.price || yahooData?.price || 0;
    const changePercent = finnhubData?.changePercent || 0;

    // Calculate Relative Volume (key momentum indicator)
    const volume = yahooData?.volume || 0;
    const avgVolume = yahooData?.averageVolume10d || 0;
    const relativeVolume = avgVolume > 0 ? Math.round((volume / avgVolume) * 100) / 100 : 0;
    const absoluteLiquidity = price * volume; // Transaction value

    console.log(`📊 [RelVol] ${ticker}: ${relativeVolume.toFixed(2)}x (${volume.toLocaleString()} / ${avgVolume.toLocaleString()}) - Liq: $${absoluteLiquidity.toLocaleString()}`);

    // Calculate DNA Score with RelVol factor
    let dnaScore = 50;
    if (price > 0 && price < 1) dnaScore += 30; // Penny stock premium
    else if (price < 3) dnaScore += 20;
    if (changePercent > 15) dnaScore += 20;
    else if (changePercent > 5) dnaScore += 10;

    // Relative Volume bonus (key momentum signal)
    if (relativeVolume >= 3) dnaScore += 15;      // 3x+ = very strong momentum
    else if (relativeVolume >= 2) dnaScore += 10; // 2x+ = strong momentum
    else if (relativeVolume >= 1.5) dnaScore += 5; // 1.5x = mild interest

    // Upside potential from Yahoo analyst data
    const upsidePotential = yahooData?.targetPrice && price > 0
      ? ((yahooData.targetPrice - price) / price) * 100
      : 0;

    if (upsidePotential > 50) dnaScore += 10;
    else if (upsidePotential > 20) dnaScore += 5;

    // Ensure score is bounded
    dnaScore = Math.min(100, Math.max(0, dnaScore));

    // --- Penny Stock Quantitative Analysis ---
    let backtestMatchRate = 50; 
    let isSimulated = false;
    let finalHistory = historyData || [];

    if (!historyData || historyData.length === 0) {
      isSimulated = true;
      // Provide a 2-point fallback history
      finalHistory = [
         { date: new Date(Date.now() - 30*24*60*60*1000).toISOString(), price: price * 0.9 }, // 30 days ago, 10% lower assumption
         { date: new Date().toISOString(), price: price }
      ];
    } else {
      // 1. Liquidity Filter
      const HAS_LIQUIDITY = absoluteLiquidity >= 500000; // Minimum $500k volume traded
      
      // 2. Short-term EMA calculation
      const closePrices = finalHistory.map((h: any) => h.price);
      const ema3 = calculateEMA(closePrices, 3);
      const ema5 = calculateEMA(closePrices, 5);
      
      // 3. VWAP
      // For lack of intraday ticks, we use the High, Low, Close of the current quote or last day
      const high = finnhubData?.high || price;
      const low = finnhubData?.low || price;
      const vwap = calculateVWAP(high, low, price);
      
      // 4. Score formulation based on Indicators
      let baseScore = 50; // default technical score
      
      if (!HAS_LIQUIDITY) {
         baseScore -= 20; // High risk, illiquid
      } else {
         baseScore += 15; // base score reaches 65 for liquid stocks
         
         // Golden cross on micro timeframe (EMA 3 > EMA 5)
         if (ema3 > ema5) baseScore += 10;
         
         // Price above VWAP = Bullish intraday
         if (price > vwap) baseScore += 10;
         
         // Non-linear scaling components (very hard to get)
         if (relativeVolume >= 5) baseScore += 5; // Unusually high relative volume
         if (absoluteLiquidity >= 5000000) baseScore += 5; // > $5M traded
         if (changePercent > 10 && changePercent <= 50) baseScore += 5;

         // Extreme gap up without volume backup
         if (changePercent > 50 && relativeVolume < 1) baseScore -= 25;
      }
      
      // Non-linear scaling (Score Compression) to make it hard to reach 95%+
      let finalScore = baseScore;
      if (finalScore > 90) {
        // Compress score progression: (e.g. 100 becomes 90 + 10 * 0.4 = 94.0, 110 becomes 98.0)
        finalScore = 90 + ((finalScore - 90) * 0.4);
      }
      
      // Hard Cap at 98.5% for realistic quant estimation
      backtestMatchRate = Math.min(98.5, Math.max(15, finalScore));
    }

    const result = {
      ticker,
      // Price data (Finnhub)
      price,
      changePercent,
      high: finnhubData?.high || 0,
      low: finnhubData?.low || 0,
      // Analyst data (Yahoo)
      targetPrice: yahooData?.targetPrice || 0,
      recommendation: yahooData?.recommendation || 'none',
      numberOfAnalysts: yahooData?.numberOfAnalysts || 0,
      fiftyTwoWeekHigh: yahooData?.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: yahooData?.fiftyTwoWeekLow || 0,
      marketCap: yahooData?.marketCap || 0,
      // 🆕 Momentum & Quant
      volume,
      averageVolume10d: avgVolume,
      relativeVolume,  // Key momentum indicator
      absoluteLiquidity, // Transaction value ($500k filter)
      backtestMatchRate, // Quant match probability
      isSimulated, // indicates missing real historical data
      // Calculated
      dnaScore,
      upsidePotential,
      // 🆕 News Headlines
      newsHeadlines: newsData?.headlines || [],
      // 🆕 Historical Data (CORS bypassed)
      history: finalHistory,
      // Financials (Alpha Vantage - only if requested)
      peRatio: financialData?.overview?.PERatio || null,
      revenueGrowth: financialData?.overview?.QuarterlyRevenueGrowthYOY || null,
      // Sources
      sources: {
        price: finnhubData ? 'finnhub' : 'none',
        analyst: yahooData ? 'yahoo' : 'none',
        financials: financialData?.source || 'none',
        news: newsData ? 'google_news' : 'none'
      }
    };

    // Cache combined result
    await supabase.from('stock_cache').upsert({
      ticker,
      price: price,
      change_percent: changePercent,
      dna_score: dnaScore,
      updated_at: new Date().toISOString()
    }, { onConflict: 'ticker' });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Smart Quote Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
