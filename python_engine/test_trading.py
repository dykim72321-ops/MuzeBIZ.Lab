import os
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from supabase import create_client

async def test_virtual_trading():
    load_dotenv()
    
    # Alpaca Keys
    API_KEY = os.getenv("APCA_API_KEY_ID")
    SECRET_KEY = os.getenv("APCA_API_SECRET_KEY")
    
    # Supabase Keys
    SB_URL = os.getenv("SUPABASE_URL")
    SB_KEY = os.getenv("SUPABASE_KEY")

    if not API_KEY or not SECRET_KEY or not SB_URL or not SB_KEY:
        print("❌ Error: Missing credentials in .env")
        return

    client = TradingClient(API_KEY, SECRET_KEY, paper=True)
    supabase = create_client(SB_URL, SB_KEY)

    print("--- 🔍 Step 1: Account Status ---")
    account = client.get_account()
    print(f"Equity: ${account.equity}")

    symbol = "AMC" 
    print(f"\n--- 🚀 Step 2: Placing Market Buy Order for {symbol} ---")
    
    buy_request = MarketOrderRequest(
        symbol=symbol,
        qty=1,
        side=OrderSide.BUY,
        time_in_force=TimeInForce.GTC
    )

    try:
        order = client.submit_order(buy_request)
        print(f"✅ Alpaca Order Submitted: ID={order.id}")
        
        # 실제 체결가 획득 (시장가이므로 즉시 체결 가정)
        # 종가가 1달러 미만일 수 있으므로 유연하게 처리
        entry_price = float(order.filled_avg_price) if order.filled_avg_price else 1.0
        
        # [NEW] Supabase 반영 - active_positions 추가 (스키마 부합)
        pos_data = {
            "ticker": symbol,
            "entry_price": entry_price,
            "entry_date": datetime.now().strftime("%Y-%m-%d"),
            "initial_atr": 0.05,        # 임시 값
            "highest_high": entry_price, # 진입가가 곧 최고가
            "days_held": 0,
            "amount": 1.0               # 수량 1주
        }
        
        await asyncio.sleep(1)
        
        # 기존 데이터 삭제 (중복 방지)
        supabase.table("active_positions").delete().eq("ticker", symbol).execute()
        
        sup_res = supabase.table("active_positions").insert(pos_data).execute()
        print(f"✅ Supabase Record Created: {symbol} is now visible in Dashboard (Positions Tab).")

        print("--- ⏳ Waiting 10 seconds for user to check Dashboard UI ---")
        await asyncio.sleep(10)

        print(f"\n--- 🔄 Step 3: Liquidating {symbol} ---")
        client.close_position(symbol)
        
        # [NEW] Supabase 반영 - active_positions 삭제 및 trade_history 추가
        supabase.table("active_positions").delete().eq("ticker", symbol).execute()
        
        exit_price = entry_price * 1.02 # 2% 수익 가정
        history_data = {
            "ticker": symbol,
            "entry_date": pos_data["entry_date"],
            "exit_date": datetime.now().strftime("%Y-%m-%d"),
            "entry_price": entry_price,
            "exit_price": exit_price,
            "pnl": (exit_price - entry_price) * 1, # 1주
            "pnl_percent": 2.0,
            "exit_reason": "VIRTUAL_TEST"
        }
        supabase.table("trade_history").insert(history_data).execute()
        print(f"✅ Supabase Sync: Position moved to History Tab.")

    except Exception as e:
        print(f"❌ Error during test: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_virtual_trading())
