import { motion } from 'framer-motion';
import clsx from 'clsx';
import { computePositionHealth, type PositionHealthTone } from '../../utils/positionHealth';

const TONE_STYLE: Record<PositionHealthTone, { gradient: string; glow: string; labelColor: string; pulseSec: number | null }> = {
  waiting: { gradient: '', glow: '', labelColor: 'text-slate-400', pulseSec: null },
  breached: { gradient: 'from-rose-700 to-rose-600', glow: 'rgba(225,29,72,0.9)', labelColor: 'text-rose-700 font-extrabold animate-pulse', pulseSec: 0.8 },
  critical: { gradient: 'from-rose-600 to-rose-500', glow: 'rgba(244,63,94,0.7)', labelColor: 'text-rose-600 font-black', pulseSec: 0.8 },
  danger: { gradient: 'from-orange-500 to-rose-500', glow: 'rgba(249,115,22,0.6)', labelColor: 'text-orange-600 font-black', pulseSec: 1.5 },
  watch: { gradient: 'from-amber-400 to-yellow-400', glow: 'rgba(251,191,36,0.4)', labelColor: 'text-amber-600 font-black', pulseSec: null },
  riskfree: { gradient: 'from-cyan-400 to-blue-500', glow: 'rgba(6,182,212,0.4)', labelColor: 'text-cyan-600 font-black', pulseSec: null },
  safe: { gradient: 'from-emerald-400 to-emerald-300', glow: 'rgba(16,185,129,0.4)', labelColor: 'text-emerald-600 font-black', pulseSec: null },
};

interface PositionHealthBarProps {
  currentPrice: number | null;
  highestPrice: number;
  tsThreshold: number;
  entryPrice?: number | null;
}

export function PositionHealthBar({ currentPrice, highestPrice, tsThreshold, entryPrice }: PositionHealthBarProps) {
  const health = computePositionHealth(currentPrice, highestPrice, tsThreshold, entryPrice);

  if (health.tone === 'waiting') {
    return (
      <div className="w-full flex flex-col gap-1 items-end opacity-40">
        <span className="text-[10px] font-mono font-black uppercase tracking-widest whitespace-nowrap text-slate-400">WAITING</span>
        <div className="w-full h-1.5 bg-slate-200/50 rounded-full" />
      </div>
    );
  }

  const { tone, label, healthPct, distanceToStopPct } = health;
  const isBreached = tone === 'breached';
  const isDanger = tone === 'breached' || tone === 'critical' || tone === 'danger';
  const style = TONE_STYLE[tone];

  const displayText = isBreached
    ? `하회 ${Math.abs(distanceToStopPct).toFixed(1)}%`
    : `-${distanceToStopPct.toFixed(1)}%`;

  return (
    <div className="w-full flex flex-col gap-1.5 mt-1 px-1.5" title={`Health: ${healthPct.toFixed(1)}% / 스탑까지 ${distanceToStopPct.toFixed(1)}%`}>
      <div className="flex justify-between items-center text-xs font-mono font-black whitespace-nowrap">
        <span className={clsx('uppercase tracking-widest transition-colors duration-500', style.labelColor)}>
          {label}
        </span>
        <span className={clsx('transition-colors duration-500', isBreached ? 'text-rose-700 font-black' : tone === 'critical' || tone === 'danger' ? 'text-rose-600 font-black' : 'text-slate-700')}>
          {displayText}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-200/70 rounded-full relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{
            width: `${healthPct}%`,
            boxShadow: isDanger
              ? [`0px 0px 4px ${style.glow}`, `0px 0px 14px ${style.glow}`, `0px 0px 4px ${style.glow}`]
              : `0px 0px 6px ${style.glow}`,
          }}
          transition={{
            width: { duration: 0.8, ease: 'easeOut' },
            boxShadow: isDanger ? { repeat: Infinity, duration: style.pulseSec ?? 1.5, ease: 'easeInOut' } : { duration: 0.8 },
          }}
          className={clsx('absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r', style.gradient)}
        >
          {/* Indicator Dot */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-slate-100" />
        </motion.div>
      </div>
    </div>
  );
}
