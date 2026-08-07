export type PositionHealthTone = 'waiting' | 'breached' | 'critical' | 'danger' | 'watch' | 'riskfree' | 'safe';

export interface PositionHealthResult {
  tone: PositionHealthTone;
  label: string;
  healthPct: number;
  distanceToStopPct: number;
}

// PositionHealthBar와 상태 요약 배지/스트립이 동일한 기준으로 판정하도록 단일 소스로 분리
export function computePositionHealth(
  currentPrice: number | null,
  highestPrice: number,
  tsThreshold: number,
  entryPrice?: number | null
): PositionHealthResult {
  if (currentPrice === null) {
    return { tone: 'waiting', label: 'WAITING', healthPct: 0, distanceToStopPct: 0 };
  }

  // 고점~트레일링스탑 구간에서 현재가가 남긴 여유분 (0% = 스탑 근접, 100% = 방금 고점 경신)
  const isBreached = currentPrice < tsThreshold;
  const range = highestPrice - tsThreshold;
  const safeRange = range > 0 ? range : 0.0001;
  const healthPct = Math.max(0, Math.min(100, ((currentPrice - tsThreshold) / safeRange) * 100));

  // 현재가 대비 스탑까지 실제 남은 거리(%) — 음수면 이미 스탑 하회
  const distanceToStopPct = currentPrice > 0 ? ((currentPrice - tsThreshold) / currentPrice) * 100 : 0;

  const isCritical = healthPct <= 15 || isBreached;
  const isDanger = healthPct <= 30;
  const isRiskFree = entryPrice != null && tsThreshold > entryPrice;

  if (isBreached) return { tone: 'breached', label: '스탑이탈', healthPct, distanceToStopPct };
  if (isCritical) return { tone: 'critical', label: '청산임박', healthPct, distanceToStopPct };
  if (isDanger) return { tone: 'danger', label: 'DANGER', healthPct, distanceToStopPct };
  if (healthPct <= 60 && !isRiskFree) return { tone: 'watch', label: 'WATCH', healthPct, distanceToStopPct };
  if (isRiskFree) return { tone: 'riskfree', label: 'RISK-FREE', healthPct, distanceToStopPct };
  return { tone: 'safe', label: 'SAFE', healthPct, distanceToStopPct };
}

// tone(7단계)을 위험도 요약 스트립용 3단계로 축약 — Active Positions/Position Analytics 공용
export type PositionRiskGroup = 'safe' | 'watch' | 'danger';
export function riskGroupOf(tone: PositionHealthTone): PositionRiskGroup {
  if (tone === 'breached' || tone === 'critical' || tone === 'danger') return 'danger';
  if (tone === 'watch') return 'watch';
  return 'safe'; // safe / riskfree / waiting
}

export const POSITION_STATUS_BADGE: Record<PositionHealthTone, { label: string; dot: string; text: string }> = {
  waiting: { label: '대기중', dot: 'bg-slate-300', text: 'text-slate-500' },
  breached: { label: '스탑이탈', dot: 'bg-rose-700 animate-pulse', text: 'text-rose-700' },
  critical: { label: '청산임박', dot: 'bg-rose-600', text: 'text-rose-600' },
  danger: { label: '위험', dot: 'bg-orange-500', text: 'text-orange-600' },
  watch: { label: '주의', dot: 'bg-amber-400', text: 'text-amber-600' },
  riskfree: { label: '무위험', dot: 'bg-cyan-500', text: 'text-cyan-600' },
  safe: { label: '안전', dot: 'bg-emerald-500', text: 'text-emerald-600' },
};

// 위험도 요약 스트립(위험/주의/안전)과 동일한 색으로 종목 상자 자체를 물들일 때 사용
export const RISK_GROUP_BOX_STYLE: Record<PositionRiskGroup, string> = {
  danger: 'bg-rose-50 border-rose-200 hover:border-rose-300',
  watch: 'bg-amber-50 border-amber-200 hover:border-amber-300',
  safe: 'bg-emerald-50/60 border-emerald-100 hover:border-emerald-200',
};
