#!/usr/bin/env python3
"""
Unit Tests: MetricsCollector - Performance Metrics

Tests for the metrics collector module that tracks cache hit/miss rates,
latency percentiles, memory usage, and throughput.

Expected to FAIL until MetricsCollector implementation is complete (TDD Red Phase)
"""

import unittest
import sys
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from typing import Optional, Dict, Any, List

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# This import will fail until implementation is complete
try:
    from lib.metrics_collector import MetricsCollector, MetricType
    
    # Check if psutil is available for tests
    HAS_PSUTIL = False
    try:
        import psutil as _test_psutil
        HAS_PSUTIL = True
    except ImportError:
        pass
except ImportError:
    class MetricsCollector:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("MetricsCollector not yet implemented")

    class MetricType:
        CACHE_HIT = "cache_hit"
        CACHE_MISS = "cache_miss"
        LATENCY = "latency"
        MEMORY = "memory"
        THROUGHPUT = "throughput"


class TestMetricsCollectorBasics(unittest.TestCase):
    """Test basic metrics collector functionality"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector(
            enable_memory_tracking=True,
            enable_latency_tracking=True
        )

    def test_init_creates_metrics_collector(self):
        """Test that initialization creates a valid metrics collector"""
        self.assertIsNotNone(self.collector)

    def test_record_cache_hit_increments_counter(self):
        """Test that cache hits are recorded"""
        self.collector.record_cache_hit()
        self.collector.record_cache_hit()
        self.collector.record_cache_hit()

        stats = self.collector.get_cache_stats()
        self.assertEqual(stats['cache_hits'], 3)

    def test_record_cache_miss_increments_counter(self):
        """Test that cache misses are recorded"""
        self.collector.record_cache_miss()
        self.collector.record_cache_miss()

        stats = self.collector.get_cache_stats()
        self.assertEqual(stats['cache_misses'], 2)

    def test_calculate_cache_hit_rate(self):
        """Test cache hit rate calculation"""
        # 7 hits, 3 misses = 70% hit rate
        for _ in range(7):
            self.collector.record_cache_hit()
        for _ in range(3):
            self.collector.record_cache_miss()

        stats = self.collector.get_cache_stats()
        self.assertAlmostEqual(stats['hit_rate'], 0.70, places=2)

    def test_cache_hit_rate_zero_requests(self):
        """Test hit rate when no requests recorded"""
        stats = self.collector.get_cache_stats()
        self.assertEqual(stats['hit_rate'], 0.0)


class TestMetricsCollectorLatency(unittest.TestCase):
    """Test latency tracking and percentiles"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector(enable_latency_tracking=True)

    def test_record_latency_stores_value(self):
        """Test that latency values are recorded"""
        self.collector.record_latency(100.5)  # 100.5ms
        self.collector.record_latency(250.0)
        self.collector.record_latency(50.0)

        stats = self.collector.get_latency_stats()
        # VUL-010 fix: latencies not exposed, check count instead
        self.assertEqual(stats['count'], 3)

    def test_calculate_latency_percentiles(self):
        """Test P50, P95, P99 percentile calculation"""
        # Add 100 latency samples
        latencies = list(range(1, 101))  # 1ms to 100ms
        for lat in latencies:
            self.collector.record_latency(lat)

        stats = self.collector.get_latency_stats()

        # P50 should be around 50ms
        self.assertAlmostEqual(stats['p50'], 50.0, delta=5.0)
        # P95 should be around 95ms
        self.assertAlmostEqual(stats['p95'], 95.0, delta=5.0)
        # P99 should be around 99ms
        self.assertAlmostEqual(stats['p99'], 99.0, delta=5.0)

    def test_latency_percentiles_few_samples(self):
        """Test percentiles with < 10 samples"""
        self.collector.record_latency(10.0)
        self.collector.record_latency(20.0)
        self.collector.record_latency(30.0)

        stats = self.collector.get_latency_stats()

        # Should still calculate percentiles, not crash
        self.assertIn('p50', stats)
        self.assertIn('p95', stats)
        self.assertIn('p99', stats)

    def test_latency_tracking_disabled(self):
        """Test that latency tracking can be disabled"""
        collector = MetricsCollector(enable_latency_tracking=False)

        collector.record_latency(100.0)

        stats = collector.get_latency_stats()
        # Should return empty stats when disabled
        self.assertEqual(stats.get('enabled'), False)


