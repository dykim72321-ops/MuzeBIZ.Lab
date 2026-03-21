/**
 * ATR 기반 목표가(Target) 및 Chandelier Exit (Trailing Stop) 연산 로직
 *
 * [Design Philosophy]
 * - Target/Stop은 시장의 자연스러운 ATR을 따른다. 절대 강제 보정하지 않는다.
 * - 자연스러운 손익비가 1.5배 미만이면, 목표가를 올리는 것이 아니라 진입 자체를 REJECT한다.
 * - Fallback 변동성은 종목의 가격대에 따라 다르게 적용한다 (Tiered Fallback).
 */
export function calculateDNATargets(
  entryPrice: number,
  atr: number,
  daysHeld: number = 0,
  currentPrice: number = 0,
  currentHigh: number = 0,
  volatilityStdDev: number = 0
): {
  targetPrice: number;
  stopPrice: number;
  effectiveATR: number;
  isTrailing: boolean;
  rrRatio: number;
  rejectReason?: string;
} {
  const initialStopMultiplier = 3.0; 
  const trailingMultiplier = 4.5;    
  const targetMultiplier = 7.0;      

  const fallbackVolatility = entryPrice < 5 ? 0.20 : 0.08;
  const minAtr = entryPrice < 1 ? Math.max(0.0005, entryPrice * 0.01) : 0.01;
  const effectiveATR = Math.max(minAtr, atr && atr > 0 ? atr : entryPrice * fallbackVolatility);

  const targetPrice = entryPrice + (effectiveATR * targetMultiplier);
  const initialStop = entryPrice - (effectiveATR * initialStopMultiplier);

  let stopPrice = initialStop;
  let isTrailing = false;

  // [핵심 교정]: Trailing Stop 지연 가동 (Winner's Grace)
  if (daysHeld >= 3 || currentHigh > entryPrice + (effectiveATR * 2.0)) {
     const trailingStop = currentHigh - (effectiveATR * trailingMultiplier);
     if (trailingStop > initialStop) {
        stopPrice = trailingStop;
        isTrailing = true;
     }
  }
  
  // 하드 스탑
  stopPrice = Math.max(stopPrice, entryPrice * 0.75);
  
  if (daysHeld === 0 && currentPrice > 0) {
    stopPrice = Math.min(stopPrice, currentPrice * 0.98);
  }

  const risk = entryPrice - stopPrice;
  const reward = targetPrice - entryPrice;
  const rrRatio = risk <= 0 ? 0 : reward / risk;

  let rejectReason: string | undefined;
  if (rrRatio < 1.5) {
    rejectReason = `R/R Ratio 미달 (${rrRatio.toFixed(2)}x < 1.5x).`;
  }

  return {
    targetPrice: Number(targetPrice.toFixed(4)),
    stopPrice: Number(stopPrice.toFixed(4)),
    effectiveATR,
    isTrailing,
    rrRatio: Number(rrRatio.toFixed(2)),
    rejectReason,
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

/**
 * [Tuned DNA Algorithm]
 * 100% Quantitative scoring based on price action, volume, and liquidity.
 */
export function calculateDnaScore(
  price: number, 
  change: number, 
  volume: number, 
  avgVolume10d: number = 0
): number {
  let score = 50;

  // 1. Penny Stock Boost (Only if not in a severe crash)
  if (change >= -5) {
    if (price < 1.0) score += 15;
    else if (price < 5.0) score += 10;
  }

  // 2. Crash Penalty
  if (change < -40) score -= 60;
  else if (change < -30) score -= 50;
  else if (change < -15) score -= 30;
  else if (change < -5) score -= 15;

  // 3. Upward Momentum
  if (change > 20) score += 20;
  else if (change > 10) score += 15;
  else if (change > 3) score += 5;

  // 4. [Refined] Tiered Dollar Volume (Liquidity)
  const dollarVolume = price * volume;
  if (dollarVolume > 20000000) score += 15;      // Mega Liquidity (> $20M)
  else if (dollarVolume > 5000000) score += 10;  // High Liquidity (> $5M)
  else if (dollarVolume > 0 && dollarVolume < 500000) score -= 20;   // Death Zone

  // 5. [New] RVOL (Relative Volume) Momentum
  if (avgVolume10d > 0) {
    const rvol = volume / avgVolume10d;
    if (rvol > 3.0 && change > 0) {
      score += 15; // Breakout with volume
    } else if (rvol > 3.0 && change < 0) {
      score -= 20; // Dumping with heavy volume
    }
  }

  // 6. [New] Parabolic Extension Penalty
  if (change > 50) {
    score -= 10; // Overextended risk
  }

  return Math.min(100, Math.max(0, score));
}
