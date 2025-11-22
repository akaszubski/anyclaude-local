#!/usr/bin/env python3
"""
Regression Tests: InMemoryKVCacheManager Compatibility Methods

Tests for has_cache(), _count_tokens(), record_generation(), and create_cache() methods
that were added for MLX server compatibility.

Bug history:
- v2.2.0: MLX mode failed with AttributeError: 'InMemoryKVCacheManager' object has no attribute 'has_cache'
- v2.2.0: MLX mode failed with AttributeError: 'InMemoryKVCacheManager' object has no attribute '_count_tokens'
- v2.2.1: MLX mode failed with AttributeError: 'InMemoryKVCacheManager' object has no attribute 'record_generation'
- v2.2.1: MLX mode failed with AttributeError: 'InMemoryKVCacheManager' object has no attribute 'create_cache'

These tests ensure the compatibility methods work correctly and prevent regression.
"""

import unittest
import sys
from pathlib import Path

# Add scripts directory to path so we can import the cache manager
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

from ram_cache import InMemoryKVCacheManager


class MockTokenizer:
    """Mock tokenizer for testing _count_tokens()"""

    def __init__(self, tokens_per_char=0.25):
        """
        Args:
            tokens_per_char: Simulates tokenizer behavior (default: ~4 chars per token)
        """
        self.tokens_per_char = tokens_per_char

    def encode(self, text: str) -> list:
        """Mock encode method that returns tokens based on text length"""
        return ['token'] * int(len(text) * self.tokens_per_char)


class TestInMemoryKVCacheManagerHasCache(unittest.TestCase):
    """Test has_cache() compatibility method"""

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

    def test_has_cache_returns_tuple(self):
        """Test that has_cache() returns a tuple of (bool, str)"""
        key = "test_key"
        value = b"test_value" * 100

        self.cache.set(key, value)
        result = self.cache.has_cache(key)

        # Should return tuple
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 2)

    def test_has_cache_returns_true_for_existing_key(self):
        """Test that has_cache() returns (True, key) for cached keys"""
        key = "test_key"
        value = b"test_value" * 100

        self.cache.set(key, value)
        exists, returned_key = self.cache.has_cache(key)

        self.assertTrue(exists)
        self.assertEqual(returned_key, key)

    def test_has_cache_returns_false_for_nonexistent_key(self):
        """Test that has_cache() returns (False, None) for missing keys"""
        exists, returned_key = self.cache.has_cache("nonexistent_key")

        self.assertFalse(exists)
        self.assertIsNone(returned_key)

    def test_has_cache_multiple_keys(self):
        """Test has_cache() with multiple keys"""
        keys = [f"key_{i}" for i in range(5)]

        # Add first 3 keys
        for i in range(3):
            self.cache.set(keys[i], b"value" * 50)

        # Check all keys
        for i in range(3):
            exists, _ = self.cache.has_cache(keys[i])
            self.assertTrue(exists, f"Key {keys[i]} should exist")

        for i in range(3, 5):
            exists, _ = self.cache.has_cache(keys[i])
            self.assertFalse(exists, f"Key {keys[i]} should not exist")

    def test_has_cache_after_delete(self):
        """Test that has_cache() returns False after key is deleted"""
        key = "test_key"
        value = b"test_value" * 100

        self.cache.set(key, value)
        exists, _ = self.cache.has_cache(key)
        self.assertTrue(exists)

        # Delete the key
        self.cache.delete(key)
        exists, _ = self.cache.has_cache(key)
        self.assertFalse(exists)

    def test_has_cache_after_clear(self):
        """Test that has_cache() returns False after cache is cleared"""
        key = "test_key"
        value = b"test_value" * 100

        self.cache.set(key, value)
        exists, _ = self.cache.has_cache(key)
        self.assertTrue(exists)

        # Clear cache
        self.cache.clear()
        exists, _ = self.cache.has_cache(key)
        self.assertFalse(exists)

    def test_has_cache_empty_key(self):
        """Test has_cache() with empty key"""
        exists, returned_key = self.cache.has_cache("")

        self.assertFalse(exists)
        self.assertIsNone(returned_key)

    def test_has_cache_special_characters(self):
        """Test has_cache() with special characters in key"""
        special_keys = [
            "key:with:colons",
            "key/with/slashes",
            "key\twith\ttabs",
        ]

        for key in special_keys:
            self.cache.set(key, b"value" * 50)
            exists, returned_key = self.cache.has_cache(key)
            self.assertTrue(exists, f"has_cache failed for key: {key}")
            self.assertEqual(returned_key, key)


