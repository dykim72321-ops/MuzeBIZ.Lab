
import { Trash2 } from 'lucide-react';

interface OrgProfileProps {
  name: string;
  role: string;
  desc: string;
  onDelete?: () => void;
}

export const OrgProfile = ({ name, role, desc, onDelete }: OrgProfileProps) => (
  <div className="flex flex-col items-center group relative">
    {onDelete && (
      <button 
        onClick={onDelete}
        className="absolute -top-2 -right-2 p-1.5 bg-white rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 border border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"
      >
        <Trash2 size={12} />
      </button>
    )}
    <div className="w-16 h-16 bg-slate-900 rounded-2xl mb-4 flex items-center justify-center text-white font-black text-xl shadow-xl border-2 border-indigo-500/20 rotate-3 group-hover:rotate-0 transition-transform">
      {name[0]}
    </div>
    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">{role}</span>
    <p className="text-base font-black text-slate-800">{name}</p>
    <p className="text-[11px] text-slate-400 mt-1 max-w-[160px] leading-relaxed text-center">{desc}</p>
  </div>
);
