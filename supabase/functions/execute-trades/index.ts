import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function executeTrades() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`[🚀 execute-trades] Starting daily execution engine...`);

  // 1. Fetch PENDING signals
  const { data: signals, error: fetchError } = await supabase
    .from('quant_signals')
    .select('*')
    .eq('status', 'PENDING');

  if (fetchError) {
    console.error('[Error] Failed to fetch pending signals:', fetchError);
    return { success: false, error: fetchError.message };
  }

  if (!signals || signals.length === 0) {
    console.log('[Info] No pending signals found for today.');
    return { success: true, message: 'No pending signals.' };
  }

  console.log(`[Info] Found ${signals.length} pending signals for execution.`);

  const results = [];

  // 2. Process each signal
  for (const sig of signals) {
    try {
      console.log(`[Execute] Processing ${sig.ticker}...`);
      
      // Request current price from smart-quote edge function
      const { data: quoteRes, error: quoteErr } = await supabase.functions.invoke('smart-quote', {
        body: { ticker: sig.ticker, includeFinancials: false }
      });

      if (quoteErr || !quoteRes || !quoteRes.price) {
         console.warn(`[Execute] Skipping ${sig.ticker}: Could not fetch live price.`);
         continue;
      }

      const entryPrice = quoteRes.price;
      
      // Calculate realistic ATR dynamically based on historical volatility 
      // For actual implementation we should pull real ATR, but as an approximation here:
      const proxyAtr = entryPrice * 0.035; // Proxy: 3.5% daily volatility
      
      // Calculate initial "Winner's Grace" parameters
      // HARD STOP for first 3 days: 3.0x ATR
      const currentStopPrice = entryPrice - (proxyAtr * 3.0);
      const currentTargetPrice = entryPrice + (proxyAtr * 5.0); // Target at 5.0x ATR

      // 3. Insert into active_positions
      const { data: positionData, error: insertErr } = await supabase
        .from('active_positions')
        .insert([{
           ticker: sig.ticker,
           entry_price: entryPrice,
           highest_high: entryPrice,
           initial_atr: proxyAtr,
           days_held: 0,
           scaled_out: false,
           amount: 10.0, // Fixed 10% capital allocation per position
           current_stop_price: currentStopPrice,
           current_target_price: currentTargetPrice
        }])
        .select()
        .single();
        
      if (insertErr) throw insertErr;

      // 4. Mark signal as EXECUTED
      await supabase
        .from('quant_signals')
        .update({ status: 'EXECUTED' })
        .eq('id', sig.id);

      console.log(`✅ [Executed] ${sig.ticker} at $${entryPrice.toFixed(2)} (Stop: $${currentStopPrice.toFixed(2)}, Target: $${currentTargetPrice.toFixed(2)})`);
      results.push(positionData);

    } catch (err: any) {
      console.error(`❌ [Execute Error] Failed to process ${sig.ticker}:`, err.message);
    }
  }

  return { success: true, executedCount: results.length, positions: results };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const result = await executeTrades();

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
