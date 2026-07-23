"""
routers/strategy.py — /api/strategy/stats, /api/strategy/reports 엔드포인트
"""

import asyncio
import threading
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import numpy as np
from cachetools import TTLCache
from fastapi import APIRouter

from engine.paper_engine import INITIAL_CAPITAL
from app.state import app_state

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


def _group_trades_to_positions(trades: list) -> list[dict]:
    """
    paper_history 행을 포지션 단위(ticker+entry_price)로 그룹핑하여
    Scale-Out 50% 분할 매도가 발생해도 1개의 라운드트립 포지션으로 집계한다.
    KellySizer 수식 엔진과 100% 동일한 포지션 승률(p) 및 통계를 제공한다.
    """
    grouped: dict[str, dict[str, float]] = {}
    for t in trades:
        ticker = t.get("ticker", "unknown")
        entry_price = float(t.get("entry_price") or 0.0)
        profit_amt = float(t.get("profit_amt") or 0.0)

        key = f"{ticker}_{round(entry_price, 4)}"
        bucket = grouped.setdefault(key, {"total_pnl": 0.0})
        bucket["total_pnl"] += profit_amt

    return [{"profit_amt": b["total_pnl"]} for b in grouped.values()]


def _compute_bucket_stats(
    trades: list, starting_equity: float = INITIAL_CAPITAL
) -> dict:
    """거래 리스트 → win_rate/profit_factor/mdd/avg_pnl/expectancy/sortino_ratio 등 퀀트 통계 dict."""
    total_trades = len(trades)
    if total_trades == 0:
        return {
            "win_rate": 0.0,
            "pos_win_rate": 0.0,
            "profit_factor": 0.0,
            "mdd": 0.0,
            "period_mdd": 0.0,
            "avg_pnl": 0.0,
            "expectancy": 0.0,
            "sortino_ratio": 0.0,
            "total_trades": 0,
            "pos_total_trades": 0,
            "gross_profit": 0.0,
            "gross_loss": 0.0,
        }

    win_count = 0
    loss_count = 0
    gross_profit = 0.0
    gross_loss = 0.0
    profit_arr = np.empty(total_trades, dtype=np.float64)

    for i, t in enumerate(trades):
        amt = float(t.get("profit_amt") or 0)
        profit_arr[i] = amt
        if amt > 0:
            win_count += 1
            gross_profit += amt
        elif amt < 0:
            loss_count += 1
            gross_loss -= amt

    # 1. 체결 기준 승률 (Execution Level)
    win_rate = round(win_count / total_trades * 100, 1)

    # 2. 퀀트 포지션 라운드트립 기준 승률 (Position Level — Kelly Sizer 정합)
    grouped_positions = _group_trades_to_positions(trades)
    pos_total_trades = len(grouped_positions)
    pos_win_count = sum(1 for p in grouped_positions if p["profit_amt"] > 0)
    pos_win_rate = (
        round(pos_win_count / pos_total_trades * 100, 1)
        if pos_total_trades > 0
        else 0.0
    )

    # 3. 평균 달러 손익 (Avg PnL)
    net_profit = gross_profit - gross_loss
    avg_pnl = round(net_profit / total_trades, 2)

    # 4. Profit Factor
    profit_factor = (
        round(gross_profit / gross_loss, 2)
        if gross_loss > 0
        else (_MAX_PROFIT_FACTOR if gross_profit > 0 else 0.0)
    )

    # 5. 거래당 기대값 수식 ($E = p * avg_win - (1-p) * avg_loss)
    avg_win = (gross_profit / win_count) if win_count > 0 else 0.0
    avg_loss = (gross_loss / loss_count) if loss_count > 0 else 0.0
    prob_win = win_count / total_trades
    expectancy = round((prob_win * avg_win) - ((1.0 - prob_win) * avg_loss), 2)

    # 6. Sortino Ratio (손실 변동성만 평가)
    loss_amts = profit_arr[profit_arr < 0]
    if len(loss_amts) > 0:
        downside_std = float(np.std(loss_amts))
        sortino_ratio = (
            round(avg_pnl / downside_std, 2)
            if downside_std > 0
            else (_MAX_PROFIT_FACTOR if avg_pnl > 0 else 0.0)
        )
    else:
        sortino_ratio = _MAX_PROFIT_FACTOR if avg_pnl > 0 else 0.0

    # 7. 계좌 단위 MDD & 해당 기간 Local Period MDD
    equity_curve = np.concatenate(
        ([starting_equity], starting_equity + np.cumsum(profit_arr))
    )
    running_max = np.maximum.accumulate(equity_curve)

    drawdowns = np.zeros_like(equity_curve)
    mask = running_max > 0
    drawdowns[mask] = (
        (equity_curve[mask] - running_max[mask]) / running_max[mask] * 100.0
    )

    mdd = round(float(np.min(drawdowns)), 2)

    # Period Local MDD (버킷 기간 시작 자본금 대비 해당 버킷 내부 낙폭)
    local_start_equity = starting_equity
    local_equity_curve = np.concatenate(
        ([local_start_equity], local_start_equity + np.cumsum(profit_arr))
    )
    local_running_max = np.maximum.accumulate(local_equity_curve)
    local_drawdowns = np.zeros_like(local_equity_curve)
    local_mask = local_running_max > 0
    local_drawdowns[local_mask] = (
        (local_equity_curve[local_mask] - local_running_max[local_mask])
        / local_running_max[local_mask]
        * 100.0
    )
    period_mdd = round(float(np.min(local_drawdowns)), 2)

    return {
        "win_rate": win_rate,
        "pos_win_rate": pos_win_rate,
        "profit_factor": profit_factor,
        "mdd": mdd,
        "period_mdd": period_mdd,
        "avg_pnl": avg_pnl,
        "expectancy": expectancy,
        "sortino_ratio": sortino_ratio,
        "total_trades": total_trades,
        "pos_total_trades": pos_total_trades,
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
            .select("pnl_pct,profit_amt,closed_at,ticker,entry_price,exit_reason")
            .order("closed_at", desc=False)
            .execute
        )
        # phantom position 사고 복구 백필 행은 같은 사건의 실제 청산 행과 나란히 남아있어
        # 동일 거래를 두 번 집계하게 만든다 (checklist.py의 compute_improvement_status()와
        # 동일 이슈, 2026-07-23 발견) — 승률/PF/Kelly 입력에서 제외한다.
        trades = [
            t
            for t in (res.data or [])
            if not (t.get("exit_reason") or "").startswith("Manual Sell (Backfilled")
        ]

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
            # calculate_dynamic_kelly()가 ticker+entry_price로 그룹핑해 Scale-Out
            # 부분청산을 하나의 왕복매매로 합산하도록 원본 레코드를 그대로 캐시한다.
            stats_cache["recent_pnls"] = [
                {
                    "ticker": t.get("ticker"),
                    "entry_price": t.get("entry_price"),
                    "pnl_pct": t.get("pnl_pct"),
                    "profit_amt": t.get("profit_amt"),
                }
                for t in trades
            ][-50:]

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
    """paper_history를 일간/주간/월간 버킷으로 그룹핑해 기간별 성과 리포트 반환."""
    if period not in ("day", "week", "month"):
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
        all_trades = [
            t
            for t in (res.data or [])
            if not (t.get("exit_reason") or "").startswith("Manual Sell (Backfilled")
        ]

        if not all_trades:
            result = {"period": period, "buckets": [], "message": "거래 내역 없음"}
            with _stats_cache_lock:
                stats_cache[cache_key] = result
            return result

        ny_tz = ZoneInfo("America/New_York")
        now_dt = datetime.now(ny_tz)

        # UI 렌더링 부하 방지를 위한 기간 제한 적용 (Day: 3개월, Week: 1년, Month: 5년)
        if period == "day":
            cutoff_dt = now_dt - timedelta(days=90)
        elif period == "week":
            cutoff_dt = now_dt - timedelta(days=365)
        else:
            cutoff_dt = now_dt - timedelta(days=365 * 5)

        cutoff_iso = cutoff_dt.astimezone(timezone.utc).isoformat()

        # 화면에 표시하지 않는 이전 기간의 수익을 누적하여 MDD 계산의 기준 자본금(global_equity)을 정확히 맞춤
        global_equity = INITIAL_CAPITAL
        trades = []
        for t in all_trades:
            if (t.get("closed_at") or "") < cutoff_iso:
                global_equity += float(t.get("profit_amt") or 0)
            else:
                trades.append(t)

        buckets: dict[str, list] = {}
        min_dt = None

        for t in trades:
            closed_at = t.get("closed_at")
            if not closed_at:
                continue

            # UTC 기준 시간을 파싱 후 New York 시간대로 변환하여 경계선 왜곡(애프터마켓 등) 방지
            dt_utc = datetime.fromisoformat(closed_at.replace("Z", "+00:00"))
            dt = dt_utc.astimezone(ny_tz)

            if not min_dt or dt < min_dt:
                min_dt = dt

            if period == "day":
                label = f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}"
            elif period == "week":
                iso_year, iso_week, _ = dt.isocalendar()
                label = f"{iso_year}-W{iso_week:02d}"
            else:
                label = f"{dt.year:04d}-{dt.month:02d}"
            buckets.setdefault(label, []).append(t)

        # 빈 기간(Gaps) 패딩 (시계열 차트 왜곡 방지용)
        if min_dt:
            curr_dt = min_dt
            now_dt = datetime.now(ny_tz)
            while curr_dt <= now_dt:
                if period == "day":
                    label = f"{curr_dt.year:04d}-{curr_dt.month:02d}-{curr_dt.day:02d}"
                    curr_dt += timedelta(days=1)
                elif period == "week":
                    iso_year, iso_week, _ = curr_dt.isocalendar()
                    label = f"{iso_year}-W{iso_week:02d}"
                    curr_dt += timedelta(days=7)
                else:  # month
                    label = f"{curr_dt.year:04d}-{curr_dt.month:02d}"
                    # 한 달 더하기
                    month = curr_dt.month % 12 + 1
                    year = curr_dt.year + (curr_dt.month // 12)
                    curr_dt = curr_dt.replace(year=year, month=month, day=1)

                if label not in buckets:
                    buckets[label] = []

        bucket_list = []
        # global_equity는 위의 루프에서 cutoff 이전 누적분을 이미 포함하고 있음

        for label in sorted(buckets.keys()):
            bucket_trades = buckets[label]
            stats = _compute_bucket_stats(bucket_trades, starting_equity=global_equity)
            bucket_list.append(
                {
                    "period_label": label,
                    **stats,
                }
            )

            # 다음 기간의 MDD 계산을 위해 현재 기간의 수익금을 누적
            for t in bucket_trades:
                global_equity += float(t.get("profit_amt") or 0)

        result = {
            "period": period,
            "buckets": bucket_list,
            "message": "거래 내역 기반 리포트입니다.",
        }
        with _stats_cache_lock:
            stats_cache[cache_key] = result
        return result

    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"❌ [strategy/reports] {e}")
        return {"period": period, "buckets": [], "message": f"리포트 계산 오류: {e}"}
