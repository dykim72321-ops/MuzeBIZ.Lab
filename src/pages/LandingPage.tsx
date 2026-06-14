import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMockAuth } from '../hooks/useMockAuth';
import { Activity, Globe, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function LandingPage() {
  const { isLoading, isAuthenticated, signIn } = useMockAuth();
  const navigate = useNavigate();

  // If already authenticated, show Domain Portal
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
        {/* Dynamic Tech Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:40px_40px]" />

        <div className="max-w-6xl w-full z-10 flex flex-col gap-12">
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-black tracking-tight text-white mb-2 flex items-center justify-center gap-3">
              <span className="w-2 h-6 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.6)]" /> MuzeBIZ.Lab
            </h1>
            <p className="text-slate-400 text-sm font-mono uppercase tracking-[0.25em]">Select Operational Domain Portal</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* MuzeStock Card */}
            <motion.div 
              whileHover={{ scale: 1.015, y: -4 }}
              whileTap={{ scale: 0.985 }}
              className="dark-glass-panel-hover p-10 rounded-[2.5rem] flex flex-col items-center text-center cursor-pointer glow-border-indigo-hover group"
              onClick={() => navigate('/stock/dashboard')}
            >
              <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/35 transition-colors shadow-[inset_0_0_15px_rgba(99,102,241,0.15)]">
                <Activity className="w-10 h-10 text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h2 className="text-3xl font-extrabold mb-3 tracking-tighter text-white">MuzeStock (Finance)</h2>
              <p className="text-slate-400 mb-8 flex-1 leading-relaxed text-sm font-medium max-w-sm">
                Deep analysis for financial precision. Access the premium Quant Command & trade control dashboard.
              </p>
              <button className="w-full max-w-xs py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-95">
                Explore MuzeStock <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>

            {/* Muzepart Card */}
            <motion.div 
              whileHover={{ scale: 1.015, y: -4 }}
              whileTap={{ scale: 0.985 }}
              className="dark-glass-panel-hover p-10 rounded-[2.5rem] flex flex-col items-center text-center cursor-pointer glow-border-cyan-hover group"
              onClick={() => navigate('/parts-search')}
            >
              <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-6 border border-cyan-500/20 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/35 transition-colors shadow-[inset_0_0_15px_rgba(34,211,238,0.15)]">
                <Globe className="w-10 h-10 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h2 className="text-3xl font-extrabold mb-3 tracking-tighter text-white">Muzepart (Supply Chain)</h2>
              <p className="text-slate-400 mb-8 flex-1 leading-relaxed text-sm font-medium max-w-sm">
                Global sourcing & logistics optimization. End-to-end supply chain visibility and inventory analytics.
              </p>
              <button className="w-full max-w-xs py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(8,145,178,0.3)] active:scale-95">
                Explore Muzepart <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // Pre-Login Hero View
  return (
    <div className="min-h-screen bg-[#0a0f1c] flex items-center relative overflow-hidden font-sans">
      {/* Abstract Tech Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40 mix-blend-screen" 
           style={{
             backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(circle at 75% 75%, rgba(34,211,238,0.12) 0%, transparent 50%)',
             backgroundSize: '100% 100%'
           }} 
      />
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
      
      <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-5 gap-12 p-8 lg:p-12 relative z-10 items-center">
        
        {/* Left: Hero Copy */}
        <div className="lg:col-span-3 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            MuzeBIZ Enterprise Hub v4.2
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-white leading-none tracking-tight">
            MuzeBIZ.Lab<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-300">
              Integrated Quant &<br/>Supply Chain Platform
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl leading-relaxed font-medium">
            Unlock new operational frontiers with our B2B/B2C data hub. Connecting Quant Investment precision (MuzeStock) and Global Supply Chain logic (Muzepart) into a singular, hyper-scaled platform.
          </p>
        </div>

        {/* Right: Login Card */}
        <div className="lg:col-span-2">
          <div className="dark-glass-panel p-8 sm:p-10 rounded-[2rem] glow-border-indigo w-full max-w-md mx-auto relative overflow-hidden border border-white/10">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500" />
            <div className="space-y-3 mb-8">
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight">Welcome Back,<br/>MuzeBIZ.Lab Operator</h2>
              <p className="text-xs text-indigo-400 uppercase tracking-[0.2em] font-mono">Secure Access Protocol</p>
            </div>

            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); signIn(''); }}>
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Email Address</label>
                <input 
                  type="email" 
                  placeholder="Enter your email" 
                  className="w-full bg-[#0a0f1c]/85 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-700 font-mono text-sm"
                  defaultValue="admin@muzestop.lab"
                  readOnly
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full bg-[#0a0f1c]/85 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-700 font-mono text-sm"
                  defaultValue="hunterpassword"
                  readOnly
                />
              </div>

              <div className="flex items-center justify-between text-xs font-medium">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="rounded border-slate-800 bg-[#0a0f1c] text-indigo-500 focus:ring-indigo-500/30 w-4 h-4" defaultChecked/>
                  <span className="text-slate-400 font-bold">Remember Session</span>
                </label>
                <a href="#" className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors">Forgot Password?</a>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-all flex justify-center items-center mt-6 text-xs uppercase tracking-widest font-mono"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Initiate Session'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-4">
              <span className="text-[10px] font-black text-slate-500 tracking-[0.2em] flex items-center gap-2 uppercase">
                <Lock className="w-3 h-3 text-indigo-400"/> Enterprise SSO Active
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
