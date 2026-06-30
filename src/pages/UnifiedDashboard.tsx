/**
 * UnifiedDashboard.tsx — Unified Command Center (Refactored)
 *
 * 리팩토링 전: 1,301줄의 God Component
 * 리팩토링 후: ~250줄의 순수 뷰 컴포넌트
 *
 * 모든 비즈니스 로직 → useDashboardData() 커스텀 훅
 * 모든 전역 상태     → useTradingStore (Zustand)
 * 상단 헤더 컨트롤   → HeaderCommandBar
 * KPI 메트릭 그리드  → MetricsGrid
 */

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
  X,
  Activity,
  CheckCircle,
  XCircle,
  BarChart3,
  Clock,
  TrendingUp,
  TrendingDown,
  Plus,
  Loader2,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';

// Hooks & Store
import { useDashboardData } from '../hooks/useDashboardData';

// Components
import { HeaderCommandBar } from '../components/dashboard/HeaderCommandBar';
import { MetricsGrid } from '../components/dashboard/MetricsGrid';
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { PennyQuantScoreBar } from '../components/penny/PennyQuantScoreBar';
import { RiskAnalyticsPanel } from '../components/dashboard/RiskAnalyticsPanel';
import { PositionAnalyticsPanel } from '../components/dashboard/PositionAnalyticsPanel';
import { BacktestPanel } from '../components/dashboard/BacktestPanel';

import { addToWatchlist } from '../services/watchlistService';

// Constants
const PENNY_ENGINE_THRESHOLD = 1.0;

