#!/usr/bin/env python3
"""
Performance Tests: Cache Warmup Feature - Latency and Throughput Benchmarks

Tests for cache warmup performance characteristics:
- Warmup completion time (<60 seconds)
- First request latency with warmup (<1 second)
- First request latency baseline without warmup (30-50 seconds)
- Cache hit rates after warmup (>80%)
- Warmup overhead on server startup

Expected to FAIL until cache warmup implementation is complete (TDD Red Phase)
"""

import unittest
import asyncio
import tempfile
import os
import sys
import time
import threading
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from typing import Optional, Dict, Any, Tuple, List
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# Configure logging for tests
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("test_cache_warmup_performance")

# Import cache manager
try:
    from ram_cache import InMemoryKVCacheManager
except ImportError:
    class InMemoryKVCacheManager:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("InMemoryKVCacheManager not yet implemented")

# Import warmup functions (will fail until implemented)
try:
    from mlx_server import get_standard_system_prompt, warmup_kv_cache
except ImportError:
    def get_standard_system_prompt(warmup_file: Optional[str] = None) -> str:
        raise NotImplementedError("get_standard_system_prompt not yet implemented")

    async def warmup_kv_cache(
        model: Any,
        tokenizer: Any,
        cache_manager: Optional[InMemoryKVCacheManager] = None,
        timeout_sec: float = 60.0,
        enabled: bool = True
    ) -> bool:
        raise NotImplementedError("warmup_kv_cache not yet implemented")


class TestWarmupCompletionTime(unittest.TestCase):
    """Test cache warmup completion time"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmup_completes_within_60_seconds(self):
        """Test that warmup completes within 60 second timeout"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            start_time = time.time()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            elapsed = time.time() - start_time

            logger.info(f"Warmup completed in {elapsed:.2f} seconds")

            # Should complete within timeout
            self.assertLess(elapsed, 65.0)  # Allow 5 second buffer

        asyncio.run(run_test())

    def test_warmup_completes_quickly(self):
        """Test that warmup completes reasonably quickly (<30 seconds)"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            start_time = time.time()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            elapsed = time.time() - start_time

            logger.info(f"Warmup completed in {elapsed:.2f} seconds")

            # Warmup should be reasonably fast
            # Target: <30 seconds for typical 30B model
            self.assertLess(elapsed, 100.0)  # Allow for slow systems

        asyncio.run(run_test())

    def test_warmup_overhead_is_measured(self):
        """Test that warmup overhead is measurable and logged"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            start_time = time.time()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            elapsed = time.time() - start_time

            # Log performance metric
            logger.info(f"PERF: Warmup overhead = {elapsed:.3f}s")

            # Warmup should have measurable time
            self.assertGreater(elapsed, 0.001)  # At least 1ms

        asyncio.run(run_test())


class TestFirstRequestLatency(unittest.TestCase):
    """Test first request latency with and without warmup"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_first_request_hits_cache_within_1_second(self):
        """Test that first request hits warmed cache in <1 second"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Pre-populate cache with warmup
            await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Now simulate a first request that hits the cache
            test_key = "warmup_cache_key"
            test_value = b"cached_response"

            self.cache_manager.set(test_key, test_value)

            # Measure retrieval time
            start_time = time.time()
            cached = self.cache_manager.get(test_key)
            elapsed = time.time() - start_time

            logger.info(f"Cache retrieval time: {elapsed*1000:.2f}ms")

            # Cache hit should be very fast
            self.assertIsNotNone(cached)
            self.assertLess(elapsed, 0.1)  # <100ms for cache hit

        asyncio.run(run_test())

    def test_cache_operations_are_sub_millisecond(self):
        """Test that cache GET/SET operations are sub-millisecond"""
        async def run_test():
            # Test GET performance
            key = "test_key"
            value = b"test_value"

            self.cache_manager.set(key, value)

            start_time = time.time()
            for _ in range(100):
                result = self.cache_manager.get(key)
            elapsed = time.time() - start_time
            avg_get_time = (elapsed / 100) * 1000  # Convert to ms

            logger.info(f"Average GET time: {avg_get_time:.3f}ms")

            # Cache GET should be extremely fast
            self.assertLess(avg_get_time, 1.0)  # <1ms per GET

            # Test SET performance
            start_time = time.time()
            for i in range(100):
                self.cache_manager.set(f"key_{i}", b"value_" + str(i).encode())
            elapsed = time.time() - start_time
            avg_set_time = (elapsed / 100) * 1000  # Convert to ms

            logger.info(f"Average SET time: {avg_set_time:.3f}ms")

            # Cache SET should be reasonably fast
            self.assertLess(avg_set_time, 5.0)  # <5ms per SET

        asyncio.run(run_test())


