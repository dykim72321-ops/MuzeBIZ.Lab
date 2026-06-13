import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
import sys
import os

# Add python_engine to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Mock WebhookManager before importing paper_engine
with patch("webhook_manager.WebhookManager") as mock_webhook_mgr:
    mock_webhook = MagicMock()
    mock_webhook.send_alert = AsyncMock()
    mock_webhook_mgr.return_value = mock_webhook

    from paper_engine import PaperTradingManager


class TestPennyTradingEngine(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Setup mock Supabase client
        self.mock_supabase = MagicMock()

        # Setup mock tables
        self.mock_table_positions = MagicMock()
        self.mock_table_account = MagicMock()
        self.mock_table_watchlist = MagicMock()
        self.mock_table_history = MagicMock()

        def table_side_effect(table_name):
            if table_name == "paper_positions":
                return self.mock_table_positions
            elif table_name == "paper_account":
                return self.mock_table_account
            elif table_name == "watchlist":
                return self.mock_table_watchlist
            elif table_name == "paper_history":
                return self.mock_table_history
            return MagicMock()

        self.mock_supabase.table.side_effect = table_side_effect

        # Instantiate manager
        self.manager = PaperTradingManager(self.mock_supabase)
        # Mock webhook again on the instance to be safe
        self.manager.webhook = AsyncMock()
        self.manager.webhook.send_alert = AsyncMock()

    async def test_penny_stock_buy_trailing_stop(self):
        """Test 1: BUY ts_threshold 진입가 <= $1 이면 -15%, 일반 이면 -10% 동적 전환"""
        # 1. Penny stock buy (price = $0.50)
        acc_data = {"id": 1, "cash_available": 10000.0, "total_assets": 10000.0}
        self.mock_table_account.select.return_value.limit.return_value.execute.return_value.data = [
            acc_data
        ]
        self.mock_table_positions.select.return_value.eq.return_value.execute.return_value.data = (
            []
        )
        self.mock_table_watchlist.select.return_value.eq.return_value.is_.return_value.execute.return_value.data = (
            []
        )

        # Execute process_signal for penny stock (BUY)
        await self.manager.process_signal(
            ticker="SNDL",
            price=0.50,
            signal_type="BUY",
            strength="STRONG",
            rsi=30,
            is_armed=True,
            dna_score=85.0,
        )

        # Verify initial TS is -15% (0.50 * 0.85 = 0.425)
        insert_args = self.mock_table_positions.insert.call_args[0][0]
        self.assertEqual(insert_args["ticker"], "SNDL")
        self.assertAlmostEqual(insert_args["ts_threshold"], 0.425)
        self.assertFalse(insert_args["is_scaled_out"])

        # 2. Regular stock buy (price = $2.00)
        self.mock_table_positions.insert.reset_mock()
        await self.manager.process_signal(
            ticker="AAPL",
            price=2.00,
            signal_type="BUY",
            strength="STRONG",
            rsi=30,
            is_armed=True,
            dna_score=85.0,
        )

        # Verify initial TS is -10% (2.00 * 0.90 = 1.80)
        insert_args = self.mock_table_positions.insert.call_args[0][0]
        self.assertEqual(insert_args["ticker"], "AAPL")
        self.assertAlmostEqual(insert_args["ts_threshold"], 1.80)
        self.assertFalse(insert_args["is_scaled_out"])

    async def test_penny_breakeven_trigger(self):
        """Test 2: +10% 수익 시 본전(진입가) 하한 락인"""
        # Mock position and account
        pos_data = {
            "ticker": "SNDL",
            "status": "HOLD",
            "weight": 0.15,
            "entry_price": 0.50,
            "current_price": 0.50,
            "highest_price": 0.50,
            "ts_threshold": 0.425,
            "units": 3000,
            "is_scaled_out": False,
        }
        acc_data = {"id": 1, "cash_available": 10000.0, "total_assets": 10000.0}
        self.mock_table_account.select.return_value.limit.return_value.execute.return_value.data = [
            acc_data
        ]
        self.mock_table_positions.select.return_value.eq.return_value.execute.return_value.data = [
            pos_data
        ]

        # Price moves to $0.55 (+10%), rsi is normal (e.g. 50)
        await self.manager.process_signal(
            ticker="SNDL",
            price=0.55,
            signal_type="HOLD",
            strength="NORMAL",
            rsi=50,
            is_armed=True,
            dna_score=85.0,
        )

        # TS threshold should be locked at entry_price ($0.50)
        update_args = self.mock_table_positions.update.call_args[0][0]
        self.assertAlmostEqual(update_args["ts_threshold"], 0.50)

    async def test_penny_scale_out_trigger_and_tight_ts(self):
        """Test 3: 페니: RSI > 70 OR 수익률 >= +20% 시 50% 분할 매도 및 -7% 타이트 TS 적용"""
        # Mock position and account
        pos_data = {
            "ticker": "SNDL",
            "status": "HOLD",
            "weight": 0.15,
            "entry_price": 0.50,
            "current_price": 0.50,
            "highest_price": 0.50,
            "ts_threshold": 0.425,
            "units": 3000,
            "is_scaled_out": False,
        }
        acc_data = {"id": 1, "cash_available": 10000.0, "total_assets": 10000.0}
        self.mock_table_account.select.return_value.limit.return_value.execute.return_value.data = [
            acc_data
        ]
        self.mock_table_positions.select.return_value.eq.return_value.execute.return_value.data = [
            pos_data
        ]

        # Trigger via profit >= +20% (Price = $0.61)
        await self.manager.process_signal(
            ticker="SNDL",
            price=0.61,
            signal_type="HOLD",
            strength="NORMAL",
            rsi=55,  # RSI is below 70 but profit is 22%
            is_armed=True,
            dna_score=85.0,
        )

        # Verify scale-out happened: updates units to 1500 (50%) and is_scaled_out to True
        update_args = self.mock_table_positions.update.call_args[0][0]
        self.assertEqual(update_args["status"], "SCALE_OUT")
        self.assertEqual(update_args["units"], 1500)
        self.assertTrue(update_args["is_scaled_out"])

        # TS threshold for scale out should be max(entry_price, highest_price * 0.93) = max(0.50, 0.61 * 0.93) = 0.5673
        self.assertAlmostEqual(update_args["ts_threshold"], 0.61 * 0.93)

        # Now test trailing stop tracking after scale out (is_scaled_out = True)
        self.mock_table_positions.update.reset_mock()
        pos_data_scaled = {
            "ticker": "SNDL",
            "status": "SCALE_OUT",
            "weight": 0.15,
            "entry_price": 0.50,
            "current_price": 0.61,
            "highest_price": 0.61,
            "ts_threshold": 0.5673,
            "units": 1500,
            "is_scaled_out": True,
        }
        self.mock_table_positions.select.return_value.eq.return_value.execute.return_value.data = [
            pos_data_scaled
        ]

        # Price goes up to $0.70
        await self.manager.process_signal(
            ticker="SNDL",
            price=0.70,
            signal_type="HOLD",
            strength="NORMAL",
            rsi=60,
            is_armed=True,
            dna_score=85.0,
        )

        # TS threshold should follow tight TS (-7%): 0.70 * 0.93 = 0.651
        update_args = self.mock_table_positions.update.call_args[0][0]
        self.assertAlmostEqual(update_args["ts_threshold"], 0.651)


if __name__ == "__main__":
    unittest.main()
