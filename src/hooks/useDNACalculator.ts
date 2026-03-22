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
  rrRatio: 0,
  rejectReason: undefined as string | undefined,
  action: 'HOLD' as 'HOLD' | 'TIME_STOP' | 'EXIT' | 'REJECT',
  isLoading: true,
};

export function useDNACalculator({ 
  buyPrice, 
  currentPrice, 
  currentHigh = 0, 
  atr5, 
  buyDate,
  history = []
}: DNAConfig) {
  return useMemo(() => {
    // ✅ 가격 데이터 미로딩 가드: price가 0이면 계산 불가 → 로딩 기본값 반환
    if (!currentPrice || currentPrice <= 0 || !buyPrice || buyPrice <= 0) {
      return LOADING_DEFAULTS;
    }

    // 1. Efficiency Ratio (ER) 계산
    const historicalPrices = history.map(h => h.price);
    const efficiencyRatio = calculateEfficiencyRatio(historicalPrices);
    
    // 3. 보유 기간 계산 (거래일 기준, 주말 제외)
    const added = new Date(buyDate);
    const now = new Date();
    
    // 시간 정보를 00:00:00으로 정규화하여 일수만 계산
    const d1 = new Date(added.getFullYear(), added.getMonth(), added.getDate());
    const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let daysHeld = 0;
    const tempDate = new Date(d1);
    
    while (tempDate < d2) {
      tempDate.setDate(tempDate.getDate() + 1);
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysHeld++;
      }
    }
    
    // 만약 당일이라면 0일이지만, 24시간이 지나지 않았더라도 등록 직후는 0d로 표시되는 것이 맞음.
    // 다만 사용자가 "정확하게 추적하지 않는다"고 느낀다면, 당일 등록도 1일차로 표시하기를 원할 수도 있음.
    // 여기서는 기존 로직의 '영업일' 기준을 유지하되 계산 방식을 더 명확히 함.

    // 4. 목표가 / 손절가 계산 (Chandelier Exit + Time-based Tightening)
    const { 
      targetPrice: T, 
      stopPrice: S, 
      effectiveATR, 
      isTrailing,
      rrRatio,
      rejectReason,
    } = calculateDNATargets(
      buyPrice, 
      atr5 || 0,
      daysHeld,
      currentPrice, 
      currentHigh
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
    // ✅ Kelly 상한선: dnaMath가 0~100을 반환하므로, 상한선도 100.0(%)으로 설정
    let kellyWeight = Math.min(100.0, Math.max(0, kellyResult.weight));

    let actionFlag: 'HOLD' | 'TIME_STOP' | 'EXIT' | 'REJECT' = 'HOLD';
    
    // R/R Ratio 미달 → REJECT (시장이 먹을 자리를 안 줄 때는 진입하지 않는다)
    if (rejectReason) {
      kellyWeight = 0;
      actionFlag = 'REJECT';
    } else if (kellyResult.rawKelly < 0 || isNaN(kellyResult.rawKelly)) {
      kellyWeight = 0;
      actionFlag = 'EXIT';
    } else if (daysHeld > 3) {
      kellyWeight = 0; 
      actionFlag = 'TIME_STOP';
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
      rrRatio,
      rejectReason,
      action: actionFlag,
      isLoading: false,
    };
  }, [buyPrice, currentPrice, currentHigh, atr5, buyDate, history]);
}


