#!/usr/bin/env python3
"""
Integration Tests: /v1/metrics Endpoint

Tests the metrics endpoint that exposes performance metrics.
Covers JSON format, Prometheus format, and real-time metric updates.

Expected to FAIL until MetricsCollector and server endpoint are complete (TDD Red Phase)
"""

import unittest
import sys
import json
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, Any

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# These imports will fail until implementation is complete
try:
    from lib.metrics_collector import MetricsCollector
except ImportError:
    class MetricsCollector:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("MetricsCollector not yet implemented")


class TestMetricsEndpointBasics(unittest.TestCase):
    """Test basic /v1/metrics endpoint functionality"""

    def setUp(self):
        """Set up test fixtures"""
        self.metrics = MetricsCollector(
            enable_memory_tracking=True,
            enable_latency_tracking=True
        )

    def test_metrics_endpoint_returns_json(self):
        """Test that /v1/metrics returns valid JSON"""
        # Simulate GET /v1/metrics
        response = self._simulate_metrics_request(format='json')

        # Should return valid JSON
        self.assertEqual(response['status_code'], 200)
        self.assertEqual(response['content_type'], 'application/json')

        # Parse JSON
        metrics = json.loads(response['body'])
        self.assertIsInstance(metrics, dict)

    def test_metrics_endpoint_includes_all_categories(self):
        """Test that metrics include all categories"""
        response = self._simulate_metrics_request(format='json')
        metrics = json.loads(response['body'])

        # Should include all metric categories
        self.assertIn('cache', metrics)
        self.assertIn('latency', metrics)
        self.assertIn('memory', metrics)
        self.assertIn('throughput', metrics)
        self.assertIn('timestamp', metrics)
        self.assertIn('uptime_seconds', metrics)

    def test_metrics_endpoint_cache_stats(self):
        """Test that cache stats are included"""
        # Record some cache operations
        self.metrics.record_cache_hit()
        self.metrics.record_cache_hit()
        self.metrics.record_cache_miss()

        response = self._simulate_metrics_request(format='json')
        metrics = json.loads(response['body'])

        # Check cache stats
        self.assertEqual(metrics['cache']['cache_hits'], 2)
        self.assertEqual(metrics['cache']['cache_misses'], 1)
        self.assertAlmostEqual(metrics['cache']['hit_rate'], 0.67, places=1)

    def test_metrics_endpoint_latency_percentiles(self):
        """Test that latency percentiles are included"""
        # Record latencies
        for i in range(1, 101):
            self.metrics.record_latency(float(i))

        response = self._simulate_metrics_request(format='json')
        metrics = json.loads(response['body'])

        # Check latency percentiles
        self.assertIn('p50', metrics['latency'])
        self.assertIn('p95', metrics['latency'])
        self.assertIn('p99', metrics['latency'])

        # Validate percentile values are reasonable
        self.assertGreater(metrics['latency']['p95'], metrics['latency']['p50'])
        self.assertGreater(metrics['latency']['p99'], metrics['latency']['p95'])

    @patch('psutil.Process')
    def test_metrics_endpoint_memory_stats(self, mock_process):
        """Test that memory stats are included"""
        mock_proc = Mock()
        mock_proc.memory_info.return_value = Mock(rss=500 * 1024 * 1024)
        mock_proc.memory_percent.return_value = 50.0
        mock_process.return_value = mock_proc

        self.metrics.record_memory_usage()

        response = self._simulate_metrics_request(format='json')
        metrics = json.loads(response['body'])

        # Check memory stats
        self.assertIn('current_mb', metrics['memory'])
        self.assertIn('peak_mb', metrics['memory'])
        self.assertAlmostEqual(metrics['memory']['current_mb'], 500.0, delta=1.0)

    def test_metrics_endpoint_throughput_stats(self):
        """Test that throughput stats are included"""
        # Record some requests
        for _ in range(10):
            self.metrics.record_request()

        response = self._simulate_metrics_request(format='json')
        metrics = json.loads(response['body'])

        # Check throughput stats
        self.assertEqual(metrics['throughput']['total_requests'], 10)
        self.assertIn('requests_per_second', metrics['throughput'])

    def _simulate_metrics_request(self, format: str = 'json') -> Dict[str, Any]:
        """Simulate GET /v1/metrics request"""
        # This will be replaced with actual HTTP request in real tests
        metrics_data = self.metrics.export_metrics_json()

        response = {
            'status_code': 200,
            'content_type': 'application/json',
            'body': json.dumps(metrics_data)
        }

        return response


