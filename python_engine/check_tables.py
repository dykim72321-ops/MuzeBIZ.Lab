import os
import asyncio
from supabase import create_client, Client
from dotenv import load_dotenv

# .env 파일에서 환경변수 로드
load_dotenv(dotenv_path=".env.local")
load_dotenv(dotenv_path=".env")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
)

async def check_tables():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Missing Supabase credentials")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    tables = ["paper_account", "paper_positions", "paper_history"]
    for table in tables:
        try:
            res = await asyncio.to_thread(supabase.table(table).select("*").limit(1).execute)
            print(f"✅ Table '{table}' exists and is accessible.")
        except Exception as e:
            print(f"❌ Table '{table}' error: {e}")

if __name__ == "__main__":
    asyncio.run(check_tables())
