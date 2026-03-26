import os
from supabase import create_client
from dotenv import load_dotenv


def get_monitored_stocks():
    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("❌ Error: Supabase credentials not found.")
        return []

    supabase = create_client(url, key)
    res = (
        supabase.table("daily_discovery")
        .select("ticker, dna_score")
        .order("dna_score", desc=True)
        .limit(5)
        .execute()
    )
    return res.data


if __name__ == "__main__":
    stocks = get_monitored_stocks()
    if stocks:
        print("🔍 Monitored stocks found:")
        for s in stocks:
            print(f"- {s['ticker']} (DNA: {s['dna_score']})")
    else:
        print("⚠️ No stocks found in monitoring orbit.")