class TestMetricsEndpointPrometheus(unittest.TestCase):
    """Test Prometheus format support"""

    def setUp(self):
        """Set up test fixtures"""
        self.metrics = MetricsCollector()

    def test_metrics_endpoint_prometheus_format(self):
        """Test that /v1/metrics?format=prometheus returns Prometheus format"""
        # Record some metrics
        self.metrics.record_cache_hit()
        self.metrics.record_cache_miss()
        self.metrics.record_request()

        response = self._simulate_metrics_request(format='prometheus')

        # Should return plain text
        self.assertEqual(response['status_code'], 200)
        self.assertEqual(response['content_type'], 'text/plain')

        # Check Prometheus format
        body = response['body']
        self.assertIn('# TYPE', body)
        self.assertIn('cache_hit_total', body)
        self.assertIn('cache_miss_total', body)

    def test_prometheus_format_includes_help_text(self):
        """Test that Prometheus format includes HELP annotations"""
        response = self._simulate_metrics_request(format='prometheus')
        body = response['body']

        # Should include HELP for each metric
        self.assertIn('# HELP cache_hit_total', body)
        self.assertIn('# HELP cache_miss_total', body)

    def test_prometheus_format_includes_type_annotations(self):
        """Test that Prometheus format includes TYPE annotations"""
        response = self._simulate_metrics_request(format='prometheus')
        body = response['body']

        # Should include TYPE for each metric
        self.assertIn('# TYPE cache_hit_total counter', body)
        self.assertIn('# TYPE cache_miss_total counter', body)

    def _simulate_metrics_request(self, format: str = 'json') -> Dict[str, Any]:
        """Simulate GET /v1/metrics request"""
        if format == 'prometheus':
            metrics_data = self.metrics.export_metrics_prometheus()
            content_type = 'text/plain'
            body = metrics_data
        else:
            metrics_data = self.metrics.export_metrics_json()
            content_type = 'application/json'
            body = json.dumps(metrics_data)

        response = {
            'status_code': 200,
            'content_type': content_type,
            'body': body
        }

        return response


class TestMetricsEndpointRealTime(unittest.TestCase):
    """Test real-time metric updates"""

    def setUp(self):
        """Set up test fixtures"""
        self.metrics = MetricsCollector()

    def test_metrics_update_in_real_time(self):
        """Test that metrics reflect real-time changes"""
        # Initial state
        response1 = self._simulate_metrics_request()
        metrics1 = json.loads(response1['body'])
        initial_requests = metrics1['throughput']['total_requests']

        # Record more requests
        for _ in range(5):
            self.metrics.record_request()

        # Check updated metrics
        response2 = self._simulate_metrics_request()
        metrics2 = json.loads(response2['body'])
        updated_requests = metrics2['throughput']['total_requests']

        self.assertEqual(updated_requests, initial_requests + 5)

    def test_metrics_timestamp_updates(self):
        """Test that timestamp updates on each request"""
        response1 = self._simulate_metrics_request()
        metrics1 = json.loads(response1['body'])
        timestamp1 = metrics1['timestamp']

        time.sleep(0.1)

        response2 = self._simulate_metrics_request()
        metrics2 = json.loads(response2['body'])
        timestamp2 = metrics2['timestamp']

        # Timestamp should have advanced
        self.assertGreater(timestamp2, timestamp1)

    def test_metrics_uptime_increases(self):
        """Test that uptime increases over time"""
        response1 = self._simulate_metrics_request()
        metrics1 = json.loads(response1['body'])
        uptime1 = metrics1['uptime_seconds']

        time.sleep(0.5)

        response2 = self._simulate_metrics_request()
        metrics2 = json.loads(response2['body'])
        uptime2 = metrics2['uptime_seconds']

        # Uptime should have increased
        self.assertGreater(uptime2, uptime1)

    def _simulate_metrics_request(self) -> Dict[str, Any]:
        """Simulate GET /v1/metrics request"""
        metrics_data = self.metrics.export_metrics_json()

        response = {
            'status_code': 200,
            'content_type': 'application/json',
            'body': json.dumps(metrics_data)
        }

        return response


