import os
import asyncio
from dotenv import load_dotenv
from alpaca.trading.client import TradingClient
from alpaca.data.live import StockDataStream

load_dotenv()


async def final_verification():
    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")

    print("\n--- [START] Final Alpaca Connectivity Check ---")

    # 1. Check REST Trading API
    try:
        trading_client = TradingClient(api_key, api_secret, paper=True)
        account = trading_client.get_account()
        print(f"✅ REST API: Authorized (Account ID: {account.id})")
        print(f"✅ Trading Status: {account.status}")
    except Exception as e:
        print(f"❌ REST API ERROR: {e}")
        return

    # 2. Check WebSocket Data Stream
    try:
        stream = StockDataStream(api_key, api_secret)

        # We try to connect and stay for 3 seconds to see if it disconnects immediately
        print("Connecting to WebSocket...")

        async def on_bar(bar):
            print(f"📊 Live Data Received for {bar.symbol}: Price ${bar.close}")

        stream.subscribe_bars(on_bar, "AAPL", "TSLA", "NVDA")

        # start_ws will block, so we run it in a task
        ws_task = asyncio.create_task(stream._run_forever())

        # Wait a bit to ensure it stays connected
        await asyncio.sleep(5)

        if not ws_task.done():
            print("✅ WebSocket: Authenticated & Stable (No auth fail for 5s)")
            # Cancel the task as we are done with testing
            ws_task.cancel()
            try:
                await ws_task
            except asyncio.CancelledError:
                pass
        else:
            # If it's done, it must have crashed
            print(f"❌ WebSocket: Disconnected prematurely!")

        await stream.close()

    except Exception as e:
        print(f"❌ WebSocket ERROR: {e}")

    print("--- [END] Verification Complete ---\n")


if __name__ == "__main__":
    asyncio.run(final_verification())
