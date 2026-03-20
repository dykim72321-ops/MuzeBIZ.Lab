import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { calculateDNATargets, calculateKellyWeight } from '../src/utils/dnaMath';

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Default tickers if none provided
const DEFAULT_TICKERS = ['SNDL', 'MULN', 'IDEX', 'ZOM', 'FCEL', 'OCGN', 'BNGO', 'CTXR'];

// Webhook 전송 함수 (Discord 또는 Slack 사용 예시)
async function sendTradeAlert(ticker: string, analysis: any, quote: any) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL; // .env.local에 추가 필요
  if (!webhookUrl) return;

  const message = {
    content: `🚨 **[MuzeStock LIVE SIGNAL] ${ticker} 진입 포착!** 🚀`,
    embeds: [{
      title: `${ticker} 실전 매매 타점 분석`,
      color: 5814783, // Green color
      fields: [
        { name: "💰 현재가 / Ask / Bid", value: `$${quote.price} / $${quote.ask || 'N/A'} / $${quote.bid || 'N/A'}`, inline: true },
        { name: "🧬 DNA 스코어", value: `${analysis.dnaScore}점`, inline: true },
        { name: "⚖️ 추천 비중 (Kelly)", value: `${analysis.kellyWeight}%`, inline: true },
        { name: "🎯 목표가 (Target)", value: `$${analysis.targets.targetPrice}`, inline: true },
        { name: "🛡️ 손절가 (Stop)", value: `$${analysis.targets.stopPrice}`, inline: true },
        { name: "📊 R/R Ratio (슬리피지 반영)", value: `${analysis.rrRatio}x`, inline: true },
        { name: "📝 시스템 코멘트", value: analysis.reason }
      ]
    }]
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    console.log(`      📲 Webhook 알림 전송 완료: ${ticker}`);
  } catch (err) {
    console.error(`      ⚠️ Webhook 전송 실패:`, err);
  }
}

// 🧠 실전용 로컬 룰베이스 퀀트 엔진 (Bid/Ask & 슬리피지 반영)
function generateLiveRuleBasedAnalysis(quote: any) {
  const price = quote.price || 0;
  // API에서 Bid/Ask를 제공하지 않을 경우를 대비한 Fallback (실제 API 연동 시 필수 확인)
  const bid = quote.bid || price * 0.99; 
  const ask = quote.ask || price * 1.01;
  const change = quote.changePercent || 0;
  const relVol = quote.relativeVolume || 0;
  
  let dnaScore = 50;
  let riskScore = 50;
  
  // 1. 스프레드 리스크 검증 (호가창이 너무 비어있으면 거부)
  const spreadPercent = ((ask - bid) / price) * 100;
  if (spreadPercent > 3.0) {
    return {
      dnaScore: 10,
      targets: { targetPrice: 0, stopPrice: 0, rrRatio: 0 },
      rrRatio: 0,
      kellyWeight: 0,
      rejectReason: `호가 스프레드 과도 (${spreadPercent.toFixed(2)}%) - 유동성 위험`,
      reason: `REJECT: 매수/매도 호가 차이가 너무 커서 체결 시 확정 손실이 큽니다.`,
      riskScore: 100
    };
  }

  // 2. 초기 점수 연산
  if (change < -15) { dnaScore -= 30; riskScore += 30; }
  else if (change > 10) { dnaScore += 20; riskScore -= 10; }
  if (relVol > 2.0) { dnaScore += 15; riskScore += 10; } 
  dnaScore = Math.max(0, Math.min(100, dnaScore));

  // 3. 슬리피지를 반영한 실전 진입가 계산 (매도호가 + 0.5% 슬리피지 가정)
  const slippageRate = 0.005; // 0.5%
  const effectiveEntryPrice = ask * (1 + slippageRate);
  
  // dnaMath.ts를 통한 타점 검증 (진입가를 effectiveEntryPrice로 보수적 적용)
  const targets = calculateDNATargets(
    effectiveEntryPrice, 
    price, 
    quote.high || price, 
    undefined, 
    0, 
    0
  );

  const kelly = calculateKellyWeight(dnaScore, targets.rrRatio);

  let reason = "";
  if (targets.rejectReason) {
    reason = `시스템 진입 거부(REJECT): ${targets.rejectReason} (슬리피지 반영 시 R/R 미달)`;
    dnaScore = Math.min(dnaScore, 30);
  } else {
    reason = `Ask($${ask.toFixed(2)}) 및 슬리피지 반영 진입가($${effectiveEntryPrice.toFixed(2)}) 기준 산출 완료. R/R Ratio: ${targets.rrRatio}x.`;
  }

  return {
    dnaScore,
    targets,
    rrRatio: targets.rrRatio,
    kellyWeight: kelly.weight,
    rejectReason: targets.rejectReason,
    reason,
    riskScore
  };
}

