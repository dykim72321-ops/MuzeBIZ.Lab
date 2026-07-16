/**
 * useDashboardData.ts — Dashboard Data Hook
 *
 * 대시보드에 필요한 모든 파생 데이터(Derived State)와 주기적 데이터 로딩 로직을 캡슐화.
 * Zustand 스토어에서 원본 데이터를 읽고, 뷰에 필요한 형태로 가공하여 반환한다.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useTradingStore } from '../store/useTradingStore';
import { useMarketEngine } from './useMarketEngine';
import { processSignal } from '../utils/signalProcessor';
import { DNA_BUY } from '../constants/dnaThresholds';

import type { DiscoveryStock, TerminalData } from '../types/dashboard';
import {
  closePosition,
  toggleSystemArm,
} from '../services/pythonApiService';
import { useNavigate } from 'react-router-dom';


// ─── Types ───────────────────────────────────────────────────────────────────

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDashboardData() {
  const navigate = useNavigate();
  const { isHunting, triggerHunt } = useMarketEngine();

  // Zustand Store — Selector 기반 구독으로 최소한의 리렌더링
  const loading = useTradingStore((s) => s.loading);
  const connectionError = useTradingStore((s) => s.connectionError);
  const isArmed = useTradingStore((s) => s.isArmed);
  const isMarketOpen = useTradingStore((s) => s.isMarketOpen);
  const isSettingsOpen = useTradingStore((s) => s.isSettingsOpen);
  const lastFetchedTime = useTradingStore((s) => s.lastFetchedTime);
  const discoveryStocks = useTradingStore((s) => s.discoveryStocks);
  const livePositions = useTradingStore((s) => s.livePositions);
  const liveHistory = useTradingStore((s) => s.liveHistory);
  const portfolioHistory = useTradingStore((s) => s.portfolioHistory);
  const paperAccount = useTradingStore((s) => s.paperAccount);
  const pennyScanStatus = useTradingStore((s) => s.pennyScanStatus);
  const edgeAlert = useTradingStore((s) => s.edgeAlert);
  const terminalData = useTradingStore((s) => s.terminalData);
  const chartRange = useTradingStore((s) => s.chartRange);

  // Actions
  const setIsSettingsOpen = useTradingStore((s) => s.setIsSettingsOpen);
  const setChartRange = useTradingStore((s) => s.setChartRange);
  const setTerminalData = useTradingStore((s) => s.setTerminalData);
  const setEdgeAlert = useTradingStore((s) => s.setEdgeAlert);
  const loadDashboardData = useTradingStore((s) => s.loadDashboardData);
  const loadArmStatus = useTradingStore((s) => s.loadArmStatus);

  // ── Market Open Check ──
  useEffect(() => {
    const checkMarket = () => {
      const now = new Date();
      const etParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(now);
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
        etParts.find((p) => p.type === 'weekday')?.value ?? 'Sun',
      );
      const hours = parseInt(etParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
      const minutes = parseInt(etParts.find((p) => p.type === 'minute')?.value ?? '0', 10);
      const timeInMin = hours * 60 + minutes;
      const open = day >= 1 && day <= 5 && timeInMin >= 570 && timeInMin < 960;
      useTradingStore.getState().setIsMarketOpen(open);
    };
    checkMarket();
    const id = setInterval(checkMarket, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Periodic Data Loading ──
  useEffect(() => {
    loadDashboardData();
    loadArmStatus();
    const interval = setInterval(() => {
      loadDashboardData();
      loadArmStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadDashboardData, loadArmStatus]);

  // ── Derived: Displayed Account ──
  const displayedAccount = useMemo(
    () => ({
      total_assets: paperAccount?.total_assets ?? 0,
      cash_available: paperAccount?.cash_available ?? 0,
      today_pnl: paperAccount?.today_pnl ?? 0,
      today_pnl_pct: paperAccount?.today_pnl_pct ?? 0,
    }),
    [paperAccount],
  );

  // ── Derived: Sliced Histories ──
  const { slicedPortfolioHistory, slicedHistory } = useMemo(() => {
    if (chartRange === 'all') {
      return { slicedPortfolioHistory: portfolioHistory, slicedHistory: liveHistory };
    }
    const now = Date.now();
    const cutoffMs = chartRange === '7d' ? 7 * 86_400_000 : 30 * 86_400_000;

    const slicedPortfolio = portfolioHistory?.filter(p => now - p.timestamp <= cutoffMs) || [];
    const slicedHist = liveHistory?.filter(h => {
      const ts = new Date(h.closed_at || h.created_at || 0).getTime();
      return now - ts <= cutoffMs;
    }) || [];

    return { slicedPortfolioHistory: slicedPortfolio, slicedHistory: slicedHist };
  }, [portfolioHistory, liveHistory, chartRange]);

  // ── Derived: Win Rate & Total Trades ──
  const displayedWinRate = useMemo(() => {
    if (!slicedHistory || slicedHistory.length === 0) return 0;
    const wins = slicedHistory.filter((t) => (t.pnl_pct ?? 0) > 0).length;
    return (wins / slicedHistory.length) * 100;
  }, [slicedHistory]);

  const displayedTotalTrades = useMemo(() => slicedHistory.length, [slicedHistory]);

  // ── Derived: Total PnL ──
  const totalPnl = useMemo(
    () =>
      livePositions.reduce(
        (sum, p) => sum + (((p.current_price ?? p.entry_price) - p.entry_price) * p.units || 0),
        0,
      ),
    [livePositions],
  );

  // ── Derived: Portfolio Concentration ──
  const investedCapital = useMemo(
    () =>
      livePositions.reduce(
        (sum, p) => sum + ((p.current_price ?? 0) * (p.units ?? 0)),
        0,
      ),
    [livePositions],
  );

  const concentrationPct = useMemo(() => {
    const equity = displayedAccount.total_assets || 100000;
    if (equity === 0) return 0;
    return (investedCapital / equity) * 100;
  }, [investedCapital, displayedAccount]);



  // ── Derived: Chart Data ──
  const chartData = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      chartRange === '7d'
        ? 7 * 86_400_000
        : chartRange === '30d'
          ? 30 * 86_400_000
          : Infinity;

    let startLabel = 'Start';
    let startTs = now - 7 * 86_400_000;
    
    if (chartRange === '7d') {
      startTs = now - 7 * 86_400_000;
      const d = new Date(startTs);
      startLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (chartRange === '30d') {
      startTs = now - 30 * 86_400_000;
      const d = new Date(startTs);
      startLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (chartRange === 'all') {
      startLabel = '시작';
      startTs = now - 86_400_000; // fallback if no data
    }

    const currentActualValue =
      displayedAccount.total_assets != null ? Math.round(displayedAccount.total_assets) : null;

    if (!portfolioHistory || portfolioHistory.length === 0) {
      if (currentActualValue != null) {
        return [
          { name: startLabel, value: currentActualValue, ts: startTs, ma: currentActualValue, id: '0', displayName: startLabel },
          { name: '현재', value: currentActualValue, ts: now, ma: currentActualValue, id: '1', displayName: '현재' },
        ];
      }
      return [];
    }

    const allPoints = portfolioHistory.map((item) => {
      const d = new Date(item.timestamp);
      const name = `${d.getMonth() + 1}/${d.getDate()}`;
      return { name, value: Math.round(item.equity), ts: item.timestamp };
    });

    if (chartRange === '7d') {
      startTs = now - 7 * 86_400_000;
      startLabel = '7일전';
    } else if (chartRange === '30d') {
      startTs = now - 30 * 86_400_000;
      startLabel = '30일전';
    } else if (chartRange === 'all' && allPoints.length > 0) {
      startLabel = '시작';
      startTs = allPoints[0].ts - 86_400_000; // 1 day before first trade
    }

    const inRange =
      cutoffMs === Infinity ? allPoints : allPoints.filter((p) => now - p.ts <= cutoffMs);

    let startValue = 100000;
    if (inRange.length > 0) {
      const firstIdx = allPoints.indexOf(inRange[0]);
      startValue = firstIdx > 0 ? allPoints[firstIdx - 1].value : (allPoints[0].value || 100000);
    } else {
      startValue = allPoints.length > 0 ? allPoints[allPoints.length - 1].value : 100000;
    }

    const maPoints = inRange.map((p, i, arr) => {
      const window = arr.slice(Math.max(0, i - 4), i + 1);
      const ma = window.reduce((s, w) => s + w.value, 0) / window.length;
      return { ...p, ma: Math.round(ma) };
    });

    const series: { name: string; value: number; ts: number; ma: number; displayName?: string }[] = [
      { name: startLabel, value: startValue, ts: startTs, ma: startValue },
      ...maPoints,
    ];

    const currentVal =
      currentActualValue != null
        ? currentActualValue
        : maPoints.length > 0
          ? maPoints[maPoints.length - 1].value
          : startValue;
    series.push({ name: '현재', value: currentVal, ts: now, ma: currentVal });

    // Duplicate string labels removal logic
    let lastSeenName = '';
    const cleanSeries = series.map((s, idx) => {
      const base = { ...s, id: idx.toString() };
      if (idx === 0 || idx === series.length - 1) {
        lastSeenName = s.name;
        return { ...base, displayName: s.name };
      }
      if (s.name === lastSeenName) {
        return { ...base, displayName: '' };
      }
      lastSeenName = s.name;
      return { ...base, displayName: s.name };
    });
    return cleanSeries;
  }, [portfolioHistory, chartRange, displayedAccount]);

  // ── Handlers ──

  const handleDeepDive = useCallback(
    async (stock: DiscoveryStock) => {
      const displaySignal = processSignal(stock);
      const rawSummary = stock.rawAiSummary || '';

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

      const initialData: TerminalData = {
        ticker: stock.ticker,
        dnaScore: stock.dna_score || 0,
        bullPoints: displaySignal.bullPoints,
        bearPoints: displaySignal.bearPoints,
        riskLevel:
          (stock.dna_score || 0) >= DNA_BUY ? 'Low' : (stock.dna_score || 0) >= 50 ? 'Medium' : 'High',
        formulaVerdict: displaySignal.reasoning,
        price: stock.price || 0,
        change: `${(stock.change_percent || stock.changePercent || 0).toFixed(2)}%`,
        efficiencyRatio: stock.efficiency_ratio || stock.efficiencyRatio || 0,
        kellyWeight: stock.kelly_weight ?? stock.kellyWeight,
        quantData,
        rsi: stock.rsi,
        macdDiff: stock.macdDiff ?? stock.macd_diff,
        adx: stock.adx,
        rvol: stock.rvol,
        history: stock.history || [],
      };

      setTerminalData(initialData);

      // Background enrichment
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
              // realtime_signals에 해당 티커가 없으면 enrichedStock 지표가 undefined로
              // 돌아오는데, 이를 그대로 덮어쓰면 스캔 시점(daily_discovery)의 정상 값이
              // 사라지므로 실측값이 있을 때만 교체한다.
              rsi: enrichedStock.rsi ?? prev.rsi,
              macdDiff: enrichedStock.macdDiff ?? prev.macdDiff,
              adx: enrichedStock.adx ?? prev.adx,
              rvol: enrichedStock.rvol ?? prev.rvol,
              history:
                enrichedStock.history?.map((h: { price: number; date: string }) => ({
                  price: h.price,
                  date: h.date,
                })) || [],
              ohlcData: ohlc.length > 0 ? ohlc : undefined,
            };
          });
        } else if (ohlc.length > 0) {
          setTerminalData((prev: TerminalData | null) =>
            prev?.ticker === stock.ticker ? { ...prev, ohlcData: ohlc } : prev,
          );
        }
      } catch (err) {
        console.warn(`Failed to fetch enriched quote for ${stock.ticker}:`, err);
      }
    },
    [setTerminalData],
  );

  const handleLiveHuntingTrigger = useCallback(async () => {
    const toastId = toast.loading('🛰️ 실시간 퀀트 라이브 헌팅 구동 중...');
    try {
      await triggerHunt();
      toast.success('라이브 헌팅 트리거 성공', { id: toastId });
      await loadDashboardData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '알 수 없는 에러';
      toast.error('헌팅 트리거 실패', { id: toastId, description: msg });
    }
  }, [triggerHunt, loadDashboardData]);

  const handleToggleArm = useCallback(async () => {
    const currentIsArmed = useTradingStore.getState().isArmed;
    const nextState = !currentIsArmed;
    const toastId = toast.loading(nextState ? 'SYSTEM ARMING...' : 'SYSTEM DISARMING...');
    try {
      const result = await toggleSystemArm(nextState);
      if (result.status === 'success') {
        useTradingStore.getState().setIsArmed(result.is_armed);
        toast.success(nextState ? 'SYSTEM ARMED' : 'SYSTEM DISARMED', {
          id: toastId,
          description: nextState
            ? '자동 매매가 활성화되었습니다.'
            : '시스템이 안전 관제 모드로 전환되었습니다.',
        });
      }
    } catch {
      toast.error('ARM 상태 변경 실패', { id: toastId });
    }
  }, []);

  const handleClosePosition = useCallback(
    async (ticker: string) => {
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
          },
        },
      });
    },
    [loadDashboardData],
  );

  return {
    // State
    loading,
    connectionError,
    isArmed,
    isMarketOpen,
    isSettingsOpen,
    lastFetchedTime,
    discoveryStocks,
    livePositions,
    liveHistory,
    portfolioHistory,
    slicedHistory,
    slicedPortfolioHistory,
    pennyScanStatus,
    edgeAlert,
    terminalData,
    chartRange,

    // Derived
    displayedAccount,
    displayedWinRate,
    displayedTotalTrades,
    totalPnl,
    investedCapital,
    concentrationPct,
    chartData,

    // Actions
    setIsSettingsOpen,
    setChartRange,
    setTerminalData,
    setEdgeAlert,
    loadDashboardData,

    // Handlers
    handleDeepDive,
    handleLiveHuntingTrigger,
    handleToggleArm,
    handleClosePosition,
    isHunting,
    navigate,
  };
}
