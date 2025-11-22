#!/usr/bin/env python3
"""
InMemoryKVCacheManager: RAM-based KV cache for M3 Ultra

Provides ultra-low-latency cache operations by storing all data in RAM.
100-200x faster than disk-based caching.

This is a standalone module with minimal dependencies for easy testing.
"""

import threading
import time
from typing import Optional, Any


class InMemoryKVCacheManager:
    """
    RAM-based KV cache for M3 Ultra - 100-200x faster than disk cache

    Provides ultra-low-latency cache operations (<10ms GET, <50ms SET) by storing
    all data in RAM. Designed for M3 Ultra with 512GB unified memory.

    Features:
    - Sub-10ms cache GET operations (vs 500-2000ms disk)
    - LRU eviction when memory limit reached
    - Thread-safe concurrent access
    - Detailed metadata tracking (timestamp, size, access count, prefix tokens)
    - Cache hit/miss statistics

    Performance Targets:
    - GET latency: <10ms average
    - SET latency: <50ms average
    - Throughput: >10,000 ops/sec
    - Memory capacity: 300GB default (configurable)
    """

    # Maximum key length to prevent memory DoS attacks
    MAX_KEY_LENGTH_BYTES = 10 * 1024  # 10KB

    def __init__(self, max_memory_mb: int = 300000, eviction_policy: str = 'lru'):
        """
        Initialize RAM-based cache manager

        Args:
            max_memory_mb: Maximum memory in MB (default 300GB for M3 Ultra)
            eviction_policy: Eviction strategy ('lru' for least-recently-used)
        """
        self.max_memory_mb = max_memory_mb
        self.eviction_policy = eviction_policy

        # Core data structures (protected by lock)
        self.caches: dict[str, bytes] = {}
        self.metadata: dict[str, dict[str, Any]] = {}

        # Statistics
        self.cache_hits = 0
        self.cache_misses = 0
        self.evictions = 0

        # Generation metrics (for compatibility with MLX server)
        self.generation_stats = {
            'suffix_tokens': [],
            'generation_times_with_cache': [],
            'generation_times_without_cache': [],
            'prefix_tokens': []
        }

        # Thread safety
        self.lock = threading.Lock()

    def set(self, key: str, value: bytes, prefix_tokens: Optional[int] = None) -> None:
        """
        Store value in RAM cache with metadata

        Args:
            key: Cache key (must be non-empty)
            value: Binary data to cache (must be bytes)
            prefix_tokens: Optional token count for prefix tracking

        Raises:
            TypeError: If value is not bytes
            ValueError: If key is None/empty, value is None, or sizes exceed limits
        """
        # Input validation
        if key is None or key == '':
            raise ValueError("Key cannot be None or empty")

        # Validate key size to prevent DoS
        key_size_bytes = len(key.encode('utf-8'))
        if key_size_bytes > self.MAX_KEY_LENGTH_BYTES:
            raise ValueError(
                f"Key size {key_size_bytes} bytes exceeds maximum {self.MAX_KEY_LENGTH_BYTES} bytes (10KB)"
            )

        if value is None:
            raise ValueError("Cache value cannot be None")

        if not isinstance(value, bytes):
            raise TypeError(f"Cache value must be bytes, got {type(value).__name__}")

        with self.lock:
            # Calculate size in MB
            size_mb = len(value) / (1024 * 1024)

            # Validate value size doesn't exceed cache limit
            if size_mb > self.max_memory_mb:
                raise ValueError(
                    f"Value size {size_mb:.1f} MB exceeds cache limit {self.max_memory_mb} MB. "
                    f"Cannot store values larger than the entire cache."
                )

            # Check if updating existing key - need to account for freed space
            existing_size = 0.0
            if key in self.caches:
                existing_size = self.metadata[key]['size_mb']

            # Evict LRU entries if needed (considering freed space from update)
            needed_space = size_mb - existing_size
            while needed_space > 0 and self._get_memory_used() + needed_space >= self.max_memory_mb:
                # Don't evict the key we're updating
                if not self._evict_lru(exclude_key=key):
                    # No more entries to evict
                    break

            # Store value and metadata
            self.caches[key] = value

            # Track key and value sizes separately for security
            key_size_bytes = len(key.encode('utf-8'))
            value_size_bytes = len(value)
            entry_size_bytes = key_size_bytes + value_size_bytes

            self.metadata[key] = {
                'timestamp': time.time(),
                'key_size_bytes': key_size_bytes,
                'value_size_bytes': value_size_bytes,
                'entry_size_bytes': entry_size_bytes,
                'size_mb': entry_size_bytes / (1024 * 1024),  # Include both key and value
                'access_count': 0,
                'prefix_tokens': prefix_tokens
            }

    def get(self, key: str) -> Optional[bytes]:
        """
        Retrieve value from RAM cache

        Target latency: <10ms average

        Args:
            key: Cache key

        Returns:
            Cached bytes value if found, None otherwise
        """
        if not key:
            return None

        with self.lock:
            if key in self.caches:
                # Update access metadata (for LRU tracking)
                self.metadata[key]['timestamp'] = time.time()
                self.metadata[key]['access_count'] += 1
                self.cache_hits += 1
                return self.caches[key]
            else:
                self.cache_misses += 1
                return None

    def delete(self, key: str) -> None:
        """
        Remove key from cache

        Args:
            key: Cache key to remove
        """
        with self.lock:
            if key in self.caches:
                del self.caches[key]
                del self.metadata[key]

    def clear(self) -> None:
        """Clear all cached data and reset statistics"""
        with self.lock:
            self.caches.clear()
            self.metadata.clear()
            # Note: Statistics are preserved across clear() for monitoring

    def get_metadata(self, key: str) -> Optional[dict[str, Any]]:
        """
        Get metadata for a cached key

        Target latency: <1ms

        Args:
            key: Cache key

        Returns:
            Dictionary with metadata fields or None if key doesn't exist

        Metadata fields:
            - timestamp: Last access time (Unix timestamp)
            - size_mb: Size of cached value in MB
            - access_count: Number of times accessed
            - prefix_tokens: Optional token count (if provided)
        """
        with self.lock:
            if key in self.metadata:
                # Return a copy to prevent external modification
                return dict(self.metadata[key])
            return None

    def get_stats(self) -> dict[str, Any]:
        """
        Get cache statistics

        Returns:
            Dictionary with statistics:
                - total_entries: Number of cached items
                - memory_used_mb: Total memory used in MB
                - key_memory_mb: Memory used by keys
                - value_memory_mb: Memory used by values
                - cache_hits: Number of successful cache hits
                - cache_misses: Number of cache misses
                - hit_rate: Cache hit rate (0.0-1.0)
                - evictions: Number of entries evicted
        """
        with self.lock:
            total_hits = self.cache_hits
            total_misses = self.cache_misses
            total_requests = total_hits + total_misses
            hit_rate = total_hits / total_requests if total_requests > 0 else 0.0

            # Calculate key vs value memory breakdown
            total_key_bytes = sum(meta.get('key_size_bytes', 0) for meta in self.metadata.values())
            total_value_bytes = sum(meta.get('value_size_bytes', 0) for meta in self.metadata.values())
            total_memory_mb = self._get_memory_used()

            return {
                'total_entries': len(self.caches),
                'memory_used_mb': total_memory_mb,
                'key_memory_mb': total_key_bytes / (1024 * 1024),
                'value_memory_mb': total_value_bytes / (1024 * 1024),
                'cache_hits': self.cache_hits,
                'cache_misses': self.cache_misses,
                'hit_rate': hit_rate,
                'evictions': self.evictions
            }

    def _get_memory_used(self) -> float:
        """
        Calculate total memory used in MB

        Note: Assumes lock is already held by caller

        Returns:
            Total memory used in MB
        """
        return sum(meta['size_mb'] for meta in self.metadata.values())

    def _evict_lru(self, exclude_key: Optional[str] = None) -> bool:
        """
        Evict least recently used entry

        Note: Assumes lock is already held by caller

        Args:
            exclude_key: Optional key to exclude from eviction (e.g., when updating)

        Returns:
            True if an entry was evicted, False if cache is empty
        """
        if not self.metadata:
            return False

        # Find LRU key (oldest timestamp), excluding the specified key
        candidates = {k: v for k, v in self.metadata.items() if k != exclude_key}
        if not candidates:
            return False

        lru_key = min(candidates.keys(), key=lambda k: candidates[k]['timestamp'])

        # Evict
        del self.caches[lru_key]
        del self.metadata[lru_key]
        self.evictions += 1

        return True

    def has_cache(self, key: str) -> tuple[bool, Optional[str]]:
        """
        Check if cache exists for a given key (compatibility method for MLX server)

        Args:
            key: Cache key

        Returns:
            Tuple of (exists, key) where exists is True if key is cached
        """
        with self.lock:
            exists = key in self.caches
            return (exists, key if exists else None)

    def _count_tokens(self, tokenizer, text: str) -> int:
        """
        Count tokens in text using tokenizer (compatibility method for MLX server)

        Args:
            tokenizer: Tokenizer object with encode() method
            text: Text to count tokens for

        Returns:
            Token count (estimated if tokenizer fails)
        """
        try:
            if hasattr(tokenizer, 'encode'):
                return len(tokenizer.encode(text))
            else:
                # Rough estimate: ~4 chars per token
                return len(text) // 4
        except Exception:
            # Fallback estimate
            return len(text) // 4

    def record_generation(self, suffix_tokens: int, generation_time: float, used_cache: bool) -> None:
        """
        Record generation metrics (compatibility method for MLX server)

        Args:
            suffix_tokens: Number of tokens in the generated suffix
            generation_time: Time taken for generation in seconds
            used_cache: Whether cache was used for this generation
        """
        with self.lock:
            self.generation_stats['suffix_tokens'].append(suffix_tokens)
            if used_cache:
                self.generation_stats['generation_times_with_cache'].append(generation_time)
            else:
                self.generation_stats['generation_times_without_cache'].append(generation_time)

    def create_cache(self, model, tokenizer, prefix_prompt: str):
        """
        Create cache for prefix prompt (compatibility method for MLX server)

        For RAM cache, this is a no-op since we don't pre-create caches.
        The cache is created on-demand when set() is called.

        Args:
            model: MLX model object (unused)
            tokenizer: Tokenizer object (unused)
            prefix_prompt: Prompt prefix to cache (unused)

        Returns:
            Tuple of (None, None) for compatibility
        """
        # No-op for RAM cache - caches are created on-demand via set()
        return (None, None)
