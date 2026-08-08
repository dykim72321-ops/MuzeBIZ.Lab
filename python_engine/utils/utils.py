# Utility functions for the Python engine
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas_market_calendars as mcal

_nyse_calendar = mcal.get_calendar("NYSE")
_holiday_cache: dict = {}

# phantom position 사고(부분체결 유령 보유 등) 소급 복구 시 paper_history에 남기는
# exit_reason 접두어. 실거래가 아니므로 승률/PF/체크리스트 표본에서 제외해야 하는데,
# 이 문자열이 checklist.py/strategy.py/broker.py/paper_engine.py 여러 곳에 각각
# 하드코딩되어 있었다 — 한 곳만 바뀌면 나머지가 조용히 필터링을 멈추는 리스크가 있어
# 단일 상수로 통일한다.
BACKFILLED_EXIT_REASON_PREFIX = "Manual Sell (Backfilled"


def is_backfilled_phantom_trade(record: dict) -> bool:
    """paper_history/paper_positions 레코드가 phantom 사고 소급 복구 행인지 판별."""
    return (record.get("exit_reason") or "").startswith(BACKFILLED_EXIT_REASON_PREFIX)


def _is_trading_day(now_et: datetime) -> bool:
    """평일이면서 NYSE 휴장일이 아닌 날인지 (요일·캘린더만 체크, 시간대는 무관)."""
    if now_et.weekday() >= 5:
        return False

    date_str = now_et.strftime("%Y-%m-%d")
    if date_str not in _holiday_cache:
        try:
            schedule = _nyse_calendar.schedule(start_date=date_str, end_date=date_str)
            _holiday_cache[date_str] = not schedule.empty
        except Exception as e:
            print(f"⚠️ [Calendar] Failed to fetch schedule for {date_str}: {e}")
            _holiday_cache[date_str] = True

    return _holiday_cache[date_str]


def is_market_hours(ref_dt=None) -> bool:
    """US 시장 개장 여부 (ET 기준 평일 09:30~16:00 및 휴장일 체크). DST 자동 처리.

    ref_dt: 바 타임스탬프(tz-aware). None이면 현재 벽시계로 판단.
            warm_up 재생 등 과거 바를 처리할 때 반드시 바 시간을 전달해야
            장외 시간 기준이 바 시간이 아닌 현재 시각으로 판단되는 버그를 방지한다.
    """
    if ref_dt is not None:
        now_et = ref_dt.astimezone(ZoneInfo("America/New_York"))
    else:
        now_et = datetime.now(ZoneInfo("America/New_York"))

    if not _is_trading_day(now_et):
        return False

    open_min = 9 * 60 + 30
    close_min = 16 * 60
    cur_min = now_et.hour * 60 + now_et.minute
    return open_min <= cur_min < close_min


def is_extended_market_hours(ref_dt=None) -> bool:
    """프리마켓·애프터마켓 포함 확장 거래시간 여부 (ET 기준 평일 04:00~20:00).

    보유 포지션의 트레일링 스탑 안전망(position_ts_sweeper)처럼 정규장 외
    시간에도 급락 감시가 필요한 용도로 사용한다. 정규장(is_market_hours)보다
    넓은 창이지만, 심야(20:00~04:00 ET)는 Alpaca 체결 데이터 자체가 희박해
    여전히 커버하지 않는다.
    """
    if ref_dt is not None:
        now_et = ref_dt.astimezone(ZoneInfo("America/New_York"))
    else:
        now_et = datetime.now(ZoneInfo("America/New_York"))

    if not _is_trading_day(now_et):
        return False

    open_min = 4 * 60
    close_min = 20 * 60
    cur_min = now_et.hour * 60 + now_et.minute
    return open_min <= cur_min < close_min


def et_time_bucket(ref_dt=None) -> str:
    """신호 시점을 정규장 기준 ET 시간대 버킷으로 분류한다.

    engine_decisions.time_bucket에 기록되어 "언제 발생한 신호인가"를 사후 분석
    가능하게 한다(2026-08-08 도입). 경계값은 미국 주식의 관측된 일중 유동성
    패턴을 따른다 — 개장 30분(OPEN)과 마감 30분(CLOSE)은 변동성·스프레드가
    구조적으로 다르므로 별도 버킷으로 분리한다.

    정규장(09:30~16:00 ET) 밖이거나 주말/휴장일이면 "EXTENDED"를 반환한다.
    """
    if ref_dt is not None:
        now_et = ref_dt.astimezone(ZoneInfo("America/New_York"))
    else:
        now_et = datetime.now(ZoneInfo("America/New_York"))

    if not _is_trading_day(now_et):
        return "EXTENDED"

    cur_min = now_et.hour * 60 + now_et.minute
    if cur_min < 9 * 60 + 30 or cur_min >= 16 * 60:
        return "EXTENDED"
    if cur_min < 10 * 60:
        return "OPEN"
    if cur_min < 11 * 60 + 30:
        return "MORNING"
    if cur_min < 14 * 60:
        return "MIDDAY"
    if cur_min < 15 * 60 + 30:
        return "AFTERNOON"
    return "CLOSE"


