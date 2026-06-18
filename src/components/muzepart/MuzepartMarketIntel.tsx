import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
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
      <div className="lg:col-span-4 bg-white border border-slate-200/85 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl text-white shadow-lg">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Global Inventory</h3>
                <p className="text-xs text-slate-650 font-bold">Distribution by Region/Dealer</p>
              </div>
            </div>
          </div>
          <div className="h-[200px] flex items-center justify-center">
            {!intelData ? (
              <p className="text-xs text-slate-500 font-semibold">검색 후 업데이트됩니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <PieChart>
                    <Pie
                      data={intelData.inventoryData}
                      cx="35%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {intelData.inventoryData.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#6366f1', '#ec4899', '#f97316'][index % 9]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        fontSize: '11px', 
                        borderRadius: '12px', 
                        backgroundColor: '#ffffff', 
                        border: '1px solid #e2e8f0', 
                        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)',
                        color: '#0f172a' 
                      }} 
                    />
                    <Legend 
                      layout="vertical" 
                      verticalAlign="middle" 
                      align="right" 
                      wrapperStyle={{ 
                        fontSize: '11px', 
                        lineHeight: '14px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        width: '55%',
                        color: '#475569'
                      }} 
                    />
                  </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Supply Risk Map Card */}
      <div className="lg:col-span-4 bg-white border border-slate-200/85 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl text-white shadow-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Supply Risk Index</h3>
                  <p className="text-xs text-slate-650 font-bold">Live Procurement Stability Map</p>
                </div>
              </div>
            </div>
          </div>
          <div className="h-[200px] flex flex-col justify-center gap-4 px-2">
            {!intelData ? (
              <p className="text-xs text-center text-slate-500 font-semibold">검색 후 업데이트됩니다.</p>
            ) : (
              <>
                <div className="relative">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-rose-600">재고 부족 (High Risk)</span>
                    <span className="text-slate-700 font-mono">{intelData.riskData.find((d: any) => d.name === 'High')?.value || 0} 개 판매처</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-250">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${((intelData.riskData.find((d: any) => d.name === 'High')?.value || 0) / Math.max(1, resultsCount)) * 100}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">재고 0개 (품절 또는 EOL 의심)</p>
                </div>
                <div className="relative">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-amber-600">재고 한정 (Medium Risk)</span>
                    <span className="text-slate-700 font-mono">{intelData.riskData.find((d: any) => d.name === 'Medium')?.value || 0} 개 판매처</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-250">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${((intelData.riskData.find((d: any) => d.name === 'Medium')?.value || 0) / Math.max(1, resultsCount)) * 100}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">재고 1~100개 (수급 주의)</p>
                </div>
                <div className="relative">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-600">재고 안정 (Low Risk)</span>
                    <span className="text-slate-700 font-mono">{intelData.riskData.find((d: any) => d.name === 'Low')?.value || 0} 개 판매처</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-250">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${((intelData.riskData.find((d: any) => d.name === 'Low')?.value || 0) / Math.max(1, resultsCount)) * 100}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">재고 100개 초과 (수급 원활)</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Price Comparison Card */}
      <div className="lg:col-span-4 bg-white border border-slate-200/85 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-tr from-rose-600 to-pink-500 rounded-xl text-white shadow-lg">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Market Price Drift</h3>
                  <p className="text-xs text-slate-650 font-bold">Cross-Distributor Price Benchmark</p>
                </div>
              </div>
            </div>
          </div>
          <div className="h-[200px]">
            {!intelData ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-500 font-semibold">검색 후 업데이트됩니다.</p>
              </div>
            ) : !intelData.priceData || intelData.priceData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-500 font-semibold">가격 정보가 없습니다.</p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                    <BarChart data={intelData.priceData} margin={{ top: 15, right: 5, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis 
                        tick={{ fontSize: 11, fill: '#475569' }} 
                        width={40} 
                        tickFormatter={(val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toString()}
                      />
                      <Tooltip
                        contentStyle={{ 
                          fontSize: '11px', 
                          borderRadius: '12px', 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e2e8f0', 
                          boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)',
                          color: '#0f172a' 
                        }}
                        formatter={(value: any, _name: any, props: any) => [
                          `${Number(value).toLocaleString()} ${props.payload?.currency || 'USD'}`, '단가 (Unit Price)'
                        ]}
                        labelFormatter={(label: any) => {
                          const item = intelData.priceData.find((d: any) => d.name === label);
                          return item?.fullName || String(label);
                        }}
                      />
                      <Bar dataKey="price" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {intelData.priceStats && (
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1 pt-2.5 border-t border-slate-100">
                    <span>Min: <span className="text-emerald-600 font-mono">${intelData.priceStats.min.toLocaleString()}</span></span>
                    <span>Avg: <span className="text-slate-800 font-mono">${intelData.priceStats.avg.toFixed(2)}</span></span>
                    <span>Max: <span className="text-rose-600 font-mono">${intelData.priceStats.max.toLocaleString()}</span></span>
                    {intelData.priceStats.spread > 0 && (
                      <span className="text-amber-600 font-mono">Spread: {intelData.priceStats.spread.toFixed(1)}%</span>
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
