import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
        username: 'Muze Quant Scanner'
      })
    });
  } catch (err) {
    console.error('[Discord] Failed to send notification:', err);
  }
}

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 1. [Math Engine] EMA True Range (지수 평활 실제 변동성)
 */
function calculateTrueRange(current: Candle, prev: Candle): number {
  const hl = current.high - current.low;
  const hc = Math.abs(current.high - prev.close);
  const lc = Math.abs(current.low - prev.close);
  return Math.max(hl, hc, lc);
}

/**
 * 2. [Math Engine] 동적 DNA Score (Z-Score & 상대 지표 기반)
 */
function calculateDynamicDnaScore(
  changePercent: number, 
  volume: number, 
  avgVolume20d: number,
  atrPercent: number 
): number {
  let score = 50;
  const moveRatio = (changePercent / 100) / (atrPercent || 0.01); 

  if (moveRatio > 0) {
    score += Math.min(25, moveRatio * 5); 
  } else {
    score -= Math.min(40, Math.abs(moveRatio) * 10); 
  }

  const rvol = volume / (avgVolume20d || 1);
  if (rvol >= 3.0 && changePercent > 0) score += 20;      
  else if (rvol >= 3.0 && changePercent < 0) score -= 25; 
  else if (rvol < 0.5) score -= 15;                       

  if (moveRatio > 5.0) score -= 15; 

  return Math.min(100, Math.max(0, score));
}

/**
 * 3. [Webhook] Send alert to Discord
 */
async function sendDiscordWebhook(url: string, payload: any) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('[SCANNER] Webhook send failed:', err);
  }
}

async function fetchHistory(ticker: string): Promise<Candle[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;
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

async function fetchNews(ticker: string): Promise<string[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.news || []).map((item: any) => `${item.title}: ${item.publisher}`).slice(0, 5);
}

