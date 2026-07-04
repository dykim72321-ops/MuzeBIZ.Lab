import { useState } from 'react';
import { 
  Key, 
  Settings as SettingsIcon, 
  Bell, 
  Zap, 
  ShieldCheck, 
  Database,
  Cpu,
  Brain
} from 'lucide-react';

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', name: 'General', icon: SettingsIcon },
    { id: 'api', name: 'API Keys', icon: Key },
    { id: 'strategy', name: 'AI Strategy', icon: Brain },
    { id: 'notifications', name: 'Alerts', icon: Bell },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="border-b-2 border-blue-200 pb-4">
        <h1 className="text-2xl font-black text-black tracking-tight flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg border-2 border-blue-200 shadow-sm">
            <SettingsIcon className="w-5 h-5 text-blue-700" />
          </div>
          System Settings
        </h1>
        <p className="text-blue-900 mt-2 text-[11px] font-bold">
          Configure your AI engine, manage API quotas, and fine-tune DNA matching algorithms.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Tabs */}
        <div className="space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-black text-xs uppercase tracking-widest ${
                activeTab === tab.id
                  ? 'bg-blue-700 text-white shadow-md border-2 border-blue-800'
                  : 'text-blue-800 hover:bg-blue-100 hover:text-black border-2 border-transparent'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.name}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 space-y-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="sfdc-card p-5">
                <h3 className="text-sm font-black text-black mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <Cpu className="w-4 h-4 text-blue-700" /> System Profile
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Default Region</label>
                    <select className="w-full bg-blue-50 border-2 border-blue-200 rounded-md px-3 py-2.5 text-xs text-black font-bold focus:border-blue-500 outline-none transition-all shadow-sm">
                      <option>Korea (Seoul)</option>
                      <option>US East (Virginia)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Language</label>
                    <select className="w-full bg-blue-50 border-2 border-blue-200 rounded-md px-3 py-2.5 text-xs text-black font-bold focus:border-blue-500 outline-none transition-all shadow-sm">
                      <option>Korean (default)</option>
                      <option>English</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border-2 border-amber-300 rounded-md p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-white border-2 border-amber-200 rounded-md shadow-sm">
                    <Zap className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="text-amber-900 font-black text-sm uppercase tracking-widest mb-1">Developer Mode</h4>
                    <p className="text-[11px] text-amber-800 font-bold mb-4">Enable experimental features and verbose logging in the DNA analysis engine.</p>
                    <button className="px-4 py-2 bg-white text-amber-900 font-black rounded-md text-[10px] border-2 border-amber-400 hover:bg-amber-100 transition-colors uppercase tracking-widest shadow-sm">
                      Enable Debug Terminal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="sfdc-card p-5 space-y-6">
              <div className="flex items-center justify-between border-b-2 border-blue-100 pb-4">
                <h3 className="text-sm font-black text-black flex items-center gap-2 uppercase tracking-widest">
                  <Database className="w-4 h-4 text-blue-700" /> API Infrastructure
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black border-2 border-emerald-300 uppercase tracking-widest">
                  Active
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Alpha Vantage Key</label>
                  <span className="text-[9px] text-blue-800 font-mono font-black border-2 border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded">FREE TIER</span>
                </div>
                <input 
                  type="password" 
                  value="••••••••••••••••"
                  readOnly
                  className="w-full bg-blue-50 border-2 border-blue-200 rounded-md px-3 py-2.5 text-xs text-black font-mono font-black shadow-sm"
                />
              </div>

              <div className="p-4 rounded-md border-2 border-blue-200 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-900">Monthly Usage</span>
                  <span className="text-xs text-blue-800 font-mono font-black bg-blue-50 px-2 py-0.5 rounded border border-blue-200">420 / 1,000 req</span>
                </div>
                <div className="h-2 w-full bg-blue-100 rounded-full overflow-hidden border border-blue-200">
                  <div className="h-full bg-blue-600 w-[42%] rounded-full"></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="space-y-4">
              <div className="sfdc-card p-5">
                <h3 className="text-sm font-black text-black mb-2 flex items-center gap-2 uppercase tracking-widest">
                  <Brain className="w-4 h-4 text-blue-700" /> DNA Scoring Logic
                </h3>
                <p className="text-[11px] font-bold text-blue-800 mb-6 border-b-2 border-blue-100 pb-4">Adjust the weights for the DNA Pattern Match calculation.</p>
                
                <div className="space-y-5">
                  {[
                    { label: 'Volatility Match', weight: 40 },
                    { label: 'Fundamental Growth', weight: 30 },
                    { label: 'Whale Movement', weight: 20 },
                    { label: 'News Sentiment', weight: 10 },
                  ].map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs font-black uppercase tracking-widest text-blue-950">{item.label}</span>
                        <span className="text-xs font-mono text-blue-800 font-black">{item.weight}%</span>
                      </div>
                      <div className="relative">
                        <input type="range" className="w-full h-1.5 bg-blue-200 rounded-full appearance-none cursor-pointer accent-blue-700" value={item.weight} readOnly />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-md p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-white border-2 border-emerald-200 rounded-md shadow-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-emerald-900 font-black text-sm uppercase tracking-widest mb-1">Risk Mode: Conservative</h4>
                    <p className="text-[11px] font-bold text-emerald-800">Strictly filter out stocks with high debt/equity ratios even if DNA match is high.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="sfdc-card p-5">
              <h3 className="text-sm font-black text-black mb-4 uppercase tracking-widest border-b-2 border-blue-100 pb-4">Alert Configurations</h3>
              <div className="space-y-3">
                {[
                  { title: 'Whale Signal', desc: 'Notify when institutional ownership changes > 5%.', active: false },
                  { title: 'High DNA Match (>90%)', desc: 'Instant alert for high-confidence AI findings.', active: true },
                  { title: 'System Status', desc: 'Alert if engine goes offline or API limit reached.', active: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white rounded-md border-2 border-blue-100 hover:border-blue-300 transition-colors shadow-sm">
                    <div>
                      <div className="text-xs font-black text-black uppercase tracking-widest">{item.title}</div>
                      <div className="text-[10px] font-bold text-blue-800 mt-1">{item.desc}</div>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors border-2 shadow-inner ${item.active ? 'bg-blue-600 border-blue-700' : 'bg-blue-100 border-blue-200'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${item.active ? 'left-6' : 'left-1'}`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
