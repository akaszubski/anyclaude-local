#!/usr/bin/env python3
"""
Unit Tests: MLX Worker Health Monitoring

Tests for health monitoring that tracks node status, metrics, and
enables cluster health checks.

Expected to FAIL until health.py implementation is complete (TDD Red Phase)

Test Coverage:
- Node health tracking (lastCheck, consecutiveFailures, avgResponseTime, errorRate)
- Request metrics (requestsInFlight, totalRequests, cacheHitRate, avgLatency)
- Recording request outcomes (success/failure)
- Latency tracking
- Error rate calculation
- Thread safety for concurrent requests
"""

import pytest
import sys
import time
import threading
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
from typing import Dict, Any

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / 'src'
sys.path.insert(0, str(src_path))

# This import will fail until implementation is complete
try:
    from mlx_worker.health import (
        get_node_health,
        get_metrics,
        record_request,
        increment_requests_in_flight,
        decrement_requests_in_flight,
        record_cache_hit,
        record_cache_miss,
        HealthMonitor,
        HealthError
    )
except ImportError:
    # Mock classes for TDD red phase
    class HealthError(Exception):
        """Base exception for health monitoring errors"""
        pass

    class HealthMonitor:
        def __init__(self):
            raise NotImplementedError("HealthMonitor not yet implemented")

    def get_node_health() -> Dict[str, Any]:
        raise NotImplementedError("get_node_health not yet implemented")

    def get_metrics() -> Dict[str, Any]:
        raise NotImplementedError("get_metrics not yet implemented")

    def record_request(success: bool, latency: float) -> None:
        raise NotImplementedError("record_request not yet implemented")

    def increment_requests_in_flight() -> None:
        raise NotImplementedError("increment_requests_in_flight not yet implemented")

    def decrement_requests_in_flight() -> None:
        raise NotImplementedError("decrement_requests_in_flight not yet implemented")

    def record_cache_hit() -> None:
        raise NotImplementedError("record_cache_hit not yet implemented")

    def record_cache_miss() -> None:
        raise NotImplementedError("record_cache_miss not yet implemented")


class TestNodeHealth:
    """Test node health tracking"""

    def test_get_node_health_initial_state(self):
        """Test get_node_health returns valid initial state"""
        health = get_node_health()

        # Should have required fields matching NodeHealth TypeScript interface
        assert 'lastCheck' in health
        assert 'consecutiveFailures' in health
        assert 'avgResponseTime' in health
        assert 'errorRate' in health

        # Initial state
        assert health['consecutiveFailures'] == 0
        assert health['avgResponseTime'] == 0.0
        assert health['errorRate'] == 0.0
        assert health['lastCheck'] >= 0

    def test_get_node_health_structure_matches_typescript(self):
        """Test health structure matches NodeHealth TypeScript interface"""
        health = get_node_health()

        # Must match: interface NodeHealth { lastCheck, consecutiveFailures, avgResponseTime, errorRate }
        assert isinstance(health['lastCheck'], (int, float))
        assert isinstance(health['consecutiveFailures'], int)
        assert isinstance(health['avgResponseTime'], (int, float))
        assert isinstance(health['errorRate'], (int, float))

    def test_get_node_health_updates_last_check(self):
        """Test get_node_health updates lastCheck timestamp"""
        before = time.time() * 1000  # milliseconds

        health = get_node_health()

        after = time.time() * 1000

        # lastCheck should be updated to current time
        assert before <= health['lastCheck'] <= after

    def test_get_node_health_returns_copy(self):
        """Test get_node_health returns a copy, not reference"""
        health1 = get_node_health()
        health2 = get_node_health()

        # Should be different objects
        assert health1 is not health2