async function analyzeSentiment(ticker: string, news: string[]): Promise<{ decision: 'PASS' | 'FAIL', reasoning: string }> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey || news.length === 0) return { decision: 'PASS', reasoning: 'AI 분석 생략 (뉴스 없음 or API 키 없음)' };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional quant analyst. Analyze the following news for a stock and decide if it is safe to trade. Evade stocks with bankruptcy, delisting, or major scandals. Output JSON: { "decision": "PASS" | "FAIL", "reasoning": "brief explanation in Korean" }' },
          { role: 'user', content: `Ticker: ${ticker}\nNews:\n${news.join('\n')}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await res.json();
    const result = JSON.parse(data.choices[0].message.content);
    return result;
  } catch (err) {
    console.error('[AI] Sentiment analysis failed:', err);
    return { decision: 'PASS', reasoning: 'AI 엔진 오류로 인한 패스 자동 승인' };
  }
}
  
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // 0. Fetch Settings from DB
    const { data: settings } = await supabase
      .from('system_settings')
      .select('alert_threshold, webhook_url')
      .single();
      
    const ALERT_THRESHOLD = settings?.alert_threshold ?? 85;
    const DISCORD_WEBHOOK = settings?.webhook_url ?? Deno.env.get('DISCORD_WEBHOOK_URL');

    const { tickers = ['SNDL', 'MULN', 'IDEX', 'ZOM', 'FCEL', 'AMC', 'BB', 'BNGO', 'CLOV', 'CTXR', 'GME', 'LCID', 'NKLA', 'OCGN', 'OPEN', 'SOFI'] } = await req.json().catch(() => ({}));
    
    console.log(`[SCANNER] Starting robust quant scan for ${tickers.length} tickers...`);
    await sendDiscordNotification(`Starting robust quant scan for ${tickers.length} tickers.`, 'INFO');

    const signals = [];

    for (const ticker of tickers) {
      try {
        const candles = await fetchHistory(ticker);
        if (!candles || candles.length < 30) continue;

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // 1. Calculate EMA ATR (14d)
        let emaAtr = 0;
        // Start from earlier candles to seed EMA
        for (let i = 1; i < candles.length; i++) {
            const tr = calculateTrueRange(candles[i], candles[i-1]);
            if (emaAtr === 0) emaAtr = tr;
            else emaAtr = (tr - emaAtr) * (2 / (14 + 1)) + emaAtr;
        }

        // 2. Score & Metrics
        const change = ((current.close - prev.close) / prev.close) * 100;
        const atrPercent = (emaAtr / prev.close);
        const avgVol20 = candles.slice(-21, -1).reduce((sum, c) => sum + c.volume, 0) / 20;
        const rvol = current.volume / Math.max(1, avgVol20);
        
        const dnaScore = calculateDynamicDnaScore(change, current.volume, avgVol20, atrPercent);

        // 3. MA20 Slope Filter
        const sma20_today = candles.slice(-20).reduce((sum, c) => sum + c.close, 0) / 20;
        const sma20_yesterday = candles.slice(-21, -1).reduce((sum, c) => sum + c.close, 0) / 20;
        const isTrendUp = sma20_today > sma20_yesterday;

        // 4. Robust Conditions (DNA >= 70, RVOL > 2.0, Close > SMA20, Slope > 0)
        if (dnaScore >= 70 && rvol > 2.0 && current.close > sma20_today && isTrendUp) {
            console.log(`🔥 [SIGNAL] ${ticker} Passed! Score: ${dnaScore.toFixed(0)}, RVOL: ${rvol.toFixed(2)}x, ATR: ${(atrPercent*100).toFixed(2)}%`);
            signals.push({
                ticker,
                signal_date: current.date,
                dna_score: Number(dnaScore.toFixed(0)),
                rvol: Number(rvol.toFixed(2)),
                target_entry_action: 'BUY_OPEN',
                status: 'PENDING'
            });

            // [Smart Filter] AI Sentiment Analysis for high confidence signals
            let aiDecision = { decision: 'PASS', reasoning: 'AI 분석 임계치 미달' };
            if (dnaScore >= ALERT_THRESHOLD) {
                console.log(`🧠 [AI] Fetching news and analyzing sentiment for ${ticker}...`);
                const news = await fetchNews(ticker);
                aiDecision = await analyzeSentiment(ticker, news);
                console.log(`🧠 [AI] Result for ${ticker}: ${aiDecision.decision} - ${aiDecision.reasoning}`);
            }

            // [Webhook] Dynamic Threshold & AI Approval
            if (dnaScore >= ALERT_THRESHOLD) {
              if (DISCORD_WEBHOOK && aiDecision.decision === 'PASS') {
                const payload = {
                  embeds: [{
                    title: `🚀 ${ALERT_THRESHOLD <= 75 ? 'SURGE' : 'STRONG BUY'} SIGNAL: ${ticker}`,
                    color: dnaScore >= 90 ? 15277667 : 3447003, // Gold if >= 90
                    description: `**AI Smart Filter**: ✅ PASS\n> ${aiDecision.reasoning}`,
                    fields: [
                      { name: "DNA Score", value: dnaScore.toFixed(0), inline: true },
                      { name: "Current Price", value: `$${current.close.toFixed(2)}`, inline: true },
                      { name: "RVOL", value: `${rvol.toFixed(2)}x`, inline: true },
                      { name: "Volatility (ATR)", value: `${(atrPercent*100).toFixed(2)}%`, inline: true }
                    ],
                    footer: { text: `MuzeStock.Lab Execution Engine (Threshold: ${ALERT_THRESHOLD})` },
                    timestamp: new Date().toISOString()
                  }]
                };
                await sendDiscordWebhook(DISCORD_WEBHOOK, payload);
              } else if (aiDecision.decision === 'FAIL') {
                console.log(`🚫 [AI] Signal rejected by sentiment filter: ${ticker}`);
                await sendDiscordNotification(`[AI Reject] ${ticker} rejected: ${aiDecision.reasoning}`, 'ALERT');
              }
            }
        }
      } catch (err) {
        console.warn(`[SCANNER] Error processing ${ticker}:`, err);
        await sendDiscordNotification(`Error processing ${ticker}: ${err.message}`, 'ERROR');
      }
    }

    if (signals.length > 0) {
      const { error } = await supabase
        .from('quant_signals')
        .upsert(signals, { onConflict: 'ticker,signal_date' });
      
      if (error) {
        throw error;
      }
      console.log(`✅ [SCANNER] Successfully queued ${signals.length} signals.`);
      await sendDiscordNotification(`Successfully queued ${signals.length} new signals.`, 'SUCCESS');
    } else {
      console.log(`[SCANNER] No new signals found.`);
      await sendDiscordNotification(`No new signals found during this scan.`, 'INFO');
    }

    return new Response(JSON.stringify({ success: true, signals_found: signals.length, data: signals }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[SCANNER] Critical Error:', error);
    await sendDiscordNotification(`Critical Error during scan: ${error.message}`, 'ERROR');
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
})
