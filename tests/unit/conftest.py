"""
Pytest configuration for unit tests.

Provides fixtures and hooks for test isolation.
"""

import pytest
import sys
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent.parent.parent / 'src'
sys.path.insert(0, str(src_path))


@pytest.fixture(autouse=True)
def clear_mlx_worker_caches():
    """
    Clear MLX worker module caches before each test for isolation.
    """
    # Clear inference module cache
    try:
        from mlx_worker import inference
        inference._model_cache.clear()
    except (ImportError, AttributeError):
        pass

    # Reset health monitor state
    try:
        from mlx_worker import health
        monitor = health.HealthMonitor()
        with monitor._metrics_lock:
            monitor._total_requests = 0
            monitor._successful_requests = 0
            monitor._total_latency = 0.0
            monitor._consecutive_failures = 0
            monitor._requests_in_flight = 0
            monitor._cache_hits = 0
            monitor._cache_misses = 0
    except (ImportError, AttributeError):
        pass

    # Run test
    yield

    # Clear again after test
    try:
        from mlx_worker import inference
        inference._model_cache.clear()
    except (ImportError, AttributeError):
        pass

    try:
        from mlx_worker import health
        monitor = health.HealthMonitor()
        with monitor._metrics_lock:
            monitor._total_requests = 0
            monitor._successful_requests = 0
            monitor._total_latency = 0.0
            monitor._consecutive_failures = 0
            monitor._requests_in_flight = 0
            monitor._cache_hits = 0
            monitor._cache_misses = 0
    except (ImportError, AttributeError):
        pass
