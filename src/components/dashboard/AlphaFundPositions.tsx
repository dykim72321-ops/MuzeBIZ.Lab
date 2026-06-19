import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface Position {
    id: string;
    ticker: string;
    status: 'OPEN' | 'CLOSED';
    entry_price: number;
    current_price: number;
    pnl_percent: number;
    created_at: string;
}

export const AlphaFundPositions = () => {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPositions = async () => {
            const { data, error } = await supabase
                .from('paper_portfolio')
                .select('*')
                .eq('status', 'OPEN')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching Alpha Fund positions:', error);
            } else if (data) {
                setPositions(data);
            }
            setLoading(false);
        };

        fetchPositions();

        // Supabase Realtime Subscription
        const subscription = supabase
            .channel('alpha_fund_positions_channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'paper_portfolio' },
                (payload) => {
                    console.log('Realtime change received!', payload);
                    fetchPositions();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    if (loading) {
        return (
            <div className="glass-panel rounded-2xl p-8 mt-8 animate-pulse">
                <div className="h-6 w-48 bg-white/5 rounded mb-6" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 bg-white/5 rounded-xl w-full" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel rounded-2xl mt-8 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                        <Activity className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h2 className="text-base font-black text-white tracking-tight uppercase">Active Positions</h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {positions.length} Assets Online
                    </span>
                </div>
            </div>

            {positions.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-12 h-12 bg-white/[0.03] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Activity className="w-6 h-6 text-slate-600" />
                    </div>
                    <p className="text-slate-500 font-medium text-sm">현재 진행 중인 투자 포지션이 없습니다.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.12em]">Asset</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.12em]">Entry Price</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.12em] text-right">Market Price</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.12em] text-right">Live P&L</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.12em] text-right">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {positions.map((pos) => (
                                <tr
                                    key={pos.id}
                                    className="hover:bg-white/[0.02] transition-colors group"
                                >
                                    {/* Asset */}
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-sm">
                                                {pos.ticker.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-black text-white group-hover:text-indigo-300 transition-colors">
                                                    {pos.ticker}
                                                </div>
                                                <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">
                                                    {pos.status}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Entry Price */}
                                    <td className="px-6 py-4 font-mono text-slate-400 text-sm">
                                        ${Number(pos.entry_price).toFixed(2)}
                                    </td>

                                    {/* Market Price */}
                                    <td className="px-6 py-4 font-mono font-bold text-white text-sm text-right">
                                        ${Number(pos.current_price).toFixed(2)}
                                    </td>

                                    {/* PnL */}
                                    <td className="px-6 py-4 text-right">
                                        <div className={clsx(
                                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black font-mono border",
                                            pos.pnl_percent >= 0
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                        )}>
                                            {pos.pnl_percent >= 0
                                                ? <TrendingUp className="w-3 h-3" />
                                                : <TrendingDown className="w-3 h-3" />
                                            }
                                            {pos.pnl_percent >= 0 ? '+' : ''}{Number(pos.pnl_percent).toFixed(2)}%
                                        </div>
                                    </td>

                                    {/* Duration */}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1.5 text-slate-500 text-xs font-medium">
                                            <Clock className="w-3.5 h-3.5 opacity-50" />
                                            {formatDistanceToNow(new Date(pos.created_at), { addSuffix: false })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="px-6 py-4 border-t border-white/5 text-center">
                        <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
                            {positions.length} open position{positions.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