class TestRequestRecording:
    """Test recording request outcomes"""

    def test_record_request_success(self):
        """Test recording successful request"""
        # Record a successful request
        record_request(success=True, latency=0.5)

        metrics = get_metrics()

        # Total requests should increase
        assert metrics['totalRequests'] == 1

        # Average latency should be set
        assert metrics['avgLatency'] == 0.5

        # Check health
        health = get_node_health()
        assert health['consecutiveFailures'] == 0
        assert health['errorRate'] == 0.0

    def test_record_request_failure(self):
        """Test recording failed request"""
        # Record a failed request
        record_request(success=False, latency=1.0)

        health = get_node_health()

        # Consecutive failures should increase
        assert health['consecutiveFailures'] == 1

        # Error rate should increase
        assert health['errorRate'] > 0.0

    def test_record_request_resets_consecutive_failures_on_success(self):
        """Test consecutive failures reset on successful request"""
        # Record failures
        record_request(success=False, latency=0.5)
        record_request(success=False, latency=0.5)

        health = get_node_health()
        assert health['consecutiveFailures'] == 2

        # Record success
        record_request(success=True, latency=0.5)

        health = get_node_health()
        # Should reset to 0
        assert health['consecutiveFailures'] == 0

    def test_record_request_tracks_multiple_requests(self):
        """Test recording multiple requests"""
        # Record several requests
        record_request(success=True, latency=0.5)
        record_request(success=True, latency=1.0)
        record_request(success=False, latency=2.0)

        metrics = get_metrics()

        # Total requests should be 3
        assert metrics['totalRequests'] == 3

    def test_record_request_calculates_avg_latency(self):
        """Test average latency calculation"""
        # Record requests with known latencies
        record_request(success=True, latency=1.0)
        record_request(success=True, latency=2.0)
        record_request(success=True, latency=3.0)

        health = get_node_health()

        # Average should be (1.0 + 2.0 + 3.0) / 3 = 2.0
        assert health['avgResponseTime'] == 2.0

    def test_record_request_calculates_avg_latency_with_failures(self):
        """Test average latency includes failed requests"""
        record_request(success=True, latency=1.0)
        record_request(success=False, latency=5.0)  # Failed but still counts for latency

        health = get_node_health()

        # Average should include both: (1.0 + 5.0) / 2 = 3.0
        assert health['avgResponseTime'] == 3.0

    def test_record_request_error_rate_calculation(self):
        """Test error rate calculation"""
        # 2 successes, 1 failure = 33.33% error rate
        record_request(success=True, latency=0.5)
        record_request(success=True, latency=0.5)
        record_request(success=False, latency=0.5)

        health = get_node_health()

        # Error rate should be 1/3 = 0.333...
        expected_rate = 1.0 / 3.0
        assert abs(health['errorRate'] - expected_rate) < 0.01

    def test_record_request_zero_latency_valid(self):
        """Test recording request with zero latency is valid"""
        # Should handle zero latency (cached response, etc.)
        record_request(success=True, latency=0.0)

        health = get_node_health()
        assert health['avgResponseTime'] == 0.0


class TestMetrics:
    """Test metrics tracking"""

    def test_get_metrics_initial_state(self):
        """Test get_metrics returns valid initial state"""
        metrics = get_metrics()

        # Should have required fields matching NodeMetrics TypeScript interface
        assert 'requestsInFlight' in metrics
        assert 'totalRequests' in metrics
        assert 'cacheHitRate' in metrics
        assert 'avgLatency' in metrics

        # Initial state
        assert metrics['requestsInFlight'] == 0
        assert metrics['totalRequests'] == 0
        assert metrics['cacheHitRate'] == 0.0
        assert metrics['avgLatency'] == 0.0

    def test_get_metrics_structure_matches_typescript(self):
        """Test metrics structure matches NodeMetrics TypeScript interface"""
        metrics = get_metrics()

        # Must match: interface NodeMetrics { requestsInFlight, totalRequests, cacheHitRate, avgLatency }
        assert isinstance(metrics['requestsInFlight'], int)
        assert isinstance(metrics['totalRequests'], int)
        assert isinstance(metrics['cacheHitRate'], (int, float))
        assert isinstance(metrics['avgLatency'], (int, float))

    def test_requests_in_flight_tracking(self):
        """Test requestsInFlight tracking"""
        # Increment
        increment_requests_in_flight()
        increment_requests_in_flight()

        metrics = get_metrics()
        assert metrics['requestsInFlight'] == 2

        # Decrement
        decrement_requests_in_flight()

        metrics = get_metrics()
        assert metrics['requestsInFlight'] == 1

    def test_requests_in_flight_cannot_go_negative(self):
        """Test requestsInFlight cannot go below zero"""
        # Try to decrement when at zero
        decrement_requests_in_flight()

        metrics = get_metrics()
        assert metrics['requestsInFlight'] >= 0

    def test_total_requests_tracking(self):
        """Test totalRequests increments correctly"""
        initial_metrics = get_metrics()
        initial_total = initial_metrics['totalRequests']

        # Record requests
        record_request(success=True, latency=0.5)
        record_request(success=False, latency=1.0)

        metrics = get_metrics()

        # Should have increased by 2
        assert metrics['totalRequests'] == initial_total + 2

    def test_cache_hit_rate_calculation(self):
        """Test cacheHitRate calculation"""
        # Record cache hits and misses
        record_cache_hit()
        record_cache_hit()
        record_cache_miss()

        metrics = get_metrics()

        # 2 hits out of 3 total = 66.67% hit rate
        expected_rate = 2.0 / 3.0
        assert abs(metrics['cacheHitRate'] - expected_rate) < 0.01

    def test_cache_hit_rate_all_hits(self):
        """Test cacheHitRate with all cache hits"""
        record_cache_hit()
        record_cache_hit()
        record_cache_hit()

        metrics = get_metrics()

        # 100% hit rate
        assert metrics['cacheHitRate'] == 1.0

    def test_cache_hit_rate_all_misses(self):
        """Test cacheHitRate with all cache misses"""
        record_cache_miss()
        record_cache_miss()

        metrics = get_metrics()

        # 0% hit rate
        assert metrics['cacheHitRate'] == 0.0

    def test_cache_hit_rate_no_requests(self):
        """Test cacheHitRate when no cache operations recorded"""
        metrics = get_metrics()

        # Should be 0.0 initially (or handle gracefully)
        assert metrics['cacheHitRate'] == 0.0

    def test_avg_latency_from_metrics(self):
        """Test avgLatency in metrics matches health avgResponseTime"""
        record_request(success=True, latency=1.5)
        record_request(success=True, latency=2.5)

        metrics = get_metrics()
        health = get_node_health()

        # Should be same value
        assert metrics['avgLatency'] == health['avgResponseTime']
        assert metrics['avgLatency'] == 2.0


