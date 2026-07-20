/**
 * UnifiedDashboard.tsx — Unified Command Center (Modern Elegant FinTech)
 * 3-Column Bento Box Layout for maximum data density & tactical operations.
 */

import clsx from 'clsx';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart
} from 'recharts';
import {
  Activity, Clock,
  LayoutGrid, TestTube, Play, X, Settings
} from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { BacktestPanel } from '../components/dashboard/BacktestPanel';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { TensionGauge } from '../components/dashboard/TensionGauge';
import { PositionHealthBar } from '../components/dashboard/PositionHealthBar';
import { DashboardControls } from '../components/dashboard/HeaderCommandBar';
import { MetricsGrid } from '../components/dashboard/MetricsGrid';
import { RiskAnalyticsPanel } from '../components/dashboard/RiskAnalyticsPanel';
import { PositionAnalyticsPanel } from '../components/dashboard/PositionAnalyticsPanel';
import { CompanyInfoModal } from '../components/dashboard/CompanyInfoModal';
import type { CompanyInfo } from '../components/dashboard/CompanyInfoModal';
import { apiClient } from '../services/apiClient';
import type { PaperPosition, PaperHistory } from '../types/dashboard';
import { useState } from 'react';

const PENNY_ENGINE_THRESHOLD = 1.0;


