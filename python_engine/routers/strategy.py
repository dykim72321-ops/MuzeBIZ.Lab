"""
routers/strategy.py — /api/strategy/stats, /api/strategy/reports 엔드포인트
"""

import asyncio
import threading
from datetime import datetime, timezone, timedelta

import numpy as np
from cachetools import TTLCache
from fastapi import APIRouter

from state import app_state

router = APIRouter(prefix="/api/strategy", tags=["strategy"])

# "stats" + "recent_pnls" + "reports_week"/"reports_month" 키 공존
stats_cache: TTLCache = TTLCache(maxsize=8, ttl=300)
_stats_cache_lock = threading.Lock()

_MAX_PROFIT_FACTOR = 99.0


def _base_stats(is_simulated: bool, message: str, badge: str) -> dict:
    return {
        "win_rate": 0,
        "profit_factor": 0,
        "mdd": 0,
        "recovery_days": 0,
        "avg_pnl": 0,
        "total_trades": 0,
        "recent_win_rate": None,
        "baseline_win_rate": None,
        "drift": None,
        "recent_trades_count": 0,
        "is_simulated": is_simulated,
        "message": message,
        "badge": badge,
    }


def _compute_bucket_stats(trades: list) -> dict:
    """거래 리스트 → win_rate/profit_factor/mdd/avg_pnl 등 통계 dict. 빈 리스트도 안전 처리."""
    total_trades = len(trades)
    if total_trades == 0:
        return {
            "win_rate": 0,
            "profit_factor": 0,
            "mdd": 0,
            "avg_pnl": 0,
            "total_trades": 0,
            "gross_profit": 0.0,
            "gross_loss": 0.0,
        }

    win_count = 0
    gross_profit = 0.0
    gross_loss = 0.0
    pnl_sum = 0.0
    pnl_arr = np.empty(total_trades, dtype=np.float64)

    for i, t in enumerate(trades):
        pnl = float(t.get("pnl_pct") or 0)
        amt = float(t.get("profit_amt") or 0)
        pnl_arr[i] = pnl
        pnl_sum += pnl
        if pnl > 0:
            win_count += 1
        if amt > 0:
            gross_profit += amt
        elif amt < 0:
            gross_loss -= amt

    win_rate = round(win_count / total_trades * 100, 1)
    avg_pnl = round(pnl_sum / total_trades, 2)
    profit_factor = (
        round(gross_profit / gross_loss, 2)
        if gross_loss > 0
        else (_MAX_PROFIT_FACTOR if gross_profit > 0 else 0.0)
    )

    cumulative = np.cumsum(pnl_arr)
    running_max = np.maximum.accumulate(cumulative)
    mdd = round(float(np.min(cumulative - running_max)), 2)

    return {
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "mdd": mdd,
        "avg_pnl": avg_pnl,
        "total_trades": total_trades,
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
    }


