import { useEffect, useState } from 'react';
import { BarChart3, CalendarClock, CalendarDays, CalendarRange, Loader2 } from 'lucide-react';
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
import { fetchStrategyReports, type StrategyReportBucket } from '../services/pythonApiService';
import { LiveTransitionChecklist } from '../components/dashboard/LiveTransitionChecklist';

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

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchStrategyReports(timeRange);
        if (!data) {
          setError('리포트 데이터를 불러오는데 실패했습니다.');
          setReportData(null);
        } else {
          setReportData(data.buckets);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '리포트 데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [timeRange]);

  // Aggregate Data for Chart — 기간별 순이익(바) + 누적 순이익(자산곡선 라인).
  // 두 시리즈 모두 달러 단위이므로 하나의 Y축을 공유한다 (이중축 금지).
  let cumulative = 0;
  let chartData = reportData
    ? [...reportData]
        .sort((a, b) => a.period_label.localeCompare(b.period_label))
        .map(item => {
          const netProfit = Math.round((item.gross_profit - item.gross_loss) * 100) / 100;
          cumulative = Math.round((cumulative + netProfit) * 100) / 100;
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
        <div className="flex items-center gap-4 w-full lg:w-auto flex-shrink-0">
          <div className="sfdc-icon-badge">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono">Performance Reports</p>
            <h1 className="text-3xl font-black text-slate-900 leading-tight tracking-tighter">성과 리포트</h1>
          </div>
        </div>

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
        ) : reportData && reportData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Col: Main Chart & Data Table */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
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
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
              <div className="sfdc-card overflow-hidden flex flex-col">
                <div className="p-8 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    기간별 퀀트 성과 상세 (Quant Precise Metrics)
                  </h2>
                  <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full uppercase tracking-wider">
                    Kelly Formula & Risk-Adjusted Matched
                  </span>
                </div>

                {/* Desktop / Tablet View (≥ 768px) — 100% Unchanged original table */}
                <div className="hidden md:block overflow-x-auto px-8 pb-8">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        <th className="py-4 px-2 lg:px-3">기간</th>
                        <th className="py-4 px-2 lg:px-3 text-right">순이익</th>
                        <th className="py-4 px-2 lg:px-3 text-right">총수익</th>
                        <th className="py-4 px-2 lg:px-3 text-right">총손실</th>
                        <th className="py-4 px-2 lg:px-3 text-right" title="체결 건수 승률 (괄호: Scale-Out 병합 포지션 승률)">
                          체결승률(포지션)
                        </th>
                        <th className="py-4 px-2 lg:px-3 text-right" title="체결 건수 (괄호: 포지션 라운드트립 수)">
                          총거래(포지션)
                        </th>
                        <th className="py-4 px-2 lg:px-3 text-right">평균 PnL</th>
                        <th className="py-4 px-2 lg:px-3 text-right text-indigo-600 font-black" title="1회 거래당 퀀트 기대값 (Expectancy E = p*W - (1-p)*L)">
                          기대값($E)
                        </th>
                        <th className="py-4 px-2 lg:px-3 text-right text-indigo-600 font-black" title="손실 변동성만 반영한 Sortino Ratio">
                          Sortino
                        </th>
                        <th className="py-4 px-2 lg:px-3 text-right">PF</th>
                        <th className="py-4 px-2 lg:px-3 text-right" title="기간 내 Local Peak 대비 MDD (괄호: 계좌 전체 MDD)">
                          기간(계좌) MDD
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {reportData.map((row, idx) => {
                        // 자바스크립트 부동소수점 오류 방지 (예: -0.00 표시 방지)
                        const netProfit = Math.round((row.gross_profit - row.gross_loss) * 100) / 100;
                        const posWinRate = row.pos_win_rate ?? row.win_rate;
                        const posTrades = row.pos_total_trades ?? row.total_trades;
                        const expectancy = row.expectancy ?? 0.0;
                        const sortino = row.sortino_ratio ?? 0.0;
                        const periodMdd = row.period_mdd ?? row.mdd;

                        return (
                          <tr key={idx} className="group hover:bg-slate-50/50 transition-all duration-300 whitespace-nowrap">
                            <td className="py-3 px-2 lg:px-3">
                              <div className="text-sm font-bold text-slate-800 tracking-tight">
                                {row.period_label}
                              </div>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right">
                              <span className={clsx(
                                "text-base font-bold tracking-tight",
                                netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-slate-400 group-hover:text-emerald-500 transition-colors">
                              +${row.gross_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-slate-400 group-hover:text-rose-500 transition-colors">
                              -${row.gross_loss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold">
                              <span className={clsx(row.win_rate >= 50 ? "text-slate-800" : "text-rose-600")}>
                                {row.win_rate.toFixed(1)}%
                              </span>
                              <span className="text-[11px] text-indigo-500 font-bold ml-1">
                                ({posWinRate.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-slate-500">
                              {row.total_trades} <span className="text-[11px] text-slate-400 font-normal">({posTrades}건)</span>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold">
                              <span className={clsx(row.avg_pnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {row.avg_pnl >= 0 ? '+' : '-'}${Math.abs(row.avg_pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-bold">
                              <span className={clsx(expectancy > 0 ? "text-indigo-600" : expectancy < 0 ? "text-rose-600" : "text-slate-400")}>
                                {expectancy >= 0 ? '+' : '-'}${Math.abs(expectancy).toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-bold text-indigo-600">
                              {sortino >= 99.0 ? '99.0+' : sortino.toFixed(2)}
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-slate-800">
                              {row.profit_factor >= 99.0 ? '99.0+' : row.profit_factor.toFixed(2)}
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-rose-600">
                              {periodMdd.toFixed(1)}% <span className="text-[11px] text-slate-400 font-normal">({row.mdd.toFixed(1)}%)</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View (< 768px) — Touch-friendly Card List */}
                <div className="block md:hidden px-6 pb-6 space-y-3">
                  {reportData.map((row, idx) => {
                    const netProfit = Math.round((row.gross_profit - row.gross_loss) * 100) / 100;
                    const posWinRate = row.pos_win_rate ?? row.win_rate;
                    const posTrades = row.pos_total_trades ?? row.total_trades;
                    const expectancy = row.expectancy ?? 0.0;
                    const sortino = row.sortino_ratio ?? 0.0;
                    const periodMdd = row.period_mdd ?? row.mdd;

                    return (
                      <div key={idx} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                          <span className="font-bold text-slate-900 text-sm">{row.period_label}</span>
                          <span className={clsx("text-base font-black tracking-tight", netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">체결승률(포지션)</span>
                            <span className="font-mono font-semibold text-slate-800">{row.win_rate.toFixed(1)}% <span className="text-[10px] text-indigo-500 font-bold">({posWinRate.toFixed(1)}%)</span></span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">총거래(포지션)</span>
                            <span className="font-mono font-semibold text-slate-700">{row.total_trades}건 <span className="text-[10px] text-slate-400">({posTrades}건)</span></span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-indigo-500 uppercase">기대값 ($E)</span>
                            <span className={clsx("font-mono font-black", expectancy >= 0 ? "text-indigo-600" : "text-rose-600")}>
                              {expectancy >= 0 ? '+' : '-'}${Math.abs(expectancy).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-indigo-500 uppercase">Sortino / PF</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {sortino >= 99.0 ? '99.0+' : sortino.toFixed(2)} / {row.profit_factor >= 99.0 ? '99.0+' : row.profit_factor.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">평균 PnL</span>
                            <span className={clsx("font-mono font-semibold", row.avg_pnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                              {row.avg_pnl >= 0 ? '+' : '-'}${Math.abs(row.avg_pnl).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-rose-500 uppercase">MDD</span>
                            <span className="font-mono font-semibold text-rose-600">{periodMdd.toFixed(1)}% <span className="text-[10px] text-slate-400">({row.mdd.toFixed(1)}%)</span></span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right Col: Checklist */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <LiveTransitionChecklist />
            </div>

          </div>
        ) : (
          <div className="h-[300px] flex flex-col items-center justify-center bg-white border border-slate-100 rounded-2xl text-slate-600 shadow-sm">
            해당 기간의 리포트 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
