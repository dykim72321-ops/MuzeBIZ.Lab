from supabase import Client
from webhook_manager import WebhookManager
import asyncio
from datetime import datetime, timezone

INITIAL_CAPITAL = 100000.0

# ── 포지션 사이징 / 리스크 상수 ──────────────────────────────────────────────
KELLY_FRACTION = 0.15  # 가용 현금 대비 진입 비중 (3/4 Kelly ≈ 15%)
MIN_BUY_BUDGET = 10.0  # 최소 주문 금액 (달러)
MAX_BUY_BUDGET = 100.0  # 종목당 최대 매수 금액 (달러) — 리스크 상한
MAX_CONCURRENT_POSITIONS = 10  # 동시 보유 최대 종목 수
TS_INIT_PCT = 0.90  # 초기 트레일링 스탑: 진입가 × 90% (-10%)
TS_TRAIL_PCT = 0.90  # 최고가 갱신 시 TS 추적 비율: highest × 90%
SCALE_OUT_RATIO = 0.50  # Scale-Out 시 매도 비율 (50%)
SCALE_OUT_TS_PCT = 1.01  # Scale-Out 후 TS 본절 + 1%
POS_WEIGHT = 0.15  # paper_positions.weight 기록값

# ── Penny Lab 전용 파라미터 ($1 이하 종목 동적 적용) ─────────────────────────
PENNY_MAX_PRICE = 1.0  # 진입가 ≤ 이 값이면 페니 파라미터 자동 전환
PENNY_TS_INIT_PCT = 0.85  # 초기 TS: 진입가 × 85% (-15%)
PENNY_TS_TRAIL_PCT = 0.85  # 최고가 추종 TS: highest × 85%
PENNY_BREAKEVEN_TRIGGER = 1.10  # 수익 +10% 달성 시 TS 하한을 진입가(본전)로 락인
PENNY_SCALE_OUT_RSI = 70  # 1차 매도 RSI 기준 (일반 60 → 페니 70)
PENNY_SCALE_OUT_PROFIT = 0.20  # 1차 매도 수익률 기준 (+20% OR RSI>70)
PENNY_TIGHT_TS_PCT = 0.93  # Scale-Out 후 잔여 물량 TS: highest × 93% (-7%)
SCALE_OUT_COOLDOWN_BARS = 3  # Scale-Out 후 최소 3봉(분) 동안 TS 체크 유예

# ── [Guide-3] 슬리피지 보정 (보수적 시뮬레이션) ─────────────────────────────
# 페니 종목은 호가 스프레드가 커서 더 높은 슬리피지 적용
SLIPPAGE_BUY_NORMAL = 0.005  # 일반 종목 매수 슬리피지 +0.5%
SLIPPAGE_SELL_NORMAL = 0.005  # 일반 종목 매도 슬리피지 -0.5%
SLIPPAGE_BUY_PENNY = 0.015  # 페니 종목 매수 슬리피지 +1.5% (와이드 스프레드 반영)
SLIPPAGE_SELL_PENNY = 0.010  # 페니 종목 매도 슬리피지 -1.0%
# 거래량이 극도로 낮은 종목은 슬리피지를 2× 가중 (유동성 패널티)
SLIPPAGE_LOW_VOLUME_THRESHOLD = 50_000  # 주/일 거래량 기준


def _apply_slippage(
    price: float, is_buy: bool, is_penny: bool, volume: int = 0
) -> float:
    """
    체결 불리 방향으로 슬리피지를 반영한 보수적 모의 체결가 반환.
    - 매수: 시장가보다 높게 체결 (ask 쪽 스프레드)
    - 매도: 시장가보다 낮게 체결 (bid 쪽 스프레드)
    - 거래량 < SLIPPAGE_LOW_VOLUME_THRESHOLD → 슬리피지 2× 가중
    """
    base_pct = (
        (SLIPPAGE_BUY_PENNY if is_penny else SLIPPAGE_BUY_NORMAL)
        if is_buy
        else (SLIPPAGE_SELL_PENNY if is_penny else SLIPPAGE_SELL_NORMAL)
    )
    if volume > 0 and volume < SLIPPAGE_LOW_VOLUME_THRESHOLD:
        base_pct *= 2.0
    if is_buy:
        return round(price * (1.0 + base_pct), 6)
    else:
        return round(price * (1.0 - base_pct), 6)


