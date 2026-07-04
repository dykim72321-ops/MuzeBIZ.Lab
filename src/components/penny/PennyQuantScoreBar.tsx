import { motion } from 'framer-motion';
import clsx from 'clsx';

interface PennyQuantScoreBarProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function getScoreConfig(score: number) {
  if (score >= 85) return { gradient: 'from-emerald-500 to-emerald-300', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.6)]', label: 'STRONG', color: 'text-emerald-400' };
  if (score >= 70) return { gradient: 'from-cyan-500 to-cyan-300', glow: 'shadow-[0_0_12px_rgba(34,211,238,0.4)]', label: 'GOOD', color: 'text-cyan-400' };
  if (score >= 50) return { gradient: 'from-amber-500 to-yellow-300', glow: '', label: 'NEUTRAL', color: 'text-amber-400' };
  return { gradient: 'from-rose-500 to-rose-300', glow: '', label: 'WEAK', color: 'text-rose-400' };
}

export const PennyQuantScoreBar = ({ score, size = 'md', showLabel = true }: PennyQuantScoreBarProps) => {
  const config = getScoreConfig(score);
  const barHeight = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';

  return (
    <div className="flex items-center gap-3 w-full">
      <div className={clsx("flex-1 bg-blue-800/60 rounded-full overflow-hidden", barHeight)}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(score, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={clsx(
            "h-full rounded-full bg-gradient-to-r",
            config.gradient,
            config.glow
          )}
        />
      </div>
      {showLabel && (
        <div className="flex items-center gap-1.5 min-w-[60px] justify-end">
          <span className={clsx("text-xs font-black tabular-nums", config.color)}>
            {score.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
};
