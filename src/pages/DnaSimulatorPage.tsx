import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FlaskConical, AlertTriangle, ChevronRight, ArrowLeft, Sparkles, TrendingDown, Scale } from 'lucide-react';
import { fetchPaperAccount } from '../services/pythonApiService';

// ── 수식 (백엔드 paper_engine / main.py와 동일, Fix A+B+C+D 적용) ─────────────
// ⚠️  DRIFT RISK: 이 파일의 세 함수(calcDna, calcSizing, calcChandelier)는
//     백엔드 Python 수식을 TypeScript로 수동 복제한 것입니다.
//     백엔드 상수·로직 변경 시 이 파일도 반드시 동시에 수정하세요.
//     참조 상수: CHANDELIER_K_NORMAL=3.0, CHANDELIER_K_PENNY=5.0 (paper_engine.py)

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
  deltas.macd = p.macdStatus === 'golden' ? 20 : p.macdStatus === 'dead' ? -20 : p.macdStatus === 'rising' ? 15 : -8;
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
  let tierColor = 'text-slate-700';
  let signal = 'NORMAL';
  if (isPennyBuy) { tier = 'Tier-Penny'; tierColor = 'text-cyan-700'; signal = 'STRONG BUY'; }
  else if (isTier1) { tier = 'Tier-1'; tierColor = 'text-emerald-700'; signal = 'STRONG BUY'; }
  else if (isTier2) { tier = 'Tier-2'; tierColor = 'text-teal-700'; signal = 'BUY'; }
  else if (isSell) { tier = 'SELL'; tierColor = 'text-rose-700'; signal = 'STRONG SELL'; }

  // ── Momentum Interceptor 동기화 (main.py) ──
  if (signal === 'STRONG BUY' && rvol < 3.0) {
    signal = 'HOLD (Momentum Blocked)';
    tierColor = 'text-amber-700';
  }

  return { score: finalScore, deltas, tier, tierColor, signal };
}

function calcSizing(p: SizingParams): SizingResult {
  // Fix D: weighted average (vol_weight + kelly) / 2, vol_weight×2 상한 캡 (백엔드 동기화)
  const annVol = p.atrPct * Math.sqrt(252);
  const volWeight = annVol > 1e-9 ? 0.15 / annVol : 0; // atrPct=0 시 Infinity 방지

  const q = 1 - p.winRate;
  const b = p.profitRatio;
  const kellyF = b > 0 ? (b * p.winRate - q) / b : 0;
  const optimalKelly = Math.max(0, kellyF) * 0.25;

  const avgWeight = (volWeight + optimalKelly) / 2;
  const finalWeight = Math.min(avgWeight, volWeight * 2.0, 1.0); // vol_weight 2배 캡
  const buyBudgetPct = Math.min(finalWeight, 0.25) * 100;

  return { annVol, volWeight: volWeight * 100, kellyF, optimalKelly: optimalKelly * 100, finalWeight: finalWeight * 100, buyBudgetPct };
}

function calcChandelier(highest: number, atrPct: number, isPenny: boolean, entryPrice: number): ChandelierResult {
  const k = isPenny ? 5.0 : 3.0;
  // 백엔드 ATR(14)은 현재가(≈진입가) 기준 절댓값. highest 기준으로 계산하면 상승 후 과대 추정됨.
  const atrAbs = entryPrice * atrPct;
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
        <span className="text-xs font-black uppercase tracking-widest text-slate-700">{label}</span>
        <span className="text-sm font-black text-slate-900 font-mono">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
      <div className="relative">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          className={`w-full h-1.5 rounded-full appearance-none bg-slate-200 cursor-pointer ${colorMap[color] ?? 'accent-indigo-500'}`}
        />
        <div className="absolute top-0 left-0 h-1.5 rounded-full pointer-events-none"
          style={{ width: `${pct}%`, background: color === 'rose' ? '#f43f5e' : color === 'emerald' ? '#10b981' : color === 'cyan' ? '#06b6d4' : color === 'amber' ? '#f59e0b' : '#6366f1' }}
        />
      </div>
    </div>
  );
}

