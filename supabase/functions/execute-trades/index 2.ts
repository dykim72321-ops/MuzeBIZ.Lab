import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendDiscordNotification(content: string, type: 'INFO' | 'SUCCESS' | 'ALERT' | 'ERROR' = 'INFO') {
  const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) return;

  const emoji = { INFO: 'ℹ️', SUCCESS: '✅', ALERT: '🚨', ERROR: '❌' }[type];

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

async function executeTrades() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`[🚀 execute-trades] Starting daily execution engine...`);

  const { data: signals, error: fetchError } = await supabase
    .from('quant_signals')
    .select('*')
    .eq('status', 'PENDING');

  if (fetchError) throw fetchError;
  if (!signals || signals.length === 0) return { success: true, message: 'No pending signals.' };

  const results = [];

  // Parallel Execution using Promise.all
  await Promise.all(signals.map(async (sig) => {
    try {
      const { data: quoteRes, error: quoteErr } = await supabase.functions.invoke('smart-quote', {
        body: { ticker: sig.ticker, includeFinancials: false }
      });

      if (quoteErr || !quoteRes || !quoteRes.price) {
         console.warn(`[Execute] Skipping $${sig.ticker}: Stale price.`);
         return;
      }

      const entryPrice = quoteRes.price;
      const proxyAtr = entryPrice * 0.035;
      const currentStopPrice = entryPrice - (proxyAtr * 3.0);
      const currentTargetPrice = entryPrice + (proxyAtr * 5.0);

      const { data: posData, error: insErr } = await supabase
        .from('active_positions')
        .insert([{
           ticker: sig.ticker, entry_price: entryPrice, highest_high: entryPrice,
           initial_atr: proxyAtr, days_held: 0, scaled_out: false, amount: 10.0,
           current_stop_price: currentStopPrice, current_target_price: currentTargetPrice,
           last_monitored_at: new Date().toISOString()
        }])
        .select().single();
        
      if (insErr) throw insErr;

      await supabase.from('quant_signals').update({ status: 'EXECUTED' }).eq('id', sig.id);

      await sendDiscordNotification(
        `🚀 **ENTRY EXECUTED**\nTicker: $${sig.ticker}\nPrice: $${entryPrice.toFixed(2)}\nStop: $${currentStopPrice.toFixed(2)}\nTarget: $${currentTargetPrice.toFixed(2)}`,
        'SUCCESS'
      );

      results.push(posData);
    } catch (err: any) {
      console.error(`Error processing ${sig.ticker}:`, err.message);
    }
  }));

  return { success: true, count: results.length };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const result = await executeTrades();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