class TestThreadSafety:
    """Test thread safety for concurrent operations"""

    def test_concurrent_record_request_safe(self):
        """Test concurrent record_request calls are thread-safe"""
        errors = []

        def record_thread():
            try:
                record_request(success=True, latency=0.5)
            except Exception as e:
                errors.append(e)

        # Create 50 threads recording requests
        threads = []
        for _ in range(50):
            t = threading.Thread(target=record_thread)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors
        assert len(errors) == 0

        # Total requests should be 50
        metrics = get_metrics()
        assert metrics['totalRequests'] == 50

    def test_concurrent_requests_in_flight_safe(self):
        """Test concurrent increment/decrement of requestsInFlight is thread-safe"""
        errors = []

        def increment_thread():
            try:
                increment_requests_in_flight()
                time.sleep(0.001)  # Hold in flight
                decrement_requests_in_flight()
            except Exception as e:
                errors.append(e)

        # Create 30 threads
        threads = []
        for _ in range(30):
            t = threading.Thread(target=increment_thread)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors
        assert len(errors) == 0

        # Should be back to 0 (all decremented)
        metrics = get_metrics()
        assert metrics['requestsInFlight'] == 0

    def test_concurrent_cache_tracking_safe(self):
        """Test concurrent cache hit/miss recording is thread-safe"""
        errors = []

        def cache_hit_thread():
            try:
                record_cache_hit()
            except Exception as e:
                errors.append(e)

        def cache_miss_thread():
            try:
                record_cache_miss()
            except Exception as e:
                errors.append(e)

        # Create mix of hit/miss threads
        threads = []
        for i in range(40):
            if i % 2 == 0:
                t = threading.Thread(target=cache_hit_thread)
            else:
                t = threading.Thread(target=cache_miss_thread)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors
        assert len(errors) == 0

        # Cache hit rate should be 50% (20 hits, 20 misses)
        metrics = get_metrics()
        assert abs(metrics['cacheHitRate'] - 0.5) < 0.01

    def test_concurrent_mixed_operations_safe(self):
        """Test mixed health operations are thread-safe"""
        errors = []

        def record_success_thread():
            try:
                record_request(success=True, latency=1.0)
            except Exception as e:
                errors.append(e)

        def record_failure_thread():
            try:
                record_request(success=False, latency=2.0)
            except Exception as e:
                errors.append(e)

        def get_health_thread():
            try:
                get_node_health()
            except Exception as e:
                errors.append(e)

        def get_metrics_thread():
            try:
                get_metrics()
            except Exception as e:
                errors.append(e)

        # Mix of operations
        threads = []
        for i in range(60):
            if i % 4 == 0:
                t = threading.Thread(target=record_success_thread)
            elif i % 4 == 1:
                t = threading.Thread(target=record_failure_thread)
            elif i % 4 == 2:
                t = threading.Thread(target=get_health_thread)
            else:
                t = threading.Thread(target=get_metrics_thread)

            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # No errors
        assert len(errors) == 0

        # State should be consistent
        health = get_node_health()
        metrics = get_metrics()

        assert health['consecutiveFailures'] >= 0
        assert metrics['totalRequests'] > 0


