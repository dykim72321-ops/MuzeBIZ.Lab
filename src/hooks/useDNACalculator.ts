import { useMemo } from 'react';

interface DNAConfig {
  buyPrice: number;
  currentPrice: number;
  atr5?: number; // Supabase에서 내려주는 5일 평균 변동폭
  buyDate: string; // ISO String 형태
}

export function useDNACalculator({ buyPrice, currentPrice, atr5, buyDate }: DNAConfig) {
  return useMemo(() => {
    // 1. Fallback 로직 및 파라미터 설정 (페니 스탁 환경 최적화)
    const effectiveATR = atr5 && atr5 > 0 ? atr5 : buyPrice * 0.20; // 데이터 없을 시 매수가의 20% 변동성 가정 (보수적 대응)
    const GAMMA = 0.8; // 수익 모멘텀 지수
    const DELTA = 1.5; // 손실 공포 지수
    const LAMBDA = 2; // 일일 시간 감가점

    // 2. 동적 목표가(T)와 손절가(S) 계산
    const T = buyPrice + effectiveATR * 2.5;
    
    // 손절가 최소 50% 방어 (Floor 설정)
    const calculatedStop = buyPrice - effectiveATR * 1.2;
    const S = Math.max(calculatedStop, buyPrice * 0.5); 

    // 3. 시간 페널티 계산 (Time Decay)
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysHeld = Math.max(0, Math.floor((Date.now() - new Date(buyDate).getTime()) / msPerDay));
    const timePenalty = Math.min(40, daysHeld * LAMBDA); // 최대 40점 Cap

    // 4. 비선형 DNA 스코어 계산
    let score = 50;

    if (currentPrice >= T) {
      score = 100; // 목표 달성 시 페널티 없이 100점
    } else if (currentPrice > buyPrice) {
      // 수익 구간 로직
      const progress = (currentPrice - buyPrice) / (T - buyPrice);
      score = 50 + 50 * Math.pow(progress, GAMMA) - timePenalty;
    } else {
      // 손실 구간 로직
      const fall = (buyPrice - currentPrice) / (buyPrice - S);
      // currentPrice가 S 밑으로 내려가면 fall이 1보다 커지므로 점수는 0에 수렴
      const clampedFall = Math.min(1, fall); 
      score = 50 - 50 * Math.pow(clampedFall, DELTA) - timePenalty;
    }

    // 5. 최종 점수 보정 (0 ~ 100 사이 유지)
    return {
      dnaScore: Math.max(0, Math.min(100, Math.round(score))),
      targetPrice: Number(T.toFixed(2)),
      stopPrice: Number(S.toFixed(2)),
      timePenalty,
      daysHeld,
      effectiveATR: Number(effectiveATR.toFixed(2))
    };
  }, [buyPrice, currentPrice, atr5, buyDate]);
}