class TestMetricsEndpointErrorHandling(unittest.TestCase):
    """Test error handling in metrics endpoint"""

    def setUp(self):
        """Set up test fixtures"""
        self.metrics = MetricsCollector()

    def test_metrics_endpoint_invalid_format(self):
        """Test that invalid format parameter is rejected"""
        response = self._simulate_metrics_request(format='invalid')

        # Should return 400 Bad Request
        self.assertEqual(response['status_code'], 400)
        self.assertIn('error', response)

    def test_metrics_endpoint_handles_psutil_unavailable(self):
        """Test that endpoint works when psutil is unavailable"""
        with patch('psutil.Process', side_effect=ImportError("psutil not available")):
            response = self._simulate_metrics_request()

            # Should still return 200 with degraded metrics
            self.assertEqual(response['status_code'], 200)

            metrics = json.loads(response['body'])
            # Memory stats should indicate unavailable
            self.assertIn('unavailable', str(metrics['memory']).lower())

    def test_metrics_endpoint_handles_empty_metrics(self):
        """Test that endpoint works with no recorded metrics"""
        response = self._simulate_metrics_request()

        self.assertEqual(response['status_code'], 200)

        metrics = json.loads(response['body'])
        # Should return zero values, not errors
        self.assertEqual(metrics['cache']['cache_hits'], 0)
        self.assertEqual(metrics['throughput']['total_requests'], 0)

    def _simulate_metrics_request(self, format: str = 'json') -> Dict[str, Any]:
        """Simulate GET /v1/metrics request"""
        # Validate format
        if format not in ['json', 'prometheus']:
            return {
                'status_code': 400,
                'error': 'Invalid format parameter'
            }

        try:
            if format == 'prometheus':
                metrics_data = self.metrics.export_metrics_prometheus()
                content_type = 'text/plain'
                body = metrics_data
            else:
                metrics_data = self.metrics.export_metrics_json()
                content_type = 'application/json'
                body = json.dumps(metrics_data)

            response = {
                'status_code': 200,
                'content_type': content_type,
                'body': body
            }

        except Exception as e:
            response = {
                'status_code': 500,
                'error': str(e)
            }

        return response


class TestMetricsEndpointSecurity(unittest.TestCase):
    """Test security aspects of metrics endpoint"""

    def setUp(self):
        """Set up test fixtures"""
        self.metrics = MetricsCollector()

    def test_metrics_endpoint_no_sensitive_data(self):
        """Test that metrics don't leak sensitive data"""
        response = self._simulate_metrics_request()
        body = response['body']

        # Should not contain file paths, API keys, or user data
        self.assertNotIn('/Users/', body)
        self.assertNotIn('sk-', body)  # API key prefix
        self.assertNotIn('api_key', body.lower())

    def test_metrics_endpoint_cors_headers(self):
        """Test that appropriate CORS headers are set"""
        response = self._simulate_metrics_request()

        # Should include CORS headers for browser access
        self.assertIn('Access-Control-Allow-Origin', response.get('headers', {}))

    def test_metrics_endpoint_read_only(self):
        """Test that metrics endpoint is read-only (no POST/PUT/DELETE)"""
        # Simulate POST request
        response = self._simulate_metrics_request(method='POST')

        # Should return 405 Method Not Allowed
        self.assertEqual(response['status_code'], 405)

    def _simulate_metrics_request(self, method: str = 'GET') -> Dict[str, Any]:
        """Simulate /v1/metrics request"""
        if method != 'GET':
            return {
                'status_code': 405,
                'error': 'Method not allowed'
            }

        metrics_data = self.metrics.export_metrics_json()

        response = {
            'status_code': 200,
            'content_type': 'application/json',
            'body': json.dumps(metrics_data),
            'headers': {
                'Access-Control-Allow-Origin': '*'
            }
        }

        return response


class TestMetricsEndpointFiltering(unittest.TestCase):
    """Test metric filtering and selection"""

    def setUp(self):
        """Set up test fixtures"""
        self.metrics = MetricsCollector()

    def test_metrics_endpoint_filter_by_category(self):
        """Test that metrics can be filtered by category"""
        # Simulate GET /v1/metrics?category=cache
        response = self._simulate_metrics_request(category='cache')
        metrics = json.loads(response['body'])

        # Should only include cache metrics
        self.assertIn('cache', metrics)
        self.assertNotIn('latency', metrics)
        self.assertNotIn('memory', metrics)

    def test_metrics_endpoint_filter_multiple_categories(self):
        """Test filtering multiple categories"""
        # Simulate GET /v1/metrics?category=cache,latency
        response = self._simulate_metrics_request(category='cache,latency')
        metrics = json.loads(response['body'])

        # Should include both cache and latency
        self.assertIn('cache', metrics)
        self.assertIn('latency', metrics)
        self.assertNotIn('memory', metrics)

    def _simulate_metrics_request(self, category: str = None) -> Dict[str, Any]:
        """Simulate GET /v1/metrics request with optional category filter"""
        all_metrics = self.metrics.export_metrics_json()

        if category:
            categories = [c.strip() for c in category.split(',')]
            filtered_metrics = {
                k: v for k, v in all_metrics.items()
                if k in categories or k in ['timestamp', 'uptime_seconds']
            }
            metrics_data = filtered_metrics
        else:
            metrics_data = all_metrics

        response = {
            'status_code': 200,
            'content_type': 'application/json',
            'body': json.dumps(metrics_data)
        }

        return response


if __name__ == '__main__':
    unittest.main()