@unittest.skipUnless(HAS_PSUTIL, "psutil not available")
class TestMetricsCollectorMemory(unittest.TestCase):
    """Test memory usage tracking"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector(enable_memory_tracking=True)

    @patch('psutil.Process')
    def test_record_memory_usage_current(self, mock_process):
        """Test that current memory usage is recorded"""
        # Mock process with 500MB memory usage
        mock_proc = Mock()
        mock_proc.memory_info.return_value = Mock(rss=500 * 1024 * 1024)
        mock_process.return_value = mock_proc

        self.collector.record_memory_usage()

        stats = self.collector.get_memory_stats()
        self.assertAlmostEqual(stats['current_mb'], 500.0, delta=1.0)

    @patch('psutil.Process')
    def test_track_memory_peak(self, mock_process):
        """Test that peak memory usage is tracked"""
        mock_proc = Mock()
        mock_process.return_value = mock_proc

        # Simulate increasing memory usage
        mock_proc.memory_info.return_value = Mock(rss=100 * 1024 * 1024)
        self.collector.record_memory_usage()

        mock_proc.memory_info.return_value = Mock(rss=500 * 1024 * 1024)
        self.collector.record_memory_usage()

        mock_proc.memory_info.return_value = Mock(rss=300 * 1024 * 1024)
        self.collector.record_memory_usage()

        stats = self.collector.get_memory_stats()
        # Peak should be 500MB
        self.assertAlmostEqual(stats['peak_mb'], 500.0, delta=1.0)

    @patch('psutil.Process')
    def test_calculate_memory_growth(self, mock_process):
        """Test memory growth calculation"""
        mock_proc = Mock()
        mock_process.return_value = mock_proc

        # Initial memory: 100MB
        mock_proc.memory_info.return_value = Mock(rss=100 * 1024 * 1024)
        self.collector.record_memory_usage()

        # Wait and record again: 120MB (20% growth)
        time.sleep(0.1)
        mock_proc.memory_info.return_value = Mock(rss=120 * 1024 * 1024)
        self.collector.record_memory_usage()

        stats = self.collector.get_memory_stats()
        # Should detect 20% growth
        self.assertAlmostEqual(stats['growth_percent'], 20.0, delta=1.0)

    def test_memory_tracking_disabled(self):
        """Test that memory tracking can be disabled"""
        collector = MetricsCollector(enable_memory_tracking=False)

        collector.record_memory_usage()

        stats = collector.get_memory_stats()
        self.assertEqual(stats.get('enabled'), False)


class TestMetricsCollectorThroughput(unittest.TestCase):
    """Test throughput tracking"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector()

    def test_record_request_increments_counter(self):
        """Test that requests are counted"""
        self.collector.record_request()
        self.collector.record_request()
        self.collector.record_request()

        stats = self.collector.get_throughput_stats()
        self.assertEqual(stats['total_requests'], 3)

    def test_calculate_requests_per_second(self):
        """Test requests per second calculation"""
        # Record requests over time
        for _ in range(10):
            self.collector.record_request()

        time.sleep(1.0)  # Wait 1 second

        for _ in range(10):
            self.collector.record_request()

        stats = self.collector.get_throughput_stats()
        # Should be approximately 10 req/s (20 total over 2 seconds)
        self.assertGreater(stats['requests_per_second'], 5.0)

    def test_calculate_throughput_windowed(self):
        """Test throughput calculation over sliding window"""
        # Record 50 requests in 5 seconds
        for i in range(50):
            self.collector.record_request()
            time.sleep(0.1)

        stats = self.collector.get_throughput_stats(window_seconds=5)
        # Should be ~10 req/s
        self.assertGreater(stats['requests_per_second'], 8.0)
        self.assertLess(stats['requests_per_second'], 12.0)


