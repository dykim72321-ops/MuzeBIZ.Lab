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

const getMetricValueStyle = (label: string, value: string) => {
  const valStr = String(value).trim();
  
  // 1. 음수 손익 / 마이너스 수치 / 악화: Rose Red 뱃지
  if (valStr.includes('-') || valStr.includes('악화')) {
    return 'bg-rose-50 text-rose-700 border-rose-200/80 font-black';
  }
  // 2. 양수 손익 / 마이너스 없는 % / 플러스 수치: Emerald Green 뱃지
  if (valStr.includes('+') || (valStr.includes('%') && !valStr.startsWith('-'))) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-black';
  }
  // 3. 현재 진행 중인 샘플 / 건수 / 데이터 수치: Indigo Blue 뱃지
  return 'bg-indigo-50 text-indigo-800 border-indigo-200/80 font-black';
};

// 리스크 커버리지 우선순위 순서 정의 (1. 당일 재진입 제한 -> 2. 쿨다운 락 강화 -> 3. DNA 필터 엄격화 -> 4. 슬리피지/수수료 모니터링)
const ITEM_RANK: Record<string, number> = {
  SAME_DAY_REENTRY: 1, // 1행: 당일 재진입 제한
  COOLDOWN_LOCK: 2,    // 2행: 쿨다운 락 강화
  DNA_FILTER: 3,       // 3행: DNA 필터 엄격화
  SLIPPAGE_FEE: 4,     // 4행: 종목별 슬리피지/수수료 실측 모니터링
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
      <div className="sfdc-card overflow-hidden flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-xs font-bold font-mono">
        개선 검증 현황 로딩 중...
      </div>
    );
  }
  // 페니 게이트 80 레거시 항목 제거 (2026-07-30 DNA 게이트 75 단일값 통일로 폐기)
  // 백엔드 배포 전까지 프론트에서 필터링
  const activeItems = items.filter(i => i.key !== 'penny_gate_80');

  if (activeItems.length === 0) return null;

  // 전략 리스크 커버리지 순서 정렬
  const sortedItems = [...activeItems].sort((a, b) => {
    const rankA = ITEM_RANK[a.key] ?? (a.label.includes('재진입') ? 1 : a.label.includes('쿨다운') ? 2 : a.label.includes('DNA') ? 3 : 4);
    const rankB = ITEM_RANK[b.key] ?? (b.label.includes('재진입') ? 1 : b.label.includes('쿨다운') ? 2 : b.label.includes('DNA') ? 3 : 4);
    return rankA - rankB;
  });

  return (
    <div className="sfdc-card overflow-hidden flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm">
      {/* Header Section — 기간별 퀀트 성과 상세 헤더와 100% 동일한 구조 */}
      <div className="p-5 px-6 md:px-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80 flex-shrink-0">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2 uppercase">
              전략 개선 검증 트래커
            </h2>
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              STRATEGY REGRESSION & REAL-LOG ANALYSIS
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {generatedAt && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-slate-100/80 text-slate-700 border border-slate-200/60 shadow-2xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              마지막 관측: {new Date(generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 shadow-2xs font-mono">
            AUTOMATED ENGINE VERIFIER
          </span>
        </div>
      </div>

      <p className="px-6 md:px-8 pb-3 pt-3 text-[10px] text-slate-400 font-medium border-b border-slate-100/60 bg-white">
        ※ 최근 적용된 전략 개선 4건의 실거래 성과를 중요도 내림차순(조치 시급 항목 1번행 배치)으로 정렬하여 표시합니다.
      </p>

      {/* Desktop / Tablet View (≥ 768px) — 기간별 퀀트 성과 상세 테이블 서식 적용 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200/80 bg-slate-50/80 whitespace-nowrap">
              <th className="py-3.5 px-6 text-left w-[20%]">개선 항목</th>
              <th className="py-3.5 px-4 text-left w-[40%]">검증 상세 지표 (실시간 현황)</th>
              <th className="py-3.5 px-4 text-left w-[16%]">검증 상태 및 진척도</th>
              <th className="py-3.5 px-6 text-left w-[24%]">비고 및 롤백 현황</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedItems.map((item, idx) => {
              const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.COLLECTING;
              const Icon = badge.icon;
              return (
                <tr key={item.key} className="group odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50/20 transition-colors duration-150">
                  {/* 1. 개선 항목 (중요도 내림차순 정렬 적용) */}
                  <td className="py-4 px-6 text-left align-middle">
                    <span className="text-sm font-black text-slate-900 tracking-tight block">
                      {item.label}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-slate-400 block mt-0.5">
                      도입일: {item.adopted_at}
                    </span>
                  </td>

                  {/* 2. 검증 상세 지표 (42% 폭 대폭 확장 & 현재 실시간 데이터 색상 강렬하게 강조) */}
                  <td className="py-4 px-4 align-middle">
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      {item.metrics.map((m) => {
                        const valStyle = getMetricValueStyle(m.label, m.value);
                        return (
                          <div
                            key={m.label}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-xs shadow-2xs whitespace-nowrap"
                          >
                            <span className="text-slate-400 font-medium">{m.label}:</span>
                            <span className={clsx("px-2 py-0.5 rounded text-xs border tracking-tight", valStyle)}>
                              {m.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </td>

                  {/* 3. 검증 상태 및 진척도 (16% 알맞게 축소) */}
                  <td className="py-4 px-4 text-left align-middle">
                    <div className="flex flex-col gap-1.5 justify-center">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border w-fit whitespace-nowrap',
                          badge.badge
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {badge.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 bg-slate-200/80 rounded-full overflow-hidden shrink-0">
                          <div
                            className={clsx('h-full rounded-full transition-all duration-500', badge.bar)}
                            style={{ width: `${item.progress_pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-black font-mono text-slate-800">
                          {item.progress_pct}%
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* 4. 비고 및 롤백 현황 */}
                  <td className="py-4 px-6 text-xs align-middle">
                    <p className="text-[11px] font-medium text-slate-700 leading-snug">
                      {item.note}
                    </p>
                    {item.auto_rollback_applied && (
                      <p className="flex items-center gap-1 text-[10px] font-bold text-rose-600 mt-1">
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        <span>자동 롤백 적용됨 — {item.auto_rollback_detail}</span>
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Fallback (< 768px) */}
      <div className="block md:hidden p-4 space-y-3">
        {sortedItems.map((item) => {
          const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.COLLECTING;
          const Icon = badge.icon;
          return (
            <div key={item.key} className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-sm font-bold text-slate-800 block">{item.label}</span>
                  <span className="text-[10px] font-mono text-slate-400">도입: {item.adopted_at}</span>
                </div>
                <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border', badge.badge)}>
                  <Icon className="w-3 h-3" />
                  {badge.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className={clsx('h-full', badge.bar)} style={{ width: `${item.progress_pct}%` }} />
                </div>
                <span className="text-xs font-mono font-bold">{item.progress_pct}%</span>
              </div>
              <div className="text-xs font-mono space-y-1 bg-white p-2.5 rounded-lg border border-slate-100">
                {item.metrics.map(m => (
                  <div key={m.label} className="flex justify-between text-[11px]">
                    <span className="text-slate-400">{m.label}</span>
                    <span className="font-bold text-slate-700">{m.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">{item.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
