import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
import io
from typing import List, Dict

load_dotenv()


class InventoryService:
    def __init__(self):
        url: str = os.environ.get("SUPABASE_URL")
        key: str = os.environ.get("SUPABASE_KEY")
        if url and key:
            self.supabase: Client = create_client(url, key)
        else:
            self.supabase = None
            print("⚠️ Supabase credentials not found. Inventory service disabled.")

    async def process_upload(
        self, file_contents: bytes, filename: str, user_id: str = "guest"
    ):
        """
        Parse Excel/CSV and upload to Supabase
        """
        if not self.supabase:
            return {"status": "error", "message": "Database not configured"}

        try:
            # Determine file type
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(file_contents))
            elif filename.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(file_contents))
            else:
                return {"status": "error", "message": "Unsupported file format"}

            # Normalize columns
            # Expected: MPN, Manufacturer, Quantity, Price, Description
            df.columns = [c.lower().strip() for c in df.columns]

            # Simple column mapping (adjust as needed)
            # We look for keywords like 'part', 'mpn', 'qty', 'stock', 'mfr'

            records = []
            for _, row in df.iterrows():
                # Extract MPN (Critical)
                mpn = row.get("mpn") or row.get("part number") or row.get("part_number")
                if not mpn:
                    continue

                records.append(
                    {
                        "user_id": user_id,  # In a real app, from Auth token
                        "mpn": str(mpn).upper(),
                        "manufacturer": str(
                            row.get("manufacturer", row.get("mfr", "Unknown"))
                        ),
                        "quantity": int(
                            row.get("quantity", row.get("qty", row.get("stock", 0)))
                        ),
                        "price_usd": float(row.get("price", row.get("unit price", 0))),
                        "description": str(row.get("description", "")),
                        "condition": "New Surplus",  # Default for P2P
                    }
                )

            if not records:
                return {"status": "error", "message": "No valid records found"}

            # Bulk Insert
            self.supabase.table("member_inventory").insert(records).execute()

            return {
                "status": "success",
                "count": len(records),
                "message": f"Successfully uploaded {len(records)} parts.",
            }

        except Exception as e:
            print(f"❌ Upload Processing Error: {e}")
            return {"status": "error", "message": str(e)}

    async def search_inventory(self, query: str) -> List[Dict]:
        """
        Search DB for parts
        """
        if not self.supabase:
            return []

        try:
            # Supabase text search (ilike)
            response = (
                self.supabase.table("member_inventory")
                .select("*")
                .ilike("mpn", f"%{query}%")
                .execute()
            )

            items = response.data
            results = []
            for item in items:
                results.append(
                    {
                        "id": f"inv-{item.get('id')}",
                        "mpn": item.get("mpn"),
                        "manufacturer": item.get("manufacturer"),
                        "distributor": "Member Stock",  # Special Indicator
                        "stock": item.get("quantity"),
                        "price": item.get("price_usd"),
                        "currency": "USD",
                        "source_type": "Member Inventory",
                        "condition": item.get("condition"),
                        "risk_level": "Low",  # Internal stock might be considered lower risk if verified
                        "description": item.get("description"),
                        "delivery": "Direct Ship",
                    }
                )
            return results

        except Exception as e:
            print(f"❌ Inventory Search Error: {e}")
            return []


# Singleton
inventory_service = InventoryService()
