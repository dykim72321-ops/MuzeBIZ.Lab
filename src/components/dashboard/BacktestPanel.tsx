import { useState } from 'react';
import { Loader2, PlayCircle, BarChart3, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import clsx from 'clsx';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { runBacktest, type BacktestRunParams, type BacktestResult } from '../../services/pythonApiService';

export const BacktestPanel = () => {
  const [params, setParams] = useState<BacktestRunParams>({
    start_date: '2023-01-01',
    end_date: '',
    gamma: 0.8,
    delta: 1.5,
    lambda_val: 2.0,
    slippage_rate: 0.01,
    deviation_threshold: -0.07,
    target_atr: 5.0,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runBacktest(params);
      setResult(res);
    } catch (e: any) {
      setError(e.message || '백테스트 실행 실패');
    } finally {
      setLoading(false);
    }
  };

  const setParam = <K extends keyof BacktestRunParams>(key: K, value: BacktestRunParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6 pt-6 border-t border-blue-100">
      <div>
        <span className="text-xs font-bold text-blue-600 uppercase tracking-widest block mb-0.5">Backtest Engine</span>
        <h3 className="text-sm font-black text-indigo-900">DNA 전략 백테스트</h3>
        <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
          파라미터를 조정하고 실행해 전략 성과를 검증하세요. 결과는 15분간 캐시됩니다.
        </p>
      </div>

      {/* Parameter Form */}
      <div className="space-y-4">
        {/* Date inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">시작일</label>
            <input
              type="text"
              value={params.start_date}
              onChange={e => setParam('start_date', e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full px-3 py-2 text-xs font-mono bg-blue-50 border border-blue-200 rounded-lg text-blue-800 focus:outline-none focus:border-indigo-300"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">종료일 (빈칸=오늘)</label>
            <input
              type="text"
              value={params.end_date}
              onChange={e => setParam('end_date', e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full px-3 py-2 text-xs font-mono bg-blue-50 border border-blue-200 rounded-lg text-blue-800 focus:outline-none focus:border-indigo-300"
            />
          </div>
        </div>

        {/* Gamma slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">γ Gamma (추세 민감도)</label>
            <span className="text-xs font-black font-mono text-indigo-600">{params.gamma!.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.5} max={2.0} step={0.1}
            value={params.gamma}
            onChange={e => setParam('gamma', parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[9px] font-mono text-blue-400 mt-0.5">
            <span>0.5</span><span>2.0</span>
          </div>
        </div>

        {/* Delta slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">δ Delta (변동성 가중)</label>
            <span className="text-xs font-black font-mono text-indigo-600">{params.delta!.toFixed(1)}</span>
          </div>
          <input
            type="range" min={1.0} max={3.0} step={0.1}
            value={params.delta}
            onChange={e => setParam('delta', parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[9px] font-mono text-blue-400 mt-0.5">
            <span>1.0</span><span>3.0</span>
          </div>
        </div>

        {/* Deviation threshold slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">괴리 임계값 (손절 기준)</label>
            <span className="text-xs font-black font-mono text-rose-500">{(params.deviation_threshold! * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range" min={-0.20} max={-0.03} step={0.01}
            value={params.deviation_threshold}
            onChange={e => setParam('deviation_threshold', parseFloat(e.target.value))}
            className="w-full accent-rose-500"
          />
          <div className="flex justify-between text-[9px] font-mono text-blue-400 mt-0.5">
            <span>-20%</span><span>-3%</span>
          </div>
        </div>

        {/* Target ATR slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">목표 ATR</label>
            <span className="text-xs font-black font-mono text-indigo-600">{params.target_atr!.toFixed(1)}</span>
          </div>
          <input
            type="range" min={2.0} max={10.0} step={0.5}
            value={params.target_atr}
            onChange={e => setParam('target_atr', parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[9px] font-mono text-blue-400 mt-0.5">
            <span>2.0</span><span>10.0</span>
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all active:scale-95 disabled:bg-blue-300 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> 백테스트 실행 중...</>
          ) : (
            <><PlayCircle className="w-4 h-4" /> 백테스트 실행</>
          )}
        </button>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && !result.is_empty && (
        <div className="space-y-4 pt-4 border-t border-blue-100">
          <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-500" /> 백테스트 결과
          </h4>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '총 거래', value: `${result.total_trades}회`, color: 'text-blue-900' },
              { label: '승률', value: `${result.win_rate.toFixed(1)}%`, color: result.win_rate >= 50 ? 'text-emerald-600' : 'text-rose-600' },
              { label: '평균 수익률', value: `${result.avg_pnl >= 0 ? '+' : ''}${result.avg_pnl.toFixed(2)}%`, color: result.avg_pnl >= 0 ? 'text-emerald-600' : 'text-rose-600' },
              { label: 'Profit Factor', value: `${result.profit_factor.toFixed(2)}x`, color: result.profit_factor >= 1 ? 'text-emerald-600' : 'text-rose-600' },
              { label: 'MDD', value: `${result.mdd.toFixed(1)}%`, color: 'text-rose-600' },
              { label: '평균 보유일', value: `${result.avg_days.toFixed(1)}일`, color: 'text-blue-700' },
            ].map(stat => (
              <div key={stat.label} className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block mb-1">{stat.label}</span>
                <span className={clsx('text-sm font-black font-mono', stat.color)}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Equity Curve Chart */}
          {result.equity_curve && result.equity_curve.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">자산 곡선 ($10,000 기준)</span>
              </div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.equity_curve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="btColorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="trade" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px' }}
                      formatter={(v: any) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, '자산']}
                      labelFormatter={(l: any) => `Trade #${l}`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#btColorValue)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-blue-500">
                <span>
                  최종: <span className={clsx('font-black', (result.equity_curve[result.equity_curve.length - 1]?.value ?? 10000) >= 10000 ? 'text-emerald-600' : 'text-rose-600')}>
                    ${(result.equity_curve[result.equity_curve.length - 1]?.value ?? 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </span>
                {(() => {
                  const final = result.equity_curve[result.equity_curve.length - 1]?.value ?? 10000;
                  const ret = ((final - 10000) / 10000) * 100;
                  return (
                    <span className={clsx('font-black flex items-center gap-1', ret >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      {ret >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                    </span>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {result && result.is_empty && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs font-semibold text-amber-700 text-center">
          해당 기간에 발생한 거래가 없습니다. 기간 또는 파라미터를 조정해 보세요.
        </div>
      )}
    </div>
  );
};