class PartNormalizer:
    @staticmethod
    def clean_mpn(mpn: str) -> str:
        """
        Normalizes a Manufacturer Part Number (MPN).
        Removes non-alphanumeric characters and converts to uppercase.
        Example: 'TPS54331-DR' -> 'TPS54331DR'
        """
        if not mpn:
            return ""
        # Remove hyphens, slashes, and dots which are common variations
        cleaned = re.sub(r"[^A-Z0-9]", "", mpn.upper())
        return cleaned

    @staticmethod
    def is_match(mpn1: str, mpn2: str) -> bool:
        """
        Checks if two MPNs refer to the same physical part.
        Uses relaxed matching for suffixes if base part matches.
        """
        c1 = PartNormalizer.clean_mpn(mpn1)
        c2 = PartNormalizer.clean_mpn(mpn2)

        if c1 == c2:
            return True

        # Check if one is a prefix of another (common with packaging suffixes like TR, R, etc.)
        if len(c1) > 3 and len(c2) > 3:
            if c1.startswith(c2) or c2.startswith(c1):
                return True

        return False

    @staticmethod
    def format_price(price_str: str) -> float:
        """
        Extracts a float value from various price string formats.
        FindChips often returns 'Qty Price Qty Price'.
        """
        if not price_str or "quote" in price_str.lower() or "call" in price_str.lower():
            return 0.0
        try:
            # 1. Clean up
            p = price_str.replace(",", "").strip()

            # 2. Extract pairs of numbers
            matches = re.findall(r"(\d+\.?\d*)", p)
            if not matches:
                return 0.0

            # 3. Handle tiers: Qty Price Qty Price
            # If the first match is '1', the second is the unit price.
            # If no '1' found, we look for any float (contain '.')
            # and take the first one, or the first match if it looks like a price (small value)
            for i in range(len(matches) - 1):
                if matches[i] == "1":
                    return float(matches[i + 1])

            # Heuristic fallback: return the first one that has a decimal point (likely a price)
            for m in matches:
                if "." in m:
                    return float(m)

            # Final fallback: if no decimal, but the number is reasonably small (< 10000?), treat as price.
            # If it's huge, it's probably stock/quantity number wrongly parsed as price.
            val = float(matches[0])
            return val if val < 5000 else 0.0

        except (ValueError, TypeError, IndexError):
            return 0.0

    @staticmethod
    def calculate_risk_score(mpn: str, stock: int, lifecycle: str) -> int:
        """
        Calculates a numeric risk score (0-100).
        High score = High risk.
        """
        score = 0

        # 1. Stock Risk (0-40 pts)
        if stock == 0:
            score += 40
        elif stock < 50:
            score += 25
        elif stock < 200:
            score += 10

        # 2. Lifecycle Risk (0-40 pts)
        l_status = lifecycle.upper()
        if "EOL" in l_status or "OBS" in l_status:
            score += 40
        elif "NRND" in l_status:
            score += 30
        elif "UNKNOWN" in l_status:
            score += 15

        # 3. Part Type Risk (0-20 pts)
        # Evaluation boards or alternatives are inherently riskier for mass production
        if "-EVB" in mpn.upper() or "EVAL" in mpn.upper():
            score += 20

        return min(100, score)

    @staticmethod
    def generate_market_notes(
        mpn: str, stock: int, price: float, lifecycle: str
    ) -> str:
        """Generates dynamic market insights based on part data."""
        notes = []

        if stock > 5000:
            notes.append("High Volume Available")
        elif stock == 0:
            notes.append("Stock Depleted - Factory Lead Time Likely")
        elif stock < 100:
            notes.append("Limited Spot Stock")

        if price > 1000:
            notes.append("High Value / Module Item")

        if lifecycle == "NRND":
            notes.append("Design Migration Recommended")

        if "-EVB" in mpn.upper():
            notes.append("Prototyping Tool - Not for Production")

        return " | ".join(notes) if notes else "Market Stable"

    @staticmethod
    def guess_manufacturer(mpn: str) -> str:
        """Heuristic to guess manufacturer from MPN prefix."""
        m = mpn.upper()
        if (
            m.startswith("TPS")
            or m.startswith("SN")
            or m.startswith("TLV")
            or m.startswith("OPA")
        ):
            return "Texas Instruments"
        if m.startswith("STM32") or m.startswith("STM8") or m.startswith("SPC5"):
            return "STMicroelectronics"
        if (
            m.startswith("AD")
            or m.startswith("LTC")
            or m.startswith("LT")
            or m.startswith("MAX")
        ):
            # MAX is Maxim, now part of Analog Devices
            return "Analog Devices"
        if m.startswith("PIC") or m.startswith("ATMEGA") or m.startswith("SAM"):
            return "Microchip"
        if m.startswith("XCV") or m.startswith("XC7"):
            return "Xilinx (AMD)"
        if m.startswith("CY"):
            return "Cypress (Infineon)"
        if m.startswith("NCP") or m.startswith("MC78"):
            return "ON Semiconductor"
        return "Global Source"

    @staticmethod
    def get_base_family(mpn: str) -> str:
        """
        Extracts the core part family by stripping common packaging/temp suffixes.
        Example: 'TPS54331-DR' -> 'TPS54331', 'STM32F103C8T6' -> 'STM32F103'
        Uses Regex to separate Base MPN from known suffixes.
        """
        if not mpn:
            return ""

        # 1. Broad cleanup of packaging junk
        # Matches patterns like -TR, /R, #PBF, -REEL at the end
        # Also catches alphanumeric suffixes after a digit sequence
        cleaned = re.split(
            r"[-/#](?:TR|R|PBF|REEL|T|DR|PB)$", mpn, flags=re.IGNORECASE
        )[0]

        # 2. Heuristic for common semi-conductor naming (Prefix + Number)
        # Usually everything after the first sequence of digits + maybe 1-2 chars is suffix
        match = re.search(r"^([A-Z0-9]+?[0-9]{3,})", cleaned)
        if match:
            return match.group(1)

        # 3. Fallback: Split by hyphens/dots and take the first part
        return re.split(r"[-.]", cleaned)[0]

    @staticmethod
    def generate_variants(mpn: str) -> list[str]:
        """
        Generates common variants of an MPN to increase search surface.
        """
        base = PartNormalizer.get_base_family(mpn)
        if not base or base == mpn:
            return [mpn]

        return list(set([mpn, base, f"{base}-TR", f"{base}DR"]))

    @staticmethod
    def get_lifecycle_status(mpn: str, stock: int) -> str:
        """
        Returns a risk status for the part.
        In a real app, this would query a lifecycle DB (Silica, IHS).
        Here we use stock and series patterns as a heuristic.
        """
        if stock > 0:
            return "Active"

        # Heuristic: If stock is 0 and it's a legacy série (e.g. 74xx, LM3xx)
        legacy_prefixes = ["LM", "74HC", "74LS", "MC", "NE"]
        if any(mpn.startswith(p) for p in legacy_prefixes):
            return "NRND"  # Not Recommended for New Designs

        return "Unknown"

    @staticmethod
    def normalize_distributor(name: str) -> str:
        """
        Standardizes distributor names for consistency in the UI and merging.
        """
        if not name:
            return "Other"
        n = name.lower()
        if "mouser" in n:
            return "Mouser"
        if "digi" in n:
            return "Digi-Key"
        if "arrow" in n:
            return "Arrow"
        if "future" in n:
            return "Future"
        if "avnet" in n:
            return "Avnet"
        if "abacus" in n:
            return "Avnet"  # Avnet Abacus
        if "verical" in n:
            return "Verical"
        if "tme" in n:
            return "TME"
        if "element14" in n or "farnell" in n or "newark" in n:
            return "Farnell / e14"
        if "lcsc" in n:
            return "LCSC"
        if "win source" in n or "win-source" in n:
            return "Win Source"
        if "rochester" in n or "rocelec" in n:
            return "Rochester"
        if "flip" in n:
            return "Flip Electronics"
        if "netcomponents" in n:
            return "NetComponents"
        if "rs component" in n or "rs-online" in n or n.strip() == "rs":
            return "RS Components"
        # Fallback: keep the full distributor name (title-cased) so the
        # frontend's substring-based URL builder can still match it,
        # instead of truncating to only the first word.
        return name.strip().title()

    @staticmethod
    def extract_package(description: str) -> str:
        """
        Heuristically extracts a package/case type from a free-text
        distributor description string (e.g. 'Buck, ... 8Soic, ...').
        """
        if not description:
            return "N/A"
        known_packages = [
            "SOIC",
            "SOT-23",
            "SOT23",
            "TSSOP",
            "SSOP",
            "QFN",
            "DFN",
            "TO-220",
            "TO220",
            "TO-92",
            "TO92",
            "TO-263",
            "BGA",
            "QFP",
            "LQFP",
            "TQFP",
            "DIP",
            "PDIP",
            "SOP",
            "MSOP",
            "WSON",
            "SOD",
            "POWERPAD",
            "DPAK",
            "D2PAK",
        ]
        upper = description.upper()
        for pkg in known_packages:
            m = re.search(rf"(\d*-?{pkg}-?\d*)", upper)
            if m:
                return m.group(1).strip("-")
        return "N/A"

    @staticmethod
    def extract_voltage(description: str) -> str:
        """
        Heuristically extracts a voltage range from a free-text
        distributor description string (e.g. 'Input Voltage Min:3.5V, Input Voltage Max:28V').
        """
        if not description:
            return "N/A"
        min_m = re.search(
            r"Input Voltage Min:\s*([\d.]+)\s*V", description, re.IGNORECASE
        )
        max_m = re.search(
            r"Input Voltage Max:\s*([\d.]+)\s*V", description, re.IGNORECASE
        )
        if min_m and max_m:
            return f"{min_m.group(1)}V-{max_m.group(1)}V"
        single_m = re.search(r"(\d+(?:\.\d+)?)\s*V\b", description)
        if single_m:
            return f"{single_m.group(1)}V"
        return "N/A"