async function masterAnalysis(ticker: string) {
  console.log(`\n🧠 [Live Master] Analyzing ${ticker}...`);

  try {
    // Stage 1: Sensing (Fetching rich market data)
    console.log(`   📡 Stage 1: Sensing... (Fetching market data for ${ticker})`);
    const { data: quote, error: quoteError } = await (supabase.functions as any).invoke('smart-quote', {
      body: { ticker }
    });

    if (quoteError || !quote) {
      throw new Error(`Sensing failed: ${quoteError?.message || 'No data'}`);
    }
    const quoteDisplay = `$${quote.price} (${quote.changePercent}%) | RelVol: ${quote.relativeVolume}x`;
    console.log(`      ✅ Data received: ${quoteDisplay}`);

    // Stage 2: Deterministic Rules... (Live Quant Engine thinking)
    console.log(`   ⚙️ Stage 2: Deterministic Rules... (Live Quant Engine thinking)`);
    
    // 분석 엔진 실행
    const analysis = generateLiveRuleBasedAnalysis(quote);
    
    if (analysis.rejectReason) {
      console.log(`      ⛔ 거부됨: ${analysis.rejectReason}`);
      return { ticker, status: 'REJECTED', analysis };
    }

    console.log(`      ✅ 승인됨: DNA ${analysis.dnaScore} | R/R ${analysis.rrRatio}x`);

    // Stage 3: Memorize (Saving results to DB)
    console.log(`   💾 Stage 3: Memorize... (Saving to daily_discovery)`);
    
    // UPSERT into daily_discovery
    const { error: saveError } = await supabase
      .from('daily_discovery')
      .upsert({
        ticker: ticker,
        price: quote.price,
        volume: quote.volume ? quote.volume.toString() : '0',
        change: quote.changePercent ? `${quote.changePercent.toFixed(2)}%` : '0%',
        sector: quote.sector || 'Unknown',
        updated_at: new Date().toISOString()
      });

    if (saveError) {
      console.warn(`      ⚠️ Failed to save to daily_discovery:`, saveError.message);
    } else {
      console.log(`      ✅ Analysis memorized.`);
    }

    // 🔥 실전 트리거: DNA 85점 이상 & R/R 비율 충족 시 알림 발송
    if (analysis.dnaScore >= 85) {
      console.log(`🚀 [Live Signal] High Conviction Detected! Sending Webhook...`);
      await sendTradeAlert(ticker, analysis, quote);
    }
    // ----------------------------

    return { ticker, status: 'PASSED', analysis };

  } catch (err: any) {
    console.error(`   ❌ Error analyzed ${ticker}:`, err.message);
    return null;
  }
}

async function runBatch() {
  const args = process.argv.slice(2);
  const tickers = args.length > 0 ? args : DEFAULT_TICKERS;

  console.log(`🚀 MuzeStock Master Algorithm: Processing ${tickers.length} tickers...`);
  
  const results = [];
  for (const ticker of tickers) {
    const result = await masterAnalysis(ticker.toUpperCase());
    if (result) results.push(result);
  }

  console.log('\n✨ Batch Analysis Completed.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  results.forEach(r => {
    if (r.status === 'PASSED') {
      console.log(`${r.ticker.padEnd(6)} | DNA: ${r.analysis.dnaScore.toString().padEnd(3)} | R/R: ${r.analysis.rrRatio.toString().padEnd(4)}x | Kelly: ${r.analysis.kellyWeight}%`);
    } else {
      console.log(`${r.ticker.padEnd(6)} | REJECTED: ${r.analysis.rejectReason}`);
    }
  });
}

runBatch();
