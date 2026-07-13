"""
kelly_sizer.py — 통합 Kelly Criterion 포지션 사이징 모듈

라이브 엔진(paper_engine), 백테스터(portfolio_backtester), 전략 통계(main.py)가
동일한 KellySizer를 사용하여 백테스트-라이브 일관성(Model Consistency)을 보장한다.

기본 모드: 베이지안 수축 추정 + Half Kelly + ATR 변동성 페널티

다른 모듈에서의 import 예시:
  from services.kelly_sizer import KellySizer
"""

from __future__ import annotations

import numpy as np


class KellySizer:
    """
    베이지안 수축 추정(Bayesian Shrinkage) 기반 동적 Kelly Criterion 사이저.

    소표본에서도 안정적인 포지션 비중을 산출하기 위해 글로벌 사전분포
    (kappa × mu_global)로 평활화하고, ATR 변동성 페널티를 오버레이한다.

    Scale-Out은 동일 포지션(ticker+entry_price)의 청산을 여러 paper_history 행으로
    남기므로, 행 단위로 승/패를 세면 한 번의 왕복매매가 여러 개의 "승리"로
    중복 집계되어 승률이 부풀려진다. ticker+entry_price로 그룹핑해
    포지션 단위 손익률로 환산한 뒤 승/패를 판정한다.
    """

    def __init__(
        self,
        kappa: float = 5.0,
        mu_global_win_pct: float = 0.05,
        mu_global_loss_pct: float = 0.03,
        half_kelly: bool = True,
        max_weight: float = 0.15,
        min_weight: float = 0.02,
        min_trades: int = 10,
    ):
        self.kappa = kappa
        self.mu_global_win_pct = mu_global_win_pct
        self.mu_global_loss_pct = mu_global_loss_pct
        self.half_kelly = half_kelly
        self.max_weight = max_weight
        self.min_weight = min_weight
        self.min_trades = min_trades

    # ── 포지션 단위 그룹핑 ────────────────────────────────────────────────────

    @staticmethod
    def _group_trades(trade_records: list[dict]) -> list[float]:
        """
        paper_history 행을 포지션 단위(ticker+entry_price)로 그룹핑해
        포지션별 손익률(%) 리스트를 반환한다.

        Scale-Out 시 동일 포지션이 여러 행으로 기록되므로, 이를 합산해야
        승률과 손익비가 왜곡되지 않는다.
        """
        grouped: dict[str, dict[str, float]] = {}
        for r in trade_records:
            ticker = r.get("ticker", "unknown")
            entry_price = r.get("entry_price", 0.0) or 0.0
            profit_amt = r.get("profit_amt", 0.0) or 0.0
            pnl_pct = r.get("pnl_pct", 0.0) or 0.0

            # entry_value 자체는 저장되지 않으므로 profit_amt / pnl_pct로 역산
            entry_val = (profit_amt / (pnl_pct / 100.0)) if pnl_pct else 0.0

            key = f"{ticker}_{round(entry_price, 4)}"
            bucket = grouped.setdefault(key, {"total_pnl": 0.0, "total_entry_val": 0.0})
            bucket["total_pnl"] += profit_amt
            bucket["total_entry_val"] += entry_val

        return [
            b["total_pnl"] / b["total_entry_val"]
            for b in grouped.values()
            if b["total_entry_val"] > 0
        ]

    # ── 핵심 계산 ─────────────────────────────────────────────────────────────

    def compute(
        self,
        trade_records: list[dict],
        current_atr: float = 0.0,
        current_price: float = 1.0,
    ) -> tuple[float | None, float, float]:
        """
        통합 Kelly 비중을 계산한다.

        반환: (kelly_weight, win_rate_p, payoff_ratio_b)
        - kelly_weight: 최종 포지션 비중 (0.02~max_weight), 또는 거래 수 부족 시 None
        - win_rate_p: 승률 (0~1)
        - payoff_ratio_b: 평균 수익 / 평균 손실

        Parameters
        ----------
        trade_records : list[dict]
            paper_history 행 리스트. 각 dict에 ticker/entry_price/pnl_pct/profit_amt 키.
        current_atr : float
            현재 ATR 값 (변동성 페널티 오버레이용). 0이면 페널티 미적용.
        current_price : float
            현재 가격 (ATR→변동성비율 환산용).
        """
        if not trade_records:
            return None, 0.0, 0.0

        # 1. 포지션 단위 그룹핑 (Scale-Out 중복 집계 방지)
        position_pcts = self._group_trades(trade_records)

        if len(position_pcts) < self.min_trades:
            return None, 0.0, 0.0

        pnl_array = np.array(position_pcts)
        win_pcts = pnl_array[pnl_array > 0]
        loss_pcts = np.abs(pnl_array[pnl_array < 0])

        total_trades = len(win_pcts) + len(loss_pcts)
        if total_trades == 0:
            return None, 0.0, 0.0

        # 승률
        p = len(win_pcts) / total_trades

        # 2. 베이지안 수축 추정 (kappa로 평활화)
        avg_win_smoothed = (
            float(np.sum(win_pcts)) + self.kappa * self.mu_global_win_pct
        ) / (len(win_pcts) + self.kappa)
        avg_loss_smoothed = (
            float(np.sum(loss_pcts)) + self.kappa * self.mu_global_loss_pct
        ) / (len(loss_pcts) + self.kappa)

        b = avg_win_smoothed / avg_loss_smoothed if avg_loss_smoothed > 0 else 1.0

        # 3. 기댓값 가드 (EV ≤ 0이면 전략 무효, 0.0으로 완벽히 차단)
        # 이전에는 min_weight(0.02)를 반환하여 손실 전략에도 포지션이 열리는 회귀 버그 발생
        ev = (p * avg_win_smoothed) - ((1 - p) * avg_loss_smoothed)
        if ev <= 0:
            return 0.0, p, b

        # Kelly 공식: f* = (p × b - (1-p)) / b
        raw_kelly = (p * b - (1 - p)) / b if b > 0 else 0.0

        # 4. ATR 변동성 페널티 오버레이
        if current_atr > 0 and current_price > 0:
            volatility_ratio = current_atr / current_price
            penalty_factor = 1.0 / (1.0 + 10.0 * volatility_ratio)
        else:
            penalty_factor = 1.0

        # 5. Half/Full Kelly 적용
        kelly_multiplier = 0.5 if self.half_kelly else 1.0
        dynamic_fraction = raw_kelly * kelly_multiplier * penalty_factor

        final_weight = max(self.min_weight, min(self.max_weight, dynamic_fraction))
        return final_weight, p, b
