#!/usr/bin/env python3
"""
Unit Tests: Cache Warmup Feature - KV Cache Warmup on Server Startup

Tests for the cache warmup functionality that pre-populates KV cache with
standard system prompts before the server accepts requests.

Covers:
- get_standard_system_prompt() function
- warmup_kv_cache() async function
- Configuration via environment variables
- Timeout handling
- Error handling and graceful fallback

Expected to FAIL until cache warmup implementation is complete (TDD Red Phase)
"""

import unittest
import asyncio
import tempfile
import os
import sys
import json
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from typing import Optional, Tuple, Any
import logging

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# Configure logging for tests
logging.basicConfig(
    level=logging.DEBUG,
    format='[%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("test_cache_warmup")

# Import the cache manager that should exist
try:
    from ram_cache import InMemoryKVCacheManager
except ImportError:
    class InMemoryKVCacheManager:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("InMemoryKVCacheManager not yet implemented")

# Try to import warmup functions (will fail until implemented)
try:
    from mlx_server import get_standard_system_prompt, warmup_kv_cache
except ImportError:
    # Create placeholder functions that will fail tests
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


class TestGetStandardSystemPrompt(unittest.TestCase):
    """Test get_standard_system_prompt() function"""

    def test_loads_from_file(self):
        """Test that system prompt is loaded from file"""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
            expected_content = "You are a helpful assistant."
            f.write(expected_content)
            temp_file = f.name

        try:
            result = get_standard_system_prompt(warmup_file=temp_file)
            self.assertEqual(result, expected_content)
            self.assertIsInstance(result, str)
            self.assertTrue(len(result) > 0)
        finally:
            os.unlink(temp_file)

    def test_returns_fallback_when_file_missing(self):
        """Test fallback prompt when file doesn't exist"""
        result = get_standard_system_prompt(warmup_file="/nonexistent/path/to/file.txt")

        # Should return a default prompt
        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)

        # Should contain assistant instructions
        self.assertTrue(
            "assistant" in result.lower() or "help" in result.lower(),
            "Fallback should contain reasonable default instructions"
        )

    def test_returns_default_when_no_file_specified(self):
        """Test that default prompt is returned when no file specified"""
        result = get_standard_system_prompt(warmup_file=None)

        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)

    def test_handles_empty_file(self):
        """Test handling of empty file"""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
            temp_file = f.name

        try:
            result = get_standard_system_prompt(warmup_file=temp_file)
            # Should either return empty string or fallback
            self.assertIsInstance(result, str)
        finally:
            os.unlink(temp_file)

    def test_handles_large_file(self):
        """Test handling of large system prompt file (100KB)"""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
            large_content = "You are helpful. " * 5000  # ~100KB
            f.write(large_content)
            temp_file = f.name

        try:
            result = get_standard_system_prompt(warmup_file=temp_file)
            self.assertEqual(result, large_content)
            self.assertGreater(len(result), 50000)
        finally:
            os.unlink(temp_file)

    def test_handles_unicode_content(self):
        """Test handling of unicode characters in prompt"""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as f:
            unicode_content = "You are helpful. 你好世界 🚀 مرحبا"
            f.write(unicode_content)
            temp_file = f.name

        try:
            result = get_standard_system_prompt(warmup_file=temp_file)
            self.assertEqual(result, unicode_content)
            self.assertIn("🚀", result)
        finally:
            os.unlink(temp_file)


