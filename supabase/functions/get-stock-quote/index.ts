// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALPHA_VANTAGE_API_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY")
const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const QUOTE_CACHE_MINUTES = 5 // Faster updates for prices
const OVERVIEW_CACHE_HOURS = 24

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30', // Edge Cache: 1 min, background revalidate
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker } = await req.json()
    if (!ticker) throw new Error("Ticker is required")

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const now = new Date()
    
    // 1. Check cache
    const { data: cached } = await supabase
      .from('stock_cache')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .single()

    let quoteData = cached?.quote_data
    let overviewData = cached?.overview_data
    let cashFlowData = cached?.cash_flow_data
    let balanceSheetData = cached?.balance_sheet_data
    let sentimentData = cached?.sentiment_data
    
    const cacheTime = cached ? new Date(cached.updated_at) : null
    const minutesSinceUpdate = cacheTime ? (now.getTime() - cacheTime.getTime()) / (1000 * 60) : 999
    
    let needsPriceRefresh = minutesSinceUpdate > QUOTE_CACHE_MINUTES
    let needsDeepAuditRefresh = minutesSinceUpdate > OVERVIEW_CACHE_HOURS * 60

    // 2. Fetch High-Reliability Price (Finnhub)
    if (needsPriceRefresh && FINNHUB_API_KEY) {
      console.log(`📡 Fetching real-time price for ${ticker} from Finnhub...`)
      try {
        const fhRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`)
        const fhData = await fhRes.json()
        if (fhData.c > 0) {
          // Map to Alpha Vantage style format for compatibility
          quoteData = {
            "Global Quote": {
              "01. symbol": ticker.toUpperCase(),
              "05. price": fhData.c.toString(),
              "10. change percent": `${fhData.dp}%`,
              "06. volume": fhData.v.toString()
            }
          }
          needsPriceRefresh = false
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`Finnhub fetch failed for ${ticker}:`, message)
      }
    }

    // 3. Fetch Deep Financials (Alpha Vantage) - ONLY IF NEEDED AND ASYNC RESILIENT
    if (needsDeepAuditRefresh && ALPHA_VANTAGE_API_KEY) {
      console.log(`💰 Fetching deep audit for ${ticker} from Alpha Vantage...`)
      try {
        // We fetch Overview first. If this fails due to rate limit, we skip the rest.
        const ovUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`
        const ovRes = await fetch(ovUrl)
        const ovRaw = await ovRes.json()
        
        if (ovRaw.Symbol) {
          overviewData = ovRaw
          
          // Only fetch financials if overview succeeded (means no rate limit hit yet)
          const cfUrl = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`
          const bsUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`
          const [cfRes, bsRes] = await Promise.all([fetch(cfUrl), fetch(bsUrl)])
          
          const cfRaw = await cfRes.json()
          const bsRaw = await bsRes.json()
          
          if (cfRaw.symbol) cashFlowData = cfRaw
          if (bsRaw.symbol) balanceSheetData = bsRaw
          
          // 4. Fetch News Sentiment (Optional but highly priority for AI)
          const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`
          const newsRes = await fetch(newsUrl)
          const newsRaw = await newsRes.json()
          if (newsRaw.feed) sentimentData = newsRaw

          needsDeepAuditRefresh = false
        } else {
          console.warn(`Alpha Vantage Overview failed for ${ticker} (Rate limited?)`, ovRaw)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Alpha Vantage error for ${ticker}:`, message)
      }
    }

    // 4. Update Cache (Partial updates allowed)
    await supabase
      .from('stock_cache')
      .upsert({
        ticker: ticker.toUpperCase(),
        quote_data: quoteData,
        overview_data: overviewData,
        cash_flow_data: cashFlowData,
        balance_sheet_data: balanceSheetData,
        sentiment_data: sentimentData,
        updated_at: now.toISOString()
      }, { onConflict: 'ticker' })

    return new Response(JSON.stringify({ 
      quote: quoteData, 
      overview: overviewData,
      cashFlow: cashFlowData,
      balanceSheet: balanceSheetData,
      sentiment: sentimentData,
      institutional: cached?.institutional_data || null,
      isRateLimited: needsDeepAuditRefresh && ALPHA_VANTAGE_API_KEY // Inform frontend
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
