#!/usr/bin/env python3
"""
Unit Tests: Circuit Breaker Pattern

Tests for the circuit breaker that protects against cascading failures
in tool parser execution.

Expected to FAIL until CircuitBreaker implementation is complete (TDD Red Phase)

Test Coverage:
- State machine transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- Failure threshold triggering
- Recovery timeout behavior
- Success threshold for recovery
- Metrics tracking (calls, successes, failures, rejections)
- Thread safety for concurrent operations
- Performance overhead requirements
"""

import unittest
import sys
import time
import threading
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from typing import Optional, Dict, Any, List

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# This import will fail until implementation is complete
try:
    from lib.circuit_breaker import (
        CircuitBreaker,
        CircuitBreakerState,
        CircuitBreakerError,
        CircuitBreakerMetrics
    )
except ImportError:
    # Mock classes for TDD red phase
    class CircuitBreakerState:
        CLOSED = "CLOSED"
        OPEN = "OPEN"
        HALF_OPEN = "HALF_OPEN"

    class CircuitBreaker:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("CircuitBreaker not yet implemented")

    class CircuitBreakerError(Exception):
        pass

    class CircuitBreakerMetrics:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("CircuitBreakerMetrics not yet implemented")


class TestCircuitBreakerStates(unittest.TestCase):
    """Test circuit breaker state machine transitions"""

    def setUp(self):
        """Set up test fixtures"""
        self.breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,  # seconds
            success_threshold=2
        )

    def test_initial_state_is_closed(self):
        """Test circuit breaker starts in CLOSED state"""
        self.assertEqual(self.breaker.state, CircuitBreakerState.CLOSED)

    def test_closed_state_allows_requests(self):
        """Test CLOSED state allows requests through"""
        def successful_operation():
            return "success"

        result = self.breaker.call(successful_operation)
        self.assertEqual(result, "success")

    def test_transition_to_open_after_failure_threshold(self):
        """Test transitions to OPEN after failure_threshold consecutive failures"""
        def failing_operation():
            raise Exception("Operation failed")

        # Trigger 5 failures (threshold)
        for i in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Should now be OPEN
        self.assertEqual(self.breaker.state, CircuitBreakerState.OPEN)

    def test_open_state_rejects_requests(self):
        """Test OPEN state rejects requests immediately without calling function"""
        def failing_operation():
            raise Exception("Operation failed")

        # Trip the breaker
        for i in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Now in OPEN state - should reject without calling function
        call_count = 0

        def counted_operation():
            nonlocal call_count
            call_count += 1
            return "success"

        with self.assertRaises(CircuitBreakerError):
            self.breaker.call(counted_operation)

        # Function should NOT have been called
        self.assertEqual(call_count, 0)

    def test_transition_to_half_open_after_recovery_timeout(self):
        """Test transitions to HALF_OPEN after recovery_timeout expires"""
        def failing_operation():
            raise Exception("Operation failed")

        # Trip the breaker
        for i in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        self.assertEqual(self.breaker.state, CircuitBreakerState.OPEN)

        # Use short timeout for testing
        breaker_fast = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=1,  # 1 second
            success_threshold=2
        )

        # Trip it
        for i in range(3):
            with self.assertRaises(Exception):
                breaker_fast.call(failing_operation)

        # Wait for recovery timeout
        time.sleep(1.1)

        # Next call should transition to HALF_OPEN and attempt the call
        def successful_operation():
            return "success"

        # This should work because we're now in HALF_OPEN and call succeeds
        result = breaker_fast.call(successful_operation)

        # State should be HALF_OPEN (waiting for success_threshold)
        self.assertEqual(breaker_fast.state, CircuitBreakerState.HALF_OPEN)

    def test_half_open_allows_limited_requests(self):
        """Test HALF_OPEN state allows requests to test recovery"""
        breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=1,
            success_threshold=2
        )

        # Trip the breaker
        def failing_operation():
            raise Exception("fail")

        for i in range(3):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        # Wait for recovery
        time.sleep(1.1)

        # Should allow test requests
        def successful_operation():
            return "success"

        result = breaker.call(successful_operation)
        self.assertEqual(result, "success")

    def test_transition_to_closed_after_success_threshold(self):
        """Test transitions to CLOSED after success_threshold successes in HALF_OPEN"""
        breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=1,
            success_threshold=2
        )

        # Trip the breaker
        def failing_operation():
            raise Exception("fail")

        for i in range(3):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        # Wait for recovery
        time.sleep(1.1)

        # Succeed 2 times (success_threshold)
        def successful_operation():
            return "success"

        breaker.call(successful_operation)
        breaker.call(successful_operation)

        # Should be back to CLOSED
        self.assertEqual(breaker.state, CircuitBreakerState.CLOSED)

    def test_reopen_if_half_open_request_fails(self):
        """Test circuit reopens if request fails during HALF_OPEN"""
        breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=1,
            success_threshold=2
        )

        # Trip the breaker
        def failing_operation():
            raise Exception("fail")

        for i in range(3):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        self.assertEqual(breaker.state, CircuitBreakerState.OPEN)

        # Wait for recovery
        time.sleep(1.1)

        # Try a request that fails - should reopen circuit
        with self.assertRaises(Exception):
            breaker.call(failing_operation)

        # Should be back to OPEN
        self.assertEqual(breaker.state, CircuitBreakerState.OPEN)

    def test_failure_count_resets_on_success_in_closed(self):
        """Test failure count resets when a success occurs in CLOSED state"""
        def failing_operation():
            raise Exception("fail")

        def successful_operation():
            return "success"

        # Fail 3 times
        for i in range(3):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Succeed once - should reset counter
        self.breaker.call(successful_operation)

        # Now fail 5 more times - should trip on 5th failure (counter was reset)
        for i in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Circuit should now be OPEN after 5 consecutive failures
        self.assertEqual(self.breaker.state, CircuitBreakerState.OPEN)


