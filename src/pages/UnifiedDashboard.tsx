import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
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
  FlaskConical
} from 'lucide-react';

// Types
import type { DiscoveryStock, PaperPosition, PaperHistory, AlpacaAccount, TerminalData } from '../types/dashboard';

// Hooks & Services
import { useMarketEngine } from '../hooks/useMarketEngine';
import { getWatchlist, addToWatchlist, cleanupOldWatchlistItems, type WatchlistItem } from '../services/watchlistService';
import { processSignal } from '../utils/signalProcessor';
import { supabase as supabaseClient } from '../lib/supabase';
import {
  fetchBrokerStatus,
  fetchBrokerAccount,
  fetchBrokerPositions,
  closePosition,
  toggleSystemArm,
  fetchPennyScanStatus,
  fetchClosedTrades,
  type PennyScanStatus
} from '../services/pythonApiService';

// Components
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { PennyQuantScoreBar } from '../components/penny/PennyQuantScoreBar';
import { RiskAnalyticsPanel } from '../components/dashboard/RiskAnalyticsPanel';
import { PositionAnalyticsPanel } from '../components/dashboard/PositionAnalyticsPanel';
import { BacktestPanel } from '../components/dashboard/BacktestPanel';

interface DashboardWatchlistItem extends WatchlistItem {
  currentPrice: number;
  changePercent: number;
  isPenny: boolean;
}

// Paper Engine 페니 경계 ($1 이하 → -15% TS, $1 초과 → -10% TS)
const PENNY_ENGINE_THRESHOLD = 1.0;

