import { useState, useMemo } from 'react';
import { FlaskConical, AlertTriangle, ChevronRight } from 'lucide-react';

// ── 수식 (백엔드 paper_engine / main.py와 동일, Fix A+B+C+D 적용) ─────────────

type MacdStatus = 'golden' | 'dead' | 'rising' | 'falling';

interface DnaParams {
  rsi: number;
  rvol: number;
  macdStatus: MacdStatus;
  adx: number;
  diPositive: boolean;
  isExtended: boolean;
  isPenny: boolean;
}

interface DnaResult {
  score: number;
  deltas: { base: number; rsi: number; macd: number; adx: number; rvol: number; ext: number };
  tier: string;
  tierColor: string;
  signal: string;
}

interface SizingParams {
  winRate: number;
  profitRatio: number;
  atrPct: number;
}

interface SizingResult {
  annVol: number;
  volWeight: number;
  kellyF: number;
  optimalKelly: number;
  finalWeight: number;
  buyBudgetPct: number;
}

interface ChandelierResult {
  k: number;
  floor: number;
  tsFixed: number;
  tsChandelier: number;
  effective: number;
}

function calcDna(p: DnaParams): DnaResult {
  let score = 50;
  const deltas = { base: 50, rsi: 0, macd: 0, adx: 0, rvol: 0, ext: 0 };

  // RSI — Fix A: RSI≥75 + RVOL≥5.0 → -10 (기존 -20)
  const { rsi, rvol } = p;
  if (rsi < 30) deltas.rsi = 20;
  else if (rsi < 45) deltas.rsi = +(20 - ((rsi - 30) / 15) * 5);
  else if (rsi < 55) deltas.rsi = +(15 * ((55 - rsi) / 10));
  else if (rsi < 65) deltas.rsi = rvol >= 3.0 ? 0 : -((rsi - 55) / 10) * 10;
  else if (rsi < 75) deltas.rsi = rvol >= 3.0 ? 0 : -(10 + ((rsi - 65) / 10) * 10);
  else deltas.rsi = rvol >= 5.0 ? -10 : -20; // Fix A
  score += deltas.rsi;

  // MACD
  deltas.macd = p.macdStatus === 'golden' ? 20 : p.macdStatus === 'dead' ? -20 : p.macdStatus === 'rising' ? 8 : -8;
  score += deltas.macd;

  // ADX
  if (!p.diPositive && p.adx > 25) deltas.adx = -10;
  else if (p.diPositive && p.adx > 25) deltas.adx = 10;
  else if (p.diPositive && p.adx > 20) deltas.adx = 5;
  score += deltas.adx;

  // RVOL
  deltas.rvol = rvol > 5.0 ? 15 : rvol > 3.0 ? 10 : rvol > 2.0 ? 5 : rvol < 1.0 ? -5 : 0;
  score += deltas.rvol;

  // Is_Extended — Fix B: RVOL≥5.0 → -12 (기존 -25)
  if (p.isExtended) deltas.ext = rvol >= 5.0 ? -12 : -25;
  score += deltas.ext;

  const finalScore = Math.min(100, Math.max(0, +score.toFixed(1)));

  // Tier 판정
  const isPennyBuy = p.isPenny && finalScore >= 70;
  const isTier1 = !p.isPenny && finalScore >= 85;
  const isTier2 = !p.isPenny && finalScore >= 82 && rvol > 2.0;
  const isSell = finalScore <= 40;

  let tier = 'HOLD';
  let tierColor = 'text-slate-400';
  let signal = 'NORMAL';
  if (isPennyBuy) { tier = 'Tier-Penny'; tierColor = 'text-cyan-400'; signal = 'STRONG BUY'; }
  else if (isTier1) { tier = 'Tier-1'; tierColor = 'text-emerald-400'; signal = 'STRONG BUY'; }
  else if (isTier2) { tier = 'Tier-2'; tierColor = 'text-teal-400'; signal = 'BUY'; }
  else if (isSell) { tier = 'SELL'; tierColor = 'text-rose-400'; signal = 'STRONG SELL'; }

  return { score: finalScore, deltas, tier, tierColor, signal };
}

