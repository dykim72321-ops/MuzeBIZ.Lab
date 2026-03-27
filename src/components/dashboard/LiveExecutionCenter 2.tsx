import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  Zap, 
  Target, 
  History, 
  ShieldCheck,
  Clock,
  Activity,
  Cpu,
  Lock,
  Unlock,
  AlertOctagon,
  TrendingDown,
  DollarSign
} from 'lucide-react';
import clsx from 'clsx';
import { fetchQuantSignals, fetchActivePositions, fetchTradeHistory } from '../../services/stockService';
import { apiFetch } from '../../services/pythonApiService';
import { Tooltip } from '../ui/Tooltip';
import { toast } from 'sonner';

interface AccountStatus {
  buying_power: number;
  today_pnl: number;
  today_pnl_pct: number;
  current_drawdown: number;
}

/**
 * LiveExecutionCenter
 * - 실시간 트레이딩 통제 섹션
 * - 브로커 연결 상태, 포지션 사이징, 자동 매매 활성화 제어
 * - 🚨 Panic Liquidate (Kill Switch) 연동
 */
export const LiveExecutionCenter = () => {
  const [signals, setSignals] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'signals' | 'positions' | 'history'>('positions');
  
  // LIVE Controls State
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
  
  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('muze_lot_size', lotSize.toString());
  }, [lotSize]);

  useEffect(() => {
    localStorage.setItem('muze_risk_per_trade', riskPerTrade.toString());
  }, [riskPerTrade]);
  
  // Backend Integration State
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [isPanicking, setIsPanicking] = useState(false);

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

  const fetchAccount = async () => {
    try {
      const data = await apiFetch('/api/broker/account');
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

  useEffect(() => {
    loadAllData();
    fetchAccount();
    
    const dataInterval = setInterval(loadAllData, 30000); // 30s refresh
    const accInterval = setInterval(fetchAccount, 10000); // 10s refresh
    
    return () => {
      clearInterval(dataInterval);
      clearInterval(accInterval);
    };
  }, []);

  const handlePanicSell = async () => {
    // [Fix] window.confirm이 브라우저에서 차단되거나 보이지 않는 이슈 대응
    // toast를 사용하여 사용자에게 명시적으로 확인을 요청합니다.
    toast('🚨 전량 청산 확인', {
      description: '모든 미체결 주문을 취소하고 활성 포지션을 시장가로 청산하시겠습니까?',
      action: {
        label: '청산 실행',
        onClick: async () => {
          setIsPanicking(true);
          const toastId = toast.loading('DEFCON 1: 전량 청산 명령 전송 중...');

          try {
            // [Fix] Body(..., embed=True) 형식에 맞춰 페이로드 전송
            const result = await apiFetch('/api/broker/liquidate-all', 'POST', { confirm: true });
            
            if (result.status === 'success') {
              toast.success('전량 청산 성공', {
                  description: '모든 주문이 취소되고 청산 절차가 시작되었습니다.',
                  id: toastId
              });
              setIsArmed(false); 
              loadAllData();
            } else if (result.error) {
              throw new Error(result.error);
            }
          } catch (error) {
            toast.error('청산 명령 실패', {
                description: error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.',
                id: toastId
            });
          } finally {
            setIsPanicking(false);
          }
        }
      },
      cancel: {
        label: '취소',
        onClick: () => {}
      }
    });
  };

  if (loading) return (
    <div className="h-[600px] bg-slate-950 rounded-3xl border border-slate-800 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Activity className="w-8 h-8 text-indigo-500 animate-pulse" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Establishing Tactical Link...</span>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden flex flex-col min-h-[850px] shadow-2xl relative">
      {/* Dynamic Grid Background */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
             backgroundSize: '30px 30px' 
           }} />
      
      {/* 1. TOP CONTROL STRIP (The "Armed" Section) */}
      <div className={clsx(
        "p-5 border-b border-slate-800 relative z-20 transition-colors duration-500",
        isArmed ? "bg-rose-500/5" : "bg-slate-900/40"
      )}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Left: Engine Status */}
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Broker Connectivity</span>
               <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-2 py-1 bg-black/40 rounded-md border border-white/5">
                     <div className={clsx("w-1.5 h-1.5 rounded-full", brokerConnected ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500")} />
                     <span className="text-[10px] font-black text-white uppercase tracking-tight">Alpaca Pro</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 bg-black/40 rounded-md border border-white/5">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                     <span className="text-[10px] font-black text-white uppercase tracking-tight">MD Stream</span>
                  </div>
               </div>
            </div>
            
            <div className="h-10 w-px bg-slate-800 hidden lg:block" />

            <div className="flex flex-col min-w-[150px]">
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tactical Unit</span>
               <div className="flex items-center gap-2">
                  <div className="flex items-center bg-black/60 rounded-lg border border-white/10 px-2 py-1">
                     <span className="text-[10px] font-black text-slate-500 mr-2 uppercase">Lot</span>
                     <input 
                       type="number" 
                       value={lotSize} 
                       onChange={(e) => setLotSize(Number(e.target.value))}
                       className="bg-transparent text-xs font-black text-white w-12 outline-none border-none focus:ring-0 text-center"
                     />
                     <span className="text-[9px] font-bold text-slate-600 ml-1 font-mono">USD</span>
                  </div>
               </div>
            </div>
          </div>

          {/* Center/Right: Action Buttons */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-4">
                {/* KILL SWITCH */}
                <Tooltip position="left" content="🚨 EMERGENCY KILL SWITCH: 사용 중인 모든 포지션을 즉시 시장가로 매도하고 모든 미체결 주문을 취소합니다.">
                  <button 
                    onClick={handlePanicSell}
                    disabled={isPanicking}
                    className="flex items-center gap-2 px-4 py-3 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/30 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 group"
                  >
                    <AlertOctagon className={clsx("w-4 h-4", isPanicking && "animate-spin")} />
                    {isPanicking ? 'LIQUIDATING...' : 'Panic Liquidate All'}
                  </button>
                </Tooltip>

                {/* Master Switch */}
                <Tooltip position="bottom" content={isArmed ? "SAFE MODE: 시스템을 대기 상태로 전환합니다. 자동 매매가 중지됩니다." : "COMBAT MODE: 시스템을 무장합니다. 스코어링된 신호에 따라 자동 매매가 실행됩니다."}>
                  <button 
                    onClick={() => setIsArmed(!isArmed)}
                    className={clsx(
                      "group relative px-8 py-3 rounded-2xl flex items-center gap-3 transition-all duration-300 active:scale-95 shadow-2xl overflow-hidden",
                      isArmed 
                        ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20" 
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20"
                    )}
                  >
                    {isArmed ? (
                      <>
                        <Lock className="w-4 h-4" />
                        <div className="text-left">
                          <div className="text-[9px] font-black uppercase tracking-tighter opacity-70">Trading Armed</div>
                          <div className="text-xs font-black uppercase tracking-widest">DISARM</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" />
                        <div className="text-left">
                          <div className="text-[9px] font-black uppercase tracking-tighter opacity-70">Standby</div>
                          <div className="text-xs font-black uppercase tracking-widest">ARM SYSTEM</div>
                        </div>
                      </>
                    )}
                  </button>
                </Tooltip>
            </div>
            {/* [NEW] Persistent Tip Box for visibility */}
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg border border-white/5">
               <Zap className="w-2.5 h-2.5 text-amber-500" />
               <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">
                 Tip: <span className="text-slate-400">ARM 후 DNA 85점 이상 신호 시 자동 매수 실행. 긴급 상황 시 Panic Liquidate 사용.</span>
               </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CAPITAL & ANALYTICS GRID */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* A. Account Metrics (3/4) */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Tooltip content="Alpaca 계좌의 현재 주문 가능한 현금 잔고입니다. (Buying Power)">
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl hover:bg-white/[0.07] transition-colors relative overflow-hidden group w-full">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                          <DollarSign className="w-8 h-8 text-white" />
                      </div>
                      <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-2">Buying Power</p>
                      <p className="text-2xl font-black text-white tabular-nums tracking-tighter">
                        ${account ? account.buying_power.toLocaleString() : '---'}
                      </p>
                  </div>
              </Tooltip>

              <Tooltip content="당일 발생한 총 실현 및 평가 손익 합계입니다.">
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl hover:bg-white/[0.07] transition-colors relative overflow-hidden group w-full">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Activity className="w-8 h-8 text-white" />
                      </div>
                      <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-2">Today's PnL</p>
                      <div className="flex items-baseline gap-2">
                        <p className={clsx(
                            "text-2xl font-black tabular-nums tracking-tighter",
                            (account?.today_pnl || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {account ? `${account.today_pnl >= 0 ? '+' : ''}$${account.today_pnl.toLocaleString()}` : '---'}
                        </p>
                        {account && (
                            <span className={clsx(
                                "text-[10px] font-black",
                                account.today_pnl_pct >= 0 ? "text-emerald-500/60" : "text-rose-500/60"
                            )}>
                                ({account.today_pnl_pct >= 0 ? '+' : ''}{account.today_pnl_pct}%)
                            </span>
                        )}
                      </div>
                  </div>
              </Tooltip>

              <Tooltip content="최고점 대비 현재 자산 하락 폭입니다. 리스크 관리의 핵심 지표입니다.">
                  <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-2xl hover:bg-rose-500/10 transition-colors relative overflow-hidden group w-full">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity text-rose-500">
                          <TrendingDown className="w-8 h-8" />
                      </div>
                      <p className="text-rose-500/50 text-[9px] font-black uppercase tracking-[0.2em] mb-2">Current Drawdown</p>
                      <p className="text-2xl font-black text-rose-500 tabular-nums tracking-tighter">
                        {account ? `${account.current_drawdown}%` : '---'}
                      </p>
                  </div>
              </Tooltip>
          </div>

          {/* B. Tactical Risk Control (1/4) */}
          <Tooltip content="체결된 각 포지션이 계좌 전체 자산에서 차지하는 최대 리스크 비율을 설정합니다.">
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col justify-center w-full">
                  <div className="flex justify-between items-center mb-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Zap className="w-3 h-3 text-amber-400" />
                        Risk Per Trade
                      </label>
                      <span className="text-amber-400 font-black text-xs">{riskPerTrade}%</span>
                  </div>
                  <input 
                    type="range" min="1" max="10" step="0.5"
                    value={riskPerTrade} 
                    onChange={(e) => setRiskPerTrade(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
                  />
                  <div className="flex justify-between mt-1.5 opacity-30">
                      <span className="text-[8px] font-bold text-white">1%</span>
                      <span className="text-[8px] font-bold text-white">10%</span>
                  </div>
              </div>
          </Tooltip>
      </div>

      {/* 3. TAB NAVIGATION */}
      <div className="bg-slate-900/50 border-b border-slate-800 p-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            Execution Matrix & Live Logs
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
              <span className="capitalize">{tab}</span>
              <span className="ml-2 opacity-30">
                {tab === 'signals' ? signals.length : tab === 'positions' ? positions.length : history.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. TERMINAL CONTENT CONTAINER */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden relative z-10">
          
          {/* Main List (Tabbed Content) (Left 8/12) */}
          <div className="lg:col-span-8 overflow-y-auto p-4 border-r border-slate-800/50
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
                  <div className="space-y-3">
                    {signals.length > 0 ? signals.map((sig) => (
                      <div key={sig.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center font-black text-indigo-400 border border-indigo-500/20">
                            {sig.ticker[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-black text-white">{sig.ticker}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9px] font-black text-emerald-400 border border-emerald-500/20 uppercase tracking-tighter">
                                DNA {sig.dna_score}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                              <Clock className="w-3 h-3 text-slate-600" />
                              {sig.signal_date}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/10 px-2 py-1 rounded text-[9px] font-black text-emerald-500 border border-emerald-500/20">READY</div>
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        </div>
                      </div>
                    )) : (
                      <div className="py-20 text-center opacity-30">
                        <Zap className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Awaiting Signal Matrix Sync</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'positions' && (
                  <div className="space-y-3">
                    {positions.length > 0 ? positions.map((pos) => {
                      const currentPrice = pos.current_price || pos.entry_price; // Fallback
                      const pnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
                      const isProfit = pnlPct >= 0;

                      return (
                        <div key={pos.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 hover:bg-white/[0.08] transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center font-black text-indigo-400 border border-indigo-500/20">
                                {pos.ticker[0]}
                              </div>
                              <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-white">{pos.ticker}</span>
                                    <span className={clsx(
                                      "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                                      isProfit ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                    )}>
                                      {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                                      <ShieldCheck className="w-3 h-3 text-emerald-500/50" />
                                      Entry: ${pos.entry_price.toFixed(2)}
                                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                                      Qty: {pos.quantity || 0}
                                  </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[8px] font-black text-slate-600 tracking-widest uppercase mb-1">Trailing Stop</div>
                              <div className="text-sm font-black text-rose-400 font-mono">
                                ${pos.current_stop_price ? pos.current_stop_price.toFixed(2) : '---'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <div className="flex items-center gap-4">
                               <div className="flex flex-col">
                                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Held Since</span>
                                  <span className="text-[10px] font-bold text-slate-400">{pos.entry_date ? new Date(pos.entry_date).toLocaleDateString() : 'N/A'}</span>
                               </div>
                               <div className="flex flex-col">
                                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Market Value</span>
                                  <span className="text-[10px] font-bold text-white font-mono">${(currentPrice * (pos.quantity || 0)).toLocaleString()}</span>
                               </div>
                            </div>
                            <button className="px-2 py-1 bg-white/5 hover:bg-rose-500/20 text-[9px] font-black text-slate-400 hover:text-rose-400 rounded-lg border border-transparent hover:border-rose-500/30 transition-all uppercase tracking-tighter">
                               Close Position
                            </button>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="py-20 text-center opacity-20">
                        <Target className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-[9px] font-black uppercase tracking-widest">No Active Positions</p>
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'history' && (
                  <div className="space-y-3">
                    {history.length > 0 ? history.map((trade) => {
                      const isWin = trade.pnl_percent > 0;
                      return (
                        <div key={trade.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.08] transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-black text-slate-400 border border-white/5">
                              {trade.ticker[0]}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-black text-white">{trade.ticker}</span>
                                  <span className={clsx(
                                    "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                                    isWin ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                  )}>
                                    {isWin ? '+' : ''}{trade.pnl_percent.toFixed(2)}%
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                                    <History className="w-3 h-3 opacity-50" />
                                    Exit: {trade.exit_date ? new Date(trade.exit_date).toLocaleDateString() : 'N/A'}
                                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                                    <span className={isWin ? "text-emerald-500/60" : "text-rose-500/60"}>
                                      {trade.exit_reason || 'MANUAL'}
                                    </span>
                                </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[8px] font-black text-slate-600 tracking-widest uppercase mb-1">Exit Price</div>
                            <div className="text-sm font-black text-white font-mono">
                              ${trade.exit_price.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="py-20 text-center opacity-20">
                        <History className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">History Log Empty</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Live Order Tape (Right 4/12) */}
          <div className="lg:col-span-4 bg-black/40 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 text-slate-600 mb-4 border-b border-slate-800/50 pb-2">
                  <Cpu className="w-3 h-3" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Live Order Tape</span>
              </div>
              <div className="flex-1 font-mono text-[10px] space-y-2 overflow-y-auto 
                              [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent 
                              [&::-webkit-scrollbar-thumb]:bg-white/5 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <div className="text-slate-500">[{new Date().toLocaleTimeString()}] Engine initialized.</div>
                  <div className="text-emerald-500/80">[{new Date().toLocaleTimeString()}] Alpaca WebSocket Link Active.</div>
                  <div className="text-slate-500">[{new Date().toLocaleTimeString()}] Warm-up sequence complete.</div>
                  <div className="text-indigo-400/80">[{new Date().toLocaleTimeString()}] Monitoring 145 active tickers...</div>
                  {isArmed && (
                      <div className="text-rose-500 animate-pulse">[{new Date().toLocaleTimeString()}] DEFCON 3: SYSTEM ARMED.</div>
                  )}
                  {account?.today_pnl_pct && account.today_pnl_pct !== 0 && (
                      <div className={clsx(account.today_pnl_pct > 0 ? "text-emerald-400" : "text-rose-400")}>
                          [{new Date().toLocaleTimeString()}] PnL Update: {account.today_pnl_pct}%
                      </div>
                  )}
                  <div className="text-slate-700 mt-2">// Awaiting execution pulse...</div>
              </div>
          </div>
      </div>

      {/* 5. FOOTER / STATUS BAR */}
      <div className="bg-slate-900 border-t border-slate-800 p-2 px-4 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
              <span className="text-[9px] font-black text-slate-600 uppercase flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5 text-emerald-500" />
                  Latency: 12ms
              </span>
              <span className="text-[9px] font-black text-slate-600 uppercase flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-indigo-500" />
                  API Tunnel Secure
              </span>
          </div>
          <div className="text-[9px] font-black text-indigo-500/80 uppercase italic tracking-tighter">
              MuzeBIZ Execution Node v4.1 — {isArmed ? 'ACTIVE' : 'READY'}
          </div>
      </div>
    </div>
  );
};