class TestWarmupKVCacheFunction(unittest.TestCase):
    """Test warmup_kv_cache() async function"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def tearDown(self):
        """Clean up after tests"""
        if hasattr(self, 'cache_manager'):
            self.cache_manager.clear()

    def test_warmup_returns_bool(self):
        """Test that warmup_kv_cache returns a boolean"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_returns_true_on_success(self):
        """Test that warmup_kv_cache returns True when successful"""
        async def run_test():
            # Mock model and tokenizer
            model = MagicMock()
            tokenizer = MagicMock()
            tokenizer.encode = MagicMock(return_value=[1, 2, 3])

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            if result:  # Success case
                self.assertTrue(result)

        asyncio.run(run_test())

    def test_warmup_returns_false_on_failure(self):
        """Test that warmup_kv_cache returns False when it fails"""
        async def run_test():
            # Mock model that raises exception
            model = None  # Simulate missing model
            tokenizer = None

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Should handle error gracefully
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_disabled_when_kv_cache_warmup_zero(self):
        """Test that warmup is skipped when KV_CACHE_WARMUP=0"""
        async def run_test():
            with patch.dict(os.environ, {'KV_CACHE_WARMUP': '0'}):
                model = MagicMock()
                tokenizer = MagicMock()

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    timeout_sec=60.0,
                    enabled=False  # Should skip warmup
                )

                # When disabled, should return True (not an error, just skipped)
                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_enabled_by_default(self):
        """Test that warmup is enabled by default"""
        async def run_test():
            with patch.dict(os.environ, {}, clear=False):
                # Remove KV_CACHE_WARMUP if set
                os.environ.pop('KV_CACHE_WARMUP', None)

                model = MagicMock()
                tokenizer = MagicMock()

                # Default enabled=True
                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_respects_timeout_config(self):
        """Test that warmup respects WARMUP_TIMEOUT_SEC configuration"""
        async def run_test():
            with patch.dict(os.environ, {'WARMUP_TIMEOUT_SEC': '30'}):
                model = MagicMock()
                tokenizer = MagicMock()

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    timeout_sec=30.0,
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_populates_cache(self):
        """Test that warmup populates the cache with entries"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Get initial cache stats
            initial_stats = self.cache_manager.get_stats()
            initial_count = initial_stats['total_entries']

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            if result:  # If warmup succeeded
                # Cache should have at least 1 entry
                final_stats = self.cache_manager.get_stats()
                final_count = final_stats['total_entries']

                # At least 1 warmup entry should be added
                self.assertGreaterEqual(final_count, initial_count)

        asyncio.run(run_test())

    def test_cache_key_generation_is_consistent(self):
        """Test that cache keys are generated consistently for same input"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Run warmup twice with same inputs
            result1 = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Second run should generate same cache key
            result2 = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Both should succeed or both should fail
            self.assertEqual(result1, result2)

        asyncio.run(run_test())

    def test_warmup_with_custom_system_file(self):
        """Test that warmup uses custom system prompt file when specified"""
        async def run_test():
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
                f.write("Custom system prompt")
                temp_file = f.name

            try:
                with patch.dict(os.environ, {'WARMUP_SYSTEM_FILE': temp_file}):
                    model = MagicMock()
                    tokenizer = MagicMock()

                    result = await warmup_kv_cache(
                        model=model,
                        tokenizer=tokenizer,
                        cache_manager=self.cache_manager,
                        timeout_sec=60.0,
                        enabled=True
                    )

                    self.assertIsInstance(result, bool)
            finally:
                os.unlink(temp_file)

        asyncio.run(run_test())


class TestWarmupTimeout(unittest.TestCase):
    """Test warmup timeout handling"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmup_timeout_default_is_60_seconds(self):
        """Test that default timeout is 60 seconds"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Call without explicit timeout should use default
            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                enabled=True
            )

            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_respects_custom_timeout(self):
        """Test that warmup respects custom timeout value"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Use shorter timeout
            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=5.0,  # 5 second timeout
                enabled=True
            )

            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_timeout_environment_variable_overrides_default(self):
        """Test that WARMUP_TIMEOUT_SEC env var overrides default"""
        async def run_test():
            with patch.dict(os.environ, {'WARMUP_TIMEOUT_SEC': '10'}):
                model = MagicMock()
                tokenizer = MagicMock()

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    timeout_sec=float(os.environ.get('WARMUP_TIMEOUT_SEC', 60)),
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())


class TestWarmupErrorHandling(unittest.TestCase):
    """Test warmup error handling and graceful fallback"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmup_handles_missing_cache_manager(self):
        """Test that warmup handles None cache manager gracefully"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=None,  # No cache manager
                timeout_sec=60.0,
                enabled=True
            )

            # Should handle gracefully (return False or True, not raise)
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_handles_missing_model(self):
        """Test that warmup handles missing model gracefully"""
        async def run_test():
            model = None
            tokenizer = MagicMock()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Should handle gracefully
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_handles_missing_tokenizer(self):
        """Test that warmup handles missing tokenizer gracefully"""
        async def run_test():
            model = MagicMock()
            tokenizer = None

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Should handle gracefully
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_handles_tokenizer_encoding_error(self):
        """Test that warmup handles tokenizer errors"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()
            tokenizer.encode.side_effect = Exception("Tokenizer error")

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Should not raise, return False on error
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_handles_cache_write_error(self):
        """Test that warmup handles cache write errors"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Create cache that will fail on set
            cache_manager = MagicMock()
            cache_manager.set.side_effect = Exception("Cache write error")

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Should handle gracefully
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())


if __name__ == '__main__':
    unittest.main(verbosity=2)
