import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import { X, ArrowRight, ShieldCheck, Cpu, Zap, Bell, ChevronRight } from 'lucide-react';

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
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-slate-900 selection:text-white relative overflow-hidden">
      
      {/* Soft Ambient Light Gradient Background (Pure White & Silk Mesh Glow) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06),rgba(255,255,255,0))] pointer-events-none z-0" />
      <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(59,130,246,0.04),rgba(255,255,255,0))] pointer-events-none z-0" />

      {/* Floating Glassmorphic Header */}
      <header className="fixed top-0 w-full z-50 backdrop-blur-md bg-white/70 border-b border-slate-100 transition-all duration-300">
        <div className="flex justify-between items-center px-6 md:px-12 h-20 w-full max-w-7xl mx-auto">
          
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavClick('/stock/dashboard')}>
            <div className="w-10 h-10 bg-white rounded-xl border border-slate-200/90 flex items-center justify-center shadow-xs p-1 overflow-hidden">
              <img src="/logo.png" alt="MuzeBIZ Logo" className="w-full h-full object-contain pointer-events-none select-none" />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tighter uppercase font-mono">
              MuzeBIZ<span className="text-indigo-600">.Lab</span>
            </span>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center gap-8">
            <nav className="hidden md:flex items-center gap-8">
              <button onClick={() => handleNavClick('/stock/dashboard')} className="text-xs font-bold font-mono text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-wider">
                Dashboard
              </button>
              <button onClick={() => handleNavClick('/reports')} className="text-xs font-bold font-mono text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-wider">
                Reports
              </button>
              <button onClick={() => handleNavClick('/parts-search')} className="text-xs font-bold font-mono text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-wider">
                Search
              </button>
            </nav>
            
            <button 
              onClick={() => handleNavClick('/stock/dashboard')} 
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2 group"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-24 relative z-10">
        
        {/* Hero Section */}
        <section className="px-6 w-full max-w-5xl mx-auto flex flex-col items-center text-center mt-8 md:mt-16">
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-200/80 shadow-2xs mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider">
              QUANT ENGINE V4.2 ACTIVE
            </span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-7xl lg:text-8xl font-black text-slate-900 tracking-tighter leading-[1.05] mb-8 font-sans"
          >
            Precision Quant <br />
            <span className="bg-gradient-to-r from-slate-900 via-indigo-900 to-indigo-600 bg-clip-text text-transparent">
              Intelligence.
            </span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-xl text-slate-500 max-w-2xl mx-auto mb-12 font-normal leading-relaxed"
          >
            Automated US stock trading powered by Mean Reversion algorithms, Kelly Formula capital allocation, and instant Alpaca brokerage execution.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md"
          >
            <button 
              onClick={() => handleNavClick('/stock/dashboard')} 
              className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-xl shadow-slate-900/10 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group"
            >
              Launch Dashboard
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
            </button>

            <button 
              onClick={() => handleNavClick('/reports')} 
              className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl border border-slate-200/80 shadow-2xs transition-all hover:border-slate-300"
            >
              Performance Reports
            </button>
          </motion.div>

        </section>





        {/* System Stats Bar */}
        <section className="w-full bg-slate-50/80 border-y border-slate-200/60 mt-24 py-8 px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-2xl md:text-3xl font-black font-mono text-slate-900">&lt; 300ms</div>
              <div className="text-xs font-mono font-bold text-slate-400 uppercase mt-1">Order Execution</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-black font-mono text-slate-900">100%</div>
              <div className="text-xs font-mono font-bold text-slate-400 uppercase mt-1">Automated Stream</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-black font-mono text-indigo-600">Kelly Matched</div>
              <div className="text-xs font-mono font-bold text-slate-400 uppercase mt-1">Risk Protection</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-black font-mono text-emerald-600">Alpaca Sync</div>
              <div className="text-xs font-mono font-bold text-slate-400 uppercase mt-1">Real-time History</div>
            </div>
          </div>
        </section>

        {/* Swiss Grid Architecture Feature Section */}
        <section className="px-6 w-full max-w-6xl mx-auto mt-28">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-mono font-bold text-indigo-600 uppercase tracking-widest">ARCHITECTURE</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter mt-2">
              Designed for Mathematical Edge.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Feature 01 */}
            <div className="p-8 bg-white border border-slate-200/80 rounded-3xl shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="text-xs font-mono font-black text-indigo-600 tracking-widest mb-6">01 / ALGORITHM</div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Cpu className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Mean Reversion Engine</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Identifies extreme oversold conditions using RSI2 and volume deviation filters.
                </p>
              </div>
            </div>

            {/* Feature 02 */}
            <div className="p-8 bg-white border border-slate-200/80 rounded-3xl shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="text-xs font-mono font-black text-indigo-600 tracking-widest mb-6">02 / RISK ENGINE</div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Kelly Capital Sizing</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Mathematical position sizing calculated dynamically to protect account equity.
                </p>
              </div>
            </div>

            {/* Feature 03 */}
            <div className="p-8 bg-white border border-slate-200/80 rounded-3xl shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="text-xs font-mono font-black text-indigo-600 tracking-widest mb-6">03 / BROKERAGE</div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Alpaca Execution</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Seamless order routing with automated trailing stop and scale-out exit logic.
                </p>
              </div>
            </div>

            {/* Feature 04 */}
            <div className="p-8 bg-white border border-slate-200/80 rounded-3xl shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="text-xs font-mono font-black text-indigo-600 tracking-widest mb-6">04 / NOTIFICATIONS</div>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Bell className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Discord Webhook</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Instant mobile notifications for oversold discoveries and trade execution events.
                </p>
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* Swiss Style Minimalist Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-xl border border-slate-200/90 flex items-center justify-center shadow-2xs p-1 overflow-hidden">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain pointer-events-none select-none" />
            </div>
            <span className="text-base font-black font-mono text-slate-900 tracking-wider uppercase">
              MuzeBIZ<span className="text-indigo-600">.Lab</span>
            </span>
          </div>

          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
            © 2026 MuzeBIZ.Lab. Precision Quant Intelligence.
          </p>
        </div>
      </footer>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/80"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl border border-slate-200/90 flex items-center justify-center p-1 shadow-xs overflow-hidden">
                      <img src="/logo.png" alt="Logo" className="w-full h-full object-contain pointer-events-none select-none" />
                    </div>
                    <span className="text-xl font-black text-slate-900 font-mono tracking-tighter">MuzeBIZ<span className="text-indigo-600">.Lab</span></span>
                  </div>
                  <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">시스템 접속</h3>
                <p className="text-xs text-slate-500 mb-8 font-medium">MuzeBIZ 퀀트 시스템에 안전하게 접속하세요.</p>
                <form onSubmit={handleLoginSubmit}>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono text-sm font-bold py-4 rounded-2xl transition-all shadow-lg hover:shadow-slate-900/20 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <span className="animate-spin text-lg">◌</span> : '시스템 접속하기'}
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
