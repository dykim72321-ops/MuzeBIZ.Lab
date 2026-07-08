"""
routers/backtest.py — /api/backtest/* 엔드포인트
"""

import asyncio

from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Security
from pydantic import BaseModel

from deps import get_api_key

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

backtest_cache: TTLCache = TTLCache(maxsize=100, ttl=900)

DEFAULT_BACKTEST_UNIVERSE = [
    "SOFI",
    "AMC",
    "RIOT",
    "MARA",
    "NIO",
    "TLRY",
    "SNDL",
    "CLOV",
    "SPCE",
    "BBIG",
]


class BacktestRunRequest(BaseModel):
    tickers: list = []
    start_date: str = "2023-01-01"
    end_date: str = ""
    gamma: float = 0.8
    delta: float = 1.5
    lambda_val: float = 2.0
    deviation_threshold: float = -0.07
    target_atr: float = 5.0


@router.post("/run")
async def run_backtest_endpoint(
    request: BacktestRunRequest, api_key: str = Security(get_api_key)
):
    """DNA 전략 백테스트 실행 (DNAValidator 사용, 15분 캐시)"""
    tickers = request.tickers if request.tickers else DEFAULT_BACKTEST_UNIVERSE
    cache_key = (
        f"bt_{','.join(sorted(tickers))}"
        f"_{request.gamma}_{request.delta}_{request.lambda_val}"
        f"_{request.deviation_threshold}_{request.target_atr}"
        f"_{request.start_date}_{request.end_date}"
    )
    if cache_key in backtest_cache:
        return backtest_cache[cache_key]
    try:
        from portfolio_backtester import DNAValidator

        validator = DNAValidator(
            tickers=tickers,
            start_date=request.start_date,
            end_date=request.end_date if request.end_date else None,
            gamma=request.gamma,
            delta=request.delta,
            lambda_val=request.lambda_val,
            deviation_threshold=request.deviation_threshold,
            target_atr=request.target_atr,
        )
        result = await asyncio.to_thread(validator.run)
        backtest_cache[cache_key] = result
        return result
    except Exception as e:
        print(f"[ERROR] Backtest run failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
