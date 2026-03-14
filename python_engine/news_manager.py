import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env.local")
load_dotenv(dotenv_path="../.env")


class NewsManager:
    def __init__(self):
        self.api_key = os.getenv("VITE_FINNHUB_API_KEY")

    def fetch_company_news(self, ticker: str, days_back=7):
        """
        Finnhub API를 사용하여 특정 종목의 최근 뉴스 헤드라인을 가져옴
        """
        if not self.api_key:
            print("⚠️ Finnhub API Key is missing. Skipping news fetch.")
            return []

        try:
            today = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=days_back)).strftime(
                "%Y-%m-%d"
            )

            params = {
                "symbol": ticker,
                "from": start_date,
                "to": today,
                "token": self.api_key,
            }
            url = "https://finnhub.io/api/v1/company-news"
            response = requests.get(url, params=params)

            if response.status_code != 200:
                return []

            news = response.json()
            # 상위 5개 헤드라인만 반환 (AI 토큰 절약)
            return [item.get("headline") for item in news[:5]]
        except Exception as e:
            print(f"❌ News Fetch Error for {ticker}: {e}")
            return []


if __name__ == "__main__":
    nm = NewsManager()
    news = nm.fetch_company_news("AAPL")
    print(f"✅ AAPL News: {news}")
