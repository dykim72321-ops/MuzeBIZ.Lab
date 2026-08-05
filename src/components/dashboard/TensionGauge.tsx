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

  let statusText = 'STANDBY';
  let statusColor = 'text-slate-600'; // 진하게
  let barColor = 'bg-slate-400';

  if (ready) {
    statusText = 'STRONG BUY';
    statusColor = 'text-rose-700'; // 진하게
    barColor = 'bg-rose-500';
  } else if (gatePassed) {
    statusText = 'VOL WAIT';
    statusColor = 'text-amber-700'; // 진하게
    barColor = 'bg-amber-400';
  }

  // 전문 금융 화면에 어울리는 분절형(Segmented) 강도 미터
  const totalBlocks = 12;
  const activeBlocks = Math.round((normalized / 100) * totalBlocks);

  return (
    <div className="w-full flex flex-col gap-1.5 items-end" title={`DNA ${score.toFixed(1)} / RVOL ${rvol != null ? rvol.toFixed(1) + 'x' : '-'}`}>
      <div className="flex items-center gap-1.5">
        {ready && <div className="w-1.5 h-1.5 bg-rose-500 rounded-sm animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] flex-shrink-0" />}
        <span className={clsx('text-[8.5px] font-mono font-black uppercase tracking-widest leading-none whitespace-nowrap', statusColor)}>
          {statusText}
        </span>
      </div>
      
      <div className="flex gap-[1.5px] w-full h-2">
        {Array.from({ length: totalBlocks }).map((_, i) => {
          const isActive = i < activeBlocks;
          return (
            <div 
              key={i} 
              className={clsx(
                "flex-1 h-full transition-colors duration-300", 
                isActive ? barColor : "bg-slate-200"
              )} 
            />
          );
        })}
      </div>
    </div>
  );
}
