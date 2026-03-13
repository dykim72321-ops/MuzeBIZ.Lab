import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const {
      ticker, price, change, volume,
      newsHeadlines, sector, relativeVolume
    } = payload;

    if (!ticker) {
      return new Response(JSON.stringify({ error: "Ticker is required" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const CACHE_HOURS = 6;
    const { data: cachedData } = await supabase
      .from('stock_analysis_cache')
      .select('analysis')
      .eq('ticker', ticker)
      .gt('created_at', new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (cachedData) {
      return new Response(JSON.stringify(cachedData.analysis), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        status: 200,
      });
    }

    // ---------------------------------------------------------
    // 🧮 [Pure Quant Engine] 확정적 수학 공식 기반 점수 산출
    // ---------------------------------------------------------
    
    // 데이터 정규화
    const validPrice = (price && price > 0) ? price : 0;
    const changePct = parseFloat(String(change).replace(/[^0-9.-]/g, '')) || 0;
    const relVol = parseFloat(String(relativeVolume)) || 1.0;

    // 1. DNA Score 산출 (Base 40 + 모멘텀 가중치 + 거래량 스파이크 가중치)
    let rawScore = 40 + (changePct * 1.5) + ((relVol - 1) * 15);
    const dnaScore = Math.min(Math.max(Math.round(rawScore), 0), 100); // 0~100 사이로 제한

    // 2. 급등 확률 (Pop Probability): 거래량이 받쳐주는 양봉일 때 상승
    let popProb = 20 + (changePct > 0 ? 15 : 0) + (relVol > 2.0 ? 30 : (relVol > 1.0 ? 10 : 0));
    const popProbability = Math.min(Math.max(Math.round(popProb), 0), 100);

    // 3. 정량적 근거 생성 (Bull / Bear Case)
    const bullCase = [];
    const bearCase = [];
    if (relVol > 2.0) bullCase.push(`비정상적 거래량 스파이크 발생 (상대 거래량 ${relVol.toFixed(1)}배)`);
    else bearCase.push("거래량 모멘텀 부족");
    
    if (changePct > 5) bullCase.push(`강한 단기 가격 모멘텀 (+${changePct}%)`);
    else if (changePct < 0) bearCase.push(`단기 가격 추세 하락 (${changePct}%)`);

    // 4. 리스크 및 추천 등급 평가
    let riskLevel = relVol > 3.0 && changePct > 10 ? "High" : (relVol < 0.5 ? "Low" : "Medium");
    let recommendation = dnaScore >= 70 ? "Strong Buy" : (dnaScore >= 55 ? "Buy" : (dnaScore < 40 ? "Sell" : "Hold"));

    const analysis = {
      dnaScore,
      popProbability,
      bullCase: bullCase.length > 0 ? bullCase : ["특별한 상승 모멘텀 지표 없음"],
      bearCase: bearCase.length > 0 ? bearCase : ["특별한 하락 지표 없음"],
      riskLevel,
      recommendation,
      quantSummary: `수학적 퀀트 모델 분석 결과: 가격 변동성(${changePct}%) 및 상대 거래량(${relVol.toFixed(1)}x)을 가중 합산하여 DNA 스코어 ${dnaScore}점 산출됨.`
    };

    // 비동기 저장 로직 (유지)
    const saveTask = (async () => {
      try {
        await Promise.all([
          supabase.from('stock_analysis_cache').insert({ ticker, analysis }),
          supabase.from('ai_predictions').insert({
            ticker,
            dna_score: analysis.dnaScore,
            predicted_direction: analysis.dnaScore >= 55 ? 'BULLISH' : 'BEARISH',
            start_price: validPrice,
            persona_used: 'QUANT_ENGINE_V1'
          })
        ]);
      } catch (err: any) {
        console.error("   ❌ Async Save Task Failed:", err.message);
      }
    })();

    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(saveTask);
    } else {
      await saveTask;
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
