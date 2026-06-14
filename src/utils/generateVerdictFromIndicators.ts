/**
 * generateVerdictFromIndicators.ts
 * RSI / MACD / ADX / RVOL 실측값으로부터 투자 판단 근거를 즉시 생성하는 규칙 기반 엔진.
 * stock_analysis_cache 가 없을 때 프론트엔드 fallback으로 사용.
 */

export interface IndicatorInput {
  rsi?: number;
  macdDiff?: number;
  adx?: number;
  rvol?: number;
  dnaScore: number;
  price?: number;
  changePercent?: number;
  targetPrice?: number;
  stopPrice?: number;
  kellyWeight?: number;
}

export interface VerdictResult {
  verdict: string;
  bullPoints: string[];
  bearPoints: string[];
}

export function generateVerdictFromIndicators(input: IndicatorInput): VerdictResult {
  const { rsi, macdDiff, adx, rvol, dnaScore, price, changePercent, targetPrice, stopPrice, kellyWeight } = input;

  const bullPoints: string[] = [];
  const bearPoints: string[] = [];

  // ── RSI 분석 ──────────────────────────────────────────────────────────
  if (rsi !== undefined && rsi > 0) {
    if (rsi < 30) {
      bullPoints.push(`RSI ${rsi.toFixed(1)} — 과매도 구간 진입, 반등 확률 상승`);
    } else if (rsi < 45) {
      bullPoints.push(`RSI ${rsi.toFixed(1)} — 매수 유리 구간 (저점 접근)`);
    } else if (rsi > 70) {
      bearPoints.push(`RSI ${rsi.toFixed(1)} — 과매수 경고, 조정 가능성`);
    } else if (rsi > 60) {
      bearPoints.push(`RSI ${rsi.toFixed(1)} — 매수 과열 접근 구간`);
    } else {
      bullPoints.push(`RSI ${rsi.toFixed(1)} — 중립 구간, 추세 확인 필요`);
    }
  }

  // ── MACD 분석 ─────────────────────────────────────────────────────────
  if (macdDiff !== undefined) {
    if (macdDiff > 0.5) {
      bullPoints.push(`MACD 히스토그램 +${macdDiff.toFixed(2)} — 강한 상승 모멘텀`);
    } else if (macdDiff > 0) {
      bullPoints.push(`MACD 히스토그램 +${macdDiff.toFixed(2)} — 상승 모멘텀 유지`);
    } else if (macdDiff < -0.5) {
      bearPoints.push(`MACD 히스토그램 ${macdDiff.toFixed(2)} — 강한 하락 모멘텀`);
    } else if (macdDiff < 0) {
      bearPoints.push(`MACD 히스토그램 ${macdDiff.toFixed(2)} — 하락 모멘텀 감지`);
    }
  }

  // ── ADX 분석 ──────────────────────────────────────────────────────────
  if (adx !== undefined && adx > 0) {
    if (adx > 25) {
      bullPoints.push(`ADX ${adx.toFixed(1)} — 뚜렷한 추세 형성 (추세 매매 유리)`);
    } else if (adx > 20) {
      bullPoints.push(`ADX ${adx.toFixed(1)} — 추세 형성 초기 단계`);
    } else {
      bearPoints.push(`ADX ${adx.toFixed(1)} — 무추세 횡보 구간 (변동성 매매 주의)`);
    }
  }

  // ── RVOL 분석 ─────────────────────────────────────────────────────────
  if (rvol !== undefined && rvol > 0) {
    if (rvol > 5.0) {
      bullPoints.push(`RVOL ${rvol.toFixed(1)}x — 거래량 폭발 (이상 신호 감지)`);
    } else if (rvol > 3.0) {
      bullPoints.push(`RVOL ${rvol.toFixed(1)}x — 평균 대비 거래량 대폭 증가`);
    } else if (rvol > 2.0) {
      bullPoints.push(`RVOL ${rvol.toFixed(1)}x — 평균 대비 거래량 증가`);
    } else if (rvol < 0.5) {
      bearPoints.push(`RVOL ${rvol.toFixed(1)}x — 거래 침체 (유동성 리스크)`);
    }
  }

  // ── 가격 변동률 분석 ──────────────────────────────────────────────────
  if (changePercent !== undefined) {
    if (changePercent > 10) {
      bearPoints.push(`24h 변동률 +${changePercent.toFixed(1)}% — 추격 매수 경고`);
    } else if (changePercent > 5) {
      bullPoints.push(`24h 변동률 +${changePercent.toFixed(1)}% — 강한 상승 추세`);
    } else if (changePercent < -10) {
      bearPoints.push(`24h 변동률 ${changePercent.toFixed(1)}% — 급락 경계`);
    } else if (changePercent < -5) {
      bullPoints.push(`24h 변동률 ${changePercent.toFixed(1)}% — 낙폭 과대, 반등 기회`);
    }
  }

  // ── R/R (Risk/Reward) 분석 ────────────────────────────────────────────
  if (targetPrice && stopPrice && price && price > 0) {
    const upside = ((targetPrice - price) / price) * 100;
    const downside = ((price - stopPrice) / price) * 100;
    const rrRatio = downside > 0 ? upside / downside : 0;
    if (rrRatio >= 2.0) {
      bullPoints.push(`R/R 비율 ${rrRatio.toFixed(1)}:1 — 유리한 비대칭 구조`);
    } else if (rrRatio >= 1.0) {
      bullPoints.push(`R/R 비율 ${rrRatio.toFixed(1)}:1 — 균형적 위험 대비 보상`);
    } else if (rrRatio > 0) {
      bearPoints.push(`R/R 비율 ${rrRatio.toFixed(1)}:1 — 불리한 위험 대비 보상`);
    }
  }

  // ── Fallback: 데이터 부족 시 ──────────────────────────────────────────
  if (bullPoints.length === 0) {
    bullPoints.push('지표 데이터 수집 대기 중 — 장 개장 후 분석이 시작됩니다');
  }
  if (bearPoints.length === 0) {
    bearPoints.push('현재 감지된 주요 리스크 없음');
  }

  // ── 종합 판단 생성 ────────────────────────────────────────────────────
  let verdict: string;
  if (dnaScore >= 85) {
    verdict = `DNA ${dnaScore}점 — 강력 매수 구간. 퀀트 지표가 복합적으로 상승 신호를 지지합니다.`;
  } else if (dnaScore >= 70) {
    verdict = `DNA ${dnaScore}점 — 매수 관심 구간. 추세와 모멘텀이 긍정적이나 추가 확인이 필요합니다.`;
  } else if (dnaScore >= 50) {
    verdict = `DNA ${dnaScore}점 — 중립 관망 구간. 명확한 방향성이 확인될 때까지 진입을 보류합니다.`;
  } else if (dnaScore >= 30) {
    verdict = `DNA ${dnaScore}점 — 약세 경고. 하락 모멘텀이 우세하며 리스크 관리를 강화하세요.`;
  } else {
    verdict = `DNA ${dnaScore}점 — 매도/회피 구간. 복수 지표가 하락 신호를 보이고 있습니다.`;
  }

  if (kellyWeight !== undefined && kellyWeight > 0) {
    verdict += ` Kelly 적정 비중: ${kellyWeight.toFixed(1)}%.`;
  }

  return { verdict, bullPoints, bearPoints };
}
