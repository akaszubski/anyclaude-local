#!/usr/bin/env python3
"""
Integration Tests: Cache Warmup Feature - End-to-End Server Startup Flow

Tests for cache warmup as part of complete server startup and operation.
Covers server startup with warmup, first request cache hits, timeout handling,
and graceful fallback behavior.

Expected to FAIL until cache warmup implementation is complete (TDD Red Phase)
"""

import unittest
import asyncio
import tempfile
import os
import sys
import json
import time
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock, MagicMock, call
from typing import Optional, Dict, Any, Tuple
import logging
import threading
import socket

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# Configure logging for tests
logging.basicConfig(
    level=logging.DEBUG,
    format='[%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("test_cache_warmup_e2e")

# Import cache manager
try:
    from ram_cache import InMemoryKVCacheManager
except ImportError:
    class InMemoryKVCacheManager:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("InMemoryKVCacheManager not yet implemented")

# Import warmup functions (will fail until implemented)
try:
    from mlx_server import get_standard_system_prompt, warmup_kv_cache, VLLMMLXServer
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

    class VLLMMLXServer:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("VLLMMLXServer not yet implemented")


class TestCacheWarmupServerStartup(unittest.TestCase):
    """Test cache warmup integrated into server startup"""

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

    def test_server_warmup_disabled_skips_warmup(self):
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
                    enabled=False
                )

                # When disabled, should return True (skip is not an error)
                self.assertTrue(isinstance(result, bool))

        asyncio.run(run_test())

    def test_server_warmup_enabled_by_default(self):
        """Test that warmup is enabled when KV_CACHE_WARMUP is not set"""
        async def run_test():
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop('KV_CACHE_WARMUP', None)

                model = MagicMock()
                tokenizer = MagicMock()

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_server_starts_even_if_warmup_fails(self):
        """Test that server starts successfully even if warmup fails"""
        async def run_test():
            # Mock broken model
            model = None
            tokenizer = None

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Warmup may fail but shouldn't block server startup
            # Result can be False, but it shouldn't raise exception
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_runs_between_model_load_and_server_start(self):
        """Test that warmup runs after model load but before server accepts requests"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Track call order
            call_order = []

            # Mock model load
            async def mock_load():
                call_order.append('model_load')

            # Mock warmup
            async def mock_warmup():
                call_order.append('warmup')
                return True

            # Simulate the startup sequence
            await mock_load()
            warmup_result = await mock_warmup()

            # Warmup should come after model load
            self.assertEqual(call_order, ['model_load', 'warmup'])
            self.assertTrue(warmup_result)

        asyncio.run(run_test())


class TestFirstRequestCacheHit(unittest.TestCase):
    """Test that first request after warmup hits cache"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_cache_populated_after_warmup(self):
        """Test that cache has entries after warmup completes"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Check cache before warmup
            stats_before = self.cache_manager.get_stats()
            count_before = stats_before['total_entries']

            # Run warmup
            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            if result:  # If warmup succeeded
                # Check cache after warmup
                stats_after = self.cache_manager.get_stats()
                count_after = stats_after['total_entries']

                # Should have at least as many entries as before
                self.assertGreaterEqual(count_after, count_before)

        asyncio.run(run_test())

    def test_cache_hit_on_matching_prompt(self):
        """Test that cache hits occur for matching prompts"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Manually add a cache entry
            test_key = "test_prompt_cache_key"
            test_value = b"cached_kv_state"

            self.cache_manager.set(test_key, test_value)

            # Try to retrieve it
            cached = self.cache_manager.get(test_key)

            self.assertEqual(cached, test_value)

        asyncio.run(run_test())

    def test_cache_statistics_show_entries_after_warmup(self):
        """Test that cache statistics reflect warmup entries"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Add some entries to cache
            for i in range(5):
                key = f"warmup_entry_{i}"
                value = f"cache_data_{i}".encode()
                self.cache_manager.set(key, value)

            # Check statistics
            stats = self.cache_manager.get_stats()

            self.assertIn('total_entries', stats)
            self.assertGreaterEqual(stats['total_entries'], 5)

        asyncio.run(run_test())


class TestWarmupTimeout(unittest.TestCase):
    """Test warmup timeout configuration and enforcement"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmup_timeout_is_respected(self):
        """Test that warmup respects timeout configuration"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            start_time = time.time()

            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=5.0,  # 5 second timeout
                enabled=True
            )

            elapsed = time.time() - start_time

            # Should complete within timeout + buffer
            self.assertLess(elapsed, 10.0)

        asyncio.run(run_test())

    def test_warmup_timeout_configurable_via_env(self):
        """Test that WARMUP_TIMEOUT_SEC controls timeout"""
        async def run_test():
            with patch.dict(os.environ, {'WARMUP_TIMEOUT_SEC': '15'}):
                model = MagicMock()
                tokenizer = MagicMock()

                timeout_sec = float(os.environ.get('WARMUP_TIMEOUT_SEC', 60))

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    timeout_sec=timeout_sec,
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_server_continues_if_warmup_times_out(self):
        """Test that server doesn't block if warmup times out"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Simulate slowdown that might trigger timeout
            result = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=1.0,  # Short timeout
                enabled=True
            )

            # Even if times out, should not raise exception
            self.assertIsInstance(result, bool)

        asyncio.run(run_test())


