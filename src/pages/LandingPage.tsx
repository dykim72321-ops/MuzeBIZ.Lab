import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import {
  X,
  TrendingDown,
  Scale,
  Activity,
  Calculator,
  ShieldAlert,
  TerminalSquare,
  Cpu,
  Crosshair,
  LayoutGrid,
  FlaskConical,
  Search,
  Bell,
  ActivitySquare
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Area, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';

// Custom styles for marquee animation
const styleSheet = `
  @keyframes marquee {
    0% { transform: translateX(0%); }
    100% { transform: translateX(-50%); }
  }
  .animate-marquee {
    animation: marquee 30s linear infinite;
  }
`;

// Mock Data for Recharts
const mockChartData = [
  { time: '09:30', price: 150.2, sma: 149.5, exit: 148.0 },
  { time: '10:00', price: 152.4, sma: 150.1, exit: 148.5 },
  { time: '10:30', price: 151.8, sma: 150.8, exit: 149.2 },
  { time: '11:00', price: 154.2, sma: 151.4, exit: 149.8 },
  { time: '11:30', price: 155.1, sma: 152.2, exit: 150.5 },
  { time: '12:00', price: 153.8, sma: 152.9, exit: 151.0 },
  { time: '12:30', price: 156.4, sma: 153.5, exit: 151.5 },
  { time: '13:00', price: 158.2, sma: 154.2, exit: 152.2 },
  { time: '13:30', price: 157.9, sma: 155.0, exit: 153.0 },
  { time: '14:00', price: 159.5, sma: 155.8, exit: 153.8 },
  { time: '14:30', price: 161.2, sma: 156.5, exit: 154.5 },
  { time: '15:00', price: 162.8, sma: 157.4, exit: 155.4 },
];

export default function LandingPage() {
  const { isLoading, isAuthenticated, signIn } = useMockAuth();
  const navigate = useNavigate();
  
  // State for login modal
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('admin@muzestop.lab');
  const [password, setPassword] = useState('hunterpassword');
  // Optional: keep track of where to route after login
  const [targetRoute, setTargetRoute] = useState('/dna-simulator');
  
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

  const mockTickers = [
    { sym: 'AAPL', price: '173.50', change: '+1.2%', up: true },
    { sym: 'NVDA', price: '884.23', change: '+3.4%', up: true },
    { sym: 'TSLA', price: '184.11', change: '-2.1%', up: false },
    { sym: 'MSFT', price: '420.55', change: '+0.5%', up: true },
    { sym: 'AMD', price: '164.21', change: '-1.2%', up: false },
    { sym: 'META', price: '502.11', change: '+1.8%', up: true },
    { sym: 'AMZN', price: '178.22', change: '-0.3%', up: false },
    { sym: 'GOOGL', price: '144.12', change: '+0.9%', up: true },
  ];

  return (
    <div className="min-h-screen bg-[#0f111a] text-[#dce1fb] overflow-x-hidden font-sans relative">
      <style>{styleSheet}</style>
      
      {/* Background atmospheric glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#2563EB]/15 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#67E8F9]/10 blur-[150px] pointer-events-none rounded-full" />

      {/* Top Header - Image Matched Navbar */}
      <header className="fixed top-0 w-full z-50 bg-[#1e2235] border-b border-[#2a2f45] shadow-lg">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-3 select-none cursor-pointer group">
            <div className="w-8 h-8 bg-[#2a2f45] rounded-full flex items-center justify-center border border-[#3b415a]">
              <ActivitySquare className="w-4 h-4 text-[#8b9de0]" />
            </div>
            <span className="text-[15px] font-black text-white tracking-wide uppercase font-mono flex items-center gap-0.5">
              MUZEBIZ<span className="text-[#8b9de0]">.LAB</span>
            </span>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button 
              onClick={() => handleNavClick('/stock/dashboard')}
              className="flex items-center gap-2 px-4 py-2 bg-[#2a2f45] rounded-md text-[#8b9de0] hover:bg-[#343b57] hover:text-white transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="text-[12px] font-bold">통합 지휘소</span>
            </button>

            <button 
              onClick={() => handleNavClick('/dna-simulator')}
              className="flex items-center gap-2 px-4 py-2 text-[#8d90a0] hover:text-white hover:bg-[#2a2f45] rounded-md transition-colors cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="text-[12px] font-bold">DNA 시뮬레이터</span>
            </button>
            <button 
              onClick={() => handleNavClick('/stock/search')}
              className="flex items-center gap-2 px-4 py-2 text-[#8d90a0] hover:text-white hover:bg-[#2a2f45] rounded-md transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-[12px] font-bold">제품 검색</span>
            </button>
          </nav>

          {/* Right Area (Status & Noti & Login) */}
          <div className="flex items-center gap-4 sm:gap-5">
            <button
              onClick={() => handleNavClick('/dna-simulator')}
              className="hidden sm:flex px-4 py-1.5 bg-transparent border border-[#3b415a] hover:bg-[#3b415a] hover:text-white text-[#8d90a0] text-[11px] font-bold uppercase tracking-widest font-mono rounded-md transition-colors cursor-pointer"
            >
              LOGIN
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#151828] border border-[#2a2f45] rounded-full">
              <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest font-mono">SYSTEM ONLINE</span>
            </div>
            <div className="relative cursor-pointer group">
              <Bell className="w-5 h-5 text-[#8d90a0] group-hover:text-white transition-colors" />
              <div className="absolute top-0 right-0 w-2 h-2 bg-[#EF4444] rounded-full border border-[#1e2235]" />
            </div>
          </div>
        </div>

        {/* Real-time Ticker Tape (Attached below nav) */}
        <div className="h-8 border-t border-[#2a2f45] bg-[#151828] overflow-hidden flex items-center text-[11px] font-mono whitespace-nowrap shadow-inner">
          <div className="flex animate-marquee min-w-max">
            {[...mockTickers, ...mockTickers, ...mockTickers].map((t, i) => (
              <div key={i} className="flex items-center gap-2 px-6 border-r border-[#2a2f45]">
                <span className="text-[#8d90a0]">{t.sym}</span>
                <span className="text-[#dce1fb]">{t.price}</span>
                <span className={t.up ? "text-[#10B981]" : "text-[#EF4444]"}>{t.change}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-40 pb-24">
        {/* Hero Section - Structural Layout */}
        <section className="max-w-[1440px] mx-auto px-6 pt-6 pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            
            {/* Left: Text & CTA */}
            <div className="space-y-8">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#1e2235]/80 border border-[#3b415a] text-[#8b9de0] text-[10px] font-bold font-mono uppercase tracking-widest shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
              >
                <Cpu className="w-3.5 h-3.5" />
                Live: Quantitative Engine v2.0
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.15] tracking-tight"
              >
                직관을 넘어서는 데이터,<br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#b4c5ff] to-[#67E8F9]">터미널 하나로 끝내세요</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-[#8d90a0] text-base md:text-lg leading-relaxed max-w-lg font-medium"
              >
                기관 레벨의 실시간 스캐닝과 퀀트 알고리즘이 결합된 하이엔드 트레이딩 콕핏. 
                차트 위에 그려지는 수학적 진입 타점, 켈리 기준 포지션 사이징을 단 1초 만에 시뮬레이션 합니다.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center gap-4 pt-4"
              >
                <button 
                  onClick={() => handleNavClick('/stock/dashboard')} 
                  className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1d4ed8] border border-[#60A5FA]/30 text-white px-8 py-4 rounded-md font-bold text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] cursor-pointer flex items-center justify-center gap-3 font-mono uppercase tracking-widest"
                >
                  <Activity className="w-4 h-4 text-[#67E8F9]" />
                  지휘소 접속하기
                </button>
                <div className="text-[10px] font-mono text-[#434655] uppercase tracking-widest">
                  Secure Access • Terminal UI
                </div>
              </motion.div>
            </div>

            {/* Right: Realistic Terminal UI with Recharts */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="relative w-full max-w-2xl mx-auto lg:mr-0"
            >
              {/* Terminal Frame */}
              <div className="bg-[#1e2235] rounded-xl border border-[#3b415a] shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col h-[460px]">
                
                {/* Terminal Header */}
                <div className="h-10 bg-[#151828] border-b border-[#3b415a] flex items-center px-4 justify-between">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#EF4444]" />
                    <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
                    <div className="w-3 h-3 rounded-full bg-[#10B981]" />
                  </div>
                  <div className="text-[11px] text-[#8d90a0] font-mono tracking-widest flex items-center gap-2">
                    <ActivitySquare className="w-3 h-3" /> MZT_SIMULATOR_ENV.exe
                  </div>
                  <div className="w-12"></div> {/* Spacer for centering */}
                </div>

                {/* Terminal Content Area */}
                <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden bg-[#0f111a]">
                  {/* Top Stats Row */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-[#1e2235] border border-[#2a2f45] rounded-lg p-3">
                      <div className="text-[10px] text-[#8d90a0] font-mono mb-1">ASSET</div>
                      <div className="text-xl font-bold text-white font-mono leading-none">NVDA</div>
                      <div className="text-[10px] text-[#10B981] font-mono mt-1.5">+3.42%</div>
                    </div>
                    <div className="bg-[#1e2235] border border-[#2a2f45] rounded-lg p-3">
                      <div className="text-[10px] text-[#8d90a0] font-mono mb-1">DNA SCORE</div>
                      <div className="text-xl font-black text-[#67E8F9] tabular-nums leading-none">98.4</div>
                      <div className="text-[10px] text-[#10B981] font-mono mt-1.5">+12 STR</div>
                    </div>
                    <div className="bg-[#1e2235] border border-[#2a2f45] rounded-lg p-3">
                      <div className="text-[10px] text-[#8d90a0] font-mono mb-1">MOMENTUM</div>
                      <div className="text-xl font-black text-[#10B981] tabular-nums leading-none">STRONG</div>
                      <div className="text-[10px] text-[#8d90a0] font-mono mt-1.5">EMA ALIGNED</div>
                    </div>
                    <div className="bg-[#1e2235] border border-[#2a2f45] rounded-lg p-3 shadow-[inset_0_0_15px_rgba(37,99,235,0.15)]">
                      <div className="text-[10px] text-[#8b9de0] font-mono mb-1">KELLY ALLOC</div>
                      <div className="text-xl font-black text-white tabular-nums leading-none">24.5%</div>
                      <div className="text-[10px] text-[#8d90a0] font-mono mt-1.5">OPTIMAL</div>
                    </div>
                  </div>

                  {/* Chart & Status Split */}
                  <div className="flex-1 grid grid-cols-3 gap-4 h-full min-h-0">
                    
                    {/* Realistic Recharts Graph Area */}
                    <div className="col-span-2 bg-[#151828] border border-[#2a2f45] rounded-lg relative overflow-hidden flex flex-col p-3">
                      <div className="flex justify-between items-center mb-2 px-1">
                        <div className="text-[11px] font-bold text-[#8d90a0] flex items-center gap-1.5">
                          <TrendingDown className="w-3.5 h-3.5 text-[#10B981]" />
                          PRICE ACTION & EXIT LINE
                        </div>
                        <div className="text-[10px] text-[#67E8F9] font-mono border border-[#67E8F9]/30 bg-[#67E8F9]/10 px-1.5 py-0.5 rounded">LIVE</div>
                      </div>
                      <div className="flex-1 w-full min-h-[150px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={mockChartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f45" vertical={false} />
                            <XAxis dataKey="time" stroke="#8d90a0" fontSize={10} tickLine={false} axisLine={false} dy={5} />
                            <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="#8d90a0" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#1e2235', border: '1px solid #3b415a', borderRadius: '4px', fontSize: '11px', color: '#fff' }}
                              itemStyle={{ color: '#67E8F9' }}
                            />
                            <Area type="monotone" dataKey="price" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                            <Line type="monotone" dataKey="sma" stroke="#10B981" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                            <Line type="stepAfter" dataKey="exit" stroke="#EF4444" strokeWidth={1.5} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex gap-4 px-2 mt-2">
                        <div className="flex items-center gap-1.5 text-[9px] text-[#8d90a0] font-mono"><div className="w-2 h-0.5 bg-[#2563EB]"></div> PRICE</div>
                        <div className="flex items-center gap-1.5 text-[9px] text-[#8d90a0] font-mono"><div className="w-2 h-0.5 bg-[#10B981] border-t border-dashed"></div> SMA 20</div>
                        <div className="flex items-center gap-1.5 text-[9px] text-[#8d90a0] font-mono"><div className="w-2 h-0.5 bg-[#EF4444]"></div> CHANDELIER EXIT</div>
                      </div>
                    </div>

                    {/* Execution & Live Status Panel */}
                    <div className="col-span-1 bg-[#1e2235] border border-[#2a2f45] rounded-lg p-4 flex flex-col justify-between">
                      <div>
                        <div className="text-[10px] text-[#8d90a0] font-mono mb-4 flex items-center gap-1 border-b border-[#2a2f45] pb-2">
                          <Crosshair className="w-3 h-3" /> RISK METRICS
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center border-b border-[#2a2f45] pb-1">
                            <span className="text-[10px] text-[#8d90a0] font-mono">Win Rate</span>
                            <span className="text-xs text-white font-mono tabular-nums">65.0%</span>
                          </div>
                          <div className="flex justify-between items-center border-b border-[#2a2f45] pb-1">
                            <span className="text-[10px] text-[#8d90a0] font-mono">P/L Ratio</span>
                            <span className="text-xs text-[#10B981] font-mono tabular-nums">1 : 2.5</span>
                          </div>
                          <div className="flex justify-between items-center border-b border-[#2a2f45] pb-1">
                            <span className="text-[10px] text-[#8d90a0] font-mono">Stop Loss</span>
                            <span className="text-xs text-[#EF4444] font-mono tabular-nums">$155.40</span>
                          </div>
                        </div>
                        
                        {/* Live Log Mock */}
                        <div className="mt-4 p-2 bg-[#0f111a] rounded border border-[#2a2f45] h-16 overflow-hidden relative">
                          <div className="text-[8px] font-mono text-[#8d90a0] space-y-1">
                            <p className="text-[#10B981]">&gt; Volatility check... OK</p>
                            <p>&gt; Calculating Kelly f...</p>
                            <p>&gt; Risk adjusted to 24.5%</p>
                            <p className="animate-pulse">&gt; Awaiting execution...</p>
                          </div>
                        </div>
                      </div>
                      <button className="w-full bg-[#10B981] hover:bg-[#059669] text-white py-2 rounded text-[11px] font-bold font-mono uppercase tracking-widest transition-colors shadow-[0_0_10px_rgba(16,185,129,0.2)] mt-3">
                        Execute Long
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature Grid - Bento Box Layout */}
        <section className="py-24 bg-[#0a0c13] border-t border-[#1e2235]">
          <div className="max-w-[1440px] mx-auto px-6">
            <div className="mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2 uppercase font-mono">
                System Capabilities <span className="text-[#67E8F9] text-xl">_</span>
              </h2>
              <p className="text-sm text-[#8d90a0] font-mono uppercase tracking-widest">
                High-Density Quantitative Modules
              </p>
            </div>

            {/* CSS Grid for Hairline borders (Bento Box) */}
            <div className="bg-[#2a2f45] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] rounded-xl overflow-hidden border border-[#2a2f45]">
              {[
                {
                  icon: Activity,
                  title: 'DNA SCORE MATRIX',
                  desc: 'RSI, RVOL, MACD, ADX 기반의 멀티 팩터 평가 모델. 종목의 펀더멘탈과 기술적 모멘텀을 100점 만점 수치로 스코어링하여 즉각적인 매력도를 산출합니다.',
                  val: 'ALGO.01'
                },
                {
                  icon: ShieldAlert,
                  title: 'MOMENTUM INTERCEPTOR',
                  desc: '현재가와 15분봉 20 EMA 이격을 실시간 스캔합니다. 거래량 없는 페이크 상승장(Whipsaw) 진입을 차단하는 2단계 보안 알고리즘입니다.',
                  val: 'ALGO.02'
                },
                {
                  icon: Scale,
                  title: 'KELLY SIZING ENGINE',
                  desc: '예상 승률, 손익비(R:R), 주가 변동성(ATR) 변수를 종합 연산하여, 계좌 파산을 방지하는 수학적 최적 매수 비중(Kelly F)을 자동 계산합니다.',
                  val: 'ALGO.03'
                },
                {
                  icon: TrendingDown,
                  title: 'CHANDELIER EXIT PREDICT',
                  desc: '고정된 손절선 대신 종목 고유의 평균 참변동성(ATR) 마진을 적용한 동적 샹들리에 엑시트 트레일링 스탑 라인을 차트 상에 시각화합니다.',
                  val: 'ALGO.04'
                },
                {
                  icon: Calculator,
                  title: 'PENNY STOCK HARDCUT',
                  desc: '$1 이하 동전주와 대형주의 틱 밸류 차이를 인식하고, 페니 주식에 대해서는 손실을 막기 위한 극한의 하드컷(Hard-cut) 기준을 강제 적용합니다.',
                  val: 'ALGO.05'
                },
                {
                  icon: TerminalSquare,
                  title: 'BACKEND SYNCHRONIZATION',
                  desc: '당사 퀀트 파이프라인의 핵심인 파이썬 기반 Pulse Engine 서버와 수식 오차율 0%로 완벽하게 동일한 결과값을 웹 브라우저에서 보장합니다.',
                  val: 'SYS.OK'
                }
              ].map((f, i) => (
                <div key={i} className="bg-[#151828] p-8 hover:bg-[#1e2235] transition-colors relative group">
                  <div className="flex justify-between items-start mb-6">
                    <f.icon className="w-6 h-6 text-[#2563EB] group-hover:text-[#67E8F9] transition-colors" />
                    <span className="text-[10px] text-[#434655] font-mono">{f.val}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-3 tracking-widest uppercase font-mono">{f.title}</h3>
                  <p className="text-xs text-[#8d90a0] leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer Area */}
      <footer className="border-t border-[#1e2235] py-8 bg-[#0f111a] relative z-10 font-mono text-[10px] text-[#434655] uppercase flex flex-col md:flex-row items-center justify-between px-6 max-w-[1440px] mx-auto">
        <div className="flex items-center gap-2 mb-4 md:mb-0">
          <ActivitySquare className="w-3 h-3 text-[#2563EB]" />
          <span>MuzeBIZ.LAB Terminal Build v2.1</span>
        </div>
        <div className="text-right">
          <span className="text-[#EF4444]/60">RISK DISCLOSURE:</span> SIMULATION DATA IS BASED ON HISTORICAL STATS.<br/> PAST PERFORMANCE IS NOT INDICATIVE OF FUTURE RESULTS.
        </div>
      </footer>

      {/* Login Modal Overlay */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm cursor-pointer"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="bg-[#1e2235] border border-[#3b415a] shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] rounded-xl w-full max-w-sm p-6 relative z-10"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#2563EB] to-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.5)]" />
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-widest font-mono">AUTH</h2>
                  <p className="text-[10px] text-[#67E8F9] uppercase tracking-widest font-mono">Terminal Protocol</p>
                </div>
                <button 
                  onClick={() => setShowLoginModal(false)}
                  className="text-[#8d90a0] hover:text-[#dce1fb] p-1.5 rounded bg-[#151828] border border-[#2a2f45] transition-colors cursor-pointer hover:border-[#67E8F9]/50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleLoginSubmit}>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#8d90a0] font-mono">User ID</label>
                  <input 
                    type="email" 
                    className="w-full bg-[#0f111a] border border-[#2a2f45] rounded-md px-3 py-2 text-[#dce1fb] outline-none focus:border-[#67E8F9] focus:shadow-[0_0_10px_rgba(103,232,249,0.15)] transition-all font-mono text-xs"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#8d90a0] font-mono">Auth Token</label>
                  <input 
                    type="password" 
                    className="w-full bg-[#0f111a] border border-[#2a2f45] rounded-md px-3 py-2 text-[#dce1fb] outline-none focus:border-[#67E8F9] focus:shadow-[0_0_10px_rgba(103,232,249,0.15)] transition-all font-mono text-xs"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    readOnly
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] border border-[#60A5FA]/30 text-white rounded-md shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all mt-4 text-[11px] font-bold uppercase tracking-widest font-mono cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Verifying...' : `Connect to ${targetRoute === '/dna-simulator' ? 'Simulator' : targetRoute === '/stock/dashboard' ? 'Dashboard' : targetRoute.split('/').pop()}`}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
