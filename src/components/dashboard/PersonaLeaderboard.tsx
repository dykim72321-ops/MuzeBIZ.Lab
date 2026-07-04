import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Target } from 'lucide-react';
import clsx from 'clsx';

interface PersonaStats {
    persona_name: string;
    win_rate: number;
    avg_roi: number;
    total_predictions: number;
}

export const PersonaLeaderboard: React.FC = () => {
    const { data: stats, isLoading } = useQuery<PersonaStats[]>({
        queryKey: ['persona-performance'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('persona_performance')
                .select('*')
                .order('win_rate', { ascending: false });

            if (error) throw error;
            return data || [];
        },
        staleTime: 60000,
    });

    if (isLoading) return <div className="h-48 bg-blue-800/20 rounded-2xl animate-pulse" />;
    
    if (!stats || stats.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 text-blue-600 border border-white/5">
                    <Target className="w-8 h-8 opacity-20" />
                </div>
                <p className="text-white font-bold text-sm tracking-tight">정확도 분석 중...</p>
                <p className="text-blue-500 text-[10px] mt-1 max-w-[150px] leading-relaxed">
                    페르소나별 승률 계산을 위해 신규 데이터를 수집하고 있습니다.
                </p>
                <div className="mt-4 flex gap-1">
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="space-y-2 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {stats.map((persona, index) => (
                    <div key={persona.persona_name} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group">
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "w-6 h-6 rounded flex items-center justify-center text-[10px] font-black border",
                                index === 0 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                                    index === 1 ? "bg-blue-300/20 text-blue-300 border-blue-300/30" :
                                        index === 2 ? "bg-orange-700/20 text-orange-400 border-orange-700/30" :
                                            "bg-blue-800/50 text-blue-500 border-blue-700"
                            )}>
                                {index + 1}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-white uppercase tracking-tight group-hover:text-indigo-300 transition-colors">{persona.persona_name}</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-blue-500 flex items-center gap-1 font-mono">
                                        <Target className="w-2.5 h-2.5" /> {persona.total_predictions}회 예측
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-sm font-black text-white font-mono flex items-center justify-end gap-1">
                                {(persona.win_rate * 100).toFixed(0)}%
                                <span className="text-[9px] text-blue-500 font-bold">승률</span>
                            </div>
                            <div className={clsx(
                                "text-[10px] font-bold font-mono",
                                persona.avg_roi >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                                수익률 {persona.avg_roi >= 0 ? '+' : ''}{persona.avg_roi.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
