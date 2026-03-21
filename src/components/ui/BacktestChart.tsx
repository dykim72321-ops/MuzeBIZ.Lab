import React, { useCallback, useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Activity, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BacktestChartProps {
  ticker: string;
}

export const BacktestChart: React.FC<BacktestChartProps> = ({ ticker }) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ strategyReturn: number; benchmarkReturn: number; alpha: number } | null>(null);

  const fetchBacktestData = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('run-backtest', {
        body: { ticker: ticker, period: '1y', initial_capital: 10000 }
      });
      
      if (invokeError) throw invokeError;
      
      if (data && data.chart_data) {
        setChartData(data.chart_data);
        setStats({
          strategyReturn: data.total_return_pct,
          benchmarkReturn: data.benchmark_return_pct,
          alpha: data.outperformance
        });
      }
    } catch (err: any) {
      console.error("Backtest fetch error:", err);
      setError(err.message || "Failed to load backtest data");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchBacktestData();
  }, [fetchBacktestData]);

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 mt-4 bg-slate-50 rounded-xl border border-slate-200 border-dashed animate-pulse">
        <Activity className="w-8 h-8 opacity-20 mb-2" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Simulating Backtest Matrix...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-rose-400 mt-4 bg-rose-50 rounded-xl border border-rose-100 border-dashed">
        <Activity className="w-8 h-8 opacity-20 mb-2" />
        <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">{error}</span>
        <button 
          onClick={() => fetchBacktestData()} 
          className="mt-4 px-4 py-2 bg-rose-600 text-white text-[10px] font-black rounded-lg hover:bg-rose-700 transition-colors uppercase tracking-widest"
        >
          Retry Matrix Simulation
        </button>
      </div>
    );
  }

  if (!chartData.length || !stats) return null;

  return (
    <div className="w-full bg-white rounded-xl relative overflow-hidden group">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 tracking-tight uppercase">
            <TrendingUp className="w-4 h-4 text-[#0176d3]" />
            1-Year Backtest Performance
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[#0176d3] uppercase tracking-tighter">
              v4 Momentum Engine
            </span>
          </div>
        </div>
        
        {/* Performance Stats */}
        <div className="flex gap-6 font-black">
          <div className="flex flex-col items-end">
            <span className="text-slate-400 text-[9px] tracking-[0.1em] uppercase mb-0.5">Strategy ROI</span>
            <span className={stats.strategyReturn >= 0 ? 'text-emerald-600 text-lg' : 'text-rose-600 text-lg'}>
              {stats.strategyReturn >= 0 ? '+' : ''}{stats.strategyReturn}%
            </span>
          </div>
          <div className="flex flex-col items-end pl-6 border-l border-slate-200">
            <span className="text-slate-400 text-[9px] tracking-[0.1em] uppercase mb-0.5">Alpha vs S&P500</span>
            <span className={stats.alpha >= 0 ? 'text-[#0176d3] text-lg' : 'text-amber-600 text-lg'}>
              {stats.alpha >= 0 ? '+' : ''}{stats.alpha}%
            </span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full relative -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} 
              tickMargin={12} 
              minTickGap={40} 
              axisLine={false} 
              tickLine={false} 
            />
            <YAxis 
              stroke="#94a3b8" 
              domain={['auto', 'auto']} 
              tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} 
              tickMargin={12} 
              axisLine={false} 
              tickLine={false} 
              tickFormatter={(value) => `$${value.toLocaleString()}`} 
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                borderColor: '#e2e8f0', 
                borderRadius: '8px', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                padding: '12px'
              }}
              itemStyle={{ fontWeight: '800', fontSize: '12px' }}
              labelStyle={{ color: '#64748b', fontSize: '10px', fontWeight: '800', marginBottom: '4px', textTransform: 'uppercase' }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }} 
              iconType="circle" 
              iconSize={8}
            />
            
            <Line 
              type="monotone" 
              dataKey="benchmark" 
              name="Market Hold" 
              stroke="#cbd5e1" 
              strokeWidth={2} 
              dot={false} 
              activeDot={{ r: 4, fill: '#94a3b8', stroke: '#fff', strokeWidth: 2 }} 
            />
            <Line 
              type="monotone" 
              dataKey="strategy" 
              name="v4 Quant Agent" 
              stroke="#0176d3" 
              strokeWidth={3} 
              dot={false} 
              activeDot={{ r: 6, fill: '#0176d3', stroke: '#fff', strokeWidth: 2 }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
