#!/usr/bin/env python3
"""
MetricsCollector: Performance Metrics Tracking for MLX Server

Tracks cache hit/miss rates, latency percentiles (P50/P95/P99),
memory usage, and throughput for performance monitoring.

Thread-safe for concurrent request handling.
"""

import time
import threading
from typing import Optional, Dict, Any, List
import statistics


class MetricType:
    """Metric type constants"""
    CACHE_HIT = "cache_hit"
    CACHE_MISS = "cache_miss"
    LATENCY = "latency"
    MEMORY = "memory"
    THROUGHPUT = "throughput"


class MetricsCollector:
    """
    Performance metrics collector

    Features:
    - Cache hit/miss rate tracking
    - Latency percentiles (P50, P95, P99)
    - Memory usage tracking (current, peak, growth)
    - Throughput calculation (requests/sec)
    - JSON and Prometheus export formats
    - Thread-safe concurrent access
    """

    def __init__(
        self,
        enable_memory_tracking: bool = True,
        enable_latency_tracking: bool = True
    ):
        """
        Initialize metrics collector

        Args:
            enable_memory_tracking: Enable memory usage tracking
            enable_latency_tracking: Enable latency tracking
        """
        self.enable_memory_tracking = enable_memory_tracking
        self.enable_latency_tracking = enable_latency_tracking

        # Cache metrics
        self.cache_hits = 0
        self.cache_misses = 0

        # Latency metrics
        self.latencies: List[float] = []
        self.max_latency_samples = 10000  # VUL-007 fix: Prevent unbounded growth

        # Memory metrics
        self.memory_current_mb = 0.0
        self.memory_peak_mb = 0.0
        self.memory_initial_mb = 0.0

        # Throughput metrics
        self.total_requests = 0
        self.request_timestamps: List[float] = []
        self.max_request_timestamps = 10000  # VUL-007 fix: Prevent unbounded growth

        # Uptime tracking
        self.start_time = time.time()

        # Thread safety
        self.lock = threading.Lock()

    def record_cache_hit(self) -> None:
        """Record a cache hit"""
        with self.lock:
            self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss"""
        with self.lock:
            self.cache_misses += 1

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics

        Returns:
            Dict with cache hits, misses, and hit rate
        """
        with self.lock:
            total = self.cache_hits + self.cache_misses
            hit_rate = self.cache_hits / total if total > 0 else 0.0

            return {
                'cache_hits': self.cache_hits,
                'cache_misses': self.cache_misses,
                'hit_rate': hit_rate
            }

    def record_latency(self, latency_ms: float) -> None:
        """
        Record request latency

        Args:
            latency_ms: Latency in milliseconds

        Raises:
            ValueError: If latency is negative
        """
        if latency_ms < 0:
            raise ValueError("Latency cannot be negative")

        if not self.enable_latency_tracking:
            return

        with self.lock:
            self.latencies.append(latency_ms)
            # VUL-007 fix: Limit latencies list size
            if len(self.latencies) > self.max_latency_samples:
                self.latencies = self.latencies[-self.max_latency_samples:]

    def get_latency_stats(self) -> Dict[str, Any]:
        """
        Get latency statistics including percentiles

        Returns:
            Dict with latencies, P50, P95, P99 percentiles
        """
        if not self.enable_latency_tracking:
            return {'enabled': False}

        with self.lock:
            if not self.latencies:
                return {
                    'latencies': [],
                    'p50': 0.0,
                    'p95': 0.0,
                    'p99': 0.0
                }

            # Calculate percentiles
            sorted_latencies = sorted(self.latencies)
            p50 = self._percentile(sorted_latencies, 50)
            p95 = self._percentile(sorted_latencies, 95)
            p99 = self._percentile(sorted_latencies, 99)

            # VUL-010 fix: Only export aggregated stats, not raw latencies
            return {
                'p50': p50,
                'p95': p95,
                'p99': p99,
                'count': len(self.latencies)
            }

    def _percentile(self, sorted_values: List[float], percentile: int) -> float:
        """
        Calculate percentile from sorted values

        Args:
            sorted_values: Sorted list of values
            percentile: Percentile to calculate (0-100)

        Returns:
            Percentile value
        """
        if not sorted_values:
            return 0.0

        n = len(sorted_values)
        index = (percentile / 100.0) * (n - 1)

        # Linear interpolation between values
        lower_index = int(index)
        upper_index = min(lower_index + 1, n - 1)

        lower_value = sorted_values[lower_index]
        upper_value = sorted_values[upper_index]

        fraction = index - lower_index
        return lower_value + (upper_value - lower_value) * fraction

    def record_memory_usage(self) -> None:
        """Record current memory usage"""
        if not self.enable_memory_tracking:
            return

        try:
            import psutil
            process = psutil.Process()
            memory_bytes = process.memory_info().rss
            memory_mb = memory_bytes / (1024 * 1024)

            with self.lock:
                self.memory_current_mb = memory_mb

                # Track peak
                if memory_mb > self.memory_peak_mb:
                    self.memory_peak_mb = memory_mb

                # Track initial (first measurement)
                if self.memory_initial_mb == 0.0:
                    self.memory_initial_mb = memory_mb

        except ImportError:
            # psutil not available - graceful degradation
            pass

    def get_memory_stats(self) -> Dict[str, Any]:
        """
        Get memory statistics

        Returns:
            Dict with current, peak, and growth metrics
        """
        if not self.enable_memory_tracking:
            return {'enabled': False}

        with self.lock:
            # Calculate growth percentage
            if self.memory_initial_mb > 0:
                growth_percent = ((self.memory_current_mb - self.memory_initial_mb) /
                                  self.memory_initial_mb) * 100.0
            else:
                growth_percent = 0.0

            try:
                import psutil
                return {
                    'current_mb': self.memory_current_mb,
                    'peak_mb': self.memory_peak_mb,
                    'growth_percent': growth_percent
                }
            except ImportError:
                return {
                    'current_mb': 0,
                    'peak_mb': 0,
                    'growth_percent': 0,
                    'unavailable': 'psutil not installed'
                }

    def record_request(self) -> None:
        """Record a request for throughput calculation"""
        with self.lock:
            self.total_requests += 1
            self.request_timestamps.append(time.time())
            # VUL-007 fix: Limit request_timestamps list size
            if len(self.request_timestamps) > self.max_request_timestamps:
                self.request_timestamps = self.request_timestamps[-self.max_request_timestamps:]

    def get_throughput_stats(self, window_seconds: int = 60) -> Dict[str, Any]:
        """
        Get throughput statistics

        Args:
            window_seconds: Time window for calculating requests/sec

        Returns:
            Dict with total requests and requests per second
        """
        with self.lock:
            current_time = time.time()

            # Filter timestamps within window
            recent_timestamps = [
                ts for ts in self.request_timestamps
                if current_time - ts <= window_seconds
            ]

            # Calculate requests per second
            if recent_timestamps:
                time_span = current_time - min(recent_timestamps)
                requests_per_second = len(recent_timestamps) / time_span if time_span > 0 else 0
            else:
                requests_per_second = 0.0

            return {
                'total_requests': self.total_requests,
                'requests_per_second': requests_per_second
            }

    def export_metrics_json(self) -> Dict[str, Any]:
        """
        Export all metrics in JSON format

        Returns:
            Dict with all metrics
        """
        cache_stats = self.get_cache_stats()
        latency_stats = self.get_latency_stats()
        memory_stats = self.get_memory_stats()
        throughput_stats = self.get_throughput_stats()

        uptime_seconds = time.time() - self.start_time

        return {
            'timestamp': time.time(),
            'uptime_seconds': uptime_seconds,
            'cache': cache_stats,
            'latency': latency_stats,
            'memory': memory_stats,
            'throughput': throughput_stats
        }

    def export_metrics_prometheus(self) -> str:
        """
        Export metrics in Prometheus format

        Returns:
            Prometheus-formatted metrics string
        """
        cache_stats = self.get_cache_stats()
        latency_stats = self.get_latency_stats()
        memory_stats = self.get_memory_stats()
        throughput_stats = self.get_throughput_stats()

        lines = [
            "# HELP cache_hit_total Total number of cache hits",
            "# TYPE cache_hit_total counter",
            f"cache_hit_total {cache_stats['cache_hits']}",
            "",
            "# HELP cache_miss_total Total number of cache misses",
            "# TYPE cache_miss_total counter",
            f"cache_miss_total {cache_stats['cache_misses']}",
            "",
            "# HELP cache_hit_rate Cache hit rate (0.0-1.0)",
            "# TYPE cache_hit_rate gauge",
            f"cache_hit_rate {cache_stats['hit_rate']:.4f}",
            "",
            "# HELP request_latency_p50 P50 latency in milliseconds",
            "# TYPE request_latency_p50 gauge",
            f"request_latency_p50 {latency_stats.get('p50', 0)}",
            "",
            "# HELP request_latency_p95 P95 latency in milliseconds",
            "# TYPE request_latency_p95 gauge",
            f"request_latency_p95 {latency_stats.get('p95', 0)}",
            "",
            "# HELP request_latency_p99 P99 latency in milliseconds",
            "# TYPE request_latency_p99 gauge",
            f"request_latency_p99 {latency_stats.get('p99', 0)}",
            "",
            "# HELP memory_current_mb Current memory usage in MB",
            "# TYPE memory_current_mb gauge",
            f"memory_current_mb {memory_stats.get('current_mb', 0)}",
            "",
            "# HELP requests_total Total number of requests",
            "# TYPE requests_total counter",
            f"requests_total {throughput_stats['total_requests']}",
            "",
            "# HELP requests_per_second Current requests per second",
            "# TYPE requests_per_second gauge",
            f"requests_per_second {throughput_stats['requests_per_second']:.2f}",
        ]

        return "\n".join(lines)

    def reset_cache_stats(self) -> None:
        """Reset cache statistics"""
        with self.lock:
            self.cache_hits = 0
            self.cache_misses = 0

    def reset_latency_stats(self) -> None:
        """Reset latency statistics"""
        with self.lock:
            self.latencies = []

    def reset_all_metrics(self) -> None:
        """Reset all metrics"""
        with self.lock:
            self.cache_hits = 0
            self.cache_misses = 0
            self.latencies = []
            self.total_requests = 0
            self.request_timestamps = []
            self.memory_current_mb = 0.0
            self.memory_peak_mb = 0.0
            self.memory_initial_mb = 0.0
