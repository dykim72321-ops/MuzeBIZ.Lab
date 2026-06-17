import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

import {
  Zap,
  ShieldCheck,
  X,
  Coins,
  Star,
  Activity,
  CheckCircle,
  XCircle,
  BarChart3,
  Clock,
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  Plus,
  Loader2,
  PieChart,
  Trash2
} from 'lucide-react';

// Hooks & Services
import { useMarketEngine } from '../hooks/useMarketEngine';
import { useStrategyStats } from '../hooks/useStrategyStats';
import { getWatchlist, addToWatchlist, removeFromWatchlist, type WatchlistItem } from '../services/watchlistService';
import { fetchMultipleStocksOptimized } from '../services/stockService';
import { processSignal } from '../utils/signalProcessor';
import { supabase as supabaseClient } from '../lib/supabase';
import {
  fetchBrokerStatus,
  fetchBrokerAccount,
  toggleSystemArm,
  fetchPaperAccount,
  fetchPaperPositions,
  fetchPaperHistory,
  sellPaperPosition,
  deletePaperHistory,
  fetchPennyScanStatus,
  type PennyScanStatus
} from '../services/pythonApiService';

// Components
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { PennyQuantScoreBar } from '../components/penny/PennyQuantScoreBar';
import { MonitoringOrbit } from '../components/dashboard/MonitoringOrbit';

interface DashboardWatchlistItem extends WatchlistItem {
  currentPrice: number;
  changePercent: number;
  isPenny: boolean;
}

// Current-price tolerance for penny display: stocks that entered ≤$1 can rise above $1,
// so we treat anything ≤ this threshold as "penny" for UI purposes.
const PENNY_DISPLAY_THRESHOLD = 1.5;

