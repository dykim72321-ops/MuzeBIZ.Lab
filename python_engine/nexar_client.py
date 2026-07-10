"""
nexar_client.py — Nexar (Octopart) GraphQL API 클라이언트.

FindChips 스크래퍼와 병행 실행되는 공식 데이터 소스. Digi-Key, Mouser,
Arrow, Avnet 등 주요 유통사의 실시간 재고·가격을 OAuth2 인증된 GraphQL
API로 통합 조회한다. 무료 티어(월 1,000 쿼리) 기준.

인증: https://identity.nexar.com/connect/token (client_credentials grant)
API:  https://api.nexar.com/graphql

필요 환경변수: NEXAR_CLIENT_ID, NEXAR_CLIENT_SECRET
둘 중 하나라도 없으면 이 프로바이더는 조용히 스킵된다 (routers/parts.py 참고).
"""

import os
import time
from typing import Dict, List, Optional

import aiohttp

from utils import PartNormalizer

TOKEN_URL = "https://identity.nexar.com/connect/token"
GRAPHQL_URL = "https://api.nexar.com/graphql"

MPN_SEARCH_QUERY = """
query MpnSearch($q: String!, $limit: Int!) {
  supSearchMpn(q: $q, limit: $limit) {
    hits
    results {
      part {
        mpn
        manufacturer { name }
        shortDescription
        octopartUrl
        bestDatasheet { url }
        specs {
          attribute { name }
          displayValue
        }
        sellers {
          company { name }
          offers {
            clickUrl
            inventoryLevel
            packaging
            factoryLeadDays
            prices {
              quantity
              price
              currency
            }
          }
        }
      }
    }
  }
}
"""


QUOTA_COOLDOWN_SECONDS = 3600  # avoid hammering the API once the plan cap is hit


class NexarClient:
    def __init__(self):
        self.client_id = os.environ.get("NEXAR_CLIENT_ID")
        self.client_secret = os.environ.get("NEXAR_CLIENT_SECRET")
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._quota_exceeded_until: float = 0.0

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def _get_access_token(self, session: aiohttp.ClientSession) -> Optional[str]:
        # 60s margin so we never hand out a token that expires mid-request.
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        try:
            async with session.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "supply.domain",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    print(f"❌ [NEXAR] Auth failed ({resp.status}): {body[:300]}")
                    return None
                data = await resp.json()
                self._token = data.get("access_token")
                expires_in = data.get("expires_in", 3600)
                self._token_expires_at = time.time() + float(expires_in)
                return self._token
        except Exception as e:
            print(f"❌ [NEXAR] Auth request failed: {e}")
            return None

    def _extract_spec(self, specs: List[Dict], name_fragment: str) -> Optional[str]:
        for spec in specs or []:
            attr = (spec.get("attribute") or {}).get("name", "")
            if name_fragment.lower() in attr.lower():
                return spec.get("displayValue")
        return None

    async def search_market_intel(self, mpn: str) -> List[Dict]:
        if not self.is_configured:
            print("⚠️ [NEXAR] NEXAR_CLIENT_ID/NEXAR_CLIENT_SECRET not set — skipping")
            return []

        if time.time() < self._quota_exceeded_until:
            # Plan cap was already hit recently — skip the request entirely
            # instead of hammering the API and spamming logs every search.
            return []

        print(f"📡 [NEXAR] Querying Octopart supply graph for: {mpn}...")
        results: List[Dict] = []

        try:
            timeout = aiohttp.ClientTimeout(total=20)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                token = await self._get_access_token(session)
                if not token:
                    return []

                async with session.post(
                    GRAPHQL_URL,
                    json={
                        "query": MPN_SEARCH_QUERY,
                        "variables": {"q": mpn, "limit": 10},
                    },
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "token": token,
                    },
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        print(f"❌ [NEXAR] GraphQL error ({resp.status}): {body[:300]}")
                        return []
                    payload = await resp.json()

            if payload.get("errors"):
                errors = payload["errors"]
                if any(
                    "part limit" in str(e.get("message", "")).lower() for e in errors
                ):
                    self._quota_exceeded_until = time.time() + QUOTA_COOLDOWN_SECONDS
                    print(
                        f"⚠️ [NEXAR] Plan part-limit exceeded — pausing Nexar calls for "
                        f"{QUOTA_COOLDOWN_SECONDS // 60} min. Upgrade at nexar.com or "
                        f"contact api@nexar.com."
                    )
                else:
                    print(f"❌ [NEXAR] GraphQL errors: {errors}")
                return []

            search = (payload.get("data") or {}).get("supSearchMpn") or {}
            search_norm = PartNormalizer.clean_mpn(mpn)

            for hit in search.get("results") or []:
                part = hit.get("part") or {}
                actual_mpn = part.get("mpn", "")
                if not actual_mpn:
                    continue

                manufacturer = (part.get("manufacturer") or {}).get("name", "Unknown")
                description = part.get("shortDescription", "") or ""
                datasheet = (part.get("bestDatasheet") or {}).get("url", "") or ""
                specs = part.get("specs") or []
                package = (
                    self._extract_spec(specs, "package")
                    or self._extract_spec(specs, "case")
                    or PartNormalizer.extract_package(description)
                )
                voltage = self._extract_spec(
                    specs, "voltage"
                ) or PartNormalizer.extract_voltage(description)

                norm_mpn = PartNormalizer.clean_mpn(actual_mpn)
                relevance = 0
                if norm_mpn == search_norm:
                    relevance = 1000
                elif norm_mpn.startswith(search_norm):
                    relevance = 500
                elif search_norm in norm_mpn:
                    relevance = 200

                for seller in part.get("sellers") or []:
                    dist_name_raw = (seller.get("company") or {}).get("name", "Unknown")
                    dist_name = PartNormalizer.normalize_distributor(dist_name_raw)

                    for offer in seller.get("offers") or []:
                        stock = offer.get("inventoryLevel") or 0
                        prices = offer.get("prices") or []
                        price = 0.0
                        currency = "USD"
                        if prices:
                            lowest_qty = min(prices, key=lambda p: p.get("quantity", 0))
                            price = float(lowest_qty.get("price", 0.0))
                            currency = lowest_qty.get("currency", "USD")

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
                                "currency": currency,
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
                                "source_type": "Nexar (Octopart)",
                                "product_url": offer.get("clickUrl", "") or "",
                                "package": package or "N/A",
                                "voltage": voltage or "N/A",
                                "description": description,
                                "datasheet": datasheet,
                            }
                        )

            return results

        except Exception as e:
            print(f"❌ [NEXAR] Critical failure: {e}")
            return []


nexar_client = NexarClient()
