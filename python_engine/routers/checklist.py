"""
routers/checklist.py — /api/checklist/* 엔드포인트

실계좌(LIVE) 전환 준비도 체크리스트 (live_transition_checklist 테이블) 조회/토글.
"""

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Security, status

from api.deps import get_api_key
from app.state import app_state
from routers.strategy import _compute_bucket_stats

router = APIRouter(prefix="/api/checklist", tags=["checklist"])

# ── 자동 검증 임계값 (evaluate_checklist에서 사용) ──
CHECKLIST_MIN_DAYS = 90
CHECKLIST_MIN_TRADES = 100
CHECKLIST_MIN_WIN_RATE = 55
CHECKLIST_MIN_PROFIT_FACTOR = 1.3
CHECKLIST_MAX_MDD = -15.0

# ── 개선 검증 트래커 상수 (get_improvement_status에서 사용) ──────────────────
# 도입일: 각 개선이 실제로 코드에 반영·배포된 날 (이후 데이터만 효과 측정에 사용)
IMPROVEMENT_ADOPTED = {
    "whipsaw_fix": "2026-07-13",  # 당일 재진입 금지 + 종목당 일일 거래 제한
    "penny_gate_80": "2026-07-17",  # 페니 DNA 게이트 65→80 상향
    "atr_stop": "2026-07-18",  # ATR 기반 초기 트레일링 스탑 (entry_stop_pct)
    "forward_return_logger": "2026-07-18",  # 신호 30m/60m forward return 자동 기록
}
# 2026-07-18 수익률 전수분석(198건)에서 산출된 개선 전 기준선 — 효과 비교용
BASELINE_TS_WIN_RATE = 8.8  # Trailing Stop 청산 승률 (개선 전)
BASELINE_PENNY_WIN_RATE = 13.5  # 페니 종목(진입가 ≤ $1) 승률 (개선 전)
# 판정에 필요한 최소 표본 수 — 미달이면 COLLECTING 상태로 표시
TARGET_FWD_SAMPLES = 100  # forward return 수집 목표 건수
TARGET_TS_EXITS = 30  # ATR 스탑 효과 판정에 필요한 TS 청산 수
TARGET_PENNY_TRADES = 20  # 페니 게이트 효과 판정에 필요한 페니 거래 수
WHIPSAW_OBSERVE_DAYS = 14  # whipsaw 재발 감시 기간 (일)

IMPROVEMENT_CUTOFFS = {k: f"{v}T00:00:00Z" for k, v in IMPROVEMENT_ADOPTED.items()}


def _verify_status(n: int, target: int, metric: float, baseline: float) -> str:
    if n < target:
        return "ON_TRACK" if n >= 5 and metric > baseline else "COLLECTING"
    return "VERIFIED" if metric > baseline else "REGRESSED"


@router.get("")
async def get_checklist(api_key: str = Security(get_api_key)):
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    res = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("*")
        .order("sort_order", desc=False)
        .execute
    )
    return res.data or []


