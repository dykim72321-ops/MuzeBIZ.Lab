import os
import asyncio
import requests
from datetime import datetime
from dotenv import load_dotenv
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce


def test_virtual_trading():
    load_dotenv()

    # Alpaca Keys
    API_KEY = os.getenv("APCA_API_KEY_ID")
    SECRET_KEY = os.getenv("APCA_API_SECRET_KEY")

    # Backend Admin Key (for Proxy API)
    ADMIN_KEY = os.getenv("ADMIN_SECRET_KEY") or os.getenv("VITE_ADMIN_SECRET_KEY")
    BACKEND_URL = "http://localhost:8000"

    if not API_KEY or not SECRET_KEY or not ADMIN_KEY:
        print("❌ Error: Missing credentials in .env")
        return

    client = TradingClient(API_KEY, SECRET_KEY, paper=True)
    headers = {"X-Admin-Key": ADMIN_KEY}

    print("--- 🔍 Step 1: Alpaca Account Status ---")
    account = client.get_account()
    print(f"Equity: ${account.equity}")

    symbol = "AMC"
    print(f"\n--- 🚀 Step 2: Placing Market Buy Order for {symbol} ---")

    buy_request = MarketOrderRequest(
        symbol=symbol, qty=1, side=OrderSide.BUY, time_in_force=TimeInForce.GTC
    )

    try:
        order = client.submit_order(buy_request)
        print(f"✅ Alpaca Order Submitted: ID={order.id}")

        entry_price = float(order.filled_avg_price) if order.filled_avg_price else 1.0

        # [NEW] Backend Proxy를 통한 데이터 주입 (RLS 우회)
        pos_payload = {
            "ticker": symbol,
            "entry_price": entry_price,
            "entry_date": datetime.now().strftime("%Y-%m-%d"),
            "initial_atr": 0.05,
            "highest_high": entry_price,
            "days_held": 0,
            "amount": 1.0,
        }

        response = requests.post(
            f"{BACKEND_URL}/api/test/inject-position", json=pos_payload, headers=headers
        )

        if response.status_code == 200:
            print(
                f"✅ UI Sync SUCCESS: {symbol} is now visible in Dashboard (Positions Tab)."
            )
        else:
            print(f"❌ UI Sync FAILED: {response.text}")

        print(
            "--- ⏳ Waiting 60 seconds for UI Capture (Please check browser now!) ---"
        )
        asyncio.run(asyncio.sleep(60))

        print(f"\n--- 🔄 Step 3: Liquidating {symbol} and Syncing History ---")
        client.close_position(symbol)

        # [NEW] Backend Proxy를 통한 데이터 청산 및 History 이동
        del_response = requests.delete(
            f"{BACKEND_URL}/api/test/clear-position/{symbol}", headers=headers
        )

        if del_response.status_code == 200:
            print(f"✅ Final Sync: Position moved to History Tab successfully.")
        else:
            print(f"❌ Final Sync FAILED: {del_response.text}")

    except Exception as e:
        print(f"❌ Error during test: {str(e)}")


if __name__ == "__main__":
    test_virtual_trading()
