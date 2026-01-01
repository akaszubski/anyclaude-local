"""
Health Monitoring

Tracks node health, request metrics, and error rates for cluster monitoring.
"""

import time
import threading
from typing import Dict, Any
from dataclasses import dataclass, asdict

# Import cache functions for integration tests
try:
    from .cache import get_cache_state
except ImportError:
    # May not be available during testing
    get_cache_state = None


class HealthError(Exception):
    """Base exception for health monitoring errors"""
    pass


@dataclass
class NodeHealth:
    """Node health matching TypeScript interface"""
    lastCheck: float  # Unix timestamp in milliseconds (int or float)
    consecutiveFailures: int
    avgResponseTime: float  # milliseconds
    errorRate: float  # 0.0 - 1.0


@dataclass
class NodeMetrics:
    """Node metrics matching TypeScript interface"""
    requestsInFlight: int
    totalRequests: int
    cacheHitRate: float  # 0.0 - 1.0
    avgLatency: float  # milliseconds


class HealthMonitor:
    """
    Singleton health monitor for thread-safe metrics tracking.
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

        self._metrics_lock = threading.Lock()

        # Health tracking
        self._total_requests = 0
        self._successful_requests = 0
        self._total_latency = 0.0
        self._consecutive_failures = 0
        self._requests_in_flight = 0

        # Cache tracking
        self._cache_hits = 0
        self._cache_misses = 0

        self._initialized = True

    def get_health(self) -> Dict[str, Any]:
        """
        Get current node health.

        Returns:
            Dict matching NodeHealth interface
        """
        with self._metrics_lock:
            # Calculate metrics
            avg_response_time = (
                self._total_latency / self._total_requests
                if self._total_requests > 0
                else 0.0
            )

            error_rate = (
                (self._total_requests - self._successful_requests) / self._total_requests
                if self._total_requests > 0
                else 0.0
            )

            health = NodeHealth(
                lastCheck=time.time() * 1000,  # milliseconds (float for precision)
                consecutiveFailures=self._consecutive_failures,
                avgResponseTime=avg_response_time,
                errorRate=error_rate
            )

            return asdict(health)

    def get_metrics(self) -> Dict[str, Any]:
        """
        Get current node metrics.

        Returns:
            Dict matching NodeMetrics interface
        """
        with self._metrics_lock:
            # Calculate cache hit rate
            total_cache_requests = self._cache_hits + self._cache_misses
            cache_hit_rate = (
                self._cache_hits / total_cache_requests
                if total_cache_requests > 0
                else 0.0
            )

            # Average latency (same as avgResponseTime in health)
            avg_latency = (
                self._total_latency / self._total_requests
                if self._total_requests > 0
                else 0.0
            )

            metrics = NodeMetrics(
                requestsInFlight=self._requests_in_flight,
                totalRequests=self._total_requests,
                cacheHitRate=cache_hit_rate,
                avgLatency=avg_latency
            )

            return asdict(metrics)

    def record_success(self, latency: float) -> None:
        """
        Record successful request.

        Args:
            latency: Request latency in milliseconds
        """
        if latency < 0:
            raise ValueError("Latency cannot be negative")

        with self._metrics_lock:
            self._total_requests += 1
            self._successful_requests += 1
            self._total_latency += latency
            self._consecutive_failures = 0  # Reset on success

    def record_failure(self, latency: float) -> None:
        """
        Record failed request.

        Args:
            latency: Request latency in milliseconds
        """
        if latency < 0:
            raise ValueError("Latency cannot be negative")

        with self._metrics_lock:
            self._total_requests += 1
            self._total_latency += latency
            self._consecutive_failures += 1

    def increment_in_flight(self) -> None:
        """Increment requests in flight counter."""
        with self._metrics_lock:
            self._requests_in_flight += 1

    def decrement_in_flight(self) -> None:
        """Decrement requests in flight counter."""
        with self._metrics_lock:
            if self._requests_in_flight > 0:
                self._requests_in_flight -= 1

    def record_cache_hit(self) -> None:
        """Record cache hit."""
        with self._metrics_lock:
            self._cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record cache miss."""
        with self._metrics_lock:
            self._cache_misses += 1


# Global health monitor instance
_health_monitor = HealthMonitor()


def get_node_health() -> Dict[str, Any]:
    """
    Get current node health.

    Returns:
        Dict matching NodeHealth TypeScript interface:
        - lastCheck: int (milliseconds)
        - consecutiveFailures: int
        - avgResponseTime: float (milliseconds)
        - errorRate: float (0.0 - 1.0)
    """
    return _health_monitor.get_health()


def get_metrics() -> Dict[str, Any]:
    """
    Get current node metrics.

    Returns:
        Dict matching NodeMetrics TypeScript interface:
        - requestsInFlight: int
        - totalRequests: int
        - cacheHitRate: float (0.0 - 1.0)
        - avgLatency: float (milliseconds)
    """
    return _health_monitor.get_metrics()


def record_request(success: bool, latency: float) -> None:
    """
    Record request outcome.

    Args:
        success: Whether request succeeded
        latency: Request latency in milliseconds

    Raises:
        ValueError: If latency is negative
        HealthError: If recording fails
    """
    try:
        if success:
            _health_monitor.record_success(latency)
        else:
            _health_monitor.record_failure(latency)
    except ValueError:
        raise
    except Exception as e:
        raise HealthError(f"Failed to record request: {str(e)}")


def increment_requests_in_flight() -> None:
    """Increment requests in flight counter."""
    _health_monitor.increment_in_flight()


def decrement_requests_in_flight() -> None:
    """Decrement requests in flight counter."""
    _health_monitor.decrement_in_flight()


def record_cache_hit() -> None:
    """Record cache hit."""
    _health_monitor.record_cache_hit()


def record_cache_miss() -> None:
    """Record cache miss."""
    _health_monitor.record_cache_miss()
