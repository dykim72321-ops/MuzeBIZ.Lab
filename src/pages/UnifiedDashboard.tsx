import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { toast } from 'sonner';

import {
  Zap,
  ShieldCheck,
  X,
  Search,
  Coins,
  LayoutDashboard,
  Scan,
  Star,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  ShieldAlert,
  BarChart3,
  Clock
} from 'lucide-react';

// Hooks & Services
import { useMarketEngine } from '../hooks/useMarketEngine';
import { useStrategyStats } from '../hooks/useStrategyStats';
import { getWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { fetchMultipleStocksOptimized, getTopStocks } from '../services/stockService';
import { processSignal } from '../utils/signalProcessor';
import { supabase as supabaseClient } from '../lib/supabase';
import { calculateDNATargets } from '../utils/dnaMath';
import { scanPennyStocks, type PennyScanResponse } from '../services/pennyService';
import {
  fetchPaperAccount,
  fetchPaperPositions,
  fetchPaperHistory,
  sellPaperPosition
} from '../services/pythonApiService';

// Components
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { StrategicSignalMatrix } from '../components/dashboard/StrategicSignalMatrix';
import { AlphaDiscoverySection } from '../components/dashboard/AlphaDiscoverySection';
import { MonitoringOrbit } from '../components/dashboard/MonitoringOrbit';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { LiveExecutionCenter } from '../components/dashboard/LiveExecutionCenter';
import { PerformanceSummary } from '../components/dashboard/PerformanceSummary';

// Scanner Components
import { ScannerControls } from '../components/scanner/ScannerControls';
import { ScannerTopFive } from '../components/scanner/ScannerTopFive';
import { ScannerAssetList } from '../components/scanner/ScannerAssetList';

// Penny Components
import { PennyStockCard } from '../components/penny/PennyStockCard';
import { PennyQuantScoreBar } from '../components/penny/PennyQuantScoreBar';
import type { Stock } from '../types';

export const UnifiedDashboard = () => {
  const { pulseMap } = useMarketEngine();
  const { data: strategyStats } = useStrategyStats();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'command';

  // 1. General States
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistStocks, setWatchlistStocks] = useState<any[]>([]);
  const [discoveryStocks, setDiscoveryStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminalData, setTerminalData] = useState<any | null>(null);
  const [lastFetchedTime, setLastFetchedTime] = useState<string>('--:--:--');
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 2. Scanner States
  const [scannerStocks, setScannerStocks] = useState<Stock[]>([]);
  const [scannerLoading, setScannerLoading] = useState(true);
  const [scannerSearchTerm, setScannerSearchTerm] = useState('');
  const [scannerViewMode, setScannerViewMode] = useState<'table' | 'grid'>('table');
  const [minDna, setMinDna] = useState(0);
  const [selectedSector, setSelectedSector] = useState('All');
  const [selectedRisk, setSelectedRisk] = useState('All');
  const [sortBy, setSortBy] = useState<'dna' | 'price' | 'change'>('dna');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isHistorical, setIsHistorical] = useState(false);

  // 3. Penny Sandbox States
  const [pennyScanData, setPennyScanData] = useState<PennyScanResponse | null>(null);
  const [pennyWatchlistItems, setPennyWatchlistItems] = useState<WatchlistItem[]>([]);
  const [pennyPositions, setPennyPositions] = useState<any[]>([]);
  const [pennyHistory, setPennyHistory] = useState<any[]>([]);
  const [pennyAccount, setPennyAccount] = useState<any>(null);
  const [pennyScanning, setPennyScanning] = useState(false);
  const [pennyLoadingData, setPennyLoadingData] = useState(true);
  const [pennyActiveSection, setPennyActiveSection] = useState<'scan' | 'watchlist' | 'positions' | 'history'>('scan');

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

  // ── Load Command Center Data ──────────────────────────────────────────
  const loadCommandData = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getWatchlist();
      setWatchlistItems(items);
      
      const [watchlistData, discoveryResult] = await Promise.all([
        items.length > 0 ? fetchMultipleStocksOptimized(items.map(i => i.ticker)) : Promise.resolve([]),
        supabaseClient
          .from('daily_discovery')
          .select('*')
          .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('dna_score', { ascending: false })
          .limit(15),
      ]);

      if (discoveryResult.error) console.error('Discovery fetch error:', discoveryResult.error);

      setWatchlistStocks(watchlistData);
      setDiscoveryStocks(discoveryResult.data || []);
      setLastFetchedTime(new Date().toISOString().substring(11, 19));
    } catch (err) {
      console.error('Failed to load unified data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'command') {
      loadCommandData();
      const interval = setInterval(loadCommandData, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, loadCommandData]);

  // ── Load Scanner Data ─────────────────────────────────────────────────
  const fetchScannerStocks = useCallback(async () => {
    try {
      setScannerLoading(true);
      const data = await getTopStocks(isHistorical);
      setScannerStocks(data);
    } catch (err) {
      console.error('Failed to fetch scanner stocks:', err);
    } finally {
      setScannerLoading(false);
    }
  }, [isHistorical]);

  useEffect(() => {
    if (activeTab === 'scanner') {
      fetchScannerStocks();
    }
  }, [activeTab, fetchScannerStocks]);

  // ── Load Penny Sandbox Data ───────────────────────────────────────────
  const loadPennySideData = useCallback(async () => {
    try {
      const [wl, pp, ph, pa] = await Promise.all([
        getWatchlist(),
        fetchPaperPositions(),
        fetchPaperHistory(),
        fetchPaperAccount(),
      ]);

      // 페니 판별: 백엔드(paper_engine)와 동일하게 진입가(buyPrice) 기준으로만 필터
      const pennyWl = wl.filter(item => item.buyPrice !== undefined && item.buyPrice <= 1.0);

      setPennyWatchlistItems(pennyWl);
      setPennyPositions(
        pp
          .filter((pos: any) => pos.entry_price > 0 && pos.entry_price <= 1.0)
          .map((pos: any) => {
            const cp = pos.current_price > 0 ? pos.current_price : undefined;
            return {
              ...pos,
              unrealized_pl: cp !== undefined ? (cp - pos.entry_price) * pos.units : undefined,
              unrealized_plpc: cp !== undefined ? (cp / pos.entry_price - 1) * 100 : undefined,
            };
          })
      );
      setPennyHistory(ph);
      setPennyAccount(pa);
    } catch (e) {
      console.error('[PennyDash] Side data error:', e);
    } finally {
      setPennyLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'penny') {
      loadPennySideData();
      const interval = setInterval(loadPennySideData, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, loadPennySideData]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleDeepDive = (stock: any) => {
    const displaySignal = processSignal(stock);
    const cache = (stock as { stock_analysis_cache?: Array<{ analysis: any }> }).stock_analysis_cache?.[0]?.analysis;
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

    setTerminalData({
      ticker: stock.ticker,
      dnaScore: stock.dna_score || stock.dnaScore || 0,
      bullPoints: displaySignal.bullPoints,
      bearPoints: displaySignal.bearPoints,
      riskLevel: cache?.riskLevel || ((stock.dna_score || stock.dnaScore || 0) >= 70 ? 'Low' : (stock.dna_score || stock.dnaScore || 0) >= 50 ? 'Medium' : 'High'),
      formulaVerdict: displaySignal.reasoning,
      price: stock.price || 0,
      change: `${(stock.change_percent || stock.changePercent || 0).toFixed(2)}%`,
      efficiencyRatio: stock.efficiency_ratio || stock.efficiencyRatio || 0,
      kellyWeight: stock.kelly_weight || stock.kellyWeight || 0,
      quantData
    });
  };

  const handlePennyScan = async () => {
    setPennyScanning(true);
    const toastId = toast.loading('🪙 페니 주식 스캔 중... (2개월 데이터 분석)');
    try {
      const data = await scanPennyStocks(1.0, 3);
      setPennyScanData(data);
      toast.success(`스캔 완료! ${data.total_scanned}개 종목 발견`, {
        id: toastId,
        description: `Top 3 자동 등록: ${data.auto_registered.join(', ') || 'None'}`,
      });
      await Promise.all([loadPennySideData(), loadCommandData()]);
    } catch (e: any) {
      toast.error('스캔 실패', { id: toastId, description: e.message });
    } finally {
      setPennyScanning(false);
    }
  };

  const handlePennySell = async (ticker: string) => {
    const toastId = toast.loading(`${ticker} 청산 중...`);
    try {
      await sellPaperPosition(ticker);
      toast.success(`${ticker} 청산 완료`, { id: toastId });
      await Promise.all([loadPennySideData(), loadCommandData()]);
    } catch (e: any) {
      toast.error('청산 실패', { id: toastId, description: e.message });
    }
  };

  const handlePennyAddWatchlist = async (ticker: string) => {
    try {
      const stockData = pennyScanData?.results.find((s) => s.ticker === ticker);
      await addToWatchlist(
        ticker,
        undefined,
        'WATCHING',
        stockData?.price,
        undefined,
        undefined,
        stockData?.dna_score
      );
      toast.success(`${ticker} 관심종목 추가`);
      await Promise.all([loadPennySideData(), loadCommandData()]);
    } catch (e: any) {
      toast.error('추가 실패', { description: e.message });
    }
  };

  // ── Derived States ───────────────────────────────────────────────────
  // Command Tab
  const strongTickers = useMemo(() => 
    Object.keys(pulseMap).filter(t => pulseMap[t].strength === 'STRONG'),
    [pulseMap]
  );

  const normalTickers = useMemo(() => 
    Object.keys(pulseMap).filter(t => pulseMap[t].strength === 'NORMAL' && pulseMap[t].signal === 'BUY'),
    [pulseMap]
  );

  const filteredDiscovery = useMemo(() => {
    const watchlistTickers = new Set(watchlistItems.map(i => i.ticker));
    return (discoveryStocks || [])
      .filter(s => !watchlistTickers.has(s.ticker) && (s.dna_score || 0) >= 80)
      .slice(0, 5);
  }, [discoveryStocks, watchlistItems]);

  // Scanner Tab
  const scannerSectors = useMemo(() => ['All', ...new Set(scannerStocks.map(s => s.sector))], [scannerStocks]);

  const processedScannerStocks = useMemo(() => {
    return scannerStocks
      .filter(stock => {
        const matchesSearch = stock.ticker.toLowerCase().includes(scannerSearchTerm.toLowerCase()) ||
          stock.name.toLowerCase().includes(scannerSearchTerm.toLowerCase());
        const matchesDna = stock.dnaScore >= minDna;
        const matchesSector = selectedSector === 'All' || stock.sector === selectedSector;
        const matchesRisk = selectedRisk === 'All' ||
          (selectedRisk === 'Low' && stock.dnaScore < 40) ||
          (selectedRisk === 'Medium' && stock.dnaScore >= 40 && stock.dnaScore < 70) ||
          (selectedRisk === 'High' && stock.dnaScore >= 70);

        return matchesSearch && matchesDna && matchesSector && matchesRisk;
      })
      .sort((a, b) => {
        let valA = sortBy === 'dna' ? a.dnaScore : sortBy === 'price' ? a.price : a.changePercent;
        let valB = sortBy === 'dna' ? b.dnaScore : sortBy === 'price' ? b.price : b.changePercent;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [scannerStocks, scannerSearchTerm, minDna, selectedSector, selectedRisk, sortBy, sortOrder]);

  const toggleScannerSort = (field: 'dna' | 'price' | 'change') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Penny Sandbox Tab
  const pennyWatchlist = pennyWatchlistItems;

  const pennyTotalPnl = pennyPositions.reduce(
    (sum: number, p: any) => sum + (p.unrealized_pl ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Terminal Grid Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Ambient Glows */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-1/2 right-0 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 w-[800px] h-[400px] bg-blue-600/10 blur-[120px] rounded-full -translate-x-1/2 pointer-events-none" />

      {/* Global Refresh Indicator (Syncing mode) */}
      {loading && activeTab === 'command' && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-[#0b101a]/90 backdrop-blur-xl px-4 py-2 rounded-xl border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)] animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          <span className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em]">Synchronizing Nexus...</span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 relative z-10">
        {/* ════════ HEADER ════════ */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-slate-800/50 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Integrated Intelligence Nexus</span>
            </div>
            <h1 className="text-4xl font-black text-white flex items-center gap-4 tracking-tighter">
              {activeTab === 'command' && <Zap className="w-10 h-10 text-indigo-500 fill-indigo-500/20" />}
              {activeTab === 'scanner' && <Search className="w-10 h-10 text-indigo-500" />}
              {activeTab === 'penny' && <Coins className="w-10 h-10 text-cyan-500 fill-cyan-500/20" />}
              
              {activeTab === 'command' && "Alpha Discovery Terminal"}
              {activeTab === 'scanner' && "Quantum Asset Explorer"}
              {activeTab === 'penny' && "$1 Penny Quant Sandbox"}
            </h1>
            <p className="text-sm text-slate-500 mt-2 font-medium">
              {activeTab === 'command' && "실시간 시장 지표 펄스 감시, 오늘의 알파 종목 발굴 및 가상 투자 운용"}
              {activeTab === 'scanner' && "DNA 점수 및 다차원 정량 필터링 기반 시장 주도주 리서치 스캐너"}
              {activeTab === 'penny' && "초소형 페니 주식 리밸런싱, 2단계 익절 및 타이트 손절선 매매 자동 검증"}
            </p>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Global Market Status</span>
              <div className={`flex items-center gap-3 px-4 py-1.5 rounded-full border shadow-[0_0_15px_rgba(16,185,129,0.1)] ${isMarketOpen ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800/40 border-slate-700/40'}`}>
                <div className={`w-2 h-2 rounded-full ${isMarketOpen ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-slate-600'}`} />
                <span className={`text-xs font-black uppercase tracking-widest leading-none ${isMarketOpen ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {isMarketOpen ? 'Market Open' : 'Market Closed'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-3 px-6 py-3 bg-indigo-900/10 border border-indigo-500/30 rounded-2xl hover:bg-indigo-900/20 transition-all shadow-[0_0_20px_rgba(99,102,241,0.1)] group/guard"
            >
              <ShieldCheck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">NexGuard Locked</span>
            </button>
          </div>
        </div>

        {/* ════════ SUB-TAB NAVIGATION ════════ */}
        <div className="flex items-center gap-3 bg-[#0b101a]/50 p-2 rounded-2xl border border-slate-800/80 w-fit backdrop-blur-xl">
          {[
            { id: 'command', label: '지휘 통제실', icon: LayoutDashboard, desc: '실시간 관제 및 일반 계좌 운용' },
            { id: 'scanner', label: '퀀트 스캐너', icon: Search, desc: '전체 종목 다차원 필터링 및 검색' },
            { id: 'penny', label: '페니 샌드박스', icon: Coins, desc: '$1 이하 동전주 자동매매 실험실' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSearchParams({ tab: tab.id })}
                className={clsx(
                  "flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 group/tab",
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.15)] font-black text-xs uppercase tracking-wider"
                    : "text-slate-500 hover:text-slate-300 border border-transparent font-bold text-xs uppercase tracking-wider"
                )}
                title={tab.desc}
              >
                <tab.icon className={clsx("w-4 h-4 transition-transform group-hover/tab:scale-110", isActive ? "text-indigo-400" : "text-slate-500")} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ════════ TAB CONTENT ════════ */}
        <AnimatePresence mode="wait">
          {activeTab === 'command' && (
            <motion.div key="command-tab" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-10">
              {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-8">
                      <div className="h-[400px] bg-[#0b101a]/40 rounded-[2.5rem] border border-slate-800 animate-pulse" />
                      <div className="h-[300px] bg-[#0b101a]/40 rounded-[2.5rem] border border-slate-800 animate-pulse" />
                  </div>
                  <div className="lg:col-span-4">
                      <div className="h-[700px] bg-[#0b101a]/40 rounded-[2.5rem] border border-slate-800 animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-10">
                  {/* TOP ROW: Alpha Discovery (Full Width) */}
                  <div className="relative z-10">
                    <AlphaDiscoverySection 
                      filteredDiscovery={filteredDiscovery} 
                      handleDeepDive={handleDeepDive} 
                      lastFetchedTime={lastFetchedTime}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start relative z-10">
                    {/* LEFT COLUMN: Strategic Signal Matrix (8/12) */}
                    <div className="lg:col-span-8 space-y-10">
                      <StrategicSignalMatrix
                        strongTickers={strongTickers}
                        normalTickers={normalTickers}
                        pulseMap={pulseMap}
                        handleDeepDive={handleDeepDive}
                      />

                      {/* Integrated Command Center (Live Execution) */}
                      <div className="mt-10">
                        <LiveExecutionCenter />
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Monitoring Orbit & Stats (4/12) */}
                    <div className="lg:col-span-4 space-y-8">
                      <PerformanceSummary stats={strategyStats} />
                      
                      <MonitoringOrbit 
                        watchlistItems={watchlistItems} 
                        watchlistStocks={watchlistStocks} 
                        pulseMap={pulseMap}
                        handleDeepDive={handleDeepDive} 
                      />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'scanner' && (
            <motion.div key="scanner-tab" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-8">
              <ScannerControls 
                searchTerm={scannerSearchTerm}
                onSearchChange={setScannerSearchTerm}
                minDna={minDna}
                onMinDnaToggle={() => setMinDna(minDna === 70 ? 0 : 70)}
                isHistorical={isHistorical}
                onHistoricalToggle={() => setIsHistorical(!isHistorical)}
                selectedRisk={selectedRisk}
                onRiskChange={setSelectedRisk}
                selectedSector={selectedSector}
                onSectorChange={setSelectedSector}
                sectors={scannerSectors}
                viewMode={scannerViewMode}
                onViewModeChange={setScannerViewMode}
              />

              {scannerLoading ? (
                <div className="flex flex-col items-center justify-center py-40 space-y-8">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-400 animate-pulse" />
                  </div>
                  <p className="text-slate-400 font-black text-xs tracking-[0.3em] uppercase animate-pulse">Filtering Market Signal Matrix...</p>
                </div>
              ) : processedScannerStocks.length === 0 ? (
                <div className="text-center py-40 bg-[#0b101a]/40 rounded-[2rem] border border-dashed border-slate-800 shadow-2xl backdrop-blur-sm">
                  <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800">
                     <Search className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-400 font-bold text-lg mb-4">No results matched your search matrix.</p>
                  <button onClick={() => { setScannerSearchTerm(''); setMinDna(0); setSelectedRisk('All'); setSelectedSector('All'); }} className="text-indigo-400 font-black uppercase text-xs hover:text-indigo-300 tracking-widest transition-colors py-2 px-4 bg-indigo-500/10 rounded-lg border border-indigo-500/20">Reset Core Filters</button>
                </div>
              ) : (
                <>
                  <ScannerTopFive stocks={scannerStocks} onDeepDive={handleDeepDive} />
                  <div className="h-4" />
                  <ScannerAssetList 
                    viewMode={scannerViewMode}
                    stocks={processedScannerStocks}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleScannerSort}
                    onDeepDive={handleDeepDive}
                  />
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'penny' && (
            <motion.div key="penny-tab" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-8">
              {/* Account & Scan pill */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-[#0b101a]/40 border border-slate-800/50 p-6 rounded-2xl">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1">페니 랩 상태 제어</h3>
                  <p className="text-xs text-slate-500">1달러 이하 페니 주식 리밸런싱 및 가상 지갑 정보</p>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {pennyAccount && (
                    <div className="flex items-center gap-4 px-5 py-3 bg-[#0b101a]/60 border border-slate-800/60 rounded-2xl">
                      <div className="text-right">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cash</div>
                        <div className="text-sm font-black text-white tabular-nums">${(pennyAccount.cash_available ?? 0).toLocaleString()}</div>
                      </div>
                      <div className="w-px h-8 bg-slate-800" />
                      <div className="text-right">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">P&L</div>
                        <div className={clsx("text-sm font-black tabular-nums", pennyTotalPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {pennyTotalPnl >= 0 ? '+' : ''}${pennyTotalPnl.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handlePennyScan}
                    disabled={pennyScanning}
                    className={clsx(
                      "flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm transition-all duration-300 border shadow-2xl active:scale-95",
                      pennyScanning
                        ? "bg-slate-800 text-slate-400 border-slate-700 cursor-wait"
                        : "bg-gradient-to-r from-cyan-600 to-emerald-600 text-white border-cyan-400/30 shadow-[0_0_40px_rgba(34,211,238,0.3)] hover:shadow-[0_0_60px_rgba(34,211,238,0.5)]"
                    )}
                  >
                    <RefreshCw className={clsx("w-5 h-5", pennyScanning && "animate-spin")} />
                    {pennyScanning ? '스캔 중...' : '퀀트 스캔 시작'}
                  </button>
                </div>
              </div>

              {/* Parameters strip */}
              {pennyScanData?.penny_params && (
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: 'TS', value: `-${pennyScanData.penny_params.trailing_stop_pct}%`, tip: 'Trailing Stop' },
                    { label: 'Breakeven', value: `+${pennyScanData.penny_params.breakeven_trigger_pct}%`, tip: '본전 락인 조건' },
                    { label: 'Scale-Out', value: `RSI>${pennyScanData.penny_params.scale_out_rsi}`, tip: '1차 매도' },
                    { label: 'Profit Exit', value: `+${pennyScanData.penny_params.scale_out_profit_pct}%`, tip: '1차 익절 기준' },
                    { label: 'Tight TS', value: `-${pennyScanData.penny_params.tight_ts_pct}%`, tip: '2차 추종 TS' },
                    { label: 'RVOL', value: `>${pennyScanData.penny_params.rvol_min}x`, tip: '최소 거래량' },
                    { label: 'Data', value: pennyScanData.penny_params.data_lookback, tip: '분석 기간' },
                  ].map((param) => (
                    <div
                      key={param.label}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#0b101a]/60 border border-slate-800/60 rounded-xl"
                      title={param.tip}
                    >
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{param.label}</span>
                      <span className="text-[10px] font-black text-cyan-400 tabular-nums">{param.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sub sections inside penny */}
              <div className="flex items-center gap-2 bg-[#0b101a]/40 p-1.5 rounded-2xl border border-slate-800/60 w-fit">
                {[
                  { id: 'scan' as const, label: '퀀트 스캔 결과', icon: Scan, count: pennyScanData?.total_scanned },
                  { id: 'watchlist' as const, label: '관심 종목', icon: Star, count: pennyWatchlist.length },
                  { id: 'positions' as const, label: '가상 포지션', icon: BarChart3, count: pennyPositions.length },
                  { id: 'history' as const, label: '매매 이력', icon: Clock, count: pennyHistory.length },
                ].map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => setPennyActiveSection(sec.id)}
                    className={clsx(
                      "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all",
                      pennyActiveSection === sec.id
                        ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                        : "text-slate-500 hover:text-slate-300 border border-transparent"
                    )}
                  >
                    <sec.icon className="w-3.5 h-3.5" />
                    {sec.label}
                    {sec.count != null && sec.count > 0 && (
                      <span className={clsx(
                        "text-[8px] px-1.5 py-0.5 rounded-md font-black",
                        pennyActiveSection === sec.id ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-500"
                      )}>
                        {sec.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Penny Tab Section Content */}
              <div className="mt-4">
                {pennyActiveSection === 'scan' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    {!pennyScanData ? (
                      <div className="bg-[#0b101a]/40 border border-slate-800/60 rounded-[2.5rem] p-16 flex flex-col items-center justify-center gap-6">
                        <div className="w-20 h-20 bg-cyan-500/5 border border-cyan-500/20 rounded-3xl flex items-center justify-center">
                          <Scan className="w-10 h-10 text-cyan-500/40" />
                        </div>
                        <div className="text-center">
                          <h3 className="text-lg font-black text-white mb-2">페니 스캔을 실행하세요</h3>
                          <p className="text-sm text-slate-500 max-w-md">
                            1달러 이하 종목들의 기술적 정량 지표를 일봉 기준으로 역산하여 DNA 퀀트 스코어를 판별하고 Top 3 종목을 자동 Watchlist에 동기화합니다.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {pennyScanData.results.slice(0, 20).map((stock) => (
                          <PennyStockCard
                            key={stock.ticker}
                            stock={stock}
                            onAddToWatchlist={handlePennyAddWatchlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {pennyActiveSection === 'watchlist' && (
                  <div className="bg-[#0b101a]/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
                      <Star className="w-5 h-5 text-cyan-400 fill-cyan-400/20" />
                      <span className="text-xs font-black text-white uppercase tracking-[0.2em]">관심 종목 현황</span>
                      <span className="text-[10px] font-bold text-slate-500 ml-auto">
                        {pennyWatchlist.length}개 종목 추적 중
                      </span>
                    </div>
                    <div className="divide-y divide-slate-800/40">
                      {pennyLoadingData ? (
                        <div className="p-12 text-center">
                          <Activity className="w-6 h-6 text-slate-600 animate-pulse mx-auto mb-3" />
                          <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Loading...</span>
                        </div>
                      ) : pennyWatchlistItems.length === 0 ? (
                        <div className="p-12 text-center text-slate-600">
                          <Star className="w-8 h-8 mx-auto mb-3 opacity-30" />
                          <p className="text-[10px] font-black uppercase tracking-widest">등록된 관심 종목이 없습니다</p>
                        </div>
                      ) : (
                        pennyWatchlistItems.map((item) => {
                          const scanMatch = pennyScanData?.results.find((r) => r.ticker === item.ticker);
                          return (
                            <div key={item.ticker} className="p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                              <div className="flex items-center gap-4">
                                <div className={clsx(
                                  "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border",
                                  item.status === 'HOLDING' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                  item.status === 'EXITED' ? "bg-slate-800/60 border-slate-700/40 text-slate-500" :
                                  "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                                )}>
                                  {item.ticker.charAt(0)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-base font-black text-white">{item.ticker}</span>
                                    <span className={clsx(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border",
                                      item.status === 'WATCHING' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                                      item.status === 'HOLDING' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                      "bg-slate-800 text-slate-500 border-slate-700"
                                    )}>
                                      {item.status}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-bold mt-0.5 flex gap-3">
                                    {item.buyPrice && <span>진입: ${item.buyPrice.toFixed(4)}</span>}
                                    {item.stopLoss && <span>손절: ${item.stopLoss.toFixed(4)}</span>}
                                    {item.initialDnaScore && <span>DNA: {item.initialDnaScore}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                {scanMatch && (
                                  <div className="w-32">
                                    <PennyQuantScoreBar score={scanMatch.dna_score} size="sm" />
                                  </div>
                                )}
                                <span className="text-[9px] text-slate-600 font-bold">
                                  {new Date(item.addedAt).toLocaleDateString('ko-KR')}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {pennyActiveSection === 'positions' && (
                  <div className="bg-[#0b101a]/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
                      <BarChart3 className="w-5 h-5 text-emerald-400" />
                      <span className="text-xs font-black text-white uppercase tracking-[0.2em]">가상 매수 포지션</span>
                    </div>

                    <div className="divide-y divide-slate-800/40">
                      {pennyPositions.length === 0 ? (
                        <div className="p-12 text-center text-slate-600">
                          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                          <p className="text-[10px] font-black uppercase tracking-widest">보유 포지션이 없습니다</p>
                        </div>
                      ) : (
                        pennyPositions.map((pos: any) => {
                          const pnlPct = pos.unrealized_plpc ?? 0;
                          const pnlAmt = pos.unrealized_pl ?? 0;
                          const isProfit = pnlPct >= 0;

                          return (
                            <div key={pos.ticker} className="p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                              <div className="flex items-center gap-4">
                                <div className={clsx(
                                  "w-12 h-12 rounded-xl flex items-center justify-center font-black border",
                                  isProfit ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                )}>
                                  {pos.ticker?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-white">{pos.ticker}</span>
                                    <span className={clsx(
                                      "text-[10px] font-black px-2 py-0.5 rounded",
                                      isProfit ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                    )}>
                                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                                    </span>
                                    <span className="text-[8px] font-black bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded uppercase">
                                      {pos.status || 'HOLD'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-bold mt-0.5 flex gap-3">
                                    <span>진입: ${Number(pos.entry_price).toFixed(4)}</span>
                                    <span>현재: ${Number(pos.current_price).toFixed(4)}</span>
                                    <span>수량: {Number(pos.units).toFixed(2)}</span>
                                    {pos.ts_threshold && <span>TS: ${Number(pos.ts_threshold).toFixed(4)}</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right mr-4">
                                  <div className={clsx("text-sm font-black tabular-nums", isProfit ? "text-emerald-400" : "text-rose-400")}>
                                    {pnlAmt >= 0 ? '+' : ''}${pnlAmt.toFixed(2)}
                                  </div>
                                  <div className="text-[9px] text-slate-600 font-bold">P&L</div>
                                </div>
                                <button
                                  onClick={() => handlePennySell(pos.ticker)}
                                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-[10px] font-black rounded-xl border border-rose-500/20 transition-all uppercase tracking-widest opacity-0 group-hover:opacity-100"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {pennyActiveSection === 'history' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="bg-[#0b101a]/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] overflow-hidden">
                      <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
                        <Clock className="w-5 h-5 text-slate-400" />
                        <span className="text-xs font-black text-white uppercase tracking-[0.2em]">매매 이력</span>
                        <span className="text-[10px] font-bold text-slate-500 ml-auto">{pennyHistory.length}건</span>
                      </div>

                      <div className="divide-y divide-slate-800/40">
                        {pennyHistory.length === 0 ? (
                          <div className="p-12 text-center text-slate-600">
                            <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
                            <p className="text-[10px] font-black uppercase tracking-widest">매매 이력이 없습니다</p>
                          </div>
                        ) : (
                          pennyHistory.map((trade: any, idx: number) => {
                            const isProfit = (trade.pnl_pct ?? 0) >= 0;
                            return (
                              <div key={trade.id || idx} className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className={clsx(
                                    "w-10 h-10 rounded-xl flex items-center justify-center border",
                                    isProfit ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
                                  )}>
                                    {isProfit ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-base font-black text-white">{trade.ticker}</span>
                                      <span className={clsx(
                                        "text-[10px] font-black px-2 py-0.5 rounded",
                                        isProfit ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                      )}>
                                        {(trade.pnl_pct ?? 0) >= 0 ? '+' : ''}{Number(trade.pnl_pct ?? 0).toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-bold mt-0.5 flex gap-3">
                                      <span>진입: ${Number(trade.entry_price ?? 0).toFixed(4)}</span>
                                      <span>청산: ${Number(trade.exit_price ?? 0).toFixed(4)}</span>
                                      <span className="text-slate-600">{trade.exit_reason || 'N/A'}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={clsx("text-sm font-black tabular-nums", isProfit ? "text-emerald-400" : "text-rose-400")}>
                                    {(trade.profit_amt ?? 0) >= 0 ? '+' : ''}${Number(trade.profit_amt ?? 0).toFixed(2)}
                                  </div>
                                  <div className="text-[9px] text-slate-600">
                                    {trade.created_at ? new Date(trade.created_at).toLocaleDateString('ko-KR') : '--'}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Exit strategy summary */}
                    <div className="bg-[#0b101a]/40 border border-slate-800/60 rounded-2xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">매도 전략 수식</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#020617]/60 border border-emerald-500/10 rounded-xl p-4">
                          <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">1차 매도 (Scale-Out 50%)</div>
                          <div className="text-xs text-slate-400 font-medium space-y-1">
                            <p>• 수익률 +20% 달성 <span className="text-slate-600">OR</span> RSI {'>'} 70</p>
                            <p>• 보유 물량 50% 시장가 즉시 익절</p>
                            <p>• Trailing Stop → 진입가(본전)로 락인</p>
                          </div>
                        </div>
                        <div className="bg-[#020617]/60 border border-cyan-500/10 rounded-xl p-4">
                          <div className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-2">2차 매도 (Trailing Stop -7%)</div>
                          <div className="text-xs text-slate-400 font-medium space-y-1">
                            <p>• 잔여 50% 물량 → -7% 타이트 TS</p>
                            <p>• 잔여 랠리를 끝까지 추종(Ride)</p>
                            <p>• TS 발동 시 전량 청산</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Slideout Backdrop */}
        {isSettingsOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            onClick={() => setIsSettingsOpen(false)}
          />
        )}

        {/* Settings Slideout Panel */}
        <div className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[#0b101a] border-l border-slate-800 z-[210] overflow-y-auto transition-transform duration-300 ease-in-out ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 sticky top-0 bg-[#0b101a] z-10">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-black text-white uppercase tracking-[0.2em]">NexGuard Control</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <div className="p-6">
            <CommandSettings />
          </div>
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
               const buyPrice = terminalData.price;
               const { targetPrice, stopPrice } = calculateDNATargets(
                 buyPrice, 
                 buyPrice,
                 buyPrice,
                 terminalData.quantData?.atr5
               );
               
               await addToWatchlist(
                 terminalData.ticker, 
                 undefined, 
                 'WATCHING', 
                 buyPrice,
                 targetPrice,
                 stopPrice,
                 terminalData.dnaScore
               );
               toast.success(`${terminalData.ticker} — 관심 종목에 추가되었습니다`, {
                 description: `DNA Score: ${terminalData.dnaScore}점`,
                 duration: 3000,
               });
               if (activeTab === 'command') {
                 loadCommandData();
               } else if (activeTab === 'penny') {
                 loadPennySideData();
               }
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
