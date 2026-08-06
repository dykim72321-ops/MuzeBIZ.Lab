import asyncio
import os
from datetime import datetime
from typing import List

import numpy as np
import pandas as pd
import pytz
import ta
import yfinance as yf

from app.state import app_state
from services.quant_engine import (
    calculate_dna_score,
    EXTENSION_DAY_OPEN_PCT_NORMAL,
    EXTENSION_DAY_OPEN_PCT_PENNY,
    EXTENSION_PREV_CLOSE_PCT_NORMAL,
    EXTENSION_PREV_CLOSE_PCT_PENNY,
    EXTENSION_MA20_PCT_NORMAL,
    EXTENSION_MA20_PCT_PENNY,
)
from utils.utils import is_market_hours
from market.alpaca_stream import start_alpaca_stream, _stop_current_stream

# ── Quant Scan 상수 ($1 초과 ~ $50 이하 종목만 스캔) ──────────────────────────
# 2026-07-28: $1 이하 페니는 낙폭이 지나치게 커서(GSUN·SLGB·INUV·CHAI 등 사고
# 이력이 페니에 집중) 관심종목 스캐닝·자동등록 대상에서 완전히 제외. $50 초과도
# 함께 제외해 스캔 대상을 장기 보유 모드(engine/paper_engine.py LONG_TERM_*)가
# 커버하는 범위와 정확히 일치시킨다. Paper Engine 자체의 페니 파라미터(PENNY_*)는
# 이 변경 이전에 매수된 레거시 포지션의 청산 로직 유지를 위해 paper_engine.py에
# 그대로 남아있다 — 새 페니 진입 자체가 더 이상 발생하지 않을 뿐이다.
SCAN_MIN_PRICE = 1.0  # 이 값 이하는 스캔 제외 (페니)
SCAN_MAX_PRICE = 50.0  # 이 값 초과는 스캔 제외
SCAN_DATA_LOOKBACK = "2mo"
SCAN_TOP_N = 10

# 최소 일 달러볼륨 필터 (2026-08-06, $200,000 → $5,000,000 상향)
# 스프레드 게이트 Shadow 모드(paper_engine.py의 _fetch_quote_spread, 2026-07-31 도입)가
# 진입 직전 실제 bid/ask를 42건 기록한 결과, 매수 체결된 종목 중 SCYX 31.6%·INFU
# 30.6%·ISOU 29.75%·TSAT 28.9%·VOYG 27.7% 등 왕복 스프레드만으로 20~30%를 깎아먹는
# 종목이 다수 포함돼 있었다(스프레드>2%인 표본이 38.1%) — paper_engine.py의 슬리피지
# 모델(왕복 1.0~2.0% 가정)이 이 종목들의 실제 체결 비용을 크게 과소평가하고 있었다.
# 진입 신호 성분(RSI/RVOL/ADX/MACD/ATR%) 전부가 forward_return과 무상관(2026-08-06
# scripts/run_feature_significance.py 실측, n=1,361)으로 확인된 상태에서, 이런 초저유동
# 종목을 스캔 대상에 남겨두면 신호 품질과 무관하게 스프레드만으로 손실이 확정된다.
# $200,000는 페니 스캐너 시절(2026-07-17) 전체 유니버스를 최대한 넓게 훑기 위한
# 값이었을 뿐 스프레드 방어 목적이 아니었음 — 목적을 스프레드 방어로 명시적으로 전환한다.
#
# 최초 배포는 $20,000,000이었으나, 배포 직후(같은 날) 실거래 없이 유니버스
# 스냅샷만으로 드라이런 검증한 결과 두 가지 문제가 확인돼 $5,000,000으로 즉시
# 재조정했다: (1) 문제가 됐던 SCYX($4.3k)·INFU($355k)·ISOU($59k)·TSAT($689k)·
# VOYG($3.4M) 5종목 전부 $5M 미만이라 $5M로도 동일하게 걸러짐 — $20M까지 올릴
# 근거가 없었음. (2) $20M은 그날 실제 모멘텀 종목(스크리너 most_actives/movers
# 교집합)의 56%(66→25)를 함께 걸러내면서, VZ/T/PFE 같은 거래량 최상위 대형주가
# (주가 자체가 $50 이하라 SCAN_MAX_PRICE를 통과) 우선순위 리스트 상단을 차지하는
# 부작용을 재현했다 — 2026-07-17에 이미 한 번 고친 "대형주 달러볼륨 독점" 버그와
# 동일 패턴. $5M 기준에서는 스크리너 교집합 종목의 64%(42/66)가 생존해 이 부작용이
# 크게 완화된다.
SCAN_MIN_DOLLAR_VOLUME = 5_000_000

