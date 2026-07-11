import { useEffect, useState } from 'react';
import { ShieldCheck, Check, X as XIcon } from 'lucide-react';
import clsx from 'clsx';
import { fetchChecklist, toggleChecklistItem, type ChecklistItem } from '../../services/pythonApiService';

export const LiveTransitionChecklist = () => {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const checklistData = await fetchChecklist();
        setChecklist(checklistData);
      } catch (err) {
        console.error('Failed to load checklist', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleToggle = async (itemKey: string, isAutomated: boolean) => {
    if (isAutomated) return; // Cannot manually toggle automated items

    try {
      const updatedItem = await toggleChecklistItem(itemKey);
      setChecklist(prev => prev.map(item => item.item_key === itemKey ? updatedItem : item));
    } catch (err) {
      console.error('Failed to toggle item', err);
    }
  };

  const completedCount = checklist.filter(c => c.is_checked).length;
  const progressPercent = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0;
  const isAllCleared = checklist.length > 0 && completedCount === checklist.length;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-100 bg-white">
        <h2 className="text-sm font-black text-black flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-500" />
          실계좌 전환 체크리스트
        </h2>
        <p className="text-xs font-bold text-slate-600 mt-1">Live Trading Readiness</p>
      </div>
      
      <div className="p-5 flex-1 bg-slate-50/50">
        <div className="mb-5">
          <div className="flex justify-between text-[11px] font-extrabold text-slate-600 font-mono uppercase tracking-widest mb-2">
            <span>Readiness Score</span>
            <span className={clsx("transition-colors", isAllCleared ? "text-emerald-600" : "text-black")}>
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={clsx(
                "h-full transition-all duration-500 rounded-full",
                isAllCleared ? "bg-emerald-500" : "bg-indigo-500"
              )} 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-6 text-slate-600 text-xs font-bold">로딩 중...</div>
        ) : (
          <div className="space-y-2.5">
            {checklist.map(item => {
              const isAutomated = !!item.is_automated;
              const isFailedAuto = isAutomated && !item.is_checked;
              const isPassed = item.is_checked;

              return (
                <button
                  key={item.item_key}
                  onClick={() => handleToggle(item.item_key, isAutomated)}
                  className={clsx(
                    "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                    isAutomated ? "cursor-default" : "cursor-pointer group",
                    isPassed
                      ? "bg-emerald-50/50 border-emerald-100"
                      : isFailedAuto
                        ? "bg-rose-50/50 border-rose-100"
                        : "bg-white border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md"
                  )}
                >
                  <div className={clsx(
                    "mt-0.5 w-4 h-4 rounded-md flex items-center justify-center shrink-0 border transition-colors",
                    isPassed
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : isFailedAuto
                        ? "bg-rose-500 border-rose-500 text-white"
                        : "bg-slate-50 border-slate-300 text-transparent group-hover:border-indigo-400"
                  )}>
                    {isPassed ? <Check className="w-3 h-3" strokeWidth={3} /> : isFailedAuto ? <XIcon className="w-3 h-3" strokeWidth={3} /> : <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                  <div className="flex-1">
                    <div className={clsx(
                      "text-xs font-black leading-tight mb-1",
                      isPassed ? "text-emerald-800" : isFailedAuto ? "text-rose-800" : "text-black group-hover:text-indigo-700"
                    )}>
                      {item.label}
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={clsx(
                        "text-[10px] font-bold leading-relaxed uppercase tracking-widest",
                        isPassed ? "text-emerald-600/80" : isFailedAuto ? "text-rose-600/80" : "text-slate-500"
                      )}>
                        {item.category}
                      </div>
                      {isAutomated && (
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                          isPassed ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"
                        )}>
                          Auto
                        </span>
                      )}
                    </div>
                    {item.auto_note && (
                      <div className={clsx(
                        "text-[10px] font-medium leading-tight mt-1",
                        isPassed ? "text-emerald-700/80" : isFailedAuto ? "text-rose-700/80" : "text-slate-500"
                      )}>
                        ↳ {item.auto_note}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-slate-100 bg-white">
        <button 
          disabled={!isAllCleared}
          className={clsx(
            "w-full py-3 rounded-xl text-xs font-black font-mono uppercase tracking-widest transition-all shadow-sm",
            isAllCleared 
              ? "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer active:scale-95 shadow-md" 
              : "bg-slate-100 text-slate-600 border border-slate-200 cursor-not-allowed"
          )}
        >
          {isAllCleared ? "Request Live Account Transition" : "Complete checklist to proceed"}
        </button>
      </div>
    </div>
  );
};
