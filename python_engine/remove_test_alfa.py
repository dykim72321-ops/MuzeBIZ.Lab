import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

test_ticker = "TEST_ALFA"

tables = [
    "watchlist",
    "paper_positions",
    "paper_history",
    "daily_discovery",
    "active_positions",
]
for table in tables:
    try:
        res = supabase.table(table).delete().eq("ticker", test_ticker).execute()
        print(f"Deleted from {table}: {res.data}")
    except Exception as e:
        print(f"Error deleting from {table}: {e}")

print("Done removing TEST_ALFA")
