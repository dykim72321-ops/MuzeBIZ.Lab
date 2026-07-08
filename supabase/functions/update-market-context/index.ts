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
    const NEWS_API_KEY = Deno.env.get('NEWS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing environment variables: SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY');
    }

    // 1. Fetch Top Headlines (Politics, Business)
    let sourceCount = 0;

    // Fallback news if no API key provided (Dev mode)
    if (!NEWS_API_KEY) {
       console.warn("No NEWS_API_KEY provided. Using mock news data.");
       sourceCount = 3;
    } else {
       try {
          const newsResponse = await fetch(`https://newsapi.org/v2/top-headlines?country=us&category=business&apiKey=${NEWS_API_KEY}`);
          const newsData = await newsResponse.json();
          if (newsData.articles) {
             sourceCount = newsData.articles.length;
          }
       } catch (err) {
          console.error("Failed to fetch news:", err);
          throw new Error("News fetch failed");
       }
    }

    // 2. Summarize with OpenAI (제거됨 - 하드코딩된 써머리 반환)
    const summary = "현재 시장 환경 분석: 글로벌 금리 인하 기대감과 기술주/AI 섹터의 강세, 중동 지정학적 리스크 혼재 상황으로 변동성 장세가 지속 중입니다. (기본 모드 분석 결과)";

    // 3. Store in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error } = await supabase
      .from('market_context')
      .insert({
        summary: summary,
        source_count: sourceCount
      });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
