/**
 * ATR 기반 목표가(Target) 및 Chandelier Exit (Trailing Stop) 연산 로직
 */
export function calculateDNATargets(
  entryPrice: number, 
  currentPrice: number,
  currentHigh: number = 0,
  atr5?: number,
  volatilityStdDev: number = 0,
  daysHeld: number = 0,
  efficiencyRatio: number = 0.5,
  isRelativeStrong: boolean = false
) {
  // 1. Fallback: 데이터 없을 시 매수가의 20% 변동성 가정
  const effectiveATR = atr5 && atr5 > 0 ? atr5 : entryPrice * 0.20;
  
  // 2. 동적 목표가 (Target) - ER(Efficiency Ratio) 기반 가변 멀티플라이어 (2.0 ~ 3.0)
  // 추세가 깔끔할수록(ER이 높을수록) 더 높은 수익을 추구
  const targetMultiplier = 2.0 + (Math.max(0, Math.min(1, efficiencyRatio)) * 1.0);
  const targetPrice = entryPrice + (effectiveATR * targetMultiplier);

  // 3. 동적 손절가 멀티플라이어 (Chandelier Exit 기반)
  // Grace Period: 주도주(RS가 높음)인 경우 7일, 아니면 5일간 초기 변동성 허용
  const gracePeriod = isRelativeStrong ? 7 : 5;
  
  let multiplierBase = 2.0;
  if (daysHeld > gracePeriod) {
    // 유예 기간 초과 시 하루마다 0.1씩 멀티플라이어 감소 (최소 1.2까지 - Shakeout 방지)
    multiplierBase = Math.max(1.2, 2.0 - ((daysHeld - gracePeriod) * 0.1));
  }
  
  // 변동성 표준편차에 따른 미세 조정
  const volatilityFactor = Math.min(1.0, volatilityStdDev / (entryPrice * 0.05));
  const dynamicMultiplier = multiplierBase + (volatilityFactor * 1.0); 

  // 4. Chandelier Exit (Trailing Stop)
  // 매수가 기준 초기 손절선
  const initialStop = entryPrice - (effectiveATR * 1.5);
  // 현재가/최고가 기준 트레일링 스탑
  const highSoFar = Math.max(currentHigh, currentPrice, entryPrice);
  const trailingStop = highSoFar - (effectiveATR * dynamicMultiplier);
  
  // 최종 손절가는 초기 손절가와 트레일링 스탑 중 높은 것 (단, 매수가의 50% 하방 방어)
  const stopPrice = Math.max(initialStop, trailingStop, entryPrice * 0.5);

  return {
    targetPrice: Number(targetPrice.toFixed(4)),
    stopPrice: Number(stopPrice.toFixed(4)),
    effectiveATR,
    targetMultiplier: Number(targetMultiplier.toFixed(2)),
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
export function calculateKellyWeight(winProb: number, winLossRatio: number): number {
  // f* = p - (1-p)/r
  // 손익비(r)를 최대 5.0으로 캡핑하여 과도한 비중 실림 방지 (안전장치)
  const r = Math.min(5.0, Math.max(0.1, winLossRatio));
  const p = winProb / 100;
  const kelly = p - (1 - p) / r;
  
  // 보수적 운용을 위한 Quarter-Kelly 적용 (최대 25% 제한)
  const quarterKelly = Math.max(0, kelly / 4);
  return Number((quarterKelly * 100).toFixed(1));
}
