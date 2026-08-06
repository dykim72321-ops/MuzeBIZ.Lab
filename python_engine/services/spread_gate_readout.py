"""
spread_gate_readout.py — 스프레드 게이트 배포(2026-08-06) 전/후 성과 판독기.

배경
----
2026-08-06 실측(scripts/run_feature_significance.py, 독립 사건 n=1,391)에서 진입 신호
성분이 전부 forward return과 무상관으로 확인됐다:

    rsi r=0.006(p=0.83) / rvol r=0.013(p=0.63) / adx r=-0.034(p=0.22)
    dna_score r=-0.062  / DNA 구간별 평균수익률이 75~80·80+ 구간에서 오히려 역전

반면 결과를 실제로 갈라놓은 유일한 변수는 체결 비용이었다 — 스프레드 Shadow 실측
42건에서 SCYX 31.6%·INFU 30.6% 같은 왕복 스프레드가 확인됐고(>2%가 38.1%),
EXECUTED 평균 30m 수익률(-2.497%)이 BLOCKED(-0.045%)보다 나빴다. 즉 남은 개선
여력은 신호가 아니라 비용·사고 쪽이라는 결론이었고, 그에 따라 같은 날 두 가지가
배포됐다:

    9637e99  스캐너 최소 달러볼륨 $200k → $5M
    c771810  스프레드 게이트 Shadow(기록전용) → 실제 차단(>3%) 승격

이 모듈은 그 두 변경의 효과를 배포 전/후로 갈라 판독한다. 배포 직후에는 표본이
0건이므로 의미가 없고, MIN_SAMPLES_FOR_VERDICT(40 포지션)가 쌓인 뒤에야 판정이
나온다 — 목표 판독일은 READOUT_TARGET_DATE(2026-08-22)이다.

왜 "판독일까지 아무것도 바꾸지 않는 것"이 중요한가
--------------------------------------------------
scripts/run_feature_significance.py가 --since를 기본값으로 갖고 개선 도입일마다
표본을 잘라내는 이유와 같다 — 서로 다른 게이트 파라미터 체제가 한 표본에 섞이면
어느 변경이 효과를 냈는지 영원히 분리할 수 없다. 이 프로젝트는 이미 그 문제를
겪었다(CLAUDE.md "개선 검증 트래커" 항목 참고). 판독일 전에 다른 로직을 얹으면
이 모듈의 after 구간이 오염된다.

승률/PF는 routers/strategy.py의 _compute_bucket_stats()를 그대로 재사용한다 —
대시보드·체크리스트와 다른 산식을 쓰면 같은 시스템이 서로 다른 숫자를 말하게
된다(checklist.py의 n_ts/pos_wr 분모 불일치 버그, 2026-07-27 참고).

실행
----
    python_engine/.venv/bin/python -m services.spread_gate_readout
    python_engine/.venv/bin/python -m services.spread_gate_readout --json

스케줄러(schedulers/tasks.py의 spread_gate_readout_scheduler)가 매일 1회 판독일
도달 여부를 확인해 Discord로 자동 발송하므로, 위 CLI는 수동 조기 확인용이다.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

# ── 판독 기준 상수 ────────────────────────────────────────────────────────────
# 배포 시각(c771810 커밋 시각, KST 2026-08-06 21:30:16 = UTC 12:30:16). 달러볼륨
# 상향(9637e99)이 7분 앞서 배포됐지만 두 변경은 같은 목적(체결 비용 방어)의 한 묶음
# 이므로 굳이 분리하지 않고 나중 시각 하나를 경계로 쓴다.
SPREAD_GATE_DEPLOY_AT = datetime(2026, 8, 6, 12, 30, 16, tzinfo=timezone.utc)

# 판독 목표일 — 배포 후 약 2주(정규장 기준 11거래일). 이 날짜 이전에는 스케줄러가
# 발송하지 않는다(표본 부족 상태의 숫자가 결론처럼 읽히는 것을 막기 위함).
READOUT_TARGET_DATE = date(2026, 8, 22)

# 판정에 필요한 최소 포지션 라운드트립 수. 이 미만이면 어떤 PF/승률이 나와도
# COLLECTING으로 남긴다.
MIN_SAMPLES_FOR_VERDICT = 40

# 중단 기준(kill criteria). 표본이 충분한데도 PF가 이 값 미만이면 스프레드도 원인이
# 아니었다는 뜻이고, 지표 튜닝으로는 복구 불가 — 접근법 자체를 재검토해야 한다.
KILL_PF_THRESHOLD = 0.7

# 실계좌 전환 게이트 (routers/checklist.py와 동일 기준)
LIVE_GATE_WIN_RATE = 55.0
LIVE_GATE_PROFIT_FACTOR = 1.3

# 게이트 누수 판정 임계값 — paper_engine.SPREAD_GATE_MAX_PCT와 동일해야 한다.
# 배포 후 EXECUTED 행에 이 값을 넘는 spread_pct가 있으면 게이트가 실제로는 작동하지
# 않았다는 뜻이므로, 아래 성과 숫자를 해석하기 전에 그것부터 고쳐야 한다.
from engine.paper_engine import SPREAD_GATE_MAX_PCT  # noqa: E402

_PAGE_SIZE = 1000

_DECISION_COLUMNS = (
    "ticker,gate,outcome,spread_pct,quote_stale,"
    "forward_return_30m,forward_return_60m,ts"
)
_HISTORY_COLUMNS = "pnl_pct,profit_amt,closed_at,ticker,entry_price,exit_reason"


def _fetch_all(supabase, table: str, columns: str, order_col: str, since_iso: str):
    """since_iso 이후 행 전체를 페이지네이션으로 조회 (Supabase 기본 1,000행 상한 회피)."""
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            supabase.table(table)
            .select(columns)
            .gte(order_col, since_iso)
            .order(order_col, desc=False)
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        )
        page = res.data or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return rows


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def _forward_stats(rows: list[dict], key: str) -> dict:
    vals = [float(r[key]) for r in rows if r.get(key) is not None]
    wins = [v for v in vals if v > 0]
    return {
        "n": len(vals),
        "mean_pct": _mean(vals),
        "win_rate_pct": round(len(wins) / len(vals) * 100, 1) if vals else None,
    }


def compute_spread_gate_readout(supabase, now: datetime | None = None) -> dict:
    """배포 전/후 두 구간의 체결 품질·수익성 지표를 산출한다 (동기 — DB I/O 포함).

    before 구간은 forward_return_logger 도입일(2026-07-18) 이후로 자른다 —
    그 이전에는 forward_return이 아예 채워지지 않아 비교 대상이 되지 못한다.
    """
    now = now or datetime.now(timezone.utc)
    before_since = datetime(2026, 7, 18, tzinfo=timezone.utc)

    decisions = _fetch_all(
        supabase, "engine_decisions", _DECISION_COLUMNS, "ts", before_since.isoformat()
    )
    history_raw = _fetch_all(
        supabase,
        "paper_history",
        _HISTORY_COLUMNS,
        "closed_at",
        before_since.isoformat(),
    )

    # phantom 사고 소급 복구 행은 같은 사건의 실제 청산 행과 중복 집계된다
    from utils.utils import is_backfilled_phantom_trade

    history = [t for t in history_raw if not is_backfilled_phantom_trade(t)]

    def _split(rows: list[dict], ts_key: str):
        before, after = [], []
        for r in rows:
            dt = _parse_ts(r.get(ts_key))
            if dt is None:
                continue
            (after if dt >= SPREAD_GATE_DEPLOY_AT else before).append(r)
        return before, after

    dec_before, dec_after = _split(decisions, "ts")
    hist_before, hist_after = _split(history, "closed_at")

    from routers.strategy import _compute_bucket_stats

    def _section(dec_rows: list[dict], hist_rows: list[dict]) -> dict:
        executed = [r for r in dec_rows if r.get("outcome") == "EXECUTED"]
        stats = _compute_bucket_stats(hist_rows)
        return {
            "executed_signals": len(executed),
            "forward_30m": _forward_stats(executed, "forward_return_30m"),
            "forward_60m": _forward_stats(executed, "forward_return_60m"),
            "closed_rows": len(hist_rows),
            "positions": stats["pos_total_trades"],
            "win_rate_pct": stats["pos_win_rate"],
            "profit_factor": stats["profit_factor"],
            "avg_pnl_usd": stats["avg_pnl"],
        }

    before = _section(dec_before, hist_before)
    after = _section(dec_after, hist_after)

    # ── 게이트 자체가 작동했는지 (성과 해석의 전제조건) ────────────────────────
    executed_after = [r for r in dec_after if r.get("outcome") == "EXECUTED"]
    spreads = [
        float(r["spread_pct"])
        for r in executed_after
        if r.get("spread_pct") is not None
    ]
    leaks = [s for s in spreads if s > SPREAD_GATE_MAX_PCT]
    blocked_by_spread = sum(1 for r in dec_after if r.get("gate") == "SPREAD_TOO_WIDE")

    gate_health = {
        "entries_with_spread_logged": len(spreads),
        "entries_missing_spread": len(executed_after) - len(spreads),
        "mean_spread_pct": _mean(spreads),
        "max_spread_pct": round(max(spreads), 2) if spreads else None,
        "over_threshold_count": len(leaks),
        "blocked_by_spread_gate": blocked_by_spread,
        "threshold_pct": SPREAD_GATE_MAX_PCT,
        "is_leaking": len(leaks) > 0,
    }

    # ── 판정 ──────────────────────────────────────────────────────────────────
    n = after["positions"]
    pf = after["profit_factor"]
    wr = after["win_rate_pct"]

    if gate_health["is_leaking"]:
        verdict = "GATE_LEAKING"
        verdict_text = (
            f"게이트 누수 — 배포 후 진입 {len(leaks)}건의 스프레드가 "
            f"{SPREAD_GATE_MAX_PCT}%를 초과했다. 아래 성과 숫자를 해석하기 전에 "
            "차단 경로부터 점검할 것."
        )
    elif n < MIN_SAMPLES_FOR_VERDICT:
        verdict = "COLLECTING"
        verdict_text = (
            f"표본 부족 ({n}/{MIN_SAMPLES_FOR_VERDICT} 포지션). 판정 보류 — "
            "이 구간에서 로직을 추가 변경하면 표본이 오염되므로 동결 유지."
        )
    elif wr >= LIVE_GATE_WIN_RATE and pf >= LIVE_GATE_PROFIT_FACTOR:
        verdict = "LIVE_GATE_PASS"
        verdict_text = (
            f"실계좌 게이트 통과 (승률 {wr}% ≥ {LIVE_GATE_WIN_RATE}%, "
            f"PF {pf} ≥ {LIVE_GATE_PROFIT_FACTOR}). 별도 검증 후 전환 검토 가능."
        )
    elif pf >= KILL_PF_THRESHOLD:
        verdict = "IMPROVED"
        verdict_text = (
            f"개선 확인 (PF {pf} ≥ {KILL_PF_THRESHOLD})되었으나 실계좌 게이트"
            f"(승률 {LIVE_GATE_WIN_RATE}%/PF {LIVE_GATE_PROFIT_FACTOR})에는 미달. "
            "관측 계속."
        )
    else:
        verdict = "KILL_CRITERIA_MET"
        verdict_text = (
            f"중단 기준 도달 — 표본 {n}건에서 PF {pf} < {KILL_PF_THRESHOLD}. "
            "스프레드도 원인이 아니었다는 뜻이므로 지표 튜닝으로는 복구 불가. "
            "분 단위 모멘텀 접근 자체를 재검토할 것."
        )

    return {
        "generated_at": now.isoformat(),
        "deploy_at": SPREAD_GATE_DEPLOY_AT.isoformat(),
        "readout_target_date": READOUT_TARGET_DATE.isoformat(),
        "days_since_deploy": (now - SPREAD_GATE_DEPLOY_AT).days,
        "before": before,
        "after": after,
        "gate_health": gate_health,
        "verdict": verdict,
        "verdict_text": verdict_text,
    }


# ── 표현 계층 ────────────────────────────────────────────────────────────────

_VERDICT_COLOR = {
    "GATE_LEAKING": 0xE74C3C,
    "COLLECTING": 0x95A5A6,
    "IMPROVED": 0xF1C40F,
    "LIVE_GATE_PASS": 0x2ECC71,
    "KILL_CRITERIA_MET": 0xE74C3C,
}


def _fmt(value, suffix: str = "", none_text: str = "N/A") -> str:
    return none_text if value is None else f"{value}{suffix}"


def build_discord_fields(readout: dict) -> list[dict]:
    b, a, g = readout["before"], readout["after"], readout["gate_health"]

    def _perf_block(s: dict) -> str:
        return (
            f"포지션 {s['positions']}건 / 승률 {_fmt(s['win_rate_pct'], '%')}\n"
            f"PF {_fmt(s['profit_factor'])} / 평균손익 ${_fmt(s['avg_pnl_usd'])}\n"
            f"진입시점 30m 수익률 {_fmt(s['forward_30m']['mean_pct'], '%')} "
            f"(n={s['forward_30m']['n']})"
        )

    return [
        {
            "name": "📉 배포 전 (7/18 ~ 8/6)",
            "value": _perf_block(b),
            "inline": True,
        },
        {
            "name": "📈 배포 후 (8/6 ~ )",
            "value": _perf_block(a),
            "inline": True,
        },
        {
            "name": f"🚧 스프레드 게이트 작동 상태 (임계 {g['threshold_pct']}%)",
            "value": (
                f"진입 스프레드 평균 {_fmt(g['mean_spread_pct'], '%')} / "
                f"최대 {_fmt(g['max_spread_pct'], '%')}\n"
                f"임계 초과 진입(누수) {g['over_threshold_count']}건 · "
                f"게이트 차단 {g['blocked_by_spread_gate']}건\n"
                f"스프레드 미기록 진입 {g['entries_missing_spread']}건"
            ),
            "inline": False,
        },
        {
            "name": f"⚖️ 판정: {readout['verdict']}",
            "value": readout["verdict_text"],
            "inline": False,
        },
    ]


def format_readout_text(readout: dict) -> str:
    """CLI 출력용 평문 리포트."""
    b, a, g = readout["before"], readout["after"], readout["gate_health"]
    lines = [
        "=" * 78,
        "  📐 스프레드 게이트 판독 (2026-08-06 배포 전/후 대조)",
        "=" * 78,
        f"  배포 시각   : {readout['deploy_at']} (D+{readout['days_since_deploy']})",
        f"  목표 판독일 : {readout['readout_target_date']}",
        "",
        f"{'지표':<24}{'배포 전':>18}{'배포 후':>18}",
        "-" * 60,
    ]
    rows = [
        ("포지션 수", b["positions"], a["positions"]),
        ("승률 (%)", b["win_rate_pct"], a["win_rate_pct"]),
        ("Profit Factor", b["profit_factor"], a["profit_factor"]),
        ("평균 손익 ($)", b["avg_pnl_usd"], a["avg_pnl_usd"]),
        ("EXECUTED 신호 수", b["executed_signals"], a["executed_signals"]),
        (
            "진입 30m 평균 (%)",
            b["forward_30m"]["mean_pct"],
            a["forward_30m"]["mean_pct"],
        ),
        (
            "진입 60m 평균 (%)",
            b["forward_60m"]["mean_pct"],
            a["forward_60m"]["mean_pct"],
        ),
    ]
    for label, before_v, after_v in rows:
        lines.append(f"{label:<24}{_fmt(before_v):>18}{_fmt(after_v):>18}")

    lines += [
        "",
        f"  스프레드 게이트 (임계 {g['threshold_pct']}%):",
        f"    진입 스프레드 평균 {_fmt(g['mean_spread_pct'], '%')} / "
        f"최대 {_fmt(g['max_spread_pct'], '%')} (n={g['entries_with_spread_logged']})",
        f"    임계 초과 진입(누수) {g['over_threshold_count']}건 · "
        f"게이트 차단 {g['blocked_by_spread_gate']}건",
        f"    스프레드 미기록 진입 {g['entries_missing_spread']}건",
        "",
        f"  ⚖️ 판정: {readout['verdict']}",
        f"     {readout['verdict_text']}",
        "=" * 78,
    ]
    return "\n".join(lines)


async def run_and_notify(force: bool = False) -> dict | None:
    """판독 후 Discord 발송. 판독일 이전이면 force=True가 아닌 한 건너뛴다."""
    from app.state import app_state

    supabase = app_state.supabase
    if not supabase:
        return None

    today = datetime.now(ZoneInfo("America/New_York")).date()
    if not force and today < READOUT_TARGET_DATE:
        return None

    readout = await asyncio.to_thread(compute_spread_gate_readout, supabase)

    webhook = app_state.webhook
    if webhook:
        await webhook.send_alert(
            title="📐 스프레드 게이트 판독 리포트",
            description=(
                f"2026-08-06 배포(달러볼륨 $5M + 스프레드 게이트 {SPREAD_GATE_MAX_PCT}%) "
                f"후 D+{readout['days_since_deploy']} 시점 전/후 대조."
            ),
            color=_VERDICT_COLOR.get(readout["verdict"], 0x3498DB),
            fields=build_discord_fields(readout),
        )
    return readout


def _main() -> None:
    import argparse
    import json
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    from dotenv import load_dotenv

    base = os.path.join(os.path.dirname(__file__), "..")
    load_dotenv(dotenv_path=os.path.join(base, ".env.local"))
    load_dotenv(dotenv_path=os.path.join(base, ".env"))

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="JSON으로 출력")
    args = parser.parse_args()

    from supabase import create_client

    sb = create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
    )
    readout = compute_spread_gate_readout(sb)
    print(
        json.dumps(readout, indent=2, ensure_ascii=False)
        if args.json
        else format_readout_text(readout)
    )


if __name__ == "__main__":
    _main()
