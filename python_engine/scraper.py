import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from datetime import datetime
from db_manager import DBManager
from news_manager import NewsManager
import yfinance as yf
import ta
import pandas as pd
from sklearn.ensemble import IsolationForest
import random
import re
from typing import List, Dict
import json
from backtester import run_backtest
from utils import PartNormalizer


class FinvizHunter:
    def __init__(self):
        self.db = DBManager()
        self.news = NewsManager()
        self.user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        )

        # S&P 500 등 기준 유니버스 (Anomaly Hunting용 기본 풀)
        self.base_universe = [
            "AAPL",
            "MSFT",
            "GOOGL",
            "AMZN",
            "NVDA",
            "META",
            "TSLA",
            "BRK-B",
            "JNJ",
            "V",
            "JPM",
            "PG",
            "UNH",
            "HD",
            "MA",
            "DIS",
            "PYPL",
            "VZ",
            "ADBE",
            "NFLX",
            "INTC",
            "CMCSA",
            "PFE",
            "CSCO",
            "PEP",
            "KO",
            "MRK",
            "ABT",
            "CRM",
            "AVGO",
            "COST",
            "T",
            "WMT",
            "MCD",
            "MDT",
            "NKE",
            "TXN",
            "HON",
            "UNP",
            "QCOM",
        ]

    def get_discovery_mode(self):
        day = datetime.now().weekday()  # 0: Mon, 6: Sun
        modes = [
            {
                "name": "🚀 모멘텀 폭발 (상승 추세 + 거래량)",
                "url": (
                    "https://finviz.com/screener.ashx?v=111"
                    "&f=ta_perf_52wup,ta_relvol_o1.5,ta_volatility_mo3&o=-change"
                ),
            },  # Mon
            {
                "name": "🏛️ 기관 매집 (기관 비중 10% 이상 + 거래량 상위)",
                "url": "https://finviz.com/screener.ashx?v=111&f=sh_instown_o10,ta_relvol_o1&o=-volume",
            },  # Tue
            {
                "name": "💎 세력 매집 (기관 & 내부자 동반 매수)",
                "url": "https://finviz.com/screener.ashx?v=111&f=sh_insiderown_o5,sh_instown_o5&o=-volume",
            },  # Wed
            {
                "name": "🔥 숏 스퀴즈 후보 (높은 숏 비중 + 반등 시그널)",
                "url": "https://finviz.com/screener.ashx?v=111&f=sh_short_o15,ta_rsi_u40&o=-volume",
            },  # Thu
            {
                "name": "🌟 저평가 성장주 (P/E 20이하 + 매출 성장)",
                "url": "https://finviz.com/screener.ashx?v=111&f=fa_eps5y_pos,fa_pe_u20,fa_sales5y_pos&o=-volume",
            },  # Fri
            {
                "name": "🌊 과매도 반등 (RSI 바닥 탈출)",
                "url": "https://finviz.com/screener.ashx?v=111&f=ta_rsi_u30,ta_relvol_o1&o=-volume",
            },  # Sat
            {
                "name": "🎯 유동성 대장 (Rel Vol 2.0 이상 조용한 매집)",
                "url": "https://finviz.com/screener.ashx?v=111&f=ta_relvol_o2,ta_volatility_mo2&o=-volume",
            },  # Sun
        ]
        return modes[day]

    def _run_anomaly_hunter(self) -> list:
        """
        Track B: Isolation Forest를 이용한 비정상 수급/변동성 탐지 (Anomaly Hunter)
        """
        print("🕵️♂️ Starting Track B: Anomaly Hunter (Isolation Forest)...")
        data_records = []

        for ticker in self.base_universe:
            try:
                tk = yf.Ticker(ticker)
                hist = tk.history(period="3mo")
                if len(hist) < 30:
                    continue

                # 피처 엔지니어링 (다차원 데이터 구성)
                close_prices = hist["Close"]
                volumes = hist["Volume"]

                # 1. 20일 거래량 변화율
                vol_change = volumes.iloc[-5:].mean() / (
                    volumes.iloc[-20:-5].mean() + 1e-9
                )

                # 2. RSI (14일)
                rsi = ta.momentum.RSIIndicator(close_prices).rsi().iloc[-1]

                # 3. 일간 변동성 (최근 20일)
                returns = close_prices.pct_change().dropna()
                volatility = returns.tail(20).std()

                # 4. 가격 모멘텀 (20일)
                momentum = (close_prices.iloc[-1] / close_prices.iloc[-20]) - 1

                if (
                    not pd.isna(vol_change)
                    and not pd.isna(rsi)
                    and not pd.isna(volatility)
                    and not pd.isna(momentum)
                ):
                    data_records.append(
                        {
                            "ticker": ticker,
                            "vol_change": vol_change,
                            "rsi": rsi,
                            "volatility": volatility,
                            "momentum": momentum,
                        }
                    )
            except Exception as e:
                print(f"⚠️ Anomaly extraction failed for {ticker}: {e}")

        if len(data_records) < 10:
            print("⚠️ Not enough data for Anomaly Hunting.")
            return []

        df = pd.DataFrame(data_records)
        features = df[["vol_change", "rsi", "volatility", "momentum"]].values

        # Isolation Forest 모델 적용 (가장 이질적인 5% 추출)
        model = IsolationForest(contamination=0.05, random_state=42)
        model.fit(features)

        # -1은 이상치(Anomaly), 1은 정상(Normal)
        df["anomaly"] = model.predict(features)

        # 이상치로 판별된 종목 리스트 반환
        anomalies = df[df["anomaly"] == -1]

        results = []
        for _, row in anomalies.iterrows():
            results.append(
                {
                    "ticker": row["ticker"],
                    "sector": "Anomaly (AI Detected)",
                    "reason": f"Vol Change: {row['vol_change']:.2f}x, RSI: {row['rsi']:.1f}",
                }
            )

        print(f"🎯 Anomaly Hunter found {len(results)} outlier stocks.")
        return results

    async def _run_finviz_scraper(self) -> list:
        """
        Track A: 기존 Finviz 스크래핑 로직 (Trend Follower)
        """
        mode = self.get_discovery_mode()
        print(f"🚀 Track A Launched: [{mode['name']}]")
        results = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(user_agent=self.user_agent)
                page = await context.new_page()
                await Stealth().apply_stealth_async(page)

                print(f"🌐 Navigating to {mode['url']}")
                await page.goto(
                    mode["url"], wait_until="domcontentloaded", timeout=60000
                )

                try:
                    await page.wait_for_selector(
                        'table[width="100%"] tr[valign="top"]', timeout=15000
                    )
                except Exception as e:
                    print(f"⚠️ No results found or selector changed: {e}")
                    await browser.close()
                    return []

                stocks = await page.evaluate(
                    """() => {
                    const rows = Array.from(document.querySelectorAll('table[width="100%"] tr[valign="top"]'));
                    return rows.slice(0, 5).map(row => { // 5개로 축소하여 Anomaly와 합칠 여유 확보
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 10) return null;
                        return {
                            ticker: cells[1].innerText.trim(),
                            sector: cells[3].innerText.trim(),
                            reason: "Finviz Screened"
                        };
                    }).filter(item => item !== null);
                }"""
                )
                results = stocks
                await browser.close()
                return results
        except Exception as e:
            print(f"❌ Scraper critical failure: {e}")
            return []

    async def scrape(self):
        print("⚙️ Starting Hybrid Quant Funnel (Dual-Track Stage 1)...")

        # 1. 듀얼 트랙 실행
        # Track A: Finviz (비동기)
        finviz_candidates = await self._run_finviz_scraper()

        # Track B: Isolation Forest (동기 연산이므로 asyncio.to_thread로 오프로드)
        anomaly_candidates = await asyncio.to_thread(self._run_anomaly_hunter)

        # 두 결과 병합 및 중복 제거
        combined_candidates = list(
            {c["ticker"]: c for c in finviz_candidates + anomaly_candidates}.values()
        )

        print(
            f"✅ Stage 1 Complete. Total Unique Candidates: {len(combined_candidates)}. Starting Deep Analysis..."
        )

        for stock in combined_candidates:
            ticker_symbol = stock["ticker"]
            print(f"\n🔍 Analyzing {ticker_symbol} [{stock.get('reason', '')}]...")

            # 1. Technical Indicators (using yfinance)
            try:
                # 지터(Jitter) 추가: 요청 간 랜덤 딜레이 스로틀링 (Rate Limit 방어)
                await asyncio.sleep(random.uniform(0.5, 1.5))

                tk = yf.Ticker(ticker_symbol)
                # I/O 블로킹 방지를 위해 to_thread 사용
                df = await asyncio.to_thread(tk.history, period="1mo")
                if df is None or df.empty:
                    continue

                price = df["Close"].iloc[-1]
                change = (
                    (df["Close"].iloc[-1] / df["Close"].iloc[-2] - 1) * 100
                    if len(df) > 1
                    else 0
                )
                volume = int(df["Volume"].iloc[-1])

                rsi = ta.momentum.RSIIndicator(close=df["Close"]).rsi().iloc[-1]
            except Exception as e:
                print(f"⚠️ Failed to get technicals for {ticker_symbol}: {e}")
                continue

            # 2. Fetch News (Optional, can be used for sentiment later)
            self.news.fetch_company_news(ticker_symbol)

            # 3. Mathematical Quant Analysis (Replacing AI)
            ma20 = df["Close"].rolling(window=20).mean().iloc[-1]
            ma20_dist = ((price / ma20) - 1) * 100 if not pd.isna(ma20) else 0.0

            # Simple historical win rate simulation (if similar RSI and MA dist occurred)
            # Find past instances in the 3mo data
            hist_df = df.copy()
            hist_df["MA20"] = hist_df["Close"].rolling(20).mean()
            hist_df["MA20_Dist"] = (hist_df["Close"] / hist_df["MA20"] - 1) * 100
            hist_df["RSI"] = ta.momentum.RSIIndicator(close=hist_df["Close"]).rsi()

            # Define "similar" conditions: RSI within +/- 5, MA20_Dist within +/- 2%
            similar_cases = hist_df[
                (hist_df["RSI"] >= rsi - 5)
                & (hist_df["RSI"] <= rsi + 5)
                & (hist_df["MA20_Dist"] >= ma20_dist - 2)
                & (hist_df["MA20_Dist"] <= ma20_dist + 2)
            ]

            # Calculate win rate after 5 days
            wins = 0
            valid_cases = 0
            for idx in similar_cases.index[:-5]:  # exclude last 5 days
                loc = hist_df.index.get_loc(idx)
                if loc + 5 < len(hist_df):
                    future_price = hist_df["Close"].iloc[loc + 5]
                    current_price = hist_df["Close"].iloc[loc]
                    if future_price > current_price:
                        wins += 1
                    valid_cases += 1

            win_rate = (wins / valid_cases * 100) if valid_cases > 0 else 0.0

            quant_data = {
                "math_mode": True,
                "ma20_distance_pct": round(ma20_dist, 2),
                "rsi_14": round(rsi, 2),
                "historical_win_rate_pct": round(win_rate, 1),
                "similar_historical_cases": valid_cases,
                "volatility_20d_pct": round(
                    df["Close"].pct_change().tail(20).std() * 100, 2
                ),
                "volume_surge_multiplier": round(
                    volume / (df["Volume"].tail(20).mean() + 1), 2
                ),
            }

            # 4. Auto Backtest (1년 RSI 전략)

            backtest_result = await asyncio.to_thread(
                run_backtest, ticker_symbol, period="1y"
            )
            backtest_return = None
            if "error" not in backtest_result:
                backtest_return = backtest_result.get("total_return_pct", 0)
                print(f"📈 Backtest: {ticker_symbol} → {backtest_return:.2f}% (1Y RSI)")
            else:
                print(
                    f"⚠️ Backtest skipped for {ticker_symbol}: {backtest_result.get('error')}"
                )

            # 5. Save to DB (Save as JSON string for frontend to parse)

            ai_summary_text = json.dumps(quant_data)

            db_data = {
                "ticker": ticker_symbol,
                "sector": stock["sector"],
                "price": round(price, 2),
                "volume": str(volume),
                "change": f"{change:.2f}%",
                "dna_score": (
                    int(rsi) if not pd.isna(rsi) else 50
                ),  # Map RSI to DNA for quant mode
                "ai_summary": ai_summary_text,
                "backtest_return": backtest_return,
                "updated_at": datetime.now().isoformat(),
            }

            self.db.upsert_discovery(db_data)
            print(
                f"💾 Saved {ticker_symbol} (DNA: {db_data['dna_score']}, BT: {backtest_return}%)"
            )

            await asyncio.sleep(1)  # Be polite


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

                # Wait for the first distributor result to appear (more efficient than a hard wait)
                try:
                    await page.wait_for_selector(".distributor-results", timeout=5000)
                except Exception:
                    # If not found after 5s, continue and try to parse anyway
                    pass

                # 유통사별 섹션 파싱
                distributors = await page.query_selector_all(".distributor-results")

                for dist in distributors:
                    try:
                        dist_name_raw = ""
                        name_el = await dist.query_selector(
                            ".distributor-name, .distributor-title, .distributor-header a"
                        )
                        if name_el:
                            dist_name_raw = (await name_el.inner_text()).strip()

                        if not dist_name_raw:
                            img_el = await dist.query_selector(
                                ".distributor-header img"
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
                                    "td.td-stock, .stock-info"
                                )
                                price_el = await row.query_selector(
                                    "td.td-price, .price-list"
                                )
                                part_el = await row.query_selector(
                                    "td.td-part, .td-part"
                                )
                                mfg_el = await row.query_selector(
                                    "td.td-mfg, .td-mfg, .mfg-name"
                                )
                                pkg_el = await row.query_selector(
                                    "td.td-pkg, .td-pkg, .package-name"
                                )
                                desc_el = await row.query_selector(
                                    "td.td-description, .td-description, td.td-specs, .td-specs, .specs-info"
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
                                actual_mpn = (
                                    actual_mpn_raw.split("DISTI")[0]
                                    .split("\n")[0]
                                    .strip()
                                )

                                if "Part #" in actual_mpn:
                                    continue

                                stock_num = re.sub(r"[^0-9]", "", stock_text)
                                stock = int(stock_num) if stock_num else 0
                                price = PartNormalizer.format_price(price_text)

                                buy_link_el = await row.query_selector(
                                    "a[href*='/buy/'], a[href*='track'], td.td-price a"
                                )
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

                                mfg_text = (
                                    (await mfg_el.inner_text()).strip()
                                    if mfg_el
                                    else ""
                                )
                                pkg_text = (
                                    (await pkg_el.inner_text()).strip()
                                    if pkg_el
                                    else "N/A"
                                )
                                spec_text = (
                                    (await desc_el.inner_text()).strip()
                                    if desc_el
                                    else ""
                                )

                                # Heuristic: If dedicated package cell is missing, try to find it in description
                                final_package = (
                                    pkg_text if pkg_text and pkg_text != "N/A" else ""
                                )
                                if not final_package:
                                    # Look for common package patterns in description
                                    # (flexible match including prefixes like 64LQFP)
                                    pkg_match = re.search(
                                        r"([a-z0-9-]* (?:SOIC|SOP|SSOP|TSSOP|HTSSOP|QFP|LQFP|TQFP|"
                                        r"BGA|DIP|SOT|TO-\d+|VSSOP|MSOP|SC-\d+)[a-z0-9-]*)",
                                        spec_text,
                                        re.IGNORECASE,
                                    )
                                    if not pkg_match:
                                        # Try without space
                                        pkg_match = re.search(
                                            r"([a-z0-9-]*(?:SOIC|SOP|SSOP|TSSOP|HTSSOP|QFP|LQFP|TQFP|"
                                            r"BGA|DIP|SOT|TO-\d+|VSSOP|MSOP|SC-\d+)[a-z0-9-]*)",
                                            spec_text,
                                            re.IGNORECASE,
                                        )

                                    if pkg_match:
                                        final_package = (
                                            pkg_match.group(0).strip().upper()
                                        )
                                    else:
                                        # Try another common pattern: at the end of a comma-separated list
                                        parts = [
                                            p.strip() for p in spec_text.split(",")
                                        ]
                                        if (
                                            parts
                                            and len(parts[-1]) < 15
                                            and any(c.isdigit() for c in parts[-1])
                                        ):
                                            final_package = parts[-1]

                                if not final_package or final_package == "N/A":
                                    final_package = "N/A"

                                if actual_mpn:
                                    # Clean manufacturer encoding artifacts
                                    mfg_clean = re.sub(
                                        r"[^\x00-\x7F]+", " ", mfg_text
                                    ).strip()
                                    manufacturer = (
                                        mfg_clean
                                        or PartNormalizer.guess_manufacturer(actual_mpn)
                                    )

                                    risk_score = PartNormalizer.calculate_risk_score(
                                        actual_mpn, stock, "Active"
                                    )
                                    market_notes = PartNormalizer.generate_market_notes(
                                        actual_mpn, stock, price, "Active"
                                    )

                                    results.append(
                                        {
                                            "distributor": dist_name,
                                            "mpn": actual_mpn,
                                            "normalized_mpn": PartNormalizer.clean_mpn(
                                                actual_mpn
                                            ),
                                            "manufacturer": manufacturer,
                                            "stock": stock,
                                            "price": price,
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
                                            "market_notes": market_notes,
                                            "lifecycle": PartNormalizer.get_lifecycle_status(
                                                actual_mpn, stock
                                            ),
                                            "source_type": "Market Aggregator",
                                            "product_url": buy_url,
                                            "is_alternative": depth > 0,
                                            "package": final_package,
                                            "description": spec_text,
                                        }
                                    )
                            except Exception:
                                continue
                    except Exception:
                        continue

                await browser.close()

                # Deduplicate and prioritize better matches
                unique_results = {}
                search_q_norm = PartNormalizer.clean_mpn(mpn)

                for r in results:
                    # HEURISTIC: Skip parts that don't even contain the searched string
                    # (prevents too broad generic matches)
                    if search_q_norm not in r["normalized_mpn"]:
                        continue

                    key = f"{r['distributor']}_{r['normalized_mpn']}"
                    if key not in unique_results:
                        unique_results[key] = r
                    else:
                        existing = unique_results[key]
                        # Prefer results with non-zero price, or higher stock if prices are equal/zero
                        if (
                            (r["price"] > 0 and existing["price"] == 0)
                            or (r["price"] > 0 and r["price"] < existing["price"])
                            or (
                                r["price"] == existing["price"]
                                and r["stock"] > existing["stock"]
                            )
                        ):
                            unique_results[key] = r

                final_list = list(unique_results.values())

                # Sort: Exact match first, then by stock/price
                def rank_result(r):
                    score = 0
                    r_mpn = r["mpn"].upper()
                    q_up = mpn.strip().upper()

                    if r_mpn == q_up:
                        score -= 1000  # Highest priority
                    elif r_mpn.startswith(q_up):
                        score -= 500

                    # Deprioritize Evaluation Boards if the original query wasn't an EVB
                    if ("-EVB" in r_mpn or "EVAL" in r_mpn) and (
                        "-EVB" not in q_up and "EVAL" not in q_up
                    ):
                        score += 800

                    return score

                final_list.sort(key=rank_result)

                # RECURSIVE FALLBACK: If no stock found for exact MPN, search for its family
                if len(final_list) > 0:
                    total_stock = sum(r["stock"] for r in final_list)
                    if total_stock == 0 and depth == 0:
                        family_mpn = PartNormalizer.get_base_family(mpn)
                        if family_mpn and family_mpn != mpn:
                            print(
                                f"⚠️ [AGGREGATOR] Exact Match '{mpn}' is OOS. "
                                f"Trying Family Search for '{family_mpn}'..."
                            )
                            family_results = await self.search_market_intel(
                                family_mpn, depth=depth + 1
                            )
                            # Merge but flag them as alternatives
                            return final_list + family_results

                print(f"✅ [AGGREGATOR] Returning {len(final_list)} results for {mpn}")
                return final_list

        except Exception as e:
            print(f"❌ [AGGREGATOR] Critical Failure: {e}")
            return []


class MouserHunter:
    def __init__(self):
        pass

    async def search_mpn(self, mpn: str) -> List[Dict]:
        aggregator = SearchAggregator()
        return await aggregator.search_market_intel(mpn)


if __name__ == "__main__":

    async def test():
        aggregator = SearchAggregator()
        # Test 1: TPS54331
        res1 = await aggregator.search_market_intel("TPS54331")
        print(f"\n🔍 [TEST] Results for TPS54331: {len(res1)} items found")

        # Test 2: STM32
        res2 = await aggregator.search_market_intel("STM32F103")
        print(f"\n🔍 [TEST] Results for STM32F103: {len(res2)} items found")
        for r in res2[:3]:
            print(
                f"   - MPN: {r['mpn']}, MFG: {r['manufacturer']}, DIST: {r['distributor']}"
            )
        # Test 3: LM358 (Generic/TI/ST)
        res3 = await aggregator.search_market_intel("LM358")
        print(f"\n🔍 [TEST] Results for LM358: {len(res3)} items found")
        for r in res3[:3]:
            print(f"   - MPN: {r['mpn']}, MFG: {r['manufacturer']}")

    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        asyncio.run(test())
    else:
        hunter = FinvizHunter()
        asyncio.run(hunter.scrape())
