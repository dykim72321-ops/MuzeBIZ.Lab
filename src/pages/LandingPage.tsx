import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import {
  X,
  Search,
  LayoutDashboard,
  BarChart3,
  Menu
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

// Custom styles for marquee animation
const styleSheet = `
  @keyframes marquee {
    0% { transform: translateX(0%); }
    100% { transform: translateX(-50%); }
  }
  .animate-marquee {
    animation: marquee 90s linear infinite;
  }
`;

// Mock Data for Recharts
const mockChartData = Array.from({ length: 80 }, (_, i) => {
  const basePrice = 64250 + Math.sin(i * 0.1) * 200 + i * 2;
  return {
    time: `10:${(i + 10).toString().padStart(2, '0')}`,
    price: Number(basePrice.toFixed(2)),
    sma20: Number((basePrice - 45).toFixed(2)),
    sma50: Number((basePrice - 110).toFixed(2)),
    upperBand: Number((basePrice + 180).toFixed(2)),
    lowerBand: Number((basePrice - 180).toFixed(2)),
    volume: Math.floor(Math.random() * 800) + 200
  };
});



const tickerData = [
  { symbol: 'AAPL', price: '189.43', change: 1.24 },
  { symbol: 'MSFT', price: '420.55', change: 0.89 },
  { symbol: 'NVDA', price: '942.31', change: 2.45 },
  { symbol: 'GOOGL', price: '178.12', change: -0.34 },
  { symbol: 'AMZN', price: '185.00', change: 1.12 },
  { symbol: 'META', price: '502.11', change: -1.20 },
  { symbol: 'TSLA', price: '175.22', change: -2.31 },
  { symbol: 'BRK.B', price: '405.10', change: 0.15 },
  { symbol: 'AVGO', price: '1330.2', change: 3.12 },
  { symbol: 'LLY', price: '780.40', change: 0.45 },
  { symbol: 'JPM', price: '198.20', change: 0.22 },
  { symbol: 'V', price: '275.10', change: -0.12 },
  { symbol: 'BTC/USD', price: '64,281.4', change: 0.14 },
  { symbol: 'ETH/USD', price: '3,492.1', change: -0.85 },
];

export default function LandingPage() {
  const { isLoading, isAuthenticated, signIn } = useMockAuth();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [targetRoute, setTargetRoute] = useState('/stock/dashboard');
  
  const [liveChartData, setLiveChartData] = useState(mockChartData);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveChartData(prev => {
        const newData = [...prev.slice(1)];
        const last = prev[prev.length - 1];
        
        // Institutional grade tick simulation
        const timeVal = Date.now() / 10000;
        const trend = Math.sin(timeVal) * 2;
        const noise = (Math.random() - 0.5) * 8;
        const newPrice = Number((last.price + trend + noise).toFixed(2));
        
        const newSma20 = Number((last.sma20 * 0.95 + newPrice * 0.05).toFixed(2));
        const newSma50 = Number((last.sma50 * 0.98 + newPrice * 0.02).toFixed(2));
        
        const volatility = Math.abs(newPrice - newSma20) + 60;
        const newUpper = Number((newSma20 + volatility * 2).toFixed(2));
        const newLower = Number((newSma20 - volatility * 2).toFixed(2));
        
        const newVolume = Math.floor(Math.random() * 800) + 200;

        const [hours, mins] = last.time.split(':').map(Number);
        let newMins = mins + 1;
        let newHours = hours;
        if (newMins >= 60) {
          newMins -= 60;
          newHours += 1;
        }
        const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;

        newData.push({ 
          time: newTime, 
          price: newPrice, 
          sma20: newSma20, 
          sma50: newSma50, 
          upperBand: newUpper, 
          lowerBand: newLower, 
          volume: newVolume 
        });
        return newData;
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn('');
    setShowLoginModal(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate(targetRoute, { replace: true });
    }
  }, [isAuthenticated, navigate, targetRoute]);

  if (isAuthenticated) return null;

  const handleNavClick = (route: string) => {
    setTargetRoute(route);
    setShowLoginModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Header - Matched exactly to TopNav design */}
      <header className="absolute top-0 w-full z-50 bg-white/95 backdrop-blur-xl border-b border-blue-200 shadow-sm font-sans">
        <div className="flex justify-between items-center px-6 h-16 w-full">
          
          {/* Left: Logo & Nav */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-white rounded-lg border border-blue-200 flex items-center justify-center shadow-sm overflow-hidden p-1 group-hover:border-blue-400 transition-all">
                <img src="/logo.png" alt="MuzeBIZ Logo" className="w-full h-full object-contain pointer-events-none select-none group-hover:scale-110 transition-transform" />
              </div>
              <span className="text-xl font-black text-black tracking-tighter uppercase font-mono pointer-events-none select-none">
                MuzeBIZ<span className="text-blue-700">.Lab</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-6">
              <button onClick={() => handleNavClick('/stock/dashboard')} className="py-5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2 text-blue-900 border-transparent hover:text-black hover:border-blue-300">
                <LayoutDashboard className="w-4 h-4" />
                <span>통합지휘소</span>
              </button>
              <button onClick={() => handleNavClick('/reports')} className="py-5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2 text-blue-900 border-transparent hover:text-black hover:border-blue-300">
                <BarChart3 className="w-4 h-4" />
                <span>성과 리포트</span>
              </button>
              <button onClick={() => handleNavClick('/parts-search')} className="py-5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2 text-blue-900 border-transparent hover:text-black hover:border-blue-300">
                <Search className="w-4 h-4" />
                <span>제품 검색</span>
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-4">
            <button onClick={() => handleNavClick('/stock/dashboard')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all text-sm font-medium shadow-md">
                로그인
            </button>
            <button
              className="lg:hidden p-2 text-blue-900 hover:text-black transition-all cursor-pointer"
              onClick={() => handleNavClick('/stock/dashboard')}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>
      <main className="pt-16">
        {/* Ticker Tape */}
        <div className="w-full bg-slate-900 border-b border-slate-800 flex items-center h-10 overflow-hidden relative">
          <style>{styleSheet}</style>
          <div className="flex whitespace-nowrap animate-marquee">
            {[...tickerData, ...tickerData, ...tickerData, ...tickerData].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 px-6 border-r border-slate-800 shrink-0 hover:bg-slate-800/50 transition-colors cursor-default">
                <span className="font-label-mono text-xs font-bold text-slate-300">{item.symbol}</span>
                <span className="font-data-tabular text-xs text-white">{item.price}</span>
                <span className={`font-data-tabular text-[10px] ${item.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {item.change >= 0 ? '+' : ''}{item.change}%
                </span>
              </div>
            ))}
          </div>
        </div>
{/* Hero & Terminal Simulator */}
<section className="relative py-unit-large md:py-24 overflow-hidden">
<div className="max-w-container-max mx-auto px-margin-desktop text-center mb-unit-large">
<span className="bg-primary-fixed text-on-primary-fixed-variant px-unit-medium py-unit-xsmall rounded-full font-label-mono text-xs mb-unit-medium inline-block">v4.2 ENTERPRISE READY</span>
<h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface mb-unit-medium max-w-4xl mx-auto leading-tight">
                    지능형 알고리즘으로 설계된 <br className="hidden md:block"/>
<span className="text-primary">비즈니스 인텔리전스</span>의 정점
                </h1>
<p className="font-body-md text-on-surface-variant max-w-2xl mx-auto mb-unit-large">
                    최고 수준의 데이터 분석과 예측 알고리즘을 통해 차세대 비즈니스 인텔리전스 환경을 구축하십시오. 
                </p>
</div>
{/* Simulator Area */}
<div className="max-w-container-max mx-auto px-margin-desktop">
<div className="terminal-bg rounded-xl shadow-2xl overflow-hidden border border-outline/30 p-unit-small md:p-unit-medium relative">
{/* Terminal Header */}
<div className="flex items-center justify-between border-b border-outline/20 pb-unit-small mb-unit-small">
<div className="flex items-center gap-unit-small">
<div className="flex gap-1.5">
<div className="w-2.5 h-2.5 rounded-full bg-error"></div>
<div className="w-2.5 h-2.5 rounded-full bg-secondary-container"></div>
<div className="w-2.5 h-2.5 rounded-full bg-primary-fixed"></div>
</div>
<span className="font-label-mono text-[10px] text-outline ml-unit-small">MUZEBIZ_ANALYTICS_CORE</span>
</div>
<div className="flex gap-unit-medium">
<span className="text-secondary-fixed font-label-mono text-[10px] flex items-center gap-1">
<span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed animate-pulse"></span>
                                LIVE FEED
                            </span>
<span className="text-outline font-label-mono text-[10px]">UTC+09:00</span>
</div>
</div>
<div className="grid grid-cols-12 gap-gutter">
{/* Main Chart Area */}
<div className="col-span-12 lg:col-span-8 space-y-gutter">
<div className="bg-surface/5 rounded p-unit-medium border border-outline/10 h-80 relative overflow-hidden">
<div className="absolute top-unit-small left-unit-small flex gap-unit-medium z-10">
<div>
<div className="font-label-mono text-[10px] text-outline uppercase">BTC/USD</div>
<div className="font-data-tabular text-headline-md text-on-primary-container">64,281.40</div>
</div>
<div>
<div className="font-label-mono text-[10px] text-outline uppercase">VOLATILITY</div>
<div className="font-data-tabular text-headline-md text-secondary-fixed">0.142%</div>
</div>
</div>

            <div className="absolute inset-0 w-full h-full opacity-80 pt-10">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={liveChartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorPriceModern" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} opacity={0.05} />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={5} />
                    <YAxis yAxisId="left" domain={['dataMin - 100', 'dataMax + 100']} stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val.toLocaleString()}`} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 2000]} hide />
                    
                    {/* Bollinger Bands */}
                    <Line yAxisId="left" type="linear" dataKey="upperBand" stroke="#475569" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                    <Line yAxisId="left" type="linear" dataKey="lowerBand" stroke="#475569" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                    
                    {/* Volume */}
                    <Bar yAxisId="right" dataKey="volume" fill="#334155" opacity={0.5} isAnimationActive={false} />
                    
                    {/* Price and SMAs */}
                    <Area yAxisId="left" type="linear" dataKey="price" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorPriceModern)" isAnimationActive={false} />
                    <Line yAxisId="left" type="linear" dataKey="sma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line yAxisId="left" type="linear" dataKey="sma50" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 4" isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

<div className="absolute top-1/4 left-1/3 w-2 h-2 bg-secondary-container rounded-full ring-4 ring-secondary-container/20 animate-ping"></div>
<div className="absolute bottom-1/3 right-1/4 w-2 h-2 bg-error rounded-full ring-4 ring-error/20"></div>
</div>
{/* Metric Cards Grid */}
<div className="grid grid-cols-3 gap-unit-small">
<div className="bg-surface/5 border border-outline/10 rounded p-unit-small">
<div className="font-label-mono text-[10px] text-outline mb-1">ALPHA GENERATION</div>
<div className="font-data-tabular text-body-md text-secondary-container">+14.2%</div>
</div>
<div className="bg-surface/5 border border-outline/10 rounded p-unit-small">
<div className="font-label-mono text-[10px] text-outline mb-1">EXECUTION LATENCY</div>
<div className="font-data-tabular text-body-md text-on-primary-container">0.8ms</div>
</div>
<div className="bg-surface/5 border border-outline/10 rounded p-unit-small">
<div className="font-label-mono text-[10px] text-outline mb-1">LIQUIDITY ACCESS</div>
<div className="font-data-tabular text-body-md text-on-primary-container">82 SOURCES</div>
</div>
</div>
</div>
{/* Live Order Book */}
<div className="col-span-12 lg:col-span-4 bg-surface/5 border border-outline/10 rounded p-unit-small overflow-hidden h-full flex flex-col">
<div className="flex justify-between font-label-mono text-[10px] text-outline mb-unit-small px-2">
<span>PRICE</span>
<span>SIZE</span>
<span>TIME</span>
</div>
<div className="relative flex-1 order-book-scroll overflow-hidden">
<div className="animate-scroll-up space-y-1 font-data-tabular text-[12px]">
<div className="flex justify-between text-error/80 px-2"><span>64282.5</span><span>1.420</span><span>14:02:11</span></div>
<div className="flex justify-between text-error/80 px-2"><span>64282.4</span><span>0.051</span><span>14:02:10</span></div>
<div className="flex justify-between text-error/80 px-2"><span>64282.2</span><span>2.114</span><span>14:02:09</span></div>
<div className="flex justify-between text-secondary-fixed/80 px-2"><span>64281.4</span><span>0.100</span><span>14:02:08</span></div>
<div className="flex justify-between text-secondary-fixed/80 px-2"><span>64281.3</span><span>1.229</span><span>14:02:07</span></div>
<div className="flex justify-between text-secondary-fixed/80 px-2"><span>64281.2</span><span>0.881</span><span>14:02:06</span></div>
{/* Duplicated for seamless loop */}
<div className="flex justify-between text-error/80 px-2"><span>64282.5</span><span>1.420</span><span>14:02:11</span></div>
<div className="flex justify-between text-error/80 px-2"><span>64282.4</span><span>0.051</span><span>14:02:10</span></div>
<div className="flex justify-between text-error/80 px-2"><span>64282.2</span><span>2.114</span><span>14:02:09</span></div>
<div className="flex justify-between text-secondary-fixed/80 px-2"><span>64281.4</span><span>0.100</span><span>14:02:08</span></div>
</div>
</div>
<div className="mt-auto pt-unit-small border-t border-outline/10">
<button className="w-full py-1.5 bg-primary text-white font-label-mono text-[11px] rounded-sm hover:bg-primary-container transition-colors">
                                    INITIATE SMART ROUTE
                                </button>
</div>
</div>
</div>
</div>
</div>
</section>
{/* Trust Section */}
<section className="py-unit-large border-y border-outline-variant/10 bg-surface-container-low">
<div className="max-w-container-max mx-auto px-margin-desktop text-center">
<p className="font-label-mono text-body-sm text-on-surface-variant/70 mb-unit-large">TRUSTED BY 500+ GLOBAL INSTITUTIONS</p>
<div className="flex flex-wrap justify-center items-center gap-12 opacity-40 grayscale">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-2xl" data-icon="account_balance">account_balance</span>
<span className="font-bold text-xl tracking-tight">GLOBALBANK</span>
</div>
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-2xl" data-icon="security">security</span>
<span className="font-bold text-xl tracking-tight">SECURECAPITAL</span>
</div>
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-2xl" data-icon="hub">hub</span>
<span className="font-bold text-xl tracking-tight">NETWORKS_X</span>
</div>
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-2xl" data-icon="diamond">diamond</span>
<span className="font-bold text-xl tracking-tight">PREMIER_ASSET</span>
</div>
</div>
</div>
</section>
{/* Feature Grid (Bento Style) */}
<section className="py-24 bg-surface">
<div className="max-w-container-max mx-auto px-margin-desktop">
<div className="grid grid-cols-12 gap-gutter">
{/* Feature 1: Large */}
<div className="col-span-12 md:col-span-8 glass-card p-unit-large rounded-xl border border-outline-variant/30 relative overflow-hidden group">
<div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-primary/10 transition-all duration-500"></div>
<span className="material-symbols-outlined text-primary text-4xl mb-unit-medium" data-icon="bolt">bolt</span>
<h3 className="font-headline-md text-headline-md mb-unit-small">정밀 실행 엔진 (Precision Execution)</h3>
<p className="font-body-md text-on-surface-variant max-w-xl">
                            시장의 미세한 변동성을 포착하여 최적의 가격에서 거래를 실행합니다. 다중 경로 스마트 오더 라우팅(SOR)을 통해 슬리피지를 최소화하고 유동성을 극대화합니다.
                        </p>
<div className="mt-unit-large grid grid-cols-2 gap-unit-medium">
<div className="flex items-center gap-2 font-label-mono text-body-sm text-primary">
<span className="material-symbols-outlined text-sm" data-icon="check_circle">check_circle</span>
                                Smart Order Routing
                            </div>
<div className="flex items-center gap-2 font-label-mono text-body-sm text-primary">
<span className="material-symbols-outlined text-sm" data-icon="check_circle">check_circle</span>
                                Dark Pool Access
                            </div>
</div>
</div>
{/* Feature 2: Side */}
<div className="col-span-12 md:col-span-4 bg-primary-container text-on-primary p-unit-large rounded-xl border border-primary/20 flex flex-col justify-between">
<div>
<span className="material-symbols-outlined text-4xl mb-unit-medium" data-icon="verified_user">verified_user</span>
<h3 className="font-headline-md text-headline-md mb-unit-small">고도화된 리스크 관리</h3>
<p className="font-body-sm opacity-90">
                                실시간 노출 관리 및 자동화된 서킷 브레이커 시스템을 통해 기관 자산을 안전하게 보호합니다.
                            </p>
</div>
<div className="mt-unit-large">
<div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
<div className="h-full bg-secondary-container w-3/4"></div>
</div>
<div className="flex justify-between mt-1 text-[10px] font-label-mono">
<span>SAFE ZONE</span>
<span>75% CAPACITY</span>
</div>
</div>
</div>
{/* Feature 3: Bottom Left */}
<div className="col-span-12 md:col-span-4 glass-card p-unit-large rounded-xl border border-outline-variant/30">
<span className="material-symbols-outlined text-secondary text-4xl mb-unit-medium" data-icon="speed">speed</span>
<h3 className="font-headline-md text-headline-md mb-unit-small">0.8ms 초저지연</h3>
<p className="font-body-sm text-on-surface-variant">
                            하드웨어 가속 기술(FPGA)을 기반으로 한 인프라를 통해 경쟁자보다 한 발 앞선 실행 속도를 제공합니다.
                        </p>
</div>
{/* Feature 4: Bottom Right */}
<div className="col-span-12 md:col-span-8 glass-card p-unit-large rounded-xl border border-outline-variant/30 flex items-center gap-unit-large">
<div className="hidden lg:block w-48 h-32 bg-surface-container-high rounded-lg overflow-hidden relative">
</div>
<div>
<h3 className="font-headline-md text-headline-md mb-unit-small">포괄적인 분석 대시보드</h3>
<p className="font-body-md text-on-surface-variant">
                                맞춤형 리포팅 도구를 통해 전략 성과를 분석하고 인사이트를 도출하십시오. 모든 데이터는 실시간 API를 통해 외부 시스템과 통합 가능합니다.
                            </p>
</div>
</div>
</div>
</div>
</section>

</main>
      <footer className="bg-surface-container-lowest border-t border-outline-variant/30 w-full mt-unit-large">
<div className="max-w-container-max mx-auto px-margin-desktop py-unit-large grid grid-cols-2 md:grid-cols-4 gap-gutter items-start">
<div className="col-span-2 md:col-span-1">
<div className="flex items-center gap-unit-small mb-unit-medium">
<img src="/logo.png" alt="MuzeBIZ.Lab" className="h-8 w-auto object-contain pointer-events-none select-none" />
</div>
<p className="font-body-sm text-on-surface-variant max-w-xs">
                    Advanced infrastructure for high-performance business intelligence.
                </p>
</div>
<div className="space-y-unit-small">
<h4 className="font-label-mono text-xs text-on-surface-variant/60 uppercase">Platform</h4>
<nav className="flex flex-col gap-2">
<a className="font-body-sm text-on-surface-variant hover:text-primary transition-all" href="#">Markets</a>
<a className="font-body-sm text-on-surface-variant hover:text-primary transition-all" href="#">Liquidity</a>
<a className="font-body-sm text-on-surface-variant hover:text-primary transition-all" href="#">Execution</a>
</nav>
</div>
<div className="space-y-unit-small">
<h4 className="font-label-mono text-xs text-on-surface-variant/60 uppercase">Resources</h4>
<nav className="flex flex-col gap-2">
<a className="font-body-sm text-on-surface-variant hover:text-primary transition-all" href="#">API Docs</a>
<a className="font-body-sm text-on-surface-variant hover:text-primary transition-all" href="#">Security</a>
<a className="font-body-sm text-on-surface-variant hover:text-primary transition-all" href="#">Compliance</a>
</nav>
</div>
<div className="space-y-unit-small">
<h4 className="font-label-mono text-xs text-on-surface-variant/60 uppercase">Institutional</h4>
<button className="text-primary font-bold font-body-sm hover:underline transition-all block">Contact Sales</button>
<button className="text-primary font-bold font-body-sm hover:underline transition-all block">Request Trial</button>
</div>
</div>
<div className="max-w-container-max mx-auto px-margin-desktop py-unit-medium border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-unit-small">
<p className="font-body-sm text-body-sm text-on-surface-variant opacity-80 uppercase tracking-widest">
                © 2026 MuzeBIZ.Lab. BUSINESS INTELLIGENCE PRECISION.
            </p>
<div className="flex gap-unit-medium opacity-60">
<span className="material-symbols-outlined text-lg cursor-pointer hover:text-primary" data-icon="share">share</span>
<span className="material-symbols-outlined text-lg cursor-pointer hover:text-primary" data-icon="language">language</span>
<span className="material-symbols-outlined text-lg cursor-pointer hover:text-primary" data-icon="info">info</span>
</div>
</div>
</footer>
      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-950/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg border border-blue-200 flex items-center justify-center p-1">
                      <img src="/logo.png" alt="Logo" className="w-full h-full object-contain pointer-events-none select-none" />
                    </div>
                    <span className="text-xl font-black text-black font-mono tracking-tighter">MuzeBIZ<span className="text-blue-700">.Lab</span></span>
                  </div>
                  <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">시스템 접속</h3>
                <p className="text-slate-500 mb-8 font-medium">시스템에 안전하게 접속하세요.</p>
                <form onSubmit={handleLoginSubmit}>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <span className="animate-spin text-xl">◌</span> : '시스템 접속하기'}
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
