import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Globe, ShieldCheck, TrendingUp } from 'lucide-react';
import type { IntelData } from '../../types/muzepart';

interface MarketIntelProps {
  intelData: IntelData | null;
  resultsCount: number;
}

export const MuzepartMarketIntel: React.FC<MarketIntelProps> = ({ intelData, resultsCount }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch mb-6">
      {/* Global Inventory Card */}
      <div className="lg:col-span-4 bg-white/95 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)] p-6 rounded-[24px] transition-all duration-500 flex flex-col group relative overflow-hidden h-[340px]">
        {/* Decorative ambient background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-[40px] pointer-events-none transform translate-x-1/2 -translate-y-1/2 group-hover:bg-blue-500/10 transition-colors duration-500" />
        
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100/60 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[14px] text-white shadow-[0_4px_20px_rgba(59,130,246,0.3)] group-hover:scale-105 transition-transform duration-500">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Global Inventory</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Distribution by Region/Dealer</p>
              </div>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col justify-center min-h-0">
            {!intelData ? (
              <p className="text-xs text-center text-slate-400 font-semibold animate-pulse">검색 후 업데이트됩니다.</p>
            ) : (
              <div className="flex items-center h-full gap-2">
                <div className="w-[140px] h-full flex-shrink-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={intelData.inventoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={58}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {intelData.inventoryData.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#6366f1', '#ec4899', '#f97316'][index % 9]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          fontSize: '12px', 
                          borderRadius: '16px', 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(226, 232, 240, 0.8)', 
                          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)',
                          color: '#0f172a',
                          fontWeight: '600',
                          padding: '8px 12px'
                        }} 
                        itemStyle={{ color: '#334155', fontWeight: 'bold' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="flex-1 h-full overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-50 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 transition-colors">
                  <div className="flex flex-col gap-2.5 justify-center min-h-full py-2">
                    {intelData.inventoryData.map((entry: any, index: number) => {
                      const color = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#6366f1', '#ec4899', '#f97316'][index % 9];
                      return (
                        <div key={index} className="flex items-center gap-2 group/legend cursor-default">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform group-hover/legend:scale-125" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
                          <span className="text-[11px] font-bold text-slate-600 truncate flex-1 group-hover/legend:text-slate-900 transition-colors">{entry.name}</span>
                          <span className="text-[10px] font-mono font-bold text-slate-400 group-hover/legend:text-slate-600">{entry.value.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Supply Risk Map Card */}
      <div className="lg:col-span-4 bg-white/95 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)] p-6 rounded-[24px] transition-all duration-500 flex flex-col group relative overflow-hidden h-[340px]">
        {/* Decorative ambient background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[40px] pointer-events-none transform translate-x-1/2 -translate-y-1/2 group-hover:bg-emerald-500/10 transition-colors duration-500" />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100/60 flex-shrink-0">
            <div className="flex flex-col">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[14px] text-white shadow-[0_4px_20px_rgba(16,185,129,0.3)] group-hover:scale-105 transition-transform duration-500">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Supply Risk Index</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Live Procurement Stability Map</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-6 px-1">
            {!intelData ? (
              <p className="text-xs text-center text-slate-400 font-semibold animate-pulse">검색 후 업데이트됩니다.</p>
            ) : (
              <>
                <div className="relative group/bar">
                  <div className="flex justify-between text-[12px] font-bold mb-2">
                    <span className="text-slate-800 tracking-wide flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                      재고 부족 <span className="text-slate-400 font-medium text-[10px] ml-1">(High Risk)</span>
                    </span>
                    <span className="text-slate-600 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shadow-sm">{intelData.riskData.find((d: any) => d.name === 'High')?.value || 0} 판매처</span>
                  </div>
                  <div className="h-3 bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50 shadow-inner p-[1px]">
                    <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full shadow-[0_0_12px_rgba(244,63,94,0.6)] transition-all duration-1000 ease-out" style={{ width: `${((intelData.riskData.find((d: any) => d.name === 'High')?.value || 0) / Math.max(1, resultsCount)) * 100}%` }} />
                  </div>
                </div>
                <div className="relative group/bar">
                  <div className="flex justify-between text-[12px] font-bold mb-2">
                    <span className="text-slate-800 tracking-wide flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                      재고 한정 <span className="text-slate-400 font-medium text-[10px] ml-1">(Medium Risk)</span>
                    </span>
                    <span className="text-slate-600 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shadow-sm">{intelData.riskData.find((d: any) => d.name === 'Medium')?.value || 0} 판매처</span>
                  </div>
                  <div className="h-3 bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50 shadow-inner p-[1px]">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-400 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.6)] transition-all duration-1000 ease-out" style={{ width: `${((intelData.riskData.find((d: any) => d.name === 'Medium')?.value || 0) / Math.max(1, resultsCount)) * 100}%` }} />
                  </div>
                </div>
                <div className="relative group/bar">
                  <div className="flex justify-between text-[12px] font-bold mb-2">
                    <span className="text-slate-800 tracking-wide flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      재고 안정 <span className="text-slate-400 font-medium text-[10px] ml-1">(Low Risk)</span>
                    </span>
                    <span className="text-slate-600 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shadow-sm">{intelData.riskData.find((d: any) => d.name === 'Low')?.value || 0} 판매처</span>
                  </div>
                  <div className="h-3 bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50 shadow-inner p-[1px]">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.6)] transition-all duration-1000 ease-out" style={{ width: `${((intelData.riskData.find((d: any) => d.name === 'Low')?.value || 0) / Math.max(1, resultsCount)) * 100}%` }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Price Comparison Card */}
      <div className="lg:col-span-4 bg-white/95 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(244,63,94,0.12)] p-6 rounded-[24px] transition-all duration-500 flex flex-col group relative overflow-hidden h-[340px]">
        {/* Decorative ambient background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-[40px] pointer-events-none transform translate-x-1/2 -translate-y-1/2 group-hover:bg-rose-500/10 transition-colors duration-500" />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100/60 flex-shrink-0">
            <div className="flex flex-col">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-rose-500 to-pink-600 rounded-[14px] text-white shadow-[0_4px_20px_rgba(244,63,94,0.3)] group-hover:scale-105 transition-transform duration-500">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Market Price Drift</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Cross-Distributor Price Benchmark</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            {!intelData ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-400 font-semibold animate-pulse">검색 후 업데이트됩니다.</p>
              </div>
            ) : !intelData.priceData || intelData.priceData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-400 font-semibold">가격 정보가 없습니다.</p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0 relative mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={intelData.priceData} margin={{ top: 10, right: 0, bottom: 20, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                      <YAxis 
                        tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} 
                        axisLine={false}
                        tickLine={false}
                        width={40} 
                        tickFormatter={(val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toString()}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ 
                          fontSize: '12px', 
                          borderRadius: '16px', 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(226, 232, 240, 0.8)', 
                          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)',
                          color: '#0f172a',
                          padding: '8px 12px'
                        }}
                        itemStyle={{ color: '#334155', fontWeight: 'bold' }}
                        formatter={(value: any, _name: any, props: any) => [
                          `${Number(value).toLocaleString()} ${props.payload?.currency || 'USD'}`, 'Unit Price'
                        ]}
                        labelFormatter={(label: any) => {
                          const item = intelData.priceData.find((d: any) => d.name === label);
                          return item?.fullName || String(label);
                        }}
                      />
                      <Bar dataKey="price" fill="url(#priceGradient)" radius={[6, 6, 0, 0]} barSize={24}>
                        <Cell fill="url(#priceGradient)" />
                      </Bar>
                      <defs>
                        <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {intelData.priceStats && (
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 px-4 pt-3 pb-3 bg-slate-50/80 rounded-[14px] mt-3 border border-slate-100 shadow-sm flex-shrink-0">
                    <div className="flex flex-col items-center">
                      <span className="text-slate-400 text-[9px] uppercase tracking-wider mb-1">Min</span>
                      <span className="text-emerald-500 font-mono text-xs">${intelData.priceStats.min.toLocaleString()}</span>
                    </div>
                    <div className="w-[1px] h-6 bg-slate-200" />
                    <div className="flex flex-col items-center">
                      <span className="text-slate-400 text-[9px] uppercase tracking-wider mb-1">Avg</span>
                      <span className="text-blue-500 font-mono text-xs">${intelData.priceStats.avg.toFixed(2)}</span>
                    </div>
                    <div className="w-[1px] h-6 bg-slate-200" />
                    <div className="flex flex-col items-center">
                      <span className="text-slate-400 text-[9px] uppercase tracking-wider mb-1">Max</span>
                      <span className="text-rose-500 font-mono text-xs">${intelData.priceStats.max.toLocaleString()}</span>
                    </div>
                    {intelData.priceStats.spread > 0 && (
                      <>
                        <div className="w-[1px] h-6 bg-slate-200" />
                        <div className="flex flex-col items-center">
                          <span className="text-slate-400 text-[9px] uppercase tracking-wider mb-1">Spread</span>
                          <span className="text-amber-500 font-mono text-xs">{intelData.priceStats.spread.toFixed(1)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
