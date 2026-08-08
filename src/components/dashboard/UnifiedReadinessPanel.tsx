import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  FlaskConical,
  Database,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  X as XIcon,
  Microscope,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  fetchUnifiedReadiness,
  toggleChecklistItem,
  type UnifiedGroup,
  type UnifiedItem,
  type UnifiedReadinessResponse,
  type UnifiedStatus,
} from '../../services/pythonApiService';

// 상태 배지: 색상만으로 구분하지 않도록 아이콘+텍스트를 항상 함께 표시한다.
const STATUS_BADGE: Record<
  UnifiedStatus,
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
  PASSED: {
    label: '통과',
    icon: Check,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
  },
  BLOCKED: {
    label: '미충족',
    icon: XIcon,
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
  },
};

const GROUP_ICON: Record<UnifiedGroup['key'], typeof Database> = {
  data_quality: Microscope,
  improvements: FlaskConical,
  live_gate: ShieldCheck,
};

const getMetricStyle = (value: string) => {
  const v = String(value).trim();
  if (v.includes('-') || v.includes('악화')) return 'bg-rose-50/80 border-rose-200/80 text-rose-900';
  if (v.includes('+') || (v.includes('%') && !v.startsWith('-')))
    return 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900';
  return 'bg-slate-100/90 border-slate-200 text-slate-800';
};