@router.get("/stats")
async def get_strategy_stats():
    """paper_history 기반 실거래 통계 반환 (5분 TTL 캐시 적용)."""
    supabase = app_state.supabase
    if not supabase:
        return _base_stats(True, "DB 미연결 — 통계 없음", "⚠️ DB 미연결")

    if "stats" in stats_cache:
        return stats_cache["stats"]

    try:
        res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("pnl_pct,profit_amt,closed_at,ticker,exit_reason")
            .order("closed_at", desc=False)
            .execute
        )
        trades = res.data or []

        if not trades:
            return _base_stats(
                False,
                "거래 내역 없음 — 첫 매매 후 통계가 집계됩니다",
                "📊 거래 대기 중",
            )

        cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        recent_trades = [t for t in trades if (t.get("closed_at") or "") >= cutoff_iso]
        baseline_trades = [t for t in trades if (t.get("closed_at") or "") < cutoff_iso]

        def _win_rate_of(bucket: list):
            if not bucket:
                return None
            wins = sum(1 for t in bucket if float(t.get("pnl_pct") or 0) > 0)
            return round(wins / len(bucket) * 100, 1)

        recent_wr = _win_rate_of(recent_trades)
        baseline_wr = _win_rate_of(baseline_trades)
        drift = (
            round(recent_wr - baseline_wr, 1)
            if recent_wr is not None and baseline_wr is not None
            else None
        )

        bucket_stats = _compute_bucket_stats(trades)

        with _stats_cache_lock:
            stats_cache["recent_pnls"] = [float(t.get("pnl_pct") or 0) for t in trades][
                -50:
            ]

        win_rate = bucket_stats["win_rate"]
        profit_factor = bucket_stats["profit_factor"]

        message = "거래 내역 기반 통계입니다."
        if drift is not None and drift <= -10:
            badge = f"🚨 알고리즘 Edge 소멸 감지: 파라미터 재최적화 요망 (승률 ↓{abs(drift):.1f}%p)"
            message = (
                "최근 30일 승률이 이론 승률과 심각한 괴리가 발생했습니다. "
                "동적 켈리 비중 축소를 확인하고 시장 Regime Change를 점검하세요."
            )
        elif win_rate >= 55 and profit_factor >= 1.3:
            badge = f"🛡️ System Edge: 승률 {win_rate}% (실거래 검증)"
        elif bucket_stats["total_trades"] < 5:
            badge = f"📊 데이터 축적 중 ({bucket_stats['total_trades']}건)"
            message = "거래 데이터 축적 중입니다."
        else:
            badge = f"📉 전략 점검 필요 (승률 {win_rate}%)"

        result = {
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "mdd": bucket_stats["mdd"],
            "recovery_days": 0,
            "avg_pnl": bucket_stats["avg_pnl"],
            "total_trades": bucket_stats["total_trades"],
            "recent_win_rate": recent_wr,
            "baseline_win_rate": baseline_wr,
            "drift": drift,
            "recent_trades_count": len(recent_trades),
            "is_simulated": False,
            "message": f"실거래 {bucket_stats['total_trades']}건 기준 통계",
            "badge": badge,
        }
        with _stats_cache_lock:
            stats_cache["stats"] = result
        return result

    except Exception as e:
        print(f"❌ [strategy/stats] {e}")
        return _base_stats(True, f"통계 계산 오류: {e}", "⚠️ 오류")


@router.get("/reports")
async def get_strategy_reports(period: str = "month"):
    """paper_history를 주간/월간 버킷으로 그룹핑해 기간별 성과 리포트 반환."""
    if period not in ("week", "month"):
        period = "month"

    supabase = app_state.supabase
    if not supabase:
        return {"period": period, "buckets": [], "message": "DB 미연결 — 리포트 없음"}

    cache_key = f"reports_{period}"
    if cache_key in stats_cache:
        return stats_cache[cache_key]

    try:
        res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("pnl_pct,profit_amt,closed_at,ticker,exit_reason")
            .order("closed_at", desc=False)
            .execute
        )
        trades = res.data or []

        if not trades:
            result = {"period": period, "buckets": [], "message": "거래 내역 없음"}
            with _stats_cache_lock:
                stats_cache[cache_key] = result
            return result

        buckets: dict[str, list] = {}
        for t in trades:
            closed_at = t.get("closed_at")
            if not closed_at:
                continue
            dt = datetime.fromisoformat(closed_at.replace("Z", "+00:00"))
            if period == "week":
                iso_year, iso_week, _ = dt.isocalendar()
                label = f"{iso_year}-W{iso_week:02d}"
            else:
                label = f"{dt.year:04d}-{dt.month:02d}"
            buckets.setdefault(label, []).append(t)

        bucket_list = []
        for label in sorted(buckets.keys()):
            bucket_trades = buckets[label]
            stats = _compute_bucket_stats(bucket_trades)
            bucket_list.append(
                {
                    "period_label": label,
                    **stats,
                }
            )

        result = {
            "period": period,
            "buckets": bucket_list,
            "message": "거래 내역 기반 리포트입니다.",
        }
        with _stats_cache_lock:
            stats_cache[cache_key] = result
        return result

    except Exception as e:
        print(f"❌ [strategy/reports] {e}")
        return {"period": period, "buckets": [], "message": f"리포트 계산 오류: {e}"}