class TestHealthMonitor:
    """Test HealthMonitor class if using object-oriented approach"""

    def test_health_monitor_singleton(self):
        """Test HealthMonitor follows singleton pattern"""
        monitor1 = HealthMonitor()
        monitor2 = HealthMonitor()

        # Should be same instance
        assert monitor1 is monitor2

    def test_health_monitor_initialization(self):
        """Test HealthMonitor initializes with correct state"""
        monitor = HealthMonitor()

        health = monitor.get_health()
        assert health['consecutiveFailures'] == 0

        metrics = monitor.get_metrics()
        assert metrics['totalRequests'] == 0

    def test_health_monitor_record_success(self):
        """Test HealthMonitor record_success method"""
        monitor = HealthMonitor()

        monitor.record_success(latency=1.5)

        health = monitor.get_health()
        assert health['consecutiveFailures'] == 0

    def test_health_monitor_record_failure(self):
        """Test HealthMonitor record_failure method"""
        monitor = HealthMonitor()

        monitor.record_failure(latency=2.0)

        health = monitor.get_health()
        assert health['consecutiveFailures'] == 1


class TestEdgeCases:
    """Test edge cases and boundary conditions"""

    def test_very_high_latency(self):
        """Test handling very high latency values"""
        # Record request with very high latency
        record_request(success=True, latency=10000.0)

        health = get_node_health()

        # Should handle without overflow
        assert health['avgResponseTime'] == 10000.0

    def test_many_consecutive_failures(self):
        """Test handling many consecutive failures"""
        # Record 1000 failures
        for _ in range(1000):
            record_request(success=False, latency=0.5)

        health = get_node_health()

        # Should track correctly
        assert health['consecutiveFailures'] == 1000
        assert health['errorRate'] == 1.0

    def test_very_high_request_count(self):
        """Test handling very high request counts"""
        # Record many requests
        for _ in range(10000):
            record_request(success=True, latency=0.1)

        metrics = get_metrics()

        # Should handle large counts
        assert metrics['totalRequests'] == 10000

    def test_negative_latency_rejected(self):
        """Test negative latency is rejected or handled"""
        # Should raise error or clamp to 0
        with pytest.raises((ValueError, HealthError)):
            record_request(success=True, latency=-1.0)

    def test_rapid_increment_decrement_requests_in_flight(self):
        """Test rapid increment/decrement doesn't corrupt state"""
        # Rapidly increment and decrement
        for _ in range(100):
            increment_requests_in_flight()
            decrement_requests_in_flight()

        metrics = get_metrics()

        # Should be back to 0
        assert metrics['requestsInFlight'] == 0

    def test_overflow_protection_on_total_requests(self):
        """Test protection against integer overflow on totalRequests"""
        # This is more about design - Python ints don't overflow
        # But we should ensure the implementation handles large numbers

        monitor = HealthMonitor()
        monitor._total_requests = 2**31 - 1  # Large number

        # Should still work
        record_request(success=True, latency=0.5)

        metrics = get_metrics()
        assert metrics['totalRequests'] > 2**31 - 1


class TestHealthIntegration:
    """Test integration between health monitoring and other components"""

    @patch('mlx_worker.health.get_cache_state')
    def test_health_includes_cache_info(self, mock_get_cache_state):
        """Test health endpoint can include cache state"""
        mock_get_cache_state.return_value = {
            'tokens': 100,
            'systemPromptHash': 'abc123',
            'lastUpdated': 1234567890
        }

        # Health check might include cache state
        # This is tested in server integration tests

    def test_metrics_used_for_cluster_routing(self):
        """Test metrics provide necessary data for cluster routing decisions"""
        # Record some activity
        record_request(success=True, latency=0.5)
        increment_requests_in_flight()
        record_cache_hit()

        metrics = get_metrics()

        # Should have all fields needed for routing
        assert 'requestsInFlight' in metrics  # Load balancing
        assert 'avgLatency' in metrics  # Performance routing
        assert 'cacheHitRate' in metrics  # Cache-aware routing

        health = get_node_health()

        # Should have fields for health checks
        assert 'errorRate' in health  # Circuit breaker
        assert 'consecutiveFailures' in health  # Failure detection


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
