from supabase import Client
from webhook_manager import WebhookManager
import asyncio

INITIAL_CAPITAL = 100000.0

# ── 포지션 사이징 / 리스크 상수 ──────────────────────────────────────────────
KELLY_FRACTION = 0.15  # 가용 현금 대비 진입 비중 (3/4 Kelly ≈ 15%)
MIN_BUY_BUDGET = 500.0  # 최소 주문 금액 (달러)
TS_INIT_PCT = 0.90  # 초기 트레일링 스탑: 진입가 × 90% (-10%)
TS_TRAIL_PCT = 0.90  # 최고가 갱신 시 TS 추적 비율: highest × 90%
SCALE_OUT_RATIO = 0.50  # Scale-Out 시 매도 비율 (50%)
SCALE_OUT_TS_PCT = 1.01  # Scale-Out 후 TS 본절 + 1%
POS_WEIGHT = 0.15  # paper_positions.weight 기록값


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
            # service role → RLS 우회. user_id=null 허용 (시스템 자동 등록)
            # BUG-3 fix: filter by user_id IS NULL to avoid overwriting users' manual entries
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
        pos = await self.get_position(ticker)
        acc = await self.get_account()

        if not acc:
            print("⚠️ Paper Account not initialized.")
            return

        # --- 1. 신규 매수 (STRONG BUY & No position) ---
        # LOGIC-1 fix: gate on dna_score >= 80 per system design
        if (
            signal_type == "BUY"
            and strength == "STRONG"
            and not pos
            and is_armed
            and dna_score >= 80
        ):
            # Kelly 엔진이 계산한 비중이 유효하면 사용, 없으면 기본값(KELLY_FRACTION)
            effective_fraction = (
                kelly_weight / 100.0 if kelly_weight > 0 else KELLY_FRACTION
            )
            effective_fraction = min(
                effective_fraction, 0.25
            )  # 단일 종목 최대 25% 제한
            buy_budget = acc["cash_available"] * effective_fraction
            if buy_budget < MIN_BUY_BUDGET:
                return

            units = buy_budget / price
            ts_threshold = price * TS_INIT_PCT

            new_pos = {
                "ticker": ticker.upper(),
                "status": "HOLD",
                "weight": round(effective_fraction, 4),
                "entry_price": price,
                "current_price": price,
                "highest_price": price,
                "ts_threshold": ts_threshold,
                "units": units,
                "is_scaled_out": False,
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

                report_line = f"\n💡 {ai_report}" if ai_report else ""
                await self.webhook.send_alert(
                    title=f"🚀 [PAPER BUY] {ticker}",
                    description=(
                        f"진입가: ${price:.2f} | 수량: {units:.2f}주\n"
                        f"DNA: {dna_score:.0f} | 손절선: ${ts_threshold:.2f} (-10%)\n"
                        f"비중: {effective_fraction*100:.1f}%{report_line}"
                    ),
                    color=0x2ECC71,
                )
                # 관심종목 자동 등록 (DNA≥80 매수 → HOLDING)
                await self._sync_watchlist_buy(ticker, price, ts_threshold, dna_score)
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

            # A. 업데이트 (최고가 갱신 시 TS 상향)
            if not is_scaled_out:
                new_ts = highest_price * TS_TRAIL_PCT
                ts_threshold = max(ts_threshold, new_ts)

            # B. SCALE_OUT 체크 (RSI > 60 + 수익권 진입 확인)
            # LOGIC-2 fix: only scale-out when in profit to avoid locking in a loss
            if rsi > 60 and not is_scaled_out and is_armed and price > entry_price:
                sell_units = units * SCALE_OUT_RATIO
                profit_cash = sell_units * price

                # 가상 계좌 업데이트
                new_cash = acc["cash_available"] + profit_cash
                await asyncio.to_thread(
                    self.supabase.table("paper_account")
                    .update({"cash_available": new_cash})
                    .eq("id", acc["id"])
                    .execute
                )

                # 포지션 업데이트: 수량 반토막, TS 본절+1% 상향
                new_ts_val = entry_price * SCALE_OUT_TS_PCT
                update_data = {
                    "status": "SCALE_OUT",
                    "units": units - sell_units,
                    "is_scaled_out": True,
                    "ts_threshold": new_ts_val,
                    "highest_price": highest_price,
                    "current_price": price,
                }
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update(update_data)
                    .eq("ticker", ticker)
                    .execute
                )

                await self.webhook.send_alert(
                    title=f"🟠 [PAPER SCALE-OUT] {ticker}",
                    description=f"50% 분할 익절 완료: ${price:.2f}\n방어선 상향: ${new_ts_val:.2f} (본절+1%)",
                    color=0xE67E22,
                )
                # 관심종목 stop_loss 동기화 (TS 이동)
                await self._sync_watchlist_stop_loss(ticker, new_ts_val)
                # 같은 봉에서 Scale-Out과 Trailing Stop이 동시에 발동하는 것을 방지
                return

            # C. TRAILING STOP 체크 (리스크 관리: ARMED 여부와 무관하게 항상 실행)
            if price < ts_threshold:
                profit_cash = units * price
                pnl_pct = (price / entry_price - 1) * 100
                profit_amt = (price - entry_price) * units

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
                    "exit_price": price,
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
                await self.webhook.send_alert(
                    title=f"{status_emoji} [PAPER EXIT] {ticker}",
                    description=f"청산가: ${price:.2f} | 수익률: {pnl_pct:.2f}%\n사유: 트레일링 스탑 발동",
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