export const UnifiedDashboard = () => {
  const { isHunting, triggerHunt, pulseMap } = useMarketEngine();
  const { data: strategyStats, isLoading: statsLoading } = useStrategyStats();

  // 1. Data States
  const [watchlistItems, setWatchlistItems] = useState<DashboardWatchlistItem[]>([]);
  const [watchlistStocks, setWatchlistStocks] = useState<any[]>([]);
  const [discoveryStocks, setDiscoveryStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminalData, setTerminalData] = useState<any | null>(null);
  const [lastFetchedTime, setLastFetchedTime] = useState<string>('--:--:--');
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 2. Action States
  const [isArmed, setIsArmed] = useState(false);
  const [pennyScanStatus, setPennyScanStatus] = useState<PennyScanStatus | null>(null);

  // 3. Trade & Account States
  const [pennyPositions, setPennyPositions] = useState<any[]>([]);
  const [pennyHistory, setPennyHistory] = useState<any[]>([]);
  const [pennyAccount, setPennyAccount] = useState<any>(null);
  const [alpacaAccount, setAlpacaAccount] = useState<any>(null);

  // 4. Edge Monitor alert state
  const [edgeAlert, setEdgeAlert] = useState<{ active: boolean; message: string | null }>({ active: false, message: null });

  // 5. Discovery watchlist-add in-flight guard (ref = synchronous, avoids double-click race)
  const addingTickersRef = useRef<Set<string>>(new Set());
  const [addingTickers, setAddingTickers] = useState<Set<string>>(new Set());

  // US 시장 개장 여부 체크 (ET 기준 평일 09:30~16:00)
  useEffect(() => {
    const checkMarket = () => {
      const now = new Date();
      const etParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(now);
      const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(etParts.find(p => p.type === 'weekday')?.value ?? 'Sun');
      const hours = parseInt(etParts.find(p => p.type === 'hour')?.value ?? '0', 10);
      const minutes = parseInt(etParts.find(p => p.type === 'minute')?.value ?? '0', 10);
      const timeInMin = hours * 60 + minutes;
      const open = day >= 1 && day <= 5 && timeInMin >= 570 && timeInMin < 960; // 9:30~16:00 ET
      setIsMarketOpen(open);
    };
    checkMarket();
    const id = setInterval(checkMarket, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Load ARM Status ──────────────────────────────────────────────────
  const loadArmStatus = useCallback(async () => {
    try {
      const status = await fetchBrokerStatus();
      if (status && typeof status.is_armed === 'boolean') {
        setIsArmed(status.is_armed);
      }
    } catch (e) {
      console.warn('Failed to fetch broker status:', e);
    }
  }, []);

  // ── Load All Data ─────────────────────────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    try {
      const [wl, pp, ph, pa, alpaca, discoveryResult, scanStatus] = await Promise.all([
        getWatchlist(),
        fetchPaperPositions(),
        fetchPaperHistory(),
        fetchPaperAccount(),
        fetchBrokerAccount().catch(() => null),
        supabaseClient
          .from('daily_discovery')
          .select('*')
          .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .not('dna_score', 'is', null)
          .gte('dna_score', 80)
          .order('dna_score', { ascending: false })
          .limit(8),
        fetchPennyScanStatus(),
      ]);
      if (scanStatus) setPennyScanStatus(scanStatus);

      // Fetch current prices of watchlist items to identify penny stocks accurately
      const wlStocks = wl.length > 0 ? await fetchMultipleStocksOptimized(wl.map(i => i.ticker)) : [];

      const normalizedWatchlist = wl.map(item => {
        const stockInfo = wlStocks.find(s => s.ticker === item.ticker);
        const price = stockInfo?.price ?? item.buyPrice ?? 0;
        return {
          ...item,
          currentPrice: price,
          changePercent: stockInfo?.changePercent ?? 0,
          isPenny: price <= PENNY_DISPLAY_THRESHOLD
        };
      });

      setWatchlistItems(normalizedWatchlist);
      setWatchlistStocks(wlStocks);
      setDiscoveryStocks((discoveryResult.data || []).filter(s => s.dna_score != null && s.price != null));
      
      setPennyPositions(
        pp.map((pos: any) => {
          const cp = pos.current_price != null ? Number(pos.current_price) : null;
          const ep = Number(pos.entry_price);
          const units = Number(pos.units);
          return {
            ...pos,
            current_price: cp,
            unrealized_pl: cp != null ? (cp - ep) * units : null,
            unrealized_plpc: cp != null ? (cp / ep - 1) * 100 : null,
            isPenny: ep <= 1.0,
          };
        })
      );
      setPennyHistory(ph || []);
      setPennyAccount(pa);
      if (alpaca && !alpaca.error) setAlpacaAccount(alpaca);
      setLastFetchedTime(new Date().toISOString().substring(11, 19));

      // Edge Monitor 경보 상태 조회
      const { data: settingsRow } = await supabaseClient
        .from('system_settings')
        .select('edge_alert_active, edge_alert_message')
        .eq('id', 1)
        .single();
      if (settingsRow) {
        setEdgeAlert({
          active: Boolean(settingsRow.edge_alert_active),
          message: settingsRow.edge_alert_message ?? null,
        });
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    loadArmStatus();
    const interval = setInterval(() => {
      loadDashboardData();
      loadArmStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData, loadArmStatus]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleDeepDive = async (stock: any) => {
    const displaySignal = processSignal(stock);
    const rawSummary = stock.rawAiSummary || "";

    let quantData: any = null;
    if (rawSummary && rawSummary.trim().startsWith('{')) {
      try {
        quantData = JSON.parse(rawSummary);
      } catch (e) {
        console.warn(`Failed to parse raw summary for ${stock.ticker}:`, e);
      }
    } else if (stock.quant_metadata) {
      quantData = stock.quant_metadata;
    }

    // 1. 모달이 즉시 반응하도록 로컬 데이터로 초기화
    const initialData = {
      ticker: stock.ticker,
      dnaScore: stock.dna_score || stock.dnaScore || 0,
      bullPoints: displaySignal.bullPoints,
      bearPoints: displaySignal.bearPoints,
      riskLevel: (stock.dna_score || stock.dnaScore || 0) >= 70 ? 'Low' : (stock.dna_score || stock.dnaScore || 0) >= 50 ? 'Medium' : 'High',
      formulaVerdict: displaySignal.reasoning,
      price: stock.price || 0,
      change: `${(stock.change_percent || stock.changePercent || 0).toFixed(2)}%`,
      efficiencyRatio: stock.efficiency_ratio || stock.efficiencyRatio || 0,
      kellyWeight: stock.kelly_weight || stock.kellyWeight || 0,
      quantData,
      rsi: stock.rsi,
      macdDiff: stock.macdDiff,
      adx: stock.adx,
      rvol: stock.rvol,
      history: stock.history || [],
    };

    setTerminalData(initialData);

    // 2. 백그라운드에서 실시간 지표 및 30일 가격 히스토리를 가져와 모달 업데이트
    try {
      const { fetchStockQuote } = await import('../services/stockService');
      const enrichedStock = await fetchStockQuote(stock.ticker, '1mo');
      if (enrichedStock) {
        setTerminalData((prev: any) => {
          if (!prev || prev.ticker !== stock.ticker) return prev;
          return {
            ...prev,
            price: enrichedStock.price,
            change: `${enrichedStock.changePercent.toFixed(2)}%`,
            changePercent: enrichedStock.changePercent,
            dayHigh: enrichedStock.currentHigh,
            volume: enrichedStock.volume,
            rsi: enrichedStock.rsi,
            macdDiff: enrichedStock.macdDiff,
            adx: enrichedStock.adx,
            rvol: enrichedStock.rvol,
            history: enrichedStock.history?.map(h => ({ price: h.price, date: h.date })) || [],
          };
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch enriched quote in handleDeepDive for ${stock.ticker}:`, err);
    }
  };

  const handleLiveHuntingTrigger = async () => {
    const toastId = toast.loading('🛰️ 실시간 퀀트 라이브 헌팅 구동 중...');
    try {
      await triggerHunt();
      toast.success('라이브 헌팅 트리거 성공', { id: toastId });
      await loadDashboardData();
    } catch (e: any) {
      toast.error('헌팅 트리거 실패', { id: toastId, description: e.message });
    }
  };

  const handleToggleArm = async () => {
    const nextState = !isArmed;
    const toastId = toast.loading(nextState ? 'SYSTEM ARMING...' : 'SYSTEM DISARMING...');
    try {
      const result = await toggleSystemArm(nextState);
      if (result.status === 'success') {
        setIsArmed(result.is_armed);
        toast.success(nextState ? 'SYSTEM ARMED' : 'SYSTEM DISARMED', {
          id: toastId,
          description: nextState ? '자동 매매가 활성화되었습니다.' : '시스템이 안전 관제 모드로 전환되었습니다.'
        });
      }
    } catch {
      toast.error('ARM 상태 변경 실패', { id: toastId });
    }
  };

  const handleClosePosition = async (ticker: string) => {
    toast(`🛑 ${ticker} 청산 확인`, {
      description: '이 포지션을 시장가로 즉시 청산하시겠습니까?',
      action: {
        label: '청산 실행',
        onClick: async () => {
          const toastId = toast.loading(`${ticker} 청산 명령 전송 중...`);
          try {
            const result = await sellPaperPosition(ticker);
            if (result?.status === 'success') {
              toast.success(`${ticker} 청산 성공`, { id: toastId });
              loadDashboardData();
            } else {
              toast.error(result?.error || '청산 실패', { id: toastId });
            }
          } catch {
            toast.error('청산 에러', { id: toastId });
          }
        }
      }
    });
  };

  const handleDeleteHistory = async (historyId: string, ticker: string) => {
    const toastId = toast.loading(`${ticker} 이력 삭제 중...`);
    try {
      await deletePaperHistory(historyId);
      toast.success(`${ticker} 청산 이력 삭제 완료`, { id: toastId });
      loadDashboardData();
    } catch {
      toast.error('삭제 실패', { id: toastId });
    }
  };

  // EXITED 종목은 재등록 가능하도록 제외
  const watchlistedTickers = useMemo(
    () => new Set(watchlistItems.filter(i => i.status !== 'EXITED').map(i => i.ticker)),
    [watchlistItems]
  );

  const handleAddDiscoveryToWatchlist = async (e: React.MouseEvent, stock: any) => {
    e.stopPropagation();
    const ticker: string = stock.ticker;
    if (addingTickersRef.current.has(ticker)) return; // synchronous double-click guard
    addingTickersRef.current.add(ticker);
    setAddingTickers(new Set(addingTickersRef.current));
    try {
      await addToWatchlist(ticker, undefined, 'WATCHING', undefined, undefined, undefined, stock.dna_score ?? undefined);
      toast.success(`${ticker} 관심종목 등록`, { description: '오빗 패널에 추가되었습니다.' });
      const wl = await getWatchlist();
      const wlStocks = wl.length > 0 ? await fetchMultipleStocksOptimized(wl.map(i => i.ticker)) : [];
      const normalized = wl.map(item => {
        const s = wlStocks.find(s => s.ticker === item.ticker);
        const price = s?.price ?? item.buyPrice ?? 0;
        return { ...item, currentPrice: price, changePercent: s?.changePercent ?? 0, isPenny: price <= PENNY_DISPLAY_THRESHOLD };
      });
      setWatchlistItems(normalized);
      setWatchlistStocks(wlStocks);
    } catch (e: any) {
      toast.error(`${ticker} 등록 실패`, { description: e.message });
    } finally {
      addingTickersRef.current.delete(ticker);
      setAddingTickers(new Set(addingTickersRef.current));
    }
  };

  const handleRemoveWatchlist = async (ticker: string) => {
    try {
      await removeFromWatchlist(ticker);
      toast.success(`${ticker} 관심종목 제거 완료`);
      loadDashboardData();
    } catch {
      toast.error('관심종목 제거 실패');
    }
  };

  // ── Derived Chart Data ────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!pennyHistory || pennyHistory.length === 0) return [];
    const baseCapital = 100000;
    const sortedHistory = [...pennyHistory].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    let runningTotal = baseCapital;
    const points = sortedHistory.map((item, idx) => {
      runningTotal += Number(item.profit_amt || 0);
      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : `T${idx+1}`;
      return { name: dateStr, value: runningTotal };
    });
    return [{ name: 'Start', value: baseCapital }, ...points];
  }, [pennyHistory]);



  // Derived Account PnL
  const totalPnl = useMemo(() => {
    return pennyPositions.reduce((sum, p) => sum + ((p.current_price - p.entry_price) * p.units || 0), 0);
  }, [pennyPositions]);

  // Portfolio Concentration
  const investedCapital = useMemo(() => {
    return pennyPositions.reduce((sum, p) => sum + ((p.current_price ?? 0) * (p.units ?? 0)), 0);
  }, [pennyPositions]);

  const concentrationPct = useMemo(() => {
    const cash = pennyAccount?.cash_available ?? 100000;
    const equity = cash + investedCapital;
    if (equity === 0) return 0;
    return (investedCapital / equity) * 100;
  }, [investedCapital, pennyAccount]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0d1527]/90 backdrop-blur-xl p-4 border border-white/10 rounded-xl shadow-2xl leading-none">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{payload[0].payload.name}</p>
          <p className="text-lg font-black text-white tabular-nums">
            ${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0b1222] text-slate-200 relative overflow-hidden pb-12 font-sans">
      {/* Decorative Grid Background Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Soft Ambient Light Glows */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-500/10 blur-[130px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-1/2 right-0 w-[500px] h-[500px] bg-cyan-500/10 blur-[130px] rounded-full translate-x-1/2 pointer-events-none animate-pulse-glow" style={{ animationDelay: '1s' }} />

      {loading && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-[#0d1527]/90 backdrop-blur-xl px-4 py-2.5 rounded-xl border border-slate-800 shadow-2xl animate-in fade-in slide-in-from-top-4 glow-border-indigo">
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-[0.2em] font-mono">Synchronizing Command Data...</span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 relative z-10">
        
        {/* ════════ HEADER ════════ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/15 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
              <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.4em]">Integrated Intelligence Dashboard</span>
            </div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tighter">
              <Zap className="w-8 h-8 text-indigo-400" />
              통합 자산 지휘소
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={clsx(
                "w-2 h-2 rounded-full",
                isMarketOpen ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-400"
              )} />
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                US Market {isMarketOpen ? 'Open' : 'Closed'}
              </span>
              <span className="text-slate-500">|</span>
              <p className="text-xs text-slate-400 font-bold">실시간 시장 펄스 감시, 오늘의 알파 발굴, 그리고 포트폴리오의 실시간 가상 매매 현황 통합 관제</p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* System ARM Toggle — 현재 상태 표시 + 클릭 시 전환 방향 명시 */}
            <button
              onClick={handleToggleArm}
              title={isArmed ? '클릭하면 자동매매를 비활성화합니다' : '클릭하면 자동매매를 활성화합니다'}
              className={clsx(
                "flex items-center gap-0 rounded-2xl border font-black text-xs uppercase tracking-wider transition-all duration-300 active:scale-95 shadow-md overflow-hidden",
                isArmed
                  ? "border-rose-500/30"
                  : "border-emerald-500/30"
              )}
            >
              {/* 현재 상태 레이블 */}
              <span className={clsx(
                "flex items-center gap-2 px-4 py-3",
                isArmed ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
              )}>
                {isArmed ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {isArmed ? 'ARMED' : 'SAFE'}
              </span>
              {/* 클릭 시 전환 방향 */}
              <span className={clsx(
                "flex items-center gap-1.5 px-3 py-3 text-[10px] border-l",
                isArmed
                  ? "bg-slate-900/40 border-rose-500/20 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                  : "bg-slate-900/40 border-emerald-500/20 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300"
              )}>
                {isArmed ? '→ 해제' : '→ 활성화'}
              </span>
            </button>

            {/* Auto Penny Scan Status Badge */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl shadow-sm">
              <Coins className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="leading-none">
                <span className="text-[10px] font-black text-cyan-300 uppercase tracking-widest block">Auto Penny Scan</span>
                <span className="text-[10px] text-cyan-400 font-bold block mt-0.5">
                  {pennyScanStatus?.last_scan_at
                    ? `최근: ${new Date(pennyScanStatus.last_scan_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                    : '서버 시작 후 30초 내 실행'}
                </span>
              </div>
            </div>

            {/* Settings Panel Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="퀀트 전략 파라미터 설정"
              className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 text-slate-350 hover:text-indigo-400 hover:border-indigo-500/30 rounded-2xl shadow-sm transition-colors text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              설정
            </button>
          </div>
        </div>

        {/* 💡 SYSTEM STATUS INFO BAR */}
        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-[1.5rem] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-indigo-200 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)] shrink-0" />
            <span className="shrink-0 font-extrabold text-[10px] uppercase tracking-wider bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded">시스템 가이드</span>
            <span className="text-slate-300 font-medium">
              {isArmed 
                ? '자동 매매 활성(ARMED) 모드입니다. 관심 종목 중 퀀트 매수 지표 조건 충족 시 실시간 자동 매수가 구동됩니다.' 
                : '현재 안전 관제(SAFE) 모드입니다. 실시간 탐색 및 알림은 유지되나 가상 주문은 실행되지 않습니다.'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-bold md:text-right shrink-0">
            * 페니 주식(진입가 $1.0 이하) 매수 시 -15% 손절선 및 익절 분할매도 상태머신이 자동 작동합니다.
          </div>
        </div>

        {/* ════════ EDGE MONITOR ALERT ════════ */}
        {edgeAlert.active && edgeAlert.message && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl px-5 py-4 shadow-lg">
            <Activity className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-300 uppercase tracking-widest mb-1">알고리즘 Edge 이상 감지</p>
              <p className="text-sm text-amber-200/90 leading-relaxed">{edgeAlert.message}</p>
            </div>
            <button
              onClick={() => setEdgeAlert({ active: false, message: null })}
              className="text-amber-500/60 hover:text-amber-300 transition-colors shrink-0 mt-0.5"
              title="경보 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ════════ METRICS GRID ════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[
            {
              label: '총 자산 가치 (Total Assets)',
              value: alpacaAccount
                ? `$${(alpacaAccount.equity ?? 100000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : pennyAccount
                ? `$${(pennyAccount.total_assets ?? 100000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '$100,000.00',
              sub: alpacaAccount ? 'Alpaca 실계좌 Equity' : '현금 + 포지션 평가액',
              info: 'Alpaca 페이퍼 트레이딩 실계좌의 Equity(자본) 기준 포트폴리오 총 평가액입니다.',
              icon: BarChart3,
              color: 'text-indigo-400 bg-indigo-550/10 border-indigo-500/20'
            },
            {
              label: '가용 주문 잔고 (Available Cash)',
              value: alpacaAccount
                ? `$${(alpacaAccount.buying_power ?? 100000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : pennyAccount
                ? `$${(pennyAccount.cash_available ?? 100000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '$100,000.00',
              sub: alpacaAccount ? 'Alpaca Buying Power' : '가상 매수 가능 예치금',
              info: 'Alpaca 페이퍼 트레이딩 실계좌의 매수 가능 잔고(Buying Power)입니다.',
              icon: Coins,
              color: 'text-cyan-400 bg-cyan-550/10 border-cyan-500/20'
            },
            {
              label: '진행중 포지션 평가손익 (Current P&L)',
              value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              sub: '현재 보유 종목의 미실현 손익',
              info: '보유 중인 미청산 가상 주식들의 평균 매수가 대비 현재 평가손익 합계입니다.',
              icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
              color: totalPnl >= 0 ? 'text-emerald-400 bg-emerald-550/10 border-emerald-500/20' : 'text-rose-400 bg-rose-550/10 border-rose-500/20'
            },
            {
              label: '전략 승률 (Win Rate)',
              value: statsLoading ? 'Loading...' : strategyStats ? `${strategyStats.win_rate.toFixed(1)}%` : '68.7%',
              sub: statsLoading ? '연산 중...' : strategyStats?.drift != null
                ? `최근 30일 ${strategyStats.recent_win_rate?.toFixed(1)}% vs 이전 ${strategyStats.baseline_win_rate?.toFixed(1)}% (${strategyStats.drift >= 0 ? '+' : ''}${strategyStats.drift.toFixed(1)}%p)`
                : `Profit Factor: ${strategyStats ? strategyStats.profit_factor.toFixed(2) : '1.14'}x`,
              info: '과거 거래 데이터 기반 시뮬레이션 및 백테스트의 종합 승률 및 이익 지수입니다.',
              icon: Star,
              color: 'text-amber-400 bg-amber-550/10 border-amber-500/20'
            }
          ].map((metric, i) => (
            <div key={i} className="dark-glass-panel border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col justify-between min-h-[140px]">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none block">{metric.label}</span>
                  <span className="text-3xl font-black text-white leading-none tabular-nums block pt-1.5">{metric.value}</span>
                  <span className="text-xs text-slate-300 font-bold leading-none block pt-2">{metric.sub}</span>
                </div>
                <div className={clsx("p-2.5 rounded-xl border shrink-0", metric.color)}>
                  <metric.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xs text-slate-400 font-medium leading-normal border-t border-white/5 pt-2 mt-4">{metric.info}</p>
            </div>
          ))}

          {/* 5th Card: Portfolio Concentration */}
          {(() => {
            const pct = concentrationPct;
            const isWarn = pct >= 70;
            const isCaution = pct >= 50 && pct < 70;
            const cardColor = isWarn
              ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
              : isCaution
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            const barColor = isWarn ? 'bg-rose-500' : isCaution ? 'bg-amber-400' : 'bg-emerald-400';
            const label = isWarn ? '위험 구간 (≥70%)' : isCaution ? '주의 구간 (≥50%)' : '안전 구간';
            return (
              <div className="dark-glass-panel border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col justify-between min-h-[140px]">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none block">포트폴리오 집중도 (Concentration)</span>
                    <span className="text-3xl font-black text-white leading-none tabular-nums block pt-1.5">{pct.toFixed(1)}%</span>
                    <span className="text-xs text-slate-300 font-bold leading-none block pt-2">{label} · 상한 80%</span>
                  </div>
                  <div className={clsx("p-2.5 rounded-xl border shrink-0", cardColor)}>
                    <PieChart className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4 border-t border-white/5 pt-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400 font-bold">
                    <span>${investedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })} 투입</span>
                    <span>{pct.toFixed(1)}% / 80%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={clsx("h-full rounded-full transition-all duration-500", barColor)}
                      style={{ width: `${Math.min(pct / 80 * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ════════ MAIN SECTION ════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* LEFT 2/3 COLUMN: Chart & Daily recommendations */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* A. PERFORMANCE GROWTH CHART */}
            <div className="dark-glass-panel border border-white/10 rounded-[2rem] p-6 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-4 gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Asset & Profit Metrics</span>
                  <h2 className="text-base font-black text-white">포트폴리오 자산 성장 및 누적 손익 곡선</h2>
                  <p className="text-xs text-slate-350 mt-0.5">실시간 청산 완료된 거래 내역에 기반한 가상 자산의 누적 성장 흐름을 시각화합니다.</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> 가상 자산 평가액</span>
                  <span className="text-slate-500">|</span>
                  <span>최종 갱신: {lastFetchedTime}</span>
                </div>
              </div>

              <div className="h-72 w-full">
                {chartData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <BarChart3 className="w-8 h-8 text-slate-600" />
                    <p className="text-xs font-bold text-slate-400">청산 이력이 없습니다</p>
                    <p className="text-xs text-slate-400">매매가 완료되면 누적 손익 곡선이 표시됩니다.</p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={['dataMin - 1000', 'dataMax + 1000']}
                      tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* B. TODAY QUANT DISCOVERIES */}
            <div className="dark-glass-panel border border-white/10 rounded-[2rem] p-6 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-4 gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Top Quantitative Picks</span>
                  <h2 className="text-base font-black text-white">퀀트 엔진 추천 & 오늘의 알파 종목</h2>
                  <p className="text-xs text-slate-350 mt-0.5">수학적 기술 지표 분석으로 엄선된 매수 후보 종목입니다. 클릭 시 상세 지표(RSI/ADX/RVOL)가 노출됩니다.</p>
                </div>
                <span className="text-xs font-black bg-indigo-500/10 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/20 shrink-0 self-start sm:self-auto">
                  DNA 80점 이상 엄선
                </span>
              </div>

              {discoveryStocks.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto mb-3 animate-pulse" />
                  <p className="text-xs font-bold text-slate-400">발굴된 오늘의 추천 종목이 없습니다.</p>
                  <p className="text-xs text-slate-400 mt-1">상단의 "라이브 헌팅" 또는 "페니 스캔"을 가동해 보세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {discoveryStocks.map((stock) => {
                    const isPenny = (stock.price ?? 0) <= PENNY_DISPLAY_THRESHOLD && (stock.price ?? 0) > 0;
                    return (
                      <div
                        key={stock.ticker}
                        onClick={() => handleDeepDive(stock)}
                        className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-indigo-500/40 hover:bg-[#111c35]/40 transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border",
                            isPenny ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                          )}>
                            {stock.ticker}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-white group-hover:text-indigo-400 transition-colors">{stock.ticker}</span>
                              <span className={clsx(
                                "text-[10px] font-black px-1.5 py-0.5 rounded tracking-widest border leading-none",
                                isPenny ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                              )}>
                                {isPenny ? '페니' : '일반'}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 font-bold block mt-0.5">{stock.sector || 'US Stock'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-base font-extrabold text-white tabular-nums">${stock.price != null ? stock.price.toFixed(isPenny ? 4 : 2) : '--'}</span>
                            <span className={clsx(
                              "text-xs font-black block mt-0.5 tabular-nums",
                              (stock.change_percent ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {(stock.change_percent ?? 0) >= 0 ? '+' : ''}{(stock.change_percent ?? 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-12">
                            <PennyQuantScoreBar score={stock.dna_score} size="sm" showLabel={false} />
                          </div>
                          {/* 관심종목 등록 버튼 */}
                          {watchlistedTickers.has(stock.ticker) ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : addingTickers.has(stock.ticker) ? (
                            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
                          ) : (
                            <button
                              onClick={(e) => handleAddDiscoveryToWatchlist(e, stock)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-indigo-500/20 hover:border-indigo-500/40 text-slate-400 hover:text-indigo-300 transition-all shrink-0"
                              title="관심종목 추가"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT 1/3 COLUMN: Watchlist (Combined Orbit) */}
          <MonitoringOrbit
            watchlistItems={watchlistItems}
            watchlistStocks={watchlistStocks}
            pulseMap={pulseMap}
            handleDeepDive={handleDeepDive}
            handleRemoveWatchlist={handleRemoveWatchlist}
          />

        </div>

        {/* ════════ BOTTOM SECTION: Positions & History ════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT 2/3 COLUMN: Positions */}
          <div className="lg:col-span-2 dark-glass-panel border border-white/10 rounded-[2rem] p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-4 gap-2">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Active Positions</span>
                <h2 className="text-base font-black text-white">현재 보유 중인 매수 포지션</h2>
                <p className="text-xs text-slate-350 mt-0.5">실시간 매수가 완료되어 운용 중인 가상 주식 자산입니다. 트레일링 스탑에 도달하거나 우측 청산 클릭 시 즉시 전량 매도됩니다.</p>
              </div>
              <span className="text-xs font-black text-emerald-450 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg shrink-0 self-start sm:self-auto">
                {pennyPositions.length}개 보유 중
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <th className="pb-3">종목</th>
                    <th className="pb-3 text-right">구분</th>
                    <th className="pb-3 text-right">수량</th>
                    <th className="pb-3 text-right">진입가</th>
                    <th className="pb-3 text-right">현재가</th>
                    <th className="pb-3 text-right">Trailing Stop</th>
                    <th className="pb-3 text-right">평가 손익 (P&L)</th>
                    <th className="pb-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pennyPositions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold text-sm">
                        보유중인 가상 매수 포지션이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    pennyPositions.map((pos) => {
                      const pnlPct = pos.unrealized_plpc;
                      const pnlAmt = pos.unrealized_pl;
                      const hasPnl = pnlAmt != null && !Number.isNaN(pnlAmt);
                      const isProfit = hasPnl ? pnlAmt >= 0 : true;
                      const decimals = pos.isPenny ? 4 : 2;
                      return (
                        <tr key={pos.ticker} className="hover:bg-white/5 transition-colors text-xs font-bold">
                          <td className="py-4">
                            <span className="font-extrabold text-white text-base">{pos.ticker}</span>
                          </td>
                          <td className="py-4 text-right">
                            <span className={clsx(
                              "text-[10px] font-black px-1.5 py-0.5 rounded border tracking-widest",
                              pos.isPenny ? "bg-cyan-500/10 border-cyan-500/25 text-cyan-400" : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400"
                            )}>
                              {pos.isPenny ? '페니' : '일반'}
                            </span>
                          </td>
                          <td className="py-4 text-right font-mono text-slate-300 text-sm font-semibold tabular-nums">{Number(pos.units).toFixed(2)}</td>
                          <td className="py-4 text-right font-mono text-slate-300 text-sm font-semibold tabular-nums">${Number(pos.entry_price).toFixed(decimals)}</td>
                          <td className="py-4 text-right font-mono text-white text-sm font-bold tabular-nums">
                            {pos.current_price != null ? `$${Number(pos.current_price).toFixed(decimals)}` : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="py-4 text-right font-mono text-rose-400 text-sm font-semibold tabular-nums">
                            {pos.ts_threshold ? `$${Number(pos.ts_threshold).toFixed(decimals)}` : 'N/A'}
                          </td>
                          <td className={clsx("py-4 text-right font-mono tabular-nums text-base font-black", hasPnl ? (isProfit ? "text-emerald-400" : "text-rose-400") : "text-slate-500")}>
                            {hasPnl ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              <span>{isProfit ? '+' : ''}{(pnlAmt as number).toFixed(2)} ({isProfit ? '+' : ''}{(pnlPct as number).toFixed(2)}%)</span>
                            </div>
                            ) : <span className="text-slate-500 text-sm">조회 불가</span>}
                          </td>
                          <td className="py-4 text-right">
                            <button
                              onClick={() => handleClosePosition(pos.ticker)}
                              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 text-rose-450 hover:text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                            >
                              즉시 청산
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT 1/3 COLUMN: Trade History */}
          <div className="dark-glass-panel border border-white/10 rounded-[2rem] p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <h2 className="text-base font-black text-white">최근 청산 이력</h2>
                </div>
                <p className="text-xs text-slate-350 mt-0.5">매도가 완료되어 최종 손익금과 사유가 확정된 거래 내역입니다.</p>
              </div>
              <span className="text-xs font-semibold text-slate-300">{pennyHistory.length}건 기록</span>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {pennyHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-bold text-slate-400">최근 종료된 매매 기록이 없습니다.</p>
                </div>
              ) : (
                pennyHistory.slice(0, 15).map((trade, idx) => {
                  const isProfit = (trade.pnl_pct ?? 0) >= 0;
                  const isPenny = Number(trade.entry_price || 0) <= 1.0;
                  return (
                    <div key={trade.id || idx} className="group p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          "w-8 h-8 rounded-lg flex items-center justify-center border",
                          isProfit ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
                        )}>
                          {isProfit ? <CheckCircle className="w-4 h-4 text-emerald-450" /> : <XCircle className="w-4 h-4 text-rose-450" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-base leading-none">{trade.ticker}</span>
                            <span className={clsx(
                              "text-[10px] font-black px-1.5 py-0.5 rounded border leading-none",
                              isProfit ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450" : "bg-rose-500/10 border-rose-500/20 text-rose-450"
                            )}>
                              {(trade.pnl_pct ?? 0) >= 0 ? '+' : ''}{Number(trade.pnl_pct ?? 0).toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-bold block mt-1.5">
                            진입: ${Number(trade.entry_price || 0).toFixed(isPenny ? 4 : 2)} ➔ 청산: ${Number(trade.exit_price || 0).toFixed(isPenny ? 4 : 2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className={clsx("text-base font-black tabular-nums block", isProfit ? "text-emerald-400" : "text-rose-400")}>
                            {isProfit ? '+' : ''}${Number(trade.profit_amt ?? 0).toFixed(2)}
                          </span>
                          <span className="text-xs text-slate-400 font-medium block mt-0.5">
                            {trade.exit_reason || 'Exit'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteHistory(trade.id, trade.ticker)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-500 hover:text-rose-400 transition-all"
                          title="이력 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Settings Sideout Backdrop */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 bg-[#0b1222]/60 backdrop-blur-sm z-[200]"
          onClick={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Settings Slideout Panel */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[#0d1527] border-l border-white/10 z-[210] overflow-y-auto transition-transform duration-300 ease-in-out ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 sticky top-0 bg-[#0d1527] z-10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-black text-white uppercase tracking-[0.2em]">NexGuard Control</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          {/* 라이브 헌팅 — 오퍼레이터 수동 트리거 */}
          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-4 space-y-3">
            <div>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-0.5">Manual Override</span>
              <h3 className="text-sm font-black text-indigo-300">라이브 헌팅 (Edge Function)</h3>
              <p className="text-xs text-indigo-200 mt-1 leading-relaxed">
                Alpaca Universe 전체를 즉시 스캔합니다.<br/>
                DNA ≥ 80 일반 종목 발굴 → daily_discovery 갱신
              </p>
            </div>
            <button
              onClick={handleLiveHuntingTrigger}
              disabled={isHunting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all active:scale-95 disabled:bg-slate-350 disabled:cursor-not-allowed cursor-pointer"
            >
              <Activity className={clsx("w-4 h-4", isHunting && "animate-pulse")} />
              {isHunting ? '헌팅 중...' : '라이브 헌팅 실행'}
            </button>
          </div>
          <CommandSettings />
        </div>
      </div>

      {/* Modal Integration */}
      {terminalData && (
        <StockTerminalModal
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
          onAddToWatchlist={async () => {
             try {
               await addToWatchlist(
                 terminalData.ticker, 
                 undefined, 
                 'WATCHING', 
                 terminalData.price, 
                 undefined, 
                 undefined, 
                 terminalData.dnaScore
               );
               toast.success(`${terminalData.ticker} — 관심 종목에 추가되었습니다`, {
                 description: `DNA Score: ${terminalData.dnaScore}점`,
                 duration: 3000,
               });
               loadDashboardData();
             } catch (error) {
               console.error('Failed to add to watchlist:', error);
               toast.error('관심 종목 추가에 실패했습니다', {
                 description: '잠시 후 다시 시도해 주세요.',
               });
             }
          }}
        />
      )}
    </div>
  );
};
