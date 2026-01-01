"""
MLX Worker Node

A Python worker node that provides OpenAI-compatible chat completions
using MLX for Apple Silicon inference.

Modules:
- inference: MLX model loading and token generation
- cache: KV cache management for performance
- health: Health monitoring and metrics tracking
- server: FastAPI HTTP server with OpenAI-compatible endpoints
"""

__version__ = "1.0.0"

from .inference import (
    load_model,
    generate_stream,
    count_tokens,
    InferenceError,
    ModelNotFoundError,
)

from .cache import (
    get_cache_state,
    warm_cache,
    clear_cache,
    compute_prompt_hash,
    CacheManager,
    CacheError,
)

from .health import (
    get_node_health,
    get_metrics,
    record_request,
    increment_requests_in_flight,
    decrement_requests_in_flight,
    record_cache_hit,
    record_cache_miss,
    HealthMonitor,
    HealthError,
)

__all__ = [
    # Inference
    "load_model",
    "generate_stream",
    "count_tokens",
    "InferenceError",
    "ModelNotFoundError",
    # Cache
    "get_cache_state",
    "warm_cache",
    "clear_cache",
    "compute_prompt_hash",
    "CacheManager",
    "CacheError",
    # Health
    "get_node_health",
    "get_metrics",
    "record_request",
    "increment_requests_in_flight",
    "decrement_requests_in_flight",
    "record_cache_hit",
    "record_cache_miss",
    "HealthMonitor",
    "HealthError",
]