# 자동 스캔 주기(초) — schedulers/tasks.py의 auto_quant_scan_scheduler와
# routers/penny.py의 next_scan_in_seconds 계산이 공유하는 단일 소스.
# 2026-07-16: 4시간 → 2시간으로 단축. 원래 2시간이었던 것을 RAM 누적 문제로
# 2026-07-11에 4시간으로 늦췄으나(당시 원인은 yfinance 세션/스레드풀·대형
# DataFrame 미해제), 그 근본 원인은 이후 커밋에서 별도로 수정됨
# (MTFCache/paper_portfolio_updater를 Alpaca 우선 조회로 전환 + run_quant_scan_internal
# 종료부 gc.collect() 추가). 회귀 테스트(tests/memory_test.py)에서 연속 스캔 2회
# 호출 시 RSS 증가가 247MB→247.69MB로 사실상 없음을 확인했으므로, 스캔 자체의
# RAM 비용은 더 이상 주기를 늦춰야 할 이유가 아니다. 4시간 주기의 실질적 비용은
# "신규 후보 발굴 지연"이었다 — 정규장 6.5시간 동안 스캔이 1~2회만 돌아, 장중
# 갑자기 DNA가 상승한 종목 상당수가 그날 안에 watchlist에 진입하지 못했다.
# 2026-07-17: 대표님의 피드백 수용. 2시간은 기회손실, 15분은 데이터 공백 및 yf 제한 리스크 존재.
# 절충안으로 30분(1800초) 스캔을 적용하며, 스트림 재시작 시 보유 종목(held)이 있으면 재시작을
# 보류하여 데이터 공백(TS 누락)을 원천 차단하는 하이브리드 안전망 아키텍처 적용.
SCAN_INTERVAL_SECONDS = 30 * 60

# yfinance 배치 다운로드 기간 (DNA 스코어링용 2개월 일봉)
PENNY_DATA_LOOKBACK = "2mo"


