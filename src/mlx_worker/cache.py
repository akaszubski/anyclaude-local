"""
KV Cache Management

Manages cache state, warming, and hash computation for cache-aware routing.
"""

import hashlib
import time
import threading
from typing import Dict, Any
from dataclasses import dataclass, asdict

from .inference import count_tokens, load_model, generate_stream


class CacheError(Exception):
    """Base exception for cache errors"""
    pass


@dataclass
class CacheState:
    """Cache state matching NodeCacheState TypeScript interface"""
    tokens: int
    systemPromptHash: str
    lastUpdated: float  # Unix timestamp in milliseconds (can be int or float)


class CacheManager:
    """
    Singleton cache manager for thread-safe cache operations.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._state_lock = threading.Lock()
        self._state = CacheState(
            tokens=0,
            systemPromptHash="",
            lastUpdated=0
        )
        self._initialized = True

    def get_state(self) -> Dict[str, Any]:
        """
        Get current cache state.

        Returns:
            Dict with tokens, systemPromptHash, lastUpdated
        """
        with self._state_lock:
            # Return a copy to prevent external modification
            return asdict(self._state)

    def warm(self, system_prompt: str, model_path: str = "current-model") -> Dict[str, Any]:
        """
        Warm cache with system prompt.

        Args:
            system_prompt: System prompt to cache
            model_path: Model path for token counting

        Returns:
            Updated cache state

        Raises:
            CacheError: If cache warming fails
        """
        try:
            # Compute hash
            prompt_hash = compute_prompt_hash(system_prompt)

            # Count tokens
            token_count = count_tokens(system_prompt, model_path)

            # Actually warm the KV cache by running model on system prompt
            try:
                model, tokenizer = load_model(model_path)
                from mlx_lm.models.cache import make_prompt_cache
                from mlx_lm import stream_generate as mlx_stream_generate

                prompt_cache = make_prompt_cache(model)
                system_messages = [{"role": "system", "content": system_prompt}]
                formatted = tokenizer.apply_chat_template(
                    system_messages, add_generation_prompt=True, tokenize=False
                )
                warm_start = time.time()
                for _ in mlx_stream_generate(
                    model, tokenizer, formatted,
                    max_tokens=1, prompt_cache=prompt_cache
                ):
                    pass
                warm_time = time.time() - warm_start
                print(f"[cache] KV cache warmed in {warm_time:.2f}s ({token_count} tokens)")
                self._prompt_cache = prompt_cache
            except Exception as e:
                # Model not available (e.g. in test environment), just update state
                print(f"[cache] Could not warm KV cache: {e}")

            # Update state
            with self._state_lock:
                self._state.tokens = token_count
                self._state.systemPromptHash = prompt_hash
                self._state.lastUpdated = time.time() * 1000  # milliseconds (float for precision)

                return asdict(self._state)

        except Exception as e:
            raise CacheError(f"Failed to warm cache: {str(e)}")

    def get_prompt_cache(self):
        """Return the mlx_lm prompt cache object, or None if not warmed."""
        return getattr(self, '_prompt_cache', None)

    def is_warmed(self) -> bool:
        """Return whether the KV cache has been warmed with actual model inference."""
        return getattr(self, '_prompt_cache', None) is not None

    def clear(self) -> None:
        """Clear cache state."""
        with self._state_lock:
            self._state.tokens = 0
            self._state.systemPromptHash = ""
            self._state.lastUpdated = 0
            self._prompt_cache = None


# Global cache manager instance
_cache_manager = CacheManager()


def get_cache_state() -> Dict[str, Any]:
    """
    Get current cache state.

    Returns:
        Dict matching NodeCacheState interface:
        - tokens: int
        - systemPromptHash: str
        - lastUpdated: int (milliseconds)
    """
    return _cache_manager.get_state()


def warm_cache(system_prompt: str, model_path: str = "current-model") -> Dict[str, Any]:
    """
    Warm cache with system prompt.

    Args:
        system_prompt: System prompt text to cache
        model_path: Path to model

    Returns:
        Updated cache state

    Raises:
        CacheError: If warming fails
    """
    return _cache_manager.warm(system_prompt, model_path)


def clear_cache() -> None:
    """Clear cache state."""
    _cache_manager.clear()


def get_prompt_cache():
    """Get the mlx_lm prompt cache object for use by inference engine."""
    return _cache_manager.get_prompt_cache()


def is_cache_warmed() -> bool:
    """Check if cache has been warmed with actual model inference."""
    return _cache_manager.is_warmed()


def compute_prompt_hash(prompt: str) -> str:
    """
    Compute SHA-256 hash of prompt.

    Args:
        prompt: Prompt text to hash

    Returns:
        64-character hex string (SHA-256 hash)
    """
    return hashlib.sha256(prompt.encode('utf-8')).hexdigest()