function calcSizing(p: SizingParams): SizingResult {
  // Fix D: weighted average (vol_weight + kelly) / 2
  const annVol = p.atrPct * Math.sqrt(252);
  const volWeight = annVol > 0 ? 0.15 / annVol : 0;

  const q = 1 - p.winRate;
  const b = p.profitRatio;
  const kellyF = b > 0 ? (b * p.winRate - q) / b : 0;
  const optimalKelly = Math.max(0, kellyF) * 0.25;

  const finalWeight = Math.min((volWeight + optimalKelly) / 2, 1.0);
  const buyBudgetPct = Math.min(finalWeight, 0.25) * 100;

  return { annVol, volWeight: volWeight * 100, kellyF, optimalKelly: optimalKelly * 100, finalWeight: finalWeight * 100, buyBudgetPct };
}

function calcChandelier(highest: number, atrPct: number, isPenny: boolean, entryPrice: number): ChandelierResult {
  const k = isPenny ? 5.0 : 3.0;
  const atrAbs = highest * atrPct;
  const floorPct = isPenny ? 0.85 : 0.90;
  const floor = entryPrice * floorPct;
  const tsFixed = highest * floorPct;
  const tsChandelier = Math.max(floor, highest - k * atrAbs);
  return { k, floor, tsFixed, tsChandelier, effective: tsChandelier };
}

// ── UI 서브컴포넌트 ────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step = 1, onChange, unit = '', color = 'indigo' }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const colorMap: Record<string, string> = { indigo: 'accent-indigo-500', cyan: 'accent-cyan-500', rose: 'accent-rose-500', emerald: 'accent-emerald-500', amber: 'accent-amber-500' };
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-sm font-black text-white font-mono">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
      <div className="relative">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          className={`w-full h-1.5 rounded-full appearance-none bg-slate-800 cursor-pointer ${colorMap[color] ?? 'accent-indigo-500'}`}
        />
        <div className="absolute top-0 left-0 h-1.5 rounded-full pointer-events-none"
          style={{ width: `${pct}%`, background: color === 'rose' ? '#f43f5e' : color === 'emerald' ? '#10b981' : color === 'cyan' ? '#06b6d4' : color === 'amber' ? '#f59e0b' : '#6366f1' }}
        />
      </div>
    </div>
  );
}

