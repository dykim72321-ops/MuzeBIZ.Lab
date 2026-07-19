import os
from datetime import datetime, timedelta, timezone
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
                .not_.is_("dna_score", "null")
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

    def get_watchlist_tickers(self, limit=30):
        """
        매수 전 관심종목(watchlist status=WATCHING, 엔진 자동 등록분)의 실시간
        구독 대상 목록. daily_discovery 순위 밖으로 밀려도 이 목록으로 스트림
        구독을 보장해야 STRONG BUY 신호를 놓치지 않는다.
        """
        if not self.supabase:
            return []

        try:
            res = (
                self.supabase.table("watchlist")
                .select("ticker")
                .eq("status", "WATCHING")
                .is_("user_id", "null")
                .order("initial_dna_score", desc=True)
                .limit(limit)
                .execute()
            )
            return [row["ticker"] for row in (res.data or []) if row.get("ticker")]
        except Exception as e:
            print(f"⚠️ watchlist fetch error: {e}")
            return []

    def try_acquire_stream_lock(self, owner_id: str, ttl_seconds: int = 240) -> bool:
        """
        Alpaca WebSocket 스트림 소유권을 위한 TTL 기반 분산 락 획득 시도.
        락이 비어있거나(owner NULL), 만료됐거나(expires_at < now), 이미 내가
        주인인 경우에만 UPDATE가 걸리도록 WHERE 조건에 그 세 상황을 넣어
        compare-and-swap처럼 동작시킨다 — 다른 인스턴스가 동시에 시도해도
        조건을 만족하는 쪽만 행을 갱신할 수 있다.
        """
        if not self.supabase:
            return False
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            ).isoformat()
            response = (
                self.supabase.table("system_settings")
                .update(
                    {
                        "stream_lock_owner": owner_id,
                        "stream_lock_expires_at": expires_at,
                    }
                )
                .eq("id", 1)
                .or_(
                    f"stream_lock_owner.is.null,stream_lock_expires_at.lt.{now_iso},stream_lock_owner.eq.{owner_id}"
                )
                .execute()
            )
            return bool(response.data)
        except Exception as e:
            print(f"❌ DB Stream Lock Acquire Error: {e}")
            return False

    def renew_stream_lock(self, owner_id: str, ttl_seconds: int = 240) -> bool:
        """보유 중인 스트림 락의 TTL 연장. 내가 주인일 때만 갱신된다."""
        if not self.supabase:
            return False
        try:
            expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            ).isoformat()
            response = (
                self.supabase.table("system_settings")
                .update({"stream_lock_expires_at": expires_at})
                .eq("id", 1)
                .eq("stream_lock_owner", owner_id)
                .execute()
            )
            return bool(response.data)
        except Exception as e:
            print(f"❌ DB Stream Lock Renew Error: {e}")
            return False

    def release_stream_lock(self, owner_id: str) -> None:
        """정상 종료 시 스트림 락 반납 — 상대 인스턴스가 TTL 만료를 기다리지 않고 즉시 승계 가능."""
        if not self.supabase:
            return
        try:
            (
                self.supabase.table("system_settings")
                .update({"stream_lock_owner": None, "stream_lock_expires_at": None})
                .eq("id", 1)
                .eq("stream_lock_owner", owner_id)
                .execute()
            )
        except Exception as e:
            print(f"❌ DB Stream Lock Release Error: {e}")


if __name__ == "__main__":
    db = DBManager()
    print("✅ Supabase Connection Successful")
    # Test fetch
    latest = db.get_latest_discoveries(1)
    print(f"Latest sample: {latest}")
