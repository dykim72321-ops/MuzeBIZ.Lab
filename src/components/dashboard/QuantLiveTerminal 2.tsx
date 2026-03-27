import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  Zap, 
  Target, 
  History, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  Clock,
  Activity
} from 'lucide-react';
import clsx from 'clsx';
import { fetchQuantSignals, fetchActivePositions, fetchTradeHistory } from '../../services/stockService';

export const QuantLiveTerminal = () => {
  const [signals, setSignals] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'signals' | 'positions' | 'history'>('positions');

  const loadAllData = async () => {
    try {
      const [s, p, h] = await Promise.all([
        fetchQuantSignals(),
        fetchActivePositions(),
        fetchTradeHistory()
      ]);
      setSignals(s);
      setPositions(p);
      setHistory(h);
    } catch (err) {
      console.error('Failed to load terminal data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="h-[600px] bg-slate-950 rounded-3xl border border-slate-800 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Activity className="w-8 h-8 text-indigo-500 animate-pulse" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Link established. Syncing...</span>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden flex flex-col h-[700px] shadow-2xl relative">
      {/* Terminal Grid Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      {/* Header */}
      <div className="bg-slate-900/50 border-b border-slate-800 p-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            Quant Execution Terminal
          </h2>
        </div>
        <div className="flex gap-2">
          {['signals', 'positions', 'history'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all border",
                activeTab === tab 
                  ? "bg-white/10 text-white border-white/20 shadow-inner" 
                  : "text-slate-500 border-transparent hover:text-slate-300"
              )}
            >
              {tab === 'signals' && <Zap className="inline w-3 h-3 mr-1.5" />}
              {tab === 'positions' && <Target className="inline w-3 h-3 mr-1.5" />}
              {tab === 'history' && <History className="inline w-3 h-3 mr-1.5" />}
              {tab}
              <span className="ml-2 opacity-50">
                ({tab === 'signals' ? signals.length : tab === 'positions' ? positions.length : history.length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-4 relative z-10
                      [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent 
                      [&::-webkit-scrollbar-thumb]:bg-white/5 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {activeTab === 'signals' && (
              <>
                {signals.length > 0 ? signals.map((sig) => (
                  <div key={sig.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-500/30 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center font-black text-indigo-400 border border-indigo-500/20">
                        {sig.ticker[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black text-white">{sig.ticker}</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9px] font-black text-emerald-400 border border-emerald-500/20 uppercase tracking-tighter">
                            DNA {sig.dna_score}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3" />
                          Scanned on {sig.signal_date}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase mb-1">Status</div>
                      <div className="flex items-center gap-2">
                        <div className={clsx(
                          "w-1.5 h-1.5 rounded-full",
                          sig.status === 'PENDING' ? "bg-amber-500 animate-pulse" : "bg-slate-500"
                        )} />
                        <span className="text-[10px] font-black text-slate-300 uppercase">{sig.status}</span>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="py-20 text-center opacity-30">
                    <Zap className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Active Signals Detected</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'positions' && (
              <>
                {positions.length > 0 ? positions.map((pos) => (
                  <div key={pos.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-4 hover:border-indigo-500/30 transition-all group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center font-black text-indigo-400 border border-indigo-500/20">
                          {pos.ticker[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-white">{pos.ticker}</span>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                              Held {pos.days_held}d
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                            Entry: ${pos.entry_price}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase mb-1">Trailing Stop</div>
                        <div className="text-sm font-black text-rose-400 font-mono">
                          ${pos.current_stop_price ? pos.current_stop_price.toFixed(2) : ((pos.highest_high || pos.entry_price) - (pos.initial_atr * 3.5)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-black/20 rounded-xl p-2 border border-white/5">
                            <span className="block text-[8px] font-black text-slate-600 uppercase mb-0.5">Highest High</span>
                            <span className="text-xs font-black text-white font-mono">${(pos.highest_high || pos.entry_price).toFixed(2)}</span>
                        </div>
                        <div className="bg-black/20 rounded-xl p-2 border border-white/5">
                            <span className="block text-[8px] font-black text-slate-600 uppercase mb-0.5">Target Price</span>
                            <span className="text-xs font-black text-emerald-400 font-mono">
                                ${pos.current_target_price ? pos.current_target_price.toFixed(2) : ((pos.entry_price) + (pos.initial_atr * 5.0)).toFixed(2)}
                            </span>
                        </div>
                        <div className="bg-black/20 rounded-xl p-2 border border-white/5">
                            <span className="block text-[8px] font-black text-slate-600 uppercase mb-0.5">Status</span>
                            <span className="text-xs font-black text-emerald-400 uppercase tracking-tighter">
                                {pos.scaled_out ? 'Scaled Out' : 'Active'}
                            </span>
                        </div>
                    </div>
                  </div>
                )) : (
                  <div className="py-20 text-center opacity-30">
                    <Target className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Active Positions in Portfolio</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'history' && (
              <>
                {history.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-white/5">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-white/5 text-slate-500 font-black uppercase tracking-widest">
                        <tr>
                          <th className="p-3">Ticker</th>
                          <th className="p-3">P&L</th>
                          <th className="p-3">Exit Reason</th>
                          <th className="p-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {history.map((h) => (
                          <tr key={h.id} className="hover:bg-white/5 transition-colors group">
                            <td className="p-3">
                              <span className="font-black text-white">{h.ticker}</span>
                            </td>
                            <td className="p-3">
                              <div className={clsx(
                                "flex items-center gap-1 font-black",
                                h.is_win ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {h.is_win ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {h.pnl_percent.toFixed(2)}%
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-white/5 text-slate-400 border border-white/10 uppercase tracking-tighter">
                                {h.exit_reason}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 font-medium">
                              {h.exit_date}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-20 text-center opacity-30">
                    <History className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Execution History Empty</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer / Status Bar */}
      <div className="bg-slate-900 border-t border-slate-800 p-2 px-4 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
              <span className="text-[9px] font-black text-slate-600 uppercase flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5" />
                  Latency: 42ms
              </span>
              <span className="text-[9px] font-black text-slate-600 uppercase flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Encrypted
              </span>
          </div>
          <div className="text-[9px] font-black text-indigo-500/80 uppercase italic">
              Ready for Next Sequence — MuzeBIZ Core
          </div>
      </div>
    </div>
  );
};
