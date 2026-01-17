/**
 * Unit tests for circuit-breaker.ts - Enhanced Monitoring Features
 *
 * Tests the circuit breaker monitoring enhancements (Issue #48):
 * 1. Latency-based circuit breaking - Opens circuit when avgLatency > threshold for 3 consecutive checks
 * 2. Metrics endpoint - GET /v1/circuit-breaker/metrics returns JSON with state, counters, latency
 * 3. Recovery scenarios - Backend down → circuit opens → backend recovers → circuit closes
 *
 * Test categories:
 * - Latency recording and averaging
 * - Latency threshold triggering circuit open
 * - getMetrics() output format and data accuracy
 * - Integration with existing state transitions
 * - Metrics endpoint HTTP handler
 * - Recovery scenarios with latency normalization
 * - Edge cases: empty latency array, single sample, threshold boundary
 *
 * Mock requirements:
 * - jest.useFakeTimers() for time-based testing
 * - Mock HTTP requests for endpoint testing
 *
 * Expected: ALL TESTS FAIL (TDD red phase - new methods don't exist yet)
 */

import {
  CircuitBreaker,
  CircuitState,
  type CircuitBreakerConfig,
} from "../../src/circuit-breaker";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to create a circuit breaker with custom config
 */
function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Helper to advance time and flush promises
 */
async function advanceTimersAndFlush(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Helper to record multiple successes with latency
 */
function recordSuccesses(
  breaker: CircuitBreaker,
  count: number,
  latencyMs: number
): void {
  for (let i = 0; i < count; i++) {
    breaker.recordSuccess();
    breaker.recordLatency(latencyMs);
  }
}

/**
 * Helper to record multiple failures
 */
function recordFailures(breaker: CircuitBreaker, count: number): void {
  for (let i = 0; i < count; i++) {
    breaker.recordFailure();
  }
}

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ============================================================================
// Test Suite: Latency Recording
// ============================================================================

describe("CircuitBreaker - Latency Recording", () => {
  describe("recordLatency", () => {
    test("should record single latency sample", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBe(100);
    });

    test("should calculate average of multiple latency samples", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      breaker.recordLatency(200);
      breaker.recordLatency(300);

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBe(200); // (100 + 200 + 300) / 3
    });

    test("should maintain rolling window of latency samples", () => {
      const breaker = createCircuitBreaker();

      // Record 100 samples (should keep only last N based on window size)
      for (let i = 1; i <= 100; i++) {
        breaker.recordLatency(i * 10);
      }

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBeGreaterThan(0);
      expect(metrics.latencySamples).toBeLessThanOrEqual(100);
    });

    test("should throw error on negative latency", () => {
      const breaker = createCircuitBreaker();

      expect(() => breaker.recordLatency(-100)).toThrow();
    });

    test("should throw error on zero latency", () => {
      const breaker = createCircuitBreaker();

      // Zero latency is technically invalid (all requests take some time)
      expect(() => breaker.recordLatency(0)).toThrow();
    });

    test("should handle very high latency values", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(999999);

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBe(999999);
    });

    test("should handle decimal latency values", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(123.456);
      breaker.recordLatency(234.567);

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBeCloseTo(179.0115, 2);
    });
  });

  describe("latency averaging behavior", () => {
    test("should update average as new samples added", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      expect(breaker.getMetrics().avgLatencyMs).toBe(100);

      breaker.recordLatency(200);
      expect(breaker.getMetrics().avgLatencyMs).toBe(150);

      breaker.recordLatency(300);
      expect(breaker.getMetrics().avgLatencyMs).toBe(200);
    });

    test("should handle sudden latency spikes", () => {
      const breaker = createCircuitBreaker();

      // Normal latency
      breaker.recordLatency(50);
      breaker.recordLatency(60);
      breaker.recordLatency(55);

      // Sudden spike
      breaker.recordLatency(5000);

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBeGreaterThan(1000); // Should reflect spike
    });

    test("should exclude old samples from rolling window", async () => {
      const breaker = createCircuitBreaker({
        latencyWindowMs: 1000, // 1 second window
      });

      breaker.recordLatency(100);
      breaker.recordLatency(200);

      // Advance time beyond window
      await advanceTimersAndFlush(2000);

      // Old samples should be excluded
      const metrics = breaker.getMetrics();
      expect(metrics.latencySamples).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
    });

    test("should keep samples within rolling window", async () => {
      const breaker = createCircuitBreaker({
        latencyWindowMs: 5000, // 5 second window
      });

      breaker.recordLatency(100);

      // Advance time but stay within window
      await advanceTimersAndFlush(2000);

      breaker.recordLatency(200);

      const metrics = breaker.getMetrics();
      expect(metrics.latencySamples).toBe(2);
      expect(metrics.avgLatencyMs).toBe(150);
    });
  });

  describe("integration with success/failure", () => {
    test("should record latency independently of success/failure state", () => {
      const breaker = createCircuitBreaker();

      breaker.recordSuccess();
      breaker.recordLatency(100);

      breaker.recordFailure();
      breaker.recordLatency(200);

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBe(150);
      expect(metrics.latencySamples).toBe(2);
    });

    test("should maintain latency history across state transitions", () => {
      const breaker = createCircuitBreaker({ failureThreshold: 2 });

      // CLOSED state
      breaker.recordLatency(100);

      // Transition to OPEN
      recordFailures(breaker, 2);

      // Latency should persist
      const metrics = breaker.getMetrics();
      expect(metrics.latencySamples).toBeGreaterThan(0);
    });

    test("should clear latency history on manual reset", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      breaker.recordLatency(200);
      breaker.recordLatency(300);

      breaker.reset();

      const metrics = breaker.getMetrics();
      expect(metrics.latencySamples).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
    });
  });
});

