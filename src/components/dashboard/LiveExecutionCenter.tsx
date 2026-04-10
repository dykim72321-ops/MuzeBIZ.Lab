import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Zap, Target, History, ShieldCheck, Clock, Activity,
  Lock, Unlock, AlertOctagon, TrendingDown, DollarSign, PlusCircle,
  TrendingUp, CheckCircle, XCircle
} from 'lucide-react';
import clsx from 'clsx';
import { fetchQuantSignals } from '../../services/stockService';
import { 
  fetchBrokerAccount, fetchBrokerStatus, toggleSystemArm, 
  closePosition as closeBrokerPosition, liquidateAllPositions,
  fetchBrokerPositions, fetchBrokerOrders,
  fetchPaperAccount, fetchPaperPositions, fetchPaperHistory
} from '../../services/pythonApiService';
import { Tooltip } from '../ui/Tooltip';
import { toast } from 'sonner';
import { ManualTradeModal } from './ManualTradeModal';

interface AccountStatus {
  buying_power: number;
  today_pnl: number;
  today_pnl_pct: number;
  current_drawdown: number;
}

export const LiveExecutionCenter = () => {
  const [signals, setSignals] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'signals' | 'positions' | 'history'>('positions');
  
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState('');
  
  const [isArmed, setIsArmed] = useState(false);
  const [lotSize, setLotSize] = useState(() => {
    const saved = localStorage.getItem('muze_lot_size');
    return saved ? Number(saved) : 50;
  });
  const [riskPerTrade, setRiskPerTrade] = useState(() => {
    const saved = localStorage.getItem('muze_risk_per_trade');
    return saved ? Number(saved) : 5;
  });
  const [brokerConnected, setBrokerConnected] = useState(true);
  
  useEffect(() => {
    localStorage.setItem('muze_lot_size', lotSize.toString());
  }, [lotSize]);

  useEffect(() => {
    localStorage.setItem('muze_risk_per_trade', riskPerTrade.toString());
  }, [riskPerTrade]);
  
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [isPanicking, setIsPanicking] = useState(false);

  const loadAllData = async () => {
    try {
      // Parallel fetch for broker and internal paper trading data
      const [s, p, h, pp, ph] = await Promise.all([
        fetchQuantSignals(),
        fetchBrokerPositions(),
        fetchBrokerOrders(30),
        fetchPaperPositions(),
        fetchPaperHistory()
      ]);
      setSignals(s || []);
      
      // Merge or prioritize based on context. For now, we'll show both or prioritize paper positions for the quant engine.
      // If we have internal paper positions, we'll combine them or show them in the positions tab.
      const transformedPaperPos = pp.map(p => ({
        ...p,
        quantity: p.units,
        unrealized_pl: (p.current_price - p.entry_price) * p.units,
        unrealized_plpc: ((p.current_price / p.entry_price) - 1) * 100,
        is_paper: true
      }));

      setPositions([...transformedPaperPos, ...(p || [])]);
      setHistory([...(ph || []), ...(h || [])]);
    } catch (err) {
      console.error('Failed to load terminal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccount = async () => {
    try {
      // 1. Try to fetch the internal Paper Account first (for our Quant Engine)
      const paperAcc = await fetchPaperAccount();
      if (paperAcc && !paperAcc.error) {
        setAccount(paperAcc);
        setBrokerConnected(true);
        return;
      }

      // 2. Fallback to Alpaca Broker Account
      const data = await fetchBrokerAccount();
      if (data && !data.error) {
        setAccount(data);
        setBrokerConnected(true);
      } else if (data?.error) {
        setBrokerConnected(false);
      }
    } catch (e) {
      setBrokerConnected(false);
    }
  };

  const fetchArmStatus = async () => {
    try {
      const data = await fetchBrokerStatus();
      if (data && typeof data.is_armed === 'boolean') {
        setIsArmed(data.is_armed);
      }
    } catch (e) {
      console.warn('[LiveExecution] Failed to fetch ARM status');
    }
  };

  useEffect(() => {
    loadAllData();
    fetchAccount();
    fetchArmStatus();
    
    const dataInterval = setInterval(loadAllData, 30000); 
    const accInterval = setInterval(fetchAccount, 10000); 
    const armInterval = setInterval(fetchArmStatus, 15000);
    
    return () => {
      clearInterval(dataInterval);
      clearInterval(accInterval);
      clearInterval(armInterval);
    };
  }, []);

  const handleToggleArm = async () => {
    const nextState = !isArmed;
    try {
      const result = await toggleSystemArm(nextState);
      if (result.status === 'success') {
        setIsArmed(result.is_armed);
        toast.success(nextState ? 'SYSTEM ARMED' : 'SYSTEM DISARMED', {
          description: nextState ? '자동 매매가 활성화되었습니다.' : '시스템이 안전 모드로 전환되었습니다.'
        });
      }
    } catch (error) {
      toast.error('ARM 상태 변경 실패');
    }
  };

  const handleClosePosition = async (ticker: string) => {
    toast(`🛑 ${ticker} 청산 확인`, {
      description: '이 포지션을 시장가로 즉시 청산하겠습니까?',
      action: {
        label: '청산 실행',
        onClick: async () => {
          const toastId = toast.loading(`${ticker} 청산 명령 전송 중...`);
          try {
            const result = await closeBrokerPosition(ticker);
            if (result.status === 'success') {
              toast.success(`${ticker} 청산 성공`, { id: toastId });
              loadAllData();
            }
          } catch (error) {
            toast.error('청산 실패', { id: toastId });
          }
        }
      }
    });
  };

  const handlePanicSell = async () => {
    toast('🚨 전량 청산 확인', {
      description: '모든 미체결 주문을 취소하고 활성 포지션을 시장가로 청산하시겠습니까?',
      action: {
        label: '청산 실행',
        onClick: async () => {
          setIsPanicking(true);
          const toastId = toast.loading('DEFCON 1: 전량 청산 명령 전송 중...');
          try {
            const result = await liquidateAllPositions(true);
            if (result.status === 'success') {
              toast.success('전량 청산 성공', { id: toastId });
              setIsArmed(false); 
              loadAllData();
            }
          } catch (error) {
            toast.error('청산 명령 실패', { id: toastId });
          } finally {
            setIsPanicking(false);
          }
        }
      }
    });
  };

  if (loading) return (
    <div className="h-[600px] bg-[#020617] rounded-[2.5rem] border border-slate-800/80 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Activity className="w-8 h-8 text-indigo-500 animate-pulse" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Establishing Tactical Link...</span>
      </div>
    </div>
  );

  return (
    <div className="bg-[#020617]/90 backdrop-blur-3xl rounded-[2.5rem] border border-slate-800/80 overflow-hidden flex flex-col min-h-[850px] shadow-[0_0_100px_rgba(34,211,238,0.05)] relative group">
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:30px_30px]" />
      
      {/* 1. TOP CONTROL STRIP */}
      <div className={clsx(
        "p-6 border-b border-slate-800/50 relative z-20 transition-all duration-700",
        isArmed ? "bg-rose-500/[0.03]" : "bg-slate-900/20"
      )}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Node Connectivity</span>
               <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-2 py-1 bg-black/40 rounded-md border border-white/5">
                     <div className={clsx("w-1.5 h-1.5 rounded-full", brokerConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                     <span className="text-[10px] font-black text-white uppercase tracking-tight">Broker Sync</span>
                  </div>
               </div>
            </div>
            
            <div className="flex flex-col min-w-[120px]">
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Base Lot</span>
               <div className="flex items-center bg-black/60 rounded-lg border border-white/10 px-2 py-1">
                  <input 
                    type="number" 
                    value={lotSize} 
                    onChange={(e) => setLotSize(Number(e.target.value))}
                    className="bg-transparent text-xs font-black text-white w-12 outline-none border-none text-center"
                  />
                  <span className="text-[9px] font-bold text-slate-600 ml-1 font-mono">USD</span>
               </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
              <button
                onClick={() => { setSelectedTicker(''); setIsManualModalOpen(true); }}
                className="px-4 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                New Order
              </button>
              <button
                onClick={handlePanicSell}
                disabled={isPanicking}
                className="px-4 py-3 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/30 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                Panic Liquidate
              </button>
              
              <button 
                onClick={handleToggleArm}
                className={clsx(
                  "group relative px-10 py-4 rounded-2xl flex items-center gap-4 transition-all duration-500 active:scale-95 shadow-2xl border",
                  isArmed ? "bg-rose-600 text-white border-rose-400/50 shadow-[0_0_30px_rgba(225,29,72,0.4)]" : "bg-indigo-600 text-white border-indigo-400/50 shadow-[0_0_30px_rgba(79,70,229,0.4)]"
                )}
              >
                {isArmed ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                <div className="text-left font-black uppercase">
                  <div className="text-[9px] opacity-70 tracking-widest">{isArmed ? "Armed" : "Standby"}</div>
                  <div className="text-[11px] tracking-[0.2em]">{isArmed ? "DISARM" : "ARM SYSTEM"}</div>
                </div>
              </button>
          </div>
        </div>
      </div>

      {/* 2. CAPITAL & ANALYTICS GRID */}
      <div className="p-8 grid grid-cols-1 lg:grid-cols-4 gap-6 relative z-10">
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#020617]/40 backdrop-blur-md border border-slate-800/80 p-6 rounded-3xl relative overflow-hidden group shadow-lg">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.3em] mb-3">
                    {account?.is_paper_trading ? 'Paper Buying Power' : 'Broker Buying Power'}
                  </p>
                  <p className="text-3xl font-black text-white tabular-nums tracking-tighter">${account ? account.buying_power.toLocaleString() : '---'}</p>
              </div>
              <div className="bg-[#020617]/40 backdrop-blur-md border border-slate-800/80 p-6 rounded-3xl relative overflow-hidden group shadow-lg">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.3em] mb-3">Today's PnL</p>
                  <p className={clsx("text-3xl font-black tabular-nums tracking-tighter", (account?.today_pnl || 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {account ? `${account.today_pnl >= 0 ? '+' : ''}$${account.today_pnl.toLocaleString()}` : '---'}
                  </p>
              </div>
              <div className="bg-rose-500/[0.03] backdrop-blur-md border border-rose-500/20 p-6 rounded-3xl relative overflow-hidden group shadow-lg">
                  <p className="text-rose-500/50 text-[9px] font-black uppercase tracking-[0.3em] mb-3">Drawdown</p>
                  <p className="text-3xl font-black text-rose-500 tabular-nums tracking-tighter">{account ? `${account.current_drawdown}%` : '---'}</p>
              </div>
          </div>
          <div className="bg-[#020617]/60 border border-slate-800/80 p-6 rounded-3xl flex flex-col justify-center shadow-lg">
              <div className="flex justify-between items-center mb-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                <span>Risk Per Trade</span>
                <span className="text-amber-400">{riskPerTrade}%</span>
              </div>
              <input type="range" min="1" max="10" step="0.5" value={riskPerTrade} onChange={(e) => setRiskPerTrade(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
          </div>
      </div>

      {/* 3. TAB NAVIGATION */}
      <div className="bg-slate-900/10 border-b border-slate-800/50 p-6 flex flex-col md:flex-row items-center justify-between relative z-10 gap-4">
        <div className="flex items-center gap-4">
          <Terminal className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xs font-black text-white uppercase tracking-[0.2em]">Execution Matrix</h2>
        </div>
        <div className="flex gap-2 bg-[#020617] p-1.5 rounded-2xl border border-slate-800/80">
          {['signals', 'positions', 'history'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={clsx(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === tab ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 4. TERMINAL CONTENT */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden relative z-10">
          <div className="lg:col-span-8 overflow-y-auto p-6 border-r border-slate-800/50 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                {activeTab === 'positions' && (
                  positions.length > 0 ? positions.map((pos) => (
                    <div key={pos.ticker} className="bg-white/5 border border-white/5 rounded-2xl p-6 flex justify-between items-center group hover:bg-white/[0.08] transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center font-black text-indigo-400 border border-indigo-500/20">{pos.ticker.charAt(0)}</div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-white">{pos.ticker}</span>
                            <span className={clsx("text-xs font-black px-2 py-0.5 rounded", (pos.unrealized_plpc || 0) >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                              {(pos.unrealized_plpc || 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold mt-1">
                            ENTRY: ${Number(pos.entry_price).toFixed(2)} · NOW: ${Number(pos.current_price).toFixed(2)} · QTY: {pos.quantity}
                          </div>
                          <div className={clsx("text-[10px] font-black mt-0.5", (pos.unrealized_pl || 0) >= 0 ? "text-emerald-500" : "text-rose-500")}>
                            P&L: {(pos.unrealized_pl || 0) >= 0 ? '+' : ''}${Number(pos.unrealized_pl).toFixed(2)}
                            {pos.is_paper && <span className="ml-2 text-[8px] bg-slate-800 px-1 py-0.5 rounded text-slate-400">QUANT_PAPER</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setSelectedTicker(pos.ticker); setIsManualModalOpen(true); }}
                          className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] font-black rounded-xl border border-indigo-500/20 transition-all uppercase tracking-widest"
                        >Add</button>
                        <button onClick={() => handleClosePosition(pos.ticker)} className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white text-[10px] font-black rounded-xl border border-rose-500/20 transition-all uppercase tracking-widest">Close</button>
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest opacity-30">
                      {brokerConnected ? 'No open positions' : 'Broker offline — check FastAPI server'}
                    </div>
                  )
                )}

                {activeTab === 'signals' && (
                  signals.length > 0 ? signals.map((sig: any) => (
                    <div key={sig.id || sig.ticker} className="bg-white/5 border border-white/5 rounded-2xl p-5 flex justify-between items-center group hover:bg-white/[0.08] transition-all">
                      <div className="flex items-center gap-4">
                        <div className={clsx("w-10 h-10 rounded-2xl flex items-center justify-center border", sig.signal === 'BUY' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
                          {sig.signal === 'BUY' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-white">{sig.ticker}</span>
                            <span className={clsx("text-[10px] font-black px-2 py-0.5 rounded uppercase", sig.signal === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>{sig.signal}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                            DNA: {sig.dna_score ?? '--'} · RSI: {sig.rsi_2 ? Number(sig.rsi_2).toFixed(1) : '--'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedTicker(sig.ticker); setIsManualModalOpen(true); }}
                        className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white text-[10px] font-black rounded-xl border border-indigo-500/20 transition-all uppercase tracking-widest"
                      >Execute</button>
                    </div>
                  )) : (
                    <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest opacity-30">No active signals</div>
                  )
                )}

                {activeTab === 'history' && (
                  history.length > 0 ? history.map((order: any) => (
                    <div key={order.id} className="bg-white/5 border border-white/5 rounded-2xl p-5 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className={clsx("w-10 h-10 rounded-2xl flex items-center justify-center border", order.side === 'buy' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
                          {order.status === 'filled' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-slate-500" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-white">{order.ticker}</span>
                            <span className={clsx("text-[10px] font-black px-2 py-0.5 rounded uppercase", order.side === 'buy' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>{order.side}</span>
                            <span className="text-[10px] font-bold text-slate-600 uppercase">{order.type}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                            QTY: {order.filled_qty}/{order.quantity} · AVG: ${order.filled_avg_price > 0 ? Number(order.filled_avg_price).toFixed(2) : '--'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={clsx("text-[10px] font-black uppercase px-2 py-0.5 rounded", order.status === 'filled' ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500")}>{order.status}</div>
                        <div className="text-[9px] text-slate-600 mt-1">{order.created_at ? new Date(order.created_at).toLocaleString() : '--'}</div>
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest opacity-30">No order history</div>
                  )
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="lg:col-span-4 bg-[#020617] p-6 flex flex-col border-l border-slate-800/50">
              <div className="flex items-center gap-2 text-slate-500 mb-6 border-b border-slate-800/50 pb-4 text-[10px] font-black uppercase tracking-[0.3em]">
                  <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                  Live Order Broadcast
              </div>
              <div className="flex-1 font-mono text-[11px] space-y-3 overflow-y-auto custom-scrollbar leading-relaxed">
                  <div className="text-slate-600">[{new Date().toLocaleTimeString()}] NODE_READY: Autonomous Engine active.</div>
                  <div className="text-slate-600">[{new Date().toLocaleTimeString()}] MD_SYNC: Alpaca stream connected.</div>
                  {isArmed && <div className="text-rose-500 animate-pulse bg-rose-500/5 px-2 py-1 rounded border border-rose-500/20 font-bold uppercase tracking-widest">DEFCON_3: SYSTEM ARMED.</div>}
                  <div className="text-slate-800 mt-4 italic tracking-widest">// Monitoring execution signal matrix...</div>
              </div>
          </div>
      </div>

      <ManualTradeModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        initialTicker={selectedTicker}
        onSuccess={() => { loadAllData(); fetchAccount(); }}
      />
    </div>
  );
};
