import asyncio
from scraper import SearchAggregator

async def test():
    print("Testing SearchAggregator...")
    aggregator = SearchAggregator()
    try:
        # Using a timeout to prevent the test script itself from hanging forever
        res = await asyncio.wait_for(aggregator.search_market_intel("TPS54331"), timeout=30)
        print(f"Results: {len(res)} items found.")
    except asyncio.TimeoutError:
        print("Error: SearchAggregator timed out after 30 seconds.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