// ============================================================================
// Test Suite: Latency Threshold Circuit Breaking
// ============================================================================

describe("CircuitBreaker - Latency Threshold Triggering", () => {
  describe("latency-based circuit opening", () => {
    test("should open circuit when avgLatency exceeds threshold for 3 consecutive checks", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // First high latency
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Second high latency
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Third high latency - should open circuit
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should not open circuit if latency below threshold", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      breaker.recordLatency(500);
      breaker.recordLatency(600);
      breaker.recordLatency(700);

      breaker.checkLatencyThreshold();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should reset consecutive high latency count on normal latency", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Two high latencies
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      // Normal latency - should reset counter
      breaker.recordLatency(500);
      breaker.checkLatencyThreshold();

      // Need 3 more consecutive to trigger
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should use configurable consecutive check threshold", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 5, // Custom threshold
      });

      // 4 consecutive high latencies - not enough
      for (let i = 0; i < 4; i++) {
        breaker.recordLatency(1500);
        breaker.checkLatencyThreshold();
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // 5th consecutive - should trigger
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should disable latency threshold when set to 0", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 0, // Disabled
        latencyConsecutiveChecks: 3,
      });

      // High latencies should not trigger circuit
      for (let i = 0; i < 10; i++) {
        breaker.recordLatency(99999);
        breaker.checkLatencyThreshold();
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should work with automatic latency checking on recordLatency", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
        autoCheckLatency: true, // Auto-check on each record
      });

      // Circuit should open automatically without explicit checkLatencyThreshold calls
      breaker.recordLatency(1500);
      breaker.recordLatency(1500);
      breaker.recordLatency(1500);

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("latency threshold boundary conditions", () => {
    test("should open circuit when latency exactly equals threshold", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Exactly at threshold
      for (let i = 0; i < 3; i++) {
        breaker.recordLatency(1000);
        breaker.checkLatencyThreshold();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should not open circuit when latency just below threshold", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Just below threshold
      for (let i = 0; i < 3; i++) {
        breaker.recordLatency(999);
        breaker.checkLatencyThreshold();
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should handle mixed latencies around threshold", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      breaker.recordLatency(900); // Below
      breaker.recordLatency(1100); // Above
      breaker.recordLatency(1000); // Equal

      // Average is exactly at threshold
      breaker.checkLatencyThreshold();

      const metrics = breaker.getMetrics();
      expect(metrics.avgLatencyMs).toBe(1000);
    });
  });

  describe("latency threshold with state changes", () => {
    test("should trigger latency-based open even when failure count low", () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 10, // High failure threshold
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // No failures, but high latency
      for (let i = 0; i < 3; i++) {
        breaker.recordSuccess();
        breaker.recordLatency(1500);
        breaker.checkLatencyThreshold();
      }

      // Should open due to latency, not failures
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.getStats().failureCount).toBe(0);
    });

    test("should include latency trigger reason in state change event", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      let stateChangeReason: string | undefined;
      breaker.onStateChangeListener((state, reason) => {
        stateChangeReason = reason;
      });

      for (let i = 0; i < 3; i++) {
        breaker.recordLatency(1500);
        breaker.checkLatencyThreshold();
      }

      expect(stateChangeReason).toContain("latency");
      expect(stateChangeReason).toContain("threshold");
    });

    test("should reset latency counter when circuit manually reset", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Two consecutive high latencies
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      // Manual reset
      breaker.reset();

      // Need 3 new consecutive to trigger
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("latency threshold with HALF_OPEN state", () => {
    test("should close circuit if latency normalizes in HALF_OPEN", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        retryTimeout: 1000,
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Open circuit with failures
      recordFailures(breaker, 2);
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for HALF_OPEN
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record successes with normal latency
      breaker.recordSuccess();
      breaker.recordLatency(500);
      breaker.checkLatencyThreshold();

      breaker.recordSuccess();
      breaker.recordLatency(500);
      breaker.checkLatencyThreshold();

      // Should close circuit
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should reopen circuit if latency high in HALF_OPEN", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        retryTimeout: 1000,
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 2, // Lower threshold for faster testing
      });

      // Open circuit
      recordFailures(breaker, 2);

      // Wait for HALF_OPEN
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();

      // High latency during recovery
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      // Should reopen circuit due to latency
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });
});

