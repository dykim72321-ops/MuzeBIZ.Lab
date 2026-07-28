import aiohttp
from typing import Dict, List
import asyncio
from utils.utils import PartNormalizer


class LcscScraper:
    def __init__(self):
        self.url = "https://wmsc.lcsc.com/ftc/search"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
        }

    async def search_market_intel(self, mpn: str) -> List[Dict]:
        """
        Queries LCSC's public search API and returns results in the standard dictionary format.
        """
        print(f"📡 [LCSC] Searching for: {mpn}")
        payload = {"keyword": mpn, "currentPage": 1, "pageSize": 10}

        results = []
        try:
            timeout = aiohttp.ClientTimeout(total=3)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    self.url, json=payload, headers=self.headers
                ) as resp:
                    if resp.status != 200:
                        print(f"❌ [LCSC] API failed with status {resp.status}")
                        return []
                    data = await resp.json()

            record_list = data.get("result", {}).get("productRecordList", [])
            search_norm = PartNormalizer.clean_mpn(mpn)

            for item in record_list:
                actual_mpn = item.get("productModel", "")
                if not actual_mpn:
                    continue

                manufacturer = (
                    item.get("brandNameEn") or item.get("brandNameZh") or "Unknown"
                )
                stock = item.get("number", 0)

                prices = item.get("productPriceList", [])
                price = 0.0
                if prices:
                    # Lowest tier price
                    lowest_tier = min(
                        prices, key=lambda x: x.get("ladder", float("inf"))
                    )
                    price = float(lowest_tier.get("productPrice", 0.0))

                norm_mpn = PartNormalizer.clean_mpn(actual_mpn)

                relevance = 0
                if norm_mpn == search_norm:
                    relevance = 1000
                elif norm_mpn.startswith(search_norm):
                    relevance = 500
                elif search_norm in norm_mpn:
                    relevance = 200

                risk_score = PartNormalizer.calculate_risk_score(
                    actual_mpn, stock, "Active"
                )

                # Try to extract package
                package = item.get("encapStandard", "")
                description = item.get("productDescEn", "")
                voltage = PartNormalizer.extract_voltage(description)
                datasheet = item.get("pdfUrl", "")

                delivery = "1-2 Days" if stock > 0 else "Check Lead Time"
                product_url = f"https://www.lcsc.com/search?q={actual_mpn}"

                results.append(
                    {
                        "distributor": "LCSC",
                        "mpn": actual_mpn,
                        "normalized_mpn": norm_mpn,
                        "manufacturer": manufacturer,
                        "stock": stock,
                        "price": price,
                        "currency": "USD",
                        "delivery": delivery,
                        "relevance_score": relevance,
                        "risk_level": (
                            "High"
                            if risk_score > 70
                            else ("Medium" if risk_score > 30 else "Low")
                        ),
                        "risk_score": risk_score,
                        "lifecycle": PartNormalizer.get_lifecycle_status(
                            actual_mpn, stock
                        ),
                        "source_type": "LCSC Direct",
                        "product_url": product_url,
                        "package": package or "N/A",
                        "voltage": voltage or "N/A",
                        "description": description,
                        "datasheet": datasheet,
                    }
                )

            return results

        except Exception as e:
            print(f"❌ [LCSC] Search error: {e}")
            return []


if __name__ == "__main__":

    async def test():
        scraper = LcscScraper()
        res = await scraper.search_market_intel("CH340G")
        for r in res[:3]:
            print(f"MPN: {r['mpn']}, Stock: {r['stock']}, Price: {r['price']}")

    asyncio.run(test())
