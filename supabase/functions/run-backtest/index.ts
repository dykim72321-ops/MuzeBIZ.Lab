import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * [Tuned DNA Algorithm]
 */
function calculateDnaScore(price: number, change: number, volume: number, avgVolume10d: number): number {
  let score = 50;
  if (change >= -5) {
    if (price < 1.0) score += 15;
    else if (price < 5.0) score += 10;
  }
  if (change < -40) score -= 60;
  else if (change < -30) score -= 50;
  else if (change < -15) score -= 30;
  else if (change < -5) score -= 15;
  if (change > 20) score += 20;
  else if (change > 10) score += 15;
  else if (change > 3) score += 5;
  const dollarVolume = price * volume;
  if (dollarVolume > 20000000) score += 15;
  else if (dollarVolume > 5000000) score += 10;
  else if (dollarVolume < 500000) score -= 20;
  const rvol = volume / (avgVolume10d || volume || 1);
  if (rvol > 3.0 && change > 0) score += 15;
  else if (rvol > 3.0 && change < 0) score -= 20;
  if (change > 50) score -= 10;
  return Math.min(100, Math.max(0, score));
}

function calculateDNATargets(entryPrice: number, atr: number, daysHeld: number = 0, currentPrice: number = 0, currentHigh: number = 0) {
  const initialStopMultiplier = 3.0;
  const trailingMultiplier = 4.5;
  const targetMultiplier = 7.0;
  const fallbackVolatility = entryPrice < 5 ? 0.20 : 0.08;
  const effectiveATR = atr > 0 ? atr : entryPrice * fallbackVolatility;
  const targetPrice = entryPrice + (effectiveATR * targetMultiplier);
  const initialStop = entryPrice - (effectiveATR * initialStopMultiplier);
  let stopPrice = initialStop;
  if (daysHeld >= 3 || currentHigh > entryPrice + (effectiveATR * 2.0)) {
     const trailingStop = currentHigh - (effectiveATR * trailingMultiplier);
     stopPrice = Math.max(initialStop, trailingStop);
  }
  stopPrice = Math.max(stopPrice, entryPrice * 0.75);
  if (daysHeld === 0 && currentPrice > 0) stopPrice = Math.min(stopPrice, currentPrice * 0.98);
  return { targetPrice, stopPrice, effectiveATR };
}

async function fetchHistory(ticker: string, period: string) {
  const range = period === '1y' ? '1y' : '2y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp) return null;
  const timestamps = result.timestamp;
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = quotes.close || [];
  const volumes = quotes.volume || [];
  const opens = quotes.open || [];
  const highs = quotes.high || [];
  const lows = quotes.low || [];
  return timestamps.map((ts: number, i: number) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] || 0
  })).filter((c: any) => c.close != null && c.open != null && c.high != null && c.low != null);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { ticker, period = '1y', initial_capital = 10000 } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // 0. Fetch Settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('cache_ttl_hours')
      .single();
    
    const CACHE_TTL_HOURS = settings?.cache_ttl_hours ?? 24;

    // 1. Check Cache
    const ttlDate = new Date();
    ttlDate.setHours(ttlDate.getHours() - CACHE_TTL_HOURS);
    
    const { data: cacheData } = await supabase
      .from('backtest_cache')
      .select('result_json')
      .eq('ticker', ticker)
      .eq('period', period)
      .gte('updated_at', ttlDate.toISOString())
      .single();
      
    if (cacheData) {
      console.log(`[BACKTEST] Returning cached result for ${ticker} (${period})`);
      return new Response(JSON.stringify(cacheData.result_json), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Run Matrix Simulation if no cache
    console.log(`[BACKTEST] Running full simulation for ${ticker} (${period})...`);
    const candles = await fetchHistory(ticker, period);
    if (!candles || candles.length < 20) throw new Error('Insufficient data');

    let balance = initial_capital;
    let peakBalance = initial_capital;
    let maxDrawdown = 0;
    const trades = [];
    let position: any = null;
    let pendingEntry = false;
    const chart_data: any[] = [];

    for (let i = 20; i < candles.length; i++) {
      const current = candles[i];
      const prev = candles[i-1];
      
      if (balance > peakBalance) peakBalance = balance;
      const currentDrawdown = ((peakBalance - balance) / peakBalance) * 100;
      if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;

      if (position) {
        position.daysHeld++;
        position.highestHigh = Math.max(position.highestHigh, current.high);
        const { targetPrice, stopPrice } = calculateDNATargets(position.entryPrice, position.atr, position.daysHeld, current.close, position.highestHigh);

        if (current.high >= targetPrice) {
          const actualExitPrice = targetPrice * 0.99;
          const pnl = (actualExitPrice - position.entryPrice) * position.amount;
          balance += pnl;
          trades.push({ result: 'WIN', pnl_pct: ((actualExitPrice / position.entryPrice) - 1) * 100 });
          position = null;
        } else if (current.low <= stopPrice) {
          const actualExitPrice = stopPrice * 0.985;
          const pnl = (actualExitPrice - position.entryPrice) * position.amount;
          balance += pnl;
          trades.push({ result: 'LOSS', pnl_pct: ((actualExitPrice / position.entryPrice) - 1) * 100 });
          position = null;
        } else if (position.daysHeld >= 12) {
          const actualExitPrice = current.close * 0.985;
          const pnl = (actualExitPrice - position.entryPrice) * position.amount;
          balance += pnl;
          trades.push({ result: 'TIME_STOP', pnl_pct: ((actualExitPrice / position.entryPrice) - 1) * 100 });
          position = null;
        }
      }

      if (pendingEntry && !position) {
        const riskAmount = balance * 0.08;
        let trSum = 0;
        for (let j = i - 5; j < i; j++) {
          const c = candles[j];
          const p = candles[j-1];
          trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
        }
        position = { entryPrice: current.open, atr: trSum / 5, daysHeld: 0, amount: riskAmount / current.open, highestHigh: current.open };
        pendingEntry = false;
      }

      const change = ((current.close - prev.close) / prev.close) * 100;
        const avgVol10 = candles.slice(i-10, i).reduce((sum: number, c: any) => sum + c.volume, 0) / 10;
      const score = calculateDnaScore(current.close, change, current.volume, avgVol10);
      const rvol = current.volume / Math.max(1, avgVol10);
      const sma20 = candles.slice(i-20, i).reduce((sum: number, c: any) => sum + c.close, 0) / 20;

      if (!position && score >= 80 && rvol > 2.0 && current.close > sma20) pendingEntry = true;

      chart_data.push({
        date: current.date,
        strategy: Math.round(position ? balance + (current.close - position.entryPrice) * position.amount : balance),
        benchmark: Math.round(initial_capital * (current.close / candles[20].close))
      });
    }

    const wins = trades.filter(t => t.pnl_pct > 0).length;
    const total_return_pct = Number(((balance / initial_capital - 1) * 100).toFixed(2));
    const benchmark_final = initial_capital * (candles[candles.length -1].close / candles[20].close);
    const benchmark_return_pct = Number(((benchmark_final / initial_capital - 1) * 100).toFixed(2));

    const resultJson = {
      ticker,
      total_return_pct,
      benchmark_return_pct,
      outperformance: Number((total_return_pct - benchmark_return_pct).toFixed(2)),
      win_rate: trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
      max_drawdown: Number(maxDrawdown.toFixed(2)),
      chart_data
    };

    // 3. Save to Cache
    await supabase.from('backtest_cache').upsert({
      ticker,
      period,
      result_json: resultJson
    }, { onConflict: 'ticker,period' });

    return new Response(JSON.stringify(resultJson), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
  }
})
