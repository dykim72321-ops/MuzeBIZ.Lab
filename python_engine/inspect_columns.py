import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

res = supabase.table("daily_discovery").select("*").limit(1).execute()
if res.data:
    print(f"Columns: {list(res.data[0].keys())}")
else:
    print("No data in table to inspect column names.")
