import asyncio
import os
from dotenv import load_dotenv

load_dotenv(".env")
from state import app_state
from paper_engine import PaperTradingManager
from db_manager import DBManager


async def test_buy():
    # Setup DB
    db = DBManager()
    await db.initialize()
    app_state.supabase = db.client
    app_state.paper_engine = PaperTradingManager(db.client)

    # Enable armed mode
    app_state.SYSTEM_ARMED = True

    print("Executing process_signal...")
    await app_state.paper_engine.process_signal(
        ticker="COPX",
        price=76.9,
        signal_type="BUY",
        strength="STRONG",
        rsi=45.76,
        ai_report="Test",
        is_armed=app_state.SYSTEM_ARMED,
        dna_score=96.9,
        recommended_weight=100.0,
        atr=0.5,
    )

    # Check if position was added
    res = await asyncio.to_thread(
        db.client.table("paper_positions").select("*").eq("ticker", "COPX").execute
    )
    print("Positions after:", res.data)

    # Cleanup
    if res.data:
        await asyncio.to_thread(
            db.client.table("paper_positions").delete().eq("ticker", "COPX").execute
        )


asyncio.run(test_buy())
