import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import { X } from 'lucide-react';

export default function LandingPage() {
  const { isLoading, isAuthenticated, signIn } = useMockAuth();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [targetRoute, setTargetRoute] = useState('/stock/dashboard');

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
      {/* 워터마크 배경 (최상단 z-50으로 올려 모든 콘텐츠 위로 비치게 함) */}
      <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center opacity-[0.04]">
        <img 
          src="/logo.png" 
          alt="MuzeBIZ.Lab Watermark" 
          className="w-[120vw] max-w-[1800px] object-contain select-none"
          draggable="false"
        />
      </div>

      {/* Minimalist Header */}
      <header className="absolute top-0 w-full z-50 bg-transparent font-sans">
        <div className="flex justify-between items-center px-6 md:px-12 h-24 w-full max-w-7xl mx-auto">
          
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="MuzeBIZ Logo" className="w-6 h-6 object-contain pointer-events-none select-none invert" />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tighter uppercase font-mono pointer-events-none select-none">
              MuzeBIZ.Lab
            </span>
          </div>

          {/* Right: Nav & Actions */}
          <div className="flex items-center gap-8">
            <div className="hidden lg:flex items-center gap-8">
              <button onClick={() => handleNavClick('/stock/dashboard')} className="text-sm font-bold text-slate-500 hover:text-black transition-colors">
                Dashboard
              </button>
              <button onClick={() => handleNavClick('/reports')} className="text-sm font-bold text-slate-500 hover:text-black transition-colors">
                Reports
              </button>
              <button onClick={() => handleNavClick('/parts-search')} className="text-sm font-bold text-slate-500 hover:text-black transition-colors">
                Search
              </button>
            </div>
            
            <button onClick={() => handleNavClick('/stock/dashboard')} className="sfdc-button-primary shadow-lg">
                Get Started
            </button>
          </div>
        </div>
      </header>
      <main className="pt-24 flex flex-col items-center justify-center min-h-[90vh]">
        {/* Modern Minimalist Hero Section */}
        <section className="relative px-6 w-full max-w-5xl mx-auto flex flex-col items-center text-center z-10 mt-20">
          
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">Introducing V4.2</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-8">
            Invest with <br className="hidden md:block"/>
            Absolute Clarity.
          </h1>
          
          <p className="text-lg md:text-2xl text-slate-500 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
            A radical new approach to market intelligence. Strip away the noise and focus on what matters.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
            <button onClick={() => handleNavClick('/stock/dashboard')} className="sfdc-button-primary w-full sm:w-auto px-10 py-4 text-lg shadow-xl">
              Open Dashboard
            </button>
            <button onClick={() => handleNavClick('/reports')} className="sfdc-button-secondary w-full sm:w-auto px-10 py-4 text-lg bg-white hover:bg-slate-50 text-slate-900 shadow-sm border border-slate-200">
              View Reports
            </button>
          </div>

        </section>

        {/* Floating Abstract UI Element (replaces complex terminal) */}
        <div className="relative w-full max-w-6xl mx-auto mt-24 px-6 z-10 hidden md:block">
          <div className="bg-white rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-slate-100 p-8 h-[400px] w-full flex items-end justify-center overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10"></div>
            <div className="w-full h-full opacity-30 flex items-end justify-between px-10 gap-4">
              {[40, 70, 45, 90, 60, 85, 30, 65, 50, 100, 75, 40].map((height, i) => (
                <div key={i} className="w-16 bg-slate-200 rounded-t-xl" style={{ height: `${height}%` }}></div>
              ))}
            </div>
            
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-8 flex flex-col items-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
              <span className="text-7xl font-black text-black tracking-tighter">189.43</span>
              <span className="text-sm font-bold text-emerald-500 tracking-widest uppercase mt-2">+1.24% Today</span>
            </div>
          </div>
        </div>
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
