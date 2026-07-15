import asyncio
import html as html_lib
import json
import re
from typing import Dict, List, Optional

import aiohttp
from bs4 import BeautifulSoup

from utils.utils import PartNormalizer


class SearchAggregator:
    def __init__(self):
        self.user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        )
        self.base_url = "https://www.findchips.com/search/"

    def _parse_unit_price(self, price_attr: Optional[str], price_text: str) -> float:
        """
        FindChips rows carry the full tiered-price table as a JSON blob in
        data-price (e.g. [[1,"USD","2.6600"],[10,"USD","2.4600"],...]).
        This is far more reliable than parsing the rendered price-list text.
        The unit price is the entry with the lowest quantity break.
        """
        if price_attr:
            try:
                tiers = json.loads(html_lib.unescape(price_attr))
                if tiers:
                    lowest_qty_tier = min(tiers, key=lambda t: t[0])
                    return float(lowest_qty_tier[2])
            except (ValueError, TypeError, json.JSONDecodeError, IndexError):
                pass
        return PartNormalizer.format_price(price_text)

    def _resolve_buy_url(self, row) -> str:
        """
        Reads the buy/product link directly from the raw HTML response.
        IMPORTANT: this must come from the static markup, not a live/JS-rendered
        DOM — FindChips' outbound-click tracking script rewrites these anchors'
        href to a short-lived analytics.supplyframe.com redirect shortly after
        page load, which breaks (or expires) if surfaced later as a stored
        "buy" link. The raw HTML always has the true distributor URL.
        """
        buy_el = row.select_one("a.buy-button") or row.select_one(".part-name a")
        if not buy_el:
            return ""
        href = buy_el.get("href", "")
        if not href:
            return ""
        if href.startswith("//"):
            return "https:" + href
        if href.startswith("/"):
            return "https://www.findchips.com" + href
        return href

    async def search_market_intel(self, mpn: str, depth: int = 0) -> List[Dict]:
        """
        FindChips를 통해 전 세계 유통사의 실시간 재고 및 가격 정보를 통합 수집.
        재고가 없을 경우 'Family Search' (접두어 기반)를 수행하여 대안 제시.

        정적 HTML을 직접 파싱한다 (Playwright/JS 렌더링 미사용).
        FindChips 검색 결과 페이지는 Cloudflare 챌린지 없이 접근 가능하며,
        각 결과 행의 data-mfrpartnumber/data-mfr/data-price/data-instock
        속성에 이미 정제된 데이터가 있어 텍스트 파싱보다 훨씬 정확하다.
        """
        print(
            f"📡 [AGGREGATOR] Hunting Global Intel for MPN: {mpn} (Depth: {depth})..."
        )
        search_q = mpn.strip()
        url = f"{self.base_url}{search_q}"

        try:
            timeout = aiohttp.ClientTimeout(total=20)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    url, headers={"User-Agent": self.user_agent}
                ) as resp:
                    if resp.status != 200:
                        print(f"❌ [AGGREGATOR] HTTP {resp.status} for {url}")
                        return []
                    body = await resp.text()
        except Exception as e:
            print(f"❌ [AGGREGATOR] Request failed: {e}")
            return []

        try:
            soup = BeautifulSoup(body, "html.parser")
            results = []

            for row in soup.select("tr.row"):
                try:
                    actual_mpn = (row.get("data-mfrpartnumber") or "").strip()
                    if not actual_mpn:
                        part_el = row.select_one(".part-name a, a.mpn-link")
                        actual_mpn = part_el.get_text(strip=True) if part_el else ""
                    if not actual_mpn or "Part #" in actual_mpn:
                        continue

                    dist_name_raw = row.get("data-distributor_name", "Other")
                    dist_name = PartNormalizer.normalize_distributor(dist_name_raw)

                    stock_attr = row.get("data-instock") or row.get("data-stock")
                    if stock_attr is not None:
                        stock_num = re.sub(r"[^0-9]", "", stock_attr)
                        stock = int(stock_num) if stock_num else 0
                    else:
                        stock_el = row.select_one("td.td-stock")
                        stock_text = stock_el.get_text(strip=True) if stock_el else "0"
                        stock_num = re.sub(r"[^0-9]", "", stock_text)
                        stock = int(stock_num) if stock_num else 0

                    price_el = row.select_one("td.td-price")
                    price_text = price_el.get_text(" ", strip=True) if price_el else "0"
                    price = self._parse_unit_price(row.get("data-price"), price_text)

                    buy_url = self._resolve_buy_url(row)

                    manufacturer = (row.get("data-mfr") or "").strip()
                    if not manufacturer:
                        mfg_el = row.select_one("td.td-mfg")
                        manufacturer = (
                            mfg_el.get_text(strip=True)
                            if mfg_el
                            else PartNormalizer.guess_manufacturer(actual_mpn)
                        )

                    desc_el = row.select_one(".td-description")
                    spec_text = desc_el.get_text(" ", strip=True) if desc_el else ""
                    package = PartNormalizer.extract_package(spec_text)
                    voltage = PartNormalizer.extract_voltage(spec_text)

                    norm_mpn = PartNormalizer.clean_mpn(actual_mpn)
                    search_norm = PartNormalizer.clean_mpn(mpn)
                    relevance = 0
                    if norm_mpn == search_norm:
                        relevance = 1000
                    elif norm_mpn.startswith(search_norm):
                        relevance = 500
                    elif search_norm in norm_mpn:
                        relevance = 200

                    if (
                        "-EVB" in actual_mpn.upper() or "EVAL" in actual_mpn.upper()
                    ) and ("-EVB" not in mpn.upper() and "EVAL" not in mpn.upper()):
                        relevance -= 300

                    risk_score = PartNormalizer.calculate_risk_score(
                        actual_mpn, stock, "Active"
                    )

                    results.append(
                        {
                            "distributor": dist_name,
                            "mpn": actual_mpn,
                            "normalized_mpn": norm_mpn,
                            "manufacturer": manufacturer,
                            "stock": stock,
                            "price": price,
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
                            "source_type": "Market Aggregator",
                            "product_url": buy_url,
                            "package": package,
                            "voltage": voltage,
                            "description": spec_text,
                        }
                    )
                except Exception:
                    continue

            unique_results = {}
            for r in results:
                key = f"{r['distributor']}_{r['normalized_mpn']}"
                existing = unique_results.get(key)
                if not existing:
                    unique_results[key] = r
                elif r["relevance_score"] == existing["relevance_score"]:
                    if r["stock"] > existing["stock"]:
                        unique_results[key] = r
                elif r["relevance_score"] > existing["relevance_score"]:
                    unique_results[key] = r

            final_list = list(unique_results.values())
            final_list.sort(
                key=lambda x: (
                    -x["relevance_score"],
                    x["stock"] == 0,
                    x["price"] if x["price"] > 0 else float("inf"),
                )
            )

            if len(final_list) == 0 or all(
                r["relevance_score"] < 500 for r in final_list
            ):
                if depth == 0:
                    family_mpn = PartNormalizer.get_base_family(mpn)
                    if family_mpn and family_mpn != mpn:
                        family_results = await self.search_market_intel(
                            family_mpn, depth=depth + 1
                        )
                        for fr in family_results:
                            fr["is_alternative"] = True
                        return final_list + family_results

            return final_list

        except Exception as e:
            print(f"❌ [AGGREGATOR] Critical Failure: {e}")
            return []

    async def get_part_details(self, product_url: str) -> Dict:
        """
        [LAZY LOADING] FindChips' /detail/ pages sit behind a Cloudflare JS
        challenge, so this can never succeed as a live scrape. The useful
        spec fields (description, package, voltage) are already captured
        during search_market_intel() from the results page, which is not
        challenge-protected. Kept as a no-op for API compatibility.
        """
        return {}


class MouserHunter:
    def __init__(self):
        pass

    async def search_mpn(self, mpn: str) -> List[Dict]:
        aggregator = SearchAggregator()
        return await aggregator.search_market_intel(mpn)


if __name__ == "__main__":

    async def test():
        aggregator = SearchAggregator()
        res1 = await aggregator.search_market_intel("TPS54331")
        print(f"\n🔍 [TEST] Results for TPS54331: {len(res1)} items found")
        for r in res1[:5]:
            print(
                f"   - MPN: {r['mpn']}, MFG: {r['manufacturer']}, DIST: {r['distributor']}, "
                f"PRICE: {r['price']}, URL: {r['product_url'][:60]}"
            )
        res2 = await aggregator.search_market_intel("STM32F103")
        print(f"\n🔍 [TEST] Results for STM32F103: {len(res2)} items found")
        for r in res2[:3]:
            print(
                f"   - MPN: {r['mpn']}, MFG: {r['manufacturer']}, DIST: {r['distributor']}"
            )

    asyncio.run(test())
