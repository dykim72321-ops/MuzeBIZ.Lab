import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import { useMarketEngine } from '../hooks/useMarketEngine';
import { 
  Activity, 
  Globe, 
  Lock, 
  ArrowRight, 
  Loader2, 
  Search, 
  Bell, 
  Star, 
  Flame, 
  Play, 
  Laptop, 
  ChevronDown, 
  Check, 
  X, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Cpu,
  Apple,
  Target
} from 'lucide-react';

export default function LandingPage() {
  const { isLoading, isAuthenticated, signIn, signOut } = useMockAuth();
  const navigate = useNavigate();
  
  const { pulseMap, isConnected } = useMarketEngine();
  const pulseItems = Object.values(pulseMap).filter(p => p.price !== null).sort((a, b) => (b.price || 0) - (a.price || 0));
  
  // Real-time or default values
  const capsule1 = pulseItems[0] || { ticker: '000990', price: 54300 };
  const capsule2 = pulseItems[1] || { ticker: '007070', price: 12500 };
  const capsule3 = pulseItems[2] || { ticker: '003380', price: 8900 };
  const chartTop = pulseItems[0] || { ticker: '298380', price: 145000 };

  // State for login modal
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('admin@muzestop.lab');
  const [password, setPassword] = useState('hunterpassword');
  
  // State for search bar
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Countdown Timer State
  const [timeLeft, setTimeLeft] = useState({
    hours: 26,
    minutes: 46,
    seconds: 29
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        } else {
          clearInterval(timer);
          return prev;
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (val: number) => String(val).padStart(2, '0');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn('');
    setShowLoginModal(false);
  };

  // Redirect to dashboard immediately if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/stock/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // If already authenticated, do not render landing page
  if (isAuthenticated) return null;

  // Pre-Login Hero View (Upgraded to Investing.com Theme)
  return (
    <div className="min-h-screen bg-[#0b1222] text-slate-200 overflow-x-hidden font-sans relative">
      {/* Background Ambient Glows */}
      <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-radial from-indigo-500/10 to-transparent rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-radial from-cyan-500/5 to-transparent rounded-full blur-[100px] pointer-events-none z-0" />
      
      {/* Top Header Panel */}
      <header className="fixed top-0 w-full z-50 bg-[#0b1222]/95 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
        <div className="flex justify-between items-center w-full px-6 py-3 h-16 max-w-[1440px] mx-auto">
          {/* Logo & Search */}
          <div className="flex items-center gap-8">
            <div className="text-2xl font-black tracking-tighter text-white cursor-pointer select-none">
              MuzeBIZ<span className="text-[#f97316]">.com</span>
            </div>
            
            {/* Search Bar */}
            <div className={`relative hidden lg:block transition-all duration-300 ${isSearchFocused ? 'w-[450px]' : 'w-[350px]'}`}>
              <input 
                className="w-full bg-[#11192e] text-slate-200 text-sm px-4 pr-10 py-2 rounded-md border border-slate-800 focus:outline-none focus:border-slate-700 placeholder:text-slate-500"
                placeholder="웹사이트 검색" 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-4">
            <button className="bg-[#f97316] text-white text-[11px] font-black tracking-wide px-3 py-1.5 rounded hover:brightness-110 transition-all flex items-center gap-1 cursor-pointer">
              55% 할인 - 반짝 세일
            </button>
            <div className="flex items-center gap-4 text-xs font-bold font-sans">
              <button 
                onClick={() => setShowLoginModal(true)} 
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                로그인
              </button>
              <span className="text-slate-700">/</span>
              <button 
                onClick={() => setShowLoginModal(true)} 
                className="text-white hover:text-indigo-400 transition-colors cursor-pointer"
              >
                무료 회원가입
              </button>
            </div>
            <div className="flex items-center gap-2.5 text-slate-500 border-l border-slate-900 pl-4">
              <Bell className="cursor-pointer hover:text-indigo-400 w-4.5 h-4.5 transition-colors" />
              <div className="w-1.5 h-1.5 bg-[#f97316] rounded-full animate-pulse" />
            </div>
          </div>
        </div>

        {/* Main Navigation Row */}
        <nav className="border-t border-slate-900/60 overflow-x-auto no-scrollbar">
          <div className="flex items-center px-6 h-11 max-w-[1440px] mx-auto gap-6 whitespace-nowrap text-xs font-semibold text-slate-400">
            <button onClick={async () => { await signIn(''); navigate('/stock/dashboard'); }} className="text-[#a3a6ff] border-b-2 border-[#a3a6ff] h-full flex items-center px-1 font-bold cursor-pointer">
              통합지휘소
            </button>
            <button onClick={async () => { await signIn(''); navigate('/parts-search'); }} className="hover:text-slate-200 transition-colors h-full flex items-center px-1 font-bold cursor-pointer">
              제품검색
            </button>
            <button onClick={async () => { await signIn(''); navigate('/watchlist'); }} className="hover:text-slate-200 transition-colors h-full flex items-center px-1 font-bold cursor-pointer">
              모니터링 오빗
            </button>
          </div>
        </nav>
      </header>

      {/* Sub Navigation Bar removed */}

      {/* Main Content Area */}
      <main className="relative max-w-[1440px] mx-auto px-6 pt-16 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        
        {/* Left Column: Hero Text */}
        <div className="lg:col-span-7 space-y-8">
          {/* Limited Time Sale Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f97316]/10 border border-[#f97316]/20 text-[#f97316] text-xs font-semibold">
            <span className="font-bold">반짝 세일</span>
            <span className="text-white font-mono tracking-wider">
              {formatTime(timeLeft.hours)}시간 : {formatTime(timeLeft.minutes)}분 : {formatTime(timeLeft.seconds)}초
            </span>
            <span className="bg-[#f97316] text-white text-[9px] font-black px-1.5 py-0.5 rounded ml-1">55% 할인</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.1] tracking-tight">
            다음 투자를 <br/>
            <span className="text-[#f97316]">전설적으로</span> 만들어 보세요
          </h1>

          {/* Description */}
          <p className="text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed font-medium">
            진지한 투자자들이 투자를 실행하기 전에 의존하는 데이터, 도구, 그리고 AI 기반 투자 아이디어입니다.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 pt-2">
            <button 
              onClick={() => setShowLoginModal(true)} 
              className="bg-[#f97316] hover:bg-[#ea580c] text-white px-8 py-4 rounded font-bold text-base shadow-[0_10px_30px_-10px_rgba(249,115,22,0.4)] transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
            >
              무료로 시작하기
            </button>
            <button 
              onClick={() => setShowLoginModal(true)} 
              className="bg-transparent border border-slate-800 hover:border-slate-700 hover:bg-[#11192e]/45 text-white px-8 py-4 rounded font-bold text-base transition-all cursor-pointer active:scale-95"
            >
              할인받고 구독하기
            </button>
          </div>

          {/* Social Proof (Ratings) */}
          <div className="pt-8 flex items-center gap-4 border-t border-slate-900 max-w-lg">
            <div className="flex -space-x-2.5">
              <div className="w-8 h-8 rounded-full border-2 border-[#020617] overflow-hidden bg-slate-800">
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&q=80" className="w-full h-full object-cover" alt="User" />
              </div>
              <div className="w-8 h-8 rounded-full border-2 border-[#020617] overflow-hidden bg-slate-800">
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=64&q=80" className="w-full h-full object-cover" alt="User" />
              </div>
              <div className="w-8 h-8 rounded-full border-2 border-[#020617] overflow-hidden bg-slate-800">
                <img src="https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=64&q=80" className="w-full h-full object-cover" alt="User" />
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-300">
                전 세계 5,000만 투자자가 신뢰합니다
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
                <span className="text-yellow-500 flex items-center">★ 4.6/5</span>
                <span>(130만 개 리뷰)</span>
                <span className="text-slate-700">|</span>
                <span className="flex items-center gap-1">
                  <Laptop className="w-3.5 h-3.5 text-slate-400" />
                  <Apple className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] bg-slate-900 px-1 py-0.5 rounded font-mono">PLAY</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Hero Visual (Red glowing chart container) */}
        <div className="lg:col-span-5 relative">
          <div className="dark-glass-panel rounded-3xl p-6 border border-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
            
            {/* Grid Overlay inside card */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:30px_30px]" />

            {/* Badges on top of card */}
            <div className="flex justify-between items-center mb-10 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8.5 h-8.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Activity className="w-4.5 h-4.5 text-indigo-400" />
                </div>
                <div className="leading-tight">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono block">Realtime Quant AI</span>
                  <span className="text-xs font-bold text-white">실시간 포트폴리오 스캔</span>
                </div>
              </div>

              {/* Top Mini Badges */}
              <div className="flex gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isConnected ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'}`}>
                  {isConnected ? 'Engine Active' : 'Engine Offline'}
                </span>
              </div>
            </div>

            {/* Performance capsules (floating) */}
            <div className="absolute top-24 left-6 flex flex-col gap-2 z-20">
              <div className="bg-slate-800/90 border border-slate-700/60 rounded px-2.5 py-1 text-[10px] flex items-center gap-2 shadow-lg backdrop-blur">
                <span className="text-slate-400 font-mono font-bold">{capsule1.ticker}</span>
                <span className="text-emerald-400 font-bold">₩{capsule1.price?.toLocaleString()}</span>
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 rounded px-2.5 py-1 text-[10px] flex items-center gap-2 shadow-lg backdrop-blur" style={{ marginLeft: '10px' }}>
                <span className="text-slate-400 font-mono font-bold">{capsule2.ticker}</span>
                <span className="text-emerald-400 font-bold">₩{capsule2.price?.toLocaleString()}</span>
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 rounded px-2.5 py-1 text-[10px] flex items-center gap-2 shadow-lg backdrop-blur" style={{ marginLeft: '4px' }}>
                <span className="text-slate-400 font-mono font-bold">{capsule3.ticker}</span>
                <span className="text-emerald-400 font-bold">₩{capsule3.price?.toLocaleString()}</span>
              </div>
            </div>

            {/* Main Interactive Graph Area */}
            <div className="h-64 relative mt-6">
              
              {/* Point 1 Link Stem & Badge */}
              <div className="absolute left-[130px] top-[40px] flex flex-col items-center z-10">
                <span className="bg-[#11192e]/95 border border-slate-800 text-[9px] font-bold text-slate-300 px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                  종목 추가
                </span>
                <div className="w-[1px] h-[75px] border-l border-dashed border-slate-700/60 mt-1" />
              </div>

              {/* Point 2 Link Stem & Badge */}
              <div className="absolute left-[380px] top-[10px] flex flex-col items-center z-10">
                <span className="bg-[#11192e]/95 border border-slate-800 text-[9px] font-bold text-slate-300 px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                  종목 제외
                </span>
                <div className="w-[1px] h-[55px] border-l border-dashed border-slate-700/60 mt-1" />
              </div>

              {/* Glowing Red Chart SVG */}
              <svg className="w-full h-full filter drop-shadow-[0_0_12px_rgba(239,68,68,0.2)]" viewBox="0 0 500 250" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* SVG Area (Fades in) */}
                <motion.path
                  d="M 0 180 
                     C 50 170, 80 200, 130 150 
                     C 180 100, 220 160, 260 120 
                     C 300 80, 340 150, 380 90 
                     C 420 40, 460 30, 500 55
                     L 500 250 L 0 250 Z"
                  fill="url(#chart-grad)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2, duration: 1 }}
                />
                
                {/* SVG Line (Draws in) */}
                <motion.path
                  d="M 0 180 
                     C 50 170, 80 200, 130 150 
                     C 180 100, 220 160, 260 120 
                     C 300 80, 340 150, 380 90 
                     C 420 40, 460 30, 500 55"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2.0, ease: "easeInOut" }}
                />
                
                {/* Active node glow 1 */}
                <circle cx="130" cy="150" r="4.5" fill="#ffffff" stroke="#ef4444" strokeWidth="2.5" />
                
                {/* Active node glow 2 */}
                <circle cx="380" cy="90" r="4.5" fill="#ffffff" stroke="#ef4444" strokeWidth="2.5" />
              </svg>

              {/* Inside Chart Performance Card */}
              <div className="absolute top-[80px] right-[40px] bg-slate-800/85 border border-[#ef4444]/25 px-4 py-2.5 rounded-xl shadow-[0_4px_20px_rgba(239,68,68,0.15)] backdrop-blur-md max-w-[140px] leading-tight">
                <span className="text-[10px] font-bold text-slate-400 font-mono block">LIVE</span>
                <span className="text-base font-extrabold text-[#ef4444] font-mono block mt-0.5">₩{chartTop.price?.toLocaleString()}</span>
                <span className="text-[9px] font-semibold text-slate-500 block mt-1 font-mono">{chartTop.ticker}</span>
              </div>

              {/* Grid Lines inside Chart */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.04]">
                <div className="border-t border-white w-full" />
                <div className="border-t border-white w-full" />
                <div className="border-t border-white w-full" />
                <div className="border-t border-white w-full" />
              </div>
            </div>

            {/* Bottom Legend */}
            <div className="mt-8 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
              <span>*2024년 12월에 선정된 종목, 2025년 6월에 제외</span>
              <span className="font-mono">KOSPI SELECTION DATA</span>
            </div>
          </div>

          {/* Secondary background card glow */}
          <div className="absolute -bottom-10 -right-10 w-full h-full z-[-1] opacity-50 blur-3xl bg-indigo-500/10 rounded-full" />
        </div>
      </main>

      {/* Quick Access Matrix Pills removed */}

      {/* Footer Area */}
      <footer className="border-t border-slate-900 py-16 bg-[#070d1f]/40 relative z-10">
        <div className="max-w-[1440px] mx-auto px-6 flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-4">
            <div className="text-2xl font-black tracking-tighter text-white">MuzeBIZ<span className="text-[#f97316]">.com</span></div>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed font-semibold">
              전 세계 투자자들을 위한 차세대 퀀트 인텔리전스 플랫폼. 데이터 그 이상의 가치를 제공합니다.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-300">제품</div>
              <ul className="text-sm text-slate-500 space-y-2 font-medium">
                <li><a className="hover:text-indigo-400 transition-colors" href="#">InvestingPro</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">모바일 앱</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">차트</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-300">커뮤니티</div>
              <ul className="text-sm text-slate-500 space-y-2 font-medium">
                <li><a className="hover:text-indigo-400 transition-colors" href="#">투자 챌린지</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">웨비나</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">교육</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-300">회사</div>
              <ul className="text-sm text-slate-500 space-y-2 font-medium">
                <li><a className="hover:text-indigo-400 transition-colors" href="#">소개</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">채용</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">광고 문의</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-300">지원</div>
              <ul className="text-sm text-slate-500 space-y-2 font-medium">
                <li><a className="hover:text-indigo-400 transition-colors" href="#">고객센터</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">약관</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">개인정보처리방침</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto px-6 mt-16 pt-8 border-t border-slate-900/60 text-center text-xs text-slate-600 font-semibold">
          © 2026 MuzeBIZ.Lab & StockerDNA. 모든 권리 보유. 
          <span className="mx-3 text-slate-800">|</span> 
          위험 고지: 금융 상품 거래는 손실 위험을 수반합니다. 투자 결정을 내리기 전에 전문가와 상담하십시오.
        </div>
      </footer>

      {/* Login Modal Overlay */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Modal backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#0b1222]/95 border border-slate-800 rounded-3xl w-full max-w-md p-8 sm:p-10 relative overflow-hidden z-10 shadow-2xl shadow-black/80"
            >
              {/* Highlight bar */}
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-[#f97316]" />
              
              <button 
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white p-2 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2.5 mb-8 text-left">
                <h2 className="text-2xl font-black text-white tracking-tight leading-tight">Welcome Operator</h2>
                <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono">Secure Access Protocol (SSO)</p>
              </div>

              <form className="space-y-5" onSubmit={handleLoginSubmit}>
                <div className="space-y-2 text-left">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="Operator Email" 
                    className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-700 font-mono text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly
                  />
                </div>
                
                <div className="space-y-2 text-left">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-700 font-mono text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    readOnly
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-semibold pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" className="rounded border-slate-800 bg-[#020617] text-indigo-500 focus:ring-indigo-500/30 w-4 h-4" defaultChecked/>
                    <span className="text-slate-400">Remember Session</span>
                  </label>
                  <span className="text-slate-600 hover:text-slate-400 cursor-pointer">SSO Help</span>
                </div>

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-[0_4px_20px_rgba(99,102,241,0.25)] transition-all flex justify-center items-center mt-6 text-xs uppercase tracking-widest font-mono cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Initiate Session'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