class TestMetricsCollectorExport(unittest.TestCase):
    """Test metrics export for /v1/metrics endpoint"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector(
            enable_memory_tracking=True,
            enable_latency_tracking=True
        )

    def test_export_metrics_json_format(self):
        """Test that metrics can be exported as JSON"""
        # Record some metrics
        self.collector.record_cache_hit()
        self.collector.record_cache_miss()
        self.collector.record_latency(100.0)
        self.collector.record_request()

        metrics_json = self.collector.export_metrics_json()

        self.assertIn('cache', metrics_json)
        self.assertIn('latency', metrics_json)
        self.assertIn('memory', metrics_json)
        self.assertIn('throughput', metrics_json)

    def test_export_metrics_prometheus_format(self):
        """Test that metrics can be exported in Prometheus format"""
        self.collector.record_cache_hit()
        self.collector.record_cache_miss()

        prometheus_output = self.collector.export_metrics_prometheus()

        # Should contain Prometheus-style metrics
        self.assertIn('# TYPE', prometheus_output)
        self.assertIn('cache_hit_total', prometheus_output)
        self.assertIn('cache_miss_total', prometheus_output)

    def test_export_metrics_includes_timestamp(self):
        """Test that exported metrics include timestamp"""
        metrics = self.collector.export_metrics_json()

        self.assertIn('timestamp', metrics)
        self.assertIsInstance(metrics['timestamp'], (int, float))

    def test_export_metrics_includes_uptime(self):
        """Test that exported metrics include server uptime"""
        time.sleep(0.5)  # Let some time pass

        metrics = self.collector.export_metrics_json()

        self.assertIn('uptime_seconds', metrics)
        self.assertGreater(metrics['uptime_seconds'], 0)


class TestMetricsCollectorReset(unittest.TestCase):
    """Test metrics reset functionality"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector()

    def test_reset_cache_stats(self):
        """Test that cache stats can be reset"""
        self.collector.record_cache_hit()
        self.collector.record_cache_hit()
        self.collector.record_cache_miss()

        self.collector.reset_cache_stats()

        stats = self.collector.get_cache_stats()
        self.assertEqual(stats['cache_hits'], 0)
        self.assertEqual(stats['cache_misses'], 0)

    def test_reset_latency_stats(self):
        """Test that latency stats can be reset"""
        self.collector.record_latency(100.0)
        self.collector.record_latency(200.0)

        self.collector.reset_latency_stats()

        stats = self.collector.get_latency_stats()
        self.assertEqual(len(stats.get('latencies', [])), 0)

    def test_reset_all_metrics(self):
        """Test that all metrics can be reset at once"""
        self.collector.record_cache_hit()
        self.collector.record_latency(100.0)
        self.collector.record_request()

        self.collector.reset_all_metrics()

        cache_stats = self.collector.get_cache_stats()
        latency_stats = self.collector.get_latency_stats()
        throughput_stats = self.collector.get_throughput_stats()

        self.assertEqual(cache_stats['cache_hits'], 0)
        self.assertEqual(len(latency_stats.get('latencies', [])), 0)
        self.assertEqual(throughput_stats['total_requests'], 0)


class TestMetricsCollectorThreadSafety(unittest.TestCase):
    """Test thread safety of metrics collector"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector()

    def test_concurrent_cache_hit_recording(self):
        """Test that concurrent cache hit recording is safe"""
        import threading

        def record_hits():
            for _ in range(100):
                self.collector.record_cache_hit()

        threads = [threading.Thread(target=record_hits) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        stats = self.collector.get_cache_stats()
        # Should have exactly 1000 hits (10 threads * 100 hits)
        self.assertEqual(stats['cache_hits'], 1000)

    def test_concurrent_latency_recording(self):
        """Test that concurrent latency recording is safe"""
        import threading

        def record_latencies():
            for i in range(50):
                self.collector.record_latency(float(i))

        threads = [threading.Thread(target=record_latencies) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        stats = self.collector.get_latency_stats()
        # Should have exactly 250 latency samples (5 threads * 50 samples)
        # VUL-010 fix: latencies not exposed, check count
        self.assertEqual(stats['count'], 250)


class TestMetricsCollectorEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions"""

    def setUp(self):
        """Set up test fixtures"""
        self.collector = MetricsCollector()

    def test_record_negative_latency(self):
        """Test that negative latency values are rejected"""
        with self.assertRaises(ValueError):
            self.collector.record_latency(-10.0)

    def test_record_zero_latency(self):
        """Test that zero latency is valid"""
        self.collector.record_latency(0.0)

        stats = self.collector.get_latency_stats()
        # VUL-010 fix: latencies not exposed, just check count
        self.assertGreater(stats['count'], 0)

    def test_record_extremely_high_latency(self):
        """Test that very high latency values are handled"""
        # 1 hour latency (should be logged as warning but accepted)
        self.collector.record_latency(3600000.0)

        stats = self.collector.get_latency_stats()
        # VUL-010 fix: latencies not exposed, just check p99
        self.assertGreater(stats['p99'], 0)

    def test_export_metrics_with_no_data(self):
        """Test exporting metrics when no data recorded"""
        metrics = self.collector.export_metrics_json()

        # Should return valid structure with zero values
        self.assertEqual(metrics['cache']['hit_rate'], 0.0)
        self.assertEqual(metrics['throughput']['total_requests'], 0)

    @unittest.skipUnless(HAS_PSUTIL, "psutil must be available to test graceful degradation")
    @patch('psutil.Process', side_effect=ImportError("psutil not available"))
    def test_memory_tracking_without_psutil(self, mock_process):
        """Test graceful degradation when psutil unavailable"""
        collector = MetricsCollector(enable_memory_tracking=True)

        collector.record_memory_usage()

        stats = collector.get_memory_stats()
        # Should indicate unavailable
        self.assertIn('unavailable', str(stats).lower())


if __name__ == '__main__':
    unittest.main()
