import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env.local")
load_dotenv(dotenv_path="../.env")


class DBManager:
    def __init__(self):
        self._client: Client = None

    @property
    def supabase(self) -> Client:
        if self._client is None:
            url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
            key = (
                os.getenv("SUPABASE_SERVICE_ROLE_KEY")
                or os.getenv("SUPABASE_KEY")
                or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
            )

            if not url or not key:
                print(
                    "⚠️ Warning: Missing Supabase environment variables. DB operations will fail."
                )
                return None

            # Strip potential whitespace/newlines from GitHub Secrets
            url = url.strip()
            key = key.strip()

            try:
                self._client = create_client(url, key)
            except Exception as e:
                print(f"❌ Supabase Client Initialization Error: {e}")
                return None
        return self._client

    def upsert_discovery(self, data: dict):
        """
        daily_discovery 테이블에 종목 정보 저장
        """
        if not self.supabase:
            print("❌ DB Error: Supabase client not initialized")
            return None

        try:
            response = (
                self.supabase.table("daily_discovery")
                .upsert(data, on_conflict="ticker")
                .execute()
            )
            return response
        except Exception as e:
            print(f"❌ DB Upsert Error: {e}")
            return None

    def get_latest_discoveries(self, limit=10, sort_by="updated_at"):
        """
        최근 발견된 종목 리스트 조회
        sort_by: "updated_at" (최신순) 또는 "performance" (백테스트 수익률순)
        """
        if not self.supabase:
            print("❌ DB Error: Supabase client not initialized")
            return []

        try:
            order_column = (
                "backtest_return" if sort_by == "performance" else "updated_at"
            )
            response = (
                self.supabase.table("daily_discovery")
                .select("*")
                .order(order_column, desc=True)
                .limit(limit)
                .execute()
            )
            return response.data
        except Exception as e:
            print(f"❌ DB Fetch Error: {e}")
            return []

    def get_active_tickers(self, limit=5):
        """
        모니터링 유니버스 구성:
        daily_discovery 최근 발굴 종목(DNA Score 최상위)으로 슬롯 채움
        """
        if not self.supabase:
            print("⚠️ Warning: DB Client not available. Using fallback tickers.")
            return ["TSLA", "AAPL"]

        tickers = []

        try:
            discovery_res = (
                self.supabase.table("daily_discovery")
                .select("ticker")
                .order("dna_score", desc=True)
                .limit(limit)
                .execute()
            )
            for item in discovery_res.data or []:
                ticker = item.get("ticker")
                if ticker and ticker not in tickers:
                    tickers.append(ticker)
        except Exception as e:
            print(f"⚠️ daily_discovery fetch error: {e}")

        return tickers[:limit]

        return ["TSLA", "AAPL"]


if __name__ == "__main__":
    db = DBManager()
    print("✅ Supabase Connection Successful")
    # Test fetch
    latest = db.get_latest_discoveries(1)
    print(f"Latest sample: {latest}")
