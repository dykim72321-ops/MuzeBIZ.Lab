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
  currentPrice: number,
  currentHigh: number = 0,
  atr5?: number,
  volatilityStdDev: number = 0,
  daysHeld: number = 0
): {
  targetPrice: number;
  stopPrice: number;
  effectiveATR: number;
  isTrailing: boolean;
  rrRatio: number;
  rejectReason?: string; // 손익비 미달 또는 논리 오류 시 사유
} {
  // ─────────────────────────────────────────────────────────────
  // STEP 1. Tiered Fallback: 종목 가격대에 따라 기본 변동성 분리
  //   - 페니스탁($5 미만): 20% 유지 (노이즈 쉐이크아웃 방어)
  //   - 일반 스윙($5 이상): 8% 적용 (정교한 타점)
  // ─────────────────────────────────────────────────────────────
  const fallbackVolatility = entryPrice < 5 ? 0.20 : 0.08;
  const minAtr = entryPrice < 1 ? Math.max(0.0005, entryPrice * 0.01) : 0.01;
  const effectiveATR = Math.max(minAtr, atr5 && atr5 > 0 ? atr5 : entryPrice * fallbackVolatility);

  // ─────────────────────────────────────────────────────────────
  // STEP 2. 자연스러운 목표가 계산 (ATR × 4.0 — 강제 보정 없음)
  // ─────────────────────────────────────────────────────────────
  const targetPrice = entryPrice + (effectiveATR * 4.0);

  // ─────────────────────────────────────────────────────────────
  // STEP 3. 손절가 계산 (Chandelier Exit + Time-based Tightening)
  // ─────────────────────────────────────────────────────────────
  let multiplierBase = 2.5;
  if (daysHeld > 1) {
    multiplierBase = Math.max(1.5, 2.5 - (daysHeld * 0.4));
  }

  const volatilityFactor = Math.min(1.0, volatilityStdDev / (entryPrice * 0.05));
  const dynamicMultiplier = multiplierBase + (volatilityFactor * 0.5);

  const initialStop = entryPrice - (effectiveATR * 2.5);
  const highSoFar = Math.max(currentHigh, currentPrice, entryPrice);
  const trailingStop = highSoFar - (effectiveATR * dynamicMultiplier);
  
  // 손절가: 매수가의 50% 하방 방어선 유지
  let stopPrice = Math.max(initialStop, trailingStop, entryPrice * 0.5);
  
  // 손절가는 현재가를 반드시 하회해야 함 (직격 손절 방지)
  stopPrice = Math.min(stopPrice, currentPrice * 0.98);

  // ─────────────────────────────────────────────────────────────
  // STEP 4. R/R Ratio 검증 및 REJECT 로직
  //   [핵심 원칙] 손익비 미달 시 목표가를 올리지 않는다.
  //   대신 rejectReason을 반환하여 상위 로직에서 REJECT 처리한다.
  // ─────────────────────────────────────────────────────────────
  const risk = entryPrice - stopPrice;
  const reward = targetPrice - entryPrice;
  const rrRatio = risk <= 0 ? 0 : reward / risk;

  let rejectReason: string | undefined;
  if (rrRatio < 1.5) {
    rejectReason = `R/R Ratio 미달 (${rrRatio.toFixed(2)}x < 1.5x). ATR 기반 목표가가 리스크 대비 충분한 수익 구간에 형성되지 않음. 진입 회피 권고.`;
  }
  if (stopPrice >= currentPrice) {
    rejectReason = `손절가(${stopPrice.toFixed(4)})가 현재가(${currentPrice.toFixed(4)}) 이상으로 설정 불가. 진입 회피 권고.`;
  }

  return {
    targetPrice: Number(targetPrice.toFixed(4)),
    stopPrice: Number(stopPrice.toFixed(4)),
    effectiveATR,
    isTrailing: trailingStop > initialStop,
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
