import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- 📢 Discord Notification Utility ---
async function sendDiscordNotification(content: string, type: 'INFO' | 'SUCCESS' | 'ALERT' | 'ERROR' = 'INFO') {
  const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) return;

  const emoji = {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ALERT: '🚨',
    ERROR: '❌'
  }[type];

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${emoji} **[MuzeBIZ-Bot]** ${content}`,
        username: 'Muze Quant Execution'
      })
    });
  } catch (err) {
    console.error('[Discord] Failed to send notification:', err);
  }
}

// --- 📅 Trading Day Helper ---
function getTradingDaysPassed(entryDateStr: string, currentDate: Date = new Date()): number {
  const entryDate = new Date(entryDateStr);
  let count = 0;
  const cur = new Date(entryDate);

  while (cur <= currentDate) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(0, count - 1);
}

// --- 🔄 Parallel Execution Helper (Chunking) ---
async function processInChunks<T>(items: T[], chunkSize: number, processor: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(processor));
  }
}

async function monitorPositions() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`[🔍 monitor-positions] Initializing parallel surveillance...`);

  // 1. Fetch active positions (Filtering out recently monitored to prevent overlap)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: positions, error: fetchErr } = await supabase
    .from('active_positions')
    .select('*')
    .or(`last_monitored_at.lt.${fiveMinutesAgo},last_monitored_at.is.null`);

  if (fetchErr) throw fetchErr;
  if (!positions || positions.length === 0) return { success: true, message: 'No positions require monitoring.' };

  // 2. Early Market Open Check (Short-circuit)
  // We check one ticker to see if data is stale or if market is closed
  const testTicker = positions[0].ticker;
  const { data: marketCheck } = await supabase.functions.invoke('smart-quote', {
     body: { ticker: testTicker, includeFinancials: false }
  });
  
  // Logic: If the quote source explicitly returns "Closed" or if we detect 0 volume/stale price
  // (In a real implementation, we'd use a dedicated Calendar API like Alpaca)
  if (marketCheck && marketCheck.marketStatus === 'CLOSED') {
      console.log(`[⏸️ Short-circuit] Market is closed. Skipping monitoring.`);
      return { success: true, status: 'MARKET_CLOSED' };
  }

  const results = { updated: 0, exited: 0, logs: [] as string[] };
  const now = new Date();

  // 3. Parallel Processing with Chunking (Prevent Timeout)
  await processInChunks(positions, 5, async (pos) => {
    try {
      const { data: quoteRes, error: quoteErr } = await supabase.functions.invoke('smart-quote', {
        body: { ticker: pos.ticker, includeFinancials: false }
      });

      if (quoteErr || !quoteRes || !quoteRes.price) return;

      const currentPrice = quoteRes.price;
      const currentHigh = quoteRes.high || currentPrice;
      const daysHeld = getTradingDaysPassed(pos.created_at, now);
      
      let newHighestHigh = pos.highest_high;
      if (currentHigh > pos.highest_high) newHighestHigh = currentHigh;

      const atr = pos.initial_atr;
      let newStopPrice = pos.current_stop_price;
      const newTargetPrice = pos.current_target_price;
      const originalHardStop = pos.entry_price - (atr * 3.0);

      // Trailing Stop Logic
      let trailingStop = newHighestHigh - (atr * 4.5);
      if (newHighestHigh - pos.entry_price > atr * 3.0) {
          trailingStop = newHighestHigh - (atr * 3.0);
      }

      if (daysHeld < 3) {
          newStopPrice = originalHardStop;
      } else {
          const protectionLine = pos.entry_price - (atr * 3.0 * 0.75);
          newStopPrice = Math.max(trailingStop, protectionLine);
      }

      let exitReason = null;
      let isWin = false;

      if (currentPrice <= newStopPrice) {
          exitReason = (currentPrice > pos.entry_price) ? 'TRAIL_STOP' : 'HARD_STOP';
          isWin = currentPrice > pos.entry_price;
      } else if (!pos.scaled_out && currentPrice >= newTargetPrice) {
          exitReason = 'TARGET_HIT';
          isWin = true;
      } else if (daysHeld >= 20) {
          exitReason = 'TIME_STOP';
          isWin = currentPrice > pos.entry_price;
      }

      if (exitReason) {
         const pnlPercent = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
         await supabase.from('trade_history').insert([{
             ticker: pos.ticker, entry_date: pos.created_at, exit_date: now.toISOString(),
             entry_price: pos.entry_price, exit_price: currentPrice, pnl_percent: pnlPercent,
             exit_reason: exitReason, is_win: isWin, days_held: daysHeld
         }]);
         await supabase.from('active_positions').delete().eq('id', pos.id);
         
         await sendDiscordNotification(
           `🚨 **EXIT [${exitReason}]**\nTicker: $${pos.ticker}\nPrice: $${currentPrice.toFixed(2)}\nPnL: **${pnlPercent.toFixed(2)}%**`,
           isWin ? 'SUCCESS' : 'ALERT'
         );
         results.exited++;
      } else {
         await supabase.from('active_positions').update({
             highest_high: newHighestHigh,
             days_held: daysHeld,
             current_stop_price: newStopPrice,
             last_monitored_at: now.toISOString()
         }).eq('id', pos.id);
         results.updated++;
      }
    } catch (err: any) {
       console.error(`Error monitoring ${pos.ticker}:`, err.message);
    }
  });

  return { success: true, ...results };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const result = await monitorPositions();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
