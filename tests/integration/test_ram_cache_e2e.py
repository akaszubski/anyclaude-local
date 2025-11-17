#!/usr/bin/env python3
"""
Integration Tests: InMemoryKVCacheManager - End-to-End Workflow

Tests the RAM-based KV cache in realistic server scenarios.
Covers cache usage in message processing, concurrent requests, and performance.

Expected to FAIL until InMemoryKVCacheManager implementation is complete (TDD Red Phase)
"""

import unittest
import threading
import time
import sys
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# Import the cache manager
try:
    from ram_cache import InMemoryKVCacheManager
except ImportError:
    class InMemoryKVCacheManager:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("InMemoryKVCacheManager not yet implemented")


class TestRAMCacheE2EBasics(unittest.TestCase):
    """Test basic end-to-end cache workflows"""

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

    def test_cache_persistence_across_requests(self):
        """Test that cache persists across multiple simulated requests"""
        # Simulate request 1: Set some cache entries
        request_id = "request_1"
        prompt = "What is the capital of France?" * 10
        response = "The capital of France is Paris." * 5
        key = f"{request_id}:prompt_cache"

        self.cache.set(key, prompt.encode(), prefix_tokens=100)

        # Simulate request 2: Verify cache still exists
        retrieved = self.cache.get(key)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.decode(), prompt)

        # Simulate request 3: Add more entries
        key2 = f"{request_id}:response_cache"
        self.cache.set(key2, response.encode())

        # Verify both caches exist
        self.assertIsNotNone(self.cache.get(key))
        self.assertIsNotNone(self.cache.get(key2))

    def test_cache_with_different_data_types(self):
        """Test cache with various binary data types"""
        test_cases = [
            ("json_data", json.dumps({"model": "qwen", "tokens": 42}).encode()),
            ("token_ids", bytes(range(256))),
            ("embeddings", (b"x" * 4096)),  # Embedding-sized data
            ("model_weights_chunk", b"\x00\x01\x02" * 1000),
        ]

        for name, data in test_cases:
            key = f"test_{name}"
            self.cache.set(key, data)
            retrieved = self.cache.get(key)
            self.assertEqual(retrieved, data, f"Mismatch for {name}")

    def test_prefix_token_metadata_usage(self):
        """Test that prefix_tokens metadata is used for cache decisions"""
        # Simulate caching prefix with token count
        prefix_key = "prefix_cache"
        prefix_data = b"System: You are a helpful coding assistant." * 50
        prefix_tokens = 150  # Approximate token count

        self.cache.set(prefix_key, prefix_data, prefix_tokens=prefix_tokens)
        metadata = self.cache.get_metadata(prefix_key)

        self.assertEqual(metadata['prefix_tokens'], prefix_tokens)

    def test_cache_effectiveness_with_repeated_requests(self):
        """Test cache effectiveness for repeated similar requests"""
        prompt = "Explain machine learning" * 20
        key = "ml_explanation_cache"

        # First request (cache miss)
        stats1 = self.cache.get_stats()
        miss1 = stats1['cache_misses']

        # Simulate cache miss
        self.cache.get(key)

        stats2 = self.cache.get_stats()
        self.assertGreater(stats2['cache_misses'], miss1)

        # Set the cache
        self.cache.set(key, prompt.encode(), prefix_tokens=200)

        # Second request (cache hit)
        hit_stats_before = self.cache.get_stats()['cache_hits']
        self.cache.get(key)
        hit_stats_after = self.cache.get_stats()['cache_hits']

        self.assertGreater(hit_stats_after, hit_stats_before)

    def test_multi_request_session_workflow(self):
        """Test realistic multi-request session"""
        session_id = "session_123"

        # Request 1: Initial message + system prompt
        request_1_key = f"{session_id}:req_1"
        system_prompt = "You are a helpful assistant." * 30
        self.cache.set(request_1_key, system_prompt.encode(),
                      prefix_tokens=50)

        # Request 2: Follow-up with context
        request_2_key = f"{session_id}:req_2"
        context = "Previous context about the conversation." * 20
        self.cache.set(request_2_key, context.encode(),
                      prefix_tokens=100)

        # Request 3: Access both caches
        retrieved_system = self.cache.get(request_1_key)
        retrieved_context = self.cache.get(request_2_key)

        self.assertIsNotNone(retrieved_system)
        self.assertIsNotNone(retrieved_context)
        self.assertEqual(retrieved_system.decode(), system_prompt)
        self.assertEqual(retrieved_context.decode(), context)


