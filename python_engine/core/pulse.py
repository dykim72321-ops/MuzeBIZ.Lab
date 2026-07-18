import pandas as pd
from datetime import datetime
from services.quant_engine import (
    calculate_advanced_signals,
    calculate_dna_score,
    calculate_dynamic_kelly,
    calculate_position_sizing,
    generate_ai_investment_report,
)
from state import app_state
from routers.strategy import stats_cache, _stats_cache_lock


def run_pulse_engine(ticker: str, df_raw: pd.DataFrame):
    """의사결정 최적화 엔진: 지표 + 포지션 사이징 + AI 결합"""
    avg_daily_vol = app_state.candle_state.avg_daily_volume.get(ticker.upper(), 0.0)
    df = calculate_advanced_signals(df_raw, avg_daily_volume=avg_daily_vol)
    latest = df.iloc[-1]

    dynamic_kelly_weight = None
    recent_trades = None
    _cached_pnls = stats_cache.get("recent_pnls")
    if _cached_pnls:
        recent_trades = _cached_pnls
    elif app_state.supabase:
        try:
            res = (
                app_state.supabase.table("paper_history")
                .select("ticker,entry_price,pnl_pct,profit_amt")
                .order("closed_at", desc=True)
                .limit(50)
                .execute()
            )
            if res.data:
                recent_trades = list(reversed(res.data))
                with _stats_cache_lock:
                    stats_cache["recent_pnls"] = recent_trades
        except Exception as e:
            print(f"⚠️ [Dynamic Kelly DB Fetch Error] {e}")

    if recent_trades and len(recent_trades) >= 10:
        d_weight, _, _ = calculate_dynamic_kelly(recent_trades, min_trades=10)
        # d_weight<=0(엣지 없음으로 실측)은 낙관적 기본값(승률55%/손익비2.0)으로
        # 대체하지 않고 0을 그대로 흘려보내 calculate_position_sizing의
        # kelly_f<=0 가드가 실제로 발동해 비중을 0으로 만들도록 한다.
        dynamic_kelly_weight = d_weight if d_weight is not None else None

    sizing = calculate_position_sizing(
        df_raw, dynamic_kelly_weight=dynamic_kelly_weight, bars_per_day=390
    )

    signal_type = "HOLD"
    if latest["Strong_Buy"]:
        signal_type = "BUY"
    elif latest["Strong_Sell"]:
        signal_type = "SELL"

    strength = "STRONG" if latest["Strong_Buy"] or latest["Strong_Sell"] else "NORMAL"

    payload = {
        "ticker": ticker.upper(),
        "rsi": round(float(latest["RSI"]), 2) if not pd.isna(latest["RSI"]) else None,
        "macd_line": (
            round(float(latest["MACD_Line"]), 4)
            if not pd.isna(latest["MACD_Line"])
            else None
        ),
        "macd_signal": (
            round(float(latest["MACD_Signal"]), 4)
            if not pd.isna(latest["MACD_Signal"])
            else None
        ),
        "macd_diff": (
            round(float(latest["MACD_Diff"]), 4)
            if not pd.isna(latest["MACD_Diff"])
            else None
        ),
        "adx": round(float(latest["ADX"]), 2) if "ADX" in latest else 0.0,
        "rvol": round(float(latest["RVOL"]), 2) if "RVOL" in latest else 1.0,
        "is_extended": (
            bool(latest["Is_Extended"]) if "Is_Extended" in latest else False
        ),
        "volatility_ann": round(float(sizing["annualized_volatility"]) * 100, 2),
        "vol_weight": sizing["vol_weight"],
        "kelly_f": sizing["kelly_f"],
        "recommended_weight": sizing["recommended_weight"],
        "atr": sizing.get("atr", 0.0),
        "price": round(float(latest["Close"]), 2),
        "indicator": "Micro-Cap Hybrid Pulse",
        "value": round(float(latest["Close"]), 2),
        "signal": signal_type,
        "strength": strength,
        "timestamp": datetime.now().isoformat(),
        "smoothed_er": round(float(latest.get("smoothed_er", 0.5)), 4),
    }

    macd_diff_cur = (
        float(latest["MACD_Diff"]) if not pd.isna(latest["MACD_Diff"]) else 0.0
    )
    macd_diff_prev = (
        float(df["MACD_Diff"].iloc[-2])
        if len(df) >= 2 and not pd.isna(df["MACD_Diff"].iloc[-2])
        else 0.0
    )
    dna_score = calculate_dna_score(
        rsi=float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0,
        macd_diff=macd_diff_cur,
        macd_diff_prev=macd_diff_prev,
        adx=(
            float(latest["ADX"])
            if "ADX" in latest and not pd.isna(latest["ADX"])
            else 0.0
        ),
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
        rvol=(
            float(latest["RVOL"])
            if "RVOL" in latest and not pd.isna(latest["RVOL"])
            else 1.0
        ),
        is_extended=bool(latest["Is_Extended"]) if "Is_Extended" in latest else False,
        price=(
            float(latest["Close"])
            if "Close" in latest and not pd.isna(latest["Close"])
            else 10.0
        ),
    )

    if strength == "STRONG":
        payload["ai_report"] = generate_ai_investment_report(payload)
        payload["ai_metadata"] = {
            "dna_score": dna_score,
            "bull_case": (
                "수학적 지표상 반등 모멘텀 임계치 도달"
                if signal_type == "BUY"
                else "현재 구간 하방 방어선 구축 중"
            ),
            "bear_case": (
                "매물 출회 가능성 및 시장 변동성 리스크"
                if signal_type == "SELL"
                else "상단 저항선 돌파 에너지 필요"
            ),
            "reasoning_ko": payload["ai_report"],
            "tags": [ticker.upper(), signal_type, strength],
        }
    else:
        payload["ai_report"] = (
            "시장 신호 강도가 보통(NORMAL)이며, 정밀 AI 분석 조건에 도달하지 않았습니다."
        )
        payload["ai_metadata"] = {"dna_score": dna_score}

    payload["dna_score"] = dna_score
    payload["macd_diff_prev"] = round(macd_diff_prev, 4)
    payload["di_positive"] = bool(
        (
            float(latest["+DI"])
            if "+DI" in latest and not pd.isna(latest["+DI"])
            else 0.0
        )
        > (
            float(latest["-DI"])
            if "-DI" in latest and not pd.isna(latest["-DI"])
            else 0.0
        )
    )
    payload["data_source"] = "alpaca_iex"
    payload["volume_multiplier"] = app_state.candle_state.volume_multiplier.get(
        ticker.upper(), 1.0
    )

    return payload
