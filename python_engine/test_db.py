import asyncio
from db_manager import get_db


async def main():
    supabase = get_db()

    pos = supabase.table("active_positions").select("*").execute()
    print("=== ACTIVE POSITIONS ===")
    print(pos.data)

    disc = (
        supabase.table("daily_discovery")
        .select("ticker, dna_score, updated_at")
        .order("updated_at", desc=True)
        .limit(5)
        .execute()
    )
    print("=== DAILY DISCOVERY ===")
    print(disc.data)


if __name__ == "__main__":
    asyncio.run(main())