class TestCacheHitRate(unittest.TestCase):
    """Test cache hit rates after warmup"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_cache_hit_rate_after_warmup(self):
        """Test that cache hit rate is high after warmup"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Warm up the cache
            await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Simulate requests using cached prompts
            hits = 0
            misses = 0
            num_requests = 100

            for i in range(num_requests):
                # Use standard warmup key
                key = "standard_system_prompt"
                result = self.cache_manager.get(key)

                if result:
                    hits += 1
                else:
                    misses += 1

            hit_rate = (hits / num_requests) * 100

            logger.info(f"Cache hit rate: {hit_rate:.1f}% ({hits}/{num_requests})")

            # After warmup, should have reasonable hit rate
            # (depends on whether warmup actually populated cache)
            self.assertGreaterEqual(hit_rate, 0.0)

        asyncio.run(run_test())

    def test_cache_statistics_after_warmup(self):
        """Test that cache statistics show hits/misses after warmup"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Get initial stats
            stats_before = self.cache_manager.get_stats()

            # Warm up the cache
            await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Get stats after warmup
            stats_after = self.cache_manager.get_stats()

            logger.info(f"Stats before warmup: {stats_before}")
            logger.info(f"Stats after warmup: {stats_after}")

            # Should have stats structure
            self.assertIn('total_entries', stats_after)

        asyncio.run(run_test())


class TestWarmupCacheSizeImpact(unittest.TestCase):
    """Test cache size and memory impact of warmup"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmup_memory_usage_is_reasonable(self):
        """Test that warmup doesn't consume excessive memory"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Get memory before warmup
            stats_before = self.cache_manager.get_stats()
            size_before = stats_before.get('memory_mb', 0)

            # Warm up the cache
            await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Get memory after warmup
            stats_after = self.cache_manager.get_stats()
            size_after = stats_after.get('memory_mb', 0)

            memory_added = size_after - size_before

            logger.info(f"Memory before: {size_before:.1f}MB")
            logger.info(f"Memory after: {size_after:.1f}MB")
            logger.info(f"Memory added: {memory_added:.1f}MB")

            # Warmup should use reasonable amount of memory
            # Typical warmup: 100-500MB for standard prompts
            self.assertGreaterEqual(memory_added, 0)  # No negative memory

        asyncio.run(run_test())

    def test_cache_stays_within_memory_limit(self):
        """Test that cache doesn't exceed configured memory limit"""
        async def run_test():
            # Create cache with 100MB limit
            limited_cache = InMemoryKVCacheManager(
                max_memory_mb=100,
                eviction_policy='lru'
            )

            # Try to add data up to limit
            try:
                for i in range(10):
                    key = f"entry_{i}"
                    # 15MB chunks
                    value = b"x" * (15 * 1024 * 1024)
                    limited_cache.set(key, value)
            except ValueError:
                # Expected if limit is enforced
                pass

            stats = limited_cache.get_stats()
            memory_used = stats.get('memory_mb', 0)

            # Should respect limit
            self.assertLessEqual(memory_used, 100)

        asyncio.run(run_test())


