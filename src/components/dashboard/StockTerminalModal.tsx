import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, TrendingUp, TrendingDown, Zap,
    Fingerprint, ShieldCheck, Activity, Dna, ArrowUpRight,
    List
} from 'lucide-react';
import clsx from 'clsx';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine
} from 'recharts';
import { generateVerdictFromIndicators } from '../../utils/generateVerdictFromIndicators';

// ── Price Trajectory Chart (실제 히스토리 기반) ───────────────────────────
const PriceTrajectoryChart = ({
    history,
    currentPrice,
    buyPrice,
    targetPrice,
    stopPrice,
}: {
    history: { price: number; date: string }[];
    currentPrice: number;
    buyPrice?: number;
    targetPrice?: number;
    stopPrice?: number;
}) => {
    // Ensure current price is included as the last data point
    const chartData = [...history];
    if (currentPrice > 0 && (chartData.length === 0 || chartData[chartData.length - 1]?.price !== currentPrice)) {
        chartData.push({ price: currentPrice, date: new Date().toISOString() });
    }

    const prices = chartData.map(d => d.price).filter(p => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
    const pad = (maxPrice - minPrice) * 0.15 || maxPrice * 0.05;
    const domainMin = Math.max(0, minPrice - pad);
    const domainMax = maxPrice + pad;

    const isUp = currentPrice >= (buyPrice || currentPrice);

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        } catch {
            return '';
        }
    };

    if (chartData.length < 2) {
        return (
            <div className="relative w-full h-52 bg-[#020617]/60 rounded-2xl border border-slate-800/80 flex items-center justify-center">
                <span className="text-xs font-semibold text-slate-400 font-sans">장 개장 후 가격 데이터가 수집됩니다</span>
            </div>
        );
    }

    return (
        <div className="relative w-full h-52 bg-[#020617]/60 rounded-2xl border border-slate-800/80 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                    <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                        axisLine={{ stroke: '#1e293b' }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={50}
                    />
                    <YAxis
                        domain={[domainMin, domainMax]}
                        hide
                    />
                    <Tooltip
                        contentStyle={{
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            padding: '8px 12px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                        }}
                        labelFormatter={(label) => {
                            try { return new Date(label).toLocaleDateString('ko-KR'); } catch { return ''; }
                        }}
                        formatter={(value: any) => [`$${Number(value).toFixed(4)}`, '가격']}
                    />
                    {/* 매수가 기준선 */}
                    {buyPrice && buyPrice > 0 && (
                        <ReferenceLine
                            y={buyPrice}
                            stroke="#6366f1"
                            strokeDasharray="6 3"
                            strokeWidth={1.5}
                            label={{
                                value: `매수 $${buyPrice.toFixed(2)}`,
                                position: 'left',
                                fill: '#818cf8',
                                fontSize: 9,
                                fontFamily: 'monospace',
                            }}
                        />
                    )}
                    {/* 목표가 기준선 */}
                    {targetPrice && targetPrice > 0 && (
                        <ReferenceLine
                            y={targetPrice}
                            stroke="#10b981"
                            strokeDasharray="4 4"
                            strokeWidth={1}
                            label={{
                                value: `목표 $${targetPrice.toFixed(2)}`,
                                position: 'right',
                                fill: '#34d399',
                                fontSize: 9,
                                fontFamily: 'monospace',
                            }}
                        />
                    )}
                    {/* 손절가 기준선 */}
                    {stopPrice && stopPrice > 0 && (
                        <ReferenceLine
                            y={stopPrice}
                            stroke="#f43f5e"
                            strokeDasharray="4 4"
                            strokeWidth={1}
                            label={{
                                value: `손절 $${stopPrice.toFixed(2)}`,
                                position: 'right',
                                fill: '#fb7185',
                                fontSize: 9,
                                fontFamily: 'monospace',
                            }}
                        />
                    )}
                    <Area
                        type="monotone"
                        dataKey="price"
                        stroke={isUp ? "#10b981" : "#f43f5e"}
                        fillOpacity={1}
                        fill="url(#priceGrad)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, stroke: isUp ? '#10b981' : '#f43f5e', strokeWidth: 2, fill: '#0f172a' }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

// ── Quant Indicator Bar ─────────────────────────────────────────────────
const QuantIndicatorBar = ({
    label,
    value,
    maxValue,
    colorClass,
    displayValue,
    unit,
}: {
    label: string;
    value: number;
    maxValue: number;
    colorClass: string;
    displayValue: string;
    unit?: string;
}) => {
    const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
                <span className="text-slate-400">{label}</span>
                <span className={clsx("font-mono font-black", colorClass.replace('bg-', 'text-'))}>
                    {displayValue}{unit && <span className="text-slate-500 ml-0.5">{unit}</span>}
                </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={clsx("h-full rounded-full transition-all", colorClass)}
                />
            </div>
        </div>
    );
};

// ── Helper: format volume ───────────────────────────────────────────────
function formatVolume(vol: number): string {
    if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
    return vol.toFixed(0);
}

// ── Helper: format price with auto-precision ────────────────────────────
function formatPrice(price: number): string {
    if (price <= 0) return '—';
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 100) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(2)}`;
}

interface StockTerminalModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        ticker: string;
        dnaScore: number;
        popProbability?: number;
        bullPoints: string[];
        bearPoints: string[];
        riskLevel: string;
        formulaVerdict: string;
        price?: number;
        change?: string;
        kellyWeight?: number;
        efficiencyRatio?: number;
        targetPrice?: number;
        stopPrice?: number;
        quantData?: any;
        matchedLegend?: { ticker: string; similarity: number };
        quantSummary?: string;
        // ── 실측 데이터 확장 필드 ────────────────────────────────
        dayHigh?: number;
        dayLow?: number;
        volume?: number;
        rsi?: number;
        macdDiff?: number;
        adx?: number;
        rvol?: number;
        changePercent?: number;
        history?: { price: number; date: string }[];
        buyPrice?: number;
    };
    onAddToWatchlist?: () => Promise<void>;
    onExecuteTrade?: (tradeParams: any) => void;
}

export const StockTerminalModal = ({
    isOpen,
    onClose,
    data,
    onAddToWatchlist,
    onExecuteTrade
}: StockTerminalModalProps) => {
    const [fetchedAnalysis, setFetchedAnalysis] = useState<Partial<typeof data> | null>(null);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const displayData = fetchedAnalysis ? { ...data, ...fetchedAnalysis } : data;

    useEffect(() => {
        setFetchedAnalysis(null);
        if (!isOpen) return;

        const fetchMissingData = async () => {
            const hasDetailedPoints = data.bullPoints && data.bullPoints.length > 0 && data.bullPoints[0] !== "모멘텀 지표 분석 중";
            if (hasDetailedPoints) return;

            try {
                const { supabase } = await import('../../lib/supabase');
                const { data: cacheData } = await supabase
                    .from('stock_analysis_cache')
                    .select('analysis')
                    .eq('ticker', data.ticker)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (isMounted.current && cacheData?.analysis) {
                    const analysis = cacheData.analysis;
                    setFetchedAnalysis({
                        bullPoints: analysis.bullCase || ["강세 요인 데이터 부족"],
                        bearPoints: analysis.bearCase || ["약세 요인 데이터 부족"],
                        formulaVerdict: analysis.matchReasoning || data.formulaVerdict,
                        riskLevel: analysis.riskLevel || data.riskLevel,
                    });
                }
            } catch (err) {
                console.error("Analysis fetch error:", err);
            }
        };

        fetchMissingData();
    }, [data.ticker, isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    // ── 실측 지표 기반 자동 분석 생성 ─────────────────────────────────────
    const autoVerdict = generateVerdictFromIndicators({
        rsi: displayData.rsi,
        macdDiff: displayData.macdDiff,
        adx: displayData.adx,
        rvol: displayData.rvol,
        dnaScore: displayData.dnaScore,
        price: displayData.price,
        changePercent: displayData.changePercent,
        targetPrice: displayData.targetPrice,
        stopPrice: displayData.stopPrice,
        kellyWeight: displayData.kellyWeight,
    });

    // Cache/fetch 결과가 있으면 우선 사용, 없으면 auto-generated
    const finalBullPoints = (displayData.bullPoints && displayData.bullPoints.length > 0 && displayData.bullPoints[0] !== "모멘텀 지표 분석 중")
        ? displayData.bullPoints
        : autoVerdict.bullPoints;
    const finalBearPoints = (displayData.bearPoints && displayData.bearPoints.length > 0 && displayData.bearPoints[0] !== "리스크 요인 스캔 중")
        ? displayData.bearPoints
        : autoVerdict.bearPoints;
    const finalVerdict = (displayData.formulaVerdict && displayData.formulaVerdict !== "시스템 분석 결과를 불러오는 중입니다...")
        ? displayData.formulaVerdict
        : autoVerdict.verdict;

    // ── RSI 정규화 (0~100 그대로) ──────────────────────────────────────────
    const rsiVal = displayData.rsi ?? 0;
    const rsiColor = rsiVal < 30 ? 'bg-emerald-400' : rsiVal > 70 ? 'bg-rose-400' : 'bg-cyan-400';

    // MACD → 정규화 (-2~2 범위를 0~100으로)
    const macdRaw = displayData.macdDiff ?? 0;
    const macdNorm = Math.min(100, Math.max(0, (macdRaw + 2) / 4 * 100));
    const macdColor = macdRaw > 0 ? 'bg-emerald-400' : 'bg-rose-400';

    // ADX (0~100 그대로)
    const adxVal = displayData.adx ?? 0;
    const adxColor = adxVal > 25 ? 'bg-emerald-400' : adxVal > 20 ? 'bg-amber-400' : 'bg-slate-500';

    // RVOL → 정규화 (0~10 범위를 0~100으로)
    const rvolVal = displayData.rvol ?? 1.0;
    const rvolNorm = Math.min(100, (rvolVal / 10) * 100);
    const rvolColor = rvolVal > 3 ? 'bg-emerald-400' : rvolVal > 2 ? 'bg-cyan-400' : 'bg-slate-500';

    const chartHistory = displayData.history || [];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-[#020617]/95 backdrop-blur-3xl" />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        className="relative w-full max-w-4xl bg-[#0A0F1C]/95 backdrop-blur-3xl border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-[0_0_100px_rgba(34,211,238,0.1)] flex flex-col"
                    >
                        {/* ─── 1. Header ─────────────────────────────────────────── */}
                        <div className="p-8 border-b border-slate-800/80 flex justify-between items-start bg-gradient-to-b from-slate-900/50 to-transparent relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]">
                                    <Dna className="w-8 h-8 text-indigo-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5 font-mono">
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-black tracking-[0.2em] uppercase">Quant Analysis</span>
                                        {displayData.rsi !== undefined && displayData.rsi > 0 && (
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-extrabold tracking-wider uppercase font-sans">실시간 지표 연동</span>
                                        )}
                                    </div>
                                    <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-4">
                                        <span className="text-slate-500 opacity-40">/</span>
                                        {displayData.ticker}
                                    </h1>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all duration-300 group">
                                <X className="w-5 h-5 text-slate-400 group-hover:text-white" />
                            </button>
                        </div>

                        {/* ─── 2. Content ────────────────────────────────────────── */}
                        <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar relative z-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                                {/* LEFT: 가격 추이 차트 + 시장 데이터 */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-3 font-sans">
                                        <Activity className="w-4 h-4 text-indigo-400" /> 가격 추이 & 목표선
                                    </h3>
                                    <PriceTrajectoryChart
                                        history={chartHistory}
                                        currentPrice={displayData.price || 0}
                                        buyPrice={displayData.buyPrice}
                                        targetPrice={displayData.targetPrice}
                                        stopPrice={displayData.stopPrice}
                                    />
                                    <div className="grid grid-cols-3 gap-3 mt-4">
                                        <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/60 font-mono">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 font-sans">현재가</span>
                                            <span className="text-lg font-black text-white">{formatPrice(displayData.price || 0)}</span>
                                            {displayData.changePercent !== undefined && (
                                                <span className={clsx(
                                                    "text-[10px] font-bold block mt-0.5",
                                                    displayData.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                                                )}>
                                                    {displayData.changePercent >= 0 ? '+' : ''}{displayData.changePercent.toFixed(2)}%
                                                </span>
                                            )}
                                        </div>
                                        <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/60 font-mono">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 font-sans">고가 (Day)</span>
                                            <span className="text-lg font-black text-white">
                                                {displayData.dayHigh && displayData.dayHigh > 0
                                                    ? formatPrice(displayData.dayHigh)
                                                    : '—'}
                                            </span>
                                        </div>
                                        <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/60 font-mono">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">거래량</span>
                                            <span className="text-lg font-black text-white">
                                                {displayData.volume && displayData.volume > 0
                                                    ? formatVolume(displayData.volume)
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: 퀀트 분석 매트릭스 */}
                                <div className="bg-[#020617]/40 rounded-2xl border border-slate-800/80 p-7 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Fingerprint className="w-24 h-24" />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-end mb-6">
                                            <div>
                                                <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-1 font-sans">퀀트 분석 매트릭스</h3>
                                                <p className="text-[11px] text-slate-400 font-bold tracking-tight font-sans font-sans">RSI · MACD · ADX · RVOL 실측 기반</p>
                                            </div>
                                            <span className="text-5xl font-black text-white font-mono tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                                                {displayData.dnaScore}
                                            </span>
                                        </div>
                                        <div className="space-y-5">
                                            <QuantIndicatorBar
                                                label="RSI (14)"
                                                value={rsiVal}
                                                maxValue={100}
                                                colorClass={rsiColor}
                                                displayValue={rsiVal > 0 ? rsiVal.toFixed(1) : '—'}
                                            />
                                            <QuantIndicatorBar
                                                label="MACD Histogram"
                                                value={macdNorm}
                                                maxValue={100}
                                                colorClass={macdColor}
                                                displayValue={macdRaw !== 0 ? (macdRaw > 0 ? '+' : '') + macdRaw.toFixed(3) : '—'}
                                            />
                                            <QuantIndicatorBar
                                                label="ADX (추세 강도)"
                                                value={adxVal}
                                                maxValue={100}
                                                colorClass={adxColor}
                                                displayValue={adxVal > 0 ? adxVal.toFixed(1) : '—'}
                                            />
                                            <QuantIndicatorBar
                                                label="RVOL (상대거래량)"
                                                value={rvolNorm}
                                                maxValue={100}
                                                colorClass={rvolColor}
                                                displayValue={rvolVal > 0 ? rvolVal.toFixed(1) : '—'}
                                                unit="x"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ─── 투자 판단 근거 ───────────────────────────────────── */}
                            <div className="bg-[#0d1527]/40 rounded-2xl border border-white/5 p-7 space-y-5">
                                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-3 font-sans">
                                    <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400/10" /> 투자 판단 근거
                                </h3>
                                <p className="text-sm text-slate-300 font-medium leading-relaxed mb-5">
                                    {finalVerdict}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-800/50">
                                    <div className="space-y-3">
                                        <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider block mb-2 font-sans">
                                            강세 요인 (Bull Case)
                                        </span>
                                        <ul className="space-y-2.5">
                                            {finalBullPoints.slice(0, 4).map((pt, i) => (
                                                <li key={i} className="flex gap-2.5 text-xs text-slate-300 font-medium items-start leading-relaxed">
                                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {pt}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="space-y-3">
                                        <span className="text-[11px] font-black text-rose-400 uppercase tracking-wider block mb-2 font-sans">
                                            리스크 요인 (Bear Case)
                                        </span>
                                        <ul className="space-y-2.5">
                                            {finalBearPoints.slice(0, 4).map((pt, i) => (
                                                <li key={i} className="flex gap-2.5 text-xs text-slate-400 font-medium items-start leading-relaxed">
                                                    <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" /> {pt}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── 3. Footer ────────────────────────────────────────── */}
                        <div className="p-8 border-t border-slate-800/80 bg-[#020617] flex justify-between items-center relative z-10 font-mono">
                            <div className="flex items-center gap-4">
                                <button onClick={onClose} className="text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-[0.2em] transition-all bg-white/5 px-6 py-3 rounded-xl border border-white/5">
                                    Close
                                </button>

                                {onAddToWatchlist && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                await onAddToWatchlist();
                                            } catch (error) {
                                                console.error("Watchlist add error:", error);
                                            }
                                        }}
                                        className="text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-[0.2em] transition-all bg-cyan-500/10 px-6 py-3 rounded-xl border border-cyan-500/20 flex items-center gap-2"
                                    >
                                        <List className="w-3.5 h-3.5" />
                                        Watchlist
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="hidden md:flex flex-col items-end mr-2 text-right">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Kelly 적정 비중</span>
                                    <span className="text-xs font-black text-indigo-400">{displayData.kellyWeight?.toFixed(1) ?? '—'}%</span>
                                </div>
                                <button
                                    onClick={() => onExecuteTrade && onExecuteTrade({
                                        ticker: displayData.ticker,
                                        price: displayData.price,
                                        targetPrice: displayData.targetPrice,
                                        stopPrice: displayData.stopPrice,
                                        lotSize: displayData.kellyWeight
                                    })}
                                    className="group relative px-10 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 flex items-center gap-3"
                                >
                                    <ShieldCheck className="w-4 h-4 text-white" />
                                    <span>Execute Trade</span>
                                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
