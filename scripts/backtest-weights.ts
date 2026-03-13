import { createClient } from '@supabase/supabase-js';

// 환경변수 로드
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Prediction {
  id: string;
  ticker: string;
  dna_score: number;
  predicted_direction: string;
  start_price: number;
  created_at: string;
}

// ---------------------------------------------------------
// 🧮 1. DNA 스코어 재계산 (Weights Parameterized)
// ---------------------------------------------------------
function calculateExperimentalScore(changePct: number, relVol: number, wBase: number, wMom: number, wVol: number) {
    let rawScore = wBase + (changePct * wMom) + ((relVol - 1) * wVol);
    return Math.min(Math.max(Math.round(rawScore), 0), 100);
}

// ---------------------------------------------------------
// 📈 2. Finnhub 등을 이용한 사후 가격 변동 조회 (미래 가격 추적)
// 이 예제에서는 시뮬레이션 용도로 작성되었으나, 실제 운영 시 외부 API로 Ticker의 
// created_at 이후 N일간의 Max Price를 가져와야 합니다.
// ---------------------------------------------------------
async function fetchFuturePerformance(ticker: string, startDateIso: string, startPrice: number) {
    // 실제 백테스트 시 Finnhub의 /stock/candle API 등을 사용하여 startDate 이후의 데이터를 조회합니다.
    // 여기서는 Supabase 내 보유 데이터 혹은 외부 데이터를 연동하는 틀을 제공합니다.
    // (현재는 데모 목적으로 단순 난수 변동(실제 데이터 연동 필요)을 주입합니다.)
    
    // TODO: Finnhub API Key 연동 및 과거 캔들 데이터 Fetch 로직
    // const res = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${unixStart}&to=${unixEnd}&token=${key}`);
    
    // Mock Future Data for Backtesting Setup (Replace with actual fetch)
    const mockReturnPct = (Math.random() * 30) - 10; // -10% ~ +20%
    const maxFuturePrice = startPrice * (1 + (mockReturnPct / 100));
    
    return {
        maxFuturePrice,
        maxReturnPct: mockReturnPct
    };
}

async function runBacktest() {
  console.log("🚀 Quant Engine Weights Backtesting Protocol 시작...");

  // 1. 과거 예측 데이터 조회
  const { data: predictions, error } = await supabase
    .from('ai_predictions')
    .select('*')
    .eq('persona_used', 'QUANT_ENGINE_V1') // 식별가능한 persona
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !predictions) {
    console.error("❌ 데이터를 불러올 수 없습니다:", error);
    return;
  }

  console.log(`📊 총 ${predictions.length}건의 과거 ai_predictions 데이터 스캔 시도`);

  if (predictions.length === 0) {
      console.log("⚠️ 아직 분석할 과거 데이터가 충분하지 않습니다.");
      return;
  }

  // 2. 가중치 후보군 데모 (Grid Search)
  const weightSets = [
      { base: 40, mom: 1.5, vol: 15 }, // Current Form 
      { base: 40, mom: 2.0, vol: 10 }, // 모멘텀 중시
      { base: 30, mom: 1.0, vol: 20 }, // 거래량 극도 중시
      { base: 50, mom: 1.0, vol: 10 }, // 안정형
  ];

  console.log("\n🧪 [Parameter Grid Search]");
  const results = [];

  for (const w of weightSets) {
      // 본 로직에서는 각 Ticker당 실제 수익률과, 새로운 가중치 모델이 부여한 점수 간의 상관관계(Correlation)를 분석합니다.
      let successfulPicks = 0;
      let totalPicks = 0;

      for (const p of predictions) {
         // 임시: 원래는 DB 시점의 changePct와 relVol을 따로 저장해 두어야 완벽한 재계산이 가능합니다.
         // 본 스크립트가 완성형이 되기 위해서는 해당 metric을 ai_predictions에 jsonb로 저장하는 것을 추천합니다.
         const mockChangePct = (p.dna_score - w.base) / w.mom; // 역산(추정)
         const newScore = calculateExperimentalScore(mockChangePct, 2.0, w.base, w.mom, w.vol); // relVol은 2.0으로 가정

         if (newScore > 65) {
             totalPicks++;
             // 실제 미래 가격
             const futurePerf = await fetchFuturePerformance(p.ticker, p.created_at, p.start_price);
             if (futurePerf.maxReturnPct > 5.0) { // 5% 이상 상승 시 성공으로 간주
                 successfulPicks++;
             }
         }
      }

      const winRate = totalPicks > 0 ? (successfulPicks / totalPicks) * 100 : 0;
      results.push({
          weights: `Base ${w.base} | Mom x${w.mom} | Vol x${w.vol}`,
          picks: totalPicks,
          winRate: winRate.toFixed(1) + '%'
      });
  }

  console.table(results);
  console.log("\n💡 팁: 정확한 백테스트를 위해 다음을 권장합니다.");
  console.log("1. analyze-stock.ts 실행 시 changePct, relativeVolume 원본을 ai_predictions 데이블의 raw_metrics(jsonb)에 함께 저장하세요.");
  console.log("2. fetchFuturePerformance 함수에 Finnhub 과거 캔들 API를 연동하세요.");
}

runBacktest();