export default function UnifiedDashboard() {
  const {
    loading, connectionError, isArmed, isSettingsOpen, lastFetchedTime, discoveryStocks,
    livePositions, liveHistory, slicedHistory, slicedPortfolioHistory, pennyScanStatus, edgeAlert, terminalData, chartRange,
    displayedAccount, displayedWinRate, displayedTotalTrades, totalPnl, investedCapital,
    concentrationPct, chartData, setIsSettingsOpen, setChartRange, setTerminalData,
    setEdgeAlert, handleDeepDive, handleLiveHuntingTrigger, handleToggleArm, handleClosePosition,
    isHunting,
  } = useDashboardData();

  const [selectedCompanyTicker, setSelectedCompanyTicker] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isCompanyLoading, setIsCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const handleCompanyClick = async (ticker: string) => {
    setSelectedCompanyTicker(ticker);
    setIsCompanyLoading(true);
    setCompanyError(null);
    setCompanyInfo(null);
    try {
      const data = await apiClient.get<CompanyInfo>(`/api/market/company/${ticker}`);
      setCompanyInfo(data);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'Error loading company info');
    } finally {
      setIsCompanyLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 lg:p-10 min-h-screen bg-slate-50 text-slate-800 relative overflow-x-hidden pb-12 font-sans selection:bg-slate-200 selection:text-slate-900">
      {/* Subtle Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-slate-500/5 blur-[120px] pointer-events-none rounded-full" />

      {/* SYNC INDICATOR (Top Right) */}
      {loading && (
        <div className="fixed top-20 right-6 z-[100] flex items-center gap-3 bg-white px-4 py-3 rounded-xl shadow-lg animate-in fade-in border border-slate-100">
          <div className="w-2.5 h-2.5 bg-black rounded-full animate-pulse shadow-sm" />
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-widest font-mono">Syncing Data...</span>
        </div>
      )}

      {/* CONNECTION ERROR BADGE (Top Right) */}
      {!loading && connectionError && (
        <div className="fixed top-20 right-6 z-[100] flex items-center gap-3 bg-rose-50/95 backdrop-blur-md px-4 py-2.5 border border-rose-200 rounded-xl shadow-lg animate-in fade-in">
          <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
          <span className="text-[11px] font-extrabold text-rose-700 uppercase tracking-widest font-mono">
            🔴 연결 끊김: 최신 데이터를 불러오지 못했습니다 (마지막 갱신 {lastFetchedTime})
          </span>
        </div>
      )}

      <div className="w-full mx-auto space-y-5 animate-in fade-in duration-700 relative z-10 px-4 md:px-6 mt-4">
        
        {/* ════════ TOP: HEADER & GLOBAL METRICS ════════ */}
        <div className="flex items-center gap-4 mb-10 w-full">
          <div className="sfdc-icon-badge">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono">Operations Center</p>
            <h1 className="text-3xl font-black text-slate-900 leading-tight tracking-tighter">통합 지휘소</h1>
          </div>
        </div>

        <div className="sfdc-card flex flex-col xl:flex-row xl:items-center gap-6 p-6 w-full bg-white mb-8">
          <div className="flex-shrink-0">
            <DashboardControls
              isArmed={isArmed}
              pennyScanStatus={pennyScanStatus}
              onToggleArm={handleToggleArm}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </div>

          <div className="hidden xl:block h-12 w-[1px] bg-slate-100 flex-shrink-0" />

          <div className="w-full xl:w-auto flex-1">
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
          </div>
        </div>

        {/* ════════ EDGE MONITOR ALERT ════════ */}
        {edgeAlert.active && edgeAlert.message && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
            <Activity className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-widest mb-1 font-mono">
                알고리즘 Edge 이상 감지
              </p>
              <p className="text-sm text-amber-700 leading-relaxed font-bold">
                {edgeAlert.message}
              </p>
            </div>
            <button
              onClick={() => setEdgeAlert({ active: false, message: null })}
              className="text-amber-700/70 hover:text-amber-800 p-1 rounded-md hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ════════ MIDDLE: 3-COLUMN BENTO BOX LAYOUT ════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

          {/* ── LEFT COLUMN: Alpha Discovery & Status (Span 3) ── */}
          <div className="xl:col-span-3 flex flex-col gap-5">
            
            <div className="sfdc-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 font-mono">System Status</span>
              </div>
              <p className="text-[13px] text-slate-800 font-bold leading-relaxed">
                {isArmed
                  ? "ARMED: 자동 매매 활성. 퀀트 신호 충족 시 실시간 매수가 구동됩니다."
                  : "SAFE: 자동 매매 정지. 직접 실행 버튼을 통한 수동 개입만 허용됩니다."}
              </p>
            </div>

            <div className="sfdc-card">
              <div className="sfdc-card-header">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-900" /> Action Center
                </h2>
              </div>
              <div className="p-5 bg-white">
                <button
                  onClick={handleLiveHuntingTrigger}
                  disabled={isHunting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-600 disabled:shadow-none"
                >
                  {isHunting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4" />}
                  {isHunting ? '스캔 및 분석 중...' : 'AI 퀀트 헌팅 실행'}
                </button>
              </div>
            </div>

            <div className="sfdc-card flex-1 flex flex-col min-h-[400px]">
              <div className="sfdc-card-header">
                <div>
                  <h2 className="text-sm font-black flex items-center gap-2">
                    <TestTube className="w-4 h-4 text-slate-900" /> 오늘의 알파 종목
                  </h2>
                  <p className="text-[11px] text-slate-500 font-bold mt-1">DNA 70점 이상 엄선</p>
                </div>
              </div>
              <div className="p-4 flex-1 overflow-y-auto min-h-0 bg-slate-50/50">
                {discoveryStocks.length === 0 ? (
                  <div className="text-center py-10 text-slate-600 font-bold text-sm">
                    발굴된 종목이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {discoveryStocks.map((stock) => {
                      const isPenny = (stock.price ?? 0) <= PENNY_ENGINE_THRESHOLD && (stock.price ?? 0) > 0;
                      return (
                      <div
                        key={stock.ticker}
                        onClick={() => handleDeepDive(stock)}
                        className="bg-white border border-slate-100 hover:border-slate-300 rounded-xl p-4 cursor-pointer transition-colors group shadow-sm hover:shadow-md"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-lg font-black text-black block tracking-tight">{stock.ticker}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black font-mono text-slate-900">{Number(stock.dna_score).toFixed(1)}</span>
                            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-slate-100 group-hover:border-slate-200 transition-colors">
                              <TestTube className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-900 transition-colors" />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-sm font-extrabold text-black font-mono block">${Number(stock.price).toFixed(isPenny ? 4 : 2)}</span>
                            <span className={clsx("text-xs font-bold font-mono block", Number(stock.change_percent ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                              {Number(stock.change_percent ?? 0) >= 0 ? '+' : ''}{Number(stock.change_percent ?? 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-20 flex flex-col gap-1 items-end">
                            <TensionGauge score={stock.dna_score} rvol={stock.rvol} isPenny={isPenny} />
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── CENTER COLUMN: Portfolio Chart & Active Positions (Span 6) ── */}
          <div className="xl:col-span-6 flex flex-col gap-5">
            
            <div className="sfdc-card flex flex-col h-[320px]">
              <div className="sfdc-card-header flex justify-between items-center pb-3 border-b-0">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-900" /> 포트폴리오 자산 성장
                </h2>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-slate-600 font-bold hidden sm:inline">{lastFetchedTime}</span>
                  <div className="flex items-center gap-1 bg-slate-100/50 border border-slate-200 rounded-lg p-1">
                    {(['7d', '30d', 'all'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={clsx("px-3 py-1.5 text-[11px] font-extrabold rounded-md transition-all", chartRange === r ? "bg-white text-black shadow-sm border border-slate-200" : "text-slate-600 hover:text-black hover:bg-slate-50")}
                      >
                        {r === '7d' ? '7일' : r === '30d' ? '30일' : '전체'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 px-5 pb-5 bg-white relative">
                {chartData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl text-slate-600 font-bold bg-slate-50/50 relative overflow-hidden">
                    <svg className="absolute inset-0 w-full h-full opacity-10 animate-pulse text-slate-400" preserveAspectRatio="none" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 256L48 245.3C96 235 192 213 288 218.7C384 224 480 256 576 250.7C672 245 768 203 864 192C960 181 1056 203 1152 208C1248 213 1344 203 1392 197.3L1440 192V320H1392C1344 320 1248 320 1152 320C1056 320 960 320 864 320C768 320 672 320 576 320C480 320 384 320 288 320C192 320 96 320 48 320H0V256Z" fill="currentColor"/>
                    </svg>
                    <div className="z-10 flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                        <AreaChart className="w-6 h-6 text-slate-400 animate-pulse" />
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-600 font-mono">Awaiting Data</span>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2962ff" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#2962ff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 2" vertical={true} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="ts" 
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => {
                          const date = new Date(val);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }} 
                        tickMargin={10}
                        minTickGap={30}
                      />
                      <YAxis 
                        orientation="left"
                        domain={['auto', 'auto']} 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => `$${(val/1000).toFixed(1)}k`}
                        tickMargin={5}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', color: '#0f172a', fontWeight: 'bold', padding: '8px 12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.name ?? label}
                        formatter={(val: number | undefined) => [`$${Number(val ?? 0).toLocaleString()}`, 'Portfolio']}
                        cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Area 
                        type="linear" 
                        dataKey="value" 
                        stroke="#2962ff" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorTotal)" 
                        activeDot={{ r: 4, strokeWidth: 2, fill: '#2962ff', stroke: '#ffffff' }}
                        isAnimationActive={true}
                        animationDuration={800}
                        animationEasing="ease-in-out"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="sfdc-card flex-1 flex flex-col min-h-[300px]">
              <div className="sfdc-card-header">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-slate-900" /> Active Positions
                  </h2>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-100">
                    {livePositions.length}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-white">
                {/* Desktop Table View */}
                <table className="hidden md:table w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-mono font-extrabold text-slate-600 uppercase bg-slate-50/50 sticky top-0 shadow-sm z-10">
                      <th className="py-3 px-5">종목</th>
                      <th className="py-3 px-3 text-right hidden sm:table-cell">수량</th>
                      <th className="py-3 px-3 text-right">진입가</th>
                      <th className="py-3 px-3 text-right">현재가</th>
                      <th className="py-3 px-3 text-right hidden md:table-cell">TS</th>
                      <th className="py-3 px-5 text-right">평가 손익</th>
                      <th className="py-3 px-5 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {livePositions.length === 0 ? (
                      <tr><td colSpan={7} className="py-16 text-center text-slate-600 text-sm font-bold bg-white">보유 포지션 없음</td></tr>
                    ) : (
                      livePositions.map((pos: PaperPosition) => {
                        const hasPnl = pos.unrealized_pl != null;
                        const isProfit = hasPnl && (pos.unrealized_pl ?? 0) >= 0;
                        const pnlPct = hasPnl ? (pos.unrealized_plpc ?? 0) : 0;
                        const isHighTension = Math.abs(pnlPct) >= 5; // 5% 이상 변동 시 텐션
                        const dec = pos.isPenny ? 4 : 2;
                        return (
                          <tr key={pos.ticker} className={clsx("transition-colors bg-white", isHighTension ? (isProfit ? "bg-emerald-50/30 hover:bg-emerald-50/50 animate-[pulse_3s_ease-in-out_infinite]" : "bg-rose-50/30 hover:bg-rose-50/50 animate-[pulse_3s_ease-in-out_infinite]") : "hover:bg-slate-50")}>
                            <td className="py-4 px-5 relative">
                              {isHighTension && <div className={clsx("absolute left-0 top-0 bottom-0 w-1", isProfit ? "bg-emerald-500" : "bg-rose-500")} />}
                              <button 
                                onClick={() => handleCompanyClick(pos.ticker)}
                                className="text-base font-black text-slate-900 hover:text-black hover:underline block tracking-tight text-left transition-colors"
                              >
                                {pos.ticker}
                              </button>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-slate-500">{pos.isPenny ? 'Penny' : 'Standard'}</span>
                              </div>
                            </td>
                            <td className="py-4 px-3 text-right font-mono text-slate-900 text-sm font-extrabold hidden sm:table-cell">{Number(pos.units).toFixed(2)}</td>
                            <td className="py-4 px-3 text-right font-mono text-slate-900 text-sm font-extrabold">${Number(pos.entry_price).toFixed(dec)}</td>
                            <td className="py-4 px-3 text-right font-mono text-black text-base font-black">
                              ${pos.current_price ? Number(pos.current_price).toFixed(dec) : '-'}
                            </td>
                            <td className="py-4 px-3 text-right font-mono text-slate-600 text-xs font-bold hidden md:table-cell">
                              ${pos.trailing_stop ? Number(pos.trailing_stop).toFixed(dec) : '-'}
                            </td>
                            <td className={clsx("py-4 px-5 text-right font-mono text-xs font-extrabold", hasPnl ? (isProfit ? "text-emerald-600" : "text-rose-600") : "text-slate-600")}>
                              <span className="block">{hasPnl ? `${isProfit ? '+' : '-'}$${Math.abs(Number(pos.unrealized_pl ?? 0)).toFixed(2)}` : '-'}</span>
                              <span className="block text-[10px] mt-1">{hasPnl ? `${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}</span>
                            </td>
                            <td className="py-4 px-5 align-middle">
                              <div className="flex flex-col items-center gap-1.5 w-full max-w-[80px] mx-auto">
                                <button
                                  onClick={() => handleClosePosition(pos.ticker)}
                                  className="btn-ghost-rose text-[11px] px-3 py-1.5 w-full"
                                >
                                  정산
                                </button>
                                <div className="w-full">
                                  <PositionHealthBar 
                                    currentPrice={pos.current_price} 
                                    highestPrice={pos.highest_price} 
                                    tsThreshold={pos.ts_threshold ?? (pos.current_price ?? 0)} 
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Mobile Card View Fallback */}
                <div className="flex flex-col md:hidden divide-y divide-slate-50">
                  {livePositions.length === 0 ? (
                    <div className="py-12 text-center text-slate-600 text-sm font-bold bg-white">보유 포지션 없음</div>
                  ) : (
                    livePositions.map((pos: PaperPosition) => {
                      const hasPnl = pos.unrealized_pl != null;
                      const isProfit = hasPnl && (pos.unrealized_pl ?? 0) >= 0;
                      const pnlPct = hasPnl ? (pos.unrealized_plpc ?? 0) : 0;
                      const isHighTension = Math.abs(pnlPct) >= 5;
                      const dec = pos.isPenny ? 4 : 2;
                      return (
                        <div key={pos.ticker} className={clsx("p-5 bg-white relative transition-colors", isHighTension ? (isProfit ? "bg-emerald-50/30 animate-[pulse_3s_ease-in-out_infinite]" : "bg-rose-50/30 animate-[pulse_3s_ease-in-out_infinite]") : "")}>
                          {isHighTension && <div className={clsx("absolute left-0 top-0 bottom-0 w-1", isProfit ? "bg-emerald-500" : "bg-rose-500")} />}
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <span className="text-lg font-black text-black tracking-tight">{pos.ticker}</span>
                              <span className="text-[11px] font-bold block text-slate-600 mt-1">{pos.isPenny ? 'Penny' : 'Standard'} • {Number(pos.units).toFixed(2)} Shares</span>
                            </div>
                            <div className="text-right">
                              <span className={clsx("text-sm font-mono font-extrabold block", hasPnl ? (isProfit ? "text-emerald-600" : "text-rose-600") : "text-slate-600")}>
                                {hasPnl ? `${isProfit ? '+' : '-'}$${Math.abs(Number(pos.unrealized_pl ?? 0)).toFixed(2)}` : '-'}
                              </span>
                              <span className={clsx("text-[11px] font-mono font-bold block mt-1", hasPnl ? (isProfit ? "text-emerald-600" : "text-rose-600") : "text-slate-600")}>
                                {hasPnl ? `${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-xs font-mono mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="flex flex-col">
                              <span className="text-slate-600 font-bold">진입가</span>
                              <span className="font-black text-black text-sm mt-0.5">${Number(pos.entry_price).toFixed(dec)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-slate-600 font-bold">현재가</span>
                              <span className="font-black text-black text-sm mt-0.5">${pos.current_price ? Number(pos.current_price).toFixed(dec) : '-'}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleClosePosition(pos.ticker)}
                            className="w-full btn-ghost-rose text-xs font-extrabold py-2.5"
                          >
                            정산하기
                          </button>
                          <div className="mt-4 px-1">
                            <PositionHealthBar 
                              currentPrice={pos.current_price} 
                              highestPrice={pos.highest_price} 
                              tsThreshold={pos.ts_threshold ?? (pos.current_price ?? 0)} 
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Risk & Analytics & Logs (Span 3) ── */}
          <div className="xl:col-span-3 flex flex-col gap-5">
            <RiskAnalyticsPanel history={slicedHistory} portfolioHistory={slicedPortfolioHistory} strategyStats={null} />
            <PositionAnalyticsPanel positions={livePositions} totalEquity={displayedAccount.total_assets} />

            <div className="sfdc-card flex-1 flex flex-col min-h-[250px] max-h-[420px]">
              <div className="sfdc-card-header">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-900" /> Recent Exits
                </h2>
              </div>
              <div className="p-4 flex-1 min-h-0 overflow-y-auto bg-slate-50/50">
                {liveHistory.length === 0 ? (
                  <div className="text-center py-10 text-slate-600 text-xs font-bold">기록 없음</div>
                ) : (
                  <div className="space-y-3">
                    {liveHistory.slice(0, 30).map((trade: PaperHistory, idx: number) => {
                      const isWin = Number(trade.profit_amt) >= 0;
                      return (
                        <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-black">{trade.ticker}</span>
                              {trade.exit_reason && (
                                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {trade.exit_reason}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-slate-500">
                              <span title="Entry Price">E: ${trade.entry_price < 1 ? Number(trade.entry_price).toFixed(4) : Number(trade.entry_price).toFixed(2)}</span>
                              <span>→</span>
                              <span title="Exit Price">X: ${trade.exit_price < 1 ? Number(trade.exit_price).toFixed(4) : Number(trade.exit_price).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className={clsx("font-mono text-sm font-extrabold", isWin ? "text-emerald-600" : "text-rose-600")}>
                              {isWin ? '+' : '-'}${Math.abs(Number(trade.profit_amt)).toFixed(2)}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] font-medium text-slate-400 font-mono">
                                {trade.created_at ? new Date(trade.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) : '-'}
                              </span>
                              <span className={clsx("font-mono text-[10px] font-bold", isWin ? "text-emerald-600" : "text-rose-600")}>
                                {isWin ? '+' : ''}{Number(trade.pnl_pct).toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════ SETTINGS DRAWER ════════ */}
      {isSettingsOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200]" onClick={() => setIsSettingsOpen(false)} />}
      <div className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white border-l border-slate-200 z-[210] overflow-y-auto transition-transform duration-300 ease-in-out shadow-2xl ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-800" />
            <span className="text-[12px] font-black text-black uppercase tracking-widest">Settings</span>
          </div>
          <button onClick={() => setIsSettingsOpen(false)} className="text-slate-600 hover:text-black p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 pb-24 space-y-6">
          <CommandSettings />
          <BacktestPanel />
        </div>
      </div>

      {/* ════════ STOCK DEEP-DIVE MODAL ════════ */}
      {terminalData && (
        <StockTerminalModal
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
        />
      )}

      {/* ════════ COMPANY INFO MODAL ════════ */}
      <CompanyInfoModal 
        isOpen={selectedCompanyTicker !== null}
        onClose={() => setSelectedCompanyTicker(null)}
        info={companyInfo}
        isLoading={isCompanyLoading}
        error={companyError}
      />
    </div>
  );
}
