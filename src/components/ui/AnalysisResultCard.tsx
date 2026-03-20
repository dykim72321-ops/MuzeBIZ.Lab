import { useState } from 'react';
import { Target, Zap } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { StockTerminalModal } from '../dashboard/StockTerminalModal';
import { addToWatchlist } from '../../services/watchlistService';
import { toast } from 'sonner';
import clsx from 'clsx';

interface AnalysisResultCardProps {
    ticker: string;
    dnaScore: number;
    popProbability: number;
    bullPoints: string[];
    bearPoints: string[];
    matchedLegend: { ticker: string; similarity: number };
    riskLevel: string;
    className?: string;
    quantSummary?: string;
    price?: number;
}

export const AnalysisResultCard = ({
    ticker,
    dnaScore,
    popProbability,
    bullPoints,
    bearPoints,
    matchedLegend,
    riskLevel,
    className,
    quantSummary,
    price
}: AnalysisResultCardProps) => {
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);

    const isSTier = dnaScore >= 80;
    const isATier = dnaScore >= 70 && dnaScore < 80;

    // Sparkline data (mocked for visual effect)
    const sparkData = [
        { v: 30 }, { v: 45 }, { v: 35 }, { v: 60 }, { v: 50 }, { v: dnaScore }
    ];

    return (
        <>
            <div
                onClick={() => setIsTerminalOpen(true)}
                className={clsx(
                    "relative group cursor-pointer transition-all duration-300",
                    className
                )}
            >
                <div className={clsx(
                    "relative h-full min-h-[220px] flex flex-col p-5 bg-slate-900/40 backdrop-blur-2xl border rounded-[2rem] overflow-hidden transition-all duration-300",
                    isSTier ? "border-indigo-500/20 bg-indigo-500/5 hover:border-indigo-500/40" :
                        isATier ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40" :
                            "border-white/5 hover:border-white/10"
                )}>
                    {/* Header: Compact Layout */}
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black text-white tracking-tighter">{ticker}</h3>
                            <div className={clsx(
                                "px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase border",
                                isSTier ? "bg-indigo-500 text-white border-transparent" :
                                    isATier ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
                                        dnaScore >= 50 ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
                                            "bg-rose-500/10 border-rose-500/30 text-rose-400"
                            )}>
                                {isSTier ? 'QUANT S' : dnaScore >= 70 ? 'QUANT A' : 'QUANT B'}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-6 w-px bg-white/5" />
                            <div className="text-right">
                                <div className="text-xl font-black text-white font-mono flex items-center gap-1">
                                    {dnaScore}<span className="text-[10px] text-indigo-400 opacity-70">PTS</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Data Bar: Probability & Mini Chart */}
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex-1 bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center gap-3">
                            <Zap className={clsx("w-4 h-4", popProbability > 50 ? "text-cyan-400 fill-current" : "text-slate-500")} />
                            <div>
                                <p className="text-[10px] text-white font-black font-mono leading-none">{popProbability}%</p>
                                <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter mt-1">상승 우위 확률</p>
                            </div>
                        </div>
                        <div className="w-24 h-10 bg-white/5 rounded-xl border border-white/5 p-1 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparkData}>
                                    <Area
                                        type="monotone"
                                        dataKey="v"
                                        stroke={isSTier ? "#818cf8" : isATier ? "#10b981" : "#64748b"}
                                        strokeWidth={2}
                                        fill={isSTier ? "#818cf8" : isATier ? "#10b981" : "#64748b"}
                                        fillOpacity={0.1}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                            <span className="absolute bottom-0 right-1 text-[7px] text-slate-600 font-bold uppercase">시스템 신뢰도</span>
                        </div>
                    </div>

                    {/* System Logic Verdict */}
                    <div className="flex-1 flex flex-col justify-center min-h-[48px] mt-2 mb-4">
                        <p className="text-[12px] text-slate-400 font-medium leading-relaxed line-clamp-3 italic opacity-80 group-hover:opacity-100 transition-opacity">
                            "{(quantSummary || bullPoints[0] || "").split(';')[0]}..."
                        </p>
                    </div>

                    {/* Footer Info: Conditional "Matched" - Always pushed to bottom */}
                    <div className="mt-auto">
                        {(matchedLegend && matchedLegend.ticker !== 'N/A') && (
                            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Target className="w-3 h-3 text-indigo-400/70" />
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">통계적 유사 패턴 {matchedLegend.ticker}</span>
                                </div>
                                <span className="text-[9px] font-mono font-bold text-indigo-300/70">{matchedLegend.similarity}% 유사</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <StockTerminalModal
                isOpen={isTerminalOpen}
                onClose={() => setIsTerminalOpen(false)}
                data={{
                    ticker,
                    dnaScore,
                    popProbability,
                    bullPoints: bullPoints.length > 0 ? bullPoints : ["모멘텀 지표 분석 중", "거래량 추이 확인 중"],
                    bearPoints: bearPoints.length > 0 ? bearPoints : ["리스크 요인 스캔 중", "시장 변동성 확인 중"],
                    matchedLegend: matchedLegend || { ticker: 'N/A', similarity: 0 },
                    riskLevel,
                    quantSummary: quantSummary || `${ticker}는 현재 시스템 분석 점수 ${dnaScore}점으로 평가되고 있습니다.`
                }}

                onAddToWatchlist={async () => {
                    try {
                        await addToWatchlist(ticker, undefined, 'WATCHING', price, undefined, undefined, dnaScore);
                        toast.success(`${ticker} — 관심 종목에 추가되었습니다`, {
                            description: `DNA Score: ${dnaScore}점`,
                            duration: 3000,
                        });
                    } catch (error) {
                        toast.error('관심 종목 추가에 실패했습니다', {
                            description: '잠시 후 다시 시도해 주세요.',
                        });
                    }
                }}
            />
        </>
    );
};
