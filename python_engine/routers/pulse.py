"""
routers/pulse.py — /api/pulse/* 엔드포인트
"""

import asyncio
import json as _json
from typing import Optional

from fastapi import APIRouter

from app.state import app_state

router = APIRouter(prefix="/api/pulse", tags=["pulse"])


@router.get("/status")
async def get_pulse_status():
    """Pulse 엔진의 실시간 상태 및 데이터 축적 현황 반환"""
    from datetime import datetime

    candle_state = app_state.candle_state
    stats = {}
    if candle_state:
        for ticker, df in candle_state.history.items():
            stats[ticker] = {
                "bars": len(df),
                "last_update": df.index[-1].isoformat() if not df.empty else None,
                "is_ready": len(df) >= 35,
            }

    return {
        "engine": "Alpaca-Stream-Hybrid",
        "market_status": "CLOSED" if datetime.now().weekday() >= 5 else "OPEN/PENDING",
        "active_monitors": len(stats),
        "ticker_states": stats,
    }


@router.get("/history")
async def get_pulse_history(limit: int = 20):
    """최근 생성된 실시간 신호 목록 반환 (대시보드 초기화용)"""
    supabase = app_state.supabase
    if not supabase:
        return []

    for attempt in range(2):
        try:
            res = await asyncio.to_thread(
                supabase.table("realtime_signals")
                .select("*")
                .order("timestamp", desc=True)
                .limit(limit)
                .execute
            )
            return res.data
        except Exception as e:
            if attempt == 0 and "Server disconnected" in str(e):
                continue
            print(f"❌ Pulse History Fetch Error: {e}")
            return []


@router.get("/strong-buy-log")
async def get_strong_buy_log(limit: int = 50):
    """STRONG BUY 발동 이력 조회 — 실제 트리거된 신호만 필터링"""
    supabase = app_state.supabase
    if not supabase:
        return {"events": [], "total": 0}

    for attempt in range(2):
        try:
            res = await asyncio.to_thread(
                supabase.table("realtime_signals")
                .select(
                    "ticker,timestamp,rsi,adx,rvol,price,signal,strength,ai_metadata"
                )
                .eq("signal", "BUY")
                .eq("strength", "STRONG")
                .order("timestamp", desc=True)
                .limit(limit)
                .execute
            )
            events = []
            for row in res.data or []:
                ai_meta = row.get("ai_metadata") or {}
                if isinstance(ai_meta, str):
                    try:
                        ai_meta = _json.loads(ai_meta)
                    except Exception:
                        ai_meta = {}
                dna = ai_meta.get("dna_score")
                events.append(
                    {
                        "ticker": row.get("ticker"),
                        "timestamp": row.get("timestamp"),
                        "price": row.get("price"),
                        "dna_score": dna,
                        "rsi": row.get("rsi"),
                        "adx": row.get("adx"),
                        "rvol": row.get("rvol"),
                    }
                )
            return {"events": events, "total": len(events)}
        except Exception as e:
            if attempt == 0 and "Server disconnected" in str(e):
                continue
            print(f"❌ Strong Buy Log Error: {e}")
            return {"events": [], "total": 0, "error": str(e)}