// ─── Chart Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { name: string } }[];
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border border-slate-200 leading-none text-slate-800">
        <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
          {payload[0].payload.name}
        </p>
        <p className="text-lg font-black text-slate-900 tabular-nums">
          $
          {Number(payload[0].value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>
    );
  }
  return null;
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const UnifiedDashboard = () => {
  const {
    loading,
    isArmed,
    isMarketOpen,
    isSettingsOpen,
    lastFetchedTime,
    discoveryStocks,
    livePositions,
    liveHistory,
    pennyScanStatus,
    edgeAlert,
    terminalData,
    chartRange,
    addingTickers,
    displayedAccount,
    displayedWinRate,
    displayedTotalTrades,
    watchlistedTickers,
    totalPnl,
    investedCapital,
    concentrationPct,
    chartData,
    setIsSettingsOpen,
    setChartRange,
    setTerminalData,
    setEdgeAlert,
    loadDashboardData,
    handleDeepDive,
    handleLiveHuntingTrigger,
    handleToggleArm,
    handleClosePosition,
    handleAddDiscoveryToWatchlist,
    isHunting,
    navigate,
  } = useDashboardData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 relative overflow-hidden pb-12 font-sans">
      {/* Decorative Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Loading Indicator */}
      {loading && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-white px-4 py-2.5 border-l-2 border-slate-600 animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-slate-700 rounded-full animate-pulse shadow-[0_0_8px_rgba(71,85,105,0.6)]" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-[0.2em] font-mono">
            Synchronizing Command Data...
          </span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 relative z-10">
        {/* ════════ HEADER ════════ */}
        <HeaderCommandBar
          isMarketOpen={isMarketOpen}
          isArmed={isArmed}
          pennyScanStatus={pennyScanStatus}
          onToggleArm={handleToggleArm}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* SYSTEM STATUS INFO BAR */}
        <div className="bg-slate-50 py-5 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-slate-900">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 animate-pulse shadow-[0_0_8px_rgba(71,85,105,0.5)] shrink-0" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-900 border-b border-slate-900 pb-0.5 font-sans">
              시스템 가이드
            </span>
            <span className="text-slate-800 text-[13px] font-semibold font-sans">
              {isArmed
                ? '자동 매매 활성(ARMED) 모드입니다. 관심 종목 중 퀀트 매수 지표 조건 충족 시 실시간 자동 매수가 구동됩니다.'
                : '현재 안전 관제(SAFE) 모드입니다. 실시간 탐색 및 알림은 유지되나 가상 주문은 실행되지 않습니다.'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-550 md:text-right shrink-0 font-sans">
            * $100 이하 전 종목 스캔 · 진입가 $1 이하 자동 페니 파라미터 (-10% TS) · $1 초과 일반 파라미터
            (-5% TS)
          </div>
        </div>

        {/* ════════ EDGE MONITOR ALERT ════════ */}
        {edgeAlert.active && edgeAlert.message && (
          <div className="flex items-start gap-3 bg-amber-50 border-l-4 border-amber-400 px-5 py-4 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <Activity className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-1 font-mono">
                알고리즘 Edge 이상 감지
              </p>
              <p className="text-sm text-amber-700 leading-relaxed font-medium">
                {edgeAlert.message}
              </p>
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
        <MetricsGrid
          displayedAccount={displayedAccount}
          totalPnl={totalPnl}
          displayedPositions={livePositions}
          displayedWinRate={displayedWinRate}
          displayedTotalTrades={displayedTotalTrades}
          concentrationPct={concentrationPct}
          investedCapital={investedCapital}
          hasTradeData={liveHistory.length > 0}
        />

        {/* ════════ MAIN SECTION ════════ */}
        <div className="space-y-6">
          <div className="space-y-6">
            {/* A. PERFORMANCE GROWTH CHART */}
            <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block mb-0.5">
                    Asset & Profit Metrics
                  </span>
                  <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">
                    포트폴리오 자산 성장 및 누적 손익 곡선
                  </h2>
                  <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">
                    실시간 청산 완료된 거래 내역에 기반한 가상 자산의 누적 성장 흐름을 시각화합니다.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    {(['7d', '30d', 'all'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={clsx(
                          'px-3 py-1 text-sm font-bold rounded-md transition-all',
                          chartRange === r
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-800 hover:text-slate-800',
                        )}
                      >
                        {r === '7d' ? '7일' : r === '30d' ? '30일' : '전체'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 bg-indigo-500 rounded" /> 자산
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-0.5 bg-amber-400 rounded"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(90deg,#f59e0b 0,#f59e0b 4px,transparent 4px,transparent 6px)',
                        }}
                      />{' '}
                      MA5
                    </span>
                    <span className="font-mono text-xs text-slate-800">{lastFetchedTime}</span>
                  </div>
                </div>
              </div>

              <div className="h-48 sm:h-72 w-full">
                {chartData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 border border-dashed border-slate-200">
                    <BarChart3 className="w-8 h-8 text-indigo-500 drop-shadow-[0_0_12px_rgba(79,70,229,0.4)] stroke-[2.5]" />
                    <p className="text-sm font-extrabold text-slate-800 font-sans">
                      청산 이력이 없습니다
                    </p>
                    <p className="text-xs font-semibold text-slate-800 font-sans">
                      매매가 완료되면 누적 손익 곡선이 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        dy={8}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        domain={['dataMin - 1000', 'dataMax + 1000']}
                        tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#6366f1"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                      />
                      <Line
                        type="monotone"
                        dataKey="ma"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* B. TODAY QUANT DISCOVERIES */}
            <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block mb-0.5">
                    Top Quantitative Picks
                  </span>
                  <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">
                    퀀트 엔진 추천 & 오늘의 알파 종목
                  </h2>
                  <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">
                    수학적 기술 지표 분석으로 엄선된 매수 후보 종목입니다. 클릭 시 상세
                    지표(RSI/ADX/RVOL)가 노출됩니다.
                  </p>
                </div>
                <span className="text-xs font-black text-indigo-700 border-b-2 border-indigo-500 pb-0.5 shrink-0 self-start sm:self-auto font-sans">
                  DNA 70점 이상 엄선
                </span>
              </div>

              {discoveryStocks.length === 0 ? (
                <div className="text-center py-12 text-slate-800 border border-dashed border-slate-200">
                  <Activity className="w-8 h-8 text-indigo-500 mx-auto mb-3 animate-pulse drop-shadow-[0_0_12px_rgba(79,70,229,0.5)] stroke-[2.5]" />
                  <p className="text-sm font-extrabold text-slate-800 font-sans">
                    발굴된 오늘의 추천 종목이 없습니다.
                  </p>
                  <p className="text-xs font-semibold text-slate-800 mt-1 font-sans">
                    우측 설정 패널에서 "AI 퀀트 헌팅"을 가동해 보세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {discoveryStocks.map((stock) => {
                    const isPenny =
                      (stock.price ?? 0) <= PENNY_ENGINE_THRESHOLD && (stock.price ?? 0) > 0;
                    return (
                      <div
                        key={stock.ticker}
                        onClick={() => handleDeepDive(stock)}
                        className="py-4 px-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={clsx(
                              'w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border',
                              isPenny
                                ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-700'
                                : 'bg-slate-500/10 border-indigo-500/20 text-slate-800',
                            )}
                          >
                            {stock.ticker}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 group-hover:text-slate-800 transition-colors">
                                {stock.ticker}
                              </span>
                              <span
                                className={clsx(
                                  'text-xs font-black px-1.5 py-0.5 rounded tracking-widest border leading-none',
                                  isPenny
                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-700'
                                    : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700',
                                )}
                              >
                                <span className="font-extrabold">{isPenny ? '$1↓' : '$1↑'}</span>
                              </span>
                            </div>
                            <span className="text-xs text-slate-800 font-bold block mt-0.5">
                              {stock.sector || 'US Stock'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-base font-extrabold text-slate-900 tabular-nums">
                              $
                              {stock.price != null
                                ? stock.price.toFixed(isPenny ? 4 : 2)
                                : '--'}
                            </span>
                            <span
                              className={clsx(
                                'text-xs font-black block mt-0.5 tabular-nums',
                                (stock.change_percent ?? 0) >= 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-700',
                              )}
                            >
                              {(stock.change_percent ?? 0) >= 0 ? '+' : ''}
                              {(stock.change_percent ?? 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-12">
                            <PennyQuantScoreBar
                              score={stock.dna_score}
                              size="sm"
                              showLabel={false}
                            />
                          </div>
                          {/* DNA Simulator Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const params = new URLSearchParams({ ticker: stock.ticker });
                              if (stock.rsi != null)
                                params.set('rsi', String(Math.round(stock.rsi)));
                              if (stock.rvol != null)
                                params.set('rvol', String(stock.rvol.toFixed(1)));
                              if (stock.adx != null)
                                params.set('adx', String(Math.round(stock.adx)));
                              if (stock.macdDiff != null)
                                params.set('macd', stock.macdDiff > 0 ? 'rising' : 'falling');
                              if (isPenny) params.set('penny', 'true');
                              if (stock.price != null)
                                params.set('entry', String(stock.price.toFixed(4)));
                              navigate(`/dna-simulator?${params.toString()}`);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-800 hover:text-indigo-500 transition-all shrink-0"
                            title="DNA 시뮬레이터로 분석"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                          </button>
                          {/* Watchlist Add Button */}
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
          <RiskAnalyticsPanel history={liveHistory} strategyStats={null} />
          <PositionAnalyticsPanel
            positions={livePositions}
            totalEquity={displayedAccount.total_assets}
          />
        </div>

        {/* ════════ POSITIONS & HISTORY ════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-8">
          {/* LEFT: Active Positions */}
          <div className="lg:col-span-2 bg-white border-t border-slate-200 pt-8 pb-12 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
              <div>
                <span className="text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest block mb-0.5">
                  Active Positions
                </span>
                <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">
                  현재 보유 중인 매수 포지션
                </h2>
                <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">
                  실시간 매수가 완료되어 Alpaca 실계좌에서 운용 중인 주식 자산입니다. 우측 청산 클릭
                  시 즉시 전량 매도됩니다.
                </p>
              </div>
              <span className="text-xs font-black text-emerald-700 border-b-2 border-emerald-500 pb-0.5 shrink-0 self-start sm:self-auto font-sans">
                {livePositions.length}개 보유 중
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
                    <th className="pb-3 text-right font-mono text-xs hidden md:table-cell">
                      Trailing Stop
                    </th>
                    <th className="pb-3 text-right font-mono text-xs">평가 손익 (P&L)</th>
                    <th className="pb-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {livePositions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-slate-800 font-extrabold text-sm"
                      >
                        보유중인 실계좌 매수 포지션이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    livePositions.map((pos) => {
                      const pnlPct = pos.unrealized_plpc;
                      const pnlAmt = pos.unrealized_pl;
                      const hasPnl = pnlAmt != null && !Number.isNaN(pnlAmt);
                      const isProfit = hasPnl ? pnlAmt >= 0 : true;
                      const decimals = pos.isPenny ? 4 : 2;
                      return (
                        <tr
                          key={pos.ticker}
                          className="hover:bg-slate-50/50 transition-colors text-xs font-bold"
                        >
                          <td className="py-4">
                            <span className="font-extrabold text-slate-900 text-base">
                              {pos.ticker}
                            </span>
                          </td>
                          <td className="py-4 text-right">
                            <span
                              className={clsx(
                                'text-xs font-black px-1.5 py-0.5 rounded border tracking-widest font-sans',
                                pos.isPenny
                                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : 'bg-indigo-50 border-indigo-200 text-indigo-700',
                              )}
                            >
                              {pos.isPenny ? '$1↓' : '$1↑'}
                            </span>
                          </td>
                          <td className="py-4 text-right font-mono text-slate-800 text-sm font-semibold tabular-nums hidden md:table-cell">
                            {Number(pos.units).toFixed(2)}
                          </td>
                          <td className="py-4 text-right font-mono text-slate-800 text-sm font-semibold tabular-nums">
                            ${Number(pos.entry_price).toFixed(decimals)}
                          </td>
                          <td className="py-4 text-right font-mono text-slate-900 text-sm font-bold tabular-nums">
                            {pos.current_price != null ? (
                              `$${Number(pos.current_price).toFixed(decimals)}`
                            ) : (
                              <span className="text-slate-800">—</span>
                            )}
                          </td>
                          <td className="py-4 text-right font-mono text-rose-500 text-sm font-semibold tabular-nums hidden md:table-cell">
                            {pos.ts_threshold
                              ? `$${Number(pos.ts_threshold).toFixed(decimals)}`
                              : 'N/A'}
                          </td>
                          <td
                            className={clsx(
                              'py-4 text-right font-mono tabular-nums text-base font-black',
                              hasPnl
                                ? isProfit
                                  ? 'text-emerald-500'
                                  : 'text-rose-500'
                                : 'text-slate-800',
                            )}
                          >
                            {hasPnl ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {isProfit ? (
                                  <TrendingUp className="w-3.5 h-3.5" />
                                ) : (
                                  <TrendingDown className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {isProfit ? '+' : ''}
                                  {(pnlAmt as number).toFixed(2)} ({isProfit ? '+' : ''}
                                  {(pnlPct as number).toFixed(2)}%)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-800 text-sm font-sans font-bold">
                                조회 불가
                              </span>
                            )}
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

          {/* RIGHT: Trade History */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
                  <h2 className="text-[15px] font-extrabold text-slate-900 font-sans">
                    최근 청산 이력
                  </h2>
                </div>
                <p className="text-[13px] font-semibold text-slate-800 mt-1 leading-relaxed font-sans">
                  실계좌에서 매도가 완료되어 최종 손익이 확정된 거래 내역입니다.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-800 font-sans">
                {liveHistory.length}건 기록
              </span>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {liveHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-800 border border-dashed border-slate-200 font-sans">
                  <Clock className="w-8 h-8 text-indigo-500 mx-auto mb-2 opacity-80 drop-shadow-[0_0_8px_rgba(79,70,229,0.4)] stroke-[2.5]" />
                  <p className="text-sm font-extrabold text-slate-800">
                    최근 종료된 실계좌 매매 기록이 없습니다.
                  </p>
                </div>
              ) : (
                liveHistory.slice(0, 15).map((trade, idx) => {
                  const isProfit = (trade.pnl_pct ?? 0) >= 0;
                  const isPenny = Number(trade.entry_price || 0) <= 1.0;
                  return (
                    <div
                      key={trade.id || idx}
                      className="group py-4 border-b border-slate-100 last:border-none flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">
                          {isProfit ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-base leading-none">
                              {trade.ticker}
                            </span>
                            <span
                              className={clsx(
                                'text-xs font-black px-1.5 py-0.5 rounded border leading-none',
                                isProfit
                                  ? 'bg-emerald-550 border-emerald-200 text-emerald-600'
                                  : 'bg-rose-50 border-rose-200 text-rose-600',
                              )}
                            >
                              {(trade.pnl_pct ?? 0) >= 0 ? '+' : ''}
                              {Number(trade.pnl_pct ?? 0).toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-xs text-slate-800 font-medium block mt-1.5 hidden sm:block">
                            진입: ${Number(trade.entry_price || 0).toFixed(isPenny ? 4 : 2)} ➔ 청산: $
                            {Number(trade.exit_price || 0).toFixed(isPenny ? 4 : 2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span
                            className={clsx(
                              'text-base font-black tabular-nums block',
                              isProfit ? 'text-emerald-500' : 'text-rose-500',
                            )}
                          >
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
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-white border-l border-slate-200 z-[210] overflow-y-auto transition-transform duration-300 ease-in-out ${
          isSettingsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
            <span className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">
              NexGuard Control
            </span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 hover:text-slate-800 border border-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          {/* AI Quant Hunting */}
          <div className="bg-slate-50/50 border border-indigo-100 rounded-2xl p-4 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-widest block mb-0.5">
                Manual Override
              </span>
              <h3 className="text-sm font-black text-indigo-900">
                AI 퀀트 헌팅 (Edge Function)
              </h3>
              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                Alpaca Universe 전체를 즉시 스캔합니다.
                <br />
                DNA ≥ 80 일반 종목 발굴 → daily_discovery 갱신
              </p>
            </div>
            <button
              onClick={handleLiveHuntingTrigger}
              disabled={isHunting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all active:scale-95 disabled:bg-slate-350 disabled:cursor-not-allowed cursor-pointer"
            >
              <Activity className={clsx('w-4 h-4', isHunting && 'animate-pulse')} />
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
                terminalData.dnaScore,
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
