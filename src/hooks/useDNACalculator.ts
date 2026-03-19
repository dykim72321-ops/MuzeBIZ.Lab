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
  benchmarkHistory?: HistoricalDataPoint[]; // 🆕 Russell 2000 (IWM)
}

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
    // 1. Efficiency Ratio (ER) 계산
    const historicalPrices = history.map(h => h.price);
    const efficiencyRatio = calculateEfficiencyRatio(historicalPrices);

    // 2. Relative Strength (RS) 계산
    let relativeStrength = 0;
    if (history.length > 5 && benchmarkHistory.length > 5) {
      const stockStart = history[0].price;
      const stockEnd = currentPrice;
      const stockReturn = (stockEnd / stockStart) - 1;

      const benchStart = benchmarkHistory[0].price;
      const benchEnd = benchmarkHistory[benchmarkHistory.length - 1].price;
      const benchReturn = (benchEnd / benchStart) - 1;

      relativeStrength = Number(((stockReturn - benchReturn) * 100).toFixed(2));
    }
    
    // 3. 변동성 StdDev 계산 (단순화: 가격 변동폭의 평균)
    const volatilityStdDev = history.length > 1 
      ? Math.sqrt(history.reduce((acc, h, i, arr) => {
          if (i === 0) return 0;
          return acc + Math.pow(h.price - arr[i-1].price, 2);
        }, 0) / history.length)
      : buyPrice * 0.05;

    // 3. 시간 계산 (daysHeld를 먼저 계산하여 Time-based ATR Tightening에 전달)
    // 주말(토, 일)을 제외한 실제 거래일(Trading Days) 기준
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
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0: Sunday, 6: Saturday
        daysHeld++;
      }
    }

    // 4. 고도화된 목표가/손절가 연산 (Chandelier Exit + Time-based Tightening)
    // Efficiency Ratio(ER)와 Relative Strength(RS)를 반영한 동적 익절/손절 멀티플라이어 적용
    const { 
      targetPrice: T, 
      stopPrice: S, 
      effectiveATR, 
      targetMultiplier,
      isTrailing 
    } = calculateDNATargets(
      buyPrice, 
      currentPrice, 
      currentHigh, 
      atr5,
      volatilityStdDev,
      daysHeld,
      efficiencyRatio,
      relativeStrength > 0 // 주도주 여부 (RS 양수 기준)
    );
    
    const GAMMA = 0.8; 
    const DELTA = 1.5; 
    const LAMBDA = 2.0; 

    // 5. 모멘텀 기반 동적 시간 감가 (Dynamic Momentum Decay)
    // ER(Efficiency Ratio)에 따라 감가 가속/감속: 노이즈가 심할수록(ER 0) 1.5배 감가, 추세가 깔끔할수록(ER 1) 0.5배 감가
    const decayMultiplier = Math.max(0.5, 1.5 - efficiencyRatio);
    let timePenalty = Math.min(60, daysHeld * LAMBDA * decayMultiplier);

    // 🆕 "Winner's Grace" (승자의 여유): 
    // 주가가 목표가의 80%를 넘어서거나 상회 중인 우량주(Winner)는 시간 페널티를 50% 감면하여 장기 보유 유도
    if (currentPrice > T * 0.8) {
      timePenalty = timePenalty * 0.5;
    }

    // 5. DNA 스코어 계산 (ER 가중치 적용)
    let score = 50;

    if (currentPrice >= T) {
      score = 100; 
    } else if (currentPrice >= buyPrice) {
      const progress = (currentPrice === buyPrice) ? 0 : (currentPrice - buyPrice) / (T - buyPrice);
      // ER이 높을수록(추세가 깔끔할수록) 점수 가점
      const erBonus = efficiencyRatio * 10;
      score = 50 + (50 * Math.pow(progress, GAMMA)) + erBonus - timePenalty;
    } else {
      const fall = (buyPrice - currentPrice) / (buyPrice - S);
      const clampedFall = Math.min(1, fall); 
      // ER이 낮을수록(노이즈가 심할수록) 하락장에서 감점 가중
      const erPenalty = (1 - efficiencyRatio) * 15;
      score = 50 - (50 * Math.pow(clampedFall, DELTA)) - erPenalty - timePenalty;
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    // 6. Kelly Position Sizing (Quarter-Kelly) + Time Stop
    // 손익비 R = (Target - Entry) / (Entry - Stop)
    const riskRewardRatio = (T - buyPrice) / (buyPrice - S);
    let kellyWeight = calculateKellyWeight(finalScore, riskRewardRatio);

    // Time Stop Logic: 보유 일수가 길어지면 강제로 비중 축소 경고
    let actionFlag: 'HOLD' | 'TIME_STOP' | 'EXIT' = 'HOLD';
    if (daysHeld > 14) {
      kellyWeight = Math.max(0, kellyWeight - ((daysHeld - 14) * 2)); // 14일 초과 시 매일 2%p 타격
      if (kellyWeight <= 0) {
        actionFlag = 'EXIT';
      } else {
        actionFlag = 'TIME_STOP';
      }
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
      targetMultiplier,
      kellyWeight,
      relativeStrength,
      isTrailing,
      action: actionFlag
    };
  }, [buyPrice, currentPrice, currentHigh, atr5, buyDate, history, benchmarkHistory]);
}

