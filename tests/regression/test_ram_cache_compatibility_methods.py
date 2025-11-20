#!/usr/bin/env python3
"""
Regression Tests: InMemoryKVCacheManager Compatibility Methods

Tests for has_cache() and _count_tokens() methods that were added for MLX server compatibility.

Bug history:
- v2.2.0: MLX mode failed with AttributeError: 'InMemoryKVCacheManager' object has no attribute 'has_cache'
- v2.2.0: MLX mode failed with AttributeError: 'InMemoryKVCacheManager' object has no attribute '_count_tokens'

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


if __name__ == '__main__':
    # Run with verbose output
    unittest.main(verbosity=2)