class TestInMemoryKVCacheManagerCountTokens(unittest.TestCase):
    """Test _count_tokens() compatibility method"""

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

    def test_count_tokens_with_mock_tokenizer(self):
        """Test _count_tokens() with a mock tokenizer"""
        tokenizer = MockTokenizer()
        text = "Hello world, this is a test"

        count = self.cache._count_tokens(tokenizer, text)

        # Should return approximately len(text) / 4 (default: 4 chars per token)
        expected = int(len(text) * 0.25)
        self.assertEqual(count, expected)

    def test_count_tokens_empty_string(self):
        """Test _count_tokens() with empty string"""
        tokenizer = MockTokenizer()
        text = ""

        count = self.cache._count_tokens(tokenizer, text)
        self.assertEqual(count, 0)

    def test_count_tokens_large_text(self):
        """Test _count_tokens() with large text"""
        tokenizer = MockTokenizer()
        text = "a" * 10000  # 10K characters

        count = self.cache._count_tokens(tokenizer, text)

        # Should return approximately 2500 tokens (10000 / 4)
        expected = int(len(text) * 0.25)
        self.assertEqual(count, expected)

    def test_count_tokens_fallback_without_tokenizer(self):
        """Test _count_tokens() fallback when tokenizer is None"""
        tokenizer = None
        text = "Hello world, this is a test"

        count = self.cache._count_tokens(tokenizer, text)

        # Should use fallback: len(text) // 4
        expected = len(text) // 4
        self.assertEqual(count, expected)

    def test_count_tokens_fallback_without_encode(self):
        """Test _count_tokens() fallback when tokenizer lacks encode()"""
        class BadTokenizer:
            pass

        tokenizer = BadTokenizer()
        text = "Hello world, this is a test"

        count = self.cache._count_tokens(tokenizer, text)

        # Should use fallback: len(text) // 4
        expected = len(text) // 4
        self.assertEqual(count, expected)

    def test_count_tokens_fallback_on_exception(self):
        """Test _count_tokens() fallback when tokenizer.encode() raises exception"""
        class BrokenTokenizer:
            def encode(self, text):
                raise RuntimeError("Tokenizer broken!")

        tokenizer = BrokenTokenizer()
        text = "Hello world, this is a test"

        # Should not raise exception, should use fallback
        count = self.cache._count_tokens(tokenizer, text)

        expected = len(text) // 4
        self.assertEqual(count, expected)

    def test_count_tokens_unicode(self):
        """Test _count_tokens() with unicode text"""
        tokenizer = MockTokenizer()
        text = "Hello 世界! Bonjour éàü"

        count = self.cache._count_tokens(tokenizer, text)

        # Should handle unicode correctly
        expected = int(len(text) * 0.25)
        self.assertEqual(count, expected)

    def test_count_tokens_multiline(self):
        """Test _count_tokens() with multiline text"""
        tokenizer = MockTokenizer()
        text = """This is line 1
This is line 2
This is line 3"""

        count = self.cache._count_tokens(tokenizer, text)

        # Should count all characters including newlines
        expected = int(len(text) * 0.25)
        self.assertEqual(count, expected)