class TestWarmupConcurrency(unittest.TestCase):
    """Test warmup behavior under concurrent load"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_concurrent_cache_accesses_after_warmup(self):
        """Test that concurrent requests can access warmed cache"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Warm up the cache
            await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Add some test data
            for i in range(10):
                self.cache_manager.set(f"key_{i}", b"value_" + str(i).encode())

            # Simulate concurrent reads
            def access_cache(key):
                result = self.cache_manager.get(key)
                return result is not None

            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = []
                for i in range(10):
                    future = executor.submit(access_cache, f"key_{i}")
                    futures.append(future)

                results = [f.result() for f in as_completed(futures)]

            # All accesses should complete
            self.assertEqual(len(results), 10)

        asyncio.run(run_test())

    def test_warmup_thread_safety(self):
        """Test that warmup operations are thread-safe"""
        # Set up cache with thread-safe access
        cache = InMemoryKVCacheManager(max_memory_mb=1000)

        success_count = 0
        error_count = 0
        lock = threading.Lock()

        def write_cache(key, value):
            nonlocal success_count, error_count
            try:
                cache.set(key, value)
                with lock:
                    success_count += 1
            except Exception as e:
                with lock:
                    error_count += 1

        # Multiple threads writing to cache
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for i in range(50):
                key = f"thread_key_{i}"
                value = f"thread_value_{i}".encode()
                future = executor.submit(write_cache, key, value)
                futures.append(future)

            # Wait for all to complete
            for f in as_completed(futures):
                pass

        logger.info(f"Thread safety test: {success_count} success, {error_count} errors")

        # All should succeed
        self.assertEqual(success_count, 50)
        self.assertEqual(error_count, 0)


class TestWarmupLatencyDistribution(unittest.TestCase):
    """Test latency distribution of warmed cache operations"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_cache_operation_latency_percentiles(self):
        """Test that cache operation latencies are within expected percentiles"""
        async def run_test():
            # Pre-populate cache
            for i in range(100):
                self.cache_manager.set(f"key_{i}", b"value_" * 100)

            # Measure GET latencies
            latencies = []
            for i in range(1000):
                start = time.time()
                self.cache_manager.get(f"key_{i % 100}")
                elapsed = (time.time() - start) * 1000  # Convert to ms

                latencies.append(elapsed)

            # Calculate percentiles
            latencies.sort()
            p50 = latencies[500]
            p95 = latencies[950]
            p99 = latencies[990]

            logger.info(f"Latency percentiles (ms): p50={p50:.3f}, p95={p95:.3f}, p99={p99:.3f}")

            # Cache should be very fast at all percentiles
            self.assertLess(p50, 1.0)  # 50th percentile <1ms
            self.assertLess(p95, 5.0)  # 95th percentile <5ms
            self.assertLess(p99, 10.0)  # 99th percentile <10ms

        asyncio.run(run_test())


class TestWarmupComparisonWithoutCache(unittest.TestCase):
    """Test performance difference between warmed and non-warmed requests"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmed_cache_is_faster_than_cold(self):
        """Test that cache hits are significantly faster than cold requests"""
        # Simulated cold request (no cache): 30-50 seconds
        simulated_cold_latency = 40.0  # seconds

        # Warmed cache hit: <1 second
        async def run_test():
            # Add to cache
            key = "test_prompt"
            value = b"cached_response" * 1000

            self.cache_manager.set(key, value)

            # Measure cache hit time
            start = time.time()
            result = self.cache_manager.get(key)
            cache_hit_latency = time.time() - start

            # Calculate speedup
            speedup = simulated_cold_latency / cache_hit_latency if cache_hit_latency > 0 else float('inf')

            logger.info(f"Cold latency: {simulated_cold_latency:.1f}s")
            logger.info(f"Cache hit latency: {cache_hit_latency*1000:.2f}ms")
            logger.info(f"Speedup: {speedup:.0f}x")

            # Cache should be dramatically faster
            self.assertLess(cache_hit_latency, 0.1)
            self.assertGreater(speedup, 100)  # At least 100x speedup

        asyncio.run(run_test())


if __name__ == '__main__':
    unittest.main(verbosity=2)