async def run_quant_scan_internal(
    max_price: float = SCAN_MAX_PRICE, top_n: int = SCAN_TOP_N
) -> dict:
    """
    퀀트 스캔 핵심 로직 ($1 초과 ~ $50 이하 종목) — HTTP 엔드포인트와 자동 스케줄러 양쪽에서 호출.
    완료 시 app_state.last_penny_scan_at, app_state.penny_scan_results_cache 갱신.
    """
    import re as _re

    supabase = app_state.supabase
    trading_client = app_state.trading_client
    webhook = app_state.webhook
    # 개선 검증 트래커가 REGRESSED 연속 판정 시 app_state.paper_engine의 이 속성을 끄면
    # (routers/checklist.py _apply_rollback_action) 다음 스캔부터 즉시 완화된 임계값으로
    # 되돌아간다 — quant_engine.calculate_advanced_signals()의 penny_extension_tight와 동일한 스위치.
    penny_extension_tight = getattr(
        app_state.paper_engine, "extension_guard_penny_tight_enabled", True
    )

    scan_tickers: List[str] = []
    try:
        if trading_client:
            from alpaca.trading.enums import AssetClass, AssetStatus
            from alpaca.trading.requests import GetAssetsRequest
            from alpaca.data.historical import StockHistoricalDataClient
            from alpaca.data.historical.screener import ScreenerClient
            from alpaca.data.requests import (
                MarketMoversRequest,
                MostActivesRequest,
                StockSnapshotRequest,
            )

            assets_req = GetAssetsRequest(
                asset_class=AssetClass.US_EQUITY,
                status=AssetStatus.ACTIVE,
            )
            all_assets = await asyncio.to_thread(
                trading_client.get_all_assets, assets_req
            )

            _SKIP_PATTERN = _re.compile(r"\.|[0-9]$")
            # Alpaca Asset 모델엔 ETF 여부를 나타내는 필드가 없어 종목명 패턴으로
            # 걸러낸다 — 안 걸러내면 XLP/TLT/SPY 같은 대형 ETF가 달러볼륨 상위를
            # 독점해, 이 스캐너가 원래 노리는 소형주 모멘텀 후보가 밀려남
            # (2026-07-17 실측: 상위 80 중 다수가 ETF/초대형주였음).
            _ETF_NAME_PATTERN = _re.compile(
                r"\bETF\b|\bTrust\b|\bFund\b|iShares|SPDR|ProShares|Direxion"
                r"|VanEck|WisdomTree|Global X|First Trust|Invesco QQQ|ARK ",
                _re.IGNORECASE,
            )
            tradable = [
                a.symbol
                for a in all_assets
                if a.tradable
                and a.exchange in ("NASDAQ", "NYSE", "AMEX", "ARCA")
                and not _SKIP_PATTERN.search(a.symbol)
                and len(a.symbol) <= 5
                and not (
                    len(a.symbol) == 5
                    and a.symbol[-1] in ("W", "R", "Q", "U", "P", "Y")
                )
                and not _ETF_NAME_PATTERN.search(a.name or "")
            ]
            print(f"📡 [Scan] Alpaca universe: {len(tradable)} tradable US equities")

            api_key = os.getenv("APCA_API_KEY_ID")
            api_secret = os.getenv("APCA_API_SECRET_KEY")

            # 스크리너: 당일 실제 모멘텀/거래량이 터진 종목을 직접 조회 (로깅·교차검증용 —
            # 무작위 500 표본은 신호와 무관하게 뽑혀 "그날 움직이는 종목"을 놓치기 쉬웠음)
            screener_symbols: set[str] = set()
            try:
                screener = ScreenerClient(api_key, api_secret)
                most_active, movers = await asyncio.gather(
                    asyncio.to_thread(
                        screener.get_most_actives,
                        MostActivesRequest(by="volume", top=100),
                    ),
                    asyncio.to_thread(
                        screener.get_market_movers, MarketMoversRequest(top=50)
                    ),
                )
                screener_symbols = (
                    {a.symbol for a in most_active.most_actives}
                    | {g.symbol for g in movers.gainers}
                    | {l.symbol for l in movers.losers}
                )
                print(
                    f"📈 [Scan] Screener 후보: most_active {len(most_active.most_actives)} + "
                    f"movers {len(movers.gainers) + len(movers.losers)}"
                )
            except Exception as screener_err:
                print(
                    f"⚠️ [Scan] Screener 조회 실패 (스냅샷 필터로 계속 진행): {screener_err}"
                )

            # 전체 유니버스 배치 스냅샷으로 가격·달러볼륨 필터 — 무작위 500개 표본을
            # 대체. 스냅샷은 1요청당 최대 1,000심볼까지 지원해 ~10,150개 전체를
            # 11요청·약 16초에 커버 가능(실측) — yfinance 배치 다운로드보다 빠르고
            # 매 스캔마다 유니버스 전체를 보므로 그날 급등한 종목을 놓치지 않는다.
            data_client = StockHistoricalDataClient(api_key, api_secret)
            candidates: List[tuple] = []  # (ticker, dollar_volume)
            SNAPSHOT_BATCH = 1000
            for i in range(0, len(tradable), SNAPSHOT_BATCH):
                batch = tradable[i : i + SNAPSHOT_BATCH]
                try:
                    snaps = await asyncio.to_thread(
                        data_client.get_stock_snapshot,
                        StockSnapshotRequest(symbol_or_symbols=batch),
                    )
                except Exception as snap_err:
                    print(f"⚠️ [Scan] 스냅샷 배치 오류: {snap_err}")
                    continue
                for sym, snap in (snaps or {}).items():
                    bar = getattr(snap, "daily_bar", None)
                    if not bar or bar.close is None or bar.volume is None:
                        continue
                    price = float(bar.close)
                    volume = float(bar.volume)
                    if (
                        SCAN_MIN_PRICE < price <= max_price
                        and (price * volume) > SCAN_MIN_DOLLAR_VOLUME
                    ):
                        candidates.append((sym, price * volume))

            candidates_by_ticker = {t: v for t, v in candidates}

            # 스크리너(당일 실제 거래량 급증/등락률 상위) 통과 종목에 우선권을 준다.
            # 순수 달러볼륨 정렬만 쓰면 자본 규모가 큰 대형주가 절대값에서 항상
            # 이겨 상위 80석을 차지해버려, 이 스캐너가 노리는 "그날 움직이는
            # 소형주 모멘텀"이 뒤로 밀린다 (2026-07-17 실측: MDLZ/ABT/T 같은
            # 초대형주가 1~4위 독점).
            priority = sorted(
                (t for t in screener_symbols if t in candidates_by_ticker),
                key=lambda t: candidates_by_ticker[t],
                reverse=True,
            )
            priority_set = set(priority)
            rest = sorted(
                (t for t in candidates_by_ticker if t not in priority_set),
                key=lambda t: candidates_by_ticker[t],
                reverse=True,
            )
            scan_tickers = priority + rest
            print(
                f"📡 [Scan] 스냅샷 필터 통과 {len(scan_tickers)}개 (스크리너 우선 "
                f"{len(priority)}개 + 달러볼륨 순 {len(rest)}개)"
            )

        if not scan_tickers:
            fallback_tickers = [
                "F",
                "AAL",
                "SOFI",
                "NIO",
                "RIVN",
                "LCID",
                "PLUG",
                "SNAP",
                "CLSK",
                "MARA",
                "RIOT",
                "HIMS",
                "OPEN",
                "JOBY",
                "DNA",
                "SPCE",
                "WKHS",
                "PRPL",
                "BARK",
                "LIDR",
            ]
            for sym in fallback_tickers:
                try:
                    tk = yf.Ticker(sym)
                    info = await asyncio.to_thread(lambda t=tk: t.fast_info)
                    price = getattr(info, "last_price", None)
                    if price and SCAN_MIN_PRICE < price <= max_price:
                        scan_tickers.append(sym)
                except Exception:
                    continue
    except Exception as e:
        print(f"❌ [Scan] Universe collection error: {e}")

    print(
        f"📡 [Scan] Found {len(scan_tickers)} stocks in (${SCAN_MIN_PRICE}, ${max_price}]"
    )

    if supabase and scan_tickers:
        try:
            now_iso = datetime.now().isoformat()
            upsert_rows = [
                {"ticker": t, "last_price": 0.0, "last_seen_at": now_iso}
                for t in scan_tickers
            ]
            await asyncio.to_thread(
                supabase.table("penny_universe_pool")
                .upsert(upsert_rows, on_conflict="ticker")
                .execute
            )
            print(
                f"✅ [Scan Pool] UPSERT {len(scan_tickers)} tickers → penny_universe_pool"
            )
        except Exception as upsert_err:
            print(f"⚠️ [Scan Pool] UPSERT skipped: {upsert_err}")

    results = []
    valid_tickers = [
        t for t in scan_tickers[:80] if t not in app_state.yf_no_data_cache
    ]
    if valid_tickers:
        print(f"📥 [Scan] Batch downloading {len(valid_tickers)} tickers...")
        batch_str = " ".join(valid_tickers)
        try:
            df_all = await asyncio.to_thread(
                yf.download,
                batch_str,
                period=PENNY_DATA_LOOKBACK,
                interval="1d",
                group_by="ticker",
                progress=False,
                threads=True,
            )
        except Exception as e:
            print(f"⚠️ [Scan] Batch download failed: {e}")
            df_all = None

        ny_tz = pytz.timezone("America/New_York")
        now_ny = datetime.now(ny_tz)
        market_open = now_ny.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now_ny.replace(hour=16, minute=0, second=0, microsecond=0)

        def get_u_shape_progress(elapsed: float) -> float:
            if elapsed <= 30:
                return (elapsed / 30) * 0.20
            if elapsed <= 90:
                return 0.20 + ((elapsed - 30) / 60) * 0.15
            if elapsed <= 150:
                return 0.35 + ((elapsed - 90) / 60) * 0.10
            if elapsed <= 210:
                return 0.45 + ((elapsed - 150) / 60) * 0.08
            if elapsed <= 270:
                return 0.53 + ((elapsed - 210) / 60) * 0.08
            if elapsed <= 330:
                return 0.61 + ((elapsed - 270) / 60) * 0.14
            if elapsed <= 360:
                return 0.75 + ((elapsed - 330) / 30) * 0.10
            return min(0.85 + ((elapsed - 360) / 30) * 0.15, 1.0)

        progress = 1.0
        if market_open <= now_ny <= market_close:
            elapsed_minutes = (now_ny - market_open).total_seconds() / 60.0
            progress = max(get_u_shape_progress(elapsed_minutes), 0.05)

        for ticker in valid_tickers:
            if df_all is None or df_all.empty:
                continue
            try:
                if len(valid_tickers) == 1:
                    df = df_all.copy()
                else:
                    if ticker not in df_all.columns.levels[0]:
                        app_state.yf_no_data_cache.add(ticker)
                        continue
                    df = df_all[ticker].copy()

                df.dropna(subset=["Close", "Volume"], inplace=True)
                if df.empty or len(df) < 30:
                    app_state.yf_no_data_cache.add(ticker)
                    continue

                last_bar_date = df.index[-1]
                if hasattr(last_bar_date, "date"):
                    last_bar_date = last_bar_date.date()
                is_last_bar_today = last_bar_date == now_ny.date()
                if progress < 1.0 and is_last_bar_today and len(df) > 0:
                    df["Volume"] = df["Volume"].astype(float)
                    df.loc[df.index[-1], "Volume"] = df["Volume"].iloc[-1] / progress

                df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()

                macd_ind = ta.trend.MACD(
                    df["Close"], window_slow=26, window_fast=12, window_sign=9
                )
                df["MACD_Diff"] = macd_ind.macd_diff()

                adx_ind = ta.trend.ADXIndicator(
                    high=df["High"], low=df["Low"], close=df["Close"], window=14
                )
                df["ADX"] = adx_ind.adx()
                df["+DI"] = adx_ind.adx_pos()
                df["-DI"] = adx_ind.adx_neg()

                df["Avg_Vol"] = (
                    df["Volume"].shift(1).rolling(window=30, min_periods=1).median()
                )
                df["RVOL"] = df["Volume"] / (df["Avg_Vol"] + 1e-9)

                ma20 = df["Close"].rolling(window=20, min_periods=1).mean()
                # quant_engine.calculate_advanced_signals()의 실시간 진입 필터와 동일한
                # 상수를 사용 — watchlist 등록(스캔) 단계와 실제 매수(1분봉) 단계의 과열
                # 판정 기준이 어긋나지 않도록 정합시킴 (2026-07-20).
                is_penny_row = df["Close"] <= 1.0
                _penny_day_open_pct = (
                    EXTENSION_DAY_OPEN_PCT_PENNY
                    if penny_extension_tight
                    else EXTENSION_DAY_OPEN_PCT_NORMAL
                )
                _penny_prev_close_pct = (
                    EXTENSION_PREV_CLOSE_PCT_PENNY
                    if penny_extension_tight
                    else EXTENSION_PREV_CLOSE_PCT_NORMAL
                )
                _penny_ma20_pct = (
                    EXTENSION_MA20_PCT_PENNY
                    if penny_extension_tight
                    else EXTENSION_MA20_PCT_NORMAL
                )
                day_open_pct = np.where(
                    is_penny_row, _penny_day_open_pct, EXTENSION_DAY_OPEN_PCT_NORMAL
                )
                prev_close_pct = np.where(
                    is_penny_row, _penny_prev_close_pct, EXTENSION_PREV_CLOSE_PCT_NORMAL
                )
                ma20_pct = np.where(
                    is_penny_row, _penny_ma20_pct, EXTENSION_MA20_PCT_NORMAL
                )
                df["Is_Extended"] = (
                    (df["Close"] > df["Open"] * day_open_pct)
                    | (df["Close"] > df["Close"].shift(1) * prev_close_pct)
                    | (df["Close"] > ma20 * ma20_pct)
                )

                latest = df.iloc[-1]
                prev = df.iloc[-2] if len(df) >= 2 else latest

                rsi = float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0
                macd_diff = (
                    float(latest["MACD_Diff"])
                    if not pd.isna(latest["MACD_Diff"])
                    else 0.0
                )
                macd_diff_prev = (
                    float(prev["MACD_Diff"]) if not pd.isna(prev["MACD_Diff"]) else 0.0
                )
                adx = (
                    float(latest["ADX"])
                    if "ADX" in latest.index and not pd.isna(latest["ADX"])
                    else 0.0
                )
                rvol = (
                    float(latest["RVOL"])
                    if "RVOL" in latest.index and not pd.isna(latest["RVOL"])
                    else 1.0
                )
                is_extended = (
                    bool(latest["Is_Extended"])
                    if "Is_Extended" in latest.index
                    else False
                )
                price = float(latest["Close"])
                change_pct = 0.0
                if len(df) >= 2:
                    prev_close = float(df["Close"].iloc[-2])
                    if prev_close > 0:
                        change_pct = round((price / prev_close - 1) * 100, 2)

                volume = int(latest["Volume"]) if not pd.isna(latest["Volume"]) else 0

                dna_score = calculate_dna_score(
                    rsi=rsi,
                    macd_diff=macd_diff,
                    macd_diff_prev=macd_diff_prev,
                    adx=adx,
                    di_plus=(
                        float(latest["+DI"])
                        if "+DI" in latest.index and not pd.isna(latest["+DI"])
                        else 0.0
                    ),
                    di_minus=(
                        float(latest["-DI"])
                        if "-DI" in latest.index and not pd.isna(latest["-DI"])
                        else 0.0
                    ),
                    rvol=rvol,
                    is_extended=is_extended,
                    price=price,
                )

                signal_type = "HOLD"
                strength = "NORMAL"

                # quant_engine.py calculate_advanced_signals()의 tier1/tier2와 정합시킨
                # 컷오프 — 스캔 단계 라벨(Discord 알림·daily_discovery 표시)이 실시간
                # 경로의 실제 매수 게이트(paper_engine.py dna_gate=75)와 어긋나면 관심종목
                # 으로는 등록됐지만 실제로는 절대 매수되지 않는 종목이 생긴다.
                # 2026-07-28부로 $1 이하 페니는 스캔 대상에서 완전히 제외됐으므로(상단
                # SCAN_MIN_PRICE 참고) tier_penny(DNA≥65~80) 분기는 더 이상 두지 않는다
                # — 예전엔 이 분기가 남아있어, 상단의 Alpaca 스냅샷 가격 필터를 어떻게든
                # 통과한 sub-$1 종목(예: PRSO, 저유동성 탓에 스냅샷 daily_bar와 yfinance
                # 실가가 어긋난 경우)이 여기서 "penny" 취급을 받아 STRONG BUY로 등록되는
                # 구멍이 있었다(2026-08-05 실사고: PRSO $0.70에 매수 체결). 모든 종목을
                # 동일한(정상가) 기준으로만 채점한다 — sub-$1/50 초과 종목은 아래
                # 등록 단계의 하드 가격 게이트에서 최종적으로 걸러진다.
                if dna_score >= 80.0 and rvol > 1.0:
                    signal_type = "BUY"
                    strength = "STRONG"
                elif dna_score >= 75.0 and rvol > 1.5:
                    signal_type = "BUY"
                    strength = "NORMAL"
                elif dna_score <= 40.0:
                    signal_type = "SELL"
                    strength = "STRONG"

                results.append(
                    {
                        "ticker": ticker,
                        "price": round(price, 4),
                        "change_pct": change_pct,
                        "volume": volume,
                        "dna_score": dna_score,
                        "rsi": round(rsi, 2),
                        "macd_diff": round(macd_diff, 4),
                        "adx": round(adx, 2),
                        "rvol": round(rvol, 2),
                        "signal": signal_type,
                        "strength": strength,
                        "is_extended": is_extended,
                    }
                )
                if supabase:
                    try:
                        await asyncio.to_thread(
                            supabase.table("penny_universe_pool")
                            .update({"last_price": round(price, 4)})
                            .eq("ticker", ticker)
                            .execute
                        )
                    except Exception:
                        pass
            except Exception as e:
                print(f"⚠️ [Scan] {ticker} analysis error: {e}")
                continue

    results.sort(key=lambda x: x["dna_score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
        r["is_top"] = i < top_n

    auto_registered: List[str] = []
    if supabase and results:
        for item in results[:top_n]:
            # 하드 가격 게이트 — 상단의 Alpaca 스냅샷 기반 후보 필터와 별개로, 여기서
            # DNA 스코어링에 실제로 쓰인 yfinance 가격 기준으로 한 번 더 검증한다.
            # 저유동성 종목은 두 가격 소스가 어긋날 수 있어(2026-08-05 PRSO 실사고:
            # 상단 필터는 통과했지만 yfinance 실가는 $0.70) 상단 필터만 믿으면 sub-$1/
            # $50 초과 종목이 watchlist까지 새어 들어갈 수 있다.
            price_val = item.get("price", 0)
            if not (SCAN_MIN_PRICE < price_val <= max_price):
                print(
                    f"⛔ [Scan] {item['ticker']} 등록 차단 — 가격 ${price_val:.4f}이 "
                    f"허용 범위(${SCAN_MIN_PRICE}~${max_price}) 밖"
                )
                continue
            # paper_engine.py dna_gate(75)와 정합 — 이보다 낮은 DNA로 watchlist에
            # 등록해봤자 실시간 경로의 실제 매수 게이트를 절대 통과할 수 없다.
            if item.get("dna_score", 0) < 75.0:
                continue
            try:
                payload = {
                    "ticker": item["ticker"],
                    "status": "WATCHING",
                    "initial_dna_score": item["dna_score"],
                }
                existing = await asyncio.to_thread(
                    supabase.table("watchlist")
                    .select("status")
                    .eq("ticker", item["ticker"])
                    .is_("user_id", "null")
                    .execute
                )
                if existing.data:
                    current_status = existing.data[0].get("status")
                    update_data = {
                        "initial_dna_score": item["dna_score"],
                    }
                    if current_status not in ("HOLDING", "EXITED"):
                        update_data["status"] = "WATCHING"
                        auto_registered.append(item["ticker"])

                    await asyncio.to_thread(
                        supabase.table("watchlist")
                        .update(update_data)
                        .eq("ticker", item["ticker"])
                        .is_("user_id", "null")
                        .execute
                    )
                else:
                    await asyncio.to_thread(
                        supabase.table("watchlist").insert(payload).execute
                    )
                    auto_registered.append(item["ticker"])
                item["is_watchlisted"] = True

                # [Option A Fix] daily_discovery에도 즉시 upsert하여 UI에 표시되도록 함
                try:
                    await asyncio.to_thread(
                        supabase.table("daily_discovery")
                        .upsert(
                            {
                                "ticker": item["ticker"],
                                "dna_score": int(round(item["dna_score"])),
                                "price": item["price"],
                                "change": str(round(item["change_pct"], 2)),
                                "change_percent": round(item["change_pct"], 2),
                                "volume": str(item["volume"]),
                                "updated_at": datetime.now().isoformat(),
                                "rsi": item["rsi"],
                                "rvol": item["rvol"],
                                "adx": item["adx"],
                                "macd_diff": item["macd_diff"],
                                "is_extended": item["is_extended"],
                            },
                            on_conflict="ticker",
                        )
                        .execute
                    )
                    print(
                        f"⭐ [Scan] {item['ticker']} also upserted to daily_discovery"
                    )
                except Exception as dd_e:
                    print(
                        f"⚠️ [Scan] daily_discovery upsert error for {item['ticker']}: {dd_e}"
                    )

            except Exception as e:
                print(
                    f"⚠️ [Scan] Watchlist auto-register error for {item['ticker']}: {e}"
                )

    if auto_registered and webhook:
        registered_items = [r for r in results if r["ticker"] in auto_registered]
        top_summary = "\n".join(
            [
                f"{'🥇🥈🥉'[i] if i < 3 else '•'} {r['ticker']} — DNA: {r['dna_score']} | ${r['price']:.4f} | RSI: {r['rsi']}"
                for i, r in enumerate(registered_items)
            ]
        )
        await webhook.send_alert(
            use_dev=True,
            title="📡 [QUANT SCAN] Top 퀀트 추천 종목 선정",
            description=f"스캔 종목: {len(results)}개 | $100 이하 일반주식\n\n{top_summary}",
            color=0x6366F1,
        )

    app_state.last_penny_scan_at = datetime.now()
    app_state.penny_scan_results_cache = results

    if auto_registered and is_market_hours():
        # 보유 종목이 있어도 스트림을 재시작한다 — 재시작을 전면 보류하면 신규
        # 워치리스트 종목이 모든 보유 포지션이 청산될 때까지 스트림 구독 자체를
        # 받지 못해 신호 감지가 무기한 불가능해진다(과거 "워치리스트 스트림 구독
        # 누락" 버그의 재발). 재연결 중 짧은 데이터 공백 동안의 보유 포지션
        # 트레일링 스탑은 position_ts_sweeper()(30초 주기, 스트림과 무관하게
        # 최신 체결가로 TS 평가)가 안전망으로 커버한다.
        print(
            f"🔄 [Auto-Scan] 신규 종목 {auto_registered} 등록됨 — 장 중 스트림 재시작 "
            f"(보유 종목 {len(app_state._held_tickers)}개, TS Sweeper가 재연결 중 안전망 역할)"
        )
        await _stop_current_stream()
        # 클라이언트 측 close 직후 곧바로 재연결하면 Alpaca 서버가 WS 슬롯을
        # 아직 해제하지 못해 "connection limit exceeded"가 발생할 수 있다.
        await asyncio.sleep(3)
        app_state._current_stream_task = asyncio.create_task(start_alpaca_stream())

    if "df_all" in locals() and df_all is not None:
        del df_all
    import gc

    gc.collect()

    return {
        "scanned_at": app_state.last_penny_scan_at.isoformat(),
        "total_scanned": len(results),
        "scan_params": {
            "max_price": max_price,
            "data_lookback": SCAN_DATA_LOOKBACK,
        },
        "results": results,
        "auto_registered": auto_registered,
    }


# ── 경량 RSI/ATR 계산 헬퍼 ──────────────────────────────────────────────────