// ============================================================================
// Test Suite: getMetrics() Method
// ============================================================================

describe("CircuitBreaker - getMetrics()", () => {
  describe("metrics output format", () => {
    test("should return complete metrics object", () => {
      const breaker = createCircuitBreaker();

      const metrics = breaker.getMetrics();

      expect(metrics).toHaveProperty("state");
      expect(metrics).toHaveProperty("failureCount");
      expect(metrics).toHaveProperty("successCount");
      expect(metrics).toHaveProperty("avgLatencyMs");
      expect(metrics).toHaveProperty("latencySamples");
      expect(metrics).toHaveProperty("minLatencyMs");
      expect(metrics).toHaveProperty("maxLatencyMs");
      expect(metrics).toHaveProperty("p50LatencyMs");
      expect(metrics).toHaveProperty("p95LatencyMs");
      expect(metrics).toHaveProperty("p99LatencyMs");
      expect(metrics).toHaveProperty("consecutiveHighLatency");
      expect(metrics).toHaveProperty("nextAttempt");
    });

    test("should include current circuit state", () => {
      const breaker = createCircuitBreaker();

      const metrics = breaker.getMetrics();

      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    test("should include failure and success counts", () => {
      const breaker = createCircuitBreaker();

      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordFailure();

      const metrics = breaker.getMetrics();

      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
    });

    test("should include latency statistics", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      breaker.recordLatency(200);
      breaker.recordLatency(300);

      const metrics = breaker.getMetrics();

      expect(metrics.avgLatencyMs).toBe(200);
      expect(metrics.latencySamples).toBe(3);
      expect(metrics.minLatencyMs).toBe(100);
      expect(metrics.maxLatencyMs).toBe(300);
    });

    test("should include percentile metrics", () => {
      const breaker = createCircuitBreaker();

      // Record varied latencies
      const latencies = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
      latencies.forEach((lat) => breaker.recordLatency(lat));

      const metrics = breaker.getMetrics();

      expect(metrics.p50LatencyMs).toBeGreaterThan(0);
      expect(metrics.p95LatencyMs).toBeGreaterThan(metrics.p50LatencyMs);
      expect(metrics.p99LatencyMs).toBeGreaterThan(metrics.p95LatencyMs);
    });

    test("should include consecutive high latency count", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
      });

      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(1500);
      breaker.checkLatencyThreshold();

      const metrics = breaker.getMetrics();

      expect(metrics.consecutiveHighLatency).toBe(2);
    });

    test("should include nextAttempt timestamp when circuit OPEN", () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1 });

      breaker.recordFailure();

      const metrics = breaker.getMetrics();

      expect(metrics.state).toBe(CircuitState.OPEN);
      expect(metrics.nextAttempt).not.toBeNull();
      expect(typeof metrics.nextAttempt).toBe("string");
      expect(new Date(metrics.nextAttempt!).getTime()).toBeGreaterThan(
        Date.now()
      );
    });

    test("should set nextAttempt to null when circuit CLOSED", () => {
      const breaker = createCircuitBreaker();

      const metrics = breaker.getMetrics();

      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.nextAttempt).toBeNull();
    });
  });

  describe("metrics data accuracy", () => {
    test("should reflect real-time state changes", () => {
      const breaker = createCircuitBreaker({ failureThreshold: 2 });

      expect(breaker.getMetrics().state).toBe(CircuitState.CLOSED);

      recordFailures(breaker, 2);

      expect(breaker.getMetrics().state).toBe(CircuitState.OPEN);
    });

    test("should update counters incrementally", () => {
      const breaker = createCircuitBreaker();

      expect(breaker.getMetrics().failureCount).toBe(0);

      breaker.recordFailure();
      expect(breaker.getMetrics().failureCount).toBe(1);

      breaker.recordFailure();
      expect(breaker.getMetrics().failureCount).toBe(2);
    });

    test("should reset counters on circuit reset", () => {
      const breaker = createCircuitBreaker();

      breaker.recordFailure();
      breaker.recordLatency(100);

      breaker.reset();

      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.latencySamples).toBe(0);
    });

    test("should calculate percentiles correctly with small sample size", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      breaker.recordLatency(200);

      const metrics = breaker.getMetrics();

      // With only 2 samples, percentiles should still be calculated
      expect(metrics.p50LatencyMs).toBeGreaterThan(0);
      expect(metrics.p95LatencyMs).toBeGreaterThan(0);
    });

    test("should handle large number of latency samples", () => {
      const breaker = createCircuitBreaker();

      // Record 1000 samples
      for (let i = 1; i <= 1000; i++) {
        breaker.recordLatency(i);
      }

      const metrics = breaker.getMetrics();

      expect(metrics.latencySamples).toBeGreaterThan(0);
      expect(metrics.avgLatencyMs).toBeCloseTo(500.5, 0); // Average of 1-1000 is 500.5
      expect(metrics.p50LatencyMs).toBeCloseTo(500.5, 0);
      expect(metrics.p95LatencyMs).toBeCloseTo(950, 0); // Approximate due to interpolation
    });
  });

  describe("metrics edge cases", () => {
    test("should return zeros when no latency samples recorded", () => {
      const breaker = createCircuitBreaker();

      const metrics = breaker.getMetrics();

      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.latencySamples).toBe(0);
      expect(metrics.minLatencyMs).toBe(0);
      expect(metrics.maxLatencyMs).toBe(0);
      expect(metrics.p50LatencyMs).toBe(0);
      expect(metrics.p95LatencyMs).toBe(0);
      expect(metrics.p99LatencyMs).toBe(0);
    });

    test("should handle single latency sample", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(150);

      const metrics = breaker.getMetrics();

      expect(metrics.avgLatencyMs).toBe(150);
      expect(metrics.minLatencyMs).toBe(150);
      expect(metrics.maxLatencyMs).toBe(150);
      expect(metrics.p50LatencyMs).toBe(150);
      expect(metrics.p95LatencyMs).toBe(150);
      expect(metrics.p99LatencyMs).toBe(150);
    });

    test("should handle all samples outside time window", async () => {
      const breaker = createCircuitBreaker({
        latencyWindowMs: 1000,
      });

      breaker.recordLatency(100);
      breaker.recordLatency(200);

      // Wait for samples to expire
      await advanceTimersAndFlush(2000);

      const metrics = breaker.getMetrics();

      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.latencySamples).toBe(0);
    });

    test("should return consistent snapshot at point in time", () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      breaker.recordFailure();

      const metrics1 = breaker.getMetrics();
      const metrics2 = breaker.getMetrics();

      // Multiple calls should return same values
      expect(metrics1).toEqual(metrics2);
    });
  });
});

