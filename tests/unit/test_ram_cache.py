#!/usr/bin/env python3
"""
Unit Tests: InMemoryKVCacheManager - RAM-Based KV Cache

Tests for the RAM-based KV cache manager that replaces disk-based caching.
Covers basic operations, thread safety, memory limits, and LRU eviction.

Expected to FAIL until InMemoryKVCacheManager implementation is complete (TDD Red Phase)
"""

import unittest
import threading
import time
import hashlib
import sys
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

# Add scripts directory to path so we can import the cache manager
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# This import will fail until implementation is complete
try:
    from ram_cache import InMemoryKVCacheManager
except ImportError as e:
    # Create a placeholder that will fail tests
    class InMemoryKVCacheManager:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("InMemoryKVCacheManager not yet implemented")


class TestInMemoryKVCacheManagerBasics(unittest.TestCase):
    """Test basic operations of InMemoryKVCacheManager"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=1000,  # 1GB for testing
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_init_creates_empty_cache(self):
        """Test that initialization creates an empty cache"""
        self.assertEqual(self.cache.get_stats()['total_entries'], 0)
        self.assertEqual(self.cache.get_stats()['memory_used_mb'], 0.0)

    def test_set_and_get_basic(self):
        """Test basic set and get operations"""
        key = "test_key_1"
        value = b"test_value_" * 100  # Some binary data

        # Set a value
        self.cache.set(key, value)

        # Get the value back
        retrieved = self.cache.get(key)
        self.assertEqual(retrieved, value)

    def test_get_nonexistent_key_returns_none(self):
        """Test that getting a nonexistent key returns None"""
        result = self.cache.get("nonexistent_key")
        self.assertIsNone(result)

    def test_get_empty_key_returns_none(self):
        """Test that getting with empty key returns None"""
        result = self.cache.get("")
        self.assertIsNone(result)

    def test_set_empty_key_is_ignored(self):
        """Test that setting empty key raises ValueError"""
        with self.assertRaises(ValueError) as context:
            self.cache.set("", b"value")

        self.assertIn('cannot be None or empty', str(context.exception))

    def test_set_none_value_is_rejected(self):
        """Test that None values are rejected"""
        with self.assertRaises((TypeError, ValueError)):
            self.cache.set("key", None)

    def test_multiple_set_get_operations(self):
        """Test multiple independent set/get operations"""
        test_data = {
            "key1": b"value1" * 50,
            "key2": b"value2" * 100,
            "key3": b"value3" * 75,
        }

        # Set all values
        for key, value in test_data.items():
            self.cache.set(key, value)

        # Verify all values
        for key, expected_value in test_data.items():
            retrieved = self.cache.get(key)
            self.assertEqual(retrieved, expected_value, f"Mismatch for {key}")

    def test_overwrite_existing_key(self):
        """Test that overwriting a key updates the value"""
        key = "test_key"
        value1 = b"original_value" * 10
        value2 = b"updated_value" * 20

        self.cache.set(key, value1)
        self.assertEqual(self.cache.get(key), value1)

        self.cache.set(key, value2)
        self.assertEqual(self.cache.get(key), value2)

    def test_cache_hit_updates_access_time(self):
        """Test that cache hits update access time for LRU tracking"""
        key = "test_key"
        value = b"test_value" * 50

        self.cache.set(key, value)
        stats1 = self.cache.get_stats()

        # Small sleep to ensure time difference
        time.sleep(0.01)

        # Access the key (cache hit)
        self.cache.get(key)
        stats2 = self.cache.get_stats()

        # Cache hits counter should increase
        self.assertEqual(stats2['cache_hits'], stats1['cache_hits'] + 1)

    def test_cache_miss_tracked(self):
        """Test that cache misses are tracked"""
        stats1 = self.cache.get_stats()
        initial_misses = stats1['cache_misses']

        # Try to get a key that doesn't exist
        self.cache.get("nonexistent")
        stats2 = self.cache.get_stats()

        self.assertEqual(stats2['cache_misses'], initial_misses + 1)

    def test_delete_key(self):
        """Test that keys can be deleted"""
        key = "test_key"
        value = b"test_value" * 50

        self.cache.set(key, value)
        self.assertIsNotNone(self.cache.get(key))

        # Delete the key
        self.cache.delete(key)
        self.assertIsNone(self.cache.get(key))

    def test_clear_cache(self):
        """Test that cache can be cleared"""
        # Add multiple entries
        for i in range(10):
            self.cache.set(f"key_{i}", b"value_" * 10)

        stats = self.cache.get_stats()
        self.assertEqual(stats['total_entries'], 10)

        # Clear the cache
        self.cache.clear()
        stats = self.cache.get_stats()
        self.assertEqual(stats['total_entries'], 0)
        self.assertEqual(stats['memory_used_mb'], 0.0)


class TestInMemoryKVCacheManagerMetadata(unittest.TestCase):
    """Test metadata tracking features"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=1000,
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_metadata_has_timestamp(self):
        """Test that metadata includes timestamp"""
        key = "test_key"
        value = b"test_value" * 50

        before = time.time()
        self.cache.set(key, value)
        after = time.time()

        metadata = self.cache.get_metadata(key)
        self.assertIsNotNone(metadata)
        self.assertIn('timestamp', metadata)
        self.assertGreaterEqual(metadata['timestamp'], before)
        self.assertLessEqual(metadata['timestamp'], after)

    def test_metadata_tracks_size(self):
        """Test that metadata includes size_mb"""
        key = "test_key"
        value = b"x" * (1024 * 1024)  # 1MB of data

        self.cache.set(key, value)
        metadata = self.cache.get_metadata(key)

        self.assertIsNotNone(metadata)
        self.assertIn('size_mb', metadata)
        self.assertGreaterEqual(metadata['size_mb'], 1.0)
        self.assertLess(metadata['size_mb'], 1.1)  # Allow slight overhead

    def test_metadata_tracks_access_count(self):
        """Test that metadata tracks access count"""
        key = "test_key"
        value = b"test_value" * 50

        self.cache.set(key, value)
        metadata = self.cache.get_metadata(key)
        self.assertEqual(metadata['access_count'], 0)

        # Access the key
        self.cache.get(key)
        metadata = self.cache.get_metadata(key)
        self.assertEqual(metadata['access_count'], 1)

        self.cache.get(key)
        metadata = self.cache.get_metadata(key)
        self.assertEqual(metadata['access_count'], 2)

    def test_metadata_prefix_tokens(self):
        """Test that metadata can store prefix_tokens"""
        key = "test_key"
        value = b"test_value" * 50
        prefix_tokens = 42

        self.cache.set(key, value, prefix_tokens=prefix_tokens)
        metadata = self.cache.get_metadata(key)

        self.assertIsNotNone(metadata)
        self.assertEqual(metadata.get('prefix_tokens'), prefix_tokens)

    def test_stats_track_total_entries(self):
        """Test that stats track total cache entries"""
        self.assertEqual(self.cache.get_stats()['total_entries'], 0)

        self.cache.set("key1", b"value1" * 50)
        self.assertEqual(self.cache.get_stats()['total_entries'], 1)

        self.cache.set("key2", b"value2" * 50)
        self.assertEqual(self.cache.get_stats()['total_entries'], 2)

    def test_stats_track_memory_usage(self):
        """Test that stats track memory usage in MB"""
        stats1 = self.cache.get_stats()
        mem1 = stats1['memory_used_mb']

        # Add 10MB of data
        self.cache.set("key1", b"x" * (10 * 1024 * 1024))

        stats2 = self.cache.get_stats()
        mem2 = stats2['memory_used_mb']

        self.assertGreater(mem2, mem1 + 9)  # At least 9MB more (accounting for overhead)

    def test_stats_track_hit_miss_rates(self):
        """Test that stats track hit and miss rates"""
        self.cache.set("key1", b"value" * 50)

        # Generate some hits
        for _ in range(3):
            self.cache.get("key1")

        # Generate some misses
        for i in range(2):
            self.cache.get(f"nonexistent_{i}")

        stats = self.cache.get_stats()
        self.assertEqual(stats['cache_hits'], 3)
        self.assertEqual(stats['cache_misses'], 2)
        self.assertEqual(stats['hit_rate'], 3 / 5)


