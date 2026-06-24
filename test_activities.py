import asyncio
from alpaca.trading.client import TradingClient
import os
from dotenv import load_dotenv

load_dotenv(".env")

client = TradingClient(
    os.getenv("APCA_API_KEY_ID"), os.getenv("APCA_API_SECRET_KEY"), paper=True
)
try:
    res = client.get("/account/activities/FILL")
    sells = [r for r in res if r.get("side") == "sell"]
    for r in sells[:5]:
        print(
            f"ticker: {r.get('symbol')}, qty: {r.get('qty')}, price: {r.get('price')}, pnl: {r.get('realized_pl')}"
        )
except Exception as e:
    print("Error:", e)
