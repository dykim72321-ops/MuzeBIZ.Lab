import { useEffect, useState } from 'react';
import { FlaskConical, CheckCircle2, TrendingUp, Database, AlertTriangle, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import {
  fetchImprovementStatus,
  type ImprovementItem,
  type ImprovementStatus,
} from '../../services/pythonApiService';

// 상태 배지: 색상만으로 구분하지 않도록 아이콘+텍스트를 항상 함께 표시
const STATUS_BADGE: Record<
  ImprovementStatus,
  { label: string; icon: typeof Database; badge: string; bar: string }
> = {
  COLLECTING: {
    label: '데이터 수집 중',
    icon: Database,
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    bar: 'bg-slate-400',
  },
  ON_TRACK: {
    label: '순항 중',
    icon: TrendingUp,
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    bar: 'bg-indigo-500',
  },
  VERIFIED: {
    label: '검증 완료',
    icon: CheckCircle2,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
  },
  REGRESSED: {
    label: '악화 — 재검토',
    icon: AlertTriangle,
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
  },
};

export const ImprovementTracker = () => {
  const [items, setItems] = useState<ImprovementItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchImprovementStatus();
        if (data) {
          setItems(data.items);
          setGeneratedAt(data.generated_at);
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-4 text-slate-500 text-xs font-bold">
        개선 검증 현황 로딩 중...
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-4 h-4 text-slate-700" />
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">
          개선 검증 트래커
        </h3>
      </div>
      <p className="text-[10px] font-bold text-slate-400 mb-4">
        전략 개선 4건의 실거래 효과를 자동 분석
        {generatedAt && (
          <span className="ml-1 font-mono">
            · {new Date(generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
          </span>
        )}
      </p>

      <div className="space-y-3">
        {items.map(item => {
          const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.COLLECTING;
          const Icon = badge.icon;
          return (
            <div key={item.key} className="bg-white rounded-xl border border-slate-100 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black text-slate-800 leading-tight">
                  {item.label}
                </span>
                <span
                  className={clsx(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0',
                    badge.badge,
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {badge.label}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2.5">
                <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500', badge.bar)}
                    style={{ width: `${item.progress_pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-black font-mono text-slate-500 w-8 text-right">
                  {item.progress_pct}%
                </span>
              </div>

              <dl className="space-y-1">
                {item.metrics.map(m => (
                  <div key={m.label} className="flex justify-between gap-2">
                    <dt className="text-[10px] font-bold text-slate-400">{m.label}</dt>
                    <dd className="text-[10px] font-black font-mono text-slate-700 text-right">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="text-[10px] font-medium text-slate-400 leading-snug mt-2 pt-2 border-t border-slate-50">
                {item.note} <span className="font-mono">(도입 {item.adopted_at})</span>
              </p>

              {item.auto_rollback_applied && (
                <p className="flex items-start gap-1 text-[10px] font-bold text-rose-600 leading-snug mt-2 pt-2 border-t border-rose-100">
                  <RotateCcw className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>자동 롤백 적용됨 — {item.auto_rollback_detail}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