@router.get("/improvements")
async def get_improvement_status(api_key: str = Security(get_api_key)):
    """4대 개선 항목(Forward Return 로거 / ATR 초기 스탑 / 페니 게이트 80 /
    Whipsaw 수정)의 검증 진행 현황을 실데이터로 자동 분석해 반환.

    성과 리포트 페이지의 실계좌 전환 체크리스트 섹션에서 표시한다.
    상태 의미:
      COLLECTING — 판정에 필요한 최소 표본 미달 (데이터 축적 중)
      ON_TRACK   — 표본 축적 중이지만 현재까지 지표가 기준선보다 개선됨
      VERIFIED   — 목표 표본 도달 + 지표가 기준선 대비 개선 확인
      REGRESSED  — 지표가 기준선보다 악화 (재검토 필요)
    """
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    now_utc = datetime.now(timezone.utc)

    # ── 데이터 일괄 조회 (2회 왕복) ──────────────────────────────────────────
    hist_res, dec_res = await asyncio.gather(
        asyncio.to_thread(
            supabase.table("paper_history")
            .select("ticker,entry_price,pnl_pct,exit_reason,closed_at")
            .gte("closed_at", IMPROVEMENT_CUTOFFS["whipsaw_fix"])
            .order("closed_at", desc=False)
            .execute
        ),
        asyncio.to_thread(
            supabase.table("engine_decisions")
            .select(
                "gate,outcome,dna_score,price,note,forward_return_30m,forward_30m_checked,ts"
            )
            .gte("ts", IMPROVEMENT_CUTOFFS["penny_gate_80"])
            .order("ts", desc=False)
            .limit(2000)
            .execute
        ),
    )
    trades = hist_res.data or []
    decisions = dec_res.data or []

    items = []

    # ── 1. Forward Return 로거 ───────────────────────────────────────────────
    fwd_adopted = IMPROVEMENT_ADOPTED["forward_return_logger"]
    fwd_rows = [
        d for d in decisions if d["ts"] >= IMPROVEMENT_CUTOFFS["forward_return_logger"]
    ]
    collected = [
        d
        for d in fwd_rows
        if d.get("forward_30m_checked") and d.get("forward_return_30m") is not None
    ]
    n_collected = len(collected)
    metrics = [
        {"label": "수집 표본", "value": f"{n_collected} / {TARGET_FWD_SAMPLES}건"},
        {"label": "대기 중 신호", "value": f"{len(fwd_rows) - n_collected}건"},
    ]
    note = "신호 발생 30분/60분 후 실제 수익률을 자동 축적 중"
    if n_collected >= 10:
        # 표본이 어느 정도 쌓이면 DNA≥80 신호의 실제 예측력 미리보기 제공
        high = [
            d["forward_return_30m"]
            for d in collected
            if (d.get("dna_score") or 0) >= 80
        ]
        low = [
            d["forward_return_30m"] for d in collected if (d.get("dna_score") or 0) < 80
        ]
        if high:
            avg_high = sum(high) / len(high)
            metrics.append(
                {"label": "DNA≥80 평균 30m 수익률", "value": f"{avg_high:+.2f}%"}
            )
        if low:
            avg_low = sum(low) / len(low)
            metrics.append(
                {"label": "DNA<80 평균 30m 수익률", "value": f"{avg_low:+.2f}%"}
            )
        note = "표본 축적 중 — 목표 도달 시 DNA 가중치 재추정 가능"
    items.append(
        {
            "key": "forward_return_logger",
            "label": "Forward Return 로거",
            "adopted_at": fwd_adopted,
            "status": "VERIFIED" if n_collected >= TARGET_FWD_SAMPLES else "COLLECTING",
            "progress_pct": min(round(n_collected / TARGET_FWD_SAMPLES * 100), 100),
            "metrics": metrics,
            "note": note,
        }
    )

    # ── 2. ATR 기반 초기 스탑 ────────────────────────────────────────────────
    atr_adopted = IMPROVEMENT_ADOPTED["atr_stop"]
    ts_exits_after = [
        t
        for t in trades
        if t["exit_reason"] == "Trailing Stop"
        and t["closed_at"] >= IMPROVEMENT_CUTOFFS["atr_stop"]
    ]
    n_ts = len(ts_exits_after)
    ts_wins = sum(1 for t in ts_exits_after if (t.get("pnl_pct") or 0) > 0)
    ts_win_rate = (ts_wins / n_ts * 100) if n_ts else 0.0

    metrics = [{"label": "도입 후 TS 청산", "value": f"{n_ts} / {TARGET_TS_EXITS}건"}]
    if n_ts > 0:
        metrics.append({"label": "도입 후 TS 승률", "value": f"{ts_win_rate:.1f}%"})
    metrics.append(
        {"label": "개선 전 TS 승률(기준선)", "value": f"{BASELINE_TS_WIN_RATE}%"}
    )

    atr_status = _verify_status(
        n_ts, TARGET_TS_EXITS, ts_win_rate, BASELINE_TS_WIN_RATE
    )
    items.append(
        {
            "key": "atr_stop",
            "label": "ATR 기반 초기 스탑",
            "adopted_at": atr_adopted,
            "status": atr_status,
            "progress_pct": min(round(n_ts / TARGET_TS_EXITS * 100), 100),
            "metrics": metrics,
            "note": "변동성 맞춤 스탑이 TS 청산 승률(기준 8.8%)을 올리는지 검증 중",
        }
    )

    # ── 3. 페니 게이트 80 ────────────────────────────────────────────────────
    penny_adopted = IMPROVEMENT_ADOPTED["penny_gate_80"]
    penny_trades = [
        t
        for t in trades
        if (t.get("entry_price") or 0) <= 1.0
        and t["closed_at"] >= IMPROVEMENT_CUTOFFS["penny_gate_80"]
        and t["exit_reason"] != "Scale-Out 50%"
    ]
    n_penny = len(penny_trades)
    penny_wins = sum(1 for t in penny_trades if (t.get("pnl_pct") or 0) > 0)
    penny_win_rate = (penny_wins / n_penny * 100) if n_penny else 0.0
    blocked_penny = sum(
        1
        for d in decisions
        if d["gate"] == "DNA_GATE" and "penny" in (d.get("note") or "")
    )

    metrics = [
        {"label": "도입 후 페니 거래", "value": f"{n_penny} / {TARGET_PENNY_TRADES}건"}
    ]
    if n_penny > 0:
        metrics.append(
            {"label": "도입 후 페니 승률", "value": f"{penny_win_rate:.1f}%"}
        )
    metrics.append(
        {"label": "게이트 차단된 저품질 신호", "value": f"{blocked_penny}건"}
    )
    metrics.append(
        {"label": "개선 전 페니 승률(기준선)", "value": f"{BASELINE_PENNY_WIN_RATE}%"}
    )

    penny_status = _verify_status(
        n_penny, TARGET_PENNY_TRADES, penny_win_rate, BASELINE_PENNY_WIN_RATE
    )
    items.append(
        {
            "key": "penny_gate_80",
            "label": "페니 게이트 80",
            "adopted_at": penny_adopted,
            "status": penny_status,
            "progress_pct": min(round(n_penny / TARGET_PENNY_TRADES * 100), 100),
            "metrics": metrics,
            "note": "DNA 65~79 저품질 페니 신호 차단이 승률(기준 13.5%)을 올리는지 검증 중",
        }
    )

    # ── 4. Whipsaw 수정 ──────────────────────────────────────────────────────
    whip_adopted = IMPROVEMENT_ADOPTED["whipsaw_fix"]
    whip_adopted_dt = datetime.fromisoformat(
        IMPROVEMENT_CUTOFFS["whipsaw_fix"].replace("Z", "+00:00")
    )
    whip_since = max(
        whip_adopted_dt,
        now_utc - timedelta(days=WHIPSAW_OBSERVE_DAYS),
    )
    whip_since_iso = whip_since.isoformat()
    by_ticker_day = defaultdict(int)
    for t in trades:
        if t["exit_reason"] == "Scale-Out 50%":
            continue  # 부분 익절은 라운드트립이 아니므로 재진입으로 세지 않음
        if t["closed_at"] < whip_since_iso:
            continue
        by_ticker_day[(t["ticker"], t["closed_at"][:10])] += 1
    whip_days = sum(1 for v in by_ticker_day.values() if v >= 2)
    days_observed = (now_utc - whip_adopted_dt).days
    if whip_days > 0:
        whip_status = "REGRESSED"
    elif days_observed >= WHIPSAW_OBSERVE_DAYS:
        whip_status = "VERIFIED"
    else:
        whip_status = "ON_TRACK"
    items.append(
        {
            "key": "whipsaw_fix",
            "label": "Whipsaw 재진입 방지",
            "adopted_at": whip_adopted,
            "status": whip_status,
            "progress_pct": min(round(days_observed / WHIPSAW_OBSERVE_DAYS * 100), 100),
            "metrics": [
                {
                    "label": f"최근 {WHIPSAW_OBSERVE_DAYS}일 같은날 반복 청산",
                    "value": f"{whip_days}건",
                },
                {"label": "관찰 경과", "value": f"{days_observed}일"},
            ],
            "note": "당일 재진입 금지 도입 후 같은 종목 반복 손절(6/30 유형) 재발 감시",
        }
    )

    return {"generated_at": now_utc.isoformat(), "items": items}