class TestCircuitBreakerMetrics(unittest.TestCase):
    """Test metrics tracking"""

    def setUp(self):
        """Set up test fixtures"""
        self.breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
            success_threshold=2
        )

    def test_tracks_total_calls(self):
        """Test tracks total number of calls attempted"""
        def operation():
            return "success"

        for _ in range(10):
            self.breaker.call(operation)

        metrics = self.breaker.get_metrics()
        self.assertEqual(metrics.total_calls, 10)

    def test_tracks_successes(self):
        """Test tracks successful calls"""
        def successful_operation():
            return "success"

        for _ in range(7):
            self.breaker.call(successful_operation)

        metrics = self.breaker.get_metrics()
        self.assertEqual(metrics.successes, 7)

    def test_tracks_failures(self):
        """Test tracks failed calls"""
        def failing_operation():
            raise Exception("fail")

        for _ in range(3):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        metrics = self.breaker.get_metrics()
        self.assertEqual(metrics.failures, 3)

    def test_tracks_rejections(self):
        """Test tracks rejected calls when circuit is OPEN"""
        def failing_operation():
            raise Exception("fail")

        # Trip the breaker
        for _ in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Now rejections should be counted
        for _ in range(10):
            with self.assertRaises(CircuitBreakerError):
                self.breaker.call(failing_operation)

        metrics = self.breaker.get_metrics()
        self.assertEqual(metrics.rejections, 10)

    def test_tracks_state_changes(self):
        """Test tracks state transitions with timestamps"""
        breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=1,
            success_threshold=2
        )

        def failing_operation():
            raise Exception("fail")

        def successful_operation():
            return "success"

        # Trip the breaker (CLOSED → OPEN)
        for _ in range(3):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        # Wait for recovery (OPEN → HALF_OPEN)
        time.sleep(1.1)

        # Succeed to transition (HALF_OPEN → CLOSED)
        breaker.call(successful_operation)
        breaker.call(successful_operation)

        metrics = breaker.get_metrics()

        # Should have at least 3 state changes
        # CLOSED → OPEN, OPEN → HALF_OPEN, HALF_OPEN → CLOSED
        self.assertGreaterEqual(len(metrics.state_changes), 3)

        # Each state change should have timestamp
        for change in metrics.state_changes:
            self.assertIn('from_state', change)
            self.assertIn('to_state', change)
            self.assertIn('timestamp', change)

    def test_calculates_failure_rate(self):
        """Test calculates failure rate correctly"""
        def failing_operation():
            raise Exception("fail")

        def successful_operation():
            return "success"

        # 3 successes, 2 failures = 40% failure rate
        for _ in range(3):
            self.breaker.call(successful_operation)

        for _ in range(2):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        metrics = self.breaker.get_metrics()
        expected_rate = 2.0 / 5.0  # 0.4
        self.assertAlmostEqual(metrics.failure_rate, expected_rate, places=2)

    def test_calculates_rejection_rate(self):
        """Test calculates rejection rate correctly"""
        def failing_operation():
            raise Exception("fail")

        # Trip the breaker
        for _ in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Attempt 20 more calls (all rejected)
        for _ in range(20):
            with self.assertRaises(CircuitBreakerError):
                self.breaker.call(failing_operation)

        metrics = self.breaker.get_metrics()

        # 20 rejections out of 25 total = 80% rejection rate
        expected_rate = 20.0 / 25.0  # 0.8
        self.assertAlmostEqual(metrics.rejection_rate, expected_rate, places=2)


