import asyncio
import os
import resource
import datetime
from dotenv import load_dotenv

load_dotenv()


async def run_memory_test():
    print("--- Memory Leak Test Start ---")

    def print_mem(label):
        # rusage_self returns ru_maxrss in bytes on macOS, or kilobytes on Linux.
        # Since the user is on mac, it's bytes.
        rss_bytes = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        rss_mb = rss_bytes / 1024 / 1024
        print(f"[{label}] RSS Memory: {rss_mb:.2f} MB")
        return rss_mb

    print_mem("Initial")

    from services.market_data import MTFCache
    from app.main import run_quant_scan_internal, app_state

    print_mem("After Imports")

    print("\n>>> Testing MTFCache (15m schedule equivalent) <<<")
    cache = MTFCache()
    test_tickers = [
        "AAPL",
        "MSFT",
        "GOOGL",
        "AMZN",
        "META",
        "TSLA",
        "NVDA",
        "TFFI",
        "NWTG",
        "INTJ",
        "KBUF",
        "SAAQ",
        "AXINU",
        "BSAA",
        "UCOP",
        "PCLG",
        "TEXU",
        "BFIX",
        "OILT",
        "EHLS",
        "GKAT",
    ]

    for i in range(3):
        print(f"\n--- MTFCache Iteration {i+1} ---")
        await cache.update_cache(test_tickers)
        print_mem(f"MTFCache Iter {i+1}")

    print("\n>>> Testing Quant Scan (4h schedule equivalent) <<<")
    for i in range(2):
        print(f"\n--- Quant Scan Iteration {i+1} ---")
        await run_quant_scan_internal()
        print_mem(f"Quant Scan Iter {i+1}")

    print("\n--- Test Complete ---")
    print_mem("Final")


if __name__ == "__main__":
    asyncio.run(run_memory_test())
