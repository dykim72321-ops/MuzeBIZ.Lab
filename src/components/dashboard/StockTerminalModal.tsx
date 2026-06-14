import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, TrendingUp, TrendingDown, Zap, Target,
    Fingerprint, ShieldCheck, Activity, Dna, ArrowUpRight,
    List
} from 'lucide-react';
import clsx from 'clsx';

// 🆕 Neural Projection Chart (SVG 기반 과거 + 예측 하이브리드 차트)
const NeuralProjectionChart = ({
    currentPrice,
    targetPrice,
}: {
    currentPrice: number,
    targetPrice: number,
}) => {
    const isUp = targetPrice >= currentPrice;
    const color = isUp ? '#22d3ee' : '#f43f5e'; // Cyan or Rose
    const dropShadow = isUp ? 'drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]' : 'drop-shadow-[0_0_12px_rgba(244,63,94,0.8)]';

    return (
        <div className="relative w-full h-48 bg-[#020617]/60 rounded-3xl border border-slate-800/80 overflow-hidden flex flex-col justify-between p-6 group">
            {/* 배경 그리드 */}
            <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
            
            <div className="relative z-10 flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Neural Projection: 24H</span>
                </div>
                <div className="flex gap-1">
                    <div className="w-1 h-1 bg-emerald-500/40 rounded-full" />
                    <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                </div>
            </div>

            <svg className="w-full h-full absolute inset-0 preserve-3d" preserveAspectRatio="none" viewBox="0 0 100 100">
                {/* 과거 데이터 (가상의 Catmull-Rom Spline, 실선) */}
                <motion.path 
                    d="M 10,75 Q 30,65 50,70 T 80,60" 
                    fill="none" stroke="#334155" strokeWidth="2.5" 
                    initial={{ pathLength: 0 }} 
                    animate={{ pathLength: 1 }} 
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                />
                
                {/* AI 예측 궤적 (점선 + 네온 글로우) */}
                <motion.path 
                    d={isUp ? "M 80,60 Q 90,55 100,35" : "M 80,60 Q 90,65 100,85"} 
                    fill="none" stroke={color} strokeWidth="3" strokeDasharray="6 4"
                    className={dropShadow}
                    initial={{ pathLength: 0, opacity: 0 }} 
                    animate={{ pathLength: 1, opacity: 1 }} 
                    transition={{ duration: 1.5, delay: 1, ease: "easeInOut" }}
                />
                
                {/* 타겟 포인트 펄스 */}
                <motion.circle 
                    cx="100" cy={isUp ? "35" : "85"} r="3.5" fill={color} className={dropShadow}
                    initial={{ scale: 0 }} 
                    animate={{ scale: [1, 1.4, 1] }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                />

                {/* Stop Loss Line (Subtle) */}
                <line x1="10" y1="88" x2="100" y2="88" stroke="#f43f5e" strokeWidth="1" strokeDasharray="2 2" opacity="0.2" />
            </svg>
            
            <div className="relative z-10 w-full flex justify-between items-end">
                <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        Current Orbit
                    </span>
                    <div className="text-3xl font-black text-white font-mono tracking-tighter transition-all group-hover:text-indigo-400">
                        ${currentPrice.toFixed(2)}
                    </div>
                </div>
                <div className="text-right space-y-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 justify-end">
                        <Target className="w-3 h-3 text-cyan-400" /> AI Target
                    </span>
                    <div className={clsx("text-3xl font-black font-mono tracking-tighter", isUp ? "text-cyan-400" : "text-rose-400")}>
                        ${targetPrice.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    );
};

// 🆕 DnaMatrixBar Component
const DnaMatrixBar = ({ label, value, colorClass }: { label: string, value: number, colorClass: string }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
            <span className="text-slate-400">{label}</span>
            <span className={clsx("font-mono", colorClass.replace('bg-', 'text-'))}>{value}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
            <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: `${value}%` }} 
                transition={{ duration: 1, ease: "easeOut" }}
                className={clsx("h-full rounded-full transition-all", colorClass)}
            />
        </div>
    </div>
);

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
                        className="relative w-full max-w-4xl bg-[#0A0F1C]/95 backdrop-blur-3xl border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-[0_0_100px_rgba(34,211,238,0.15)] flex flex-col"
                    >
                        {/* 1. HUD Header Section */}
                        <div className="p-8 border-b border-slate-800/80 flex justify-between items-start bg-gradient-to-b from-slate-900/50 to-transparent relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]">
                                    <Dna className="w-8 h-8 text-indigo-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5 font-mono">
                                        <span className="px-2 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-black tracking-[0.2em] uppercase">Deep Dive Mode</span>
                                        <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black tracking-[0.2em] uppercase">Neural Engine Sync Active</span>
                                    </div>
                                    <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-4">
                                        <span className="text-slate-500 opacity-40">/</span>
                                        {displayData.ticker}
                                        <span className="text-xs font-bold text-slate-400 opacity-80 uppercase tracking-widest bg-slate-950/80 px-2 py-0.5 rounded border border-slate-850 font-mono">NASDAQ</span>
                                    </h1>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all duration-300 group">
                                <X className="w-5 h-5 text-slate-400 group-hover:text-white" />
                            </button>
                        </div>

                        {/* 2. HUD Core Content (Single Pane) */}
                        <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar relative z-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                                <div className="space-y-3">
                                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2 mb-3 font-mono">
                                        <Activity className="w-4 h-4 text-indigo-400" /> Neural Projection Matrix
                                    </h3>
                                    <NeuralProjectionChart
                                        currentPrice={displayData.price || 0}
                                        targetPrice={displayData.targetPrice || (displayData.price ? displayData.price * 1.05 : 0)}
                                    />
                                    <div className="grid grid-cols-2 gap-4 mt-6">
                                        <div className="bg-slate-950/45 p-4 rounded-2xl border border-slate-855/60 font-mono">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Day High</span>
                                            <span className="text-lg font-black text-white">$825.40</span>
                                        </div>
                                        <div className="bg-slate-950/45 p-4 rounded-2xl border border-slate-855/60 font-mono">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Volume (24H)</span>
                                            <span className="text-lg font-black text-white">42.8M</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#020617]/40 rounded-3xl border border-slate-800/80 p-8 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Fingerprint className="w-24 h-24" />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-end mb-6">
                                            <div>
                                                <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.3em] mb-1 font-mono">Core DNA Matrix</h3>
                                                <p className="text-[10px] text-slate-500 font-medium tracking-tight">Confidence Verification Node</p>
                                            </div>
                                            <span className="text-5xl font-black text-white font-mono tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                                                {displayData.dnaScore}
                                            </span>
                                        </div>
                                        <div className="space-y-6">
                                            <DnaMatrixBar label="Institutional Flow" value={Math.min(displayData.dnaScore + 10, 98)} colorClass="bg-emerald-400" />
                                            <DnaMatrixBar label="Relative Strength" value={Math.min(displayData.dnaScore - 5, 100)} colorClass="bg-indigo-400" />
                                            <DnaMatrixBar label="Sentiment Engine" value={Math.min(displayData.dnaScore + 2, 100)} colorClass="bg-cyan-400" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#0d1527]/40 rounded-3xl border border-white/5 p-8 space-y-6">
                                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2 mb-4 font-mono">
                                    <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400/10" /> System Verdict & Catalysts
                                </h3>
                                <p className="text-md text-slate-300 font-medium leading-relaxed mb-6">
                                    {displayData.formulaVerdict || "시스템 분석 결과를 불러오는 중입니다..."}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-800/50">
                                    <div className="space-y-3">
                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block mb-2 font-mono">Alpha Catalysts</span>
                                        <ul className="space-y-2">
                                            {displayData.bullPoints?.slice(0, 3).map((pt, i) => (
                                                <li key={i} className="flex gap-2 text-xs text-slate-400 font-medium items-start">
                                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {pt}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="space-y-3">
                                        <span className="text-[9px] font-black text-rose-450 uppercase tracking-widest block mb-2 font-mono">Delta Risks</span>
                                        <ul className="space-y-2">
                                            {displayData.bearPoints?.slice(0, 3).map((pt, i) => (
                                                <li key={i} className="flex gap-2 text-xs text-slate-500 font-medium items-start">
                                                    <TrendingDown className="w-3.5 h-3.5 text-rose-450 shrink-0 mt-0.5" /> {pt}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Smart Execute Action Footer */}
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
                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Confidence Allocation</span>
                                    <span className="text-xs font-black text-indigo-400">{displayData.kellyWeight || 25}% Q-Kelly</span>
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