@router.get("/indicators")
async def get_indicator_snapshot():
    """
    모든 모니터링 종목의 실시간 지표 스냅샷 + STRONG BUY 근접도(proximity).
    각 조건 충족 여부와 임계값까지의 거리를 반환해 '발동까지 몇 단계 남았는지' 파악 가능.
    """
    import pandas as pd

    from services.quant_engine import calculate_advanced_signals, calculate_dna_score

    candle_state = app_state.candle_state

    if not candle_state or not candle_state.history:
        return {"tickers": {}, "armed": app_state.SYSTEM_ARMED}

    result = {}
    for ticker, df_raw in candle_state.history.items():
        if len(df_raw) < 35:
            result[ticker] = {"status": "warming_up", "bars": len(df_raw)}
            continue

        try:
            avg_daily_vol = candle_state.avg_daily_volume.get(ticker, 0.0)
            df = calculate_advanced_signals(
                df_raw.copy(), avg_daily_volume=avg_daily_vol
            )
            latest = df.iloc[-1]
            prev = df.iloc[-2] if len(df) >= 2 else latest

            rsi = float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0
            macd_diff = (
                float(latest["MACD_Diff"]) if not pd.isna(latest["MACD_Diff"]) else 0.0
            )
            macd_diff_prev = (
                float(prev["MACD_Diff"]) if not pd.isna(prev["MACD_Diff"]) else 0.0
            )
            adx = (
                float(latest["ADX"])
                if "ADX" in latest and not pd.isna(latest["ADX"])
                else 0.0
            )
            rvol = (
                float(latest["RVOL"])
                if "RVOL" in latest and not pd.isna(latest["RVOL"])
                else 1.0
            )
            is_extended = (
                bool(latest["Is_Extended"]) if "Is_Extended" in latest else False
            )
            price = float(latest["Close"])

            cond_rsi = {
                "value": round(rsi, 2),
                "threshold": 45,
                "met": rsi < 45,
                "gap": round(max(0.0, rsi - 45), 2),
            }
            cond_macd = {
                "value": round(macd_diff, 4),
                "threshold": 0,
                "met": macd_diff > 0 and macd_diff_prev <= 0,
                "bullish_territory": macd_diff > 0,
                "gap": round(max(0.0, -macd_diff), 4),
            }
            cond_adx = {
                "value": round(adx, 2),
                "threshold": 20,
                "met": adx > 20,
                "gap": round(max(0.0, 20 - adx), 2),
            }
            cond_rvol = {
                "value": round(rvol, 2),
                "threshold": 3.0,
                "met": rvol >= 3.0,
                "gap": round(max(0.0, 3.0 - rvol), 2),
            }
            cond_extended = {"value": is_extended, "met": not is_extended}

            conditions_met = sum(
                [
                    cond_rsi["met"],
                    cond_macd["met"],
                    cond_adx["met"],
                    cond_rvol["met"],
                    cond_extended["met"],
                ]
            )

            dna_score = calculate_dna_score(
                rsi=rsi,
                macd_diff=macd_diff,
                macd_diff_prev=macd_diff_prev,
                adx=adx,
                di_plus=(
                    float(latest["+DI"])
                    if "+DI" in latest and not pd.isna(latest["+DI"])
                    else 0.0
                ),
                di_minus=(
                    float(latest["-DI"])
                    if "-DI" in latest and not pd.isna(latest["-DI"])
                    else 0.0
                ),
                rvol=rvol,
                is_extended=is_extended,
                price=float(latest["Close"]) if "Close" in latest else 10.0,
            )
            strong_buy_active = (
                bool(latest["Strong_Buy"]) if "Strong_Buy" in latest else False
            )

            result[ticker] = {
                "price": round(price, 2),
                "dna_score": dna_score,
                "strong_buy_active": strong_buy_active,
                "conditions_met": conditions_met,
                "conditions_total": 5,
                "proximity_pct": round(conditions_met / 5 * 100),
                "conditions": {
                    "rsi": cond_rsi,
                    "macd_golden_cross": cond_macd,
                    "adx": cond_adx,
                    "rvol": cond_rvol,
                    "not_extended": cond_extended,
                },
                "bars": len(df_raw),
                "last_update": (
                    df_raw.index[-1].isoformat() if not df_raw.empty else None
                ),
            }
        except Exception as e:
            result[ticker] = {"status": "error", "error": str(e)}

    sorted_result = dict(
        sorted(
            result.items(), key=lambda x: x[1].get("proximity_pct", -1), reverse=True
        )
    )
    return {
        "tickers": sorted_result,
        "armed": app_state.SYSTEM_ARMED,
        "monitored": len(result),
    }