export const UnifiedDashboard = () => {
  const navigate = useNavigate();
  const { isHunting, triggerHunt } = useMarketEngine();

  // 1. Data States
  const [watchlistRaw, setWatchlistRaw] = useState<WatchlistItem[]>([]);
  const [discoveryStocks, setDiscoveryStocks] = useState<DiscoveryStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminalData, setTerminalData] = useState<TerminalData | null>(null);
  const [lastFetchedTime, setLastFetchedTime] = useState<string>('--:--:--');
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 2. Action States
  const [isArmed, setIsArmed] = useState(false);
  const [pennyScanStatus, setPennyScanStatus] = useState<PennyScanStatus | null>(null);

  // 3. Trade & Account States
  const [livePositions, setLivePositions] = useState<PaperPosition[]>([]);
  const [liveHistory, setLiveHistory] = useState<PaperHistory[]>([]);
  const [alpacaAccount, setAlpacaAccount] = useState<AlpacaAccount | null>(null);

  // 4. Edge Monitor alert state
  const [edgeAlert, setEdgeAlert] = useState<{ active: boolean; message: string | null }>({ active: false, message: null });

  // 5. Discovery watchlist-add in-flight guard (ref = synchronous, avoids double-click race)
  const addingTickersRef = useRef<Set<string>>(new Set());
  const [addingTickers, setAddingTickers] = useState<Set<string>>(new Set());

  // 6. Chart time range
  const [chartRange, setChartRange] = useState<'7d' | '30d' | 'all'>('all');

  // Derived states (always live/Alpaca mode)
  const displayedPositions = useMemo(() => livePositions, [livePositions]);

  const displayedHistory = useMemo(() => liveHistory, [liveHistory]);

  const displayedAccount = useMemo(() => ({
    total_assets: alpacaAccount?.equity ?? 0,
    cash_available: alpacaAccount?.buying_power ?? 0,
    today_pnl: alpacaAccount?.today_pnl ?? 0,
    today_pnl_pct: alpacaAccount?.today_pnl_pct ?? 0,
  }), [alpacaAccount]);

  const displayedWinRate = useMemo(() => {
    if (!liveHistory || liveHistory.length === 0) return 0;
    const wins = liveHistory.filter(t => (t.pnl_pct ?? 0) > 0).length;
    return (wins / liveHistory.length) * 100;
  }, [liveHistory]);

  const displayedTotalTrades = useMemo(() => liveHistory.length, [liveHistory]);

  // Derived Watchlist with Statuses mapped from active displayed positions & history
  const watchlistItems = useMemo(() => {
    const unifiedMap = new Map<string, DashboardWatchlistItem>();

    watchlistRaw.forEach(item => {
      unifiedMap.set(item.ticker, { ...item } as DashboardWatchlistItem);
    });

    displayedPositions.forEach((pos: PaperPosition) => {
      if (unifiedMap.has(pos.ticker)) {
        const existing = unifiedMap.get(pos.ticker)!;
        existing.status = 'HOLDING';
        existing.buyPrice = existing.buyPrice || Number(pos.entry_price);
      } else {
        unifiedMap.set(pos.ticker, {
          ticker: pos.ticker,
          status: 'HOLDING',
          buyPrice: Number(pos.entry_price),
          addedAt: pos.created_at || new Date().toISOString(),
        } as DashboardWatchlistItem);
      }
    });

    displayedHistory.forEach((hist: PaperHistory) => {
      if (!displayedPositions.some((p: PaperPosition) => p.ticker === hist.ticker)) {
        if (unifiedMap.has(hist.ticker)) {
          const existing = unifiedMap.get(hist.ticker)!;
          if (existing.status !== 'WATCHING') {
            existing.status = 'EXITED';
          }
        } else {
          unifiedMap.set(hist.ticker, {
            ticker: hist.ticker,
            status: 'EXITED',
            addedAt: hist.created_at || new Date().toISOString(),
          } as DashboardWatchlistItem);
        }
      }
    });

    return Array.from(unifiedMap.values());
  }, [watchlistRaw, displayedPositions, displayedHistory]);

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
      // 1. Run cleanup for old WATCHING items (non-blocking)
      cleanupOldWatchlistItems(7).catch(console.error);

      const [wl, alpaca, discoveryResult, scanStatus, brokerPositions, alpacaClosedTrades] = await Promise.all([
        getWatchlist(),
        fetchBrokerAccount().catch(() => null),
        supabaseClient
          .from('daily_discovery')
          .select('*')
          .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .not('dna_score', 'is', null)
          .gte('dna_score', 70)
          .order('dna_score', { ascending: false })
          .limit(8),
        fetchPennyScanStatus(),
        fetchBrokerPositions().catch(() => []),
        fetchClosedTrades(1000).catch(() => []),
      ]);
      if (scanStatus) setPennyScanStatus(scanStatus);

      const mappedBrokerPositions = brokerPositions.map((bp: any) => {
        const entry = Number(bp.entry_price);
        const current = Number(bp.current_price);
        const isPenny = entry <= 1.0;
        const highestPrice = Math.max(entry, current);
        const tsInitPct = isPenny ? 0.85 : 0.90;
        const estimatedTsThreshold = highestPrice * tsInitPct;

        return {
          ticker: bp.ticker,
          units: Number(bp.quantity),
          entry_price: entry,
          current_price: current,
          ts_threshold: estimatedTsThreshold,
          trailing_stop: estimatedTsThreshold,
          highest_price: highestPrice,
          status: 'HOLDING',
          is_penny: isPenny,
        };
      });

      const mapPositionData = (positions: any[]) => {
        return positions.map((pos: any) => {
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
        });
      };

      const mappedLiveHistory = alpacaClosedTrades.map((th: any) => ({
        id: th.id,
        ticker: th.ticker,
        units: Number(th.units ?? 0),
        entry_price: Number(th.entry_price ?? 0),
        exit_price: Number(th.exit_price ?? 0),
        pnl: Number(th.profit_amt ?? 0),
        pnl_pct: Number(th.pnl_pct ?? 0),
        profit_amt: Number(th.profit_amt ?? 0),
        exit_reason: th.exit_reason ?? 'Alpaca Order',
        created_at: th.created_at,
      }));

      setWatchlistRaw(wl);
      setDiscoveryStocks((discoveryResult.data || []).filter(s => s.dna_score != null && s.price != null));
      setLivePositions(mapPositionData(mappedBrokerPositions));
      setLiveHistory(mappedLiveHistory);
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
  const handleDeepDive = async (stock: DiscoveryStock) => {
    const displaySignal = processSignal(stock);
    const rawSummary = stock.rawAiSummary || "";

    let quantData: Record<string, unknown> | null = null;
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
      dnaScore: stock.dna_score || 0,
      bullPoints: displaySignal.bullPoints,
      bearPoints: displaySignal.bearPoints,
      riskLevel: (stock.dna_score || 0) >= 70 ? 'Low' : (stock.dna_score || 0) >= 50 ? 'Medium' : 'High',
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
      const { fetchStockQuote, fetchStockOHLC } = await import('../services/stockService');
      const [enrichedStock, ohlc] = await Promise.all([
        fetchStockQuote(stock.ticker, '1mo'),
        fetchStockOHLC(stock.ticker, '1mo'),
      ]);
      if (enrichedStock) {
        setTerminalData((prev: TerminalData | null) => {
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
            ohlcData: ohlc.length > 0 ? ohlc : undefined,
          };
        });
      } else if (ohlc.length > 0) {
        setTerminalData((prev: TerminalData | null) =>
          prev?.ticker === stock.ticker ? { ...prev, ohlcData: ohlc } : prev
        );
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
            const result = await closePosition(ticker);
            if (result?.status === 'success' || result?.symbol || result?.id) {
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

  // EXITED 종목은 재등록 가능하도록 제외
  const watchlistedTickers = useMemo(
    () => new Set(watchlistItems.filter(i => i.status !== 'EXITED').map(i => i.ticker)),
    [watchlistItems]
  );

  const handleAddDiscoveryToWatchlist = async (e: React.MouseEvent, stock: DiscoveryStock) => {
    e.stopPropagation();
    const ticker: string = stock.ticker;
    if (addingTickersRef.current.has(ticker)) return; // synchronous double-click guard
    addingTickersRef.current.add(ticker);
    setAddingTickers(new Set(addingTickersRef.current));
    try {
      await addToWatchlist(ticker, undefined, 'WATCHING', undefined, undefined, undefined, stock.dna_score ?? undefined);
      toast.success(`${ticker} 관심종목 등록`);
      const wl = await getWatchlist();
      setWatchlistRaw(wl);
    } catch (e: any) {
      toast.error(`${ticker} 등록 실패`, { description: e.message });
    } finally {
      addingTickersRef.current.delete(ticker);
      setAddingTickers(new Set(addingTickersRef.current));
    }
  };


  // ── Derived Chart Data (range-filtered + MA5) ────────────────────────
  const chartData = useMemo(() => {
    const BASE = 100000;
    const now = Date.now();
    const cutoffMs = chartRange === '7d' ? 7 * 86_400_000 : chartRange === '30d' ? 30 * 86_400_000 : Infinity;
    
    let startLabel = 'Start';
    if (chartRange === '7d') {
      const d = new Date(now - 7 * 86_400_000);
      startLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (chartRange === '30d') {
      const d = new Date(now - 30 * 86_400_000);
      startLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    }

    // 현재 실계좌 가치 (총 자산 = 현금 + 미실현 포지션 시가)
    const currentActualValue = displayedAccount?.total_assets != null
      ? Math.round(displayedAccount.total_assets)
      : null;

    if (!displayedHistory || displayedHistory.length === 0) {
      // 이력 없어도 현재 계좌 값이 있으면 시작-현재 2포인트만 표시
      if (currentActualValue != null) {
        return [
          { name: startLabel, value: BASE, ts: 0, ma: BASE },
          { name: '현재', value: currentActualValue, ts: now, ma: currentActualValue },
        ];
      }
      return [];
    }

    const sorted = [...displayedHistory].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    );

    let running = BASE;
    const allPoints = sorted.map(item => {
      running += Number(item.profit_amt ?? 0);
      let name = '?';
      if (item.created_at) {
        const d = new Date(item.created_at);
        name = `${d.getMonth() + 1}/${d.getDate()}`;
      }
      return {
        name,
        value: Math.round(running),
        ts: new Date(item.created_at ?? 0).getTime(),
      };
    });

    if (chartRange === 'all' && allPoints.length > 0) {
      const d = new Date(allPoints[0].ts);
      startLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    }

    const inRange = cutoffMs === Infinity ? allPoints : allPoints.filter(p => now - p.ts <= cutoffMs);

    let startValue = BASE;
    if (inRange.length > 0) {
      const firstIdx = allPoints.indexOf(inRange[0]);
      startValue = firstIdx > 0 ? allPoints[firstIdx - 1].value : BASE;
    } else {
      startValue = allPoints.length > 0 ? allPoints[allPoints.length - 1].value : BASE;
    }

    const maPoints = inRange.map((p, i, arr) => {
      const window = arr.slice(Math.max(0, i - 4), i + 1);
      const ma = window.reduce((s, w) => s + w.value, 0) / window.length;
      return { ...p, ma: Math.round(ma) };
    });

    const series: { name: string; value: number; ts: number; ma: number }[] = [
      { name: startLabel, value: startValue, ts: 0, ma: startValue },
      ...maPoints,
    ];

    // 마지막 청산 이후 현재 실계좌 총 자산으로 앵커 — 미실현 손익 포함
    const lastTs = maPoints.length > 0 ? maPoints[maPoints.length - 1].ts : 0;
    if (now - lastTs > 60_000) {
      const currentVal = currentActualValue != null ? currentActualValue : (maPoints.length > 0 ? maPoints[maPoints.length - 1].value : startValue);
      series.push({ name: '현재', value: currentVal, ts: now, ma: currentVal });
    }

    return series;
  }, [displayedHistory, chartRange, displayedAccount]);



  // Derived Account PnL
  const totalPnl = useMemo(() => {
    return displayedPositions.reduce((sum, p) => sum + (((p.current_price ?? p.entry_price) - p.entry_price) * p.units || 0), 0);
  }, [displayedPositions]);

  // Portfolio Concentration
  const investedCapital = useMemo(() => {
    return displayedPositions.reduce((sum, p) => sum + ((p.current_price ?? 0) * (p.units ?? 0)), 0);
  }, [displayedPositions]);

  const concentrationPct = useMemo(() => {
    const cash = displayedAccount?.cash_available ?? 100000;
    const equity = cash + investedCapital;
    if (equity === 0) return 0;
    return (investedCapital / equity) * 100;
  }, [investedCapital, displayedAccount]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number; payload: { name: string } }[] }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-slate-200 leading-none text-slate-800">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">{payload[0].payload.name}</p>
          <p className="text-lg font-black text-slate-900 tabular-nums">
            ${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 relative overflow-hidden pb-12 font-sans">
      {/* Decorative Grid Background Overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {loading && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-white px-4 py-2.5 border-l-2 border-slate-600 animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-slate-700 rounded-full animate-pulse shadow-[0_0_8px_rgba(71,85,105,0.6)]" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-[0.2em] font-mono">Synchronizing Command Data...</span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 relative z-10">
        
        {/* ════════ HEADER ════════ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <span className="w-1.5 h-4 bg-slate-700 rounded-full shadow-[0_0_8px_rgba(71,85,105,0.4)]" />
              <span className="text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest">Integrated Intelligence Dashboard</span>
            </div>
            <h1 className="text-[25px] font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
              <Zap className="w-8 h-8 text-indigo-600 drop-shadow-[0_0_12px_rgba(79,70,229,0.6)] stroke-[2.5]" />
              통합 지휘소
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={clsx(
                "w-2 h-2 rounded-full",
                isMarketOpen ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-400"
              )} />
              <span className="text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest">
                US Market {isMarketOpen ? 'Open' : 'Closed'}
              </span>
              <span className="text-slate-300">|</span>
              <p className="text-[13px] font-semibold text-slate-800">실시간 시장 펄스 감시, 오늘의 알파 발굴, 그리고 실계좌 포트폴리오 현황 통합 관제</p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* System ARM Toggle — 현재 상태 표시 + 클릭 시 전환 방향 명시 */}
            <button
              onClick={handleToggleArm}
              title={isArmed ? '클릭하면 자동매매를 비활성화합니다' : '클릭하면 자동매매를 활성화합니다'}
              className={clsx(
                "flex items-center gap-0 border font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 overflow-hidden hover:shadow-md hover:scale-[1.01]",
                isArmed
                  ? "border-red-300"
                  : "border-emerald-300"
              )}
            >
              {/* 현재 상태 레이블 */}
              <span className={clsx(
                "flex items-center gap-2 px-4 py-3 font-extrabold text-[13px] font-sans",
                isArmed ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
              )}>
                {isArmed ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {isArmed ? 'ARMED (자동매매)' : 'SAFE (관제모드)'}
              </span>
              {/* 클릭 시 전환 방향 */}
              <span className="bg-slate-100 hover:bg-slate-200 px-3 py-3 text-xs text-slate-800 font-extrabold border-l border-slate-200 font-sans">
                {isArmed ? 'SAFE로 전환' : 'ARM으로 전환'}
              </span>
            </button>
 
            {/* Auto Quant Scan Status Badge */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-indigo-300">
              <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div className="leading-none">
                <span className="text-xs font-bold text-indigo-850 uppercase tracking-widest block font-mono">Auto Quant Scan</span>
                <span className="text-sm text-indigo-700 font-extrabold block mt-0.5 font-sans">
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
              className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all text-xs font-extrabold uppercase tracking-wider cursor-pointer font-sans"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
              설정
            </button>
          </div>
        </div>
 
        {/* 💡 SYSTEM STATUS INFO BAR */}
        <div className="bg-slate-50 py-5 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-slate-900">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 animate-pulse shadow-[0_0_8px_rgba(71,85,105,0.5)] shrink-0" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-900 border-b border-slate-900 pb-0.5 font-sans">시스템 가이드</span>
            <span className="text-slate-800 text-[13px] font-semibold font-sans">
              {isArmed 
                ? '자동 매매 활성(ARMED) 모드입니다. 관심 종목 중 퀀트 매수 지표 조건 충족 시 실시간 자동 매수가 구동됩니다.' 
                : '현재 안전 관제(SAFE) 모드입니다. 실시간 탐색 및 알림은 유지되나 가상 주문은 실행되지 않습니다.'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-550 md:text-right shrink-0 font-sans">
            * $100 이하 전 종목 스캔 · 진입가 $1 이하 자동 페니 파라미터 (-15% TS) · $1 초과 일반 파라미터 (-10% TS)
          </div>
        </div>

        {/* ════════ EDGE MONITOR ALERT ════════ */}
        {edgeAlert.active && edgeAlert.message && (
          <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-400 px-5 py-4 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <Activity className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-1 font-mono">알고리즘 Edge 이상 감지</p>
              <p className="text-sm text-amber-700 leading-relaxed font-medium">{edgeAlert.message}</p>
            </div>
            <button
              onClick={() => setEdgeAlert({ active: false, message: null })}
              className="text-amber-700/70 hover:text-amber-800 p-1 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ════════ METRICS GRID ════════ */}
        <div className="w-full">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
          {/* 1. Total Assets */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
            <div className="flex justify-between items-start z-10">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest leading-none block">Total Assets</span>
                <span className="text-3xl font-black text-slate-900 leading-none tabular-nums block pt-1.5 font-mono">
                  ${displayedAccount.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-semibold text-slate-800 leading-none block pt-2 font-sans">
                  Alpaca 실계좌 Equity
                </span>
              </div>
              <div className="text-indigo-600 shrink-0 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)]">
                <BarChart3 className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-800 z-10">
              <span>SYS_STATUS: ONLINE</span>
              <span>LVL: OPTIMAL</span>
            </div>
          </div>

          {/* 2. Available Cash */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
            <div className="flex justify-between items-start z-10">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest leading-none block">Available Cash</span>
                <span className="text-3xl font-black text-slate-900 leading-none tabular-nums block pt-1.5 font-mono">
                  ${displayedAccount.cash_available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-semibold text-slate-800 leading-none block pt-2 font-sans">
                  Alpaca Buying Power
                </span>
              </div>
              <div className="text-amber-700 shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                <Coins className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-800 font-mono z-10">
              <span>BUYING_POWER: 4.0X</span>
              <span>AVAIL_CAP</span>
            </div>
          </div>

          {/* 3. Current P&L */}
          <div className={clsx(
            "bg-white border rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative",
            totalPnl >= 0 ? "border-emerald-300" : "border-rose-300"
          )}>
            <div className="flex justify-between items-start z-10">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest leading-none block">Current P&L</span>
                <span className={clsx(
                  "text-3xl font-black leading-none tabular-nums block pt-1.5 font-mono",
                  totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-semibold text-slate-800 leading-none block pt-2 font-sans">
                  현재 보유 종목의 미실현 손익
                </span>
              </div>
              <div className={clsx(
                "shrink-0",
                totalPnl >= 0 ? "text-emerald-500" : "text-rose-500"
              )}>
                {totalPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-800 font-mono z-10">
              <span>ACTIVE_TRADES: {displayedPositions.length}</span>
              <span>LIMIT_GUARD: SAFE</span>
            </div>
          </div>

          {/* 4. Win Rate (Speedometer Gauge) */}
          {(() => {
            const hasData = liveHistory.length > 0;
            const winRateVal = displayedWinRate;
            const totalTrades = displayedTotalTrades;
            const angle = -180 + (winRateVal / 100) * 180;
            const rad = (angle * Math.PI) / 180;
            const needleX = 50 + 30 * Math.cos(rad);
            const needleY = 50 + 30 * Math.sin(rad);
            return (
              <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col items-center justify-between min-h-[200px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
                <div className="w-full flex justify-between items-start mb-1 z-10">
                  <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block">Win Rate</span>
                  <Star className="w-3.5 h-3.5 text-cyan-600" />
                </div>

                <div className="relative w-52 h-32 flex items-center justify-center overflow-hidden z-10">
                  <svg className="w-full h-full transform translate-y-3" viewBox="0 0 100 55">
                    <path d="M 15 50 A 35 35 0 0 1 85 50" fill="none" stroke="#f1f5f9" strokeWidth="6" strokeLinecap="round" />
                    <path
                      d="M 15 50 A 35 35 0 0 1 85 50"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="110"
                      strokeDashoffset={hasData ? 110 - (110 * winRateVal) / 100 : 110}
                    />
                    {hasData && <line x1="50" y1="50" x2={needleX} y2={needleY} stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />}
                    <circle cx="50" cy="50" r="3.5" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" />
                  </svg>
                  <div className="absolute bottom-1 text-center font-mono leading-none">
                    <span className="text-2xl font-black text-slate-900">
                      {hasData ? `${winRateVal.toFixed(1)}%` : '--'}
                    </span>
                    <span className="text-xs font-mono text-slate-800 font-bold block mt-0.5">WIN RATIO</span>
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-800 text-center leading-normal border-t border-slate-100 pt-2 w-full z-10 font-sans">
                  {hasData ? `총 ${totalTrades}건 실계좌 거래 기준 승률` : '거래 이력 없음'}
                </p>
              </div>
            );
          })()}

          {/* 5. Portfolio Concentration (Speedometer Gauge) */}
          {(() => {
            const pct = concentrationPct;
            const angle = -180 + (Math.min(pct, 100) / 100) * 180;
            const rad = (angle * Math.PI) / 180;
            const needleX = 50 + 30 * Math.cos(rad);
            const needleY = 50 + 30 * Math.sin(rad);
            const isWarn = pct >= 70;
            const isCaution = pct >= 50 && pct < 70;
            const dialColor = isWarn ? '#ef4444' : isCaution ? '#f59e0b' : '#10b981';
            const label = isWarn ? '위험 (≥70%)' : isCaution ? '주의 (≥50%)' : '안전';
            return (
              <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col items-center justify-between min-h-[200px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
                <div className="w-full flex justify-between items-start mb-1 z-10">
                  <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block">Concentration</span>
                  <PieChart className="w-3.5 h-3.5 text-cyan-600" />
                </div>

                <div className="relative w-52 h-32 flex items-center justify-center overflow-hidden z-10">
                  <svg className="w-full h-full transform translate-y-3" viewBox="0 0 100 55">
                    <path d="M 15 50 A 35 35 0 0 1 85 50" fill="none" stroke="#f1f5f9" strokeWidth="6" strokeLinecap="round" />
                    <path
                      d="M 15 50 A 35 35 0 0 1 85 50"
                      fill="none"
                      stroke={dialColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="110"
                      strokeDashoffset={110 - (110 * Math.min(pct, 100)) / 100}
                    />
                    <line x1="50" y1="50" x2={needleX} y2={needleY} stroke="#475569" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="3.5" fill="#ffffff" stroke={dialColor} strokeWidth="1.5" />
                  </svg>
                  <div className="absolute bottom-1 text-center font-mono leading-none">
                    <span className="text-2xl font-black text-slate-900">{pct.toFixed(1)}%</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5 font-sans">{label}</span>
                  </div>
                </div>
                
                <div className="text-xs text-slate-800 text-center font-sans font-semibold leading-normal border-t border-slate-100 pt-2 w-full z-10 flex justify-between">
                  <span>${investedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })} 투입</span>
                  <span className="font-mono text-xs">LIMIT 80%</span>
                </div>
              </div>
            );
          })()}
        </div>

        </div>
        {/* ════════ MAIN SECTION ════════ */}
        <div className="space-y-6">

          {/* FULL WIDTH: Chart & Daily recommendations */}
          <div className="space-y-6">
            
            {/* A. PERFORMANCE GROWTH CHART */}
            <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block mb-0.5">Asset & Profit Metrics</span>
                  <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">포트폴리오 자산 성장 및 누적 손익 곡선</h2>
                  <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">실시간 청산 완료된 거래 내역에 기반한 가상 자산의 누적 성장 흐름을 시각화합니다.</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    {(['7d', '30d', 'all'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={clsx(
                          "px-3 py-1 text-sm font-bold rounded-md transition-all",
                          chartRange === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-800 hover:text-slate-800"
                        )}
                      >
                        {r === '7d' ? '7일' : r === '30d' ? '30일' : '전체'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-indigo-500 rounded" /> 자산</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-amber-400 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#f59e0b 0,#f59e0b 4px,transparent 4px,transparent 6px)' }} /> MA5</span>
                    <span className="font-mono text-xs text-slate-800">{lastFetchedTime}</span>
                  </div>
                </div>
              </div>

              <div className="h-48 sm:h-72 w-full">
                {chartData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 border border-dashed border-slate-200">
                    <BarChart3 className="w-8 h-8 text-indigo-500 drop-shadow-[0_0_12px_rgba(79,70,229,0.4)] stroke-[2.5]" />
                    <p className="text-sm font-extrabold text-slate-800 font-sans">청산 이력이 없습니다</p>
                    <p className="text-xs font-semibold text-slate-800 font-sans">매매가 완료되면 누적 손익 곡선이 표시됩니다.</p>
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
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={['dataMin - 1000', 'dataMax + 1000']}
                      tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                    <Line type="monotone" dataKey="ma" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* B. TODAY QUANT DISCOVERIES */}
            <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block mb-0.5">Top Quantitative Picks</span>
                  <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">퀀트 엔진 추천 & 오늘의 알파 종목</h2>
                  <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">수학적 기술 지표 분석으로 엄선된 매수 후보 종목입니다. 클릭 시 상세 지표(RSI/ADX/RVOL)가 노출됩니다.</p>
                </div>
                <span className="text-xs font-black text-indigo-700 border-b-2 border-indigo-500 pb-0.5 shrink-0 self-start sm:self-auto font-sans">
                  DNA 80점 이상 엄선
                </span>
              </div>

              {discoveryStocks.length === 0 ? (
                <div className="text-center py-12 text-slate-800 border border-dashed border-slate-200">
                  <Activity className="w-8 h-8 text-indigo-500 mx-auto mb-3 animate-pulse drop-shadow-[0_0_12px_rgba(79,70,229,0.5)] stroke-[2.5]" />
                  <p className="text-sm font-extrabold text-slate-800 font-sans">발굴된 오늘의 추천 종목이 없습니다.</p>
                  <p className="text-xs font-semibold text-slate-800 mt-1 font-sans">우측 설정 패널에서 "AI 퀀트 헌팅"을 가동해 보세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {discoveryStocks.map((stock) => {
                    const isPenny = (stock.price ?? 0) <= PENNY_ENGINE_THRESHOLD && (stock.price ?? 0) > 0;
                    return (
                      <div
                        key={stock.ticker}
                        onClick={() => handleDeepDive(stock)}
                        className="py-4 px-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border",
                            isPenny ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-700" : "bg-slate-500/10 border-indigo-500/20 text-slate-800"
                          )}>
                            {stock.ticker}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 group-hover:text-slate-800 transition-colors">{stock.ticker}</span>
                              <span className={clsx(
                                "text-xs font-black px-1.5 py-0.5 rounded tracking-widest border leading-none",
                                isPenny ? "bg-amber-500/10 border-amber-500/20 text-amber-700" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-700"
                              )}>
                                <span className="font-extrabold">{isPenny ? '$1↓' : '$1↑'}</span>
                              </span>
                            </div>
                            <span className="text-xs text-slate-800 font-bold block mt-0.5">{stock.sector || 'US Stock'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-base font-extrabold text-slate-900 tabular-nums">${stock.price != null ? stock.price.toFixed(isPenny ? 4 : 2) : '--'}</span>
                            <span className={clsx(
                              "text-xs font-black block mt-0.5 tabular-nums",
                              (stock.change_percent ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                            )}>
                              {(stock.change_percent ?? 0) >= 0 ? '+' : ''}{(stock.change_percent ?? 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-12">
                            <PennyQuantScoreBar score={stock.dna_score} size="sm" showLabel={false} />
                          </div>
                          {/* 시뮬레이터 버튼 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const params = new URLSearchParams({ ticker: stock.ticker });
                              if (stock.rsi != null)  params.set('rsi',  String(Math.round(stock.rsi)));
                              if (stock.rvol != null) params.set('rvol', String(stock.rvol.toFixed(1)));
                              if (stock.adx != null)  params.set('adx',  String(Math.round(stock.adx)));
                              // macdDiff > 0 → rising/golden 근사, < 0 → falling/dead
                              if (stock.macdDiff != null) params.set('macd', stock.macdDiff > 0 ? 'rising' : 'falling');
                              if (isPenny) params.set('penny', 'true');
                              if (stock.price != null) params.set('entry', String(stock.price.toFixed(4)));
                              navigate(`/dna-simulator?${params.toString()}`);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-800 hover:text-indigo-500 transition-all shrink-0"
                            title="DNA 시뮬레이터로 분석"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                          </button>
                          {/* 관심종목 등록 버튼 */}
                          {watchlistedTickers.has(stock.ticker) ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] stroke-[2.5]" />
                          ) : addingTickers.has(stock.ticker) ? (
                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
                          ) : (
                            <button
                              onClick={(e) => handleAddDiscoveryToWatchlist(e, stock)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-800 hover:text-indigo-600 transition-all shrink-0"
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

        </div>

        {/* ════════ ANALYTICS PANELS ════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <RiskAnalyticsPanel history={displayedHistory} strategyStats={null} />
          <PositionAnalyticsPanel positions={displayedPositions} totalEquity={displayedAccount.total_assets} />
        </div>

        {/* ════════ BOTTOM SECTION: Positions & History ════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-8">
          
          {/* LEFT 2/3 COLUMN: Positions */}
          <div className="lg:col-span-2 bg-white border-t border-slate-200 pt-8 pb-12 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
              <div>
                <span className="text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest block mb-0.5">Active Positions</span>
                <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">현재 보유 중인 매수 포지션</h2>
                <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">
                  실시간 매수가 완료되어 Alpaca 실계좌에서 운용 중인 주식 자산입니다. 우측 청산 클릭 시 즉시 전량 매도됩니다.
                </p>
              </div>
              <span className="text-xs font-black text-emerald-700 border-b-2 border-emerald-500 pb-0.5 shrink-0 self-start sm:self-auto font-sans">
                {displayedPositions.length}개 보유 중
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest">
                    <th className="pb-3">종목</th>
                    <th className="pb-3 text-right">구분</th>
                    <th className="pb-3 text-right font-mono text-xs hidden md:table-cell">수량</th>
                    <th className="pb-3 text-right font-mono text-xs">진입가</th>
                    <th className="pb-3 text-right font-mono text-xs">현재가</th>
                    <th className="pb-3 text-right font-mono text-xs hidden md:table-cell">Trailing Stop</th>
                    <th className="pb-3 text-right font-mono text-xs">평가 손익 (P&L)</th>
                    <th className="pb-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {displayedPositions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-800 font-extrabold text-sm">
                        보유중인 실계좌 매수 포지션이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    displayedPositions.map((pos) => {
                      const pnlPct = pos.unrealized_plpc;
                      const pnlAmt = pos.unrealized_pl;
                      const hasPnl = pnlAmt != null && !Number.isNaN(pnlAmt);
                      const isProfit = hasPnl ? pnlAmt >= 0 : true;
                      const decimals = pos.isPenny ? 4 : 2;
                      return (
                        <tr key={pos.ticker} className="hover:bg-slate-50/50 transition-colors text-xs font-bold">
                          <td className="py-4">
                            <span className="font-extrabold text-slate-900 text-base">{pos.ticker}</span>
                          </td>
                          <td className="py-4 text-right">
                            <span className={clsx(
                              "text-xs font-black px-1.5 py-0.5 rounded border tracking-widest font-sans",
                              pos.isPenny ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-indigo-50 border-indigo-200 text-indigo-700"
                            )}>
                              {pos.isPenny ? '$1↓' : '$1↑'}
                            </span>
                          </td>
                          <td className="py-4 text-right font-mono text-slate-800 text-sm font-semibold tabular-nums hidden md:table-cell">{Number(pos.units).toFixed(2)}</td>
                          <td className="py-4 text-right font-mono text-slate-800 text-sm font-semibold tabular-nums">${Number(pos.entry_price).toFixed(decimals)}</td>
                          <td className="py-4 text-right font-mono text-slate-900 text-sm font-bold tabular-nums">
                            {pos.current_price != null ? `$${Number(pos.current_price).toFixed(decimals)}` : <span className="text-slate-800">—</span>}
                          </td>
                          <td className="py-4 text-right font-mono text-rose-500 text-sm font-semibold tabular-nums hidden md:table-cell">
                            {pos.ts_threshold ? `$${Number(pos.ts_threshold).toFixed(decimals)}` : 'N/A'}
                          </td>
                          <td className={clsx("py-4 text-right font-mono tabular-nums text-base font-black", hasPnl ? (isProfit ? "text-emerald-500" : "text-rose-500") : "text-slate-800")}>
                            {hasPnl ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              <span>{isProfit ? '+' : ''}{(pnlAmt as number).toFixed(2)} ({isProfit ? '+' : ''}{(pnlPct as number).toFixed(2)}%)</span>
                            </div>
                            ) : <span className="text-slate-800 text-sm font-sans font-bold">조회 불가</span>}
                          </td>
                          <td className="py-4 text-right">
                            <button
                              onClick={() => handleClosePosition(pos.ticker)}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 border border-rose-200 text-rose-600 hover:text-white text-xs font-bold rounded-lg transition-all cursor-pointer font-sans"
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
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
                  <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">최근 청산 이력</h2>
                </div>
                <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">
                  실계좌에서 매도가 완료되어 최종 손익이 확정된 거래 내역입니다.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-800 font-sans">{displayedHistory.length}건 기록</span>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {displayedHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-800 border border-dashed border-slate-200 font-sans">
                  <Clock className="w-8 h-8 text-indigo-500 mx-auto mb-2 opacity-80 drop-shadow-[0_0_8px_rgba(79,70,229,0.4)] stroke-[2.5]" />
                  <p className="text-sm font-extrabold text-slate-800">
                    최근 종료된 실계좌 매매 기록이 없습니다.
                  </p>
                </div>
              ) : (
                displayedHistory.slice(0, 15).map((trade, idx) => {
                  const isProfit = (trade.pnl_pct ?? 0) >= 0;
                  const isPenny = Number(trade.entry_price || 0) <= 1.0;
                  return (
                    <div key={trade.id || idx} className="group py-4 border-b border-slate-100 last:border-none flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">
                          {isProfit ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-base leading-none">{trade.ticker}</span>
                            <span className={clsx(
                              "text-xs font-black px-1.5 py-0.5 rounded border leading-none",
                              isProfit ? "bg-emerald-550 border-emerald-200 text-emerald-600" : "bg-rose-50 border-rose-200 text-rose-600"
                            )}>
                              {(trade.pnl_pct ?? 0) >= 0 ? '+' : ''}{Number(trade.pnl_pct ?? 0).toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-xs text-slate-800 font-medium block mt-1.5 hidden sm:block">
                            진입: ${Number(trade.entry_price || 0).toFixed(isPenny ? 4 : 2)} ➔ 청산: ${Number(trade.exit_price || 0).toFixed(isPenny ? 4 : 2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className={clsx("text-base font-black tabular-nums block", isProfit ? "text-emerald-500" : "text-rose-500")}>
                            {isProfit ? '+' : ''}${Number(trade.profit_amt ?? 0).toFixed(2)}
                          </span>
                          <span className="text-xs text-slate-800 font-medium block mt-0.5">
                            {trade.exit_reason || 'Exit'}
                          </span>
                        </div>
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
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200]"
          onClick={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Settings Slideout Panel */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-lg bg-white border-l border-slate-200 z-[210] overflow-y-auto transition-transform duration-300 ease-in-out ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
            <span className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">NexGuard Control</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 hover:text-slate-800 border border-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          {/* AI 퀀트 헌팅 — 오퍼레이터 수동 트리거 */}
          <div className="bg-slate-50/50 border border-indigo-100 rounded-2xl p-4 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-widest block mb-0.5">Manual Override</span>
              <h3 className="text-sm font-black text-indigo-900">AI 퀀트 헌팅 (Edge Function)</h3>
              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
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
              {isHunting ? '헌팅 중...' : 'AI 퀀트 헌팅 실행'}
            </button>
          </div>
          <CommandSettings />
          <BacktestPanel />
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