class TestRAMCacheE2EConcurrency(unittest.TestCase):
    """Test concurrent request handling (multi-client scenario)"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=10000,
            eviction_policy='lru'
        )
        self.errors = []

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def _simulate_client_requests(self, client_id: int, num_requests: int):
        """Simulate a client making multiple requests"""
        try:
            for req_id in range(num_requests):
                # Create request-specific key
                key = f"client_{client_id}:request_{req_id}"

                # Simulate setting cache for prompt
                prompt_data = f"Client {client_id} Request {req_id}".encode() * 100
                self.cache.set(key, prompt_data, prefix_tokens=req_id * 10)

                # Simulate reading cache back
                retrieved = self.cache.get(key)
                if retrieved != prompt_data:
                    self.errors.append(
                        f"Client {client_id}: Data mismatch in request {req_id}"
                    )

                # Simulate occasional shared cache access
                if req_id % 3 == 0:
                    shared_key = "shared_system_prompt"
                    self.cache.set(shared_key, b"Shared system prompt" * 50)
                    self.cache.get(shared_key)

        except Exception as e:
            self.errors.append(f"Client {client_id}: {str(e)}")

    def test_multiple_concurrent_clients(self):
        """Test multiple concurrent clients accessing cache"""
        num_clients = 5
        requests_per_client = 20

        with ThreadPoolExecutor(max_workers=num_clients) as executor:
            futures = [
                executor.submit(self._simulate_client_requests, client_id, requests_per_client)
                for client_id in range(num_clients)
            ]

            for future in as_completed(futures):
                future.result()

        self.assertEqual(len(self.errors), 0, f"Errors: {self.errors}")

    def test_concurrent_cache_miss_handling(self):
        """Test that concurrent cache misses are handled correctly"""
        def handle_miss_thread(thread_id: int):
            try:
                # Try to get non-existent keys
                for i in range(50):
                    key = f"nonexistent_key_{i}"
                    result = self.cache.get(key)
                    if result is not None:
                        self.errors.append(
                            f"Thread {thread_id}: Unexpected cache hit for {key}"
                        )
            except Exception as e:
                self.errors.append(f"Thread {thread_id}: {str(e)}")

        threads = []
        for i in range(10):
            t = threading.Thread(target=handle_miss_thread, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0)

        # Verify miss counter increased
        stats = self.cache.get_stats()
        self.assertGreater(stats['cache_misses'], 0)

    def test_concurrent_eviction_safety(self):
        """Test that evictions are safe during concurrent access"""
        # Pre-populate cache with large entries to trigger eviction
        chunk = b"x" * (1024 * 1024)  # 1MB chunks

        def access_thread(thread_id: int):
            try:
                for i in range(20):
                    key = f"evict_test_key_{thread_id}_{i}"
                    # Keep adding data to trigger evictions
                    self.cache.set(key, chunk)
                    # Try to read recently added or old keys
                    self.cache.get(f"evict_test_key_{thread_id}_{max(0, i-5)}")
            except Exception as e:
                self.errors.append(f"Thread {thread_id}: {str(e)}")

        threads = []
        for i in range(5):
            t = threading.Thread(target=access_thread, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(self.errors), 0, f"Errors during concurrent eviction: {self.errors}")


class TestRAMCacheE2EMemoryManagement(unittest.TestCase):
    """Test memory management under load"""

    def setUp(self):
        """Set up test fixtures with medium memory limit"""
        self.cache = InMemoryKVCacheManager(
            max_memory_mb=500,  # 500MB limit
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache'):
            self.cache.clear()

    def test_memory_stays_within_limit_under_load(self):
        """Test that memory usage stays within limit under heavy load"""
        chunk_size = 10 * 1024 * 1024  # 10MB chunks
        chunk = b"x" * chunk_size

        # Add many entries (would exceed limit without eviction)
        for i in range(100):
            self.cache.set(f"load_test_key_{i}", chunk)

        stats = self.cache.get_stats()
        memory_used = stats['memory_used_mb']

        # Should not exceed limit by more than 10% (accounting for overhead)
        self.assertLess(memory_used, 550, f"Memory usage {memory_used}MB exceeds 550MB limit")

    def test_eviction_prevents_out_of_memory(self):
        """Test that eviction prevents out-of-memory errors"""
        chunk = b"x" * (50 * 1024 * 1024)  # 50MB chunks

        try:
            # Try to add 20x 50MB chunks (1GB total, exceeds 500MB limit)
            for i in range(20):
                self.cache.set(f"oom_test_key_{i}", chunk)

            # Should complete without MemoryError
            stats = self.cache.get_stats()
            self.assertLess(stats['memory_used_mb'], 600)
        except MemoryError:
            self.fail("MemoryError raised despite eviction policy")

    def test_progressive_memory_growth(self):
        """Test memory growth is gradual and controllable"""
        memory_samples = []

        for i in range(50):
            chunk = b"x" * (5 * 1024 * 1024)  # 5MB chunks
            self.cache.set(f"growth_test_key_{i}", chunk)

            if i % 10 == 0:
                stats = self.cache.get_stats()
                memory_samples.append(stats['memory_used_mb'])

        # Memory should not grow unbounded
        # Allow some growth but it should stabilize near the limit
        final_memory = self.cache.get_stats()['memory_used_mb']
        self.assertLess(final_memory, 550)


class TestRAMCacheE2EPerformance(unittest.TestCase):
    """Test performance characteristics in realistic scenarios"""

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

    def test_cache_hit_latency_realistic(self):
        """Test cache hit latency in realistic scenario"""
        # Pre-populate with realistic prompt caches
        for i in range(100):
            prompt = f"System prompt {i}. ".encode() * 100
            self.cache.set(f"prompt_{i}", prompt, prefix_tokens=150 + i)

        # Measure latency for cache hits
        access_times = []
        for i in range(100):
            start = time.perf_counter()
            self.cache.get(f"prompt_{i}")
            elapsed = time.perf_counter() - start
            access_times.append(elapsed * 1000)  # Convert to ms

        avg_latency = sum(access_times) / len(access_times)
        max_latency = max(access_times)
        p95_latency = sorted(access_times)[int(len(access_times) * 0.95)]

        # Performance assertions
        self.assertLess(avg_latency, 10,
                       f"Average latency {avg_latency:.2f}ms exceeds 10ms")
        self.assertLess(max_latency, 100,
                       f"Max latency {max_latency:.2f}ms exceeds 100ms")
        self.assertLess(p95_latency, 20,
                       f"P95 latency {p95_latency:.2f}ms exceeds 20ms")

    def test_concurrent_request_throughput(self):
        """Test throughput with concurrent requests"""
        # Pre-populate cache
        for i in range(50):
            self.cache.set(f"cached_{i}", b"data" * 100, prefix_tokens=100)

        def request_handler(req_id: int, num_ops: int):
            """Simulate handling multiple requests"""
            for i in range(num_ops):
                key = f"cached_{i % 50}"
                self.cache.get(key)

        # Measure throughput
        num_threads = 10
        ops_per_thread = 100

        start = time.perf_counter()

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [
                executor.submit(request_handler, i, ops_per_thread)
                for i in range(num_threads)
            ]
            for future in as_completed(futures):
                future.result()

        elapsed = time.perf_counter() - start
        total_ops = num_threads * ops_per_thread
        throughput = total_ops / elapsed

        # Should handle at least 10,000 ops/sec
        self.assertGreater(throughput, 10000,
                          f"Throughput {throughput:.0f} ops/sec is below 10k target")

    def test_follow_up_request_performance(self):
        """Test performance improvement for follow-up requests (key scenario)"""
        prompt = "You are a helpful assistant. " * 100
        key = "system_prompt_cache"

        # Cache the system prompt
        self.cache.set(key, prompt.encode(), prefix_tokens=200)

        # Simulate multiple follow-up requests
        request_times = []
        for i in range(100):
            start = time.perf_counter()
            # Each request accesses the cached prompt
            cached_prompt = self.cache.get(key)
            elapsed = time.perf_counter() - start
            request_times.append(elapsed * 1000)  # ms

        avg_latency = sum(request_times) / len(request_times)

        # Follow-up requests should be very fast (< 5ms average)
        self.assertLess(avg_latency, 5.0,
                       f"Follow-up request avg latency {avg_latency:.2f}ms exceeds 5ms")


class TestRAMCacheE2EStatistics(unittest.TestCase):
    """Test statistics collection and reporting"""

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

    def test_statistics_accuracy_simple(self):
        """Test that statistics accurately reflect cache operations"""
        self.cache.set("key1", b"value1" * 50)
        self.cache.set("key2", b"value2" * 50)

        # Perform some hits and misses
        self.cache.get("key1")  # Hit
        self.cache.get("key1")  # Hit
        self.cache.get("nonexistent")  # Miss

        stats = self.cache.get_stats()
        self.assertEqual(stats['cache_hits'], 2)
        self.assertEqual(stats['cache_misses'], 1)
        self.assertEqual(stats['total_entries'], 2)

    def test_statistics_accuracy_with_operations(self):
        """Test statistics accuracy through various operations"""
        # Add entries
        for i in range(10):
            self.cache.set(f"key_{i}", b"value" * 50)

        stats1 = self.cache.get_stats()
        self.assertEqual(stats1['total_entries'], 10)

        # Access some entries
        for i in range(5):
            self.cache.get(f"key_{i}")

        stats2 = self.cache.get_stats()
        self.assertEqual(stats2['cache_hits'], 5)

        # Delete some entries
        self.cache.delete("key_0")
        self.cache.delete("key_1")

        stats3 = self.cache.get_stats()
        self.assertEqual(stats3['total_entries'], 8)

    def test_hit_rate_calculation(self):
        """Test hit rate is calculated correctly"""
        self.cache.set("key", b"value" * 50)

        # 4 hits, 1 miss
        self.cache.get("key")
        self.cache.get("key")
        self.cache.get("key")
        self.cache.get("key")
        self.cache.get("nonexistent")

        stats = self.cache.get_stats()
        expected_hit_rate = 4 / 5  # 80%

        self.assertAlmostEqual(stats['hit_rate'], expected_hit_rate, places=2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
