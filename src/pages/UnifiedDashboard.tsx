/**
 * UnifiedDashboard.tsx — Unified Command Center (Lumina Trade Light Design - No Gray)
 * 3-Column Bento Box Layout for maximum data density & tactical operations.
 */

import clsx from 'clsx';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart
} from 'recharts';
import {
  Activity, Clock,
  LayoutGrid, TestTube, Play, X, Settings, FlaskConical
} from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { BacktestPanel } from '../components/dashboard/BacktestPanel';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { PennyQuantScoreBar } from '../components/penny/PennyQuantScoreBar';
import { DashboardTitle, DashboardControls } from '../components/dashboard/HeaderCommandBar';
import { MetricsGrid } from '../components/dashboard/MetricsGrid';
import { RiskAnalyticsPanel } from '../components/dashboard/RiskAnalyticsPanel';
import { PositionAnalyticsPanel } from '../components/dashboard/PositionAnalyticsPanel';

const PENNY_ENGINE_THRESHOLD = 1.0;


export default function UnifiedDashboard() {
  const {
    loading, isArmed, isMarketOpen, isSettingsOpen, lastFetchedTime, discoveryStocks,
    livePositions, liveHistory, pennyScanStatus, edgeAlert, terminalData, chartRange,
    displayedAccount, displayedWinRate, displayedTotalTrades, totalPnl, investedCapital,
    concentrationPct, chartData, setIsSettingsOpen, setChartRange, setTerminalData,
    setEdgeAlert, handleDeepDive, handleLiveHuntingTrigger, handleToggleArm, handleClosePosition,
    isHunting, navigate,
  } = useDashboardData();

  return (
    <div className="p-4 md:p-8 lg:p-10 min-h-screen bg-[#fbfdff] text-blue-950 relative overflow-x-hidden pb-12 font-sans selection:bg-blue-300 selection:text-black">
      {/* Subtle Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-blue-600/5 blur-[120px] pointer-events-none rounded-full" />

      {/* SYNC INDICATOR (Top Right) */}
      {loading && (
        <div className="fixed top-20 right-6 z-[100] flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2 border-2 border-blue-300 rounded-md shadow-lg animate-in fade-in">
          <div className="w-2.5 h-2.5 bg-blue-700 rounded-full animate-pulse shadow-[0_0_8px_rgba(29,78,216,0.6)]" />
          <span className="text-[12px] font-black text-blue-900 uppercase tracking-widest font-mono">Syncing Data...</span>
        </div>
      )}

      <div className="w-full mx-auto space-y-4 animate-in fade-in duration-700 relative z-10 px-4 md:px-6 mt-4">
        
        {/* ════════ TOP: HEADER & GLOBAL METRICS ════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 w-full">
          <div className="w-full lg:w-auto flex-shrink-0">
            <DashboardTitle isMarketOpen={isMarketOpen} />
          </div>
          
          <div className="bg-white/80 backdrop-blur-xl px-6 py-4 rounded-xl flex flex-col xl:flex-row xl:items-center gap-6 border border-blue-200 shadow-sm w-full lg:w-auto">
            <div className="flex-shrink-0">
              <DashboardControls
                isArmed={isArmed}
                pennyScanStatus={pennyScanStatus}
                onToggleArm={handleToggleArm}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>
            
            <div className="hidden xl:block h-12 w-[1px] bg-blue-200/50 flex-shrink-0" />
            
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
        </div>

        {/* ════════ EDGE MONITOR ALERT ════════ */}
        {edgeAlert.active && edgeAlert.message && (
          <div className="flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-md px-5 py-4 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <Activity className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest mb-1 font-mono">
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
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* ── LEFT COLUMN: Alpha Discovery & Status (Span 3) ── */}
          <div className="xl:col-span-3 flex flex-col gap-4">
            
            <div className="sfdc-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-blue-700 animate-pulse shadow-sm" />
                <span className="text-[11px] font-black uppercase tracking-widest text-blue-900">System Status</span>
              </div>
              <p className="text-[13px] text-blue-950 font-bold leading-relaxed">
                {isArmed
                  ? "ARMED: 자동 매매 활성. 퀀트 신호 충족 시 실시간 매수가 구동됩니다."
                  : "SAFE: 자동 매매 정지. 직접 실행 버튼을 통한 수동 개입만 허용됩니다."}
              </p>
            </div>

            <div className="sfdc-card">
              <div className="sfdc-card-header">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-700" /> Action Center
                </h2>
              </div>
              <div className="p-4 bg-white">
                <button
                  onClick={handleLiveHuntingTrigger}
                  disabled={isHunting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-black text-xs rounded-md shadow-md transition-all active:scale-95 disabled:bg-blue-200 disabled:text-blue-50 disabled:shadow-none"
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
                    <TestTube className="w-4 h-4 text-blue-700" /> 오늘의 알파 종목
                  </h2>
                  <p className="text-[11px] text-blue-800 font-bold mt-0.5">DNA 70점 이상 엄선</p>
                </div>
              </div>
              <div className="p-4 flex-1 overflow-y-auto min-h-0 bg-blue-50/30">
                {discoveryStocks.length === 0 ? (
                  <div className="text-center py-8 text-blue-800 font-bold">
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
                        className="bg-white border-2 border-blue-200 hover:border-blue-600 rounded-md p-3 cursor-pointer transition-colors group shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-lg font-black text-black block">{stock.ticker}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const params = new URLSearchParams({ ticker: stock.ticker });
                                if (stock.rsi != null) params.set('rsi', String(Math.round(stock.rsi)));
                                if (stock.rvol != null) params.set('rvol', String(stock.rvol.toFixed(1)));
                                if (stock.adx != null) params.set('adx', String(Math.round(stock.adx)));
                                if (stock.macdDiff != null) params.set('macd', stock.macdDiff > 0 ? 'rising' : 'falling');
                                if (isPenny) params.set('penny', 'true');
                                if (stock.price != null) params.set('entry', String(stock.price.toFixed(4)));
                                navigate(`/dna-simulator?${params.toString()}`);
                              }}
                              className="w-6 h-6 flex items-center justify-center rounded border-2 border-blue-100 bg-white hover:bg-blue-600 hover:border-blue-600 text-blue-700 hover:text-white transition-all shrink-0"
                              title="DNA 시뮬레이터로 분석"
                            >
                              <FlaskConical className="w-3 h-3" />
                            </button>
                            <div className="w-6 h-6 rounded bg-blue-50 flex items-center justify-center border-2 border-blue-100 group-hover:bg-blue-600 group-hover:border-blue-600 transition-colors">
                              <TestTube className="w-3 h-3 text-blue-700 group-hover:text-white transition-colors" />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-sm font-black text-black font-mono block">${Number(stock.price).toFixed(isPenny ? 4 : 2)}</span>
                            <span className={clsx("text-xs font-black font-mono block", Number(stock.change_percent ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700")}>
                              {Number(stock.change_percent ?? 0) >= 0 ? '+' : ''}{Number(stock.change_percent ?? 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-14">
                            <PennyQuantScoreBar score={stock.dna_score} size="sm" showLabel={false} />
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
          <div className="xl:col-span-6 flex flex-col gap-4">
            
            <div className="sfdc-card flex flex-col h-[300px]">
              <div className="sfdc-card-header flex justify-between items-center pb-2 border-b-0">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-700" /> 포트폴리오 자산 성장
                </h2>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-blue-800 font-bold hidden sm:inline">{lastFetchedTime}</span>
                  <div className="flex items-center gap-1.5 bg-blue-100 border-2 border-blue-200 rounded-md p-0.5">
                    {(['7d', '30d', 'all'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={clsx("px-3 py-1 text-[11px] font-black rounded-sm transition-all", chartRange === r ? "bg-white text-blue-800 shadow-sm border border-blue-300" : "text-blue-900 hover:text-black hover:bg-blue-50")}
                      >
                        {r === '7d' ? '7일' : r === '30d' ? '30일' : '전체'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 px-4 pb-4 bg-white relative">
                {chartData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-blue-200 rounded-md text-blue-800 font-bold bg-blue-50/20 relative overflow-hidden">
                    {/* Skeleton Chart SVG */}
                    <svg className="absolute inset-0 w-full h-full opacity-20 animate-pulse text-blue-400" preserveAspectRatio="none" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 256L48 245.3C96 235 192 213 288 218.7C384 224 480 256 576 250.7C672 245 768 203 864 192C960 181 1056 203 1152 208C1248 213 1344 203 1392 197.3L1440 192V320H1392C1344 320 1248 320 1152 320C1056 320 960 320 864 320C768 320 672 320 576 320C480 320 384 320 288 320C192 320 96 320 48 320H0V256Z" fill="currentColor"/>
                    </svg>
                    <div className="z-10 flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shadow-sm">
                        <AreaChart className="w-5 h-5 text-blue-600 animate-pulse" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-blue-600 bg-white/80 px-2 py-0.5 rounded shadow-sm backdrop-blur-sm">Awaiting Data</span>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#bfdbfe" />
                      <XAxis dataKey="displayName" stroke="#1e3a8a" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis domain={['auto', 'auto']} stroke="#1e3a8a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${(val/1000).toFixed(1)}k`}/>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #bfdbfe', borderRadius: '4px', fontSize: '11px', color: '#000000', fontWeight: 'bold' }}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.name ?? label}
                        formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Total Assets']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="sfdc-card flex-1 flex flex-col min-h-[300px]">
              <div className="sfdc-card-header">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-blue-700" /> Active Positions
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black border-2 border-emerald-300">
                    {livePositions.length}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-white">
                {/* Desktop Table View */}
                <table className="hidden md:table w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-blue-200 text-[10px] font-mono font-black text-blue-900 uppercase bg-blue-50 sticky top-0 shadow-sm z-10">
                      <th className="py-2 px-4">종목</th>
                      <th className="py-2 px-2 text-right hidden sm:table-cell">수량</th>
                      <th className="py-2 px-2 text-right">진입가</th>
                      <th className="py-2 px-2 text-right">현재가</th>
                      <th className="py-2 px-2 text-right hidden md:table-cell">TS</th>
                      <th className="py-2 px-4 text-right">평가 손익</th>
                      <th className="py-2 px-4 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-blue-50">
                    {livePositions.length === 0 ? (
                      <tr><td colSpan={7} className="py-12 text-center text-blue-800 text-xs font-bold bg-white">보유 포지션 없음</td></tr>
                    ) : (
                      livePositions.map((pos: any) => {
                        const hasPnl = pos.unrealized_pl != null;
                        const isProfit = hasPnl && pos.unrealized_pl >= 0;
                        const pnlPct = hasPnl ? pos.unrealized_plpc : 0;
                        const isHighTension = Math.abs(pnlPct) >= 5; // 5% 이상 변동 시 텐션
                        const dec = pos.isPenny ? 4 : 2;
                        return (
                          <tr key={pos.ticker} className={clsx("transition-colors bg-white", isHighTension ? (isProfit ? "bg-emerald-50/30 hover:bg-emerald-50/50 animate-[pulse_3s_ease-in-out_infinite]" : "bg-rose-50/30 hover:bg-rose-50/50 animate-[pulse_3s_ease-in-out_infinite]") : "hover:bg-blue-50/50")}>
                            <td className="py-3 px-4 relative">
                              {isHighTension && <div className={clsx("absolute left-0 top-0 bottom-0 w-1", isProfit ? "bg-emerald-500" : "bg-rose-500")} />}
                              <span className="text-sm font-black text-black block">{pos.ticker}</span>
                              <span className="text-[10px] font-bold block text-blue-900 mt-0.5">{pos.isPenny ? 'Penny' : 'Standard'}</span>
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-black text-xs font-bold hidden sm:table-cell">{Number(pos.units).toFixed(2)}</td>
                            <td className="py-3 px-2 text-right font-mono text-black text-xs font-bold">${Number(pos.entry_price).toFixed(dec)}</td>
                            <td className="py-3 px-2 text-right font-mono text-black text-sm font-black">
                              ${pos.current_price ? Number(pos.current_price).toFixed(dec) : '-'}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-emerald-700 text-xs font-bold hidden md:table-cell">
                              ${pos.trailing_stop ? Number(pos.trailing_stop).toFixed(dec) : '-'}
                            </td>
                            <td className={clsx("py-3 px-4 text-right font-mono text-xs font-black", hasPnl ? (isProfit ? "text-emerald-700" : "text-rose-700") : "text-blue-900")}>
                              <span className="block">{hasPnl ? `${isProfit ? '+' : ''}$${Number(pos.unrealized_pl).toFixed(2)}` : '-'}</span>
                              <span className="block text-[10px] mt-0.5">{hasPnl ? `${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleClosePosition(pos.ticker)}
                                className="btn-ghost-rose text-[10px] px-3 py-1 rounded-sm"
                              >
                                정산
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Mobile Card View Fallback */}
                <div className="flex flex-col md:hidden divide-y-2 divide-blue-50">
                  {livePositions.length === 0 ? (
                    <div className="py-12 text-center text-blue-800 text-xs font-bold bg-white">보유 포지션 없음</div>
                  ) : (
                    livePositions.map((pos: any) => {
                      const hasPnl = pos.unrealized_pl != null;
                      const isProfit = hasPnl && pos.unrealized_pl >= 0;
                      const pnlPct = hasPnl ? pos.unrealized_plpc : 0;
                      const isHighTension = Math.abs(pnlPct) >= 5;
                      const dec = pos.isPenny ? 4 : 2;
                      return (
                        <div key={pos.ticker} className={clsx("p-4 bg-white relative transition-colors", isHighTension ? (isProfit ? "bg-emerald-50/30 animate-[pulse_3s_ease-in-out_infinite]" : "bg-rose-50/30 animate-[pulse_3s_ease-in-out_infinite]") : "")}>
                          {isHighTension && <div className={clsx("absolute left-0 top-0 bottom-0 w-1", isProfit ? "bg-emerald-500" : "bg-rose-500")} />}
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-base font-black text-black">{pos.ticker}</span>
                              <span className="text-[10px] font-bold block text-blue-900">{pos.isPenny ? 'Penny' : 'Standard'} • {Number(pos.units).toFixed(2)} Shares</span>
                            </div>
                            <div className="text-right">
                              <span className={clsx("text-sm font-mono font-black block", hasPnl ? (isProfit ? "text-emerald-700" : "text-rose-700") : "text-blue-900")}>
                                {hasPnl ? `${isProfit ? '+' : ''}$${Number(pos.unrealized_pl).toFixed(2)}` : '-'}
                              </span>
                              <span className={clsx("text-[10px] font-mono font-black block", hasPnl ? (isProfit ? "text-emerald-700" : "text-rose-700") : "text-blue-900")}>
                                {hasPnl ? `${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-[11px] font-mono mb-3 bg-blue-50/50 p-2 rounded">
                            <div className="flex flex-col">
                              <span className="text-blue-800">진입가</span>
                              <span className="font-bold text-black">${Number(pos.entry_price).toFixed(dec)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-blue-800">현재가</span>
                              <span className="font-bold text-black">${pos.current_price ? Number(pos.current_price).toFixed(dec) : '-'}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleClosePosition(pos.ticker)}
                            className="w-full btn-ghost-rose text-xs font-black py-2 rounded-md"
                          >
                            정산하기
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Risk & Analytics & Logs (Span 3) ── */}
          <div className="xl:col-span-3 flex flex-col gap-4">
            <RiskAnalyticsPanel history={liveHistory} strategyStats={null} />
            <PositionAnalyticsPanel positions={livePositions} totalEquity={displayedAccount.total_assets} />

            <div className="sfdc-card flex-1 flex flex-col min-h-[250px] max-h-[420px]">
              <div className="sfdc-card-header">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-700" /> Recent Exits
                </h2>
              </div>
              <div className="p-3 flex-1 min-h-0 overflow-y-auto bg-blue-50/50">
                {liveHistory.length === 0 ? (
                  <div className="text-center py-8 text-blue-800 text-xs font-bold">기록 없음</div>
                ) : (
                  <div className="space-y-2">
                    {liveHistory.slice(0, 30).map((trade: any, idx: number) => {
                      const isWin = Number(trade.profit_amt) >= 0;
                      return (
                        <div key={idx} className="bg-white p-2.5 rounded-md border-2 border-blue-200 flex justify-between items-center shadow-sm">
                          <div>
                            <span className="text-sm font-black text-black">{trade.ticker}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-black text-blue-900 font-mono">
                                {new Date(trade.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                              </span>
                              {trade.exit_reason && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-800 bg-blue-100 px-1 rounded">{trade.exit_reason}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={clsx("font-mono text-sm font-black block", isWin ? "text-emerald-700" : "text-rose-700")}>
                              {isWin ? '+' : ''}${Number(trade.profit_amt).toFixed(2)}
                            </span>
                            <span className={clsx("font-mono text-[10px] font-bold block mt-0.5", isWin ? "text-emerald-700" : "text-rose-700")}>
                              {isWin ? '+' : ''}{Number(trade.pnl_pct).toFixed(2)}%
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
        </div>
      </div>

      {/* ════════ SETTINGS DRAWER ════════ */}
      {isSettingsOpen && <div className="fixed inset-0 bg-blue-950/40 backdrop-blur-sm z-[200]" onClick={() => setIsSettingsOpen(false)} />}
      <div className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white border-l-2 border-blue-200 z-[210] overflow-y-auto transition-transform duration-300 ease-in-out shadow-2xl ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b-2 border-blue-200 bg-blue-50 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-700" />
            <span className="text-[12px] font-black text-black uppercase tracking-widest">Settings</span>
          </div>
          <button onClick={() => setIsSettingsOpen(false)} className="text-blue-800 hover:text-black transition-colors"><X className="w-5 h-5" /></button>
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
    </div>
  );
}
