import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --------------------------------------------------------------------------
// Core Quant Logic (Winner's Grace)
// --------------------------------------------------------------------------

function calculateDNATargets(
  entryPrice: number, atr: number, daysHeld: number = 0, currentPrice: number = 0, currentHigh: number = 0
) {
  const initialStopMultiplier = 3.0; // 방어선
  const trailingMultiplier = 4.5;    // [Winner's Grace] 여유로운 추적 배수
  const targetMultiplier = 7.0;      // 잭팟 타겟

  const fallbackVolatility = entryPrice < 5 ? 0.20 : 0.08;
  const effectiveATR = atr > 0 ? atr : entryPrice * fallbackVolatility;

  const targetPrice = entryPrice + (effectiveATR * targetMultiplier);
  const initialStop = entryPrice - (effectiveATR * initialStopMultiplier);
  let stopPrice = initialStop;

  // [Winner's Grace] 추적 지연 가동 (3일 이상 or 2.0 ATR 이상 수익 시)
  if (daysHeld >= 3 || currentHigh > entryPrice + (effectiveATR * 2.0)) {
     const trailingStop = currentHigh - (effectiveATR * trailingMultiplier);
     stopPrice = Math.max(initialStop, trailingStop);
  }
  
  // 하드 스탑 (MDD 방어)
  stopPrice = Math.max(stopPrice, entryPrice * 0.75);
  
  // 첫날 하락 직격탄 방어
  if (daysHeld === 0 && currentPrice > 0) {
    stopPrice = Math.min(stopPrice, currentPrice * 0.98);
  }

  return { targetPrice: Number(targetPrice.toFixed(4)), stopPrice: Number(stopPrice.toFixed(4)) };
}

// --------------------------------------------------------------------------
// Data Fetching
// --------------------------------------------------------------------------

async function fetchHistory(ticker: string, range = '1mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp) return null;

  const timestamps = result.timestamp;
  const quotes = result.indicators?.quote?.[0] || {};
  return timestamps.map((ts: number, i: number) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    open: quotes.open[i], high: quotes.high[i], low: quotes.low[i], close: quotes.close[i], volume: quotes.volume[i] || 0
  })).filter((c: { close: number | null }) => c.close != null);
}

function calculateTrueRange(current: { high: number, low: number }, prev: { close: number }): number {
  const hl = current.high - current.low;
  const hc = Math.abs(current.high - prev.close);
  const lc = Math.abs(current.low - prev.close);
  return Math.max(hl, hc, lc);
}

// --------------------------------------------------------------------------
// Main Portfolio Manager
// --------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const PAPER_ACCOUNT_BALANCE = 10000; // 가상 계좌 초기/현재 자본 (향후 DB에서 로드)
    const RISK_PERCENT = 0.05; // [Scale-Up] 5.0% (Half-Kelly)
    const riskAmount = PAPER_ACCOUNT_BALANCE * RISK_PERCENT;

    console.log(`[PORTFOLIO] Starting End-Of-Day Paper Trading sequence...`);

    // 1. Fetch pending signals (from yesterday or earlier)
    const { data: pendingSignals } = await supabase
      .from('quant_signals')
      .select('*')
      .eq('status', 'PENDING');

    // 2. Fetch active positions
    const { data: activePositions } = await supabase
      .from('active_positions')
      .select('*');

    const executionLogs = [];

    // --- PHASE 1: EXECUTE ENTRIES (Next-Day Open) ---
    for (const signal of pendingSignals || []) {
      try {
        const candles = await fetchHistory(signal.ticker, '1mo');
        if (!candles || candles.length < 6) continue;
        
        const today = candles[candles.length - 1];
        
        // Calculate ATR5 at entry
        let trSum = 0;
        for (let j = candles.length - 5; j < candles.length; j++) {
            trSum += calculateTrueRange(candles[j], candles[j-1]);
        }
        const atr5 = trSum / 5;

        // Create new position at today's OPEN
        const newPos = {
          ticker: signal.ticker,
          entry_price: today.open,
          entry_date: today.date,
          initial_atr: atr5,
          highest_high: today.open,
          days_held: 0,
          amount: riskAmount / today.open
        };

        const { error: insertErr } = await supabase.from('active_positions').insert(newPos);
        
        if (!insertErr) {
          // Mark signal as EXECUTED
          await supabase.from('quant_signals').update({ status: 'EXECUTED' }).eq('id', signal.id);
          executionLogs.push(`✅ [ENTRY] Bought ${signal.ticker} at $${today.open.toFixed(2)} (ATR: ${atr5.toFixed(2)})`);
          activePositions.push(newPos); // Add to current array to process Day 0 exit logic below
        }
      } catch (err) {
        console.warn(`[PORTFOLIO] Entry failure for ${signal.ticker}:`, err);
      }
    }

    // --- PHASE 2: MANAGE & EXIT POSITIONS ---
    let closedCount = 0;
    
    for (const pos of activePositions || []) {
      try {
        const candles = await fetchHistory(pos.ticker, '5d'); // Need today's candle
        if (!candles || candles.length === 0) continue;
        
        const today = candles[candles.length - 1];
        
        // Update days_held (if it's not the day we just entered)
        const isEntryDay = (pos.entry_date === today.date);
        const daysHeld = isEntryDay ? 0 : pos.days_held + 1;
        
        // Tracker Highest High
        const highestHigh = Math.max(pos.highest_high, today.high);

        const { targetPrice, stopPrice } = calculateDNATargets(
          pos.entry_price, pos.initial_atr, daysHeld, today.close, highestHigh
        );

        let exitReason = null;
        let finalExitPrice = 0;

        // Exit Logic (with slippage penalty)
        if (today.high >= targetPrice) {
          exitReason = 'TARGET';
          finalExitPrice = targetPrice * 0.99; // 1% Slippage
        } else if (today.low <= stopPrice) {
          exitReason = 'STOP';
          finalExitPrice = stopPrice * 0.985; // 1.5% Slippage
        } else if (daysHeld >= 12) {
          exitReason = 'TIME_STOP';
          finalExitPrice = today.close * 0.985; // 1.5% Slippage
        }

        if (exitReason) {
            // Calculate PnL
            const pnl = (finalExitPrice - pos.entry_price) * pos.amount;
            const pnlPercent = ((finalExitPrice - pos.entry_price) / pos.entry_price) * 100;

            // 1. Write to trade_history
            await supabase.from('trade_history').insert({
                ticker: pos.ticker,
                entry_date: pos.entry_date,
                exit_date: today.date,
                entry_price: pos.entry_price,
                exit_price: finalExitPrice,
                pnl: pnl,
                pnl_percent: pnlPercent,
                exit_reason: exitReason
            });

            // 2. Remove from active_positions
            await supabase.from('active_positions').delete().eq('ticker', pos.ticker);

            executionLogs.push(`🛑 [EXIT] ${pos.ticker} closed via ${exitReason} at $${finalExitPrice.toFixed(2)} (PnL: $${pnl.toFixed(2)} / ${pnlPercent.toFixed(2)}%)`);
            closedCount++;
        } else {
            // Update active position state
            await supabase.from('active_positions')
              .update({ days_held: daysHeld, highest_high: highestHigh })
              .eq('ticker', pos.ticker);
            
            executionLogs.push(`⏳ [HOLD] ${pos.ticker} | Held: ${daysHeld}d | High: $${highestHigh.toFixed(2)}`);
        }
      } catch (err) {
        console.warn(`[PORTFOLIO] Management failure for ${pos.ticker}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, logs: executionLogs, closed: closedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[PORTFOLIO] Critical Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
})
