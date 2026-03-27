import React from 'react';
import { TrendingUp, TrendingDown, AlertCircle, Activity, Zap } from 'lucide-react';
import clsx from 'clsx';

// TypeScript 인터페이스 정의
export interface QuantSignalData {
    dna_score: number | null;
    bull_case: string;
    bear_case: string;
    reasoning_ko: string;
    tags?: string[];
}

interface QuantSignalCardProps {
    data: QuantSignalData | null;
}

export const QuantSignalCard: React.FC<QuantSignalCardProps> = ({ data }) => {
    // 데이터가 없을 경우 로딩/에러 처리
    if (!data) return (
        <div className="w-full p-8 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center min-h-[300px] shadow-inner">
            <div className="text-slate-500 font-black tracking-tight uppercase text-xs flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Synchronizing System Matrix...
            </div>
        </div>
    );

    const { dna_score, bull_case, bear_case, reasoning_ko, tags } = data;

    const isComputing = !bull_case || bull_case.includes('분석 중') || bull_case.includes('데이터');
    const showDNA = dna_score !== null && dna_score > 0;

    const getScoreColor = (score: number | null) => {
        if (score === null || score === 0) return 'text-slate-400 border-white/10';
        if (score >= 80) return 'text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]';
        if (score >= 60) return 'text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
        return 'text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]';
    };

    const getProgressBarColor = (score: number | null) => {
        if (score === null || score === 0) return 'bg-white/10';
        if (score >= 80) return 'bg-gradient-to-r from-emerald-600 to-emerald-400';
        if (score >= 60) return 'bg-gradient-to-r from-amber-600 to-amber-400';
        return 'bg-gradient-to-r from-rose-600 to-rose-400';
    };

    return (
        <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl group/card">
            {/* Ambient Lighting FX */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none group-hover/card:bg-indigo-500/20 transition-colors duration-1000" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="p-6 relative z-10">
                {/* Header Section */}
                <div className="flex justify-between items-start mb-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                           <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[9px] font-black uppercase tracking-widest">System Quantitative Matrix</span>
                        </div>
                        <h2 className="text-lg font-black flex items-center gap-2 tracking-tight text-white uppercase group-hover/card:text-indigo-300 transition-colors">
                            <Activity className="w-5 h-5 text-indigo-400" />
                            Quant Analysis
                        </h2>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {tags && tags.length > 0 ? (
                                tags.map((tag, index) => (
                                    <span
                                        key={index}
                                        className="px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.15em] rounded bg-white/5 text-slate-400 border border-white/5"
                                    >
                                        {tag}
                                    </span>
                                ))
                            ) : (
                                <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded bg-white/5 text-slate-500 border border-white/5 border-dashed">
                                    No Meta Tags
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Score Gauge */}
                    <div className={clsx(
                        "relative flex flex-col items-center justify-center w-16 h-16 rounded-2xl border bg-black/40 backdrop-blur-md shrink-0 transition-all duration-700",
                        getScoreColor(dna_score)
                    )}>
                        <span className="text-2xl font-black tracking-tighter relative z-10">
                            {showDNA ? dna_score : '—'}
                        </span>
                        <span className="text-[8px] uppercase font-black tracking-[0.2em] opacity-60 -mt-1 relative z-10">PTS</span>
                    </div>
                </div>

                {/* Tactical Progress Bar */}
                <div className="relative w-full bg-white/5 rounded-full h-2 mb-8 overflow-hidden border border-white/5">
                    <div
                        className={clsx(
                            "h-full rounded-full transition-all duration-1000 ease-out relative",
                            getProgressBarColor(dna_score)
                        )}
                        style={{ width: showDNA ? `${Math.max(0, Math.min(100, dna_score!))}%` : '0%' }}
                    />
                </div>

                {/* Analysis Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {isComputing ? (
                        <div className="col-span-2 flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Computing Quantitative Data...</p>
                            <p className="text-[9px] text-slate-500 font-medium">Validating mathematical vectors and momentum signals</p>
                        </div>
                    ) : (
                        <>
                            {/* Bull Case */}
                            <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 hover:border-emerald-500/30 transition-all group/case">
                                <h3 className="text-emerald-400 font-black text-[9px] uppercase tracking-[0.15em] flex items-center gap-2 mb-3">
                                    <TrendingUp className="w-3.5 h-3.5" /> Positive Indicators
                                </h3>
                                <p className="text-sm text-slate-300 leading-relaxed font-bold break-keep group-hover/case:text-white transition-colors">
                                    {bull_case}
                                </p>
                            </div>
                            {/* Bear Case */}
                            <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10 hover:border-rose-500/30 transition-all group/case">
                                <h3 className="text-rose-400 font-black text-[9px] uppercase tracking-[0.15em] flex items-center gap-2 mb-3">
                                    <TrendingDown className="w-3.5 h-3.5" /> Risk Vectors
                                </h3>
                                <p className="text-sm text-slate-300 leading-relaxed font-bold break-keep group-hover/case:text-white transition-colors">
                                    {bear_case}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Strategic Reasoning Report */}
                <div className="p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 group/report relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                        <Zap className="w-12 h-12 text-indigo-400" />
                    </div>
                    <h3 className="text-indigo-300 font-black text-[9px] uppercase tracking-[0.2em] flex items-center gap-2 mb-3 relative z-10">
                        <AlertCircle className="w-3.5 h-3.5" /> System Formula Verdict
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed font-bold break-keep relative z-10 group-hover/report:text-slate-100 transition-colors">
                        {isComputing
                            ? 'Computing high-fidelity quantitative analysis for this asset...'
                            : reasoning_ko}
                    </p>
                    
                    {!isComputing && (
                        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[8px] font-black text-slate-500 uppercase tracking-tighter">
                            <span>System Confidence: High</span>
                            <span className="flex items-center gap-1">Live Technical Verification</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
