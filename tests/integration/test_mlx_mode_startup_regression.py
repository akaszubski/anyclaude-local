#!/usr/bin/env python3
"""
Integration Test: MLX Mode Startup with InMemoryKVCacheManager

Tests that MLX server can start successfully with InMemoryKVCacheManager
without AttributeError for has_cache() or _count_tokens().

Bug history:
- v2.2.0: MLX mode failed on startup with:
  - AttributeError: 'InMemoryKVCacheManager' object has no attribute 'has_cache'
  - AttributeError: 'InMemoryKVCacheManager' object has no attribute '_count_tokens'

This integration test ensures MLX server startup doesn't regress.
"""

import unittest
import sys
from pathlib import Path

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

from ram_cache import InMemoryKVCacheManager


class MockModel:
    """Mock MLX model for testing"""
    pass


class MockTokenizer:
    """Mock tokenizer for testing"""

    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=True):
        """Mock chat template application"""
        return "Formatted prompt text"

    def encode(self, text: str) -> list:
        """Mock encode method"""
        return ['token'] * (len(text) // 4)


class TestMLXModeStartupRegression(unittest.TestCase):
    """Test MLX mode startup scenarios that previously failed"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=400000,
            eviction_policy='lru'
        )
        self.model = MockModel()
        self.tokenizer = MockTokenizer()

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache_manager'):
            self.cache_manager.clear()

    def test_cache_warmup_check_doesnt_raise_attribute_error(self):
        """Test that cache warmup check doesn't raise AttributeError"""
        # Simulate cache warmup code from mlx-server.py:580-620
        system_prompt = "You are a helpful assistant."

        try:
            # Format prompt using tokenizer
            formatted = self.tokenizer.apply_chat_template(
                [{"role": "system", "content": system_prompt}],
                tokenize=False,
                add_generation_prompt=True
            )
        except Exception:
            formatted = system_prompt + "\n\nHello"

        # This should NOT raise AttributeError
        try:
            # Check if has_cache method exists and works
            self.assertTrue(hasattr(self.cache_manager, 'has_cache'),
                          "InMemoryKVCacheManager missing has_cache() method")

            cache_exists, cache_file = self.cache_manager.has_cache(formatted)

            # Verify return type
            self.assertIsInstance(cache_exists, bool)
            self.assertIn(cache_file, [None, formatted])

        except AttributeError as e:
            self.fail(f"AttributeError raised during cache warmup: {e}")

    def test_token_counting_doesnt_raise_attribute_error(self):
        """Test that token counting doesn't raise AttributeError"""
        # Simulate token counting code from mlx-server.py:913
        prompt = "This is a test prompt for token counting"

        try:
            # This should NOT raise AttributeError
            self.assertTrue(hasattr(self.cache_manager, '_count_tokens'),
                          "InMemoryKVCacheManager missing _count_tokens() method")

            suffix_tokens = self.cache_manager._count_tokens(
                self.tokenizer,
                prompt
            )

            # Verify return type
            self.assertIsInstance(suffix_tokens, int)
            self.assertGreater(suffix_tokens, 0)

        except AttributeError as e:
            self.fail(f"AttributeError raised during token counting: {e}")

    def test_full_cache_workflow_without_errors(self):
        """Test full cache workflow that previously failed"""
        system_prompt = "You are a helpful AI assistant."

        # Step 1: Format prompt
        try:
            formatted = self.tokenizer.apply_chat_template(
                [{"role": "system", "content": system_prompt}],
                tokenize=False,
                add_generation_prompt=True
            )
        except Exception:
            formatted = system_prompt + "\n\nHello"

        # Step 2: Check if cache exists (previously raised AttributeError)
        try:
            cache_exists, cache_key = self.cache_manager.has_cache(formatted)
            self.assertFalse(cache_exists, "Cache should be empty initially")
        except AttributeError as e:
            self.fail(f"has_cache() raised AttributeError: {e}")

        # Step 3: Create cache entry
        cache_data = b"mock_cache_data" * 100
        self.cache_manager.set(formatted, cache_data)

        # Step 4: Verify cache exists
        try:
            cache_exists, cache_key = self.cache_manager.has_cache(formatted)
            self.assertTrue(cache_exists, "Cache should exist after set()")
            self.assertEqual(cache_key, formatted)
        except AttributeError as e:
            self.fail(f"has_cache() raised AttributeError after set(): {e}")

        # Step 5: Count tokens (previously raised AttributeError)
        actual_prompt = "User prompt goes here..."
        try:
            suffix_tokens = self.cache_manager._count_tokens(
                self.tokenizer,
                actual_prompt
            )
            self.assertGreater(suffix_tokens, 0)
        except AttributeError as e:
            self.fail(f"_count_tokens() raised AttributeError: {e}")

    def test_has_cache_and_count_tokens_methods_exist(self):
        """Test that both required methods exist on InMemoryKVCacheManager"""
        # Verify methods exist
        self.assertTrue(hasattr(self.cache_manager, 'has_cache'),
                       "Missing has_cache() method")
        self.assertTrue(hasattr(self.cache_manager, '_count_tokens'),
                       "Missing _count_tokens() method")

        # Verify they are callable
        self.assertTrue(callable(getattr(self.cache_manager, 'has_cache')),
                       "has_cache() is not callable")
        self.assertTrue(callable(getattr(self.cache_manager, '_count_tokens')),
                       "_count_tokens() is not callable")

    def test_has_cache_signature_compatible(self):
        """Test that has_cache() has compatible signature"""
        # Should accept single string argument
        try:
            result = self.cache_manager.has_cache("test_key")
            self.assertIsInstance(result, tuple)
            self.assertEqual(len(result), 2)
        except TypeError as e:
            self.fail(f"has_cache() signature incompatible: {e}")

    def test_count_tokens_signature_compatible(self):
        """Test that _count_tokens() has compatible signature"""
        # Should accept tokenizer and text arguments
        try:
            result = self.cache_manager._count_tokens(
                self.tokenizer,
                "test text"
            )
            self.assertIsInstance(result, int)
        except TypeError as e:
            self.fail(f"_count_tokens() signature incompatible: {e}")


if __name__ == '__main__':
    # Run with verbose output
    unittest.main(verbosity=2)
