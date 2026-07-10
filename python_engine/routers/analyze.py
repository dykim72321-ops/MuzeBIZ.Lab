"""
routers/analyze.py — /api/analyze, /api/validate_candidates 엔드포인트
"""

from typing import List, Optional

import ta
import yfinance as yf
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Security
from pydantic import BaseModel

from deps import get_api_key

router = APIRouter(tags=["analyze"])

# 900초(15분) TTL 캐시
analyze_cache: TTLCache = TTLCache(maxsize=100, ttl=900)


class AnalyzeRequest(BaseModel):
    ticker: str
    period: str = "1mo"


class TechnicalIndicators(BaseModel):
    ticker: str
    period: str
    current_price: float
    rsi_14: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    ema_12: Optional[float] = None
    ema_26: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_diff: Optional[float] = None
    signal: str
    strength: str = "NORMAL"
    reasoning: str


class ValidateRequest(BaseModel):
    tickers: List[str]


class CompanyInfo(BaseModel):
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    summary: Optional[str] = None
    website: Optional[str] = None


@router.post("/api/analyze", response_model=TechnicalIndicators)
def analyze_stock(request: AnalyzeRequest):
    """지표 계산 API (기본 기능 - 인메모리 캐시)"""
    cache_key = f"{request.ticker}_{request.period}"
    if cache_key in analyze_cache:
        return analyze_cache[cache_key]

    try:
        ticker = yf.Ticker(request.ticker)
        df = ticker.history(period=request.period)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No data for {request.ticker}")

        close = df["Close"]
        rsi = (
            ta.momentum.RSIIndicator(close=close).rsi().iloc[-1]
            if len(close) >= 14
            else None
        )
        sma_20 = (
            ta.trend.SMAIndicator(close=close, window=20).sma_indicator().iloc[-1]
            if len(close) >= 20
            else None
        )
        sma_50 = (
            ta.trend.SMAIndicator(close=close, window=50).sma_indicator().iloc[-1]
            if len(close) >= 50
            else None
        )
        ema_12 = (
            ta.trend.EMAIndicator(close=close, window=12).ema_indicator().iloc[-1]
            if len(close) >= 12
            else None
        )
        ema_26 = (
            ta.trend.EMAIndicator(close=close, window=26).ema_indicator().iloc[-1]
            if len(close) >= 26
            else None
        )
        macd_ind = ta.trend.MACD(close=close)
        macd = macd_ind.macd().iloc[-1] if len(close) >= 26 else None
        macd_signal = macd_ind.macd_signal().iloc[-1] if len(close) >= 26 else None

        current_price = close.iloc[-1]

        signal = "HOLD"
        reasoning = []
        if rsi and rsi < 30:
            signal, reasoning.append("RSI 과매도")
        elif rsi and rsi > 70:
            signal, reasoning.append("RSI 과매수")

        result = TechnicalIndicators(
            ticker=request.ticker.upper(),
            period=request.period,
            current_price=round(float(current_price), 2),
            rsi_14=round(float(rsi), 2) if rsi else None,
            sma_20=round(float(sma_20), 2) if sma_20 else None,
            sma_50=round(float(sma_50), 2) if sma_50 else None,
            ema_12=round(float(ema_12), 2) if ema_12 else None,
            ema_26=round(float(ema_26), 2) if ema_26 else None,
            macd=round(float(macd), 4) if macd else None,
            macd_signal=round(float(macd_signal), 4) if macd_signal else None,
            signal=signal,
            reasoning=" ".join(reasoning) if reasoning else "지표 분석 완료",
        )
        analyze_cache[cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/validate_candidates")
async def validate_candidates(
    request: ValidateRequest, api_key: str = Security(get_api_key)
):
    """
    스크래퍼가 발굴한 후보군을 퀀트 지표(RSI, ADX, RVOL)로 정밀 검증
    """
    import asyncio

    valid_tickers = []

    for ticker in request.tickers:
        try:
            df = yf.download(ticker, period="1mo", progress=False)
            if df.empty or len(df) < 20:
                continue

            df["RSI2"] = ta.momentum.RSIIndicator(df["Close"], window=2).rsi()
            df["MA5"] = df["Close"].rolling(window=5).mean()
            df["Deviation"] = (df["Close"] - df["MA5"]) / df["MA5"]
            df["Vol_Avg"] = (
                df["Volume"].shift(1).rolling(window=20, min_periods=1).median()
            )
            df["RVOL"] = df["Volume"] / (df["Vol_Avg"] + 1e-9)

            latest = df.iloc[-1]

            cond1 = latest["RSI2"] < 10
            cond2 = latest["Deviation"] < -0.07
            cond3 = latest["RVOL"] > 3.0

            if cond1 and cond2 and cond3:
                valid_tickers.append(ticker.upper())
                print(
                    f"🎯 [VALIDATED] {ticker} 통과 "
                    f"(RSI2: {latest['RSI2']:.1f}, Dev: {latest['Deviation']:.2%})"
                )

        except Exception as e:
            print(f"⚠️ {ticker} 검증 중 오류: {e}")
            continue

    return valid_tickers


import urllib.request
import urllib.parse
import json


def translate_to_korean(text: str) -> str:
    if not text:
        return text
    try:
        url = (
            "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q="
            + urllib.parse.quote(text)
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        response = urllib.request.urlopen(req)
        data = json.loads(response.read().decode("utf-8"))
        return "".join([sentence[0] for sentence in data[0]])
    except Exception as e:
        print(f"Translation failed: {e}")
        return text


@router.get("/api/market/company/{ticker}", response_model=CompanyInfo)
def get_company_info(ticker: str):
    """Yahoo Finance를 이용해 회사 기본 정보 조회"""
    cache_key = f"company_info_{ticker.upper()}"
    if cache_key in analyze_cache:
        return analyze_cache[cache_key]

    try:
        tkr = yf.Ticker(ticker.upper())
        info = tkr.info

        # 일부 페니 주식의 경우 info가 비어있을 수 있음
        sector = info.get("sector")
        industry = info.get("industry")
        quoteType = info.get("quoteType")

        if not sector and quoteType == "ETF":
            sector = "ETF"
            industry = info.get("category", "Fund")

        summary_en = info.get("longBusinessSummary")
        summary_ko = translate_to_korean(summary_en) if summary_en else None

        company = CompanyInfo(
            symbol=ticker.upper(),
            name=info.get("longName") or info.get("shortName") or ticker.upper(),
            sector=sector,
            industry=industry,
            summary=summary_ko,
            website=info.get("website"),
        )
        analyze_cache[cache_key] = company
        return company
    except Exception as e:
        # 에러 발생 시 최소한의 정보만 반환
        fallback = CompanyInfo(
            symbol=ticker.upper(),
            name=ticker.upper(),
            sector=None,
            industry=None,
            summary=f"Failed to fetch info: {str(e)}",
        )
        return fallback