class TestCircuitBreakerPerformance(unittest.TestCase):
    """Test performance overhead requirements"""

    def setUp(self):
        """Set up test fixtures"""
        self.breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
            success_threshold=2
        )

    def test_closed_state_overhead_under_1ms(self):
        """Test overhead is <1ms per call in CLOSED state"""
        def fast_operation():
            return "success"

        iterations = 1000
        start = time.perf_counter()

        for _ in range(iterations):
            self.breaker.call(fast_operation)

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        # Most of the time is the operation itself; overhead should be minimal
        # For this test, we check that total time including overhead is reasonable
        self.assertLess(avg_time_ms, 1.0,
                       f"Average time {avg_time_ms:.3f}ms exceeds 1ms threshold")

    def test_open_state_rejection_under_0_5ms(self):
        """Test rejection overhead is <0.5ms per call in OPEN state"""
        def failing_operation():
            raise Exception("fail")

        # Trip the breaker
        for _ in range(5):
            with self.assertRaises(Exception):
                self.breaker.call(failing_operation)

        # Now measure rejection overhead
        iterations = 1000
        start = time.perf_counter()

        for _ in range(iterations):
            with self.assertRaises(CircuitBreakerError):
                self.breaker.call(failing_operation)

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        self.assertLess(avg_time_ms, 0.5,
                       f"Rejection time {avg_time_ms:.3f}ms exceeds 0.5ms threshold")

    def test_metrics_collection_overhead(self):
        """Test that metrics collection doesn't significantly impact performance"""
        def operation():
            return "success"

        iterations = 1000
        start = time.perf_counter()

        for _ in range(iterations):
            self.breaker.call(operation)
            # Get metrics every call to test overhead
            metrics = self.breaker.get_metrics()

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        # Should still be fast even with metrics collection
        self.assertLess(avg_time_ms, 2.0,
                       f"Time with metrics {avg_time_ms:.3f}ms exceeds 2ms threshold")