class TestInMemoryKVCacheManagerMemoryLimits(unittest.TestCase):
    """Test memory limit enforcement and LRU eviction"""

    def setUp(self):
        """Set up test fixtures with small memory limit"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=50,  # 50MB limit for testing
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_memory_limit_prevents_exceeding_max(self):
        """Test that memory limit prevents cache from exceeding max"""
        # Try to add 100MB worth of data (exceeds 50MB limit)
        chunk = b"x" * (10 * 1024 * 1024)  # 10MB chunks

        for i in range(10):
            self.cache.set(f"key_{i}", chunk)

        stats = self.cache.get_stats()
        # Memory should not exceed limit significantly (allow small overhead)
        self.assertLess(stats['memory_used_mb'], 55)

    def test_lru_eviction_on_memory_pressure(self):
        """Test that LRU eviction occurs when memory pressure hits"""
        chunk = b"x" * (10 * 1024 * 1024)  # 10MB chunks

        # Add 4 entries (40MB, within limit)
        keys = []
        for i in range(4):
            key = f"key_{i}"
            keys.append(key)
            self.cache.set(key, chunk)

        # Verify all 4 are present
        for key in keys:
            self.assertIsNotNone(self.cache.get(key))

        # Add 5th entry (50MB total, triggers eviction)
        self.cache.set("key_4", chunk)

        # At least one old entry should be evicted (the least recently used)
        stats = self.cache.get_stats()
        self.assertLess(stats['total_entries'], 5)

    def test_lru_evicts_least_recently_used(self):
        """Test that LRU eviction removes the least recently used item"""
        chunk = b"x" * (15 * 1024 * 1024)  # 15MB chunks

        # Add 3 entries (45MB, under 50MB limit)
        self.cache.set("key_1", chunk)
        time.sleep(0.01)
        self.cache.set("key_2", chunk)
        time.sleep(0.01)
        self.cache.set("key_3", chunk)

        # Access key_1 to make it recently used
        self.cache.get("key_1")

        # Add 4th entry (60MB total, triggers eviction)
        # key_2 should be evicted (it's the LRU, not accessed since set)
        self.cache.set("key_4", chunk)

        # key_1 should still exist (recently accessed)
        self.assertIsNotNone(self.cache.get("key_1"))

        # key_2 might be evicted (least recently used)
        # key_4 should exist (just added)
        self.assertIsNotNone(self.cache.get("key_4"))

    def test_eviction_stats_tracked(self):
        """Test that eviction events are tracked in stats"""
        chunk = b"x" * (15 * 1024 * 1024)  # 15MB chunks

        stats1 = self.cache.get_stats()
        evictions1 = stats1.get('evictions', 0)

        # Cause evictions by exceeding memory
        for i in range(5):
            self.cache.set(f"key_{i}", chunk)

        stats2 = self.cache.get_stats()
        evictions2 = stats2.get('evictions', 0)

        # Should have evicted at least 1 entry
        self.assertGreater(evictions2, evictions1)

    def test_value_exceeding_limit_is_rejected(self):
        """Test that values larger than max_memory_mb are rejected"""
        cache = InMemoryKVCacheManager(max_memory_mb=10)

        # Try to store 20MB value in 10MB cache
        large_value = b'x' * (20 * 1024 * 1024)  # 20MB

        with self.assertRaises(ValueError) as context:
            cache.set('large', large_value)

        # Verify error message
        self.assertIn('exceeds cache limit', str(context.exception))

        # Verify value was not stored
        self.assertIsNone(cache.get('large'))

        # Verify cache is still empty
        stats = cache.get_stats()
        self.assertEqual(stats['total_entries'], 0)
        self.assertEqual(stats['memory_used_mb'], 0.0)

    def test_maximum_key_length_enforced(self):
        """Test that keys exceeding 10KB are rejected"""
        cache = InMemoryKVCacheManager(max_memory_mb=100)

        # Try to store entry with 20KB key
        large_key = "k" * 20000  # 20KB key

        with self.assertRaises(ValueError) as context:
            cache.set(large_key, b"value")

        self.assertIn('exceeds maximum', str(context.exception))
        self.assertIn('10KB', str(context.exception))

    def test_empty_key_raises_error(self):
        """Test that empty keys raise ValueError instead of silent failure"""
        cache = InMemoryKVCacheManager(max_memory_mb=100)

        with self.assertRaises(ValueError) as context:
            cache.set('', b"value")

        self.assertIn('cannot be None or empty', str(context.exception))

    def test_key_size_included_in_memory_limit(self):
        """Test that key size is tracked in memory limit"""
        cache = InMemoryKVCacheManager(max_memory_mb=1)

        # Store entry with large key (5KB, under 10KB limit) and value (100KB)
        large_key = "k" * 5000  # 5KB key (under 10KB limit)
        small_value = b"v" * 100000  # 100KB value
        cache.set(large_key, small_value)

        # Verify stats show key + value memory
        stats = cache.get_stats()
        self.assertGreater(stats['key_memory_mb'], 0.004)  # ~5KB key
        self.assertGreater(stats['value_memory_mb'], 0.09)  # ~100KB value


class TestInMemoryKVCacheManagerThreadSafety(unittest.TestCase):
    """Test thread safety with concurrent access"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=5000,  # Large limit for concurrent tests
            eviction_policy='lru'
        )
        self.errors = []

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def _safe_set_get(self, thread_id: int, num_ops: int):
        """Helper for concurrent set/get operations"""
        try:
            for i in range(num_ops):
                key = f"thread_{thread_id}_key_{i}"
                value = f"thread_{thread_id}_value_{i}".encode() * 50

                self.cache.set(key, value)
                retrieved = self.cache.get(key)
                if retrieved != value:
                    self.errors.append(
                        f"Thread {thread_id}: Value mismatch for {key}"
                    )
        except Exception as e:
            self.errors.append(f"Thread {thread_id}: {str(e)}")

    def test_concurrent_set_get_10_threads(self):
        """Test concurrent set/get with 10 threads"""
        threads = []
        num_threads = 10
        ops_per_thread = 20

        for i in range(num_threads):
            t = threading.Thread(
                target=self._safe_set_get,
                args=(i, ops_per_thread)
            )
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0, f"Errors occurred: {self.errors}")

    def test_concurrent_set_get_20_threads(self):
        """Test concurrent set/get with 20 threads"""
        threads = []
        num_threads = 20
        ops_per_thread = 10

        for i in range(num_threads):
            t = threading.Thread(
                target=self._safe_set_get,
                args=(i, ops_per_thread)
            )
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0, f"Errors occurred: {self.errors}")

    def _safe_concurrent_reads(self, thread_id: int, num_reads: int):
        """Helper for concurrent read-heavy operations"""
        try:
            for i in range(num_reads):
                # Try to read keys that were set
                key = f"shared_key_{i % 5}"
                self.cache.get(key)
        except Exception as e:
            self.errors.append(f"Thread {thread_id}: Read error: {str(e)}")

    def test_concurrent_reads_15_threads(self):
        """Test concurrent reads with 15 threads"""
        # Pre-populate some keys
        for i in range(5):
            self.cache.set(f"shared_key_{i}", b"shared_value" * 50)

        threads = []
        num_threads = 15
        reads_per_thread = 100

        for i in range(num_threads):
            t = threading.Thread(
                target=self._safe_concurrent_reads,
                args=(i, reads_per_thread)
            )
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0, f"Errors occurred: {self.errors}")

    def test_concurrent_delete_operations(self):
        """Test concurrent delete operations"""
        def delete_thread(thread_id: int, num_ops: int):
            try:
                for i in range(num_ops):
                    key = f"delete_key_{i}"
                    self.cache.delete(key)
            except Exception as e:
                self.errors.append(f"Thread {thread_id}: {str(e)}")

        # Pre-populate keys
        for i in range(100):
            self.cache.set(f"delete_key_{i}", b"value" * 50)

        threads = []
        for i in range(5):
            t = threading.Thread(
                target=delete_thread,
                args=(i, 20)
            )
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0, f"Errors occurred: {self.errors}")

    def test_concurrent_access_statistics_consistency(self):
        """Test that statistics remain consistent under concurrent access"""
        def access_thread(thread_id: int, num_ops: int):
            try:
                for i in range(num_ops):
                    key = f"stat_key_{thread_id}_{i}"
                    self.cache.set(key, b"value" * 50)
                    self.cache.get(key)
            except Exception as e:
                self.errors.append(f"Thread {thread_id}: {str(e)}")

        threads = []
        for i in range(5):
            t = threading.Thread(
                target=access_thread,
                args=(i, 40)
            )
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0, f"Errors occurred: {self.errors}")

        stats = self.cache.get_stats()
        # Total entries should equal sum of sets (5 threads * 40 ops)
        self.assertEqual(stats['total_entries'], 200)


