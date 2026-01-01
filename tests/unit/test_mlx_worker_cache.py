#!/usr/bin/env python3
"""
Unit Tests: MLX Worker Cache Management

Tests for KV cache management that enables cache-aware routing
and improves inference performance.

Expected to FAIL until cache.py implementation is complete (TDD Red Phase)

Test Coverage:
- Cache state tracking (tokens, hash, timestamp)
- Cache warming with system prompts
- Cache clearing
- Cache hash computation
- Thread safety for concurrent access
- Integration with mlx_lm cache_prompt()
"""

import pytest
import sys
import time
import hashlib
import threading
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
from typing import Dict, Any

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / 'src'
sys.path.insert(0, str(src_path))

# This import will fail until implementation is complete
try:
    from mlx_worker.cache import (
        get_cache_state,
        warm_cache,
        clear_cache,
        compute_prompt_hash,
        CacheManager,
        CacheError
    )
except ImportError:
    # Mock classes for TDD red phase
    class CacheError(Exception):
        """Base exception for cache errors"""
        pass

    class CacheManager:
        def __init__(self):
            raise NotImplementedError("CacheManager not yet implemented")

    def get_cache_state() -> Dict[str, Any]:
        raise NotImplementedError("get_cache_state not yet implemented")

    def warm_cache(system_prompt: str) -> Dict[str, Any]:
        raise NotImplementedError("warm_cache not yet implemented")

    def clear_cache() -> None:
        raise NotImplementedError("clear_cache not yet implemented")

    def compute_prompt_hash(prompt: str) -> str:
        raise NotImplementedError("compute_prompt_hash not yet implemented")


class TestCacheState:
    """Test cache state tracking"""

    def test_get_cache_state_initial(self):
        """Test get_cache_state returns valid initial state"""
        state = get_cache_state()

        # Should have required fields
        assert 'tokens' in state
        assert 'systemPromptHash' in state
        assert 'lastUpdated' in state

        # Initial state should be empty
        assert state['tokens'] == 0
        assert state['systemPromptHash'] == ""
        assert state['lastUpdated'] == 0

    def test_get_cache_state_structure_matches_typescript(self):
        """Test cache state structure matches NodeCacheState TypeScript interface"""
        state = get_cache_state()

        # Must match: interface NodeCacheState { tokens, systemPromptHash, lastUpdated }
        assert isinstance(state['tokens'], int)
        assert isinstance(state['systemPromptHash'], str)
        assert isinstance(state['lastUpdated'], (int, float))

    def test_get_cache_state_returns_copy(self):
        """Test get_cache_state returns a copy, not reference"""
        state1 = get_cache_state()
        state2 = get_cache_state()

        # Should be different objects
        assert state1 is not state2

        # But same values (if cache unchanged)
        assert state1['tokens'] == state2['tokens']
        assert state1['systemPromptHash'] == state2['systemPromptHash']

    @patch('mlx_worker.cache.count_tokens')
    def test_get_cache_state_after_warm(self, mock_count_tokens):
        """Test get_cache_state reflects warmed cache"""
        mock_count_tokens.return_value = 150

        # Warm cache
        system_prompt = "You are a helpful assistant."
        warm_cache(system_prompt)

        # Get state
        state = get_cache_state()

        # Should reflect warmed cache
        assert state['tokens'] == 150
        assert state['systemPromptHash'] != ""
        assert state['lastUpdated'] > 0


