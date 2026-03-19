/**
 * ATR 기반 목표가(Target) 및 Chandelier Exit (Trailing Stop) 연산 로직
 */
export function calculateDNATargets(
  entryPrice: number, 
  currentPrice: number,
  currentHigh: number = 0,
  atr5?: number,
  volatilityStdDev: number = 0,
  daysHeld: number = 0
) {
  // 1. Fallback: 데이터 없을 시 매수가의 20% 변동성 가정 (최소 0.01로 0 나누기 방지)
  const effectiveATR = Math.max(0.01, atr5 && atr5 > 0 ? atr5 : entryPrice * 0.20);
  
  // 2. 동적 목표가 (Target) - [Optimized] 5.0 ATR
  const targetPrice = entryPrice + (effectiveATR * 5.0); 

  // 3. 동적 손절가 멀티플라이어 (Chandelier Exit 기반)
  // 1. Time-based ATR Tightening (시작 3.0 -> 최저 1.8)
  let multiplierBase = 3.0;
  if (daysHeld > 1) {
    // 1일 경과 후부터 가파르게 타이트닝
    multiplierBase = Math.max(1.8, 3.0 - (daysHeld * 0.5));
  }
  
  // 변동성 표준편차에 따른 미세 조정
  const volatilityFactor = Math.min(1.0, volatilityStdDev / (entryPrice * 0.05));
  const dynamicMultiplier = multiplierBase + (volatilityFactor * 0.5); 

  // 4. Chandelier Exit (Trailing Stop)
  // 2. 초기 손절선 대폭 완화 (3.0 ATR)
  const initialStop = entryPrice - (effectiveATR * 3.0);
  // 현재가/최고가 기준 트레일링 스탑
  const highSoFar = Math.max(currentHigh, currentPrice, entryPrice);
  const trailingStop = highSoFar - (effectiveATR * dynamicMultiplier);
  
  // 최종 손절가는 초기 손절가와 트레일링 스탑 중 높은 것 (단, 매수가의 50% 하방 방어)
  const stopPrice = Math.max(initialStop, trailingStop, entryPrice * 0.5);

  return {
    targetPrice: Number(targetPrice.toFixed(4)),
    stopPrice: Number(stopPrice.toFixed(4)),
    effectiveATR,
    isTrailing: trailingStop > initialStop
  };
}

/**
 * Kaufman's Efficiency Ratio (ER)
 * 추세의 순수 이동거리를 총 변동량으로 나눈 값 (1: 직선 추세, 0: 노이즈)
 */
export function calculateEfficiencyRatio(prices: number[]): number {
  if (prices.length < 2) return 1.0;
  
  const netChange = Math.abs(prices[prices.length - 1] - prices[0]);
  let sumVolatility = 0;
  
  for (let i = 1; i < prices.length; i++) {
    sumVolatility += Math.abs(prices[i] - prices[i - 1]);
  }
  
  return sumVolatility === 0 ? 1.0 : netChange / sumVolatility;
}

/**
 * Fractional Kelly Criterion (Quarter-Kelly)
 * 포지션 사이징 제안
 */
export function calculateKellyWeight(winProb: number, winLossRatio: number): { weight: number, rawKelly: number } {
  // f* = p - (1-p)/r
  // 손익비(r)를 최대 5.0으로 캡핑하여 과도한 비중 실림 방지 (안전장치)
  const r = Math.min(5.0, Math.max(0.1, winLossRatio));
  const p = winProb / 100;
  const kelly = p - (1 - p) / r;
  
  const quarterKelly = isNaN(kelly) ? 0 : Math.max(0, kelly / 4);
  return {
    weight: Number((quarterKelly * 100).toFixed(1)),
    rawKelly: isNaN(kelly) ? 0 : kelly
  };
}