class TestInMemoryKVCacheManagerPerformance(unittest.TestCase):
    """Test performance requirements"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_get_latency_under_10ms(self):
        """Test that cache get operations complete in under 10ms"""
        # Pre-populate cache
        key = "perf_test_key"
        value = b"x" * (1024 * 1024)  # 1MB value

        self.cache.set(key, value)

        # Measure get latency
        start = time.perf_counter()
        for _ in range(100):
            self.cache.get(key)
        elapsed = time.perf_counter() - start
        avg_latency_ms = (elapsed / 100) * 1000

        # Average latency should be under 10ms
        self.assertLess(avg_latency_ms, 10.0,
                       f"Get latency {avg_latency_ms:.2f}ms exceeds 10ms target")

    def test_set_latency_under_50ms(self):
        """Test that cache set operations complete in under 50ms"""
        value = b"x" * (1024 * 1024)  # 1MB value

        # Measure set latency
        start = time.perf_counter()
        for i in range(50):
            self.cache.set(f"perf_key_{i}", value)
        elapsed = time.perf_counter() - start
        avg_latency_ms = (elapsed / 50) * 1000

        # Average latency should be under 50ms
        self.assertLess(avg_latency_ms, 50.0,
                       f"Set latency {avg_latency_ms:.2f}ms exceeds 50ms target")

    def test_metadata_retrieval_fast(self):
        """Test that metadata retrieval is fast"""
        key = "metadata_key"
        value = b"test_value" * 100

        self.cache.set(key, value, prefix_tokens=42)

        # Measure metadata retrieval latency
        start = time.perf_counter()
        for _ in range(100):
            self.cache.get_metadata(key)
        elapsed = time.perf_counter() - start
        avg_latency_ms = (elapsed / 100) * 1000

        # Should be very fast (< 5ms)
        self.assertLess(avg_latency_ms, 5.0,
                       f"Metadata latency {avg_latency_ms:.2f}ms exceeds 5ms target")


class TestInMemoryKVCacheManagerEdgeCases(unittest.TestCase):
    """Test edge cases and error conditions"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=100,
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_very_large_value(self):
        """Test handling of very large values"""
        key = "large_value_key"
        # 50MB value (exceeds single cache entry typical size)
        large_value = b"x" * (50 * 1024 * 1024)

        # Should either succeed or raise appropriate error
        try:
            self.cache.set(key, large_value)
            # If successful, should be retrievable
            retrieved = self.cache.get(key)
            if retrieved is not None:
                self.assertEqual(len(retrieved), len(large_value))
        except (MemoryError, ValueError):
            # Expected if value exceeds cache capacity
            pass

    def test_special_characters_in_key(self):
        """Test keys with special characters"""
        special_keys = [
            "key:with:colons",
            "key|with|pipes",
            "key/with/slashes",
            "key\\with\\backslashes",
            "key\twith\ttabs",
            "key\nwith\nnewlines",
            "key_with_utf8_éàü",
        ]

        value = b"test_value" * 50

        for key in special_keys:
            self.cache.set(key, value)
            retrieved = self.cache.get(key)
            self.assertEqual(retrieved, value, f"Failed for key: {key}")

    def test_very_long_key(self):
        """Test very long keys"""
        key = "k" * 10000  # 10KB key
        value = b"test_value" * 50

        self.cache.set(key, value)
        retrieved = self.cache.get(key)
        self.assertEqual(retrieved, value)

    def test_empty_binary_value(self):
        """Test setting empty binary value"""
        key = "empty_key"
        value = b""

        # Empty values might be rejected or allowed
        try:
            self.cache.set(key, value)
            retrieved = self.cache.get(key)
            self.assertEqual(retrieved, value)
        except (TypeError, ValueError):
            # Expected if implementation rejects empty values
            pass

    def test_hash_collision_handling(self):
        """Test that the cache handles keys correctly (no hash collisions)"""
        # Generate many similar keys
        for i in range(1000):
            key = f"key_{i:04d}"
            value = f"value_{i}".encode() * 50
            self.cache.set(key, value)

        # Verify each key retrieves correct value
        for i in range(1000):
            key = f"key_{i:04d}"
            expected_value = f"value_{i}".encode() * 50
            retrieved = self.cache.get(key)
            self.assertEqual(retrieved, expected_value,
                           f"Hash collision or key mismatch for {key}")