class TestInMemoryKVCacheManagerRecordGeneration(unittest.TestCase):
    """Test record_generation() compatibility method"""

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

    def test_record_generation_method_exists(self):
        """Regression: Ensure record_generation() method exists"""
        # This would raise AttributeError in v2.2.1
        self.assertTrue(hasattr(self.cache, 'record_generation'))
        self.assertTrue(callable(getattr(self.cache, 'record_generation')))

    def test_record_generation_with_cache_stores_metrics(self):
        """Test that record_generation() stores metrics when cache is used"""
        self.cache.record_generation(suffix_tokens=50, generation_time=0.1, used_cache=True)

        # Verify metrics are stored
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 1)
        self.assertEqual(self.cache.generation_stats['suffix_tokens'][0], 50)
        self.assertIn(0.1, self.cache.generation_stats['generation_times_with_cache'])

    def test_record_generation_without_cache_stores_metrics(self):
        """Test that record_generation() stores metrics when cache is not used"""
        self.cache.record_generation(suffix_tokens=100, generation_time=2.5, used_cache=False)

        # Verify metrics are stored
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 1)
        self.assertEqual(self.cache.generation_stats['suffix_tokens'][0], 100)
        self.assertIn(2.5, self.cache.generation_stats['generation_times_without_cache'])

    def test_record_generation_does_not_raise_exception(self):
        """Regression: Ensure record_generation() doesn't raise AttributeError"""
        try:
            self.cache.record_generation(suffix_tokens=50, generation_time=0.1, used_cache=True)
            self.cache.record_generation(suffix_tokens=60, generation_time=2.0, used_cache=False)
        except AttributeError as e:
            self.fail(f"record_generation() raised AttributeError: {e}")

    def test_record_generation_multiple_calls(self):
        """Test that multiple record_generation() calls accumulate metrics"""
        for i in range(10):
            self.cache.record_generation(
                suffix_tokens=i * 10,
                generation_time=0.1 * i,
                used_cache=(i % 2 == 0)
            )

        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 10)
        self.assertEqual(len(self.cache.generation_stats['generation_times_with_cache']), 5)
        self.assertEqual(len(self.cache.generation_stats['generation_times_without_cache']), 5)


class TestInMemoryKVCacheManagerCreateCache(unittest.TestCase):
    """Test create_cache() compatibility method"""

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

    def test_create_cache_method_exists(self):
        """Regression: Ensure create_cache() method exists"""
        # This would raise AttributeError in v2.2.1
        self.assertTrue(hasattr(self.cache, 'create_cache'))
        self.assertTrue(callable(getattr(self.cache, 'create_cache')))

    def test_create_cache_returns_none_tuple(self):
        """Test that create_cache() returns (None, None)"""
        result = self.cache.create_cache(model=None, tokenizer=None, prefix_prompt="test")
        self.assertEqual(result, (None, None))

    def test_create_cache_does_not_raise_exception(self):
        """Regression: Ensure create_cache() doesn't raise AttributeError"""
        try:
            result = self.cache.create_cache(
                model=None,
                tokenizer=None,
                prefix_prompt="test prompt"
            )
            self.assertEqual(result, (None, None))
        except AttributeError as e:
            self.fail(f"create_cache() raised AttributeError: {e}")

    def test_create_cache_is_noop(self):
        """Test that create_cache() doesn't modify cache state"""
        # Add some data
        self.cache.set("key1", b"value1")
        stats_before = self.cache.get_stats()

        # Call create_cache
        self.cache.create_cache(model=None, tokenizer=None, prefix_prompt="test")

        # Verify state unchanged
        stats_after = self.cache.get_stats()
        self.assertEqual(stats_before['total_entries'], stats_after['total_entries'])
        self.assertEqual(self.cache.get("key1"), b"value1")

    def test_create_cache_with_mock_objects(self):
        """Test create_cache() with mock model and tokenizer"""
        class MockModel:
            pass

        class MockTokenizer:
            def encode(self, text):
                return [1, 2, 3]

        # Should not raise exception
        result = self.cache.create_cache(
            model=MockModel(),
            tokenizer=MockTokenizer(),
            prefix_prompt="test prompt"
        )
        self.assertEqual(result, (None, None))


