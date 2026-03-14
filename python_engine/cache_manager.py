"""
Cache Manager for RareSource
Manages search result caching using Supabase
"""

import json
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import os
from supabase import create_client, Client


class CacheManager:
    """
    Manages caching of search results in Supabase.
    Reduces API costs and improves response time.
    """

    def __init__(self):
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")

        self.client: Optional[Client] = None
        if supabase_url and supabase_key:
            try:
                self.client = create_client(supabase_url, supabase_key)
                print("✓ Cache Manager initialized with Supabase")
            except Exception as e:
                print(f"⚠️  Supabase connection failed: {e}")
        else:
            print("⚠️  Supabase credentials missing. Caching disabled.")

        self.cache_duration_hours = 1  # Default: 1 hour
        self.enabled = self.client is not None

    async def get_cached_results(self, part_number: str) -> Optional[List[Dict]]:
        """
        Retrieve cached search results if available and not expired.

        Args:
            part_number: The part number to search for

        Returns:
            List of cached results or None if cache miss
        """
        if not self.enabled:
            return None

        try:
            # Normalize part number (case-insensitive)
            part_number_normalized = part_number.upper().strip()

            # Query cache using to_thread since postgrest-py is synchronous
            def query_sync():
                return (
                    self.client.table("search_cache")
                    .select("*")
                    .eq("part_number", part_number_normalized)
                    .gt("expires_at", datetime.now().isoformat())
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )

            response = await asyncio.to_thread(query_sync)

            if response.data and len(response.data) > 0:
                cache_entry = response.data[0]

                # Update last accessed time and search count
                def update_sync():
                    return self.client.table("search_cache").update(
                        {
                            "last_accessed_at": datetime.now().isoformat(),
                            "search_count": cache_entry["search_count"] + 1,
                        }
                    ).eq("id", cache_entry["id"]).execute()
                
                await asyncio.to_thread(update_sync)

                print(
                    f"✓ Cache HIT for {part_number} (age: {self._get_cache_age(cache_entry['created_at'])})"
                )
                return cache_entry["results"]

            print(f"✗ Cache MISS for {part_number}")
            return None

        except Exception as e:
            print(f"⚠️  Cache retrieval error: {e}")
            return None

    async def set_cache(self, part_number: str, results: List[Dict]) -> bool:
        """
        Store search results in cache.

        Args:
            part_number: The part number that was searched
            results: List of search results to cache

        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not results:
            return False

        try:
            # Normalize part number
            part_number_normalized = part_number.upper().strip()

            # Calculate expiration time
            expires_at = datetime.now() + timedelta(hours=self.cache_duration_hours)

            # Prepare cache entry
            cache_entry = {
                "part_number": part_number_normalized,
                "results": results,  # Supabase handles JSON serialization
                "source_count": len(results),
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now().isoformat(),
            }

            # Insert into cache
            def insert_sync():
                return self.client.table("search_cache").insert(cache_entry).execute()
            
            await asyncio.to_thread(insert_sync)

            print(
                f"✓ Cached {len(results)} results for {part_number} (expires in {self.cache_duration_hours}h)"
            )
            return True

        except Exception as e:
            print(f"⚠️  Cache storage error: {e}")
            return False

    async def invalidate_cache(self, part_number: str) -> bool:
        """
        Manually invalidate (delete) cache for a specific part number.

        Args:
            part_number: The part number to invalidate

        Returns:
            True if successful
        """
        if not self.enabled:
            return False

        try:
            part_number_normalized = part_number.upper().strip()
            self.client.table("search_cache").delete().eq(
                "part_number", part_number_normalized
            ).execute()
            print(f"✓ Cache invalidated for {part_number}")
            return True
        except Exception as e:
            print(f"⚠️  Cache invalidation error: {e}")
            return False

    async def cleanup_expired(self) -> int:
        """
        Delete all expired cache entries.

        Returns:
            Number of entries deleted
        """
        if not self.enabled:
            return 0

        try:
            response = self.client.rpc("delete_expired_cache").execute()
            count = response.data if response.data else 0
            print(f"✓ Cleaned up {count} expired cache entries")
            return count
        except Exception as e:
            print(f"⚠️  Cache cleanup error: {e}")
            return 0

    def _get_cache_age(self, created_at_str: str) -> str:
        """Helper to calculate cache age for logging"""
        try:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            age = datetime.now() - created_at.replace(tzinfo=None)

            if age.seconds < 60:
                return f"{age.seconds}s"
            elif age.seconds < 3600:
                return f"{age.seconds // 60}m"
            else:
                return f"{age.seconds // 3600}h"
        except:
            return "unknown"


# Singleton instance
_cache_manager_instance = None


def get_cache_manager() -> CacheManager:
    """Get or create the cache manager singleton"""
    global _cache_manager_instance
    if _cache_manager_instance is None:
        _cache_manager_instance = CacheManager()
    return _cache_manager_instance
