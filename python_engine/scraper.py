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


class FinvizHunter:
    def __init__(self):
        self.db = DBManager()
        self.news = NewsManager()
        self.user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

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
                "url": "https://finviz.com/screener.ashx?v=111&f=ta_perf_52wup,ta_relvol_o1.5,ta_volatility_mo3&o=-change",
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
                indicators_summary = (
                    f"Price: ${price:.2f}, RSI: {rsi:.1f}, Change: {change:.2f}%"
                )
            except Exception as e:
                print(f"⚠️ Failed to get technicals for {ticker_symbol}: {e}")
                continue

            # 2. Fetch News
            headlines = self.news.fetch_company_news(ticker_symbol)

            # 3. AI Deep Analysis
            ai_context_ext = (
                f"Detection Source: {stock.get('reason', 'Unknown')}. \n"
                + indicators_summary
            )

            ai_input = {
                "ticker": ticker_symbol,
                "price": price,
                "change": f"{change:.2f}%",
                "indicators": ai_context_ext,
                "news": headlines,
            }
            ai_result = {
                "tags": [ticker_symbol, "QUANT"],
                "bull_case": "자동 분석 기능 비활성화 (순수 퀀트 모드)",
                "bear_case": "자동 분석 기능 비활성화 (순수 퀀트 모드)",
                "reasoning_ko": "OpenAI 모듈이 제거되어 퀀트 지표 기반으로만 탐지되었습니다.",
            }
            # 4. Auto Backtest (1년 RSI 전략)
            from backtester import run_backtest

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

            # 5. Save to DB
            tags_str = " ".join(ai_result.get("tags", []))
            ai_summary_text = (f"{tags_str}\n\n" if tags_str else "") + (
                f"🐂 Bull: {ai_result.get('bull_case')}\n"
                f"🐻 Bear: {ai_result.get('bear_case')}\n\n"
                f"💡 {ai_result.get('reasoning_ko')}"
            )

            db_data = {
                "ticker": ticker_symbol,
                "sector": stock["sector"],
                "price": round(price, 2),
                "volume": str(volume),
                "change": f"{change:.2f}%",
                "dna_score": ai_result.get("dna_score", 50),
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
        self.user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        self.base_url = "https://www.findchips.com/search/"

    async def search_market_intel(self, mpn: str) -> List[Dict]:
        """
        FindChips를 통해 전 세계 유통사의 실시간 재고 및 가격 정보를 통합 수집
        """
        print(f"📡 [AGGREGATOR] Hunting Global Intel for MPN: {mpn} via FindChips...")
        results = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(user_agent=self.user_agent)
                page = await context.new_page()

                url = f"{self.base_url}{mpn}"
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)

                # 유통사별 섹션 렌더링 대기
                try:
                    await page.wait_for_selector(".distributor-results", timeout=15000)
                except Exception as e:
                    print(f"⚠️ [AGGREGATOR] wait_for_selector timeout: {e}")

                # 유통사별 섹션 파싱
                distributors = await page.query_selector_all(".distributor-results")
                print(
                    f"🔍 [AGGREGATOR] Found {len(distributors)} potential distributor sections"
                )

                for dist in distributors:
                    try:
                        name_el = await dist.query_selector(".distributor-name")
                        if not name_el:
                            name_el = await dist.query_selector(".distributor-title")
                        if not name_el:
                            name_el = await dist.query_selector(".distributor-header a")

                        # 텍스트 추출 시도
                        dist_name_raw = (
                            (await name_el.inner_text()).strip() if name_el else ""
                        )

                        # 텍스트가 비어있다면 로고 이미지의 alt 속성 확인 (FindChips는 로고 사용 빈번)
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

                        dist_name = dist_name_raw.strip() if dist_name_raw else "Other"

                        # 주요 유통사 가독성 개선
                        common_dists = [
                            "Mouser",
                            "Digi-Key",
                            "Arrow",
                            "Future",
                            "Farnell",
                            "Avnet",
                            "Newark",
                            "RS Components",
                            "TME",
                            "LCSC",
                        ]
                        match_name = next(
                            (d for d in common_dists if d.lower() in dist_name.lower()),
                            dist_name,
                        )

                        # 부품 정보 행 파싱 (data-mpn 속성이 동적으로 늦게 주입될 수 있으므로 td.td-stock 유무로 판단)
                        rows = await dist.query_selector_all("tr")
                        row = None
                        for r in rows:
                            if await r.query_selector("td.td-stock"):
                                row = r
                                break

                        if not row:
                            continue

                        stock_el = await row.query_selector("td.td-stock")
                        price_el = await row.query_selector("td.td-price")
                        mfr_el = await row.query_selector("td.td-mfg")

                        stock_text = (
                            (await stock_el.inner_text()).strip() if stock_el else "0"
                        )
                        price_text = (
                            (await price_el.inner_text()).strip() if price_el else "0"
                        )
                        mfr_text = (
                            (await mfr_el.inner_text()).strip() if mfr_el else "N/A"
                        )

                        # 데이터 정제
                        stock_num = re.sub(r"[^0-9]", "", stock_text)
                        stock = int(stock_num) if stock_num else 0

                        # 다중 가격 텍스트 안전 파싱 (예: \n으로 구분된 여러 가격 파편 중 첫 번째 유효 숫자 추출)
                        price_match = re.search(
                            r"[\d,]+(?:\.\d+)?",
                            price_text.replace("₩", "").replace("$", ""),
                        )
                        if price_match:
                            try:
                                price = float(price_match.group().replace(",", ""))
                            except:
                                price = 0.0
                        else:
                            price = 0.0

                        if stock > 0 or price > 0:
                            results.append(
                                {
                                    "distributor": match_name,
                                    "mpn": mpn,
                                    "manufacturer": mfr_text,
                                    "stock": stock,
                                    "price": price,
                                    "risk_level": (
                                        "Low"
                                        if stock > 100
                                        else ("Medium" if stock > 0 else "High")
                                    ),
                                    "source_type": "Market Aggregator",
                                }
                            )
                        else:
                            print(
                                f"[DEBUG SKIP] {match_name} - stock_txt: '{stock_text}' -> {stock}, price_txt: '{price_text}' -> {price}"
                            )
                    except:
                        continue

                await browser.close()

                # 중복 유통사 제거 및 최적 데이터 선별
                unique_results = {}
                for r in results:
                    d_key = r["distributor"]
                    if (
                        d_key not in unique_results
                        or r["stock"] > unique_results[d_key]["stock"]
                    ):
                        unique_results[d_key] = r

                final_list = list(unique_results.values())
                print(
                    f"✅ [AGGREGATOR] Successfully aggregated {len(final_list)} distributors for {mpn}"
                )
                return final_list

        except Exception as e:
            print(f"❌ [AGGREGATOR] Critical Failure: {e}")
            return []


class MouserHunter:
    def __init__(self):
        self.user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        self.base_url = "https://www.mouser.kr/Search/Refine?Keyword="

    async def search_mpn(self, mpn: str) -> List[Dict]:
        aggregator = SearchAggregator()
        return await aggregator.search_market_intel(mpn)


if __name__ == "__main__":

    async def test():
        aggregator = SearchAggregator()
        res = await aggregator.search_market_intel("STM32F103")
        print(f"Test Results: {res}")

    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        asyncio.run(test())
    else:
        hunter = FinvizHunter()
        asyncio.run(hunter.scrape())
