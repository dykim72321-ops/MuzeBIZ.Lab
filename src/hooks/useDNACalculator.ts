import { useMemo } from 'react';
import { calculateDNATargets, calculateEfficiencyRatio, calculateKellyWeight } from '../utils/dnaMath';
import type { HistoricalDataPoint } from '../types';

interface DNAConfig {
  buyPrice: number;
  currentPrice: number;
  currentHigh?: number;
  atr5?: number;
  buyDate: string;
  history?: HistoricalDataPoint[];
  benchmarkHistory?: HistoricalDataPoint[]; // Russell 2000 (IWM)
}

// 가격 데이터가 미로딩 상태일 때 반환하는 안전한 기본값
const LOADING_DEFAULTS = {
  dnaScore: 0,
  targetPrice: 0,
  stopPrice: 0,
  timePenalty: 0,
  daysHeld: 0,
  effectiveATR: 0,
  efficiencyRatio: 0,
  kellyWeight: 0,
  isTrailing: false,
  action: 'HOLD' as 'HOLD' | 'TIME_STOP' | 'EXIT',
  isLoading: true,
};

export function useDNACalculator({ 
  buyPrice, 
  currentPrice, 
  currentHigh = 0, 
  atr5, 
  buyDate,
  history = [],
  benchmarkHistory = []
}: DNAConfig) {
  return useMemo(() => {
    // ✅ 가격 데이터 미로딩 가드: price가 0이면 계산 불가 → 로딩 기본값 반환
    if (!currentPrice || currentPrice <= 0 || !buyPrice || buyPrice <= 0) {
      return LOADING_DEFAULTS;
    }

    // 1. Efficiency Ratio (ER) 계산
    const historicalPrices = history.map(h => h.price);
    const efficiencyRatio = calculateEfficiencyRatio(historicalPrices);
    
    // 2. 변동성 StdDev 계산
    const volatilityStdDev = history.length > 1 
      ? Math.sqrt(history.reduce((acc, h, i, arr) => {
          if (i === 0) return 0;
          return acc + Math.pow(h.price - arr[i-1].price, 2);
        }, 0) / history.length)
      : buyPrice * 0.05;

    // 3. 보유 기간 계산 (거래일 기준, 주말 제외)
    const msPerDay = 1000 * 60 * 60 * 24;
    const now = new Date();
    const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const added = new Date(buyDate);
    const utcAdded = Date.UTC(added.getUTCFullYear(), added.getUTCMonth(), added.getUTCDate());
    
    let daysHeld = 0;
    let currentUtc = utcAdded;
    while (currentUtc < utcNow) {
      currentUtc += msPerDay;
      const dayOfWeek = new Date(currentUtc).getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysHeld++;
      }
    }

    // 4. 목표가 / 손절가 계산 (Chandelier Exit + Time-based Tightening)
    const { 
      targetPrice: T, 
      stopPrice: S, 
      effectiveATR, 
      isTrailing 
    } = calculateDNATargets(
      buyPrice, 
      currentPrice, 
      currentHigh, 
      atr5,
      volatilityStdDev,
      daysHeld
    );
    
    const GAMMA = 0.8; 
    const DELTA = 1.5; 
    const LAMBDA = 2.0; 

    // 5. 모멘텀 기반 동적 시간 감가
    const decayMultiplier = Math.max(0.5, 1.5 - efficiencyRatio);
    let timePenalty = Math.min(60, daysHeld * LAMBDA * decayMultiplier);

    // "Winner's Grace": 목표가 80% 이상 혹은 초과 시 시간 페널티 50% 감면
    if (currentPrice > T * 0.8) {
      timePenalty = timePenalty * 0.5;
    }

    let aggressiveTimePenalty = timePenalty;
    if (daysHeld > 3) {
      aggressiveTimePenalty += (daysHeld - 3) * 30;
    }

    // 6. DNA 스코어 계산
    let score = 50;

    if (currentPrice >= T) {
      score = 100; 
    } else if (currentPrice >= buyPrice) {
      const denominator = T - buyPrice;
      const progress = (currentPrice === buyPrice || denominator <= 0) ? 0 : (currentPrice - buyPrice) / denominator;
      const erBonus = efficiencyRatio * 10;
      score = 50 + (50 * Math.pow(progress, GAMMA)) + erBonus - aggressiveTimePenalty;
    } else {
      const denominator = buyPrice - S;
      const fall = (denominator <= 0) ? 1 : (buyPrice - currentPrice) / denominator;
      const clampedFall = Math.min(1, fall); 
      const erPenalty = (1 - efficiencyRatio) * 15;
      score = 50 - (50 * Math.pow(clampedFall, DELTA)) - erPenalty - aggressiveTimePenalty;
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    // 7. Kelly Position Sizing (Quarter-Kelly) + Time Stop
    const riskDenominator = buyPrice - S;
    const riskRewardRatio = riskDenominator <= 0 ? 0.1 : (T - buyPrice) / riskDenominator;
    const kellyResult = calculateKellyWeight(finalScore, riskRewardRatio);
    // ✅ Kelly 상한선: 실제 투자에서 100% 이상은 불가능하므로 1.0으로 클램프
    let kellyWeight = Math.min(1.0, Math.max(0, kellyResult.weight));

    let actionFlag: 'HOLD' | 'TIME_STOP' | 'EXIT' = 'HOLD';
    
    if (kellyResult.rawKelly < 0 || isNaN(kellyResult.rawKelly)) {
      kellyWeight = 0;
      actionFlag = 'EXIT';
    } else if (daysHeld > 3) {
      kellyWeight = 0; 
      actionFlag = 'EXIT';
    } else if (kellyWeight <= 0) {
      actionFlag = 'EXIT';
    }

    return {
      dnaScore: finalScore,
      targetPrice: T,
      stopPrice: S,
      timePenalty: Number(timePenalty.toFixed(1)),
      daysHeld,
      effectiveATR,
      efficiencyRatio: Number(efficiencyRatio.toFixed(2)),
      kellyWeight,
      isTrailing,
      action: actionFlag,
      isLoading: false,
    };
  }, [buyPrice, currentPrice, currentHigh, atr5, buyDate, history]);
}