class PaperTradingManager:
    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client
        self.webhook = WebhookManager()

    async def get_account(self):
        query = self.supabase.table("paper_account").select("*").limit(1)
        res = await asyncio.to_thread(query.execute)
        return res.data[0] if res.data else None

    async def calculate_invested_capital(self, positions: list = None) -> float:
        """보유 포지션의 현재 평가액 합산 (positions 미전달 시 DB에서 조회)"""
        if positions is None:
            res = await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .select("current_price,units")
                .execute
            )
            positions = res.data or []
        return sum(
            float(p.get("current_price") or 0) * float(p.get("units") or 0)
            for p in positions
        )

    async def initialize_account(self, initial_cash: float = INITIAL_CAPITAL):
        """계좌가 없으면 초기 자산과 함께 생성합니다."""
        acc = await self.get_account()
        if not acc:
            print(
                f"💰 [PAPER] No account found. Initializing with ${initial_cash:,.2f}..."
            )
            new_acc = {
                "total_assets": initial_cash,
                "cash_available": initial_cash,
            }
            try:
                res = await asyncio.to_thread(
                    self.supabase.table("paper_account").insert(new_acc).execute
                )
                print("✅ [PAPER] Account successfully initialized.")
                return res.data[0]
            except Exception as e:
                print(f"❌ [PAPER] Account initialization failed: {e}")
                return None
        return acc

    async def get_position(self, ticker: str):
        query = self.supabase.table("paper_positions").select("*").eq("ticker", ticker)
        res = await asyncio.to_thread(query.execute)
        return res.data[0] if res.data else None

    async def _sync_watchlist_buy(
        self, ticker: str, price: float, ts_threshold: float, dna_score: float
    ):
        """매수 시 관심종목 자동 등록 (status=HOLDING). 이미 있으면 업데이트."""
        payload = {
            "ticker": ticker,
            "status": "HOLDING",
            "buy_price": round(price, 4),
            "stop_loss": round(ts_threshold, 4),
            "initial_dna_score": round(dna_score, 1),
        }
        try:
            existing = await asyncio.to_thread(
                self.supabase.table("watchlist")
                .select("ticker")
                .eq("ticker", ticker)
                .is_("user_id", "null")
                .execute
            )
            if existing.data:
                await asyncio.to_thread(
                    self.supabase.table("watchlist")
                    .update(
                        {
                            "status": "HOLDING",
                            "buy_price": payload["buy_price"],
                            "stop_loss": payload["stop_loss"],
                        }
                    )
                    .eq("ticker", ticker)
                    .is_("user_id", "null")
                    .execute
                )
            else:
                await asyncio.to_thread(
                    self.supabase.table("watchlist").insert(payload).execute
                )
        except Exception as e:
            print(f"⚠️ [Watchlist Sync BUY] {ticker}: {e}")

    async def _sync_watchlist_exit(self, ticker: str):
        """청산 시 관심종목 상태를 EXITED로 업데이트."""
        try:
            await asyncio.to_thread(
                self.supabase.table("watchlist")
                .update({"status": "EXITED"})
                .eq("ticker", ticker)
                .is_("user_id", "null")
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Watchlist Sync EXIT] {ticker}: {e}")

    async def _sync_watchlist_stop_loss(self, ticker: str, stop_loss: float):
        """트레일링 스탑 이동 시 관심종목 stop_loss 동기화."""
        try:
            await asyncio.to_thread(
                self.supabase.table("watchlist")
                .update({"stop_loss": round(stop_loss, 4)})
                .eq("ticker", ticker)
                .is_("user_id", "null")
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Watchlist Sync SL] {ticker}: {e}")

    REENTRY_COOLDOWN_MINUTES = 60  # 청산 후 재진입 금지 시간

    async def _is_in_cooldown(self, ticker: str) -> bool:
        """최근 청산 이후 REENTRY_COOLDOWN_MINUTES 이내이면 True 반환."""
        try:
            res = await asyncio.to_thread(
                self.supabase.table("paper_history")
                .select("closed_at")
                .eq("ticker", ticker)
                .order("closed_at", desc=True)
                .limit(1)
                .execute
            )
            if not res.data:
                return False
            closed_at_str = res.data[0].get("closed_at")
            if not closed_at_str:
                return False
            closed_at = datetime.fromisoformat(closed_at_str.replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - closed_at).total_seconds()
            return elapsed < self.REENTRY_COOLDOWN_MINUTES * 60
        except Exception as e:
            print(f"⚠️ [Cooldown Check] {ticker}: {e}")
            return False

    async def process_signal(
        self,
        ticker: str,
        price: float,
        signal_type: str,
        strength: str,
        rsi: float,
        ai_report: str = "",
        is_armed: bool = False,
        dna_score: float = 85.0,
        kelly_weight: float = 0.0,
    ):
        """
        v4 State Machine:
        1. STRONG BUY (DNA≥80) → 매수 (Kelly 비중 or 기본 KELLY_FRACTION) + 관심종목 자동 등록 (HOLDING)
        2. HOLD 중 RSI > 60 → 50% 분할 익절 (SCALE_OUT) & TS 상향 + watchlist stop_loss 동기화
        3. 가격 < TS_Threshold → 전량 청산 (TRAILING_STOP) + 관심종목 EXITED
        """
        pos, acc = await asyncio.gather(
            self.get_position(ticker),
            self.get_account(),
        )

        if not acc:
            print("⚠️ Paper Account not initialized.")
            return

        # --- 1. 신규 매수 (STRONG BUY & No position) ---
        is_penny_signal = price <= PENNY_MAX_PRICE
        dna_gate = 70 if is_penny_signal else 80
        if (
            signal_type == "BUY"
            and strength == "STRONG"
            and not pos
            and is_armed
            and dna_score >= dna_gate
        ):
            # 동시 포지션 상한 체크
            pos_count_res = await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .select("ticker", count="exact")
                .execute
            )
            if (pos_count_res.count or 0) >= MAX_CONCURRENT_POSITIONS:
                print(
                    f"⛔ [{ticker}] 동시 포지션 한도 초과 ({MAX_CONCURRENT_POSITIONS}개) — 진입 차단"
                )
                return
            # 재진입 쿨다운 체크 (청산 후 60분 이내 재진입 차단)
            if await self._is_in_cooldown(ticker):
                print(
                    f"⏳ [{ticker}] 재진입 쿨다운 중 ({self.REENTRY_COOLDOWN_MINUTES}분) — 진입 차단"
                )
                return
            # Kelly 엔진이 계산한 비중이 유효하면 사용, 없으면 기본값(KELLY_FRACTION)
            effective_fraction = (
                kelly_weight / 100.0 if kelly_weight > 0 else KELLY_FRACTION
            )
            effective_fraction = min(
                effective_fraction, 0.25
            )  # 단일 종목 최대 25% 제한
            buy_budget = min(
                acc["cash_available"] * effective_fraction,
                MAX_BUY_BUDGET,
            )
            if buy_budget < MIN_BUY_BUDGET:
                return

            # [Guide-3] 슬리피지 보정 — 매수는 시장가보다 불리하게 체결
            fill_price = _apply_slippage(price, is_buy=True, is_penny=is_penny_signal)
            units = buy_budget / fill_price
            ts_init = PENNY_TS_INIT_PCT if is_penny_signal else TS_INIT_PCT
            ts_threshold = fill_price * ts_init

            new_pos = {
                "ticker": ticker.upper(),
                "status": "HOLD",
                "weight": round(effective_fraction, 4),
                "entry_price": fill_price,
                "current_price": fill_price,
                "highest_price": fill_price,
                "ts_threshold": ts_threshold,
                "units": units,
                "is_scaled_out": False,
                "scale_out_bar_count": 0,
            }

            try:
                pos_res = await asyncio.to_thread(
                    self.supabase.table("paper_positions").insert(new_pos).execute
                )
                if not pos_res.data:
                    raise RuntimeError(f"Position INSERT returned no data for {ticker}")

                # INSERT 성공 확인 후에만 현금 차감 (원자성 보장)
                new_cash = acc["cash_available"] - buy_budget
                cash_res = await asyncio.to_thread(
                    self.supabase.table("paper_account")
                    .update({"cash_available": new_cash})
                    .eq("id", acc["id"])
                    .execute
                )
                if not cash_res.data:
                    # 현금 차감 실패 시 방금 INSERT한 포지션을 롤백
                    await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .delete()
                        .eq("ticker", ticker)
                        .execute
                    )
                    raise RuntimeError(
                        f"Cash UPDATE failed for {ticker}, position rolled back"
                    )

                slip_pct = (fill_price / price - 1) * 100
                report_line = f"\n💡 {ai_report}" if ai_report else ""
                await self.webhook.send_alert(
                    title=f"🚀 [PAPER BUY] {ticker}",
                    description=(
                        f"시장가: ${price:.4f} → 체결가: ${fill_price:.4f} (슬리피지 {slip_pct:+.2f}%)\n"
                        f"수량: {units:.2f}주 | DNA: {dna_score:.0f} | 매수금액: ${buy_budget:.2f}\n"
                        f"손절선: ${ts_threshold:.4f} ({'-15%' if is_penny_signal else '-10%'}) | 비중: {effective_fraction*100:.1f}%{report_line}"
                    ),
                    color=0x2ECC71,
                )
                # 관심종목 자동 등록 (DNA≥80 매수 → HOLDING)
                await self._sync_watchlist_buy(
                    ticker, fill_price, ts_threshold, dna_score
                )
            except Exception as e:
                print(f"❌ Buy Error: {e}")
                raise

        # --- 2. 기존 포지션 관리 (Trailing Stop & Scale Out) ---
        if pos:
            units = pos["units"]
            entry_price = pos["entry_price"]
            highest_price = max(pos["highest_price"], price)
            is_scaled_out = pos["is_scaled_out"]
            ts_threshold = pos["ts_threshold"]
            is_penny = entry_price <= PENNY_MAX_PRICE

            # A-0. EOD 강제 청산 최우선 처리 (Scale-Out보다 앞에 위치 — 동시 발동 시 EOD 우선)
            if signal_type == "SELL" and strength == "EOD_FORCE":
                fill_exit_price = _apply_slippage(
                    price, is_buy=False, is_penny=is_penny
                )
                profit_cash = units * fill_exit_price
                pnl_pct = (fill_exit_price / entry_price - 1) * 100
                profit_amt = (fill_exit_price - entry_price) * units

                new_cash = acc["cash_available"] + profit_cash
                await asyncio.to_thread(
                    self.supabase.table("paper_account")
                    .update({"cash_available": new_cash})
                    .eq("id", acc["id"])
                    .execute
                )
                history_data = {
                    "ticker": ticker,
                    "entry_price": entry_price,
                    "exit_price": fill_exit_price,
                    "pnl_pct": pnl_pct,
                    "profit_amt": profit_amt,
                    "exit_reason": "EOD Force Exit",
                }
                await asyncio.to_thread(
                    self.supabase.table("paper_history").insert(history_data).execute
                )
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .delete()
                    .eq("ticker", ticker)
                    .execute
                )
                status_emoji = "✅" if pnl_pct > 0 else "🛑"
                await self.webhook.send_alert(
                    title=f"{status_emoji} [PAPER EOD EXIT] {ticker}",
                    description=(
                        f"청산가: ${fill_exit_price:.4f} | 수익률: {pnl_pct:.2f}%\n"
                        f"사유: 장 마감 강제 청산 (15:30 ET)"
                    ),
                    color=0x95A5A6,
                )
                await self._sync_watchlist_exit(ticker)
                return

            # A. 업데이트 (최고가 갱신 시 TS 상향)
            if not is_scaled_out:
                trail_pct = PENNY_TS_TRAIL_PCT if is_penny else TS_TRAIL_PCT
                new_ts = highest_price * trail_pct
                # 페니: +10% 달성 시 TS 하한을 진입가(본전)로 락인
                if is_penny and price >= entry_price * PENNY_BREAKEVEN_TRIGGER:
                    new_ts = max(new_ts, entry_price)
                ts_threshold = max(ts_threshold, new_ts)
            elif is_penny:
                # Scale-Out 후 페니: -7% 타이트 TS로 잔여 랠리 추종 (진입가 이하로 내려가지 않음)
                new_ts = max(entry_price, highest_price * PENNY_TIGHT_TS_PCT)
                ts_threshold = max(ts_threshold, new_ts)

            # B. SCALE_OUT 체크
            if is_penny:
                profit_pct = price / entry_price - 1
                # RSI arm은 최소 +5% 수익 확인 후 허용 (단순 변동성으로 인한 조기 청산 방지)
                scale_trigger = (
                    rsi > PENNY_SCALE_OUT_RSI and profit_pct >= 0.05
                ) or profit_pct >= PENNY_SCALE_OUT_PROFIT
            else:
                scale_trigger = rsi > 60
            if scale_trigger and not is_scaled_out and is_armed and price > entry_price:
                sell_units = units * SCALE_OUT_RATIO
                # [Guide-3] 매도 슬리피지 적용
                fill_sell_price = _apply_slippage(
                    price, is_buy=False, is_penny=is_penny
                )
                profit_cash = sell_units * fill_sell_price

                # 가상 계좌 업데이트 (cash_available만 갱신 — total_assets는 /api/broker/paper/account에서
                # cash + invested_capital로 동적 계산하므로 DB 컬럼을 직접 쓰지 않음)
                new_cash = acc["cash_available"] + profit_cash
                await asyncio.to_thread(
                    self.supabase.table("paper_account")
                    .update({"cash_available": new_cash})
                    .eq("id", acc["id"])
                    .execute
                )

                # 포지션 업데이트: 수량 반토막, TS 본절+1% 상향
                new_ts_val = (
                    max(entry_price, highest_price * PENNY_TIGHT_TS_PCT)
                    if is_penny
                    else entry_price * SCALE_OUT_TS_PCT
                )
                update_data = {
                    "status": "SCALE_OUT",
                    "units": units - sell_units,
                    "is_scaled_out": True,
                    "ts_threshold": new_ts_val,
                    "highest_price": highest_price,
                    "current_price": price,
                    "scale_out_bar_count": 0,  # 쿨다운 카운터 초기화
                }
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update(update_data)
                    .eq("ticker", ticker)
                    .execute
                )

                slip_sell_pct = (fill_sell_price / price - 1) * 100
                price_str = (
                    f"${fill_sell_price:.4f}" if is_penny else f"${fill_sell_price:.2f}"
                )
                ts_desc = (
                    f"-7% TS ${new_ts_val:.4f}"
                    if is_penny
                    else f"본절+1% ${new_ts_val:.2f}"
                )
                await self.webhook.send_alert(
                    title=f"🟠 [PAPER SCALE-OUT] {ticker}",
                    description=f"50% 분할 익절 완료: {price_str} (슬리피지 {slip_sell_pct:+.2f}%)\n방어선 상향: {ts_desc}",
                    color=0xE67E22,
                )
                # 관심종목 stop_loss 동기화 (TS 이동)
                await self._sync_watchlist_stop_loss(ticker, new_ts_val)
                # 같은 봉에서 Scale-Out과 Trailing Stop이 동시에 발동하는 것을 방지
                return

            # C. TRAILING STOP 체크 (ARMED 해제 상태에서도 실행 — 손실 확대 방지 우선)
            # Scale-Out 직후 쿨다운: 잔여 물량이 흔들림에 즉시 손절되는 것을 방지
            bar_count = pos.get("scale_out_bar_count", SCALE_OUT_COOLDOWN_BARS)
            if is_scaled_out and bar_count < SCALE_OUT_COOLDOWN_BARS:
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update(
                        {
                            "scale_out_bar_count": bar_count + 1,
                            "current_price": price,
                            "highest_price": highest_price,
                            "ts_threshold": ts_threshold,
                        }
                    )
                    .eq("ticker", ticker)
                    .execute
                )
                return  # 쿨다운 중: TS 체크 유예

            if price < ts_threshold:
                # [Guide-3] 손절 매도 슬리피지 적용 (패닉 셀 상황 → 불리한 체결)
                fill_exit_price = _apply_slippage(
                    price, is_buy=False, is_penny=is_penny
                )
                profit_cash = units * fill_exit_price
                pnl_pct = (fill_exit_price / entry_price - 1) * 100
                profit_amt = (fill_exit_price - entry_price) * units

                # 가상 계좌 업데이트
                new_cash = acc["cash_available"] + profit_cash
                await asyncio.to_thread(
                    self.supabase.table("paper_account")
                    .update({"cash_available": new_cash})
                    .eq("id", acc["id"])
                    .execute
                )

                # 히스토리 저장
                history_data = {
                    "ticker": ticker,
                    "entry_price": entry_price,
                    "exit_price": fill_exit_price,
                    "pnl_pct": pnl_pct,
                    "profit_amt": profit_amt,
                    "exit_reason": "Trailing Stop",
                }
                await asyncio.to_thread(
                    self.supabase.table("paper_history").insert(history_data).execute
                )

                # 포지션 삭제
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .delete()
                    .eq("ticker", ticker)
                    .execute
                )

                status_emoji = "✅" if pnl_pct > 0 else "🛑"
                slip_exit_pct = (fill_exit_price / price - 1) * 100
                await self.webhook.send_alert(
                    title=f"{status_emoji} [PAPER EXIT] {ticker}",
                    description=(
                        f"청산가: ${fill_exit_price:.4f} (슬리피지 {slip_exit_pct:+.2f}%) | 수익률: {pnl_pct:.2f}%\n"
                        f"사유: 트레일링 스탑 발동"
                    ),
                    color=0x34495E,
                )
                # 관심종목 상태 → EXITED
                await self._sync_watchlist_exit(ticker)
            else:
                # 일반 업데이트
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update(
                        {
                            "current_price": price,
                            "highest_price": highest_price,
                            "ts_threshold": ts_threshold,
                        }
                    )
                    .eq("ticker", ticker)
                    .execute
                )
