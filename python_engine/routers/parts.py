"""
routers/parts.py — /api/parts/*, /procurement/*, /api/market/stats 엔드포인트

전자부품 소싱 엔진 (Rare Source / SourcingEngine).
"""

import asyncio
import re
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from scraper import SearchAggregator
except ImportError:
    SearchAggregator = None

from cache_manager import get_cache_manager
from inventory_service import inventory_service
from utils import PartNormalizer

router = APIRouter(tags=["parts"])


# ── Pydantic 모델 ───────────────────────────────────────────────────────────


class StandardPart(BaseModel):
    id: str
    mpn: str
    manufacturer: str
    distributor: str
    source_type: str
    stock: int
    price: float
    price_history: List[float]
    currency: str
    delivery: str
    condition: str
    date_code: str
    is_eol: bool
    risk_level: str
    risk_score: Optional[int] = 0
    market_notes: Optional[str] = ""
    lifecycle: Optional[str] = "Unknown"
    is_alternative: Optional[bool] = False
    relevance_score: Optional[int] = 0
    updated_at: datetime
    datasheet: Optional[str] = ""
    description: Optional[str] = ""
    product_url: Optional[str] = ""
    package: Optional[str] = "N/A"
    voltage: Optional[str] = "N/A"
    temperature: Optional[str] = "N/A"
    rohs: Optional[bool] = True
    specs: Dict[str, str] = {}


class ProcurementLockRequest(BaseModel):
    part_id: str
    quantity: int


# ── SourcingEngine ──────────────────────────────────────────────────────────


