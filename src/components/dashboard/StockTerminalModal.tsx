import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Fingerprint, Activity,
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
    ReferenceLine,
    CartesianGrid
} from 'recharts';

// ── Candlestick Chart (SVG-based) ──────────────────────────────────────
const CandlestickChart = ({
    ohlcData,
}: {
    ohlcData: { date: string; open: number; high: number; low: number; close: number }[];
}) => {
    const data = ohlcData.slice(-30);
    if (data.length < 2) return null;

    const allHighs = data.map(d => d.high);
    const allLows = data.map(d => d.low);
    const minPrice = Math.min(...allLows);
    const maxPrice = Math.max(...allHighs);
    const pad = (maxPrice - minPrice) * 0.08 || maxPrice * 0.02;
    const domMin = minPrice - pad;
    const domMax = maxPrice + pad;
    const range = domMax - domMin || 1;

    const WIDTH = 400;
    const HEIGHT = 180;
    const MARGIN = { top: 10, right: 40, bottom: 24, left: 4 };
    const chartW = WIDTH - MARGIN.left - MARGIN.right;
    const chartH = HEIGHT - MARGIN.top - MARGIN.bottom;

    const toY = (price: number) => MARGIN.top + chartH - ((price - domMin) / range) * chartH;
    const candleW = Math.max(2, (chartW / data.length) * 0.6);

    const yTicks = 4;
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => domMin + (range * i) / yTicks);

    const xLabelIndices = [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1];

    return (
        <div className="relative w-full h-52 bg-blue-50/50 rounded-2xl border border-blue-200 overflow-hidden">
            <svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
                {/* Grid lines */}
                {yTickValues.map((v, i) => (
                    <g key={i}>
                        <line
                            x1={MARGIN.left} y1={toY(v)}
                            x2={WIDTH - MARGIN.right} y2={toY(v)}
                            stroke="#e2e8f0" strokeWidth={0.5}
                        />
                        <text
                            x={WIDTH - MARGIN.right + 4} y={toY(v) + 3}
                            fontSize={8} fill="#64748b" fontFamily="monospace"
                        >
                            ${v.toFixed(v < 1 ? 3 : 2)}
                        </text>
                    </g>
                ))}
                {/* Candles */}
                {data.map((d, i) => {
                    const x = MARGIN.left + (i + 0.5) * (chartW / data.length);
                    const isUp = d.close >= d.open;
                    const color = isUp ? '#10b981' : '#f43f5e';
                    const bodyTop = toY(Math.max(d.open, d.close));
                    const bodyBot = toY(Math.min(d.open, d.close));
                    const bodyH = Math.max(1, bodyBot - bodyTop);
                    return (
                        <g key={i}>
                            {/* Wick */}
                            <line x1={x} y1={toY(d.high)} x2={x} y2={toY(d.low)} stroke={color} strokeWidth={1} />
                            {/* Body */}
                            <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} fillOpacity={0.9} />
                        </g>
                    );
                })}
                {/* X axis labels */}
                {xLabelIndices.map(i => {
                    if (i >= data.length) return null;
                    const x = MARGIN.left + (i + 0.5) * (chartW / data.length);
                    const d = data[i];
                    const label = d.date ? d.date.substring(5).replace('-', '/') : '';
                    return (
                        <text key={i} x={x} y={HEIGHT - 4} fontSize={8} fill="#64748b" fontFamily="monospace" textAnchor="middle">
                            {label}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

// ── Price Trajectory Chart (실제 히스토리 기반) ───────────────────────────
const PriceTrajectoryChart = ({
    history,
    currentPrice,
    buyPrice,
    targetPrice,
    stopPrice,
    ohlcData,
}: {
    history: { price: number; date: string }[];
    currentPrice: number;
    buyPrice?: number;
    targetPrice?: number;
    stopPrice?: number;
    ohlcData?: { date: string; open: number; high: number; low: number; close: number }[];
}) => {
    // If OHLC data is available, render candlestick chart
    if (ohlcData && ohlcData.length >= 2) {
        return <CandlestickChart ohlcData={ohlcData} />;
    }
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
            <div className="relative w-full h-52 bg-blue-50/50 rounded-2xl border border-blue-200 flex items-center justify-center">
                <span className="text-xs font-semibold text-blue-500 font-sans">장 개장 후 가격 데이터가 수집됩니다</span>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[260px] bg-white rounded-2xl border border-slate-100 shadow-[0_2px_20px_-8px_rgba(0,0,0,0.05)] overflow-hidden pt-4 pr-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity={0.15} />
                            <stop offset="100%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                        </linearGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={isUp ? "#10b981" : "#f43f5e"} floodOpacity="0.2" />
                        </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={40}
                        dy={10}
                    />
                    <YAxis
                        domain={[domainMin, domainMax]}
                        orientation="right"
                        tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace', fontWeight: 600 }}
                        tickFormatter={(val) => `$${val.toFixed(2)}`}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                        dx={5}
                    />
                    <Tooltip
                        contentStyle={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '10px 14px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            fontWeight: 'bold',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                        }}
                        labelStyle={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}
                        itemStyle={{ color: '#0f172a' }}
                        labelFormatter={(label) => {
                            try { return new Date(label).toLocaleDateString('ko-KR'); } catch { return ''; }
                        }}
                        formatter={(value: number | undefined) => [`$${Number(value ?? 0).toFixed(4)}`, 'Price']}
                    />
                    {/* 매수가 기준선 */}
                    {buyPrice && buyPrice > 0 && (
                        <ReferenceLine
                            y={buyPrice}
                            stroke="#6366f1"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                                value: `ENTRY $${buyPrice.toFixed(2)}`,
                                position: 'insideBottomLeft',
                                fill: '#4f46e5',
                                fontSize: 10,
                                fontWeight: 800,
                                fontFamily: 'monospace',
                            }}
                        />
                    )}
                    {/* 목표가 기준선 */}
                    {targetPrice && targetPrice > 0 && (
                        <ReferenceLine
                            y={targetPrice}
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            label={{
                                value: `TARGET $${targetPrice.toFixed(2)}`,
                                position: 'insideTopLeft',
                                fill: '#059669',
                                fontSize: 10,
                                fontWeight: 800,
                                fontFamily: 'monospace',
                            }}
                        />
                    )}
                    {/* 손절가 기준선 */}
                    {stopPrice && stopPrice > 0 && (
                        <ReferenceLine
                            y={stopPrice}
                            stroke="#f43f5e"
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            label={{
                                value: `STOP $${stopPrice.toFixed(2)}`,
                                position: 'insideBottomLeft',
                                fill: '#e11d48',
                                fontSize: 10,
                                fontWeight: 800,
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
                        strokeWidth={2.5}
                        style={{ filter: 'url(#glow)' }}
                        dot={false}
                        activeDot={{ r: 5, stroke: isUp ? '#10b981' : '#f43f5e', strokeWidth: 2.5, fill: '#ffffff', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))' }}
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
    description,
}: {
    label: string;
    value: number;
    maxValue: number;
    colorClass: string;
    displayValue: string;
    unit?: string;
    description: string;
}) => {
    const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
                <span className="text-blue-500">{label}</span>
                <span className={clsx("font-mono font-black", colorClass.replace('bg-', 'text-'))}>
                    {displayValue}{unit && <span className="text-blue-400 ml-0.5">{unit}</span>}
                </span>
            </div>
            <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={clsx("h-full rounded-full transition-all", colorClass)}
                />
            </div>
            <p className="text-[10px] text-blue-400 font-medium leading-snug font-sans">{description}</p>
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
        quantData?: unknown;
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
        ohlcData?: { date: string; open: number; high: number; low: number; close: number }[];
    };
    onAddToWatchlist?: () => Promise<void>;
}

export const StockTerminalModal = ({
    isOpen,
    onClose,
    data,
    onAddToWatchlist,
}: StockTerminalModalProps) => {
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

    // ── RSI 정규화 (0~100 그대로) ──────────────────────────────────────────
    const displayData = data;
    const rsiVal = displayData.rsi ?? 0;
    const rsiColor = rsiVal < 30 ? 'bg-emerald-500' : rsiVal > 70 ? 'bg-rose-500' : 'bg-cyan-600';

    // MACD → 정규화 (-2~2 범위를 0~100으로), 실측값 없으면 빈 막대
    const hasMacd = displayData.macdDiff !== undefined;
    const macdRaw = displayData.macdDiff ?? 0;
    const macdNorm = hasMacd ? Math.min(100, Math.max(0, (macdRaw + 2) / 4 * 100)) : 0;
    const macdColor = hasMacd ? (macdRaw > 0 ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-blue-300';

    // ADX (0~100 그대로)
    const adxVal = displayData.adx ?? 0;
    const adxColor = adxVal > 25 ? 'bg-emerald-500' : adxVal > 20 ? 'bg-amber-500' : 'bg-blue-300';

    // RVOL → 정규화 (0~10 범위를 0~100으로), 실측값 없으면 빈 막대
    const rvolVal = displayData.rvol ?? 0;
    const rvolNorm = Math.min(100, (rvolVal / 10) * 100);
    const rvolColor = rvolVal > 3 ? 'bg-emerald-500' : rvolVal > 2 ? 'bg-cyan-600' : 'bg-blue-300';

    const chartHistory = displayData.history || [];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 py-6">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col"
                    >
                        {/* ─── 1. Header ─────────────────────────────────────────── */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-b from-blue-50/60 to-transparent relative z-10">
                            <div className="flex items-center gap-6">
                                <img src="/logo.png" alt="MuzeBiz.Lab" className="w-20 h-20 object-contain" />
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5 font-mono">
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200 font-black tracking-[0.2em] uppercase">Quant Analysis</span>
                                        {displayData.rsi !== undefined && displayData.rsi > 0 && (
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold tracking-wider uppercase font-sans">실시간 지표 연동</span>
                                        )}
                                    </div>
                                    <h1 className="text-4xl font-black text-black tracking-tighter flex items-center gap-4">
                                        <span className="text-blue-300">/</span>
                                        {displayData.ticker}
                                    </h1>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all duration-300 group">
                                <X className="w-5 h-5 text-slate-500 group-hover:text-slate-900" />
                            </button>
                        </div>

                        {/* ─── 2. Content ────────────────────────────────────────── */}
                        <div className="p-6 space-y-6 overflow-y-auto max-h-[85vh] custom-scrollbar relative z-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                                {/* LEFT: 가격 추이 차트 + 시장 데이터 */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 mb-3 font-sans">
                                        <Activity className="w-4 h-4 text-indigo-600" /> 가격 추이 & 목표선
                                    </h3>
                                    <PriceTrajectoryChart
                                        history={chartHistory}
                                        currentPrice={displayData.price || 0}
                                        buyPrice={displayData.buyPrice}
                                        targetPrice={displayData.targetPrice}
                                        stopPrice={displayData.stopPrice}
                                        ohlcData={displayData.ohlcData}
                                    />
                                    <div className="grid grid-cols-3 gap-3 mt-4">
                                        <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 font-mono">
                                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1 font-sans">현재가</span>
                                            <span className="text-lg font-black text-slate-900">{formatPrice(displayData.price || 0)}</span>
                                            {displayData.changePercent !== undefined && (
                                                <span className={clsx(
                                                    "text-[10px] font-bold block mt-0.5",
                                                    displayData.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                                                )}>
                                                    {displayData.changePercent >= 0 ? '+' : ''}{displayData.changePercent.toFixed(2)}%
                                                </span>
                                            )}
                                        </div>
                                        <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 font-mono">
                                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1 font-sans">고가 (Day)</span>
                                            <span className="text-lg font-black text-slate-900">
                                                {displayData.dayHigh && displayData.dayHigh > 0
                                                    ? formatPrice(displayData.dayHigh)
                                                    : '—'}
                                            </span>
                                        </div>
                                        <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 font-mono">
                                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest block mb-1">거래량</span>
                                            <span className="text-lg font-black text-slate-900">
                                                {displayData.volume && displayData.volume > 0
                                                    ? formatVolume(displayData.volume)
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: 퀀트 분석 매트릭스 */}
                                <div className="bg-blue-50/50 rounded-2xl border border-blue-200 p-6 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-10 transition-opacity">
                                        <Fingerprint className="w-24 h-24 text-blue-900" />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-end mb-6">
                                            <div>
                                                <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1 font-sans">퀀트 분석 매트릭스</h3>
                                                <p className="text-[11px] text-blue-500 font-bold tracking-tight font-sans">RSI · MACD · ADX · RVOL 실측 기반</p>
                                            </div>
                                            <div className="flex gap-6 items-end text-right">
                                                {displayData.kellyWeight !== undefined && displayData.kellyWeight > 0 && (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1 font-sans">Kelly 비중</span>
                                                        <span className="text-4xl font-black text-indigo-600 font-mono tracking-tighter">
                                                            {(displayData.kellyWeight * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans">DNA</span>
                                                    <span className="text-5xl font-black text-slate-900 font-mono tracking-tighter leading-none">
                                                        {displayData.dnaScore}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <QuantIndicatorBar
                                                label="RSI (14)"
                                                value={rsiVal}
                                                maxValue={100}
                                                colorClass={rsiColor}
                                                displayValue={rsiVal > 0 ? rsiVal.toFixed(1) : '—'}
                                                description="상대강도지수. 30 이하는 과매도(반등 기대), 70 이상은 과매수(조정 위험) 구간입니다."
                                            />
                                            <QuantIndicatorBar
                                                label="MACD Histogram"
                                                value={macdNorm}
                                                maxValue={100}
                                                colorClass={macdColor}
                                                displayValue={hasMacd ? (macdRaw > 0 ? '+' : '') + macdRaw.toFixed(3) : '—'}
                                                description="단기·장기 이동평균 추세 차이. 0보다 크면(초록) 상승 모멘텀, 작으면(빨강) 하락 모멘텀을 의미합니다."
                                            />
                                            <QuantIndicatorBar
                                                label="ADX (추세 강도)"
                                                value={adxVal}
                                                maxValue={100}
                                                colorClass={adxColor}
                                                displayValue={adxVal > 0 ? adxVal.toFixed(1) : '—'}
                                                description="추세의 강도를 나타내는 지표. 25 이상이면 뚜렷한 추세, 20 이하면 방향성 없는 횡보 구간입니다."
                                            />
                                            <QuantIndicatorBar
                                                label="RVOL (상대거래량)"
                                                value={rvolNorm}
                                                maxValue={100}
                                                colorClass={rvolColor}
                                                displayValue={rvolVal > 0 ? rvolVal.toFixed(1) : '—'}
                                                unit="x"
                                                description="평소 대비 현재 거래량 배수. 1.5배 이상이면 시장의 관심이 집중되고 있다는 신호입니다."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>



                        <div className="p-6 pt-4 border-t border-slate-100 bg-white flex justify-between items-center relative z-10 font-mono">
                            <div className="flex items-center gap-4">
                                <button onClick={onClose} className="text-[10px] font-black text-blue-600 hover:text-blue-900 uppercase tracking-[0.2em] transition-all bg-blue-50 hover:bg-blue-100 px-6 py-3 rounded-xl border border-blue-200">
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
                                        className="text-[10px] font-black text-cyan-700 hover:text-cyan-800 uppercase tracking-[0.2em] transition-all bg-cyan-50 hover:bg-cyan-100 px-6 py-3 rounded-xl border border-cyan-200 flex items-center gap-2"
                                    >
                                        <List className="w-3.5 h-3.5" />
                                        Watchlist
                                    </button>
                                )}
                            </div>

                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
