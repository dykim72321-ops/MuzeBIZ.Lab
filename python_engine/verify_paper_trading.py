import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client
from paper_engine import PaperTradingManager

load_dotenv()
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)


async def test_paper_trading():
    engine = PaperTradingManager(supabase)
    await engine.initialize_account()

    test_ticker = "TEST_ALFA"

    # 1. Clean up existing test positions/history
    supabase.table("paper_positions").delete().eq("ticker", test_ticker).execute()
    supabase.table("paper_history").delete().eq("ticker", test_ticker).execute()

    print("--- [TEST] 1. Auto Buy (STRONG BUY, DNA 86, Price $10.00) ---")
    await engine.process_signal(
        ticker=test_ticker,
        price=10.00,
        signal_type="BUY",
        strength="STRONG",
        rsi=45.0,
        ai_report="TEST BUY",
        is_armed=True,
        dna_score=86.0,
        recommended_weight=15.0,
        atr=0.5,
    )

    pos = await engine.get_position(test_ticker)
    if pos:
        print(f"✅ Position Created: {pos['units']} units at ${pos['entry_price']}")
    else:
        print("❌ Position NOT created.")
        return

    print("\n--- [TEST] 2. Auto Scale-Out (RSI 65, Price $12.00) ---")
    await engine.process_signal(
        ticker=test_ticker,
        price=12.00,
        signal_type="HOLD",
        strength="NORMAL",
        rsi=65.0,
        ai_report="TEST SCALE OUT",
        is_armed=True,
        dna_score=86.0,
        recommended_weight=15.0,
        atr=0.5,
    )

    pos = await engine.get_position(test_ticker)
    if pos and pos["is_scaled_out"]:
        print(
            f"✅ Position Scaled Out. Remaining units: {pos['units']}, TS Threshold: {pos['ts_threshold']}"
        )
    else:
        print("❌ Position NOT scaled out properly.")
        return

    print("\n--- [TEST] 3. Auto Trailing Stop / Sell (Price drops to $9.00) ---")
    # Simulate cooldown by directly updating DB
    supabase.table("paper_positions").update({"scale_out_bar_count": 5}).eq(
        "ticker", test_ticker
    ).execute()

    await engine.process_signal(
        ticker=test_ticker,
        price=9.00,  # Drop below TS
        signal_type="HOLD",
        strength="NORMAL",
        rsi=40.0,
        ai_report="TEST DROP",
        is_armed=True,
        dna_score=86.0,
        recommended_weight=15.0,
        atr=0.5,
    )

    pos = await engine.get_position(test_ticker)
    if not pos:
        print("✅ Position successfully closed.")
    else:
        print("❌ Position NOT closed.")

    # Check history
    res = (
        supabase.table("paper_history").select("*").eq("ticker", test_ticker).execute()
    )
    print("\n--- Trade History ---")
    for r in res.data:
        print(
            f"Reason: {r['exit_reason']}, Exit Price: ${r['exit_price']}, PnL: ${r['profit_amt']}"
        )


if __name__ == "__main__":
    asyncio.run(test_paper_trading())
