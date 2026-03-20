import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
    X,
    TrendingUp,
    TrendingDown,
    Zap,
    Target,
    ChevronRight,
    Fingerprint,
    ShieldCheck,
    List,
    Loader2,
    Activity,
    HelpCircle
} from 'lucide-react';
import clsx from 'clsx';

interface StockTerminalModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        ticker: string;
        dnaScore: number;
        popProbability: number;
        bullPoints: string[];
        bearPoints: string[];
        matchedLegend: { ticker: string; similarity: number };
        riskLevel: string;
        quantSummary: string;
        price?: number;
        change?: string;
        kellyWeight?: number;
        efficiencyRatio?: number;
        quantData?: {
            math_mode: boolean;
            ma20_distance_pct: number;
            rsi_14: number;
            historical_win_rate_pct: number;
            similar_historical_cases: number;
            volatility_20d_pct: number;
            volume_surge_multiplier: number;
        };
    };
    onAddToWatchlist?: () => Promise<void>;
}

export const StockTerminalModal = ({ 
    isOpen, 
    onClose, 
    data,
    onAddToWatchlist
}: StockTerminalModalProps) => {
    const [isAddingWatchlist, setIsAddingWatchlist] = useState(false);
    const [liveData, setLiveData] = useState(data);
    const isMounted = useRef(true);

    // Sync state with incoming prop data
    useEffect(() => {
        setLiveData(data);
    }, [data]);

    // Fetch missing analysis data if it wasn't pre-loaded
    useEffect(() => {
        const fetchMissingData = async () => {
            if (data.bullPoints[0] !== "No details" && data.bullPoints[0] !== "모멘텀 지표 분석 중") return;
            
            try {
                // Import supabase directly in this async closure or use global if available.
                // It's better to fetch from daily_discovery or stock_analysis_cache.
                const { supabase } = await import('../../lib/supabase');
                const { data: cacheData, error } = await supabase
                    .from('stock_analysis_cache')
                    .select('analysis')
                    .eq('ticker', data.ticker)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) {
                    console.error("Supabase fetch error for analysis:", error);
                }

                if (cacheData && cacheData.analysis && isMounted.current) {
                    const analysis = cacheData.analysis;
                    setLiveData(prev => ({
                        ...prev,
                        bullPoints: analysis.bullCase || ["강세 요인 데이터가 부족합니다."],
                        bearPoints: analysis.bearCase || ["약세 요인 데이터가 부족합니다."],
                        quantSummary: analysis.aiSummary || prev.quantSummary,
                        popProbability: analysis.popProbability || prev.popProbability,
                        matchedLegend: analysis.matchedLegend || prev.matchedLegend,
                        riskLevel: analysis.riskLevel || prev.riskLevel,
                    }));
                } else if (isMounted.current) {
                    // Fallback clearly indicating lack of data instead of spinning
                    setLiveData(prev => ({
                        ...prev,
                        bullPoints: ["기술적 강세 시그널이 아직 포착되지 않았습니다.", "시스템 스캔을 다시 실행해 보세요."],
                        bearPoints: ["리스크 요인 분석 중입니다."],
                        quantSummary: "해당 종목에 대한 시스템 분석 데이터가 존재하지 않습니다."
                    }));
                }
            } catch (err) {
                console.error("Failed to fetch missing analysis:", err);
            }
        };

        fetchMissingData();
    }, [data.ticker]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);


    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-10">
                    {/* Backdrop */}
                    <div
                        onClick={onClose}
                        className="absolute inset-0 bg-[#020617]/90 backdrop-blur-2xl"
                    />

                    {/* Modal Container */}
                    <div
                        className="relative w-full max-w-5xl lg:max-w-6xl max-h-[95vh] md:max-h-[90vh] bg-[#020617]/90 backdrop-blur-3xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden shadow-[0_0_80px_rgba(99,102,241,0.2)] flex flex-col md:flex-row"
                    >
                        {/* Terminal Grid Overlay */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                             style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                        
                        {/* Ambient Background Glows */}
                        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full translate-x-1/2 translate-y-1/2 pointer-events-none" />

                        {/* Left Column: Core Identity & Chart */}
                        <div className="w-full md:w-1/2 lg:w-[45%] p-5 md:p-8 border-b md:border-b-0 md:border-r border-white/5 flex flex-col relative z-10 shrink-0">
                            <div className="flex justify-between items-start mb-6 md:mb-10">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="px-2 py-1 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold tracking-widest uppercase mb-2 inline-block">
                                            시스템 심층 분석
                                        </span>
                                    </div>
                                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter flex items-center gap-3">
                                        {liveData.ticker}
                                        <Fingerprint className="w-6 h-6 md:w-8 md:h-8 text-indigo-400 opacity-50" />
                                    </h1>
                                    <p className="text-slate-400 text-[10px] md:text-sm font-medium flex items-center gap-2 mt-1 md:mt-2">
                                        <span className={clsx(
                                            "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                                            liveData.dnaScore >= 70 ? "bg-emerald-500 shadow-emerald-500/50" : liveData.dnaScore >= 50 ? "bg-amber-500 shadow-amber-500/50" : "bg-rose-500 shadow-rose-500/50"
                                        )} />
                                        시스템 분석 신뢰도: <span className="text-white font-bold">{liveData.dnaScore}%</span>
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 md:p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors group"
                                >
                                    <X className="w-5 h-5 md:w-6 md:h-6 text-slate-400 group-hover:text-white transition-colors" />
                                </button>
                            </div>

                            {/* DNA Gauge Visualization */}
                            <div className="flex-1 flex flex-col justify-center">
                                <div className="h-32 md:h-48 w-full relative mb-8 flex flex-col justify-center px-4 md:px-8 bg-black/20 rounded-3xl border border-white/5">
                                    <div className="flex justify-between items-end mb-4">
                                        <span className="text-slate-400 font-black text-xs tracking-widest uppercase flex items-center gap-2 group/dna relative cursor-help">
                                            <Target className="w-4 h-4 text-indigo-400" />
                                            System Quant Analysis
                                        </span>
                                        <span className="text-4xl md:text-5xl font-black text-white">{liveData.dnaScore}</span>
                                    </div>
                                    <div className="w-full h-8 md:h-10 flex gap-1 relative">
                                        {[...Array(20)].map((_, i) => {
                                            const threshold = (i + 1) * 5;
                                            const isActive = liveData.dnaScore >= threshold;
                                            return (
                                                <div
                                                    key={i}
                                                    className={clsx(
                                                        "flex-1 rounded-sm shadow-[0_0_15px_rgba(0,0,0,0.2)]",
                                                        isActive 
                                                            ? (liveData.dnaScore >= 70 ? 'bg-[#10b981]' : liveData.dnaScore >= 50 ? 'bg-[#f59e0b]' : 'bg-[#f43f5e]') 
                                                            : 'opacity-10 bg-white'
                                                    )}
                                                    style={{ transform: isActive ? 'scaleY(1)' : 'scaleY(0.8)' }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between text-[9px] items-center text-slate-500 font-black font-mono mt-4 tracking-widest">
                                        <span>STATUS: READY</span>
                                        <div className="flex gap-4">
                                            <span>● SYSTEM_STABLE</span>
                                            <span>THROUGHPUT: 100%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Advanced Quant Metrics Pills */}
                                <div className="grid grid-cols-2 gap-3 md:gap-4 mt-4">
                                    <div className="bg-white/5 p-3 md:p-4 rounded-2xl md:rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group/er relative cursor-help">
                                        <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                                            Efficiency Ratio (ER)
                                            <HelpCircle className="w-2.5 h-2.5 opacity-30" />
                                        </p>
                                        <div className="flex items-end gap-1 md:gap-2 text-2xl md:text-3xl font-black text-emerald-400">
                                            {liveData.efficiencyRatio || '0.00'}
                                            <Activity className="w-4 h-4 md:w-5 md:h-5 mb-0.5 md:mb-1" />
                                        </div>
                                        <div className="absolute bottom-full left-0 mb-3 w-72 bg-slate-900/95 backdrop-blur-xl text-white text-[11px] p-4 rounded-xl shadow-2xl opacity-0 group-hover/er:opacity-100 transition-all z-50 pointer-events-none border border-white/10 leading-relaxed font-normal normal-case tracking-normal">
                                            <span className="text-emerald-400 font-bold block mb-1 uppercase tracking-widest text-[10px]">Trend Purity (ER)</span>
                                            추세의 방향성을 측정합니다. 1.0에 가까울수록 가격 변동의 노이즈가 적고 한 방향으로의 힘이 강력함을 수학적으로 증명합니다.
                                        </div>
                                    </div>
                                </div>

                                <div 
                                    className="mt-4 bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/30 group/kelly relative cursor-help shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]"
                                >
                                    <p className="text-[10px] text-indigo-300 uppercase font-black tracking-[0.2em] mb-2 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3" />
                                        사용자 포트폴리오 추천 비중
                                        <HelpCircle className="w-3 h-3 opacity-50" />
                                    </p>
                                    <div className="flex items-center justify-between relative z-10">
                                        <span className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                                            {liveData.kellyWeight || 0}%
                                        </span>
                                        <div className="text-right">
                                            <span className="text-[10px] text-indigo-300/80 font-bold block uppercase tracking-tighter">Safe Allocation</span>
                                            <span className="text-[8px] text-indigo-400/60 font-medium italic">Quarter-Kelly Applied</span>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-full left-0 mb-3 w-full bg-slate-900/95 backdrop-blur-xl text-white text-[11px] p-4 rounded-xl shadow-2xl opacity-0 group-hover/kelly:opacity-100 transition-all z-50 pointer-events-none leading-relaxed font-normal normal-case tracking-normal border border-white/10">
                                        <span className="text-indigo-400 font-bold block mb-1 uppercase tracking-widest text-[10px]">Position Sizing Guide</span> 
                                        승률과 손익비를 수학적으로 계산한 포트폴리오 비중입니다. 초저가주의 높은 변동성을 반영하여 이론값의 25%만 제안하는 보수적 수치(Quarter-Kelly)입니다.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Narrative & Evidence */}
                        <div className="flex-1 p-4 md:p-8 bg-black/20 flex flex-col overflow-y-auto w-full min-w-0 relative z-10
                                        [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent 
                                        [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
                            <div className="space-y-6 md:space-y-10">
                                {/* Strategic Result Section */}
                                <div>
                                    <h3 className="text-[10px] md:text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-3 md:mb-4 flex items-center gap-2">
                                        <Zap className="w-4 h-4 fill-indigo-400" />
                                        시스템 전략 리포트 (System Verdict)
                                    </h3>
                                    {(!liveData.quantSummary || liveData.quantSummary.includes("해당 자산에 대한") || liveData.quantSummary.includes("평가지가 존재하지")) ? (
                                        <div className="flex gap-4 mb-4">
                                            {liveData.quantData ? (
                                                <>
                                                    <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                                                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Win Rate</p>
                                                        <p className="text-lg font-black text-emerald-400">{liveData.quantData.historical_win_rate_pct}%</p>
                                                    </div>
                                                    <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                                                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Sim. Cases</p>
                                                        <p className="text-lg font-black text-indigo-400">{liveData.quantData.similar_historical_cases}</p>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-sm text-slate-400 font-medium italic mb-4 mt-2 px-2">
                                                    {liveData.quantSummary}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm sm:text-base md:text-lg lg:text-xl text-slate-200 font-medium leading-relaxed tracking-tight">
                                            {liveData.quantSummary}
                                        </p>
                                    )}
                                </div>

                                {/* Bull vs Bear Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                                    <div className="space-y-3 md:space-y-4">
                                        <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                            <TrendingUp className="w-3 h-3" />
                                            {liveData.quantData ? '수치 기반 강세 지표' : '강세 요인 (Bullish)'}
                                        </h4>
                                        <ul className="space-y-3">
                                            {liveData.bullPoints && liveData.bullPoints.length > 0 && liveData.bullPoints[0] !== "No details" && liveData.bullPoints[0] !== "모멘텀 지표 분석 중" ? (
                                                liveData.bullPoints.map((point, i) => (
                                                    <li key={i} className="flex gap-2 text-slate-400 text-sm font-medium leading-snug">
                                                        <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                        {point}
                                                    </li>
                                                ))
                                            ) : (
                                                <div className="py-6 px-4 rounded-2xl border border-white/5 bg-white/5 flex flex-col items-center justify-center gap-2 opacity-50">
                                                    <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest text-center">Identifying Bullish<br/>Confirmation...</span>
                                                </div>
                                            )}
                                        </ul>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                            <TrendingDown className="w-3 h-3" />
                                            {liveData.quantData ? '수치 기반 약세/변동성 지표' : '약세 요인 (Bearish)'}
                                        </h4>
                                        <ul className="space-y-3">
                                            {liveData.bearPoints && liveData.bearPoints.length > 0 && liveData.bearPoints[0] !== "No details" && liveData.bearPoints[0] !== "리스크 요인 스캔 중" ? (
                                                liveData.bearPoints.map((point, i) => (
                                                    <li key={i} className="flex gap-2 text-slate-400 text-sm font-medium leading-snug">
                                                        <ChevronRight className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                                        {point}
                                                    </li>
                                                ))
                                            ) : (
                                                <div className="py-6 px-4 rounded-2xl border border-white/5 bg-white/5 flex flex-col items-center justify-center gap-2 opacity-50">
                                                    <Activity className="w-6 h-6 text-slate-500" />
                                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest text-center">Scanning Risk<br/>Vectors...</span>
                                                </div>
                                            )}
                                        </ul>
                                    </div>
                                </div>


                                {/* Action Footer */}
                                <div className="pt-6 flex flex-col sm:flex-row gap-4 relative z-20">
                                    <button 
                                        onClick={async () => {
                                            if (onAddToWatchlist) {
                                                setIsAddingWatchlist(true);
                                                await onAddToWatchlist();
                                                if (isMounted.current) {
                                                    setIsAddingWatchlist(false);
                                                }
                                            }
                                        }}
                                        disabled={isAddingWatchlist}
                                        className="flex-1 bg-white/5 text-white font-black py-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isAddingWatchlist ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
                                        관심 종목 추가
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};
