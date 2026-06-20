import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import { useMarketEngine } from '../hooks/useMarketEngine';
import {
  Activity,
  Loader2,
  Search,
  Bell,
  Laptop,
  X,
  Apple
} from 'lucide-react';

// 세일 마감 일시 — 여기 한 곳만 수정하면 헤더·히어로 배지 모두 반영
const SALE_LABEL = '55% 할인';
const SALE_DEADLINE = new Date('2026-06-30T23:59:59').getTime();

const calcTimeLeft = () => {
  const diff = SALE_DEADLINE - Date.now();
  if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
};

export default function LandingPage() {
  const { isLoading, isAuthenticated, signIn } = useMockAuth();
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

  const [timeLeft, setTimeLeft] = useState(calcTimeLeft);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(calcTimeLeft()), 1000);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 overflow-x-hidden font-sans relative">
      {/* Soft Ambient Light Glows */}
      <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-radial from-indigo-500/5 to-transparent rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-radial from-cyan-500/5 to-transparent rounded-full blur-[100px] pointer-events-none z-0" />
      
      {/* Top Header Panel (Clean White Layout) */}
      <header className="fixed top-0 w-full z-50 bg-white/95 border-b border-slate-200/80 shadow-sm backdrop-blur-md">
        <div className="flex justify-between items-center w-full px-6 py-3 h-16 max-w-[1440px] mx-auto">
          {/* Logo & Search */}
          <div className="flex items-center gap-8">
            <div className="text-2xl font-black tracking-tighter text-slate-900 cursor-pointer select-none font-mono">
              MuzeBIZ<span className="text-indigo-600">.com</span>
            </div>
            
            {/* Search Bar */}
            <div className={`relative hidden lg:block transition-all duration-300 ${isSearchFocused ? 'w-[450px]' : 'w-[350px]'}`}>
              <input 
                className="w-full bg-slate-100/80 text-slate-800 text-sm px-4 pr-10 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all placeholder:text-slate-800 font-mono"
                placeholder="웹사이트 검색..." 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-800 w-4 h-4" />
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-4">
            <button className="bg-indigo-50 text-indigo-600 border border-indigo-200 text-sm font-bold tracking-wide px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all flex items-center gap-1 cursor-pointer">
              {SALE_LABEL} - 반짝 세일
            </button>
            <div className="flex items-center gap-4 text-xs font-bold font-sans">
              <button 
                onClick={() => setShowLoginModal(true)} 
                className="text-slate-800 hover:text-slate-900 transition-colors cursor-pointer"
              >
                로그인
              </button>
              <span className="text-slate-350">/</span>
              <button 
                onClick={() => setShowLoginModal(true)} 
                className="text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
              >
                무료 회원가입
              </button>
            </div>
            <div className="flex items-center gap-2.5 text-slate-800 border-l border-slate-200 pl-4">
              <Bell className="cursor-pointer hover:text-slate-900 w-4.5 h-4.5 transition-colors" />
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.6)]" />
            </div>
          </div>
        </div>

        {/* Main Navigation Row */}
        <nav className="border-t border-slate-200/60 overflow-x-auto no-scrollbar">
          <div className="flex items-center px-6 h-11 max-w-[1440px] mx-auto gap-6 whitespace-nowrap text-xs font-bold text-slate-800 font-mono">
            <button onClick={async () => { await signIn(''); navigate('/stock/dashboard'); }} className="text-indigo-600 border-b-2 border-indigo-600 h-full flex items-center px-1 cursor-pointer">
              통합지휘소
            </button>
            <button onClick={async () => { await signIn(''); navigate('/parts-search'); }} className="hover:text-slate-900 transition-colors h-full flex items-center px-1 cursor-pointer">
              제품검색
            </button>
            <button onClick={async () => { await signIn(''); navigate('/watchlist'); }} className="hover:text-slate-900 transition-colors h-full flex items-center px-1 cursor-pointer">
              모니터링 오빗
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content Area (Header Padding increased from pt-16 to pt-40 to clear fixed header) */}
      <main className="relative max-w-[1440px] mx-auto px-6 pt-40 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        
        {/* Left Column: Hero Text */}
        <div className="lg:col-span-7 space-y-8">
          {/* Limited Time Sale Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-bold font-mono">
            <span className="font-bold">반짝 세일</span>
            <span className="text-slate-800 font-mono tracking-wider">
              {formatTime(timeLeft.hours)}시간 : {formatTime(timeLeft.minutes)}분 : {formatTime(timeLeft.seconds)}초
            </span>
            <span className="bg-indigo-600 text-white text-xs font-black px-1.5 py-0.5 rounded ml-1">{SALE_LABEL}</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
            다음 투자를 <br/>
            <span className="text-indigo-600">전설적으로</span> 만들어 보세요
          </h1>

          {/* Description */}
          <p className="text-slate-800 text-base sm:text-lg max-w-xl leading-relaxed font-medium">
            진지한 투자자들이 투자를 실행하기 전에 의존하는 데이터, 도구, 그리고 퀀트 알고리즘 기반 투자 시그널입니다.
          </p>

          {/* CTAs (Vibrant solid buttons, extremely easy to find) */}
          <div className="flex flex-wrap gap-4 pt-2">
            <button 
              onClick={() => setShowLoginModal(true)} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-base shadow-[0_4px_14px_rgba(79,70,229,0.25)] transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
            >
              무료로 시작하기
            </button>
            <button 
              onClick={() => setShowLoginModal(true)} 
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-8 py-4 rounded-xl font-bold text-base transition-all cursor-pointer active:scale-95"
            >
              할인받고 구독하기
            </button>
          </div>

          {/* Social Proof (Ratings) */}
          <div className="pt-8 flex items-center gap-4 border-t border-slate-100 max-w-lg">
            <div className="flex -space-x-2.5">
              <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-slate-105">
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&q=80" className="w-full h-full object-cover" alt="User" />
              </div>
              <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-slate-105">
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=64&q=80" className="w-full h-full object-cover" alt="User" />
              </div>
              <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-slate-105">
                <img src="https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=64&q=80" className="w-full h-full object-cover" alt="User" />
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-800">
                전 세계 5,000만 투자자가 신뢰합니다
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-800 font-semibold font-mono">
                <span className="text-indigo-600 flex items-center">★ 4.6/5</span>
                <span>(130만 개 리뷰)</span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1">
                  <Laptop className="w-3.5 h-3.5 text-slate-800" />
                  <Apple className="w-3.5 h-3.5 text-slate-800" />
                  <span className="text-xs bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono">PLAY</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Hero Visual (Clean white cockpit SPEEDOMETER container) */}
        <div className="lg:col-span-5 relative">
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative overflow-hidden group">
            
            {/* Grid Overlay inside card */}
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[linear-gradient(#000_1px,transparent_1px),linear-gradient(90deg,#000_1px,transparent_1px)] bg-[size:30px_30px]" />

            {/* Badges on top of card */}
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8.5 h-8.5 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Activity className="w-4.5 h-4.5 text-indigo-600" />
                </div>
                <div className="leading-tight">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono block">Realtime Quant AI</span>
                  <span className="text-xs font-bold text-slate-800">실시간 포트폴리오 스캔</span>
                </div>
              </div>

              {/* Top Mini Badges */}
              <div className="flex gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-indigo-600 animate-ping' : 'bg-rose-500'}`} />
                <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${isConnected ? 'text-indigo-600 bg-indigo-50 border border-indigo-100' : 'text-rose-600 bg-rose-50 border border-rose-100'}`}>
                  {isConnected ? 'COCKPIT ONLINE' : 'COCKPIT OFFLINE'}
                </span>
              </div>
            </div>

            {/* Performance capsules (floating) */}
            <div className="absolute top-24 left-6 flex flex-col gap-2 z-20 font-mono">
              <div className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs flex items-center gap-2 shadow-sm">
                <span className="text-slate-800 font-bold">{capsule1.ticker}</span>
                <span className="text-indigo-600 font-bold">₩{capsule1.price?.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs flex items-center gap-2 shadow-sm" style={{ marginLeft: '10px' }}>
                <span className="text-slate-800 font-bold">{capsule2.ticker}</span>
                <span className="text-indigo-600 font-bold">₩{capsule2.price?.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs flex items-center gap-2 shadow-sm" style={{ marginLeft: '4px' }}>
                <span className="text-slate-800 font-bold">{capsule3.ticker}</span>
                <span className="text-indigo-600 font-bold">₩{capsule3.price?.toLocaleString()}</span>
              </div>
            </div>

            {/* Speedometer Widget */}
            <div className="flex flex-col items-center justify-center py-2 relative z-10">
              <div className="relative w-48 h-28 flex items-center justify-center overflow-hidden">
                <svg className="w-full h-full transform translate-y-2" viewBox="0 0 100 50">
                  <path 
                    d="M 10 50 A 40 40 0 0 1 90 50" 
                    fill="none" 
                    stroke="#e2e8f0" 
                    strokeWidth="8" 
                    strokeLinecap="round" 
                  />
                  <path 
                    d="M 10 50 A 40 40 0 0 1 78 22" 
                    fill="none" 
                    stroke="#4f46e5" 
                    strokeWidth="8" 
                    strokeLinecap="round" 
                    strokeDasharray="125"
                    strokeDashoffset="25"
                  />
                  {/* Dashboard ticks */}
                  <line x1="10" y1="50" x2="15" y2="50" stroke="#94a3b8" strokeWidth="0.8" />
                  <line x1="15" y1="22" x2="19.5" y2="25.5" stroke="#94a3b8" strokeWidth="0.8" />
                  <line x1="50" y1="10" x2="50" y2="15" stroke="#94a3b8" strokeWidth="0.8" />
                  <line x1="85" y1="22" x2="80.5" y2="25.5" stroke="#94a3b8" strokeWidth="0.8" />
                  <line x1="90" y1="50" x2="85" y2="50" stroke="#94a3b8" strokeWidth="0.8" />
                </svg>

                {/* Needle */}
                <div 
                  className="absolute bottom-0 w-[2px] h-[36px] bg-indigo-600 origin-bottom rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]" 
                  style={{ 
                    left: '50%', 
                    transform: 'translateX(-50%) rotate(42deg)', 
                    transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)' 
                  }} 
                />
                
                {/* Center cap */}
                <div className="absolute bottom-0 w-6 h-3 bg-white border-t border-slate-200 rounded-t-full flex items-center justify-center z-20" />

                {/* Performance Text Inside Dial */}
                <div className="absolute bottom-1 text-center font-mono select-none">
                  <span className="text-2xl font-black text-slate-800">80</span>
                  <span className="text-xs font-bold text-slate-800 block leading-none">DNA INDEX</span>
                </div>
              </div>
            </div>

            {/* Main Interactive Graph Area */}
            <div className="h-44 relative mt-4">
              
              {/* Point 1 Link Stem & Badge */}
              <div className="absolute left-[130px] top-[10px] flex flex-col items-center z-10 font-mono">
                <span className="bg-white border border-slate-200 text-xs font-bold text-slate-800 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                  종목 추가
                </span>
                <div className="w-[1px] h-[65px] border-l border-dashed border-slate-300 mt-1" />
              </div>

              {/* Point 2 Link Stem & Badge */}
              <div className="absolute left-[280px] top-[0px] flex flex-col items-center z-10 font-mono">
                <span className="bg-white border border-slate-200 text-xs font-bold text-slate-800 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                  분석 완료
                </span>
                <div className="w-[1px] h-[45px] border-l border-dashed border-slate-300 mt-1" />
              </div>

              {/* Glowing Cyan/Blue Chart SVG */}
              <svg className="w-full h-full" viewBox="0 0 500 250" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-grad-blue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* SVG Area */}
                <motion.path
                  d="M 0 180 
                     C 50 170, 80 200, 130 150 
                     C 180 100, 220 160, 260 120 
                     C 300 80, 340 150, 380 90 
                     C 420 40, 460 30, 500 55
                     L 500 250 L 0 250 Z"
                  fill="url(#chart-grad-blue)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2, duration: 1 }}
                />
                
                {/* SVG Line */}
                <motion.path
                  d="M 0 180 
                     C 50 170, 80 200, 130 150 
                     C 180 100, 220 160, 260 120 
                     C 300 80, 340 150, 380 90 
                     C 420 40, 460 30, 500 55"
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2.0, ease: "easeInOut" }}
                />
                
                {/* Active nodes */}
                <circle cx="130" cy="150" r="4.5" fill="#ffffff" stroke="#4f46e5" strokeWidth="2.5" />
                <circle cx="380" cy="90" r="4.5" fill="#ffffff" stroke="#4f46e5" strokeWidth="2.5" />
              </svg>

              {/* Inside Chart Performance Card */}
              <div className="absolute top-[50px] right-[40px] bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-md max-w-[140px] leading-tight font-mono">
                <span className="text-xs font-bold text-slate-800 block">LIVE PULSE</span>
                <span className="text-base font-extrabold text-indigo-600 block mt-0.5">₩{chartTop.price?.toLocaleString()}</span>
                <span className="text-xs font-semibold text-slate-800 block mt-1">{chartTop.ticker}</span>
              </div>

              {/* Grid Lines inside Chart */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.02]">
                <div className="border-t border-black w-full" />
                <div className="border-t border-black w-full" />
                <div className="border-t border-black w-full" />
                <div className="border-t border-black w-full" />
              </div>
            </div>

            {/* Bottom Legend */}
            <div className="mt-6 flex justify-between items-center text-xs text-slate-800 font-semibold font-mono">
              <span>*2024년 12월에 선정된 종목, 2025년 6월에 제외</span>
              <span>KOSPI SELECTION DATA</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Area */}
      <footer className="border-t border-slate-200 py-16 bg-slate-50 relative z-10 font-mono text-xs text-slate-800">
        <div className="max-w-[1440px] mx-auto px-6 flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-4">
            <div className="text-2xl font-black tracking-tighter text-slate-900">MuzeBIZ<span className="text-indigo-600">.com</span></div>
            <p className="text-slate-800 text-sm max-w-xs leading-relaxed font-semibold">
              전 세계 투자자들을 위한 차세대 콕핏 퀀트 인텔리전스 플랫폼. 데이터 그 이상의 가치를 제공합니다.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-800">제품</div>
              <ul className="space-y-2 font-medium">
                <li><a className="hover:text-indigo-600 transition-colors" href="#">InvestingPro</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">모바일 앱</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">차트</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-800">커뮤니티</div>
              <ul className="space-y-2 font-medium">
                <li><a className="hover:text-indigo-600 transition-colors" href="#">투자 챌린지</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">웨비나</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">교육</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-800">회사</div>
              <ul className="space-y-2 font-medium">
                <li><a className="hover:text-indigo-600 transition-colors" href="#">소개</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">채용</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">광고 문의</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-800">지원</div>
              <ul className="space-y-2 font-medium">
                <li><a className="hover:text-indigo-600 transition-colors" href="#">고객센터</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">약관</a></li>
                <li><a className="hover:text-indigo-600 transition-colors" href="#">개인정보처리방침</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto px-6 mt-16 pt-8 border-t border-slate-200 text-center text-slate-800 font-semibold">
          © 2026 MuzeBIZ.Lab & StockerDNA. 모든 권리 보유. 
          <span className="mx-3 text-slate-200">|</span> 
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
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-8 sm:p-10 relative overflow-hidden z-10 shadow-2xl"
            >
              {/* Highlight bar */}
              <div className="absolute top-0 left-0 w-full h-[3px] bg-indigo-600" />
              
              <button 
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-slate-800 hover:text-slate-900 p-2 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2.5 mb-8 text-left">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Welcome Operator</h2>
                <p className="text-xs text-indigo-600 uppercase tracking-widest font-mono">Secure Access Protocol (SSO)</p>
              </div>

              <form className="space-y-5" onSubmit={handleLoginSubmit}>
                <div className="space-y-2 text-left">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-800">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="Operator Email" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-800 font-mono text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly
                  />
                </div>
                
                <div className="space-y-2 text-left">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-800">Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-800 font-mono text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    readOnly
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-semibold pt-1 font-mono">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" className="rounded border-slate-200 bg-white text-indigo-500 focus:ring-indigo-500/30 w-4 h-4" defaultChecked/>
                    <span className="text-slate-800">Remember Session</span>
                  </label>
                  <span className="text-slate-800 hover:text-slate-800 cursor-pointer">SSO Help</span>
                </div>

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-[0_4px_14px_rgba(79,70,229,0.25)] transition-all flex justify-center items-center mt-6 text-xs uppercase tracking-widest font-mono cursor-pointer"
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
