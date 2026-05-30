import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

async def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Supabase URL or Key not found in environment.")
        return
        
    print(f"🔗 Connecting to Supabase at: {SUPABASE_URL}")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 1. Check system_settings (ARM state)
    try:
        res = supabase.table("system_settings").select("*").execute()
        print("\n⚙️ [system_settings]:")
        for row in res.data or []:
            print(f"  - ID: {row.get('id')}, Is Armed: {row.get('is_armed')}, Settings: {row}")
    except Exception as e:
        print(f"❌ Error reading system_settings: {e}")
        
    # 2. Check paper_account
    try:
        res = supabase.table("paper_account").select("*").execute()
        print("\n💰 [paper_account]:")
        for row in res.data or []:
            print(f"  - {row}")
    except Exception as e:
        print(f"❌ Error reading paper_account: {e}")
        
    # 3. Check paper_positions
    try:
        res = supabase.table("paper_positions").select("*").execute()
        print("\n📈 [paper_positions] Active positions:")
        for row in res.data or []:
            print(f"  - {row.get('ticker')}: status={row.get('status')}, entry_price={row.get('entry_price')}, current_price={row.get('current_price')}, units={row.get('units')}")
    except Exception as e:
        print(f"❌ Error reading paper_positions: {e}")
        
    # 4. Check last 5 rows in paper_history
    try:
        res = supabase.table("paper_history").select("*").order("created_at", desc=True).limit(5).execute()
        print("\n📜 [paper_history] Last 5 trades:")
        for row in res.data or []:
            print(f"  - {row.get('ticker')}: entry={row.get('entry_price')}, exit={row.get('exit_price')}, pnl={row.get('pnl_pct') or 0:.2f}%, reason={row.get('exit_reason')}, date={row.get('created_at')}")
    except Exception as e:
        print(f"❌ Error reading paper_history: {e}")
        
    # 5. Check last 5 rows in realtime_signals
    try:
        res = supabase.table("realtime_signals").select("ticker,signal,strength,rsi,adx,rvol,price,timestamp").order("timestamp", desc=True).limit(5).execute()
        print("\n📡 [realtime_signals] Last 5 signals:")
        for row in res.data or []:
            print(f"  - {row.get('ticker')}: {row.get('signal')} ({row.get('strength')}), price={row.get('price')}, rsi={row.get('rsi')}, timestamp={row.get('timestamp')}")
    except Exception as e:
        print(f"❌ Error reading realtime_signals: {e}")

if __name__ == "__main__":
    asyncio.run(main())