@router.post("/{item_key}/toggle")
async def toggle_checklist_item(item_key: str, api_key: str = Security(get_api_key)):
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    current = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("is_checked, is_automated")
        .eq("item_key", item_key)
        .single()
        .execute
    )
    if not current.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="체크리스트 항목 없음"
        )

    if current.data.get("is_automated"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="자동 검증 항목은 수동으로 토글할 수 없습니다.",
        )

    new_checked = not current.data["is_checked"]
    updated = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .update(
            {
                "is_checked": new_checked,
                "checked_at": (
                    datetime.now(timezone.utc).isoformat() if new_checked else None
                ),
            }
        )
        .eq("item_key", item_key)
        .execute
    )
    return updated.data[0]


async def evaluate_checklist():
    """paper_history 기반 성과를 계산해 자동 검증 항목(is_checked/auto_note/checked_at)을 갱신.

    main.py의 auto_checklist_eval_scheduler가 24시간마다 호출한다.
    """
    supabase = app_state.supabase
    if not supabase:
        return

    print("🔄 [Checklist Eval] 자동 검증을 시작합니다...")
    res = await asyncio.to_thread(
        supabase.table("paper_history")
        .select("pnl_pct,profit_amt,closed_at,ticker,exit_reason")
        .order("closed_at", desc=False)
        .execute
    )
    trades = res.data or []
    stats = _compute_bucket_stats(trades)
    now_utc = datetime.now(timezone.utc)

    first_trade_dt = None
    if trades and trades[0].get("closed_at"):
        first_trade_dt = datetime.fromisoformat(
            trades[0]["closed_at"].replace("Z", "+00:00")
        )
    days_passed = (now_utc - first_trade_dt).days if first_trade_dt else 0
    total_trades = stats.get("total_trades", 0)
    win_rate = stats.get("win_rate", 0)
    profit_factor = stats.get("profit_factor", 0)
    mdd = stats.get("mdd", 0)

    sys_settings_res = await asyncio.to_thread(
        supabase.table("system_settings").select("*").eq("id", 1).single().execute
    )
    sys_settings = sys_settings_res.data or {}

    import os

    apca_paper_env = os.getenv("APCA_PAPER", "true").lower()
    live_env_tested = apca_paper_env == "false"
    live_env_note = (
        "LIVE 모드 감지됨" if live_env_tested else "현재 Paper 모드 (APCA_PAPER=true)"
    )

    pdt_reviewed = False
    pdt_note = "LIVE 계좌 정보 없음"
    live_account_funded = False
    live_account_note = "LIVE 계좌 정보 없음"

    if live_env_tested and app_state.trading_client:
        try:
            account = await asyncio.to_thread(app_state.trading_client.get_account)
            account_equity = float(account.equity)
            if float(account.multiplier or 1) == 1:
                pdt_reviewed = True
                pdt_note = "Cash Account (PDT 면제)"
            elif account_equity >= 25000:
                pdt_reviewed = True
                pdt_note = f"Equity ${account_equity:,.0f} (≥$25K)"
            elif getattr(account, "pattern_day_trader", False):
                pdt_reviewed = True
                pdt_note = "PDT 상태 확인됨"
            else:
                pdt_reviewed = False
                pdt_note = f"Margin 계좌 (Equity ${account_equity:,.0f} < $25K)"

            if account.status == "ACTIVE" and account_equity > 0:
                live_account_funded = True
                live_account_note = f"ACTIVE / ${account_equity:,.0f}"
            else:
                live_account_note = f"상태: {account.status} / ${account_equity:,.0f}"
        except Exception:
            pdt_note = "LIVE 계좌 조회 실패"
            live_account_note = "LIVE 계좌 조회 실패"

    risk_threshold = sys_settings.get("alert_threshold", 0)
    risk_defined = risk_threshold > 0
    risk_capital_note = (
        f"Alert Threshold: {risk_threshold}% 설정됨"
        if risk_defined
        else "리스크 한도 설정 필요"
    )

    webhook_url = sys_settings.get("webhook_url") or os.getenv("DISCORD_WEBHOOK_URL")
    alerting_verified = bool(webhook_url)
    alerting_note = (
        "Discord Webhook 설정됨" if alerting_verified else "Discord Webhook 누락"
    )

    is_armed = sys_settings.get("is_armed", False)
    kill_switch_note = "현재 ARMED 상태" if is_armed else "DISARMED 상태"

    # (item_key, 통과 여부, 안내 문구)
    conditions = [
        (
            "min_3month_period",
            first_trade_dt is not None and days_passed >= CHECKLIST_MIN_DAYS,
            (
                f"{days_passed}일 경과 / 목표 {CHECKLIST_MIN_DAYS}일"
                if first_trade_dt
                else "거래 내역 없음"
            ),
        ),
        (
            "min_trade_count",
            total_trades >= CHECKLIST_MIN_TRADES,
            f"거래 {total_trades}건 / 목표 {CHECKLIST_MIN_TRADES}건",
        ),
        (
            "win_rate_threshold",
            win_rate >= CHECKLIST_MIN_WIN_RATE
            and profit_factor >= CHECKLIST_MIN_PROFIT_FACTOR,
            f"승률 {win_rate:.1f}% PF {profit_factor:.2f} / 목표 {CHECKLIST_MIN_WIN_RATE}% PF {CHECKLIST_MIN_PROFIT_FACTOR}",
        ),
        (
            "mdd_acceptable",
            mdd >= CHECKLIST_MAX_MDD,
            f"MDD {mdd:.1f}% / 목표 {CHECKLIST_MAX_MDD}% 이내",
        ),
        (
            "live_env_tested",
            live_env_tested,
            live_env_note,
        ),
        (
            "pdt_reviewed",
            pdt_reviewed,
            pdt_note,
        ),
        (
            "risk_capital_defined",
            risk_defined,
            risk_capital_note,
        ),
        (
            "alerting_verified",
            alerting_verified,
            alerting_note,
        ),
        (
            "live_account_funded",
            live_account_funded,
            live_account_note,
        ),
        (
            "kill_switch_verified",
            True,
            kill_switch_note,
        ),
    ]

    current_res = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("item_key, is_checked, auto_note")
        .in_("item_key", [key for key, _, _ in conditions])
        .execute
    )
    current_state = {item["item_key"]: item for item in (current_res.data or [])}

    for key, new_checked, new_note in conditions:
        curr = current_state.get(key)
        if not curr:
            continue
        old_checked = curr.get("is_checked", False)
        old_note = curr.get("auto_note", "")
        if old_checked == new_checked and old_note == new_note:
            continue

        # 항목은 마이그레이션 시딩 시 이미 생성되어 있고 여기선 갱신만 하므로,
        # upsert(INSERT ... ON CONFLICT) 대신 update를 사용한다. upsert는 충돌 여부와
        # 무관하게 후보 INSERT 행이 NOT NULL 컬럼(category/label 등, 이 payload엔 없음)
        # 검증을 먼저 통과해야 해서 기존 행이 있어도 실패한다.
        update_fields = {"is_checked": new_checked, "auto_note": new_note}
        if new_checked and not old_checked:
            update_fields["checked_at"] = now_utc.isoformat()
        elif not new_checked and old_checked:
            update_fields["checked_at"] = None

        await asyncio.to_thread(
            supabase.table("live_transition_checklist")
            .update(update_fields)
            .eq("item_key", key)
            .execute
        )
        print(
            f"✅ [Checklist Eval] {key} 갱신: {old_checked}->{new_checked} ({new_note})"
        )