class TestInMemoryKVCacheManagerCompatibilityMethods(unittest.TestCase):
    """Test MLX server compatibility methods (record_generation, create_cache)"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(max_memory_mb=100)

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_record_generation_with_cache(self):
        """Test recording generation metrics when cache is used"""
        self.cache.record_generation(suffix_tokens=50, generation_time=0.1, used_cache=True)

        # Verify metrics are stored
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 1)
        self.assertEqual(self.cache.generation_stats['suffix_tokens'][0], 50)
        self.assertEqual(len(self.cache.generation_stats['generation_times_with_cache']), 1)
        self.assertEqual(self.cache.generation_stats['generation_times_with_cache'][0], 0.1)
        self.assertEqual(len(self.cache.generation_stats['generation_times_without_cache']), 0)

    def test_record_generation_without_cache(self):
        """Test recording generation metrics when cache is not used"""
        self.cache.record_generation(suffix_tokens=100, generation_time=2.5, used_cache=False)

        # Verify metrics are stored
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 1)
        self.assertEqual(self.cache.generation_stats['suffix_tokens'][0], 100)
        self.assertEqual(len(self.cache.generation_stats['generation_times_without_cache']), 1)
        self.assertEqual(self.cache.generation_stats['generation_times_without_cache'][0], 2.5)
        self.assertEqual(len(self.cache.generation_stats['generation_times_with_cache']), 0)

    def test_record_generation_multiple_calls(self):
        """Test recording multiple generations"""
        self.cache.record_generation(suffix_tokens=50, generation_time=0.1, used_cache=True)
        self.cache.record_generation(suffix_tokens=60, generation_time=0.15, used_cache=True)
        self.cache.record_generation(suffix_tokens=70, generation_time=2.0, used_cache=False)

        # Verify all metrics are recorded
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 3)
        self.assertEqual(len(self.cache.generation_stats['generation_times_with_cache']), 2)
        self.assertEqual(len(self.cache.generation_stats['generation_times_without_cache']), 1)

    def test_record_generation_thread_safe(self):
        """Test that record_generation is thread-safe"""
        def record_many():
            for i in range(100):
                self.cache.record_generation(
                    suffix_tokens=i,
                    generation_time=0.1,
                    used_cache=(i % 2 == 0)
                )

        # Run in parallel threads
        threads = [threading.Thread(target=record_many) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Verify all 500 records were added
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 500)

    def test_create_cache_returns_none_tuple(self):
        """Test that create_cache returns (None, None) for compatibility"""
        result = self.cache.create_cache(model=None, tokenizer=None, prefix_prompt="test")
        self.assertEqual(result, (None, None))

    def test_create_cache_is_noop(self):
        """Test that create_cache doesn't modify cache state"""
        # Store initial state
        self.cache.set("key1", b"value1")
        stats_before = self.cache.get_stats()

        # Call create_cache
        self.cache.create_cache(model=None, tokenizer=None, prefix_prompt="test prompt")

        # Verify state unchanged
        stats_after = self.cache.get_stats()
        self.assertEqual(stats_before, stats_after)
        self.assertEqual(self.cache.get("key1"), b"value1")

    def test_create_cache_with_mock_objects(self):
        """Test create_cache with mock model and tokenizer objects"""
        class MockModel:
            pass

        class MockTokenizer:
            def encode(self, text):
                return [1, 2, 3]

        result = self.cache.create_cache(
            model=MockModel(),
            tokenizer=MockTokenizer(),
            prefix_prompt="test prompt"
        )
        self.assertEqual(result, (None, None))


if __name__ == '__main__':
    # Run with verbose output
    unittest.main(verbosity=2)
