import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || process.env.VITE_ADMIN_SECRET_KEY || '';

interface DiscoveredStock {
  ticker: string;
  price: number;
  volume: number;
  change: string;
  sector: string;
}

async function scrapeFinviz(): Promise<DiscoveredStock[]> {
  console.log('🚀 Finviz Hunter Bot 시작 (Bypass Mode)...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  
  const page = await context.newPage();
  const url = 'https://finviz.com/screener.ashx?v=111&f=sh_price_u1&o=-volume';
  
  console.log('📡 Finviz 접속 중...');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('⏳ 데이터 테이블 로딩 대기...');
    // 하드코딩된 timeout 대신, 실제 테이블 요소가 나타날 때까지 대기
    await page.waitForSelector('.table-light, .screener-body-table-nw', { timeout: 15000 });
    
    const stocks = await page.evaluate(() => {
      const allRows = Array.from(document.querySelectorAll('tr'));
      const results: any[] = [];
      
      allRows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 11) {
          const ticker = cells[1]?.textContent?.trim() || '';
          const sector = cells[3]?.textContent?.trim() || '';
          const priceText = cells[8]?.textContent?.trim() || '0';
          const change = cells[9]?.textContent?.trim() || '0%';
          const volumeText = cells[10]?.textContent?.trim() || '0';
          
          if (ticker && /^[A-Z]{1,5}$/.test(ticker) && ticker !== 'Ticker') {
            results.push({ ticker, sector, priceText, change, volumeText });
          }
        }
      });
      return results;
    });

    if (stocks.length === 0) throw new Error('데이터 추출 실패: 유효한 종목 행을 찾을 수 없습니다.');

    const normalizedStocks: DiscoveredStock[] = stocks.map((s: any) => ({
      ticker: s.ticker,
      price: parseFloat(s.priceText.replace(/[^0-9.-]/g, '')) || 0,
      volume: parseInt(s.volumeText.replace(/,/g, ''), 10) || 0,
      change: s.change,
      sector: s.sector
    }));
    
    await browser.close();
    console.log(`✅ ${normalizedStocks.length}개 종목 스크래핑 완료!`);
    return normalizedStocks;

  } catch (error) {
    await page.screenshot({ path: '/tmp/finviz_error.png' });
    console.error(`❌ 스크래핑 실패:`, error);
    await browser.close();
    return [];
  }
}

async function validateWithPythonEngine(stocks: DiscoveredStock[]): Promise<DiscoveredStock[]> {
  const tickers = stocks.map(s => s.ticker);
  console.log(`🧪 Python 퀀트 엔진에 {${tickers.length}}개 종목 검증 요청...`);
  
  const MAX_RETRIES = 3;
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    try {
      const response = await fetch('http://localhost:8000/api/validate_candidates', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ tickers })
      });
      
      if (!response.ok) throw new Error(`HTTP Status: ${response.status}`);
      
      const validTickers: string[] = await response.json();
      console.log(`🎯 검증 통과: ${validTickers.length}/${tickers.length} 종목`);
      
      return stocks.filter(s => validTickers.includes(s.ticker));

    } catch (error) {
      attempts++;
      console.warn(`⚠️ 퀀트 엔진 응답 실패 (시도 ${attempts}/${MAX_RETRIES})...`);
      if (attempts >= MAX_RETRIES) {
        // [Zero-Tolerance Policy] Fallback 없이 즉시 시스템 종료
        console.error('❌ 치명적 오류: 퀀트 엔진과의 통신이 완전히 실패했습니다. 가비지 데이터 입력을 막기 위해 프로세스를 중단합니다.');
        process.exit(1); 
      }
      // 재시도 전 2초 대기 (Exponential Backoff 적용 가능)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return []; // 구조상 도달하지 않음
}

async function saveToSupabase(stocks: DiscoveredStock[]) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  await supabase.from('daily_discovery').delete().neq('ticker', ''); // 초기화
  
  const { error } = await supabase.from('daily_discovery').upsert(
    stocks.map(s => ({
      ticker: s.ticker, price: s.price, volume: s.volume, change: s.change,
      sector: s.sector, updated_at: new Date().toISOString()
    })),
    { onConflict: 'ticker' }
  );
  
  if (error) throw new Error(`DB 저장 실패: ${error.message}`);
  console.log(`✅ ${stocks.length}개 타겟 Supabase 저장 완료`);
}

async function main() {
  try {
    const candidates = await scrapeFinviz();
    if (candidates.length === 0) {
      console.log('⚠️ 발굴된 후보 종목이 없습니다.');
      process.exit(0);
    }

    const validStocks = await validateWithPythonEngine(candidates);
    if (validStocks.length === 0) {
      console.log('⚠️ 퀀트 엔진 검증을 통과한 종목이 없습니다.');
      process.exit(0);
    }

    await saveToSupabase(validStocks);
    console.log('🚀 Finviz Hunter 파이프라인 정상 종료');

  } catch (error) {
    console.error('❌ 파이프라인 실행 중 치명적 오류 발생:', error);
    process.exit(1);
  }
}

main();