class TestMLXServerIntegrationScenarios(unittest.TestCase):
    """Test realistic MLX server usage scenarios"""

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

    def test_mlx_warmup_scenario(self):
        """Test cache warmup scenario used by MLX server"""
        # Simulate cache warmup check
        key = "system_prompt_hash_abc123"
        exists, _ = self.cache.has_cache(key)
        self.assertFalse(exists, "Cache should be empty initially")

        # Simulate storing warmup cache
        cache_data = b"warmup_cache_data" * 1000
        self.cache.set(key, cache_data, prefix_tokens=150)

        # Verify cache exists
        exists, returned_key = self.cache.has_cache(key)
        self.assertTrue(exists)
        self.assertEqual(returned_key, key)

        # Verify metadata
        metadata = self.cache.get_metadata(key)
        self.assertEqual(metadata['prefix_tokens'], 150)

    def test_mlx_token_counting_scenario(self):
        """Test token counting scenario used by MLX server"""
        tokenizer = MockTokenizer()

        # Simulate counting suffix tokens for metrics
        prompt = "You are a helpful assistant. Please help with..."
        suffix_tokens = self.cache._count_tokens(tokenizer, prompt)

        self.assertGreater(suffix_tokens, 0)
        self.assertIsInstance(suffix_tokens, int)

    def test_mlx_generation_with_cache_scenario(self):
        """Test full generation cycle with cache checking"""
        tokenizer = MockTokenizer()

        # 1. Check if cache exists (first time - miss)
        prompt_hash = "prompt_hash_def456"
        exists, cache_file = self.cache.has_cache(prompt_hash)
        self.assertFalse(exists)

        # 2. Generate and cache the result
        result = b"generated_kv_cache_data" * 500
        self.cache.set(prompt_hash, result, prefix_tokens=200)

        # 3. Count tokens for metrics
        prompt = "Generate a response for this prompt..."
        suffix_tokens = self.cache._count_tokens(tokenizer, prompt)
        self.assertGreater(suffix_tokens, 0)

        # 4. Next request - check cache (hit)
        exists, cache_file = self.cache.has_cache(prompt_hash)
        self.assertTrue(exists)

        # 5. Retrieve cached data
        cached_data = self.cache.get(prompt_hash)
        self.assertEqual(cached_data, result)

    def test_mlx_complete_workflow_with_all_methods(self):
        """Regression: Test complete MLX server workflow using all 4 compatibility methods"""
        tokenizer = MockTokenizer()

        # 1. Try to create cache (no-op for RAM cache)
        cache_file, cache_obj = self.cache.create_cache(
            model=None,
            tokenizer=tokenizer,
            prefix_prompt="System prompt..."
        )
        self.assertEqual((cache_file, cache_obj), (None, None))

        # 2. Check if cache exists (miss)
        prompt_hash = "complete_workflow_hash"
        exists, _ = self.cache.has_cache(prompt_hash)
        self.assertFalse(exists)

        # 3. Generate without cache
        prompt = "Generate a long response..."
        suffix_tokens = self.cache._count_tokens(tokenizer, prompt)

        # 4. Record generation metrics (without cache)
        self.cache.record_generation(
            suffix_tokens=suffix_tokens,
            generation_time=2.5,
            used_cache=False
        )

        # 5. Store the generated cache
        kv_cache_data = b"kv_cache_data" * 1000
        self.cache.set(prompt_hash, kv_cache_data, prefix_tokens=200)

        # 6. Next request - check cache (hit)
        exists, _ = self.cache.has_cache(prompt_hash)
        self.assertTrue(exists)

        # 7. Count tokens again
        suffix_tokens_2 = self.cache._count_tokens(tokenizer, "Another response...")

        # 8. Record generation metrics (with cache)
        self.cache.record_generation(
            suffix_tokens=suffix_tokens_2,
            generation_time=0.3,
            used_cache=True
        )

        # Verify metrics were recorded
        self.assertEqual(len(self.cache.generation_stats['suffix_tokens']), 2)
        self.assertEqual(len(self.cache.generation_stats['generation_times_without_cache']), 1)
        self.assertEqual(len(self.cache.generation_stats['generation_times_with_cache']), 1)
        self.assertIn(2.5, self.cache.generation_stats['generation_times_without_cache'])
        self.assertIn(0.3, self.cache.generation_stats['generation_times_with_cache'])


