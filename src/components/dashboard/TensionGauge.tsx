import { motion } from 'framer-motion';
import clsx from 'clsx';

interface TensionGaugeProps {
  score: number;
  rvol?: number | null;
}

// paper_engine.py process_signal()의 dna_gate(75) 실매수 게이트와 정합
// (2026-07-30 페니 포지션 관리 레거시 제거로 게이트가 75 단일값으로 통일됨).
const DNA_GATE_STANDARD = 75;
// MomentumValidator.validate() — DNA≥80이면 RVOL 재검증을 스킵 (services/market_data.py)
const MOMENTUM_SKIP_DNA = 80;
// MomentumValidator.validate() 1차 조건: RVOL < 1.5 → 차단
const RVOL_MIN = 1.5;

export function TensionGauge({ score, rvol }: TensionGaugeProps) {
  const gate = DNA_GATE_STANDARD;
  const gatePassed = score >= gate;
  const momentumSkipped = score >= MOMENTUM_SKIP_DNA;
  const momentumOk = momentumSkipped || (rvol != null && rvol >= RVOL_MIN);
  const ready = gatePassed && momentumOk;

  const normalized = Math.max(0, Math.min(100, score));

  let gradient = 'from-blue-500 to-cyan-400';
  let glow = 'rgba(6,182,212,0.4)';
  let label = '관찰중';
  let labelColor = 'text-blue-600';

  if (ready) {
    gradient = 'from-rose-500 to-rose-400';
    glow = 'rgba(244,63,94,0.6)';
    label = '매수신호';
    labelColor = 'text-rose-600';
  } else if (gatePassed) {
    // DNA 게이트는 통과했지만 MomentumValidator(RVOL) 미확인 — 거래량 폭증 대기
    gradient = 'from-amber-500 to-amber-400';
    glow = 'rgba(245,158,11,0.4)';
    label = 'RVOL 대기';
    labelColor = 'text-amber-600';
  }

  return (
    <div className="w-full flex flex-col gap-1 items-end" title={`DNA ${score.toFixed(1)} / RVOL ${rvol != null ? rvol.toFixed(1) + 'x' : '-'}`}>
      <span className={clsx('text-xs font-mono font-black uppercase tracking-widest transition-colors duration-500', labelColor)}>
        {label}
      </span>
      <div className="w-full h-1.5 bg-slate-200/70 rounded-full relative">
        
        {/* Background Highlight Zone (75~80) */}
        <div
          className="absolute top-0 bottom-0 bg-amber-200/60"
          style={{ left: `${DNA_GATE_STANDARD}%`, right: `${100 - MOMENTUM_SKIP_DNA}%` }}
          title="Volume Dependent Zone (75~80)"
        />

        {/* Gate Markers */}
        <div className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-slate-400/80 z-10" style={{ left: `${DNA_GATE_STANDARD}%` }} />
        <div className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-slate-400/80 z-10" style={{ left: `${MOMENTUM_SKIP_DNA}%` }} />

        <motion.div
          initial={{ width: 0 }}
          animate={{
            width: `${normalized}%`,
            boxShadow: ready
              ? [`0px 0px 4px ${glow}`, `0px 0px 14px ${glow}`, `0px 0px 4px ${glow}`]
              : `0px 0px 6px ${glow}`,
          }}
          transition={{
            width: { duration: 1, ease: 'easeOut' },
            boxShadow: ready ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : { duration: 1 },
          }}
          className={clsx('absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r z-20', gradient)}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-slate-100" />
        </motion.div>
      </div>
    </div>
  );
}
