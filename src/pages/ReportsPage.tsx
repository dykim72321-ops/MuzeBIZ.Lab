import { useEffect, useState } from 'react';
import { BarChart3, CalendarClock, CalendarDays, CalendarRange, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  fetchStrategyReports,
  fetchTradeSourceReconciliation,
  type StrategyReportBucket,
  type TradeSourceReconciliation,
} from '../services/pythonApiService';
import { LiveTransitionChecklist } from '../components/dashboard/LiveTransitionChecklist';
import { ImprovementTracker } from '../components/dashboard/ImprovementTracker';

type TimeRange = 'day' | 'week' | 'month';

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  day: '일간',
  week: '주간',
  month: '월간',
};

export default function ReportsPage() {
  const [timeRange, setTimeRangeState] = useState<TimeRange>(() => {
    return (localStorage.getItem('reportsTimeRange') as TimeRange) || 'week';
  });

  const setTimeRange = (range: TimeRange) => {
    localStorage.setItem('reportsTimeRange', range);
    setTimeRangeState(range);
  };
  const [reportData, setReportData] = useState<StrategyReportBucket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alpacaDataStale, setAlpacaDataStale] = useState(false);
  const [reconciliation, setReconciliation] = useState<TradeSourceReconciliation | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchStrategyReports(timeRange);
        if (!data) {
          setError('리포트 데이터를 불러오는데 실패했습니다.');
          setReportData(null);
          setAlpacaDataStale(false);
        } else {
          setReportData(data.buckets);
          setAlpacaDataStale(Boolean(data.alpaca_data_stale));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '리포트 데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [timeRange]);

  // 대시보드(closed-trades)와 리포트(paper_history) 두 소스의 최근 7일 거래건수/순손익
  // 괴리를 감시한다 — 시간대 선택(timeRange)과 무관하게 한 번만 로드.
  useEffect(() => {
    fetchTradeSourceReconciliation(7).then(setReconciliation);
  }, []);

  // Aggregate Data for Chart — 기간별 순이익(바) + 누적 순이익(자산곡선 라인).
  // 두 시리즈 모두 달러 단위이므로 하나의 Y축을 공유한다 (이중축 금지).
  let cumulative = 0;
  let chartData = reportData
    ? [...reportData]
        .sort((a, b) => a.period_label.localeCompare(b.period_label))
        .map(item => {
          const netProfit = item.alpaca_net_profit ?? Math.round((item.gross_profit - item.gross_loss) * 100) / 100;
          cumulative = item.alpaca_cumulative ?? Math.round((cumulative + (item.alpaca_net_profit ?? Math.round((item.gross_profit - item.gross_loss) * 100) / 100)) * 100) / 100;
          return {
            period: item.period_label,
            winRate: item.win_rate,
            tradeCount: item.total_trades,
            netProfit,
            cumulative,
          };
        })
    : [];

  // 데이터가 1개면 누적 라인이 점 하나로만 남아 추세를 읽을 수 없으므로
  // 0에서 시작하는 기준점을 앞에 추가한다.
  if (chartData.length === 1) {
    chartData = [
      { ...chartData[0], period: `${chartData[0].period} (Start)`, netProfit: 0, cumulative: 0 },
      chartData[0],
    ];
  }

  return (
    <div className="space-y-6 bg-slate-50 p-4 md:p-8 lg:p-10 min-h-screen text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Page Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 w-full">

        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button
            onClick={() => setTimeRange('day')}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-extrabold rounded-lg transition-all",
              timeRange === 'day'
                ? "bg-white text-black shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-black hover:bg-slate-50"
            )}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            일일 리포트
          </button>
          <button
            onClick={() => setTimeRange('week')}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-extrabold rounded-lg transition-all",
              timeRange === 'week'
                ? "bg-white text-black shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-black hover:bg-slate-50"
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            주간 리포트
          </button>
          <button
            onClick={() => setTimeRange('month')}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-extrabold rounded-lg transition-all",
              timeRange === 'month'
                ? "bg-white text-black shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-black hover:bg-slate-50"
            )}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            월간 리포트
          </button>
        </div>
      </header>

      <div className="w-full space-y-6 relative z-10">
        
        {loading ? (
          <div className="h-[400px] flex flex-col items-center justify-center bg-white border border-slate-100 rounded-2xl shadow-sm">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
            <span className="text-sm font-bold text-slate-600 uppercase tracking-widest font-mono">Loading Reports...</span>
          </div>
        ) : error ? (
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 flex flex-col items-center shadow-sm">
            <span className="text-xl mb-2">⚠️</span>
            <span className="font-extrabold text-sm">{error}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full">
            
            {/* Top Area: Chart & Table if data exists, otherwise empty state card */}
            {reportData && reportData.length > 0 ? (
              <>
                {/* Net Profit Trend Chart */}
                <div className="sfdc-card p-6 lg:p-8 relative overflow-hidden">
                  {/* Subtle background glow */}
                  <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 relative z-10">
                    <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      순이익 트렌드 ({TIME_RANGE_LABELS[timeRange]})
                    </h2>
                  </div>
                  
                  <div className="w-full h-[340px] relative z-10" style={{ touchAction: 'pan-y' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                        {/* 그리드/기준선은 솔리드 헤어라인 — 대시는 시각적 노이즈이며 '예측선'으로 오독됨 */}
                        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
                        <XAxis
                          dataKey="period"
                          stroke="#64748b"
                          fontSize={11}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={false}
                          dy={12}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={11}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => {
                            if (Math.abs(val) >= 1000) {
                              return `$${(val / 1000).toFixed(val % 1000 !== 0 ? 1 : 0)}K`;
                            }
                            return `$${val}`;
                          }}
                        />
                        <RechartsTooltip
                          cursor={{ fill: '#f8fafc', opacity: 0.6 }}
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              const isProfit = data.netProfit >= 0;
                              const isCumProfit = data.cumulative >= 0;
                              return (
                                <div className="bg-white/90 backdrop-blur-md border border-slate-200/60 p-4 rounded-xl shadow-xl min-w-[180px]">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                                  <div className="flex items-end gap-1 mb-1">
                                    <span className={clsx("text-xl font-black tracking-tighter", isProfit ? "text-emerald-500" : "text-rose-500")}>
                                      {isProfit ? '+' : '-'}${Math.abs(data.netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-500 mb-3">
                                    누적{' '}
                                    <span className={clsx("font-black", isCumProfit ? "text-indigo-600" : "text-rose-500")}>
                                      {isCumProfit ? '+' : '-'}${Math.abs(data.cumulative).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </p>
                                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                                    <div>
                                      <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Trades</span>
                                      <span className="block text-sm font-bold text-slate-700">{data.tradeCount}</span>
                                    </div>
                                    <div>
                                      <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Win Rate</span>
                                      <span className="block text-sm font-bold text-slate-700">{data.winRate.toFixed(1)}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend
                          verticalAlign="top"
                          align="right"
                          height={28}
                          iconSize={10}
                          formatter={(value: string) => (
                            <span className="text-[11px] font-bold text-slate-600">{value}</span>
                          )}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" opacity={0.6} />
                        <Bar name="기간 순이익" dataKey="netProfit" radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.netProfit >= 0 ? '#10b981' : '#f43f5e'} />
                          ))}
                        </Bar>
                        {/* 누적 순이익 자산곡선 — 바(기간 손익)와 같은 달러 축 공유 */}
                        <Line
                          name="누적 순이익"
                          type="monotone"
                          dataKey="cumulative"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={{ r: 3, fill: '#6366f1', strokeWidth: 2, stroke: '#ffffff' }}
                          activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Data Table */}
                <div className="sfdc-card overflow-hidden flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                  {/* Header Section */}
                  <div className="p-5 px-6 md:px-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80 flex-shrink-0">
                        <CalendarDays className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2 uppercase">
                          기간별 퀀트 성과 상세
                        </h2>
                        <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">QUANT PRECISE METRICS</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {alpacaDataStale ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-amber-50/80 text-amber-700 border border-amber-200/60 shadow-2xs" title="Alpaca 계좌 히스토리 조회에 실패해 아래 순이익/MDD는 내부 추정치(gross_profit - gross_loss)입니다. 실계좌 실측값이 아닙니다.">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          ⚠️ ALPACA 조회 실패 — 내부 추정치 표시 중
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-blue-50/80 text-blue-700 border border-blue-200/60 shadow-2xs" title="순이익 및 MDD는 Alpaca 계좌 실제 변동을 반영합니다">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                          ALPACA ACCOUNT HISTORY (PNL/MDD)
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 shadow-2xs">
                        KELLY FORMULA & RISK-ADJUSTED MATCHED
                      </span>
                    </div>
                  </div>
                  <p className="px-6 md:px-8 pb-3 -mt-1 text-[10px] text-slate-400 font-medium">
                    ※ 승률/PF는 엔진 청산 로그(paper_history) 기준입니다. 통합 지휘소 상단의 Win Rate는 Alpaca 실체결(closed-trades) 기준으로 별도 산출되어 두 값이 다를 수 있습니다.
                  </p>

                  {/* Desktop / Tablet View (≥ 768px) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200/80 bg-slate-50/80 whitespace-nowrap">
                          <th className="py-3.5 px-4 text-left w-[14%]">기간</th>
                          <th className="py-3.5 px-4 text-right w-[12%]">거래건수</th>
                          <th className="py-3.5 px-4 text-right w-[16%]">순이익</th>
                          <th className="py-3.5 px-4 text-right w-[14%]">평균 손익</th>
                          <th className="py-3.5 px-4 text-right w-[20%]" title="체결 건수 승률 (괄호: Scale-Out 병합 포지션 승률)">
                            승률(포지션)
                          </th>
                          <th className="py-3.5 px-4 text-right w-[10%]">PF</th>
                          <th className="py-3.5 px-4 text-right w-[14%]">MDD(계좌)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.map((row, idx) => {
                          const netProfit = row.alpaca_net_profit ?? Math.round((row.gross_profit - row.gross_loss) * 100) / 100;
                          const posWinRate = row.pos_win_rate ?? row.win_rate;
                          const periodMdd = row.alpaca_period_mdd ?? row.period_mdd ?? row.mdd;
                          const globalMdd = row.alpaca_mdd ?? row.mdd;
                          const trades = row.total_trades;
                          const posTrades = row.pos_total_trades ?? trades;
                          const avgPnl = row.avg_pnl ?? (trades > 0 ? netProfit / trades : 0);

                          return (
                            <tr key={idx} className="group odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50/20 transition-colors duration-150 whitespace-nowrap">
                              {/* 1. 기간 (Period) */}
                              <td className="py-4 px-4 text-left">
                                <span className="text-sm font-bold font-mono text-slate-800 tracking-tight">
                                  {row.period_label}
                                </span>
                              </td>

                              {/* 2. 거래건수 (Trades) */}
                              <td className="py-4 px-4 text-right font-mono">
                                <span className="text-sm font-bold text-slate-700">{trades}</span>
                                <span className="text-xs font-medium text-slate-400 ml-1">({posTrades})</span>
                              </td>

                              {/* 3. 순이익 (Net Profit) - Alpaca 실측값 우선 */}
                              <td className="py-4 px-4 text-right">
                                <span className={clsx(
                                  "text-base font-black font-mono tracking-tight",
                                  netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                                )}>
                                  {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </td>

                              {/* 4. 평균 손익 (Avg PnL) */}
                              <td className="py-4 px-4 text-right font-mono">
                                <span className={clsx("text-sm font-bold", avgPnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                  {avgPnl >= 0 ? '+' : '-'}${Math.abs(avgPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </td>

                              {/* 5. 체결승률(포지션) (Win Rate) */}
                              <td className="py-4 px-4 text-right font-mono">
                                <span className={clsx("text-sm font-bold", row.win_rate >= 50 ? "text-slate-900" : "text-rose-600")}>
                                  {row.win_rate.toFixed(1)}%
                                </span>
                                <span className="text-xs font-semibold text-indigo-600 ml-1.5">
                                  ({posWinRate.toFixed(1)}%)
                                </span>
                              </td>

                              {/* 6. PF (Profit Factor) */}
                              <td className="py-4 px-4 text-right font-mono">
                                <span className={clsx("text-sm font-bold", row.profit_factor >= 1.0 ? "text-slate-900" : "text-slate-600")}>
                                  {row.profit_factor >= 99.0 ? '99.0+' : row.profit_factor.toFixed(2)}
                                </span>
                              </td>

                              {/* 7. 기간(계좌) MDD */}
                              <td className="py-4 px-4 text-right font-mono">
                                <span className="text-sm font-bold text-rose-600">
                                  {periodMdd.toFixed(1)}%
                                </span>
                                <span className="text-xs font-normal text-slate-400 ml-1.5">
                                  ({globalMdd.toFixed(1)}%)
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View (< 768px) */}
                  <div className="block md:hidden p-4 space-y-3">
                    {reportData.map((row, idx) => (
                      <MobileReportCard key={idx} row={row} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-[180px] flex flex-col items-center justify-center bg-white border border-slate-200/80 rounded-2xl text-slate-500 shadow-sm font-bold text-sm">
                해당 기간의 리포트 데이터가 없습니다.
              </div>
            )}

            {/* 3. 전략 개선 검증 트래커 (100% 가로 전체 폭 넓이 확장 — 항상 표시) */}
            <ImprovementTracker />

            {/* 4. 실계좌 전환 체크리스트 (100% 가로 전체 폭 넓이 확장 — 항상 표시) */}
            {reconciliation?.available && reconciliation.diverged && (
              <div className="sfdc-card p-5 border-2 border-amber-300 bg-amber-50/60 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">데이터 소스 괴리 감지</h3>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  최근 {reconciliation.window_days}일: 엔진 로그(paper_history) {reconciliation.paper_history?.trade_count}건 /
                  ${reconciliation.paper_history?.net_pnl.toLocaleString()} vs Alpaca 실체결 {reconciliation.alpaca_closed_trades?.trade_count}건 /
                  ${reconciliation.alpaca_closed_trades?.net_pnl.toLocaleString()}. paper_history 기록 누락·중복 가능성을 점검하세요.
                </p>
              </div>
            )}
            <LiveTransitionChecklist />

          </div>
        )}
      </div>
    </div>
  );
}

function MobileReportCard({ row }: { row: StrategyReportBucket }) {
  const [expanded, setExpanded] = useState(false);
  const netProfit = row.alpaca_net_profit ?? Math.round((row.gross_profit - row.gross_loss) * 100) / 100;
  const posWinRate = row.pos_win_rate ?? row.win_rate;
  const periodMdd = row.alpaca_period_mdd ?? row.period_mdd ?? row.mdd;
  const globalMdd = row.alpaca_mdd ?? row.mdd;

  return (
    <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-3 shadow-2xs transition-all">
      <div 
        className="flex justify-between items-center pb-2 border-b border-slate-200/60 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="px-2.5 py-1 rounded bg-slate-200/70 font-bold font-mono text-slate-800 text-xs border border-slate-300/60 flex items-center gap-1.5">
          {row.period_label}
          <ChevronDown className={clsx("w-3.5 h-3.5 text-slate-500 transition-transform duration-200", expanded && "rotate-180")} />
        </span>
        <span className={clsx("text-base font-extrabold font-mono tracking-tight", netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
          {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      {expanded && (
        <div className="grid grid-cols-3 gap-2 text-xs pt-1 animate-in slide-in-from-top-2 fade-in duration-200">
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">체결승률(포지션)</span>
            <span className="font-mono font-semibold text-slate-800">{row.win_rate.toFixed(1)}% <span className="text-[10px] text-indigo-600 font-bold">({posWinRate.toFixed(1)}%)</span></span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">PF</span>
            <span className="font-mono font-semibold text-slate-800">
              {row.profit_factor >= 99.0 ? '99.0+' : row.profit_factor.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-rose-500 uppercase mb-0.5">MDD</span>
            <span className="font-mono font-semibold text-rose-600">{periodMdd.toFixed(1)}% <span className="text-[10px] text-slate-400">({globalMdd.toFixed(1)}%)</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