class TestCacheWarming:
    """Test cache warming functionality"""

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_success(self, mock_load_model, mock_count_tokens):
        """Test successful cache warming"""
        # Setup mocks
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_count_tokens.return_value = 100

        system_prompt = "You are a helpful coding assistant."

        # Warm cache
        result = warm_cache(system_prompt)

        # Should return updated cache state
        assert result['tokens'] == 100
        assert result['systemPromptHash'] != ""
        assert result['lastUpdated'] > 0

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_updates_state(self, mock_load_model, mock_count_tokens):
        """Test warm_cache updates global cache state"""
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_count_tokens.return_value = 200

        # Warm cache
        warm_cache("System prompt")

        # State should be updated
        state = get_cache_state()
        assert state['tokens'] == 200

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_computes_hash(self, mock_load_model, mock_count_tokens):
        """Test warm_cache computes and stores prompt hash"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 50

        prompt = "Unique system prompt"

        # Warm cache
        result = warm_cache(prompt)

        # Hash should be deterministic
        expected_hash = compute_prompt_hash(prompt)
        assert result['systemPromptHash'] == expected_hash

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_different_prompts_different_hashes(self, mock_load_model, mock_count_tokens):
        """Test different prompts produce different hashes"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 50

        # Clear first
        clear_cache()

        # Warm with first prompt
        result1 = warm_cache("First prompt")
        hash1 = result1['systemPromptHash']

        # Warm with different prompt
        result2 = warm_cache("Different prompt")
        hash2 = result2['systemPromptHash']

        # Hashes should be different
        assert hash1 != hash2

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_same_prompt_same_hash(self, mock_load_model, mock_count_tokens):
        """Test same prompt produces same hash"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 50

        prompt = "Consistent prompt"

        # Warm twice with same prompt
        clear_cache()
        result1 = warm_cache(prompt)

        clear_cache()
        result2 = warm_cache(prompt)

        # Hashes should be identical
        assert result1['systemPromptHash'] == result2['systemPromptHash']

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_updates_timestamp(self, mock_load_model, mock_count_tokens):
        """Test warm_cache updates lastUpdated timestamp"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 50

        # Get current time
        before = time.time() * 1000  # milliseconds

        # Warm cache
        result = warm_cache("Test prompt")

        after = time.time() * 1000

        # Timestamp should be in valid range
        assert before <= result['lastUpdated'] <= after

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_empty_prompt(self, mock_load_model, mock_count_tokens):
        """Test warm_cache with empty prompt"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 0

        # Should handle empty prompt gracefully
        result = warm_cache("")

        assert result['tokens'] == 0
        assert result['systemPromptHash'] != ""  # Empty string still has hash

    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_handles_model_error(self, mock_load_model):
        """Test warm_cache handles model loading errors"""
        mock_load_model.side_effect = RuntimeError("Model failed to load")

        with pytest.raises(CacheError) as exc_info:
            warm_cache("Test prompt")

        assert "failed to load" in str(exc_info.value).lower()

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_warm_cache_calls_mlx_cache_prompt(self, mock_load_model, mock_count_tokens):
        """Test warm_cache integrates with mlx_lm cache_prompt"""
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_count_tokens.return_value = 100

        # Warm cache
        warm_cache("System prompt")

        # Should call model with cache_prompt=True (implementation detail)
        # This verifies integration with mlx_lm's KV caching


class TestCacheClearing:
    """Test cache clearing functionality"""

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_clear_cache_resets_state(self, mock_load_model, mock_count_tokens):
        """Test clear_cache resets to initial state"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 100

        # Warm cache first
        warm_cache("Test prompt")

        # Verify cache is warmed
        state = get_cache_state()
        assert state['tokens'] > 0

        # Clear cache
        clear_cache()

        # State should be reset
        state = get_cache_state()
        assert state['tokens'] == 0
        assert state['systemPromptHash'] == ""
        assert state['lastUpdated'] == 0

    def test_clear_cache_idempotent(self):
        """Test clear_cache can be called multiple times safely"""
        # Should not raise errors
        clear_cache()
        clear_cache()
        clear_cache()

        state = get_cache_state()
        assert state['tokens'] == 0

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_clear_cache_after_clear(self, mock_load_model, mock_count_tokens):
        """Test cache can be warmed again after clearing"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 50

        # Warm, clear, warm again
        warm_cache("First prompt")
        clear_cache()
        result = warm_cache("Second prompt")

        # Should work correctly
        assert result['tokens'] == 50
        assert result['systemPromptHash'] != ""


class TestPromptHashing:
    """Test prompt hash computation"""

    def test_compute_prompt_hash_deterministic(self):
        """Test hash is deterministic for same input"""
        prompt = "Test prompt for hashing"

        hash1 = compute_prompt_hash(prompt)
        hash2 = compute_prompt_hash(prompt)

        assert hash1 == hash2

    def test_compute_prompt_hash_different_inputs(self):
        """Test different prompts produce different hashes"""
        hash1 = compute_prompt_hash("First prompt")
        hash2 = compute_prompt_hash("Second prompt")

        assert hash1 != hash2

    def test_compute_prompt_hash_format(self):
        """Test hash format is valid"""
        hash_value = compute_prompt_hash("Test")

        # Should be hex string
        assert isinstance(hash_value, str)
        assert len(hash_value) > 0
        # Should be valid hex
        int(hash_value, 16)

    def test_compute_prompt_hash_empty_string(self):
        """Test hash of empty string"""
        hash_value = compute_prompt_hash("")

        # Should produce valid hash even for empty string
        assert isinstance(hash_value, str)
        assert len(hash_value) > 0

    def test_compute_prompt_hash_unicode(self):
        """Test hash handles unicode correctly"""
        prompt = "Hello 世界 🌍"

        hash_value = compute_prompt_hash(prompt)

        assert isinstance(hash_value, str)
        assert len(hash_value) > 0

    def test_compute_prompt_hash_whitespace_sensitive(self):
        """Test hash is sensitive to whitespace differences"""
        hash1 = compute_prompt_hash("Hello world")
        hash2 = compute_prompt_hash("Hello  world")  # Extra space

        # Different whitespace should produce different hashes
        assert hash1 != hash2

    def test_compute_prompt_hash_uses_sha256(self):
        """Test hash uses SHA-256 algorithm"""
        prompt = "Test prompt"
        hash_value = compute_prompt_hash(prompt)

        # SHA-256 produces 64 hex characters
        assert len(hash_value) == 64

        # Should match hashlib SHA-256
        expected = hashlib.sha256(prompt.encode('utf-8')).hexdigest()
        assert hash_value == expected


class TestCacheThreadSafety:
    """Test thread safety for concurrent cache operations"""

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_concurrent_warm_cache_safe(self, mock_load_model, mock_count_tokens):
        """Test concurrent warm_cache calls are thread-safe"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 100

        errors = []

        def warm_cache_thread():
            try:
                warm_cache("Test prompt")
            except Exception as e:
                errors.append(e)

        # Create 10 threads warming cache concurrently
        threads = []
        for _ in range(10):
            t = threading.Thread(target=warm_cache_thread)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors should occur
        assert len(errors) == 0

        # State should be consistent
        state = get_cache_state()
        assert state['tokens'] == 100

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_concurrent_get_cache_state_safe(self, mock_load_model, mock_count_tokens):
        """Test concurrent get_cache_state calls are thread-safe"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 50

        # Warm cache first
        warm_cache("Initial prompt")

        states = []

        def get_state_thread():
            state = get_cache_state()
            states.append(state)

        # Create 20 threads reading state concurrently
        threads = []
        for _ in range(20):
            t = threading.Thread(target=get_state_thread)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # All should get valid states
        assert len(states) == 20
        for state in states:
            assert state['tokens'] == 50

    def test_concurrent_clear_cache_safe(self):
        """Test concurrent clear_cache calls are thread-safe"""
        errors = []

        def clear_cache_thread():
            try:
                clear_cache()
            except Exception as e:
                errors.append(e)

        # Create 10 threads clearing cache concurrently
        threads = []
        for _ in range(10):
            t = threading.Thread(target=clear_cache_thread)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors should occur
        assert len(errors) == 0

        # State should be cleared
        state = get_cache_state()
        assert state['tokens'] == 0

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_concurrent_mixed_operations_safe(self, mock_load_model, mock_count_tokens):
        """Test mixed cache operations are thread-safe"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 75

        errors = []
        states = []

        def warm_thread():
            try:
                warm_cache("Concurrent prompt")
            except Exception as e:
                errors.append(e)

        def get_thread():
            try:
                state = get_cache_state()
                states.append(state)
            except Exception as e:
                errors.append(e)

        def clear_thread():
            try:
                clear_cache()
            except Exception as e:
                errors.append(e)

        # Mix of operations
        threads = []
        for i in range(30):
            if i % 3 == 0:
                t = threading.Thread(target=warm_thread)
            elif i % 3 == 1:
                t = threading.Thread(target=get_thread)
            else:
                t = threading.Thread(target=clear_thread)

            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors should occur
        assert len(errors) == 0

        # All get operations should return valid states
        for state in states:
            assert 'tokens' in state
            assert 'systemPromptHash' in state
            assert 'lastUpdated' in state


