import { useEffect, useState } from 'react';
import { ShieldCheck, Check, X as XIcon } from 'lucide-react';
import clsx from 'clsx';
import { fetchChecklist, toggleChecklistItem, type ChecklistItem } from '../../services/pythonApiService';
import { ImprovementTracker } from './ImprovementTracker';

const STATUS_STYLES = {
  pass: {
    border: "border-emerald-500",
    icon: "bg-emerald-500 border-emerald-500 text-white",
    label: "text-emerald-800",
    category: "text-emerald-600/80",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    note: "text-emerald-700/80",
  },
  fail: {
    border: "border-rose-500",
    icon: "bg-rose-500 border-rose-500 text-white",
    label: "text-rose-800",
    category: "text-rose-600/80",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    note: "text-rose-700/80",
  },
  idle: {
    border: "border-slate-100 hover:border-slate-300 hover:shadow-md",
    icon: "bg-slate-50 border-slate-200 text-transparent group-hover:border-slate-400",
    label: "text-black",
    category: "text-slate-500",
    badge: "",
    note: "text-slate-500",
  },
} as const;

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
    <div className="sfdc-card flex flex-col">
      <div className="p-8 pb-4 bg-white">
        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-slate-900" />
          실계좌 전환 체크리스트
        </h2>
        <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">Live Trading Readiness</p>
      </div>
      <div className="px-8 pb-8 flex-1 bg-white">
        <div className="mb-8">
          <div className="flex justify-between text-[10px] font-black text-slate-400 font-mono uppercase tracking-widest mb-3">
            <span>Readiness Score</span>
            <span className={clsx("transition-colors text-sm font-black", isAllCleared ? "text-emerald-500" : "text-slate-900")}>
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={clsx(
                "h-full transition-all duration-500 rounded-full",
                isAllCleared ? "bg-emerald-500" : "bg-black"
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
              const statusKey = isPassed ? "pass" : isFailedAuto ? "fail" : "idle";
              const styles = STATUS_STYLES[statusKey];
              return (
                <button
                  key={item.item_key}
                  onClick={() => handleToggle(item.item_key, isAutomated)}
                  className={clsx(
                    "w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all bg-white",
                    isAutomated ? "cursor-default" : "cursor-pointer group",
                    styles.border
                  )}
                >
                  <div className={clsx(
                    "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
                    styles.icon
                  )}>
                    {isPassed ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : isFailedAuto ? <XIcon className="w-3 h-3" strokeWidth={3} /> : <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                  <div className="flex-1">
                    <div className={clsx("text-xs font-black leading-tight mb-1", styles.label)}>
                      {item.label}
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={clsx("text-[10px] font-bold leading-relaxed uppercase tracking-widest", styles.category)}>
                        {item.category}
                      </div>
                      {isAutomated && (
                        <span className={clsx("px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border", styles.badge)}>
                          Auto
                        </span>
                      )}
                    </div>
                    {item.auto_note && (
                      <div className={clsx("text-[10px] font-medium leading-tight mt-1", styles.note)}>
                        ↳ {item.auto_note}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 전략 개선 검증 트래커 — Forward Return/ATR 스탑/페니 게이트/Whipsaw 진행 현황 */}
        <div className="mt-6">
          <ImprovementTracker />
        </div>
      </div>
      <div className="p-8 bg-slate-50">
        <button
          disabled={!isAllCleared}
          className={clsx(
            "w-full font-black transition-all",
            isAllCleared
              ? "sfdc-button-primary shadow-xl"
              : "py-4 rounded-full text-sm bg-slate-200 text-slate-400 cursor-not-allowed"
          )}
        >
          {isAllCleared ? "Request Live Account Transition" : "Complete checklist to proceed"}
        </button>
      </div>
    </div>
  );
};