export const UnifiedReadinessPanel = () => {
  const [data, setData] = useState<UnifiedReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // "항목이 0건" 과 "조회 자체가 실패" 를 구분하기 위한 별도 상태 — 둘을 구분하지
  // 않으면 실패 시에도 빈 화면으로 보여 사용자가 원인을 알 수 없다.
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetchUnifiedReadiness();
      if (!res) throw new Error('empty response');
      setData(res);
    } catch (err) {
      console.error('Failed to load unified readiness', err);
      setLoadError(true);
      toast.error('통합 준비도 로드 실패', {
        description: '백엔드 연결을 확인하세요.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (item: UnifiedItem) => {
    if (!item.is_manual) return;
    try {
      await toggleChecklistItem(item.key);
      await load(); // 토글이 요약 집계(통과 수)에도 영향을 주므로 전체를 다시 읽는다
    } catch (err) {
      console.error('Failed to toggle item', err);
      toast.error('항목 변경 실패', {
        description: err instanceof Error ? err.message : '백엔드 연결을 확인하세요.',
      });
    }
  };

  if (loading) {
    return (
      <div className="sfdc-card overflow-hidden flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-xs font-bold font-mono">
        통합 준비도 로딩 중...
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="sfdc-card flex flex-col items-center gap-2 py-8 bg-white border border-slate-200/80 rounded-2xl shadow-sm text-rose-600 text-xs font-bold">
        <AlertTriangle className="w-5 h-5" />
        통합 준비도를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
      </div>
    );
  }

  const { summary, groups, generated_at } = data;
  const gatePct = summary.gate_total > 0 ? (summary.gate_passed / summary.gate_total) * 100 : 0;
  const isAllCleared = summary.gate_total > 0 && summary.gate_passed === summary.gate_total;
  // 유효 표본이 목표에 못 미치면 아래 판정들은 전부 잠정치로 읽어야 한다.
  const isProvisional = summary.independent_days < summary.target_days;

  return (
    <div className="sfdc-card overflow-hidden flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm">
      {/* ── 헤더 ─────────────────────────────────────────────────────── */}
      <div className="p-5 px-6 md:px-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80 flex-shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight uppercase">
              전략 검증 &amp; 실계좌 준비도
            </h2>
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              UNIFIED READINESS — DATA / STRATEGY / LIVE GATE
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-slate-100/80 text-slate-700 border border-slate-200/60 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            마지막 관측:{' '}
            {new Date(generated_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-black font-mono border',
              isAllCleared
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            )}
          >
            LIVE 게이트 {summary.gate_passed}/{summary.gate_total} ({Math.round(gatePct)}%)
          </span>
        </div>
      </div>

      {/* ── 요약 지표 4칸 ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100 border-b border-slate-100">
        <SummaryTile
          label="독립 관측일수"
          value={`${summary.independent_days}일`}
          sub={`목표 ${summary.target_days}일`}
          tone={isProvisional ? 'warn' : 'good'}
        />
        <SummaryTile
          label="라벨 오염률"
          value={`${summary.contamination_pct.toFixed(1)}%`}
          sub="10% 미만 정상"
          tone={summary.contamination_pct >= 10 ? 'bad' : 'good'}
        />
        <SummaryTile
          label="개선 악화(REGRESSED)"
          value={`${summary.improvement_counts.REGRESSED ?? 0}건`}
          sub={`자동 롤백 ${summary.improvement_rolled_back}건`}
          tone={(summary.improvement_counts.REGRESSED ?? 0) > 0 ? 'bad' : 'good'}
        />
        <SummaryTile
          label="LIVE 게이트 미충족"
          value={`${summary.gate_blocking.length}건`}
          sub={isAllCleared ? '전 항목 통과' : '전환 불가'}
          tone={isAllCleared ? 'good' : 'warn'}
        />
      </div>

      {/* ── 유효 표본 경고 배너 ───────────────────────────────────────── */}
      {isProvisional && (
        <div className="px-6 md:px-8 py-3 bg-amber-50/70 border-b border-amber-200/70 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
            <span className="font-black">아래 판정은 모두 잠정치입니다.</span> 통계적 유효 표본은
            행 수가 아니라 독립 거래일 수에 가까운데(같은 날 신호들은 같은 시장에 노출돼 서로
            독립이 아님), 현재 {summary.independent_days}일로 목표 {summary.target_days}일에
            못 미칩니다. VERIFIED/REGRESSED 어느 쪽이든 근거가 얕다고 보아야 하며, 이 상태에서
            매매 로직을 바꾸면 도입 며칠 만에 되돌리는 패턴이 반복됩니다.
          </p>
        </div>
      )}

      {/* ── 그룹별 항목 ───────────────────────────────────────────────── */}
      {groups.map((group) => {
        const GroupIcon = GROUP_ICON[group.key] ?? Database;
        return (
          <section key={group.key} className="border-b border-slate-100 last:border-b-0">
            <div className="px-6 md:px-8 py-3 bg-slate-50/60 flex items-center gap-2.5">
              <GroupIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  {group.title}
                  <span className="ml-2 font-mono font-bold text-slate-400">
                    {group.items.length}건
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">{group.subtitle}</p>
              </div>
            </div>

            {/* Desktop (≥768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-bold font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200/80 bg-white whitespace-nowrap">
                    <th className="py-2.5 px-6 text-left w-[20%]">항목</th>
                    <th className="py-2.5 px-4 text-left w-[38%]">지표</th>
                    <th className="py-2.5 px-4 text-left w-[16%]">상태 / 진척도</th>
                    <th className="py-2.5 px-6 text-left w-[26%]">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.items.map((item) => {
                    const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.COLLECTING;
                    const Icon = badge.icon;
                    return (
                      <tr
                        key={`${group.key}-${item.key}`}
                        className={clsx(
                          'odd:bg-white even:bg-slate-50/40 transition-colors',
                          item.is_manual
                            ? 'cursor-pointer hover:bg-indigo-50/40'
                            : 'hover:bg-indigo-50/20'
                        )}
                        onClick={() => handleToggle(item)}
                      >
                        <td className="py-3.5 px-6 align-middle">
                          <span className="text-[13px] font-black text-slate-900 tracking-tight block leading-snug">
                            {item.label}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-400 block mt-0.5">
                            {item.adopted_at ? `도입일: ${item.adopted_at}` : item.category}
                            {item.is_manual && ' · 클릭해 수동 체크'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 align-middle">
                          <div className="flex flex-wrap items-center gap-1.5 font-mono">
                            {item.metrics.length === 0 ? (
                              <span className="text-[11px] text-slate-400">—</span>
                            ) : (
                              item.metrics.map((m) => (
                                <div
                                  key={m.label}
                                  className={clsx(
                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap',
                                    getMetricStyle(m.value)
                                  )}
                                >
                                  <span className="font-bold opacity-75">{m.label}:</span>
                                  <span className="font-extrabold tracking-tight">{m.value}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-middle">
                          <div className="flex flex-col gap-1.5">
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
                              <div className="h-2 w-16 bg-slate-200/80 rounded-full overflow-hidden shrink-0">
                                <div
                                  className={clsx('h-full rounded-full transition-all', badge.bar)}
                                  style={{ width: `${item.progress_pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-black font-mono text-slate-800">
                                {item.progress_pct}%
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-6 align-middle">
                          <p className="text-[11px] font-medium text-slate-600 leading-snug">
                            {item.note || '—'}
                          </p>
                          {item.auto_rollback_applied && (
                            <p className="flex items-start gap-1 text-[10px] font-bold text-rose-600 mt-1">
                              <RotateCcw className="w-3 h-3 shrink-0 mt-0.5" />
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

            {/* Mobile (<768px) */}
            <div className="block md:hidden p-4 space-y-3">
              {group.items.map((item) => {
                const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.COLLECTING;
                const Icon = badge.icon;
                return (
                  <div
                    key={`${group.key}-${item.key}-m`}
                    className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2.5"
                    onClick={() => handleToggle(item)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <span className="text-[13px] font-bold text-slate-800 block leading-snug">
                          {item.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {item.adopted_at ? `도입: ${item.adopted_at}` : item.category}
                        </span>
                      </div>
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border shrink-0',
                          badge.badge
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full', badge.bar)}
                          style={{ width: `${item.progress_pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono font-bold">{item.progress_pct}%</span>
                    </div>
                    {item.metrics.length > 0 && (
                      <div className="text-xs font-mono space-y-1.5 bg-white p-3 rounded-lg border border-slate-100">
                        {item.metrics.map((m) => (
                          <div
                            key={m.label}
                            className={clsx(
                              'flex justify-between items-center gap-2 px-2.5 py-1 rounded text-[11px] border',
                              getMetricStyle(m.value)
                            )}
                          >
                            <span className="font-semibold opacity-75">{m.label}</span>
                            <span className="font-extrabold">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.note && (
                      <p className="text-[11px] text-slate-500 leading-snug">{item.note}</p>
                    )}
                    {item.auto_rollback_applied && (
                      <p className="flex items-start gap-1 text-[10px] font-bold text-rose-600">
                        <RotateCcw className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>자동 롤백 적용됨 — {item.auto_rollback_detail}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* ── 하단: LIVE 전환 액션 ──────────────────────────────────────── */}
      <div className="p-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
        <button
          disabled={!isAllCleared}
          className={clsx(
            'w-full font-black transition-all text-xs py-3.5 rounded-xl',
            isAllCleared
              ? 'sfdc-button-primary shadow-xl'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          )}
        >
          {isAllCleared
            ? 'Request Live Account Transition'
            : `LIVE 전환까지 ${summary.gate_blocking.length}개 항목 남음`}
        </button>
      </div>
    </div>
  );
};

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="px-5 py-4 bg-white">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={clsx('text-xl font-black font-mono leading-tight mt-1', toneClass)}>{value}</p>
      <p className="text-[10px] font-medium text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}