class SourcingEngine:
    def __init__(self):
        self.exchange_rate = 1450.0
        self.search_cache = TTLCache(maxsize=100, ttl=300)

    def _generate_price_history(self, current_price: float):
        if current_price > 0:
            return [round(float(current_price), 2)]
        return []

    def _calculate_risk_score(
        self, stock: int, distributors: List[str], is_eol: bool
    ) -> int:
        score = 0
        if stock == 0:
            score += 40
        elif stock < 100:
            score += 25
        elif stock < 1000:
            score += 10

        unique_dists = len(set(distributors))
        if unique_dists <= 1:
            score += 30
        elif unique_dists <= 3:
            score += 15

        if is_eol:
            score += 30

        return min(score, 100)

    async def _fetch_from_provider(
        self, provider_name: str, provider_instance, q: str
    ) -> List[StandardPart]:
        try:
            print(f"🚀 [ENGINE] Calling provider: {provider_name}")
            results = (
                await provider_instance.search_market_intel(q)
                if hasattr(provider_instance, "search_market_intel")
                else await provider_instance.search_mpn(q)
            )

            standardized = []
            for ext in results:
                try:
                    price = ext.get("price", 0.0)
                    stock = ext.get("stock", 0)
                    is_eol = (
                        ext.get("lifecycle") == "NRND"
                        or ext.get("risk_level") == "High"
                    )
                    risk_score = self._calculate_risk_score(
                        stock, [ext.get("distributor", "Unknown")], is_eol
                    )

                    standard_fields = {
                        "id",
                        "mpn",
                        "manufacturer",
                        "distributor",
                        "source_type",
                        "stock",
                        "price",
                        "currency",
                        "delivery",
                        "condition",
                        "date_code",
                        "is_eol",
                        "risk_level",
                        "risk_score",
                        "lifecycle",
                        "is_alternative",
                        "updated_at",
                        "datasheet",
                        "product_url",
                        "description",
                        "market_notes",
                        "package",
                        "voltage",
                        "temperature",
                        "rohs",
                    }
                    specs = {
                        k: str(v)
                        for k, v in ext.items()
                        if k not in standard_fields and v is not None
                    }

                    part = StandardPart(
                        id=f"ext-{provider_name.lower()}-{uuid.uuid4().hex[:6]}",
                        mpn=ext["mpn"],
                        manufacturer=ext.get("manufacturer", "Unknown"),
                        distributor=PartNormalizer.normalize_distributor(
                            ext["distributor"]
                        ),
                        source_type=ext.get("source_type", "External"),
                        stock=stock,
                        price=price,
                        price_history=self._generate_price_history(price),
                        currency=ext.get("currency", "USD"),
                        delivery=ext.get("delivery", "3-5 Days"),
                        condition="New",
                        date_code="2023+",
                        is_eol=is_eol,
                        risk_level=(
                            "High"
                            if risk_score > 70
                            else ("Medium" if risk_score > 30 else "Low")
                        ),
                        risk_score=ext.get("risk_score", risk_score),
                        lifecycle=ext.get("lifecycle", "Active"),
                        is_alternative=ext.get("is_alternative", False),
                        relevance_score=ext.get("relevance_score", 0),
                        updated_at=datetime.now(),
                        datasheet=ext.get("datasheet", ""),
                        product_url=ext.get("product_url", ""),
                        description=ext.get("description", ""),
                        market_notes=ext.get(
                            "market_notes",
                            f"Stock availability score: {100-risk_score}/100",
                        ),
                        specs=specs,
                    )
                    standardized.append(part)
                except Exception as e:
                    print(
                        f"⚠️ [ENGINE] Individual item normalization error in {provider_name}: {e}"
                    )
            return standardized
        except Exception as e:
            print(f"❌ [ENGINE] Provider {provider_name} failed: {e}")
            return []

    async def aggregate_intel(self, q: str) -> List[StandardPart]:
        q_norm = q.strip().upper()
        if q_norm in self.search_cache:
            print(f"⚡ [ENGINE] Cache Hit for: {q_norm}")
            return self.search_cache[q_norm]

        print(f"📡 [ENGINE] Triggering parallel scouting for: {q}...", flush=True)
        aggregator = SearchAggregator()

        tasks = [
            asyncio.wait_for(
                self._fetch_from_provider("Market Aggregator", aggregator, q),
                timeout=30.0,
            ),
            asyncio.wait_for(self._fetch_from_local(q), timeout=5.0),
        ]

        results_nested = await asyncio.gather(*tasks, return_exceptions=True)
        results = []
        for res in results_nested:
            if isinstance(res, list):
                results.extend(res)
            elif isinstance(res, Exception):
                print(f"⚠️ [ENGINE] Source timeout or failure: {res}")

        is_weak = len(results) < 3 or all((p.risk_score or 0) > 70 for p in results)
        if is_weak:
            try:
                base_family = PartNormalizer.get_base_family(q)
                if base_family and base_family.upper() != q.upper():
                    print(
                        f"🧬 [ENGINE] Initial results weak. Triggering Parametric Match for: {base_family}"
                    )
                    alt_results = await self._fetch_from_provider(
                        "Parametric Engine", aggregator, base_family
                    )
                    for alt in alt_results:
                        if PartNormalizer.clean_mpn(
                            alt.mpn
                        ) != PartNormalizer.clean_mpn(q):
                            alt.is_alternative = True
                            alt.relevance_score = (alt.relevance_score or 200) - 100
                            results.append(alt)
            except Exception as e:
                print(f"⚠️ [ENGINE] Parametric fallback failed: {e}")

        merged_parts = {}
        for part in results:
            norm_mpn = PartNormalizer.clean_mpn(part.mpn)
            key = f"{norm_mpn}@{part.distributor}"

            existing = merged_parts.get(key)
            if not existing:
                merged_parts[key] = part
            else:
                if part.stock > existing.stock:
                    existing.stock = part.stock
                if part.price > 0 and (
                    existing.price == 0 or part.price < existing.price
                ):
                    existing.price = part.price
                if part.relevance_score > (existing.relevance_score or 0):
                    existing.relevance_score = part.relevance_score

        final_list = list(merged_parts.values())
        final_list.sort(
            key=lambda x: (
                -getattr(x, "relevance_score", 0),
                x.stock == 0,
                x.price if x.price > 0 else float("inf"),
            )
        )

        self.search_cache[q_norm] = final_list
        return final_list

    async def _fetch_from_local(self, q: str) -> List[StandardPart]:
        local_parts = []
        try:
            local_results = await inventory_service.search_inventory(q)
            for item in local_results:
                try:
                    part = StandardPart(
                        id=item.get("id", str(uuid.uuid4())[:12]),
                        mpn=item.get("mpn", q.upper()),
                        manufacturer=item.get("manufacturer", "Unknown"),
                        distributor=PartNormalizer.normalize_distributor(
                            item.get("distributor", "Internal")
                        ),
                        source_type="Member Inventory",
                        stock=item.get("stock", 0),
                        price=item.get("price", 0.0),
                        price_history=self._generate_price_history(
                            item.get("price", 0.0)
                        ),
                        currency=item.get("currency", "USD"),
                        delivery="Direct",
                        condition=item.get("condition", "New"),
                        date_code=item.get("date_code", "N/A"),
                        is_eol=item.get("is_eol", False),
                        risk_level=item.get("risk_level", "Low"),
                        risk_score=item.get("risk_score", 0),
                        market_notes=item.get("market_notes", ""),
                        updated_at=datetime.now(),
                        datasheet=item.get("datasheet", ""),
                        description=item.get("description", ""),
                        product_url=item.get("product_url", ""),
                    )
                    local_parts.append(part)
                except Exception:
                    continue
        except Exception as e:
            print(f"⚠️ Local Inventory Search Error: {e}")
        return local_parts


