import re
from typing import List, Optional


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
                    return float(matches[i+1])

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
    def generate_market_notes(mpn: str, stock: int, price: float, lifecycle: str) -> str:
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
        if m.startswith("TPS") or m.startswith("SN") or m.startswith("TLV") or m.startswith("OPA"):
            return "Texas Instruments"
        if m.startswith("STM32") or m.startswith("STM8") or m.startswith("SPC5"):
            return "STMicroelectronics"
        if m.startswith("AD") or m.startswith("LTC") or m.startswith("LT") or m.startswith("MAX"):
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
        """
        if not mpn:
            return ""
        # 1. Standard pattern: Split by hyphens/dots and take the first part
        base = re.split(r"[-.]", mpn)[0]

        # 2. Heuristic for common semi-conductor naming (Prefix + Number)
        # Usually everything after the first sequence of digits + maybe 1-2 chars is suffix
        match = re.search(r"^([A-Z]+[0-9]+[A-Z]*)", base)
        if match:
            return match.group(1)

        return base

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
        if "element14" in n or "farnell" in n:
            return "Farnell / e14"
        return name.split()[0].title() if name else "Other"
