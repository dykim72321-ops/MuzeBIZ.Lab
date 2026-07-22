import { motion } from 'framer-motion';
import clsx from 'clsx';

interface PositionHealthBarProps {
  currentPrice: number | null;
  highestPrice: number;
  tsThreshold: number;
}

export function PositionHealthBar({ currentPrice, highestPrice, tsThreshold }: PositionHealthBarProps) {
  if (currentPrice === null) return null;

  // 고점~트레일링스탑 구간에서 현재가가 남긴 여유분 (0% = 스탑 근접, 100% = 방금 고점 경신)
  const isBreached = currentPrice < tsThreshold;
  const range = highestPrice - tsThreshold;
  const safeRange = range > 0 ? range : 0.0001;
  const healthPct = Math.max(0, Math.min(100, ((currentPrice - tsThreshold) / safeRange) * 100));

  // 현재가 대비 스탑까지 실제 남은 거리(%) — 음수면 이미 스탑 하회
  const distanceToStopPct = currentPrice > 0 ? ((currentPrice - tsThreshold) / currentPrice) * 100 : 0;

  const isCritical = healthPct <= 15 || isBreached;
  const isDanger = healthPct <= 30;

  let gradient = 'from-emerald-400 to-emerald-300';
  let glow = 'rgba(16,185,129,0.4)';
  let label = 'SAFE';
  let labelColor = 'text-slate-500';

  if (isBreached) {
    gradient = 'from-rose-700 to-rose-600';
    glow = 'rgba(225,29,72,0.9)';
    label = '스탑이탈';
    labelColor = 'text-rose-700 font-extrabold animate-pulse';
  } else if (isCritical) {
    gradient = 'from-rose-600 to-rose-500';
    glow = 'rgba(244,63,94,0.7)';
    label = '청산임박';
    labelColor = 'text-rose-600';
  } else if (isDanger) {
    gradient = 'from-rose-500 to-rose-400';
    glow = 'rgba(244,63,94,0.6)';
    label = 'DANGER';
    labelColor = 'text-rose-600';
  } else if (healthPct <= 60) {
    gradient = 'from-amber-400 to-amber-300';
    glow = 'rgba(251,191,36,0.4)';
    label = 'WATCH';
    labelColor = 'text-amber-600';
  }

  const displayText = isBreached
    ? `하회 ${Math.abs(distanceToStopPct).toFixed(1)}%`
    : `-${distanceToStopPct.toFixed(1)}%`;

  return (
    <div className="w-full flex flex-col gap-1.5 mt-1" title={`Health: ${healthPct.toFixed(1)}% / 스탑까지 ${distanceToStopPct.toFixed(1)}%`}>
      <div className="flex justify-between items-center text-[10px] font-mono font-black px-0.5">
        <span className={clsx('uppercase tracking-widest transition-colors duration-500', labelColor)}>
          {label}
        </span>
        <span className={clsx('transition-colors duration-500', isBreached ? 'text-rose-700 font-bold' : isDanger ? 'text-rose-600' : 'text-slate-700')}>
          {displayText}
        </span>
      </div>
      <div className="w-full h-1 bg-slate-200/60 rounded-full relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{
            width: `${healthPct}%`,
            boxShadow: isDanger
              ? [`0px 0px 4px ${glow}`, `0px 0px 14px ${glow}`, `0px 0px 4px ${glow}`]
              : `0px 0px 6px ${glow}`,
          }}
          transition={{
            width: { duration: 0.8, ease: 'easeOut' },
            boxShadow: isDanger ? { repeat: Infinity, duration: isCritical ? 0.8 : 1.5, ease: 'easeInOut' } : { duration: 0.8 },
          }}
          className={clsx('absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r', gradient)}
        >
          {/* Indicator Dot */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-slate-100" />
        </motion.div>
      </div>
    </div>
  );
}