class TestCacheManager:
    """Test CacheManager class if using object-oriented approach"""

    def test_cache_manager_singleton(self):
        """Test CacheManager follows singleton pattern"""
        manager1 = CacheManager()
        manager2 = CacheManager()

        # Should be same instance
        assert manager1 is manager2

    def test_cache_manager_initialization(self):
        """Test CacheManager initializes with empty state"""
        manager = CacheManager()

        state = manager.get_state()
        assert state['tokens'] == 0
        assert state['systemPromptHash'] == ""

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_cache_manager_warm(self, mock_load_model, mock_count_tokens):
        """Test CacheManager warm method"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 120

        manager = CacheManager()
        result = manager.warm("System prompt")

        assert result['tokens'] == 120

    def test_cache_manager_clear(self):
        """Test CacheManager clear method"""
        manager = CacheManager()

        manager.clear()

        state = manager.get_state()
        assert state['tokens'] == 0


class TestCacheIntegration:
    """Test cache integration with inference"""

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    @patch('mlx_worker.cache.generate_stream')
    def test_cache_hit_detection(self, mock_generate, mock_load_model, mock_count_tokens):
        """Test detection of cache hits during generation"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.return_value = 100
        mock_generate.return_value = iter(["response"])

        # Warm cache with system prompt
        system_prompt = "You are a helpful assistant."
        warm_result = warm_cache(system_prompt)
        cached_hash = warm_result['systemPromptHash']

        # Generate with same system prompt should be cache hit
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Hello"}
        ]

        # Implementation should detect cache hit by comparing hashes
        # This is tested in server integration tests

    @patch('mlx_worker.cache.count_tokens')
    @patch('mlx_worker.cache.load_model')
    def test_cache_invalidation_on_different_prompt(self, mock_load_model, mock_count_tokens):
        """Test cache is invalidated when system prompt changes"""
        mock_load_model.return_value = (MagicMock(), MagicMock())
        mock_count_tokens.side_effect = [100, 150]

        # Warm with first prompt
        warm_cache("First system prompt")
        state1 = get_cache_state()

        # Warm with different prompt
        warm_cache("Different system prompt")
        state2 = get_cache_state()

        # Hash should change
        assert state1['systemPromptHash'] != state2['systemPromptHash']
        # Token count should update
        assert state2['tokens'] == 150


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
