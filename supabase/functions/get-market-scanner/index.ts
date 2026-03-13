// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 🧮 [핵심 로직] 지수 백오프(Exponential Backoff)가 적용된 Fetch 함수
async function fetchQuoteWithRetry(ticker: string, maxRetries = 3, baseDelay = 500) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(url);
      
      // HTTP 429 (Rate Limit) 발생 시 대기 후 재시도
      if (res.status === 429) {
        attempt++;
        const delay = baseDelay * Math.pow(2, attempt); // 1초, 2초, 4초... 대기 시간 증가
        console.warn(`⚠️ [429 Rate Limit] ${ticker} 호출 지연. ${delay}ms 후 재시도 (${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // 루프 재실행
      }

      if (!res.ok) {
        console.error(`❌ [${res.status}] ${ticker} 데이터 호출 실패: ${res.statusText}`);
        return null; // 정상 에러의 경우 바로 리턴
      }
      
      const data = await res.json();
      
      // 상장 폐지되거나 유효하지 않은 티커 필터링
      if (data.c === 0 && data.dp === 0) return null;

      return {
        ticker,
        price: data.c,
        changePercent: data.dp,
        volume: data.v || 0,
        rawVolume: data.v || 0
      };

    } catch (e) {
      attempt++;
      console.error(`네트워크 오류 [${ticker}]:`, e);
      if (attempt >= maxRetries) return null;
      await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { tickers } = await req.json()
    
    if (!tickers || !Array.isArray(tickers)) {
      return new Response(JSON.stringify({ error: 'Tickers array is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 청크 사이즈 축소 (Finnhub Burst Limit 대비 더 안전한 병렬 처리)
    const CHUNK_SIZE = 3; 
    const results = [];
    
    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
      const chunk = tickers.slice(i, i + CHUNK_SIZE);
      
      // 재시도 로직이 내장된 독립적인 Promise 실행
      const chunkPromises = chunk.map(ticker => fetchQuoteWithRetry(ticker));
      const chunkResults = await Promise.all(chunkPromises);
      
      results.push(...chunkResults);

      // 청크 간 기본 딜레이 (Rate Limit 도달 자체를 늦춤)
      if (i + CHUNK_SIZE < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 333)); // 초당 약 9개 호출 수준으로 통제
      }
    }

    const validResults = results.filter(r => r !== null && r.price > 0);

    return new Response(JSON.stringify(validResults), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
