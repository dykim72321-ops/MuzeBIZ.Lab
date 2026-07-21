"""
run_feature_significance.py — DNA_Score/RSI/RVOL이 실제로 미래 수익률(forward return)을
예측하는지, 라이브에서 수집된 실측 데이터(engine_decisions)로 검증하는 독립 스크립트.

배경: backtest_harness/run_scale_out_experiment.py·run_signal_quality_experiment.py로
청산 구조(Scale-Out)·진입 게이트(numba/DNA 임계값)를 조정해 봤지만 규모 있는 백테스트
(44종목, 213건)에서 Profit Factor가 1.0을 넘지 못했다. 이는 청산/게이트 파라미터가
아니라 DNA_Score 자체의 예측력(Alpha) 부재가 근본 원인일 가능성을 시사한다
(2026-07-18 세션의 "DNA 점수 예측력 부재가 핵심 병목" 진단과 일치).

이 스크립트는 시뮬레이션이 아니라 schedulers/tasks.py의 forward_return_logger()가
engine_decisions 테이블에 실제로 채워 넣은 30분·60분 후 실측 가격 변화를 사용해,
"DNA_Score가 높을수록 실제로 수익률이 좋았는가"를 데이터로 직접 확인한다.

routers/checklist.py의 개선 검증 트래커(compute_improvement_status)와 겹치는 부분:
이 트래커도 forward_return_logger 항목에서 DNA≥80/<80 2구간 미니 분석을 이미 대시보드에
내보낸다. 이 스크립트는 그걸 대체하는 게 아니라 5구간 세분화·RSI/RVOL 상관계수·
EXECUTED/BLOCKED 비교까지 포함한 더 깊은 오프라인 리서치 도구다 (읽기 전용이라 트래커의
자동 롤백 로직과 실행상 충돌하지 않는다). 다만 트래커는 개선 항목마다 도입일
(IMPROVEMENT_ADOPTED) 이후 데이터만 걸러서 서로 다른 게이트 파라미터 체제(whipsaw_fix/
penny_gate_80/atr_stop/extension_guard_tighten이 각각 다른 날짜에 바뀜)가 섞이지 않게
한다 — 이 스크립트도 기본적으로 동일 원칙을 적용한다(--since 참고).

실행:
  python_engine/.venv/bin/python scripts/run_feature_significance.py
  python_engine/.venv/bin/python scripts/run_feature_significance.py --limit 5000 --plot
  python_engine/.venv/bin/python scripts/run_feature_significance.py --since all  # 전체 기간(체제 혼합 주의)
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

COLUMNS = [
    "ticker",
    "gate",
    "outcome",
    "signal",
    "dna_score",
    "rsi",
    "rvol",
    "forward_return_30m",
    "forward_return_60m",
    "ts",
]
PAGE_SIZE = 1000
DNA_BIN_EDGES = [-np.inf, 40, 60, 75, 80, np.inf]
DNA_BIN_LABELS = ["<40", "40-60", "60-75", "75-80", ">=80"]

# routers/checklist.py의 IMPROVEMENT_ADOPTED와 동일 목록의 로컬 사본 — 그 모듈은
# FastAPI app_state/의존성과 결합돼 있어 독립 스크립트에서 직접 import하기엔 무겁다.
# 새 항목이 checklist.py에 추가되면 이쪽도 함께 갱신해야 한다.
# 가장 최근 도입일을 --since 기본값으로 써서, 서로 다른 게이트 파라미터 체제가 섞인
# 채로 DNA_Score 예측력을 계산하는 것을 방지한다(트래커가 각 항목별로 하는 것과 동일 원칙).
IMPROVEMENT_ADOPTED_DATES = [
    "2026-07-13",  # whipsaw_fix
    "2026-07-17",  # penny_gate_80
    "2026-07-18",  # atr_stop / forward_return_logger
    "2026-07-20",  # extension_guard_tighten
]
DEFAULT_SINCE = max(IMPROVEMENT_ADOPTED_DATES)


def _get_supabase_client():
    """infra/db_manager.py와 동일한 env var 우선순위."""
    from supabase import create_client

    url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
    )
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL/SUPABASE_KEY 환경변수가 없습니다 (.env 또는 .env.local 확인)."
        )
    return create_client(url.strip(), key.strip())


def fetch_engine_decisions(
    limit: int = 20000, since: str | None = None
) -> pd.DataFrame:
    """engine_decisions에서 forward_return_30m 또는 forward_return_60m이
    채워진(널이 아닌) 행만 페이지네이션으로 전부 가져온다.

    Supabase PostgREST는 OR 조건을 or_() 문자열로 표현해야 한다:
    forward_return_30m.not.is.null,forward_return_60m.not.is.null

    since: "YYYY-MM-DD" 이후(ts >=)만 조회. None이면 전체 기간(체제 혼합 주의,
    __main__ 참고) — 기본 호출부(main())는 DEFAULT_SINCE를 넘겨 트래커와 동일하게
    가장 최근 개선 도입일 이후 데이터로만 분석한다.
    """
    client = _get_supabase_client()
    rows: list[dict] = []
    offset = 0
    while len(rows) < limit:
        page_end = offset + PAGE_SIZE - 1
        query = (
            client.table("engine_decisions")
            .select(",".join(COLUMNS))
            .or_("forward_return_30m.not.is.null,forward_return_60m.not.is.null")
        )
        if since:
            query = query.gte("ts", f"{since}T00:00:00Z")
        res = query.order("ts", desc=False).range(offset, page_end).execute()
        page = res.data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return pd.DataFrame(rows[:limit])


def print_section(title: str):
    print("\n" + "=" * 78)
    print(f"  {title}")
    print("=" * 78)


def print_markdown_table(df: pd.DataFrame, float_cols: list[str] | None = None):
    float_cols = float_cols or []
    display_df = df.copy()
    for c in float_cols:
        if c in display_df.columns:
            display_df[c] = display_df[c].map(
                lambda v: f"{v:.3f}" if pd.notna(v) else "N/A"
            )
    headers = list(display_df.columns)
    widths = [
        (
            max(len(str(h)), *(len(str(v)) for v in display_df[h]))
            if len(display_df)
            else len(str(h))
        )
        for h in headers
    ]
    header_line = " | ".join(str(h).ljust(w) for h, w in zip(headers, widths))
    sep_line = "-|-".join("-" * w for w in widths)
    print(header_line)
    print(sep_line)
    for _, row in display_df.iterrows():
        print(" | ".join(str(row[h]).ljust(w) for h, w in zip(headers, widths)))


# ── 1. DNA_Score 구간별 예측력 분석 ───────────────────────────────────────────


def analyze_dna_bins(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["dna_bin"] = pd.cut(d["dna_score"], bins=DNA_BIN_EDGES, labels=DNA_BIN_LABELS)

    records = []
    for label in DNA_BIN_LABELS:
        bucket = d[d["dna_bin"] == label]
        r30 = bucket["forward_return_30m"].dropna()
        r60 = bucket["forward_return_60m"].dropna()
        records.append(
            {
                "dna_bin": label,
                "count": len(bucket),
                "n_30m": len(r30),
                "mean_30m_%": r30.mean() if len(r30) else np.nan,
                "median_30m_%": r30.median() if len(r30) else np.nan,
                "winrate_30m_%": (r30 > 0).mean() * 100 if len(r30) else np.nan,
                "n_60m": len(r60),
                "mean_60m_%": r60.mean() if len(r60) else np.nan,
                "median_60m_%": r60.median() if len(r60) else np.nan,
                "winrate_60m_%": (r60 > 0).mean() * 100 if len(r60) else np.nan,
            }
        )
    return pd.DataFrame(records)


# ── 2. RSI/RVOL 단일 피처 상관관계 ────────────────────────────────────────────


def analyze_feature_correlation(df: pd.DataFrame) -> pd.DataFrame:
    from scipy import stats

    records = []
    for feature in ["rsi", "rvol", "dna_score"]:
        for window in ["forward_return_30m", "forward_return_60m"]:
            pair = df[[feature, window]].dropna()
            if len(pair) < 3:
                records.append(
                    {
                        "feature": feature,
                        "window": window,
                        "n": len(pair),
                        "pearson_r": np.nan,
                        "pearson_p": np.nan,
                        "spearman_r": np.nan,
                        "spearman_p": np.nan,
                    }
                )
                continue
            pear_r, pear_p = stats.pearsonr(pair[feature], pair[window])
            spear_r, spear_p = stats.spearmanr(pair[feature], pair[window])
            records.append(
                {
                    "feature": feature,
                    "window": window,
                    "n": len(pair),
                    "pearson_r": pear_r,
                    "pearson_p": pear_p,
                    "spearman_r": spear_r,
                    "spearman_p": spear_p,
                }
            )
    return pd.DataFrame(records)


# ── checklist.py 대사(reconciliation) ─────────────────────────────────────────


def reconcile_with_checklist_preview(df: pd.DataFrame) -> dict:
    """routers/checklist.py compute_improvement_status()의 forward_return_logger
    미니 분석(DNA≥80 vs <80, forward_return_30m 평균)을 정확히 동일한 계산식으로
    재현한다 — 대시보드에 뜨는 숫자와 이 스크립트의 5구간 분석이 서로 다른 결론을
    내면 둘 중 하나에 버그가 있다는 뜻이므로, 매 실행마다 자동으로 맞대본다.

    checklist.py:154-174와 동일 로직: forward_return_30m이 있는 행만, dna_score
    None은 0으로 취급(원본의 `(d.get("dna_score") or 0)`과 동일)."""
    valid = df[df["forward_return_30m"].notna()].copy()
    valid["dna_score_filled"] = valid["dna_score"].fillna(0)
    high = valid[valid["dna_score_filled"] >= 80]["forward_return_30m"]
    low = valid[valid["dna_score_filled"] < 80]["forward_return_30m"]
    return {
        "n_total": len(valid),
        "dna_ge_80_avg_30m_%": high.mean() if len(high) else None,
        "dna_ge_80_n": len(high),
        "dna_lt_80_avg_30m_%": low.mean() if len(low) else None,
        "dna_lt_80_n": len(low),
    }


# ── 3. 게이트(Outcome) 효율성 검증 ────────────────────────────────────────────


def analyze_outcome(df: pd.DataFrame) -> pd.DataFrame:
    records = []
    for outcome_val, bucket in df.groupby("outcome"):
        r30 = bucket["forward_return_30m"].dropna()
        r60 = bucket["forward_return_60m"].dropna()
        records.append(
            {
                "outcome": outcome_val,
                "count": len(bucket),
                "mean_30m_%": r30.mean() if len(r30) else np.nan,
                "median_30m_%": r30.median() if len(r30) else np.nan,
                "mean_60m_%": r60.mean() if len(r60) else np.nan,
                "median_60m_%": r60.median() if len(r60) else np.nan,
            }
        )
    return pd.DataFrame(records).sort_values("count", ascending=False)


# ── 4. (선택) 시각화 ──────────────────────────────────────────────────────────


def save_plots(df: pd.DataFrame, output_dir: str):
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print(
            "\n⚠️ matplotlib 미설치로 플롯을 건너뜁니다 "
            "(설치 시: pip install matplotlib)."
        )
        return

    os.makedirs(output_dir, exist_ok=True)

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    for ax, window in zip(axes, ["forward_return_30m", "forward_return_60m"]):
        pair = df[["dna_score", window]].dropna()
        ax.scatter(pair["dna_score"], pair[window], alpha=0.3, s=12)
        ax.axhline(0, color="gray", linewidth=0.8)
        ax.set_xlabel("DNA_Score")
        ax.set_ylabel(f"{window} (%)")
        ax.set_title(f"DNA_Score vs {window}")
    fig.tight_layout()
    scatter_path = os.path.join(output_dir, "dna_score_vs_forward_return.png")
    fig.savefig(scatter_path, dpi=120)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(10, 6))
    d = df.copy()
    d["dna_bin"] = pd.cut(d["dna_score"], bins=DNA_BIN_EDGES, labels=DNA_BIN_LABELS)
    plot_data = [
        d[d["dna_bin"] == label]["forward_return_30m"].dropna()
        for label in DNA_BIN_LABELS
    ]
    ax.boxplot(plot_data, tick_labels=DNA_BIN_LABELS, showmeans=True)
    ax.axhline(0, color="gray", linewidth=0.8)
    ax.set_xlabel("DNA_Score bin")
    ax.set_ylabel("forward_return_30m (%)")
    ax.set_title("DNA_Score 구간별 30분 forward return 분포")
    fig.tight_layout()
    box_path = os.path.join(output_dir, "dna_bin_boxplot.png")
    fig.savefig(box_path, dpi=120)
    plt.close(fig)

    print(f"\n✅ 플롯 저장됨: {scatter_path}")
    print(f"✅ 플롯 저장됨: {box_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20000, help="최대 조회 행 수")
    parser.add_argument("--plot", action="store_true", help="matplotlib 플롯 저장")
    parser.add_argument(
        "--plot-dir",
        default=os.path.join(os.path.dirname(__file__), "_feature_significance_plots"),
    )
    parser.add_argument(
        "--since",
        default=DEFAULT_SINCE,
        help=(
            "YYYY-MM-DD 이후 데이터만 분석 (기본값: 가장 최근 개선 도입일 "
            f"{DEFAULT_SINCE} — 트래커와 동일 원칙으로 게이트 파라미터 체제 혼합 방지). "
            "'all'을 주면 전체 기간(체제 혼합 가능성 있음)."
        ),
    )
    args = parser.parse_args()
    since = None if args.since == "all" else args.since

    print("=" * 78)
    print("  📐 Feature Significance Analysis — engine_decisions 실측 데이터")
    print("=" * 78)
    print(
        f"  분석 구간: {'전체 기간' if since is None else f'{since} 이후'} "
        f"(--since {'all' if since is None else '<날짜>'}로 변경 가능)"
    )

    print("\n▶ engine_decisions 조회 중...")
    df = fetch_engine_decisions(limit=args.limit, since=since)
    if df.empty:
        print(
            "⚠️ 조건에 맞는 행이 없습니다. forward_return_logger()가 아직 충분히 "
            "돌지 않았거나, --since 이후로 아직 표본이 안 쌓였을 수 있습니다. "
            "(--since all로 전체 기간을 확인해보세요)"
        )
        return
    print(f"  → {len(df)}건 로드 (outcome 분포: {dict(df['outcome'].value_counts())})")

    for col in ["dna_score", "rsi", "rvol", "forward_return_30m", "forward_return_60m"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    print_section("0. checklist.py 대시보드 미니 분석과 대사(reconciliation)")
    recon = reconcile_with_checklist_preview(df)
    print(f"  표본 (forward_return_30m 존재): {recon['n_total']}건")
    print(
        f"  DNA≥80 평균 30m 수익률: "
        f"{recon['dna_ge_80_avg_30m_%']:+.2f}% (n={recon['dna_ge_80_n']})"
        if recon["dna_ge_80_avg_30m_%"] is not None
        else "  DNA≥80 평균 30m 수익률: N/A (표본 없음)"
    )
    print(
        f"  DNA<80 평균 30m 수익률: "
        f"{recon['dna_lt_80_avg_30m_%']:+.2f}% (n={recon['dna_lt_80_n']})"
        if recon["dna_lt_80_avg_30m_%"] is not None
        else "  DNA<80 평균 30m 수익률: N/A (표본 없음)"
    )
    print(
        "  ※ /api/checklist/improvements 대시보드의 'DNA≥80/<80 평균 30m 수익률'과 "
        "같은 계산식(routers/checklist.py:154-174)이다. 이 실행이 --since로 "
        "다른 구간을 조회했다면(현재 로드 구간과 대시보드가 항상 쓰는 "
        f"forward_return_logger 도입일 {IMPROVEMENT_ADOPTED_DATES[2]} 이후 전체는 "
        "다를 수 있음), 위 숫자가 대시보드와 정확히 일치하지 않을 수 있다 — "
        "--since 2026-07-18로 맞추면 완전히 동일한 표본이 된다. 두 숫자가 그런데도 "
        "다르면 이 스크립트나 checklist.py 둘 중 하나의 계산에 버그가 있다는 뜻."
    )

    print_section("1. DNA_Score 구간별 예측력")
    dna_table = analyze_dna_bins(df)
    print_markdown_table(
        dna_table,
        float_cols=[
            "mean_30m_%",
            "median_30m_%",
            "winrate_30m_%",
            "mean_60m_%",
            "median_60m_%",
            "winrate_60m_%",
        ],
    )
    print(
        "\n해석 가이드: DNA_Score가 실질적 예측력을 가진다면 구간이 높아질수록 "
        "mean/median/winrate가 단조 증가해야 한다. 구간별로 뒤섞여 있거나 "
        "0% 근방에 평평하게 몰려 있으면 예측력이 약하거나 없다는 뜻."
    )

    print_section("2. RSI / RVOL / DNA_Score 단일 피처 상관관계")
    corr_table = analyze_feature_correlation(df)
    print_markdown_table(
        corr_table, float_cols=["pearson_r", "pearson_p", "spearman_r", "spearman_p"]
    )
    print(
        "\n해석 가이드: |r|이 0.1 미만이면 사실상 무상관, p-value>=0.05면 "
        "통계적으로 유의하지 않음(우연으로 설명 가능)."
    )

    print_section("3. 게이트 효율성 (EXECUTED vs BLOCKED)")
    outcome_table = analyze_outcome(df)
    print_markdown_table(
        outcome_table,
        float_cols=["mean_30m_%", "median_30m_%", "mean_60m_%", "median_60m_%"],
    )
    print(
        "\n해석 가이드: 게이트가 실제로 손실을 방어하고 있다면 BLOCKED 그룹의 "
        "평균 forward return이 EXECUTED보다 낮아야(더 나쁜 신호를 걸러냈어야) 한다."
    )

    if args.plot:
        save_plots(df, args.plot_dir)


if __name__ == "__main__":
    main()