// ============================================================================
// Test Suite: Metrics Endpoint Integration
// ============================================================================

describe("CircuitBreaker - Metrics Endpoint", () => {
  describe("HTTP endpoint handler", () => {
    test("should expose GET /v1/circuit-breaker/metrics endpoint", async () => {
      const breaker = createCircuitBreaker();

      // Mock HTTP server request
      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      // Handler should be exposed via static method
      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
      expect(res.end).toHaveBeenCalled();
    });

    test("should return JSON metrics in response body", async () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);
      breaker.recordLatency(200);

      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      const responseBody = res.end.mock.calls[0][0];
      const metrics = JSON.parse(responseBody);

      expect(metrics).toHaveProperty("state");
      expect(metrics).toHaveProperty("avgLatencyMs");
      expect(metrics.avgLatencyMs).toBe(150);
    });

    test("should return 404 for wrong HTTP method", async () => {
      const breaker = createCircuitBreaker();

      const req = {
        method: "POST", // Wrong method
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    });

    test("should return 404 for wrong URL path", async () => {
      const breaker = createCircuitBreaker();

      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/wrong-path", // Wrong path
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    });

    test("should handle concurrent requests safely", async () => {
      const breaker = createCircuitBreaker();

      const requests = Array.from({ length: 10 }, () => ({
        req: {
          method: "GET",
          url: "/v1/circuit-breaker/metrics",
        },
        res: {
          writeHead: jest.fn(),
          end: jest.fn(),
        },
      }));

      // Fire all requests concurrently
      await Promise.all(
        requests.map(({ req, res }) =>
          CircuitBreaker.handleMetricsRequest(breaker, req, res)
        )
      );

      // All should succeed
      requests.forEach(({ res }) => {
        expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
        expect(res.end).toHaveBeenCalled();
      });
    });

    test("should NOT include CORS headers (security: internal endpoint only)", async () => {
      const breaker = createCircuitBreaker();

      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      const headers = res.writeHead.mock.calls[0][1];
      // Security: No CORS headers - this is an internal monitoring endpoint
      expect(headers).not.toHaveProperty("Access-Control-Allow-Origin");
      expect(headers).toHaveProperty("Content-Type", "application/json");
    });
  });

  describe("endpoint response format", () => {
    test("should match OpenAPI schema structure", async () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(100);

      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      const responseBody = res.end.mock.calls[0][0];
      const metrics = JSON.parse(responseBody);

      // Validate schema (TypeScript types should match)
      expect(typeof metrics.state).toBe("string");
      expect(typeof metrics.failureCount).toBe("number");
      expect(typeof metrics.successCount).toBe("number");
      expect(typeof metrics.avgLatencyMs).toBe("number");
      expect(typeof metrics.latencySamples).toBe("number");
    });

    test("should include timestamp in response", async () => {
      const breaker = createCircuitBreaker();

      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      const responseBody = res.end.mock.calls[0][0];
      const metrics = JSON.parse(responseBody);

      expect(metrics).toHaveProperty("timestamp");
      expect(typeof metrics.timestamp).toBe("string");
      expect(new Date(metrics.timestamp).getTime()).toBeGreaterThan(0);
    });

    test("should format numbers with appropriate precision", async () => {
      const breaker = createCircuitBreaker();

      breaker.recordLatency(123.456789);
      breaker.recordLatency(234.56789);

      const req = {
        method: "GET",
        url: "/v1/circuit-breaker/metrics",
      };

      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await CircuitBreaker.handleMetricsRequest(breaker, req, res);

      const responseBody = res.end.mock.calls[0][0];
      const metrics = JSON.parse(responseBody);

      // Should round to reasonable precision (2 decimal places)
      expect(metrics.avgLatencyMs).toBeCloseTo(179.01, 2);
    });
  });
});

