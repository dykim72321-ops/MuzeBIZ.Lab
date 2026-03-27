import asyncio
from playwright.async_api import async_playwright
import re
from typing import List, Dict
from utils import PartNormalizer


class SearchAggregator:
    def __init__(self):
        self.user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        )
        self.base_url = "https://www.findchips.com/search/"

    async def search_market_intel(self, mpn: str, depth: int = 0) -> List[Dict]:
        """
        FindChips를 통해 전 세계 유통사의 실시간 재고 및 가격 정보를 통합 수집.
        재고가 없을 경우 'Family Search' (접두어 기반)를 수행하여 대안 제시.
        """
        print(
            f"📡 [AGGREGATOR] Hunting Global Intel for MPN: {mpn} (Depth: {depth})..."
        )
        results = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(user_agent=self.user_agent)
                page = await context.new_page()

                search_q = mpn.strip()
                url = f"{self.base_url}{search_q}"

                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception as e:
                    print(f"❌ [AGGREGATOR] Navigation failed: {e}")
                    await browser.close()
                    return []

                try:
                    await page.wait_for_selector(".distributor-results", timeout=5000)
                except Exception:
                    pass

                distributors = await page.query_selector_all(
                    ".distributor-results, .distributor-section"
                )

                for dist in distributors:
                    try:
                        dist_name_raw = ""
                        name_el = await dist.query_selector(
                            ".distributor-name, .distributor-title, .distributor-header a, h3"
                        )
                        if name_el:
                            dist_name_raw = (await name_el.inner_text()).strip()

                        if not dist_name_raw:
                            img_el = await dist.query_selector(
                                ".distributor-header img, img.distributor-logo"
                            )
                            if img_el:
                                dist_name_raw = (
                                    await img_el.get_attribute("alt")
                                    or await img_el.get_attribute("title")
                                    or ""
                                )

                        dist_name = PartNormalizer.normalize_distributor(
                            dist_name_raw or "Other"
                        )

                        rows = await dist.query_selector_all("tr")
                        for row in rows:
                            try:
                                stock_el = await row.query_selector(
                                    "td.td-stock, .stock-info, .inventory"
                                )
                                price_el = await row.query_selector(
                                    "td.td-price, .price-list, .price"
                                )
                                part_el = await row.query_selector(
                                    "td.td-part, .part-number, a.mpn-link"
                                )
                                mfg_el = await row.query_selector(
                                    "td.td-mfg, .mfg-name, .manufacturer"
                                )
                                pkg_el = await row.query_selector(
                                    "td.td-pkg, .package-name"
                                )
                                desc_el = await row.query_selector(
                                    "td.td-description, .td-specs, .description"
                                )

                                if not stock_el and not part_el:
                                    continue

                                stock_text = (
                                    (await stock_el.inner_text()).strip()
                                    if stock_el
                                    else "0"
                                )
                                price_text = (
                                    (await price_el.inner_text()).strip()
                                    if price_el
                                    else "0"
                                )
                                actual_mpn_raw = (
                                    (await part_el.inner_text()).strip()
                                    if part_el
                                    else mpn
                                )

                                actual_mpn = actual_mpn_raw.split("\n")[0].strip()
                                if "Part #" in actual_mpn:
                                    continue

                                stock_num = re.sub(r"[^0-9]", "", stock_text)
                                stock = int(stock_num) if stock_num else 0
                                price = PartNormalizer.format_price(price_text)

                                buy_link_el = await row.query_selector("a[href]")
                                buy_url = ""
                                if buy_link_el:
                                    href = await buy_link_el.get_attribute("href")
                                    if href:
                                        if href.startswith("//"):
                                            buy_url = "https:" + href
                                        elif href.startswith("/"):
                                            buy_url = "https://www.findchips.com" + href
                                        else:
                                            buy_url = href

                                spec_text = (
                                    (await desc_el.inner_text()).strip()
                                    if desc_el
                                    else ""
                                )

                                if actual_mpn:
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
                                        "-EVB" in actual_mpn.upper()
                                        or "EVAL" in actual_mpn.upper()
                                    ) and (
                                        "-EVB" not in mpn.upper()
                                        and "EVAL" not in mpn.upper()
                                    ):
                                        relevance -= 300

                                    risk_score = PartNormalizer.calculate_risk_score(
                                        actual_mpn, stock, "Active"
                                    )

                                    results.append(
                                        {
                                            "distributor": dist_name,
                                            "mpn": actual_mpn,
                                            "normalized_mpn": norm_mpn,
                                            "manufacturer": (
                                                (await mfg_el.inner_text()).strip()
                                                if mfg_el
                                                else PartNormalizer.guess_manufacturer(
                                                    actual_mpn
                                                )
                                            ),
                                            "stock": stock,
                                            "price": price,
                                            "relevance_score": relevance,
                                            "risk_level": (
                                                "High"
                                                if risk_score > 70
                                                else (
                                                    "Medium"
                                                    if risk_score > 30
                                                    else "Low"
                                                )
                                            ),
                                            "risk_score": risk_score,
                                            "lifecycle": PartNormalizer.get_lifecycle_status(
                                                actual_mpn, stock
                                            ),
                                            "source_type": "Market Aggregator",
                                            "product_url": buy_url,
                                            "package": (
                                                (await pkg_el.inner_text()).strip()
                                                if pkg_el
                                                else "N/A"
                                            ),
                                            "description": spec_text,
                                        }
                                    )
                            except Exception:
                                continue
                    except Exception:
                        continue

                await browser.close()

                unique_results = {}
                for r in results:
                    key = f"{r['distributor']}_{r['normalized_mpn']}"
                    if (
                        key not in unique_results
                        or r["relevance_score"] > unique_results[key]["relevance_score"]
                    ):
                        unique_results[key] = r
                    elif r["relevance_score"] == unique_results[key]["relevance_score"]:
                        if r["stock"] > unique_results[key]["stock"]:
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
        if not product_url or "findchips.com" not in product_url:
            return {}

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(user_agent=self.user_agent)
                page = await context.new_page()
                await page.goto(
                    product_url, wait_until="domcontentloaded", timeout=15000
                )
                specs = {}
                rows = await page.query_selector_all(".spec-row, .product-specs tr")
                for row in rows:
                    text = await row.inner_text()
                    if ":" in text:
                        k, v = text.split(":", 1)
                        specs[k.strip()] = v.strip()
                await browser.close()
                return specs
        except Exception as e:
            print(f"⚠️ [LAZY] Detail fetch failed: {e}")
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
        res2 = await aggregator.search_market_intel("STM32F103")
        print(f"\n🔍 [TEST] Results for STM32F103: {len(res2)} items found")
        for r in res2[:3]:
            print(
                f"   - MPN: {r['mpn']}, MFG: {r['manufacturer']}, DIST: {r['distributor']}"
            )

    import sys

    asyncio.run(test())