class TestCircuitBreakerThreadSafety(unittest.TestCase):
    """Test thread safety for concurrent operations"""

    def setUp(self):
        """Set up test fixtures"""
        self.breaker = CircuitBreaker(
            failure_threshold=10,
            recovery_timeout=60,
            success_threshold=2
        )

    def test_concurrent_calls_are_thread_safe(self):
        """Test concurrent calls don't corrupt state"""
        results = []
        errors = []

        def operation():
            time.sleep(0.001)  # Small delay to increase concurrency
            return "success"

        def concurrent_call():
            try:
                result = self.breaker.call(operation)
                results.append(result)
            except Exception as e:
                errors.append(e)

        # Create 50 threads
        threads = []
        for _ in range(50):
            t = threading.Thread(target=concurrent_call)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # All should succeed
        self.assertEqual(len(results), 50)
        self.assertEqual(len(errors), 0)

        # Metrics should be accurate
        metrics = self.breaker.get_metrics()
        self.assertEqual(metrics.total_calls, 50)
        self.assertEqual(metrics.successes, 50)

    def test_concurrent_failures_dont_corrupt_state(self):
        """Test concurrent failures correctly update state"""
        def failing_operation():
            raise Exception("fail")

        def concurrent_fail():
            try:
                self.breaker.call(failing_operation)
            except Exception:
                pass  # Expected

        # Create 20 threads that fail concurrently
        threads = []
        for _ in range(20):
            t = threading.Thread(target=concurrent_fail)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # Circuit should be OPEN (threshold is 10)
        self.assertEqual(self.breaker.state, CircuitBreakerState.OPEN)

        # After circuit opens at 10th failure, remaining 10 threads are rejected
        # So we expect: 10 failures (before circuit opened) + 10 rejections (after)
        metrics = self.breaker.get_metrics()
        self.assertEqual(metrics.failures, 10)
        self.assertEqual(metrics.rejections, 10)

    def test_state_transitions_are_thread_safe(self):
        """Test state transitions don't race under concurrency"""
        breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=1,
            success_threshold=2
        )

        def failing_operation():
            raise Exception("fail")

        # Trip the breaker from multiple threads
        threads = []
        for _ in range(10):
            t = threading.Thread(target=lambda: self._safe_call(breaker, failing_operation))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        # Should be OPEN
        self.assertEqual(breaker.state, CircuitBreakerState.OPEN)

        # Wait for recovery
        time.sleep(1.1)

        # Concurrent successful calls should transition to CLOSED
        def successful_operation():
            return "success"

        threads = []
        for _ in range(5):
            t = threading.Thread(target=lambda: self._safe_call(breaker, successful_operation))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        # Should be CLOSED or HALF_OPEN (depending on timing)
        self.assertIn(breaker.state, [CircuitBreakerState.CLOSED, CircuitBreakerState.HALF_OPEN])

    def _safe_call(self, breaker, operation):
        """Helper to safely call operation through breaker"""
        try:
            return breaker.call(operation)
        except Exception:
            pass


class TestCircuitBreakerConfiguration(unittest.TestCase):
    """Test configuration options"""

    def test_custom_failure_threshold(self):
        """Test custom failure threshold is respected"""
        breaker = CircuitBreaker(failure_threshold=3)

        def failing_operation():
            raise Exception("fail")

        # Should trip after 3 failures
        for _ in range(3):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        self.assertEqual(breaker.state, CircuitBreakerState.OPEN)

    def test_custom_recovery_timeout(self):
        """Test custom recovery timeout is respected"""
        breaker = CircuitBreaker(
            failure_threshold=2,
            recovery_timeout=2  # 2 seconds
        )

        def failing_operation():
            raise Exception("fail")

        # Trip the breaker
        for _ in range(2):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        # Wait less than timeout - should still be OPEN
        time.sleep(1)

        with self.assertRaises(CircuitBreakerError):
            breaker.call(failing_operation)

        # Wait for full timeout - should transition to HALF_OPEN
        time.sleep(1.5)

        # Next call should attempt (HALF_OPEN)
        def successful_operation():
            return "success"

        result = breaker.call(successful_operation)
        self.assertEqual(result, "success")

    def test_custom_success_threshold(self):
        """Test custom success threshold is respected"""
        breaker = CircuitBreaker(
            failure_threshold=2,
            recovery_timeout=1,
            success_threshold=3  # Need 3 successes to recover
        )

        def failing_operation():
            raise Exception("fail")

        def successful_operation():
            return "success"

        # Trip the breaker
        for _ in range(2):
            with self.assertRaises(Exception):
                breaker.call(failing_operation)

        # Wait for recovery
        time.sleep(1.1)

        # Succeed twice - should still be HALF_OPEN
        breaker.call(successful_operation)
        breaker.call(successful_operation)
        self.assertEqual(breaker.state, CircuitBreakerState.HALF_OPEN)

        # Third success should transition to CLOSED
        breaker.call(successful_operation)
        self.assertEqual(breaker.state, CircuitBreakerState.CLOSED)


if __name__ == '__main__':
    unittest.main()