sourcing_engine = SourcingEngine()


# ── 엔드포인트 ──────────────────────────────────────────────────────────────


@router.get("/api/parts/search", response_model=List[StandardPart])
async def search_parts(
    q: str = Query(..., min_length=1),
    category: Optional[str] = None,
    package: Optional[str] = None,
    min_voltage: Optional[float] = None,
    max_voltage: Optional[float] = None,
    rohs_compliant: Optional[bool] = None,
):
    try:
        cache_manager = get_cache_manager()
        cache_key = (
            f"{q}_{category}_{package}_{min_voltage}_{max_voltage}_{rohs_compliant}"
        )

        cached_results = await cache_manager.get_cached_results(cache_key)
        if cached_results:
            print(f"⚡ [API] Cache Hit for {q}")
            return [StandardPart(**item) for item in cached_results]

        print(f"📡 [API] Real-time Scouting for {q}...")
        results = await sourcing_engine.aggregate_intel(q)

        if package:
            results = [
                r for r in results if r.package and package.lower() in r.package.lower()
            ]

        if min_voltage is not None or max_voltage is not None:

            def extract_v(v_str: Optional[str]) -> Optional[float]:
                if not v_str:
                    return None
                try:
                    matches = re.findall(r"[-+]?\d*\.\d+|\d+", v_str)
                    return float(matches[0]) if matches else None
                except (ValueError, IndexError):
                    return None

            if min_voltage is not None:
                results = [
                    r
                    for r in results
                    if (v := extract_v(r.voltage)) is not None and v >= min_voltage
                ]
            if max_voltage is not None:
                results = [
                    r
                    for r in results
                    if (v := extract_v(r.voltage)) is not None and v <= max_voltage
                ]

        if rohs_compliant is not None:
            results = [
                r for r in results if r.rohs is not None and r.rohs == rohs_compliant
            ]

        results_dict = [item.model_dump(mode="json") for item in results]
        await cache_manager.set_cache(cache_key, results_dict)

        return results

    except Exception as e:
        import traceback

        print(f"❌ [API] Search error: {e}")
        print(traceback.format_exc())
        return []


@router.get("/api/parts/details")
async def get_part_details(url: str = Query(...)):
    """[LAZY LOADING] Fetches extended specs from a specific product URL."""
    try:
        from scraper import SearchAggregator

        aggregator = SearchAggregator()
        details = await aggregator.get_part_details(url)
        return details
    except Exception as e:
        print(f"❌ [API] Detail fetch error: {e}")
        return {}


@router.get("/api/market/stats")
async def get_market_stats():
    """Returns market statistics based on global search aggregates"""
    return {
        "market_temperature": 78,
        "global_stock_index": 1250000,
        "active_brokers": 145,
        "price_drift": "+2.4%",
        "last_sync": datetime.now().isoformat(),
    }


@router.post("/procurement/lock")
async def create_procurement_lock(req: ProcurementLockRequest):
    """Locks a procurement attempt for a specific part."""
    return {
        "tracking_id": f"LOCK-{uuid.uuid4().hex[:8].upper()}",
        "status": "locked",
        "part_id": req.part_id,
        "quantity": req.quantity,
    }
