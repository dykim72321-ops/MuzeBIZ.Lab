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
        cleaned = re.sub(r'[^A-Z0-9]', '', mpn.upper())
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
            matches = re.findall(r'(\d+\.?\d*)', p)
            
            # 3. Handle tiers (FindChips uses: Qty Price Qty Price)
            # Usually the first number is Qty, second is Price.
            if len(matches) >= 2:
                # If the first match is a small integer (likely Qty 1), the second is the real price
                # If only one match, it might just be the price.
                potential_price = float(matches[1]) if len(matches) >= 2 else float(matches[0])
                
                # Sanity check: if the first match is very large compared to the second, maybe first is the price?
                # But in component sourcing, MOQ 1 is common.
                return potential_price
            elif len(matches) == 1:
                return float(matches[0])
                
            return 0.0
        except (ValueError, TypeError, IndexError):
            return 0.0

    @staticmethod
    def normalize_distributor(name: str) -> str:
        """
        Standardizes distributor names for consistency in the UI and merging.
        """
        if not name: return "Other"
        n = name.lower()
        if 'mouser' in n: return "Mouser"
        if 'digi' in n: return "Digi-Key"
        if 'arrow' in n: return "Arrow"
        if 'future' in n: return "Future"
        if 'avnet' in n: return "Avnet"
        if 'abacus' in n: return "Avnet" # Avnet Abacus
