import { useEffect, useState } from 'react';
import { BarChart3, CalendarClock, CalendarDays, CalendarRange, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
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

  // Aggregate Data for Chart
  let chartData = reportData
    ? [...reportData]
        .sort((a, b) => a.period_label.localeCompare(b.period_label))
        .map(item => ({
          period: item.period_label,
          winRate: item.win_rate,
          tradeCount: item.total_trades,
        }))
    : [];

  // Recharts AreaChart는 데이터가 1개일 때 선을 그리지 못하므로, 시각적 인지를 위해 점을 하나 더 찍어줍니다.
  if (chartData.length === 1) {
    chartData = [
      { ...chartData[0], period: `${chartData[0].period} (Start)` },
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

      <div className="max-w-[1440px] mx-auto space-y-6 relative z-10">
        
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
              
              {/* Win Rate Trend Chart */}
              <div className="sfdc-card p-8">
                <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-8 uppercase tracking-widest">
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                  승률 트렌드 ({TIME_RANGE_LABELS[timeRange]})
                </h2>
                <div className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorWinRate" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="period" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#0f172a', fontWeight: '500', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(val: number | undefined, _name, item) => {
                          const tradeCount = item?.payload?.tradeCount;
                          return [`${(val ?? 0).toFixed(1)}% (${tradeCount ?? 0}건)`, 'Win Rate'];
                        }}
                      />
                      <Area type="monotone" dataKey="winRate" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorWinRate)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Data Table */}
              <div className="sfdc-card overflow-hidden flex flex-col">
                <div className="p-8 pb-4">
                  <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    기간별 성과 상세
                  </h2>
                </div>
                <div className="overflow-x-auto px-8 pb-8">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        <th className="py-4 px-2 lg:px-3">기간</th>
                        <th className="py-4 px-2 lg:px-3 text-right">순이익</th>
                        <th className="py-4 px-2 lg:px-3 text-right">총수익</th>
                        <th className="py-4 px-2 lg:px-3 text-right">총손실</th>
                        <th className="py-4 px-2 lg:px-3 text-right">승률</th>
                        <th className="py-4 px-2 lg:px-3 text-right">총 거래</th>
                        <th className="py-4 px-2 lg:px-3 text-right">평균 PnL</th>
                        <th className="py-4 px-2 lg:px-3 text-right">Profit Factor</th>
                        <th className="py-4 px-2 lg:px-3 text-right">MDD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {reportData.map((row, idx) => {
                        // 자바스크립트 부동소수점 오류 방지 (예: -0.00 표시 방지)
                        const netProfit = Math.round((row.gross_profit - row.gross_loss) * 100) / 100;
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
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-slate-500">{row.total_trades}</td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold">
                              <span className={clsx(row.avg_pnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {row.avg_pnl >= 0 ? '+' : '-'}${Math.abs(row.avg_pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-slate-800">{row.profit_factor.toFixed(2)}</td>
                            <td className="py-3 px-2 lg:px-3 text-right font-mono text-sm font-semibold text-rose-600">{row.mdd.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
