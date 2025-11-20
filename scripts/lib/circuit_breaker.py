#!/usr/bin/env python3
"""
Circuit Breaker Pattern

Implements circuit breaker pattern to protect against cascading failures.
Provides three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery).

Classes:
    - CircuitBreakerState: Enum for circuit states
    - CircuitBreakerError: Exception when circuit is open
    - CircuitBreakerMetrics: Metrics data class
    - CircuitBreaker: Main circuit breaker implementation
"""

import time
import threading
from enum import Enum
from typing import Callable, Any, Optional, Dict, List
from dataclasses import dataclass, field


class CircuitBreakerState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerError(Exception):
    """Raised when circuit breaker rejects a request"""
    pass


@dataclass
class CircuitBreakerMetrics:
    """Circuit breaker metrics"""
    total_calls: int = 0
    successes: int = 0
    failures: int = 0
    rejections: int = 0
    state_changes: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def failure_rate(self) -> float:
        """Calculate failure rate"""
        if self.total_calls == 0:
            return 0.0
        return self.failures / self.total_calls

    @property
    def rejection_rate(self) -> float:
        """Calculate rejection rate"""
        if self.total_calls == 0:
            return 0.0
        return self.rejections / self.total_calls


class CircuitBreaker:
    """
    Circuit breaker for protecting against cascading failures

    State Machine:
    - CLOSED: Normal operation, track failures
    - OPEN: Reject all requests, check recovery timeout
    - HALF_OPEN: Allow test requests, close on success or reopen on failure

    Thread-safe for concurrent operations.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        success_threshold: int = 2,
        name: str = "circuit_breaker"
    ):
        """
        Initialize circuit breaker

        Args:
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Seconds to wait before attempting recovery
            success_threshold: Successes needed in HALF_OPEN to close circuit
            name: Circuit breaker identifier
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        self.name = name

        # State tracking
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time = None
        self._lock = threading.Lock()

        # Metrics
        self._metrics = CircuitBreakerMetrics()

    @property
    def state(self) -> CircuitBreakerState:
        """Get current state (thread-safe)"""
        with self._lock:
            return self._state

    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function with circuit breaker protection

        Args:
            func: Function to execute
            *args: Function arguments
            **kwargs: Function keyword arguments

        Returns:
            Function result

        Raises:
            CircuitBreakerError: If circuit is open
            Exception: If function raises exception
        """
        with self._lock:
            # Check if we should attempt recovery
            if self._state == CircuitBreakerState.OPEN:
                if self._should_attempt_reset():
                    self._transition_to(CircuitBreakerState.HALF_OPEN)
                else:
                    # Still in open state, reject request
                    self._metrics.total_calls += 1
                    self._metrics.rejections += 1
                    raise CircuitBreakerError(
                        f"Circuit breaker '{self.name}' is OPEN"
                    )

            # Record call attempt
            self._metrics.total_calls += 1

        # Execute function (outside lock to prevent blocking)
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def get_state(self) -> CircuitBreakerState:
        """Get current state"""
        return self.state

    def get_metrics(self) -> CircuitBreakerMetrics:
        """Get circuit breaker metrics"""
        with self._lock:
            # Return copy to prevent external modification
            return CircuitBreakerMetrics(
                total_calls=self._metrics.total_calls,
                successes=self._metrics.successes,
                failures=self._metrics.failures,
                rejections=self._metrics.rejections,
                state_changes=self._metrics.state_changes.copy()
            )

    def reset(self) -> None:
        """Manually reset circuit breaker to CLOSED state"""
        with self._lock:
            self._transition_to(CircuitBreakerState.CLOSED)
            self._failure_count = 0
            self._success_count = 0
            self._last_failure_time = None

    def _on_success(self) -> None:
        """Handle successful function call"""
        with self._lock:
            self._metrics.successes += 1

            if self._state == CircuitBreakerState.HALF_OPEN:
                # Increment success count in HALF_OPEN
                self._success_count += 1

                # Check if we've reached success threshold
                if self._success_count >= self.success_threshold:
                    self._transition_to(CircuitBreakerState.CLOSED)
                    self._failure_count = 0
                    self._success_count = 0

            elif self._state == CircuitBreakerState.CLOSED:
                # Reset failure count on success in CLOSED state
                self._failure_count = 0

    def _on_failure(self) -> None:
        """Handle failed function call"""
        with self._lock:
            self._metrics.failures += 1
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._state == CircuitBreakerState.CLOSED:
                # Check if we've reached failure threshold
                if self._failure_count >= self.failure_threshold:
                    self._transition_to(CircuitBreakerState.OPEN)

            elif self._state == CircuitBreakerState.HALF_OPEN:
                # Failure in HALF_OPEN reopens circuit
                self._transition_to(CircuitBreakerState.OPEN)
                self._success_count = 0

    def _should_attempt_reset(self) -> bool:
        """Check if recovery timeout has elapsed"""
        if self._last_failure_time is None:
            return False

        elapsed = time.time() - self._last_failure_time
        return elapsed >= self.recovery_timeout

    def _transition_to(self, new_state: CircuitBreakerState) -> None:
        """
        Transition to new state and record change

        Must be called within lock.
        """
        old_state = self._state
        self._state = new_state

        # Record state change (bounded to prevent memory leak)
        MAX_STATE_CHANGES = 1000
        self._metrics.state_changes.append({
            'from_state': old_state.value,
            'to_state': new_state.value,
            'timestamp': time.time()
        })

        # Keep only most recent changes
        if len(self._metrics.state_changes) > MAX_STATE_CHANGES:
            self._metrics.state_changes = self._metrics.state_changes[-MAX_STATE_CHANGES:]