function DeltaBar({ label, value, maxAbs = 25 }: { label: string; value: number; maxAbs?: number }) {
  const pct = Math.min(Math.abs(value) / maxAbs * 100, 100);
  const isPos = value >= 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-right text-slate-700 font-mono shrink-0">{label}</span>
      {/* 중앙 기준선: 왼쪽 절반(음수), 오른쪽 절반(양수) */}
      <div className="flex-1 h-5 flex rounded overflow-hidden relative bg-slate-100">
        <div className="w-1/2 flex justify-end items-center">
          {!isPos && (
            <div
              className="h-full bg-rose-500/70 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <div className="w-px bg-white shrink-0" />
        <div className="w-1/2 flex items-center">
          {isPos && (
            <div
              className="h-full bg-emerald-500/70 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span className={`absolute right-2 font-black font-mono ${isPos ? 'text-emerald-700' : 'text-rose-700'}`}>
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
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize="30" fontWeight="900" fontFamily="monospace">{score.toFixed(0)}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700" letterSpacing="3">DNA SCORE</text>
    </svg>
  );
}

// ── 프리셋 정의 ───────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  desc: string;
  color: string;
  values: { rsi: number; rvol: number; macdStatus: MacdStatus; adx: number; diPositive: boolean; isExtended: boolean; isPenny: boolean; entryPrice: number; };
}

const PRESETS: Preset[] = [
  {
    label: 'Tier-1 경계',
    desc: 'DNA ≈ 85',
    color: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    values: { rsi: 68, rvol: 3.5, macdStatus: 'golden', adx: 20, diPositive: true, isExtended: false, isPenny: false, entryPrice: 10 },
  },
  {
    label: 'Tier-2 경계',
    desc: 'DNA ≈ 82, RVOL>2',
    color: 'border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100',
    values: { rsi: 58, rvol: 2.5, macdStatus: 'golden', adx: 25, diPositive: true, isExtended: false, isPenny: false, entryPrice: 10 },
  },
  {
    label: '페니 STRONG BUY',
    desc: 'DNA ≈ 73, $1 이하',
    color: 'border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
    values: { rsi: 48, rvol: 2.2, macdStatus: 'rising', adx: 18, diPositive: true, isExtended: false, isPenny: true, entryPrice: 0.5 },
  },
];

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export function DnaSimulatorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL 파라미터에서 초기값 추출 (발굴 카드에서 클릭 시 자동 채워짐)
  const urlRsi    = searchParams.get('rsi')      ? Number(searchParams.get('rsi'))   : null;
  const urlRvol   = searchParams.get('rvol')     ? Number(searchParams.get('rvol'))  : null;
  const urlMacd   = searchParams.get('macd')     as MacdStatus | null;
  const urlAdx    = searchParams.get('adx')      ? Number(searchParams.get('adx'))   : null;
  const urlDiPos  = searchParams.get('diPos');
  const urlExt    = searchParams.get('extended');
  const urlPenny  = searchParams.get('penny');
  const urlAtr    = searchParams.get('atr')      ? Number(searchParams.get('atr'))   : null;
  const urlEntry  = searchParams.get('entry')    ? Number(searchParams.get('entry')) : null;
  const urlTicker = searchParams.get('ticker')   ?? '';

  // 지표 파라미터
  const [rsi, setRsi]               = useState(urlRsi   ?? 35);
  const [rvol, setRvol]             = useState(urlRvol  ?? 3.5);
  const [macdStatus, setMacdStatus] = useState<MacdStatus>(urlMacd ?? 'golden');
  const [adx, setAdx]               = useState(urlAdx   ?? 25);
  const [diPositive, setDiPositive] = useState(urlDiPos !== null ? urlDiPos === 'true' : true);
  const [isExtended, setIsExtended] = useState(urlExt   === 'true');
  const [isPenny, setIsPenny]       = useState(urlPenny === 'true');

  // 포지션 사이징 파라미터
  const [winRate, setWinRate]         = useState(0.55);
  const [profitRatio, setProfitRatio] = useState(2.0);
  const [atrPct, setAtrPct]           = useState(urlAtr != null ? urlAtr / 100 : 0.03);

  // Chandelier Exit 파라미터
  const [entryPrice, setEntryPrice]   = useState(urlEntry ?? (urlPenny === 'true' ? 0.5 : 10.0));
  const [highestPct, setHighestPct]   = useState(5);

  // 실제 계좌 잔고
  const [buyingPower, setBuyingPower] = useState<number | null>(null);

  useEffect(() => {
    fetchPaperAccount()
      .then(acc => { if (acc?.buying_power != null) setBuyingPower(acc.buying_power); })
      .catch(() => {});
  }, []);

  // isPenny 전환 시 entryPrice가 해당 모드의 유효 범위를 벗어나면 클램핑
  useEffect(() => {
    if (isPenny) setEntryPrice(p => Math.min(p, 1.0));
    else setEntryPrice(p => Math.max(p, 1.0));
  }, [isPenny]);

  const dna       = useMemo(() => calcDna({ rsi, rvol, macdStatus, adx, diPositive, isExtended, isPenny }), [rsi, rvol, macdStatus, adx, diPositive, isExtended, isPenny]);
  const sizing    = useMemo(() => calcSizing({ winRate, profitRatio, atrPct }), [winRate, profitRatio, atrPct]);
  const highest   = entryPrice * (1 + highestPct / 100);
  const chandelier = useMemo(() => calcChandelier(highest, atrPct, isPenny, entryPrice), [highest, atrPct, isPenny, entryPrice]);

  // Scale-Out 조건 계산 (paper_engine.py process_signal 로직)
  const profitPct        = highestPct / 100; // 최고가 = 현재 포지션 최고 수익률로 근사
  const scaleOutTrigger  = isPenny
    ? rsi > 70 || profitPct >= 0.20
    : rsi > 60;
  const scaleOutProfitOk = profitPct > 0; // 손실 중 Scale-Out 방지 (paper_engine 가드)
  const scaleOutFires    = scaleOutTrigger && scaleOutProfitOk;
  const postScaleTsPct   = isPenny ? 0.93 : null; // 일반은 최고가+1% 본절 TS
  const postScaleTs      = isPenny
    ? highest * 0.93
    : highest * 1.01; // 일반: 최고가 × 1.01 ≈ 본절+1%

  const macdOptions: { value: MacdStatus; label: string; score: number }[] = [
    { value: 'golden', label: '골든크로스', score: 20 },
    { value: 'dead',   label: '데드크로스', score: -20 },
    { value: 'rising', label: '상승 모멘텀', score: 15 },
    { value: 'falling',label: '하락 모멘텀', score: -8 },
  ];

  function applyPreset(p: Preset) {
    const v = p.values;
    setRsi(v.rsi); setRvol(v.rvol); setMacdStatus(v.macdStatus);
    setAdx(v.adx); setDiPositive(v.diPositive);
    setIsExtended(v.isExtended); setIsPenny(v.isPenny);
    setEntryPrice(v.entryPrice);
  }

  const buyBudgetDollar = buyingPower != null
    ? Math.min(buyingPower * (sizing.finalWeight / 100), 1000)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm border-slate-200 px-8 py-5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/stock/dashboard')}
              className="flex items-center gap-2 text-slate-700 hover:text-slate-900 transition-colors text-sm font-black uppercase tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:block">대시보드</span>
            </button>
            <div className="w-px h-6 bg-slate-100" />
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                DNA Score Simulator
                {urlTicker && <span className="text-indigo-700 text-sm">— {urlTicker}</span>}
              </h1>
              <p className="text-xs text-slate-700 uppercase tracking-widest">Fix A·B·C·D 반영 — 매수 전 리스크 사전 검증</p>
            </div>
          </div>

          {/* 계좌 잔고 표시 */}
          {buyingPower != null && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-700 uppercase tracking-widest font-black">가용잔고</span>
              <span className="text-slate-900 font-black font-mono">${buyingPower.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </div>
      </div>

      {/* 워크플로 안내 카드 (URL ticker 없을 때만 표시) */}
      {!urlTicker && (
        <div className="max-w-[1400px] mx-auto px-8 pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Sparkles,     title: '발굴 종목 이해', desc: '대시보드 발굴 카드의 🔬 버튼 → 해당 종목의 지표가 자동으로 채워집니다', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
              { icon: Scale,        title: '매수 전 리스크 계산', desc: '포지션 사이징 슬라이더로 "얼마나 살지"를 계좌 잔고 기준으로 확인하세요', color: 'text-teal-700 bg-teal-50 border-teal-200' },
              { icon: TrendingDown, title: '스탑 라인 미리 확인', desc: 'Chandelier TS 섹션에서 진입가·ATR 기준 트레일링 스탑 위치를 예측하세요', color: 'text-amber-700 bg-amber-50 border-amber-200' },
            ].map(item => (
              <div key={item.title} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${item.color}`}>
                <item.icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-black uppercase tracking-widest mb-0.5">{item.title}</div>
                  <div className="text-xs text-slate-700 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto px-8 py-8 grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8">

        {/* ─── 좌측: 파라미터 입력 ────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* 프리셋 버튼 */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-slate-700" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">빠른 시나리오</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all ${p.color}`}
                >
                  <div className="text-sm font-black uppercase tracking-widest leading-none">{p.label}</div>
                  <div className="text-sm text-slate-700 mt-1">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 기본 지표 */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm space-y-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">기술적 지표</h2>

            <Slider label="RSI" value={rsi} min={0} max={100} onChange={setRsi}
              color={rsi < 30 ? 'emerald' : rsi >= 75 ? 'rose' : 'indigo'} />
            {rsi >= 75 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>RSI ≥ 75: RVOL {rvol >= 5 ? '≥5.0 → 패널티 -10 (Fix A 적용)' : '<5.0 → 패널티 -20'}</span>
              </div>
            )}

            <Slider label="RVOL (상대거래량)" value={rvol} min={0} max={20} step={0.1} onChange={setRvol}
              color={rvol >= 5 ? 'emerald' : rvol >= 3 ? 'cyan' : 'indigo'} unit="×" />

            <div className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">MACD 상태</span>
              <div className="grid grid-cols-2 gap-2">
                {macdOptions.map(o => (
                  <button key={o.value} onClick={() => setMacdStatus(o.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all text-left flex justify-between items-center
                      ${macdStatus === o.value ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-700'}`}>
                    <span>{o.label}</span>
                    <span className={o.score > 0 ? 'text-emerald-700' : 'text-rose-700'}>{o.score > 0 ? '+' : ''}{o.score}</span>
                  </button>
                ))}
              </div>
            </div>

            <Slider label="ADX (추세 강도)" value={adx} min={0} max={50} onChange={setAdx} color="amber" />

            <div className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">DI 방향</span>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => setDiPositive(v)}
                    className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all
                      ${diPositive === v ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                    {v ? '+DI > -DI (상승)' : '-DI > +DI (하락)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">Is_Extended (급등)</span>
                {isExtended && <p className="text-sm text-amber-700 mt-0.5">
                  {rvol >= 5 ? 'RVOL≥5.0 → 패널티 -12 (Fix B)' : 'RVOL<5.0 → 패널티 -25'}
                </p>}
              </div>
              <button onClick={() => setIsExtended(v => !v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all
                  ${isExtended ? 'bg-rose-100 border-rose-300 text-rose-700' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                {isExtended ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">페니 종목 ($1 이하)</span>
                {isPenny && <p className="text-sm text-cyan-700 mt-0.5">DNA ≥ 70이면 Tier-Penny 진입</p>}
              </div>
              <button onClick={() => setIsPenny(v => !v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all
                  ${isPenny ? 'bg-cyan-100 border-cyan-300 text-cyan-700' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                {isPenny ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* 포지션 사이징 */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">포지션 사이징 (Fix D)</h2>
              <span className="text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">가중평균 = (vol + kelly) / 2</span>
            </div>
            <Slider label="승률 (Win Rate)" value={winRate} min={0.3} max={0.9} step={0.01} onChange={setWinRate} color="emerald" unit="" />
            <Slider label="손익비 (b)" value={profitRatio} min={0.5} max={5} step={0.1} onChange={setProfitRatio} color="emerald" unit="×" />
            <Slider label="ATR% (일별 변동폭)" value={atrPct * 100} min={0.5} max={20} step={0.5} onChange={v => setAtrPct(v / 100)} color="amber" unit="%" />
          </div>

          {/* Chandelier Exit */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">Chandelier Exit TS (Fix C)</h2>
              <span className="text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">k={isPenny ? '5.0 (페니)' : '3.0 (일반)'}</span>
            </div>
            <Slider label="진입가 ($)" value={entryPrice} min={0.1} max={isPenny ? 1.0 : 100} step={isPenny ? 0.01 : 0.5} onChange={setEntryPrice} color="cyan" />
            <Slider label="최고가 진입 후 상승%" value={highestPct} min={0} max={50} step={1} onChange={setHighestPct} color="emerald" unit="%" />
          </div>
        </div>

        {/* ─── 우측: 결과 시각화 ──────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Score + Tier */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div className="flex flex-col items-center">
                <ScoreArc score={dna.score} />
                <div className={`mt-1 px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-widest border ${
                  dna.tier === 'Tier-1' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
                  dna.tier === 'Tier-2' ? 'bg-teal-100 border-teal-200 text-teal-700' :
                  dna.tier === 'Tier-Penny' ? 'bg-cyan-100 border-cyan-200 text-cyan-700' :
                  dna.tier === 'SELL' ? 'bg-rose-100 border-rose-200 text-rose-700' :
                  'bg-slate-100 border-slate-300 text-slate-700'
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
                <div className="border-t border-slate-200 pt-2">
                  <DeltaBar label="TOTAL" value={dna.score} maxAbs={100} />
                </div>
              </div>
            </div>

            {/* Tier 게이트 표시 — 동적 Tailwind 클래스 불가, 정적 lookup map 사용 */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {([
                { label: 'Tier-1',     gate: 85, cond: !isPenny,             activeCard: 'border-emerald-200 bg-emerald-50', activeLbl: 'text-emerald-700', activeVal: 'text-emerald-700' },
                { label: 'Tier-2',     gate: 82, cond: !isPenny && rvol > 2.0, activeCard: 'border-teal-200 bg-teal-50',     activeLbl: 'text-teal-700',    activeVal: 'text-teal-700' },
                { label: 'Tier-Penny', gate: 70, cond: isPenny,               activeCard: 'border-cyan-200 bg-cyan-50',      activeLbl: 'text-cyan-700',    activeVal: 'text-cyan-700' },
              ] as const).map(t => {
                const gap = dna.score - t.gate;
                const active = t.cond && dna.score >= t.gate;
                return (
                  <div key={t.label} className={`rounded-xl border p-3 text-center transition-all ${active ? t.activeCard : 'border-slate-100 bg-slate-50'}`}>
                    <div className={`text-sm font-black uppercase tracking-widest ${active ? t.activeLbl : 'text-slate-700'}`}>{t.label}</div>
                    <div className={`text-xs font-black mt-1 ${active ? t.activeVal : 'text-slate-700'}`}>≥ {t.gate}</div>
                    <div className={`text-sm mt-1 ${gap >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {gap >= 0 ? '✓ 진입' : `${gap.toFixed(1)}pt 부족`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 포지션 사이징 결과 */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-700 mb-4">포지션 사이징 결과</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { label: '연환산 변동성', value: `${(sizing.annVol * 100).toFixed(1)}%`, desc: 'ATR × √252' },
                { label: 'vol_weight', value: `${sizing.volWeight.toFixed(1)}%`, desc: '15% / ann_vol' },
                { label: 'Kelly(f)', value: `${(sizing.optimalKelly).toFixed(1)}%`, desc: '하프켈리 × 0.25' },
                { label: '최종 비중', value: `${sizing.finalWeight.toFixed(1)}%`, desc: '(vol+kelly)/2 ← Fix D' },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-center">
                  <div className="text-sm font-black uppercase tracking-widest text-slate-700">{item.label}</div>
                  <div className="text-lg font-black text-slate-900 mt-1">{item.value}</div>
                  <div className="text-[8px] text-slate-700 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>

            {/* 비중 비교 (min vs avg) */}
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              <div className="text-sm font-black uppercase tracking-widest text-slate-700 mb-3">Fix D 효과 — min vs 가중평균</div>
              <div className="space-y-2">
                {[
                  { label: '기존 (min)', value: Math.min(sizing.volWeight, sizing.optimalKelly), color: 'bg-slate-600' },
                  { label: '신규 (avg)', value: sizing.finalWeight, color: 'bg-indigo-500' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs text-slate-700 w-24 shrink-0">{row.label}</span>
                    <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
                      <div className={`${row.color} h-full rounded transition-all duration-500`} style={{ width: `${Math.min(row.value * 4, 100)}%` }} />
                    </div>
                    <span className="text-xs font-black text-slate-900 font-mono w-12 text-right">{row.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>

              {/* 실제 잔고 기반 달러 예산 */}
              <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-700">
                  buy_budget = min(잔고 × {sizing.finalWeight.toFixed(1)}%, $1,000)
                </p>
                <p className="text-xs font-black font-mono">
                  {buyBudgetDollar != null
                    ? <span className="text-indigo-700">${buyBudgetDollar.toFixed(0)} <span className="text-slate-700 font-normal text-sm">예상 매수액</span></span>
                    : <span className="text-slate-700">잔고 불러오는 중…</span>
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Scale-Out 시나리오 */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">Scale-Out 시나리오</h2>
              <span className="text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                {isPenny ? 'RSI>70 또는 수익≥20%' : 'RSI>60'}
              </span>
            </div>

            {/* 트리거 조건 카드 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`rounded-xl border p-3 text-center transition-all ${
                (isPenny ? rsi > 70 : rsi > 60) ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'
              }`}>
                <div className="text-sm font-black uppercase tracking-widest text-slate-700">RSI 트리거</div>
                <div className={`text-sm font-black mt-1 ${(isPenny ? rsi > 70 : rsi > 60) ? 'text-amber-700' : 'text-slate-700'}`}>
                  RSI {isPenny ? '> 70' : '> 60'}
                </div>
                <div className={`text-sm mt-1 ${(isPenny ? rsi > 70 : rsi > 60) ? 'text-amber-700' : 'text-slate-700'}`}>
                  {(isPenny ? rsi > 70 : rsi > 60) ? '✓ 발동' : `현재 RSI=${rsi}`}
                </div>
              </div>
              {isPenny && (
                <div className={`rounded-xl border p-3 text-center transition-all ${
                  profitPct >= 0.20 ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'
                }`}>
                  <div className="text-sm font-black uppercase tracking-widest text-slate-700">수익률 트리거</div>
                  <div className={`text-sm font-black mt-1 ${profitPct >= 0.20 ? 'text-amber-700' : 'text-slate-700'}`}>
                    수익 ≥ 20%
                  </div>
                  <div className={`text-sm mt-1 ${profitPct >= 0.20 ? 'text-amber-700' : 'text-slate-700'}`}>
                    {profitPct >= 0.20 ? '✓ 발동' : `현재 +${(profitPct * 100).toFixed(0)}%`}
                  </div>
                </div>
              )}
              {!isPenny && (
                <div className={`rounded-xl border p-3 text-center ${scaleOutFires ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="text-sm font-black uppercase tracking-widest text-slate-700">수익 가드</div>
                  <div className={`text-sm font-black mt-1 ${scaleOutProfitOk ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {scaleOutProfitOk ? '수익 중' : '손실 — 차단'}
                  </div>
                  <div className="text-sm mt-1 text-slate-700">손실 구간 Scale-Out 방지</div>
                </div>
              )}
            </div>

            {/* Scale-Out 결과 */}
            <div className={`rounded-xl border p-4 transition-all ${scaleOutFires ? 'border-amber-200 bg-amber-500/5' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${scaleOutFires ? 'bg-amber-400 animate-pulse' : 'bg-slate-700'}`} />
                <span className={`text-xs font-black uppercase tracking-widest ${scaleOutFires ? 'text-amber-700' : 'text-slate-700'}`}>
                  {scaleOutFires ? 'Scale-Out 발동 — 50% 부분 청산' : 'Scale-Out 미발동'}
                </span>
              </div>
              {scaleOutFires ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-700">청산 수량</span>
                    <span className="font-black text-slate-900">보유 주식의 50%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">잔여 물량 TS 이동</span>
                    <span className="font-black text-amber-700">
                      ${postScaleTs.toFixed(isPenny ? 3 : 2)}
                      <span className="text-slate-700 font-normal ml-1">
                        ({isPenny ? `최고가 × ${postScaleTsPct}` : '최고가 × 1.01 (본절+1%)'})
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700">현재 최고가</span>
                    <span className="font-black text-slate-900">${highest.toFixed(isPenny ? 3 : 2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-700">
                  {isPenny
                    ? `RSI를 70 이상으로 올리거나 "최고가 상승%"를 20% 이상으로 올려보세요`
                    : `RSI를 60 이상으로 올려보세요 (현재 ${rsi})`}
                </p>
              )}
            </div>
          </div>

          {/* Chandelier Exit 결과 */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-700 mb-4">
              Chandelier Exit — TS = Highest − {chandelier.k}×ATR
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { label: '진입가', value: `$${entryPrice.toFixed(isPenny ? 3 : 2)}` },
                { label: '최고가', value: `$${highest.toFixed(isPenny ? 3 : 2)}` },
                { label: '고정 % TS', value: `$${chandelier.tsFixed.toFixed(isPenny ? 3 : 2)}`, sub: `${isPenny ? '-15%' : '-10%'} (기존)` },
                { label: 'Chandelier TS', value: `$${chandelier.tsChandelier.toFixed(isPenny ? 3 : 2)}`, sub: `k=${chandelier.k}×ATR`, highlight: true },
              ].map(item => (
                <div key={item.label} className={`rounded-xl border p-3 text-center ${item.highlight ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="text-sm font-black uppercase tracking-widest text-slate-700">{item.label}</div>
                  <div className={`text-lg font-black mt-1 ${item.highlight ? 'text-indigo-700' : 'text-slate-900'}`}>{item.value}</div>
                  {item.sub && <div className="text-[8px] text-slate-700 mt-0.5">{item.sub}</div>}
                </div>
              ))}
            </div>

            {/* TS 비교 시각화 */}
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
              <div className="text-sm font-black uppercase tracking-widest text-slate-700 mb-2">스탑 라인 위치 비교</div>
              {[
                { label: '고정 % TS', price: chandelier.tsFixed, color: 'bg-slate-500' },
                { label: 'Chandelier TS', price: chandelier.tsChandelier, color: 'bg-indigo-500' },
              ].map(row => {
                const dropPct = ((highest - row.price) / highest) * 100;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs text-slate-700 w-28 shrink-0">{row.label}</span>
                    <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
                      <div className={`${row.color} h-full rounded transition-all`} style={{ width: `${Math.max(0, 100 - dropPct * 3)}%` }} />
                    </div>
                    <span className="text-xs font-black text-rose-700 font-mono w-16 text-right">-{dropPct.toFixed(1)}%</span>
                  </div>
                );
              })}
              <p className="text-sm text-slate-700 mt-1">
                Chandelier가 낮을수록(더 여유) 스탑헌팅 내성 강화
              </p>
            </div>

            <div className="mt-4 flex items-start gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <ChevronRight className="w-3 h-3 mt-0.5 text-indigo-700 shrink-0" />
              <span>ATR%가 클수록(변동성 높음) Chandelier TS가 낮아져 마켓메이커 노이즈를 흡수합니다. ATR이 작으면 수익을 더 단단히 잠급니다.</span>
            </div>
          </div>

          {/* 주의사항 */}
          <div className="border border-amber-200 bg-amber-500/5 rounded-2xl px-5 py-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700/80 leading-relaxed">
              이 시뮬레이터는 백엔드 <code className="font-mono text-amber-700">paper_engine.py</code> · <code className="font-mono text-amber-700">main.py</code>의 수식과 동기화되어 있습니다.
              Fix A·B·C·D 적용 버전 기준이며, 실제 매매 신호는 1분봉 데이터 기반 연산 결과와 다를 수 있습니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DnaSimulatorPage;
