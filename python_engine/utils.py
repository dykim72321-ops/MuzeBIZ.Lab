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
        Handles multi-tier prices by taking the first one.
        Example: '1 $299.06 5 $290.00' -> 299.06
        """
        if not price_str or "quote" in price_str.lower() or "call" in price_str.lower():
            return 0.0
        try:
            # 1. Clean up common separators and currencies
            # Remove commas and spaces between numbers to prevent merging them
            p = price_str.replace(",", "").strip()

            # 2. Extract all sequences that look like prices (numbers with optional decimal)
            # We look for symbols that typically prefix a price or just the pattern
            matches = re.findall(r"(\d+\.?\d*)", p)

            # 3. Handle tiers (FindChips uses: Qty Price Qty Price)
            # Usually the first number is Qty, second is Price.
            if len(matches) >= 2:
                # If the first match is a small integer (likely Qty 1), the second is the real price
                # If only one match, it might just be the price.
                potential_price = (
                    float(matches[1]) if len(matches) >= 2 else float(matches[0])
                )

                # Sanity check: if the first match is very large compared to the second, maybe first is the price?
                # But in component sourcing, MOQ 1 is common.
                return potential_price
            elif len(matches) == 1:
                return float(matches[0])

            return 0.0
        except (ValueError, TypeError, IndexError):
            return 0.0

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