function DeltaBar({ label, value, maxAbs = 25 }: { label: string; value: number; maxAbs?: number }) {
  const pct = Math.abs(value) / maxAbs * 100;
  const isPos = value >= 0;
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="w-20 text-right text-slate-400 font-mono shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-slate-900 rounded flex items-center overflow-hidden relative">
        <div
          className={`h-full rounded transition-all duration-300 ${isPos ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
          style={{ width: `${pct}%`, marginLeft: isPos ? '0' : 'auto' }}
        />
        <span className={`absolute right-2 font-black font-mono ${isPos ? 'text-emerald-300' : 'text-rose-300'}`}>
          {isPos ? '+' : ''}{value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function ScoreArc({ score }: { score: number }) {
  const r = 70;
  const cx = 90; const cy = 90;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const color = score >= 85 ? '#10b981' : score >= 70 ? '#06b6d4' : score >= 50 ? '#6366f1' : score >= 40 ? '#f59e0b' : '#f43f5e';
  return (
    <svg width="180" height="110" viewBox="0 0 180 110">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize="30" fontWeight="900" fontFamily="monospace">{score.toFixed(0)}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700" letterSpacing="3">DNA SCORE</text>
    </svg>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export function DnaSimulatorPage() {
  // 지표 파라미터
  const [rsi, setRsi] = useState(35);
  const [rvol, setRvol] = useState(3.5);
  const [macdStatus, setMacdStatus] = useState<MacdStatus>('golden');
  const [adx, setAdx] = useState(25);
  const [diPositive, setDiPositive] = useState(true);
  const [isExtended, setIsExtended] = useState(false);
  const [isPenny, setIsPenny] = useState(false);

  // 포지션 사이징 파라미터
  const [winRate, setWinRate] = useState(0.55);
  const [profitRatio, setProfitRatio] = useState(2.0);
  const [atrPct, setAtrPct] = useState(0.03);

  // Chandelier Exit 파라미터
  const [entryPrice, setEntryPrice] = useState(isPenny ? 0.50 : 10.0);
  const [highestPct, setHighestPct] = useState(5); // highest = entry × (1 + highestPct%)

  const dna = useMemo(() => calcDna({ rsi, rvol, macdStatus, adx, diPositive, isExtended, isPenny }), [rsi, rvol, macdStatus, adx, diPositive, isExtended, isPenny]);
  const sizing = useMemo(() => calcSizing({ winRate, profitRatio, atrPct }), [winRate, profitRatio, atrPct]);
  const highest = entryPrice * (1 + highestPct / 100);
  const chandelier = useMemo(() => calcChandelier(highest, atrPct, isPenny, entryPrice), [highest, atrPct, isPenny, entryPrice]);

  const macdOptions: { value: MacdStatus; label: string; score: number }[] = [
    { value: 'golden', label: '골든크로스', score: 20 },
    { value: 'dead',   label: '데드크로스', score: -20 },
    { value: 'rising', label: '상승 모멘텀', score: 8 },
    { value: 'falling',label: '하락 모멘텀', score: -8 },
  ];

  return (
    <div className="min-h-screen bg-[#080d1a] text-white font-sans">
      {/* Header */}
      <div className="border-b border-slate-800 bg-[#0a0f1c]/80 backdrop-blur px-8 py-5">
        <div className="max-w-[1400px] mx-auto flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base font-black uppercase tracking-widest text-white">DNA Score Simulator</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Fix A·B·C·D 반영 — 실시간 수식 검증기</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-8 grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8">

        {/* ─── 좌측: 파라미터 입력 ────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* 기본 지표 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">기술적 지표</h2>

            <Slider label="RSI" value={rsi} min={0} max={100} onChange={setRsi}
              color={rsi < 30 ? 'emerald' : rsi >= 75 ? 'rose' : 'indigo'} />
            {rsi >= 75 && (
              <div className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>RSI ≥ 75: RVOL {rvol >= 5 ? '≥5.0 → 패널티 -10 (Fix A 적용)' : '<5.0 → 패널티 -20'}</span>
              </div>
            )}

            <Slider label="RVOL (상대거래량)" value={rvol} min={0} max={20} step={0.1} onChange={setRvol}
              color={rvol >= 5 ? 'emerald' : rvol >= 3 ? 'cyan' : 'indigo'} unit="×" />

            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">MACD 상태</span>
              <div className="grid grid-cols-2 gap-2">
                {macdOptions.map(o => (
                  <button key={o.value} onClick={() => setMacdStatus(o.value)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all text-left flex justify-between items-center
                      ${macdStatus === o.value ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}>
                    <span>{o.label}</span>
                    <span className={o.score > 0 ? 'text-emerald-400' : 'text-rose-400'}>{o.score > 0 ? '+' : ''}{o.score}</span>
                  </button>
                ))}
              </div>
            </div>

            <Slider label="ADX (추세 강도)" value={adx} min={0} max={50} onChange={setAdx} color="amber" />

            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">DI 방향</span>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => setDiPositive(v)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all
                      ${diPositive === v ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}>
                    {v ? '+DI > -DI (상승)' : '-DI > +DI (하락)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Is_Extended (급등)</span>
                {isExtended && <p className="text-[9px] text-amber-400 mt-0.5">
                  {rvol >= 5 ? 'RVOL≥5.0 → 패널티 -12 (Fix B)' : 'RVOL<5.0 → 패널티 -25'}
                </p>}
              </div>
              <button onClick={() => setIsExtended(v => !v)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all
                  ${isExtended ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}>
                {isExtended ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">페니 종목 ($1 이하)</span>
                {isPenny && <p className="text-[9px] text-cyan-400 mt-0.5">DNA ≥ 70이면 Tier-Penny 진입</p>}
              </div>
              <button onClick={() => setIsPenny(v => !v)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all
                  ${isPenny ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}>
                {isPenny ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* 포지션 사이징 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">포지션 사이징 (Fix D)</h2>
              <span className="text-[9px] text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">가중평균 = (vol + kelly) / 2</span>
            </div>
            <Slider label="승률 (Win Rate)" value={winRate} min={0.3} max={0.9} step={0.01} onChange={setWinRate} color="emerald" unit="" />
            <Slider label="손익비 (b)" value={profitRatio} min={0.5} max={5} step={0.1} onChange={setProfitRatio} color="emerald" unit="×" />
            <Slider label="ATR% (일별 변동폭)" value={atrPct * 100} min={0.5} max={20} step={0.5} onChange={v => setAtrPct(v / 100)} color="amber" unit="%" />
          </div>

          {/* Chandelier Exit */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chandelier Exit TS (Fix C)</h2>
              <span className="text-[9px] text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">k={isPenny ? '5.0 (페니)' : '3.0 (일반)'}</span>
            </div>
            <Slider label="진입가 ($)" value={entryPrice} min={0.1} max={isPenny ? 1.0 : 100} step={isPenny ? 0.01 : 0.5} onChange={setEntryPrice} color="cyan" />
            <Slider label="최고가 진입 후 상승%" value={highestPct} min={0} max={50} step={1} onChange={setHighestPct} color="emerald" unit="%" />
          </div>
        </div>

        {/* ─── 우측: 결과 시각화 ──────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Score + Tier */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div className="flex flex-col items-center">
                <ScoreArc score={dna.score} />
                <div className={`mt-1 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border ${
                  dna.tier === 'Tier-1' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                  dna.tier === 'Tier-2' ? 'bg-teal-500/15 border-teal-500/30 text-teal-400' :
                  dna.tier === 'Tier-Penny' ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' :
                  dna.tier === 'SELL' ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' :
                  'bg-slate-800 border-slate-700 text-slate-400'
                }`}>{dna.tier} — {dna.signal}</div>
              </div>

              {/* Breakdown bars */}
              <div className="flex-1 w-full space-y-2">
                <DeltaBar label="Base" value={50} maxAbs={50} />
                <DeltaBar label="RSI" value={dna.deltas.rsi} />
                <DeltaBar label="MACD" value={dna.deltas.macd} />
                <DeltaBar label="ADX" value={dna.deltas.adx} />
                <DeltaBar label="RVOL" value={dna.deltas.rvol} />
                <DeltaBar label="Extended" value={dna.deltas.ext} />
                <div className="border-t border-slate-800 pt-2">
                  <DeltaBar label="TOTAL" value={dna.score} maxAbs={100} />
                </div>
              </div>
            </div>

            {/* Tier 게이트 표시 */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Tier-1', gate: 85, color: 'emerald', cond: !isPenny },
                { label: 'Tier-2', gate: 82, color: 'teal', cond: !isPenny && rvol > 2.0 },
                { label: 'Tier-Penny', gate: 70, color: 'cyan', cond: isPenny },
              ].map(t => {
                const gap = dna.score - t.gate;
                const active = t.cond && dna.score >= t.gate;
                return (
                  <div key={t.label} className={`rounded-xl border p-3 text-center transition-all ${
                    active ? `border-${t.color}-500/30 bg-${t.color}-500/10` : 'border-slate-800 bg-slate-900/40'
                  }`}>
                    <div className={`text-[9px] font-black uppercase tracking-widest ${active ? `text-${t.color}-400` : 'text-slate-600'}`}>{t.label}</div>
                    <div className={`text-xs font-black mt-1 ${active ? `text-${t.color}-300` : 'text-slate-500'}`}>≥ {t.gate}</div>
                    <div className={`text-[9px] mt-1 ${gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {gap >= 0 ? '✓ 진입' : `${gap.toFixed(1)}pt 부족`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 포지션 사이징 결과 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">포지션 사이징 결과</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { label: '연환산 변동성', value: `${(sizing.annVol * 100).toFixed(1)}%`, desc: 'ATR × √252' },
                { label: 'vol_weight', value: `${sizing.volWeight.toFixed(1)}%`, desc: '15% / ann_vol' },
                { label: 'Kelly(f)', value: `${(sizing.optimalKelly).toFixed(1)}%`, desc: '하프켈리 × 0.25' },
                { label: '최종 비중', value: `${sizing.finalWeight.toFixed(1)}%`, desc: '(vol+kelly)/2 ← Fix D' },
              ].map(item => (
                <div key={item.label} className="bg-slate-950/60 rounded-xl border border-slate-800 p-3 text-center">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{item.label}</div>
                  <div className="text-lg font-black text-white mt-1">{item.value}</div>
                  <div className="text-[8px] text-slate-600 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>

            {/* 비중 비교 (min vs avg) */}
            <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Fix D 효과 — min vs 가중평균</div>
              <div className="space-y-2">
                {[
                  { label: '기존 (min)', value: Math.min(sizing.volWeight, sizing.optimalKelly), color: 'bg-slate-600' },
                  { label: '신규 (avg)', value: sizing.finalWeight, color: 'bg-indigo-500' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 w-24 shrink-0">{row.label}</span>
                    <div className="flex-1 bg-slate-900 rounded h-4 overflow-hidden">
                      <div className={`${row.color} h-full rounded transition-all duration-500`} style={{ width: `${Math.min(row.value * 4, 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-white font-mono w-12 text-right">{row.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-slate-600 mt-3">
                * buy_budget = min(자금 × {sizing.finalWeight.toFixed(1)}%, $1,000)
              </p>
            </div>
          </div>

          {/* Chandelier Exit 결과 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
              Chandelier Exit — TS = Highest − {chandelier.k}×ATR
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { label: '진입가', value: `$${entryPrice.toFixed(isPenny ? 3 : 2)}` },
                { label: '최고가', value: `$${highest.toFixed(isPenny ? 3 : 2)}` },
                { label: '고정 % TS', value: `$${chandelier.tsFixed.toFixed(isPenny ? 3 : 2)}`, sub: `${isPenny ? '-15%' : '-10%'} (기존)` },
                { label: 'Chandelier TS', value: `$${chandelier.tsChandelier.toFixed(isPenny ? 3 : 2)}`, sub: `k=${chandelier.k}×ATR`, highlight: true },
              ].map(item => (
                <div key={item.label} className={`rounded-xl border p-3 text-center ${item.highlight ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/60'}`}>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{item.label}</div>
                  <div className={`text-lg font-black mt-1 ${item.highlight ? 'text-indigo-300' : 'text-white'}`}>{item.value}</div>
                  {item.sub && <div className="text-[8px] text-slate-600 mt-0.5">{item.sub}</div>}
                </div>
              ))}
            </div>

            {/* TS 비교 시각화 */}
            <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-4 space-y-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">스탑 라인 위치 비교</div>
              {[
                { label: '고정 % TS', price: chandelier.tsFixed, color: 'bg-slate-500' },
                { label: 'Chandelier TS', price: chandelier.tsChandelier, color: 'bg-indigo-500' },
              ].map(row => {
                const dropPct = ((highest - row.price) / highest) * 100;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 w-28 shrink-0">{row.label}</span>
                    <div className="flex-1 bg-slate-900 rounded h-4 overflow-hidden">
                      <div className={`${row.color} h-full rounded transition-all`} style={{ width: `${Math.max(0, 100 - dropPct * 3)}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-rose-400 font-mono w-16 text-right">-{dropPct.toFixed(1)}%</span>
                  </div>
                );
              })}
              <p className="text-[9px] text-slate-600 mt-1">
                Chandelier가 낮을수록(더 여유) 스탑헌팅 내성 강화
              </p>
            </div>

            <div className="mt-4 flex items-start gap-2 text-[10px] text-slate-500 bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3">
              <ChevronRight className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
              <span>ATR%가 클수록(변동성 높음) Chandelier TS가 낮아져 마켓메이커 노이즈를 흡수합니다. ATR이 작으면 수익을 더 단단히 잠급니다.</span>
            </div>
          </div>

          {/* 주의사항 */}
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-2xl px-5 py-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-amber-400/80 leading-relaxed">
              이 시뮬레이터는 백엔드 <code className="font-mono text-amber-300">paper_engine.py</code> · <code className="font-mono text-amber-300">main.py</code>의 수식과 동기화되어 있습니다.
              Fix A·B·C·D 적용 버전 기준이며, 실제 매매 신호는 1분봉 데이터 기반 연산 결과와 다를 수 있습니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DnaSimulatorPage;
