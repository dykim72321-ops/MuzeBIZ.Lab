import os
import asyncio
from dotenv import load_dotenv
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce


async def test_virtual_trading():
    load_dotenv()

    API_KEY = os.getenv("APCA_API_KEY_ID")
    SECRET_KEY = os.getenv("APCA_API_SECRET_KEY")
    BASE_URL = os.getenv("APCA_API_BASE_URL", "https://paper-api.alpaca.markets")

    if not API_KEY or not SECRET_KEY:
        print("❌ Error: Alpaca API Keys not found in .env")
        return

    client = TradingClient(API_KEY, SECRET_KEY, paper=True)

    print("--- 🔍 Step 1: Account Status ---")
    account = client.get_account()
    print(f"Account ID: {account.id}")
    print(f"Equity: ${account.equity}")
    print(f"Buying Power: ${account.buying_power}")

    symbol = "AMC"
    print(f"\n--- 🚀 Step 2: Placing Market Buy Order for {symbol} (1 share) ---")

    buy_request = MarketOrderRequest(
        symbol=symbol, qty=1, side=OrderSide.BUY, time_in_force=TimeInForce.GTC
    )

    try:
        order = client.submit_order(buy_request)
        print(f"✅ Order Submitted: ID={order.id}, Status={order.status}")

        # 잠시 대기 (주문 처리 시간)
        await asyncio.sleep(2)

        print(f"\n--- 📊 Step 3: Checking Active Positions ---")
        positions = client.get_all_positions()
        found = False
        for pos in positions:
            print(
                f"Position: {pos.symbol}, Qty: {pos.qty}, Market Value: ${pos.market_value}"
            )
            if pos.symbol == symbol:
                found = True

        if not found:
            print(f"⚠️ {symbol} position not found yet (might be still processing).")

        print(f"\n--- 🔄 Step 4: Liquidating {symbol} (Selling) ---")
        client.close_position(symbol)
        print(f"✅ Position for {symbol} closed (Market Sell).")

    except Exception as e:
        print(f"❌ Trading Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(test_virtual_trading())