class TestCacheSavingBugFix(unittest.TestCase):
    """
    Regression Tests: Cache Saving Bug Fix (v3.1.0)

    Bug history:
    - v3.0.x: Cache was never saved after generation on cache miss
    - Root cause: create_cache() returned (None, None), so line 882 check always failed
    - Result: "Cache creation failed, using full prompt" warnings, cache never persisted
    - Fix: Added explicit cache save after successful generation on cache miss

    These tests ensure cache is properly saved and retrieved across requests.
    """

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

    def test_cache_miss_then_save_then_hit(self):
        """
        Regression: Test cache miss → save → hit flow

        This is the core fix - cache should be saved after first request
        and retrieved on second request.
        """
        prefix_prompt = "System: You are a helpful assistant."

        # Request 1: Cache miss
        exists, cache_key = self.cache.has_cache(prefix_prompt)
        self.assertFalse(exists, "First request should be cache MISS")
        self.assertIsNone(cache_key)

        # Simulate saving cache after generation (the fix!)
        cache_value = prefix_prompt.encode('utf-8')
        prefix_tokens = len(prefix_prompt.split())
        self.cache.set(prefix_prompt, cache_value, prefix_tokens=prefix_tokens)

        # Request 2: Cache hit
        exists, cache_key = self.cache.has_cache(prefix_prompt)
        self.assertTrue(exists, "Second request should be cache HIT")
        self.assertEqual(cache_key, prefix_prompt)

        # Verify cached data
        cached = self.cache.get(prefix_prompt)
        self.assertEqual(cached, cache_value)

    def test_cache_persistence_across_multiple_requests(self):
        """
        Regression: Test cache persists across multiple requests

        Cache should remain available for all subsequent requests after
        first save.
        """
        prefix_prompt = "System: You are a coding assistant."
        cache_value = prefix_prompt.encode('utf-8')

        # First request - save cache
        self.cache.set(prefix_prompt, cache_value, prefix_tokens=100)

        # Multiple subsequent requests should all hit cache
        for i in range(10):
            exists, cache_key = self.cache.has_cache(prefix_prompt)
            self.assertTrue(exists, f"Request {i+2} should be cache HIT")

            # Verify data is correct
            cached = self.cache.get(prefix_prompt)
            self.assertEqual(cached, cache_value)

    def test_cache_saves_with_prefix_tokens_metadata(self):
        """
        Regression: Test cache saves prefix_tokens metadata correctly

        This metadata is used for metrics and performance tracking.
        """
        prefix_prompt = "System prompt with tools..."
        cache_value = prefix_prompt.encode('utf-8')
        prefix_tokens = 15000  # Large system prompt with tools

        # Save with metadata
        self.cache.set(prefix_prompt, cache_value, prefix_tokens=prefix_tokens)

        # Verify metadata
        metadata = self.cache.get_metadata(prefix_prompt)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata['prefix_tokens'], prefix_tokens)

    def test_different_prefixes_cached_independently(self):
        """
        Regression: Test different prefix prompts are cached independently

        Different system prompts or tool sets should create separate cache entries.
        """
        prefix1 = "System: You are a helpful assistant."
        prefix2 = "System: You are a coding expert."

        value1 = prefix1.encode('utf-8')
        value2 = prefix2.encode('utf-8')

        # Save both
        self.cache.set(prefix1, value1, prefix_tokens=10)
        self.cache.set(prefix2, value2, prefix_tokens=10)

        # Both should exist independently
        exists1, key1 = self.cache.has_cache(prefix1)
        exists2, key2 = self.cache.has_cache(prefix2)

        self.assertTrue(exists1)
        self.assertTrue(exists2)
        self.assertEqual(key1, prefix1)
        self.assertEqual(key2, prefix2)

        # Verify data is correct for each
        self.assertEqual(self.cache.get(prefix1), value1)
        self.assertEqual(self.cache.get(prefix2), value2)

    def test_cache_save_after_generation_failure_graceful(self):
        """
        Regression: Test cache save failure doesn't crash server

        If cache save fails (e.g., OOM), server should continue gracefully.
        """
        # Simulate cache that's too large for memory limit
        small_cache = InMemoryKVCacheManager(max_memory_mb=1)  # Only 1MB

        prefix_prompt = "System prompt"
        huge_value = b"x" * (2 * 1024 * 1024)  # 2MB - exceeds cache limit

        # Attempt to save should fail gracefully (either ValueError or eviction)
        try:
            small_cache.set(prefix_prompt, huge_value, prefix_tokens=1000)
            # If no exception, verify cache save attempt was handled
            self.fail("Expected ValueError for oversized cache entry")
        except ValueError as e:
            # Expected: value exceeds cache limit
            self.assertIn("exceeds cache limit", str(e))

    def test_metrics_track_cache_hits_and_misses(self):
        """
        Regression: Test cache hit/miss metrics are tracked correctly

        Metrics help identify cache effectiveness and performance gains.
        """
        prefix_prompt = "System: You are helpful."

        # First access - miss
        exists, _ = self.cache.has_cache(prefix_prompt)
        self.assertFalse(exists)
        initial_misses = self.cache.cache_misses

        # Save cache
        self.cache.set(prefix_prompt, b"cached_data", prefix_tokens=50)

        # Second access - hit (get increments hit counter)
        cached = self.cache.get(prefix_prompt)
        self.assertIsNotNone(cached)

        # Verify metrics
        stats = self.cache.get_stats()
        self.assertGreater(stats['cache_hits'], 0, "Should have at least 1 cache hit")
        self.assertEqual(stats['cache_misses'], initial_misses, "Misses should be tracked")

    def test_generation_time_metrics_with_and_without_cache(self):
        """
        Regression: Test generation metrics correctly track cache usage

        This helps measure the performance improvement from caching.
        """
        # Simulate generation without cache (first request)
        self.cache.record_generation(
            suffix_tokens=100,
            generation_time=8.5,  # Slow without cache
            used_cache=False
        )

        # Simulate generation with cache (second request)
        self.cache.record_generation(
            suffix_tokens=100,
            generation_time=0.8,  # Fast with cache
            used_cache=True
        )

        # Verify metrics
        stats = self.cache.generation_stats
        self.assertEqual(len(stats['generation_times_without_cache']), 1)
        self.assertEqual(len(stats['generation_times_with_cache']), 1)
        self.assertIn(8.5, stats['generation_times_without_cache'])
        self.assertIn(0.8, stats['generation_times_with_cache'])

    def test_complete_request_cycle_with_cache_saving(self):
        """
        Regression: Test complete request cycle with cache saving

        This simulates the actual MLX server flow:
        1. Check cache (miss)
        2. Generate with full prompt
        3. Save cache after generation (THE FIX!)
        4. Next request checks cache (hit)
        5. Generate with suffix only (fast!)
        """
        tokenizer = MockTokenizer()
        prefix_prompt = "System: You are a helpful AI assistant.\n\nTools: Read, Write, Edit..."
        suffix_prompt = "User: Hello, help me with a task"

        # ===== REQUEST 1 =====
        # 1. Check cache (miss)
        exists, _ = self.cache.has_cache(prefix_prompt)
        self.assertFalse(exists, "Request 1: Should be cache MISS")

        # 2. Generate with full prompt (system + user)
        full_prompt = prefix_prompt + "\n" + suffix_prompt
        suffix_tokens = self.cache._count_tokens(tokenizer, full_prompt)

        # 3. Record generation without cache
        self.cache.record_generation(
            suffix_tokens=suffix_tokens,
            generation_time=8.0,
            used_cache=False
        )

        # 4. Save cache after generation (THE FIX!)
        prefix_tokens = self.cache._count_tokens(tokenizer, prefix_prompt)
        cache_value = prefix_prompt.encode('utf-8')
        self.cache.set(prefix_prompt, cache_value, prefix_tokens=prefix_tokens)

        # ===== REQUEST 2 =====
        # 1. Check cache (hit!)
        exists, cache_key = self.cache.has_cache(prefix_prompt)
        self.assertTrue(exists, "Request 2: Should be cache HIT")

        # 2. Generate with suffix only (fast!)
        suffix_tokens_2 = self.cache._count_tokens(tokenizer, suffix_prompt)

        # 3. Record generation with cache
        self.cache.record_generation(
            suffix_tokens=suffix_tokens_2,
            generation_time=0.8,  # Much faster!
            used_cache=True
        )

        # Verify the speedup
        stats = self.cache.generation_stats
        self.assertEqual(len(stats['generation_times_without_cache']), 1)
        self.assertEqual(len(stats['generation_times_with_cache']), 1)

        # Verify performance improvement
        time_without_cache = stats['generation_times_without_cache'][0]
        time_with_cache = stats['generation_times_with_cache'][0]
        speedup = time_without_cache / time_with_cache
        self.assertGreater(speedup, 5, "Cache should provide >5x speedup")


if __name__ == '__main__':
    # Run with verbose output
    unittest.main(verbosity=2)
