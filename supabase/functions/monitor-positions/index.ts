import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1. Helper to count Trading Days (skips weekends)
function getTradingDaysPassed(entryDateStr: string, currentDate: Date = new Date()): number {
  const entryDate = new Date(entryDateStr);
  let count = 0;
  let cur = new Date(entryDate);

  while (cur <= currentDate) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // 0: Sunday, 6: Saturday
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  
  // Exclude the entry day itself from the count if it's the same day, 
  // but for simplicity, we just return the full trading days passed minus 1.
  return Math.max(0, count - 1); 
}

async function monitorPositions() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`[🔍 monitor-positions] Starting position surveillance...`);

  // 1. Fetch active positions
  const { data: positions, error: fetchErr } = await supabase
    .from('active_positions')
    .select('*');

  if (fetchErr) {
    console.error('[Error] Failed to fetch active positions:', fetchErr);
    return { success: false, error: fetchErr.message };
  }

  if (!positions || positions.length === 0) {
    console.log('[Info] No active positions to monitor.');
    return { success: true, message: 'No active positions.' };
  }

  const results = {
    updated: 0,
    exited: 0,
    logs: [] as string[]
  };

  const now = new Date();

  // 2. Loop through and monitor each position
  for (const pos of positions) {
    try {
      // Get live price and today's high via smart-quote
      const { data: quoteRes, error: quoteErr } = await supabase.functions.invoke('smart-quote', {
        body: { ticker: pos.ticker, includeFinancials: false }
      });

      if (quoteErr || !quoteRes || !quoteRes.price) {
         results.logs.push(`[Skip] ${pos.ticker}: Live quote unavailable.`);
         continue;
      }

      const currentPrice = quoteRes.price;
      const currentHigh = quoteRes.high || currentPrice; // Fallback to current if high is missing

      // Calculate accurate days held (skipping weekends)
      const daysHeld = getTradingDaysPassed(pos.created_at, now);
      
      let newHighestHigh = pos.highest_high;
      if (currentHigh > pos.highest_high) {
         newHighestHigh = currentHigh;
      }

      // --- 🏆 Winner's Grace Logic ---
      const atr = pos.initial_atr;
      let newStopPrice = pos.current_stop_price;
      let newTargetPrice = pos.current_target_price;
      const originalHardStop = pos.entry_price - (atr * 3.0);

      // 1. Calculate the dynamic trailing stop
      let trailingStop = newHighestHigh - (atr * 4.5); // Default loose trail
      
      // If profit > 3.0x ATR, tighten the trail to 3.0x ATR distance
      if (newHighestHigh - pos.entry_price > atr * 3.0) {
          trailingStop = newHighestHigh - (atr * 3.0);
      }

      // 2. Determine which stop applies
      if (daysHeld < 3) {
          // Rule 1: First 3 days, wide Hard Stop to survive volatility
          newStopPrice = originalHardStop;
      } else {
          // Rule 2: After 3 days, transition to Trailing Stop
          // Rule 3: Never let the Trailing Stop fall below the 75% protection line of the initial risk
          const protectionLine = pos.entry_price - (atr * 3.0 * 0.75); // 0.75x of max risk
          newStopPrice = Math.max(trailingStop, protectionLine);
      }

      // 3. Execution Engine
      let exitReason = null;
      let isWin = false;

      // Check Stop Loss / Trailing Stop
      if (currentPrice <= newStopPrice) {
          exitReason = (currentPrice > pos.entry_price) ? 'TRAIL_STOP' : 'HARD_STOP';
          isWin = currentPrice > pos.entry_price;
      }
      
      // Check Target (Scale-Out or Full Exit)
      if (!pos.scaled_out && currentPrice >= newTargetPrice) {
          exitReason = 'SCALE_OUT';
          isWin = true;
          // In a real system, we would sell 50% here and reset the entry/target.
          // For simplicity in this demo, we'll treat hitting target as a full exit.
          exitReason = 'TARGET_HIT';
      }

      // Check Time Stop (20 Trading Days)
      if (!exitReason && daysHeld >= 20) {
          exitReason = 'TIME_STOP';
          isWin = currentPrice > pos.entry_price;
      }

      // --- Persist State ---
      if (exitReason) {
         // EXIT: Move to trade_history, delete from active_positions
         const pnlPercent = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;

         await supabase.from('trade_history').insert([{
             ticker: pos.ticker,
             entry_date: pos.created_at,
             exit_date: now.toISOString(),
             entry_price: pos.entry_price,
             exit_price: currentPrice,
             pnl_percent: pnlPercent,
             exit_reason: exitReason,
             is_win: isWin,
             days_held: daysHeld
         }]);

         await supabase.from('active_positions').delete().eq('id', pos.id);
         
         results.exited++;
         results.logs.push(`🚨 [EXIT: ${exitReason}] ${pos.ticker} at $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
      } else {
         // HOLD: Update highest_high, days_held, and smart stops
         await supabase.from('active_positions').update({
             highest_high: newHighestHigh,
             days_held: daysHeld,
             current_stop_price: newStopPrice,
             current_target_price: newTargetPrice
         }).eq('id', pos.id);

         results.updated++;
         results.logs.push(`✅ [HOLD] ${pos.ticker}: H=$${newHighestHigh.toFixed(2)}, Stop=$${newStopPrice.toFixed(2)}`);
      }

    } catch (err: any) {
       results.logs.push(`❌ [Error] ${pos.ticker}: ${err.message}`);
    }
  }

  return { success: true, ...results };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const result = await monitorPositions();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
