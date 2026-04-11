from supabase import Client
from webhook_manager import WebhookManager
import asyncio

INITIAL_CAPITAL = 100000.0


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

    async def process_signal(
        self,
        ticker: str,
        price: float,
        signal_type: str,
        strength: str,
        rsi: float,
        ai_report: str = "",
        is_armed: bool = False,
    ):
        """
        v4 State Machine:
        1. STRONG BUY -> 매수 (3/4 Kelly)
        2. HOLD 중 RSI > 60 -> 50% 분할 익절 (SCALE_OUT) & TS 상향
        3. 가격 < TS_Threshold -> 전량 손절 (TRAILING_STOP)
        """
        pos = await self.get_position(ticker)
        acc = await self.get_account()

        if not acc:
            print("⚠️ Paper Account not initialized.")
            return

        # --- 1. 신규 매수 (STRONG BUY & No position) ---
        if signal_type == "BUY" and strength == "STRONG" and not pos and is_armed:
            # 켈리 비중에 따른 가상 매수 (단순화: 가용한 현금의 15% 정도씩 진입 가정)
            buy_budget = acc["cash_available"] * 0.15
            if buy_budget < 500:  # 최소 주문 금액
                return

            units = buy_budget / price
            ts_threshold = price * 0.90  # 초기 트레일링 스탑 -10%

            new_pos = {
                "ticker": ticker.upper(),
                "status": "HOLD",
                "weight": 0.15,
                "entry_price": price,
                "current_price": price,
                "highest_price": price,
                "ts_threshold": ts_threshold,
                "units": units,
                "is_scaled_out": False,
            }

            try:
                await asyncio.to_thread(
                    self.supabase.table("paper_positions").insert(new_pos).execute
                )
                # 현금 차감
                new_cash = acc["cash_available"] - buy_budget
                await asyncio.to_thread(
                    self.supabase.table("paper_account")
                    .update({"cash_available": new_cash})
                    .eq("id", acc["id"])
                    .execute
                )

                await self.webhook.send_alert(
                    title=f"🚀 [PAPER BUY] {ticker}",
                    description=f"진입가: ${price:.2f} | 수량: {units:.2f}주\n초기 손절선: ${ts_threshold:.2f} (-10%)",
                    color=0x2ECC71,
                )
            except Exception as e:
                print(f"❌ Buy Error: {e}")

        # --- 2. 기존 포지션 관리 (Trailing Stop & Scale Out) ---
        if pos:
            units = pos["units"]
            entry_price = pos["entry_price"]
            highest_price = max(pos["highest_price"], price)
            is_scaled_out = pos["is_scaled_out"]
            ts_threshold = pos["ts_threshold"]

            # A. 업데이트 (최고가 갱신 시 TS 상향)
            if not is_scaled_out:
                new_ts = highest_price * 0.90
                ts_threshold = max(ts_threshold, new_ts)

            # B. SCALE_OUT 체크 (RSI > 60)
            if rsi > 60 and not is_scaled_out and is_armed:
                sell_units = units * 0.5
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
                new_ts_val = entry_price * 1.01
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
                return

            # C. TRAILING STOP 체크
            if price < ts_threshold and is_armed:
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