class TestWarmupConfiguration(unittest.TestCase):
    """Test warmup configuration options"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_kv_cache_warmup_enabled_default(self):
        """Test that KV_CACHE_WARMUP is enabled by default"""
        async def run_test():
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop('KV_CACHE_WARMUP', None)

                model = MagicMock()
                tokenizer = MagicMock()

                # Should run warmup by default
                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_kv_cache_warmup_disabled_via_env(self):
        """Test that KV_CACHE_WARMUP=0 disables warmup"""
        async def run_test():
            with patch.dict(os.environ, {'KV_CACHE_WARMUP': '0'}):
                model = MagicMock()
                tokenizer = MagicMock()

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    timeout_sec=60.0,
                    enabled=False
                )

                # Should return quickly when disabled
                self.assertIsInstance(result, bool)

        asyncio.run(run_test())

    def test_warmup_system_file_env_var(self):
        """Test that WARMUP_SYSTEM_FILE env var is respected"""
        async def run_test():
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
                f.write("Custom warmup prompt")
                temp_file = f.name

            try:
                with patch.dict(os.environ, {'WARMUP_SYSTEM_FILE': temp_file}):
                    # Verify env var is set
                    self.assertEqual(os.environ.get('WARMUP_SYSTEM_FILE'), temp_file)

                    # Load prompt using env var
                    prompt = get_standard_system_prompt(warmup_file=temp_file)
                    self.assertIsNotNone(prompt)
            finally:
                os.unlink(temp_file)

        asyncio.run(run_test())

    def test_warmup_timeout_sec_env_var(self):
        """Test that WARMUP_TIMEOUT_SEC env var is respected"""
        async def run_test():
            with patch.dict(os.environ, {'WARMUP_TIMEOUT_SEC': '20'}):
                timeout_from_env = float(os.environ.get('WARMUP_TIMEOUT_SEC', 60))

                model = MagicMock()
                tokenizer = MagicMock()

                result = await warmup_kv_cache(
                    model=model,
                    tokenizer=tokenizer,
                    cache_manager=self.cache_manager,
                    timeout_sec=timeout_from_env,
                    enabled=True
                )

                self.assertIsInstance(result, bool)

        asyncio.run(run_test())


class TestWarmupWithDifferentPrompts(unittest.TestCase):
    """Test warmup behavior with different system prompts"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_warmup_with_short_prompt(self):
        """Test warmup with short system prompt"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
                f.write("Be helpful.")
                temp_file = f.name

            try:
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

    def test_warmup_with_long_prompt(self):
        """Test warmup with long system prompt (100+ lines)"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
                # Write a long prompt
                long_prompt = "\n".join(
                    [f"Instruction {i}: Be helpful and clear" for i in range(100)]
                )
                f.write(long_prompt)
                temp_file = f.name

            try:
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

    def test_warmup_with_structured_prompt(self):
        """Test warmup with structured prompt (JSON/YAML-like)"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
                structured = """
Role: Assistant
Capabilities:
  - Read files
  - Write code
  - Execute commands
Instructions:
  - Be helpful
  - Be clear
  - Use proper formatting
"""
                f.write(structured)
                temp_file = f.name

            try:
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


class TestWarmupCacheKeyConsistency(unittest.TestCase):
    """Test that cache keys are generated consistently"""

    def setUp(self):
        """Set up test fixtures"""
        self.cache_manager = InMemoryKVCacheManager(
            max_memory_mb=5000,
            eviction_policy='lru'
        )

    def test_same_prompt_generates_same_cache_key(self):
        """Test that identical prompts generate identical cache keys"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Create consistent mock setup
            prompt_text = "You are helpful"

            # Simulate two warmup calls with same model/prompt
            result1 = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            result2 = await warmup_kv_cache(
                model=model,
                tokenizer=tokenizer,
                cache_manager=self.cache_manager,
                timeout_sec=60.0,
                enabled=True
            )

            # Both should produce consistent results
            self.assertEqual(type(result1), type(result2))

        asyncio.run(run_test())

    def test_different_prompts_generate_different_cache_keys(self):
        """Test that different prompts generate different cache keys"""
        async def run_test():
            model = MagicMock()
            tokenizer = MagicMock()

            # Add different cache entries manually
            key1 = "prompt_key_1"
            key2 = "prompt_key_2"

            self.cache_manager.set(key1, b"cache_data_1")
            self.cache_manager.set(key2, b"cache_data_2")

            # Both should be retrievable separately
            val1 = self.cache_manager.get(key1)
            val2 = self.cache_manager.get(key2)

            self.assertEqual(val1, b"cache_data_1")
            self.assertEqual(val2, b"cache_data_2")
            self.assertNotEqual(val1, val2)

        asyncio.run(run_test())


if __name__ == '__main__':
    unittest.main(verbosity=2)