// ============================================================================
// Test Suite: Recovery Scenarios
// ============================================================================

describe("CircuitBreaker - Recovery Scenarios", () => {
  describe("backend down → circuit opens", () => {
    test("should open circuit after consecutive failures", () => {
      const breaker = createCircuitBreaker({ failureThreshold: 3 });

      // Simulate backend down
      recordFailures(breaker, 3);

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should open circuit due to high latency", () => {
      const breaker = createCircuitBreaker({
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Simulate backend slow
      for (let i = 0; i < 3; i++) {
        breaker.recordLatency(2000);
        breaker.checkLatencyThreshold();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should record last failure time", () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1 });

      const beforeTime = Date.now();
      breaker.recordFailure();
      const afterTime = Date.now();

      const metrics = breaker.getMetrics();
      const nextAttemptTime = new Date(metrics.nextAttempt!).getTime();

      expect(nextAttemptTime).toBeGreaterThan(beforeTime);
    });
  });

  describe("circuit opens → backend recovers", () => {
    test("should transition to HALF_OPEN after retry timeout", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        retryTimeout: 1000,
      });

      // Open circuit
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for retry timeout
      await advanceTimersAndFlush(1000);

      // Check if request allowed (triggers HALF_OPEN)
      const allowed = breaker.shouldAllowRequest();

      expect(allowed).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    test("should close circuit after successful recovery tests", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
      });

      // Open circuit
      breaker.recordFailure();

      // Wait for HALF_OPEN
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();

      // Successful recovery
      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should normalize latency metrics after recovery", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
        latencyThresholdMs: 1000,
      });

      // High latency before failure
      breaker.recordLatency(2000);
      breaker.recordFailure();

      // Wait for HALF_OPEN
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();

      // Normal latency during recovery
      breaker.recordSuccess();
      breaker.recordLatency(500);
      breaker.recordSuccess();
      breaker.recordLatency(500);

      const metrics = breaker.getMetrics();

      // Average should reflect recent normal latency more than old spike
      expect(metrics.avgLatencyMs).toBeLessThan(1000);
    });

    test("should reopen circuit if recovery test fails", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
      });

      // Open circuit
      breaker.recordFailure();

      // Wait for HALF_OPEN
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();

      // Recovery test fails
      breaker.recordFailure();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should reopen circuit if latency still high in HALF_OPEN", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 2,
      });

      // Open circuit
      breaker.recordFailure();

      // Wait for HALF_OPEN
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();

      // High latency persists
      breaker.recordLatency(2000);
      breaker.checkLatencyThreshold();
      breaker.recordLatency(2000);
      breaker.checkLatencyThreshold();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("backend recovers → circuit closes", () => {
    test("should fully reset failure counter on close", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        retryTimeout: 1000,
      });

      // Open circuit
      recordFailures(breaker, 3);

      // Recover
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();
      breaker.recordSuccess();

      // Circuit should be closed with zero failures
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().failureCount).toBe(0);
    });

    test("should clear consecutive high latency count on close", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
        latencyThresholdMs: 1000,
        latencyConsecutiveChecks: 3,
      });

      // Open with high latency
      for (let i = 0; i < 3; i++) {
        breaker.recordLatency(2000);
        breaker.checkLatencyThreshold();
      }
      breaker.recordFailure();

      // Recover
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();
      breaker.recordLatency(500);
      breaker.recordSuccess();
      breaker.recordLatency(500);

      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.consecutiveHighLatency).toBe(0);
    });

    test("should allow immediate requests after close", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        retryTimeout: 1000,
      });

      // Open and recover
      breaker.recordFailure();
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();

      // Immediate requests should be allowed
      expect(breaker.shouldAllowRequest()).toBe(true);
      expect(breaker.shouldAllowRequest()).toBe(true);
    });

    test("should emit state change event on close", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        retryTimeout: 1000,
      });

      const stateChanges: CircuitState[] = [];
      breaker.onStateChangeListener((state) => {
        stateChanges.push(state);
      });

      // Open and recover
      breaker.recordFailure();
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();

      // Should see: OPEN → HALF_OPEN → CLOSED
      expect(stateChanges).toContain(CircuitState.OPEN);
      expect(stateChanges).toContain(CircuitState.HALF_OPEN);
      expect(stateChanges).toContain(CircuitState.CLOSED);
    });
  });

  describe("complex recovery scenarios", () => {
    test("should handle multiple recovery cycles", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        retryTimeout: 1000,
      });

      // Cycle 1: Open → Close
      breaker.recordFailure();
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Cycle 2: Open → Close again
      breaker.recordFailure();
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should handle partial recovery with degraded latency", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
        latencyThresholdMs: 1000,
      });

      // Open circuit
      breaker.recordFailure();

      // Partial recovery with degraded latency
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();

      breaker.recordSuccess();
      breaker.recordLatency(900); // Just below threshold

      breaker.recordSuccess();
      breaker.recordLatency(900);

      // Should close even with elevated but acceptable latency
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should handle intermittent failures during recovery", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 3, // Need 3 successes
        retryTimeout: 1000,
      });

      // Open circuit
      breaker.recordFailure();

      // First recovery attempt - fails
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordFailure();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Second recovery attempt - succeeds
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should track metrics across entire recovery cycle", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        retryTimeout: 1000,
      });

      // Open circuit
      breaker.recordFailure();
      breaker.recordLatency(2000);

      const metrics1 = breaker.getMetrics();
      expect(metrics1.state).toBe(CircuitState.OPEN);
      expect(metrics1.failureCount).toBe(1);

      // Recover
      await advanceTimersAndFlush(1000);
      breaker.shouldAllowRequest();
      breaker.recordSuccess();
      breaker.recordLatency(500);
      breaker.recordSuccess();
      breaker.recordLatency(500);

      const metrics2 = breaker.getMetrics();
      expect(metrics2.state).toBe(CircuitState.CLOSED);
      expect(metrics2.failureCount).toBe(0);
      expect(metrics2.successCount).toBe(2);
      expect(metrics2.avgLatencyMs).toBeLessThan(1000);
    });
  });
});
