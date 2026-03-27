import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Briefcase, TrendingUp, CheckCircle2, History, Database, Activity } from 'lucide-react';

export const PortfolioStatus = () => {
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const fetchPortfolioData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: actives } = await supabase.from('active_positions').select('*').order('entry_date', { ascending: false });
      const { data: history } = await supabase.from('trade_history').select('*').order('exit_date', { ascending: false }).limit(10);
      
      if (actives) setActivePositions(actives);
      if (history) setTradeHistory(history);
    } catch (error) {
      console.error("Failed to fetch portfolio data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  const handleRunPortfolio = async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-quant-portfolio');
      if (error) throw error;
      console.log("Portfolio execution logs:", data.logs);
      await fetchPortfolioData();
    } catch (err) {
      console.error("Failed to run portfolio engine:", err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-900 rounded-xl">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              Virtual Portfolio
              <span className="text-[10px] font-black tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">Live Paper Trading</span>
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">시스템 시그널 기반 자동 매매 (모의투자)</p>
          </div>
        </div>
        
        <button
          onClick={handleRunPortfolio}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-black tracking-wide hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase"
        >
          {isRunning ? (
            <><Activity className="w-4 h-4 animate-spin opacity-50" /> Executing...</>
          ) : (
            <><Database className="w-4 h-4" /> Run End-Of-Day Engine</>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* Active Positions */}
        <div className="p-6 bg-slate-50/50">
          <h3 className="text-xs font-black text-slate-400 tracking-[0.15em] mb-4 flex items-center gap-2 uppercase">
            <TrendingUp className="w-4 h-4" /> Active Positions ({activePositions.length})
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-xl border border-slate-100 shadow-sm animate-pulse">
              <Activity className="w-6 h-6 text-slate-300" />
            </div>
          ) : activePositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl border border-slate-100 border-dashed text-slate-400 shadow-sm">
              <CheckCircle2 className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider">No Active Positions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activePositions.map((pos) => (
                <div key={pos.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between transition-all hover:border-blue-200 hover:shadow-md">
                  <div>
                    <span className="text-base font-black text-slate-900">{pos.ticker}</span>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mt-1">
                      <span>Entry: ${pos.entry_price.toFixed(2)}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span>Held: {pos.days_held}d</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded">
                      High: ${pos.highest_high.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trade History */}
        <div className="p-6 bg-slate-50/50">
          <h3 className="text-xs font-black text-slate-400 tracking-[0.15em] mb-4 flex items-center gap-2 uppercase">
            <History className="w-4 h-4" /> Recent Trades
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-xl border border-slate-100 shadow-sm animate-pulse">
              <Activity className="w-6 h-6 text-slate-300" />
            </div>
          ) : tradeHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl border border-slate-100 border-dashed text-slate-400 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider">No Trade History</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tradeHistory.map((trade) => {
                const isWin = trade.pnl_percent > 0;
                return (
                  <div key={trade.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all hover:border-slate-200 hover:shadow-md">
                    <div>
                      <span className="text-base font-black text-slate-900">{trade.ticker}</span>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                        Reason: <span className={isWin ? "text-emerald-600" : "text-rose-500"}>{trade.exit_reason || 'MANUAL'}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto flex flex-row sm:flex-col items-center justify-between sm:items-end bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                      <span className={`text-sm font-black tabular-nums ${isWin ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {isWin ? '+' : ''}{trade.pnl_percent.toFixed(2)}%
                      </span>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        ${trade.exit_price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
