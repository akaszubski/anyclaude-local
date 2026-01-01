/**
 * Unit tests for cluster-health.ts
 *
 * Tests the health monitoring system for MLX cluster nodes with circuit breaker pattern:
 * 1. RollingWindowMetrics class - Circular buffer for tracking metrics over time
 * 2. NodeHealthTracker class - Per-node circuit breaker + metrics + backoff
 * 3. ClusterHealth class - Main orchestrator for health checks across all nodes
 * 4. Error classes - HealthCheckTimeoutError, HealthCheckFailedError, HealthCheckNetworkError
 *
 * Test categories:
 * - RollingWindowMetrics: success rate, latency calculations, time windows, circular buffer
 * - NodeHealthTracker: state transitions, exponential backoff, circuit breaker integration
 * - ClusterHealth: lifecycle (start/stop), callbacks, timeout handling, manual recording
 * - Error classes: structure validation, inheritance
 * - Edge cases: rapid start/stop, offline nodes, callback errors, signal cancellation
 *
 * Mock requirements:
 * - global fetch() for HTTP health checks
 * - setTimeout/clearTimeout for periodic checks and backoff
 * - jest.useFakeTimers() for timing control
 * - AbortController for request cancellation
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  RollingWindowMetrics,
  NodeHealthTracker,
  ClusterHealth,
  HealthCheckTimeoutError,
  HealthCheckFailedError,
  HealthCheckNetworkError,
  HealthCheckResult,
  HealthMetrics,
  HealthCallback,
  BackoffConfig,
} from '../../src/cluster/cluster-health';
import {
  NodeId,
  NodeStatus,
  MLXNode,
} from '../../src/cluster/cluster-types';

// ============================================================================
// Test Helpers and Mocks
// ============================================================================

/**
 * Mock fetch globally for HTTP health check testing
 */
global.fetch = jest.fn();

/**
 * Helper to create a minimal MLX node
 */
function createTestNode(id: string, url: string): MLXNode {
  return {
    id: id as NodeId,
    url,
    status: NodeStatus.INITIALIZING,
    health: {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      avgResponseTime: 0,
      errorRate: 0,
    },
    cache: {
      tokens: 0,
      systemPromptHash: '',
      lastUpdated: 0,
    },
    metrics: {
      requestsInFlight: 0,
      totalRequests: 0,
      cacheHitRate: 0,
      avgLatency: 0,
    },
  };
}

/**
 * Helper to create multiple test nodes
 */
function createTestNodes(count: number): MLXNode[] {
  return Array.from({ length: count }, (_, i) =>
    createTestNode(`node-${i + 1}`, `http://localhost:${8080 + i}`)
  );
}

/**
 * Helper to create a successful health check response
 */
function createHealthyResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok' }),
  } as Response;
}

/**
 * Helper to create a failed health check response
 */
function createUnhealthyResponse(status: number = 503) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'Service Unavailable' }),
  } as Response;
}

/**
 * Helper to create a timeout error
 */
function createTimeoutError() {
  const error = new Error('Request timeout');
  error.name = 'AbortError';
  return error;
}

/**
 * Helper to create a network error
 */
function createNetworkError() {
  const error = new Error('Network error');
  error.name = 'NetworkError';
  return error;
}

/**
 * Helper to create mock health callbacks
 */
function createMockCallbacks(): {
  onStatusChange: jest.Mock;
  onHealthCheck: jest.Mock;
} {
  return {
    onStatusChange: jest.fn(),
    onHealthCheck: jest.fn(),
  };
}

/**
 * Helper to reset all mocks
 */
function resetMocks() {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
}

/**
 * Helper to advance time and flush promises
 */
async function advanceTimersAndFlush(ms: number) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve(); // Flush microtasks
  await Promise.resolve(); // Double flush for nested promises
}

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeEach(() => {
  resetMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  resetMocks();
});

// ============================================================================
// Test Suite: Error Classes
// ============================================================================

describe('HealthCheckTimeoutError', () => {
  test('should create error with correct name and message', () => {
    const error = new HealthCheckTimeoutError('node-1', 5000);
    expect(error.name).toBe('HealthCheckTimeoutError');
    expect(error.message).toContain('node-1');
    expect(error.message).toContain('5000');
  });

  test('should expose nodeId property', () => {
    const error = new HealthCheckTimeoutError('node-1', 5000);
    expect(error.nodeId).toBe('node-1');
  });

  test('should expose timeoutMs property', () => {
    const error = new HealthCheckTimeoutError('node-1', 5000);
    expect(error.timeoutMs).toBe(5000);
  });

  test('should be instanceof Error', () => {
    const error = new HealthCheckTimeoutError('node-1', 5000);
    expect(error).toBeInstanceOf(Error);
  });

  test('should be instanceof HealthCheckTimeoutError', () => {
    const error = new HealthCheckTimeoutError('node-1', 5000);
    expect(error).toBeInstanceOf(HealthCheckTimeoutError);
  });
});

describe('HealthCheckFailedError', () => {
  test('should create error with correct name and message', () => {
    const error = new HealthCheckFailedError('node-1', 503, 'Service Unavailable');
    expect(error.name).toBe('HealthCheckFailedError');
    expect(error.message).toContain('node-1');
    expect(error.message).toContain('503');
    expect(error.message).toContain('Service Unavailable');
  });

  test('should expose nodeId property', () => {
    const error = new HealthCheckFailedError('node-1', 503, 'Service Unavailable');
    expect(error.nodeId).toBe('node-1');
  });

  test('should expose statusCode property', () => {
    const error = new HealthCheckFailedError('node-1', 503, 'Service Unavailable');
    expect(error.statusCode).toBe(503);
  });

  test('should expose statusText property', () => {
    const error = new HealthCheckFailedError('node-1', 503, 'Service Unavailable');
    expect(error.statusText).toBe('Service Unavailable');
  });

  test('should be instanceof Error', () => {
    const error = new HealthCheckFailedError('node-1', 503, 'Service Unavailable');
    expect(error).toBeInstanceOf(Error);
  });

  test('should be instanceof HealthCheckFailedError', () => {
    const error = new HealthCheckFailedError('node-1', 503, 'Service Unavailable');
    expect(error).toBeInstanceOf(HealthCheckFailedError);
  });
});

describe('HealthCheckNetworkError', () => {
  test('should create error with correct name and message', () => {
    const cause = new Error('Connection refused');
    const error = new HealthCheckNetworkError('node-1', cause);
    expect(error.name).toBe('HealthCheckNetworkError');
    expect(error.message).toContain('node-1');
    expect(error.message).toContain('Connection refused');
  });

  test('should expose nodeId property', () => {
    const cause = new Error('Connection refused');
    const error = new HealthCheckNetworkError('node-1', cause);
    expect(error.nodeId).toBe('node-1');
  });

  test('should expose cause property', () => {
    const cause = new Error('Connection refused');
    const error = new HealthCheckNetworkError('node-1', cause);
    expect(error.cause).toBe(cause);
  });

  test('should be instanceof Error', () => {
    const cause = new Error('Connection refused');
    const error = new HealthCheckNetworkError('node-1', cause);
    expect(error).toBeInstanceOf(Error);
  });

  test('should be instanceof HealthCheckNetworkError', () => {
    const cause = new Error('Connection refused');
    const error = new HealthCheckNetworkError('node-1', cause);
    expect(error).toBeInstanceOf(HealthCheckNetworkError);
  });
});

// ============================================================================
// Test Suite: RollingWindowMetrics
// ============================================================================

describe('RollingWindowMetrics', () => {
  describe('constructor', () => {
    test('should create instance with default window size', () => {
      const metrics = new RollingWindowMetrics();
      expect(metrics).toBeDefined();
      expect(metrics).toBeInstanceOf(RollingWindowMetrics);
    });

    test('should create instance with custom window size', () => {
      const metrics = new RollingWindowMetrics(60000); // 1 minute
      expect(metrics).toBeDefined();
    });

    test('should throw on zero window size', () => {
      expect(() => new RollingWindowMetrics(0)).toThrow();
    });

    test('should throw on negative window size', () => {
      expect(() => new RollingWindowMetrics(-1000)).toThrow();
    });
  });

  describe('recordSuccess', () => {
    test('should record successful request with latency', () => {
      const metrics = new RollingWindowMetrics();
      metrics.recordSuccess(100);

      const result = metrics.getMetrics();
      expect(result.successRate).toBe(1.0);
      expect(result.avgLatencyMs).toBe(100);
      expect(result.totalSamples).toBe(1);
    });

    test('should calculate correct average latency for multiple samples', () => {
      const metrics = new RollingWindowMetrics();
      metrics.recordSuccess(100);
      metrics.recordSuccess(200);
      metrics.recordSuccess(300);

      const result = metrics.getMetrics();
      expect(result.avgLatencyMs).toBe(200); // (100 + 200 + 300) / 3
    });

    test('should throw on negative latency', () => {
      const metrics = new RollingWindowMetrics();
      expect(() => metrics.recordSuccess(-100)).toThrow();
    });
  });

  describe('recordFailure', () => {
    test('should record failed request', () => {
      const metrics = new RollingWindowMetrics();
      metrics.recordFailure();

      const result = metrics.getMetrics();
      expect(result.successRate).toBe(0.0);
      expect(result.totalSamples).toBe(1);
    });

    test('should calculate correct success rate with mixed samples', () => {
      const metrics = new RollingWindowMetrics();
      metrics.recordSuccess(100);
      metrics.recordSuccess(200);
      metrics.recordFailure();
      metrics.recordFailure();

      const result = metrics.getMetrics();
      expect(result.successRate).toBe(0.5); // 2 successes / 4 total
      expect(result.totalSamples).toBe(4);
    });

    test('should exclude failures from latency calculation', () => {
      const metrics = new RollingWindowMetrics();
      metrics.recordSuccess(100);
      metrics.recordFailure(); // Should not affect average
      metrics.recordSuccess(200);

      const result = metrics.getMetrics();
      expect(result.avgLatencyMs).toBe(150); // (100 + 200) / 2
    });
  });

  describe('time window behavior', () => {
    test('should exclude samples outside time window', async () => {
      const metrics = new RollingWindowMetrics(1000); // 1 second window

      // Record old samples
      metrics.recordSuccess(100);
      metrics.recordSuccess(200);

      // Advance time beyond window
      await advanceTimersAndFlush(2000);

      // Record new sample
      metrics.recordSuccess(300);

      const result = metrics.getMetrics();
      expect(result.totalSamples).toBe(1); // Only recent sample
      expect(result.avgLatencyMs).toBe(300);
    });

    test('should include samples within time window', async () => {
      const metrics = new RollingWindowMetrics(5000); // 5 second window

      metrics.recordSuccess(100);

      // Advance time but stay within window
      await advanceTimersAndFlush(2000);

      metrics.recordSuccess(200);

      const result = metrics.getMetrics();
      expect(result.totalSamples).toBe(2); // Both samples within window
    });

    test('should handle gradual sample expiration', async () => {
      const metrics = new RollingWindowMetrics(1000);

      metrics.recordSuccess(100);
      await advanceTimersAndFlush(500);

      metrics.recordSuccess(200);
      await advanceTimersAndFlush(600); // First sample now expired

      const result = metrics.getMetrics();
      expect(result.totalSamples).toBe(1); // Only second sample
      expect(result.avgLatencyMs).toBe(200);
    });
  });

  describe('circular buffer behavior', () => {
    test('should handle buffer wraparound', () => {
      const metrics = new RollingWindowMetrics(10000); // Large window

      // Add more samples than internal buffer size (assuming 100)
      for (let i = 0; i < 150; i++) {
        metrics.recordSuccess(100);
      }

      const result = metrics.getMetrics();
      expect(result.totalSamples).toBeLessThanOrEqual(150);
      expect(result.successRate).toBe(1.0);
    });

    test('should maintain correct metrics after wraparound', () => {
      const metrics = new RollingWindowMetrics(10000);

      // Fill buffer with successes
      for (let i = 0; i < 100; i++) {
        metrics.recordSuccess(100);
      }

      // Add failures that cause wraparound
      for (let i = 0; i < 50; i++) {
        metrics.recordFailure();
      }

      const result = metrics.getMetrics();
      expect(result.successRate).toBeLessThan(1.0);
      expect(result.successRate).toBeGreaterThan(0.0);
    });
  });

  describe('edge cases', () => {
    test('should return zero metrics when no samples', () => {
      const metrics = new RollingWindowMetrics();
      const result = metrics.getMetrics();

      expect(result.successRate).toBe(0);
      expect(result.avgLatencyMs).toBe(0);
      expect(result.totalSamples).toBe(0);
    });

    test('should return zero metrics when all samples expired', async () => {
      const metrics = new RollingWindowMetrics(1000);

      metrics.recordSuccess(100);
      await advanceTimersAndFlush(2000); // Wait for expiration

      const result = metrics.getMetrics();
      expect(result.successRate).toBe(0);
      expect(result.avgLatencyMs).toBe(0);
      expect(result.totalSamples).toBe(0);
    });

    test('should handle only failures in window', () => {
      const metrics = new RollingWindowMetrics();

      metrics.recordFailure();
      metrics.recordFailure();
      metrics.recordFailure();

      const result = metrics.getMetrics();
      expect(result.successRate).toBe(0);
      expect(result.avgLatencyMs).toBe(0); // No successful requests to measure
      expect(result.totalSamples).toBe(3);
    });

    test('should handle very high latency values', () => {
      const metrics = new RollingWindowMetrics();

      metrics.recordSuccess(999999);

      const result = metrics.getMetrics();
      expect(result.avgLatencyMs).toBe(999999);
    });
  });

  describe('reset', () => {
    test('should clear all samples', () => {
      const metrics = new RollingWindowMetrics();

      metrics.recordSuccess(100);
      metrics.recordSuccess(200);
      metrics.recordFailure();

      metrics.reset();

      const result = metrics.getMetrics();
      expect(result.successRate).toBe(0);
      expect(result.avgLatencyMs).toBe(0);
      expect(result.totalSamples).toBe(0);
    });

    test('should allow new samples after reset', () => {
      const metrics = new RollingWindowMetrics();

      metrics.recordSuccess(100);
      metrics.reset();
      metrics.recordSuccess(200);

      const result = metrics.getMetrics();
      expect(result.avgLatencyMs).toBe(200);
      expect(result.totalSamples).toBe(1);
    });
  });
});

// ============================================================================
// Test Suite: NodeHealthTracker
// ============================================================================

describe('NodeHealthTracker', () => {
  const defaultConfig = {
    maxConsecutiveFailures: 3,
    unhealthyThreshold: 0.5,
    degradedThreshold: 0.8,
    checkIntervalMs: 5000,
    timeoutMs: 2000,
  };

  const defaultBackoffConfig: BackoffConfig = {
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    multiplier: 2,
  };

  describe('constructor', () => {
    test('should create instance with valid config', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);
      expect(tracker).toBeDefined();
      expect(tracker).toBeInstanceOf(NodeHealthTracker);
    });

    test('should start in INITIALIZING state', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);
      expect(tracker.getStatus()).toBe(NodeStatus.INITIALIZING);
    });

    test('should have zero consecutive failures initially', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);
      const health = tracker.getHealth();
      expect(health.consecutiveFailures).toBe(0);
    });

    test('should have zero consecutive successes initially', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);
      const health = tracker.getHealth();
      expect(health.consecutiveSuccesses).toBe(0);
    });
  });

  describe('recordSuccess', () => {
    test('should transition from INITIALIZING to HEALTHY', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);

      expect(tracker.getStatus()).toBe(NodeStatus.HEALTHY);
    });

    test('should increment consecutive successes', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);
      tracker.recordSuccess(200);

      const health = tracker.getHealth();
      expect(health.consecutiveSuccesses).toBe(2);
    });

    test('should reset consecutive failures on success', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordFailure(new Error('Test failure'));
      tracker.recordFailure(new Error('Test failure'));

      let health = tracker.getHealth();
      expect(health.consecutiveFailures).toBe(2);

      tracker.recordSuccess(100);

      health = tracker.getHealth();
      expect(health.consecutiveFailures).toBe(0);
    });

    test('should transition from UNHEALTHY to HEALTHY after recovery', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Make node unhealthy
      for (let i = 0; i < 3; i++) {
        tracker.recordFailure(new Error('Test failure'));
      }
      expect(tracker.getStatus()).toBe(NodeStatus.UNHEALTHY);

      // Record success
      tracker.recordSuccess(100);

      expect(tracker.getStatus()).toBe(NodeStatus.HEALTHY);
    });

    test('should transition from DEGRADED to HEALTHY when success rate improves', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Create degraded state (50% success rate)
      tracker.recordSuccess(100);
      tracker.recordFailure(new Error('Test failure'));
      tracker.recordSuccess(100);
      tracker.recordFailure(new Error('Test failure'));

      expect(tracker.getStatus()).toBe(NodeStatus.DEGRADED);

      // Improve success rate
      tracker.recordSuccess(100);
      tracker.recordSuccess(100);
      tracker.recordSuccess(100);

      expect(tracker.getStatus()).toBe(NodeStatus.HEALTHY);
    });

    test('should reset backoff delay on success', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Cause failures to increase backoff
      tracker.recordFailure(new Error('Test failure'));
      tracker.recordFailure(new Error('Test failure'));

      const backoffBefore = tracker.getNextCheckDelay();

      // Success should reset backoff
      tracker.recordSuccess(100);

      const backoffAfter = tracker.getNextCheckDelay();
      expect(backoffAfter).toBeLessThan(backoffBefore);
    });

    test('should record latency in metrics', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);
      tracker.recordSuccess(200);
      tracker.recordSuccess(300);

      const metrics = tracker.getMetrics();
      expect(metrics.avgLatencyMs).toBe(200);
    });
  });

  describe('recordFailure', () => {
    test('should increment consecutive failures', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordFailure(new Error('Test failure'));
      tracker.recordFailure(new Error('Test failure'));

      const health = tracker.getHealth();
      expect(health.consecutiveFailures).toBe(2);
    });

    test('should reset consecutive successes on failure', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);
      tracker.recordSuccess(200);

      let health = tracker.getHealth();
      expect(health.consecutiveSuccesses).toBe(2);

      tracker.recordFailure(new Error('Test failure'));

      health = tracker.getHealth();
      expect(health.consecutiveSuccesses).toBe(0);
    });

    test('should transition to UNHEALTHY after maxConsecutiveFailures', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // maxConsecutiveFailures = 3
      tracker.recordFailure(new Error('Test failure 1'));
      tracker.recordFailure(new Error('Test failure 2'));
      expect(tracker.getStatus()).not.toBe(NodeStatus.UNHEALTHY);

      tracker.recordFailure(new Error('Test failure 3'));
      expect(tracker.getStatus()).toBe(NodeStatus.UNHEALTHY);
    });

    test('should transition to DEGRADED when success rate below threshold', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Create 60% success rate (below 80% degraded threshold)
      tracker.recordSuccess(100);
      tracker.recordSuccess(100);
      tracker.recordSuccess(100);
      tracker.recordFailure(new Error('Test failure'));
      tracker.recordFailure(new Error('Test failure'));

      expect(tracker.getStatus()).toBe(NodeStatus.DEGRADED);
    });

    test('should not transition to DEGRADED if success rate above threshold', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Create 85% success rate (above 80% degraded threshold)
      for (let i = 0; i < 17; i++) {
        tracker.recordSuccess(100);
      }
      for (let i = 0; i < 3; i++) {
        tracker.recordFailure(new Error('Test failure'));
      }

      expect(tracker.getStatus()).toBe(NodeStatus.HEALTHY);
    });

    test('should increase backoff delay exponentially', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      const delays: number[] = [];

      for (let i = 0; i < 5; i++) {
        tracker.recordFailure(new Error('Test failure'));
        delays.push(tracker.getNextCheckDelay());
      }

      // Each delay should be larger than the previous (exponential growth)
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }
    });

    test('should cap backoff delay at maxDelayMs', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Cause many failures
      for (let i = 0; i < 20; i++) {
        tracker.recordFailure(new Error('Test failure'));
      }

      const delay = tracker.getNextCheckDelay();
      expect(delay).toBeLessThanOrEqual(defaultBackoffConfig.maxDelayMs);
    });

    test('should store last error', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      const testError = new Error('Test failure message');
      tracker.recordFailure(testError);

      const health = tracker.getHealth();
      expect(health.lastError).toBe(testError);
    });
  });

  describe('shouldAttemptRecovery', () => {
    test('should return false when node is HEALTHY', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);

      expect(tracker.shouldAttemptRecovery()).toBe(false);
    });

    test('should return false when node is DEGRADED', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Create degraded state
      tracker.recordSuccess(100);
      tracker.recordSuccess(100);
      tracker.recordFailure(new Error('Test failure'));
      tracker.recordFailure(new Error('Test failure'));
      tracker.recordFailure(new Error('Test failure'));

      expect(tracker.getStatus()).toBe(NodeStatus.DEGRADED);
      expect(tracker.shouldAttemptRecovery()).toBe(false);
    });

    test('should return true when node is UNHEALTHY and backoff elapsed', async () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Make node unhealthy
      for (let i = 0; i < 3; i++) {
        tracker.recordFailure(new Error('Test failure'));
      }
      expect(tracker.getStatus()).toBe(NodeStatus.UNHEALTHY);

      // Advance time past backoff delay
      const backoffDelay = tracker.getNextCheckDelay();
      await advanceTimersAndFlush(backoffDelay + 100);

      expect(tracker.shouldAttemptRecovery()).toBe(true);
    });

    test('should return false when node is UNHEALTHY but backoff not elapsed', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      // Make node unhealthy
      for (let i = 0; i < 3; i++) {
        tracker.recordFailure(new Error('Test failure'));
      }
      expect(tracker.getStatus()).toBe(NodeStatus.UNHEALTHY);

      // Don't wait for backoff
      expect(tracker.shouldAttemptRecovery()).toBe(false);
    });

    test('should return false when node is OFFLINE', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.markOffline();

      expect(tracker.shouldAttemptRecovery()).toBe(false);
    });
  });

  describe('markOffline', () => {
    test('should transition to OFFLINE state', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.markOffline();

      expect(tracker.getStatus()).toBe(NodeStatus.OFFLINE);
    });

    test('should transition from any state to OFFLINE', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);
      expect(tracker.getStatus()).toBe(NodeStatus.HEALTHY);

      tracker.markOffline();
      expect(tracker.getStatus()).toBe(NodeStatus.OFFLINE);
    });
  });

  describe('getMetrics', () => {
    test('should return current metrics snapshot', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);
      tracker.recordSuccess(200);
      tracker.recordFailure(new Error('Test failure'));

      const metrics = tracker.getMetrics();
      expect(metrics.successRate).toBeCloseTo(0.666, 2);
      expect(metrics.avgLatencyMs).toBe(150);
      expect(metrics.totalSamples).toBe(3);
    });

    test('should reflect time window behavior', async () => {
      const tracker = new NodeHealthTracker('node-1', {
        ...defaultConfig,
        checkIntervalMs: 1000, // 1 second window
      }, defaultBackoffConfig);

      tracker.recordSuccess(100);
      await advanceTimersAndFlush(2000); // Outside window

      const metrics = tracker.getMetrics();
      expect(metrics.totalSamples).toBe(0);
    });
  });

  describe('getHealth', () => {
    test('should return complete health snapshot', () => {
      const tracker = new NodeHealthTracker('node-1', defaultConfig, defaultBackoffConfig);

      tracker.recordSuccess(100);
      tracker.recordFailure(new Error('Test error'));

      const health = tracker.getHealth();
      expect(health.status).toBe(NodeStatus.DEGRADED);
      expect(health.consecutiveSuccesses).toBe(0);
      expect(health.consecutiveFailures).toBe(1);
      expect(health.lastError).toBeDefined();
      expect(health.lastCheckTime).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Test Suite: ClusterHealth
// ============================================================================

describe('ClusterHealth', () => {
  const defaultHealthConfig = {
    checkIntervalMs: 5000,
    timeoutMs: 2000,
    maxConsecutiveFailures: 3,
    unhealthyThreshold: 0.5,
    degradedThreshold: 0.8,
  };

  const defaultBackoffConfig: BackoffConfig = {
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    multiplier: 2,
  };

  describe('constructor', () => {
    test('should create instance with valid config', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      expect(health).toBeDefined();
      expect(health).toBeInstanceOf(ClusterHealth);
    });

    test('should not be running initially', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      expect(health.isRunning()).toBe(false);
    });
  });

  describe('startHealthChecks', () => {
    test('should start monitoring nodes', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(2);

      health.startHealthChecks(nodes);

      expect(health.isRunning()).toBe(true);
    });

    test('should throw when starting twice without stopping', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(2);

      health.startHealthChecks(nodes);

      expect(() => health.startHealthChecks(nodes)).toThrow();
    });

    test('should perform initial health check for all nodes', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(2);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);

      // Wait for initial checks
      await advanceTimersAndFlush(100);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:8080'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:8081'),
        expect.any(Object)
      );
    });

    test('should schedule periodic health checks', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);

      // Initial check
      await advanceTimersAndFlush(100);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance to next check interval
      await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Advance to next check interval
      await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('should accept empty nodes array', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);

      expect(() => health.startHealthChecks([])).not.toThrow();
      expect(health.isRunning()).toBe(true);
    });
  });

  describe('stopHealthChecks', () => {
    test('should stop monitoring', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);
      expect(health.isRunning()).toBe(true);

      health.stopHealthChecks();
      expect(health.isRunning()).toBe(false);
    });

    test('should cancel in-flight health checks', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      // Mock slow response
      (global.fetch as jest.Mock).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(createHealthyResponse()), 5000))
      );

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      health.stopHealthChecks();

      // Verify no more checks scheduled
      await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only initial check
    });

    test('should clear all timers', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(2);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      health.stopHealthChecks();

      // Advance time significantly
      await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs * 10);

      // Should not have any new checks after initial ones
      expect(global.fetch).toHaveBeenCalledTimes(0); // Stopped before initial checks completed
    });

    test('should be idempotent', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);
      health.stopHealthChecks();

      expect(() => health.stopHealthChecks()).not.toThrow();
    });

    test('should allow restart after stop', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);
      health.stopHealthChecks();

      expect(() => health.startHealthChecks(nodes)).not.toThrow();
      expect(health.isRunning()).toBe(true);
    });
  });

  describe('health check execution', () => {
    test('should make HTTP request to /health endpoint', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/health',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal),
        })
      );
    });

    test('should apply timeout to health checks', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const options = fetchCall[1];

      expect(options.signal).toBeDefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    test('should record success on healthy response', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.status).toBe(NodeStatus.HEALTHY);
    });

    test('should record failure on unhealthy response', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createUnhealthyResponse(503));

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.metrics.consecutiveFailures).toBe(1);
    });

    test('should record failure on timeout', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockRejectedValue(createTimeoutError());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.metrics.consecutiveFailures).toBe(1);
    });

    test('should record failure on network error', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockRejectedValue(createNetworkError());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.metrics.consecutiveFailures).toBe(1);
    });
  });

  describe('callbacks', () => {
    test('should invoke onStatusChange when node becomes healthy', async () => {
      const callbacks = createMockCallbacks();
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig, callbacks);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      expect(callbacks.onStatusChange).toHaveBeenCalledWith(
        'node-1',
        NodeStatus.HEALTHY,
        NodeStatus.INITIALIZING
      );
    });

    test('should invoke onStatusChange when node becomes unhealthy', async () => {
      const callbacks = createMockCallbacks();
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig, callbacks);
      const nodes = createTestNodes(1);

      // First success
      (global.fetch as jest.Mock).mockResolvedValueOnce(createHealthyResponse());
      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      // Then failures
      (global.fetch as jest.Mock).mockResolvedValue(createUnhealthyResponse(503));

      for (let i = 0; i < 3; i++) {
        await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      }

      expect(callbacks.onStatusChange).toHaveBeenCalledWith(
        'node-1',
        NodeStatus.UNHEALTHY,
        expect.any(String)
      );
    });

    test('should invoke onHealthCheck after each check', async () => {
      const callbacks = createMockCallbacks();
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig, callbacks);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      expect(callbacks.onHealthCheck).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          success: true,
          latencyMs: expect.any(Number),
        })
      );
    });

    test('should not crash if callbacks throw errors', async () => {
      const callbacks = createMockCallbacks();
      callbacks.onStatusChange.mockImplementation(() => {
        throw new Error('Callback error');
      });

      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig, callbacks);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      expect(() => health.startHealthChecks(nodes)).not.toThrow();
      await advanceTimersAndFlush(100);

      // Health monitoring should continue despite callback error
      expect(health.isRunning()).toBe(true);
    });

    test('should handle missing callbacks gracefully', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      expect(() => health.startHealthChecks(nodes)).not.toThrow();
      await advanceTimersAndFlush(100);
    });
  });

  describe('manual recording', () => {
    test('should allow manual success recording', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);
      health.recordSuccess('node-1', 150);

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.metrics.avgLatencyMs).toBe(150);
    });

    test('should allow manual failure recording', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);
      health.recordFailure('node-1', new Error('Manual failure'));

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.metrics.consecutiveFailures).toBe(1);
    });

    test('should trigger callbacks on manual recording', () => {
      const callbacks = createMockCallbacks();
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig, callbacks);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);
      health.recordSuccess('node-1', 100);

      expect(callbacks.onStatusChange).toHaveBeenCalled();
    });

    test('should handle unknown nodeId gracefully', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);

      expect(() => health.recordSuccess('unknown-node', 100)).not.toThrow();
      expect(() => health.recordFailure('unknown-node', new Error('Test'))).not.toThrow();
    });
  });

  describe('isHealthy', () => {
    test('should return true for healthy node', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      expect(health.isHealthy('node-1')).toBe(true);
    });

    test('should return false for unhealthy node', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createUnhealthyResponse(503));

      health.startHealthChecks(nodes);

      // Cause multiple failures
      for (let i = 0; i < 3; i++) {
        await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      }

      expect(health.isHealthy('node-1')).toBe(false);
    });

    test('should return false for degraded node', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);

      // Create degraded state (mix of successes and failures)
      health.recordSuccess('node-1', 100);
      health.recordSuccess('node-1', 100);
      health.recordFailure('node-1', new Error('Test'));
      health.recordFailure('node-1', new Error('Test'));
      health.recordFailure('node-1', new Error('Test'));

      expect(health.isHealthy('node-1')).toBe(false);
    });

    test('should return false for unknown nodeId', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);

      expect(health.isHealthy('unknown-node')).toBe(false);
    });
  });

  describe('getNodeHealth', () => {
    test('should return health snapshot for known node', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth).toMatchObject({
        status: NodeStatus.HEALTHY,
        metrics: expect.objectContaining({
          successRate: expect.any(Number),
          avgLatencyMs: expect.any(Number),
        }),
      });
    });

    test('should throw for unknown nodeId', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);

      expect(() => health.getNodeHealth('unknown-node')).toThrow();
    });
  });

  describe('shouldAttemptRecovery', () => {
    test('should return false for healthy node', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      expect(health.shouldAttemptRecovery('node-1')).toBe(false);
    });

    test('should return true for unhealthy node after backoff', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);

      // Make node unhealthy
      for (let i = 0; i < 3; i++) {
        health.recordFailure('node-1', new Error('Test'));
      }

      // Wait for backoff
      await advanceTimersAndFlush(defaultBackoffConfig.initialDelayMs + 100);

      expect(health.shouldAttemptRecovery('node-1')).toBe(true);
    });

    test('should return false for unknown nodeId', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      health.startHealthChecks(nodes);

      expect(health.shouldAttemptRecovery('unknown-node')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('should handle rapid start/stop cycles', () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      for (let i = 0; i < 10; i++) {
        health.startHealthChecks(nodes);
        health.stopHealthChecks();
      }

      expect(health.isRunning()).toBe(false);
    });

    test('should handle nodes going offline during monitoring', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createHealthyResponse())
        .mockRejectedValue(createNetworkError());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      // Node should transition to unhealthy after failures
      for (let i = 0; i < 3; i++) {
        await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      }

      expect(health.isHealthy('node-1')).toBe(false);
    });

    test('should not check UNHEALTHY nodes until backoff elapsed', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockRejectedValue(createNetworkError());

      health.startHealthChecks(nodes);

      // Cause node to become unhealthy
      for (let i = 0; i < 3; i++) {
        await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);
      }

      const checksBefore = (global.fetch as jest.Mock).mock.calls.length;

      // Advance time but not past backoff
      await advanceTimersAndFlush(defaultHealthConfig.checkIntervalMs);

      const checksAfter = (global.fetch as jest.Mock).mock.calls.length;

      // Should not have performed additional checks
      expect(checksAfter).toBe(checksBefore);
    });

    test('should handle AbortController signal cancellation', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(1);

      (global.fetch as jest.Mock).mockImplementation((url, options) => {
        // Simulate abort
        const error = new Error('Request aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      // Should handle abort gracefully
      const nodeHealth = health.getNodeHealth('node-1');
      expect(nodeHealth.metrics.consecutiveFailures).toBeGreaterThan(0);
    });

    test('should handle concurrent health checks for multiple nodes', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(5);

      (global.fetch as jest.Mock).mockResolvedValue(createHealthyResponse());

      health.startHealthChecks(nodes);
      await advanceTimersAndFlush(100);

      // All nodes should be checked
      expect(global.fetch).toHaveBeenCalledTimes(5);

      // All nodes should be healthy
      for (const node of nodes) {
        expect(health.isHealthy(node.id)).toBe(true);
      }
    });

    test('should handle different health states for different nodes', async () => {
      const health = new ClusterHealth(defaultHealthConfig, defaultBackoffConfig);
      const nodes = createTestNodes(3);

      health.startHealthChecks(nodes);

      // Node 1: Healthy
      health.recordSuccess('node-1', 100);

      // Node 2: Degraded
      health.recordSuccess('node-2', 100);
      health.recordSuccess('node-2', 100);
      health.recordFailure('node-2', new Error('Test'));
      health.recordFailure('node-2', new Error('Test'));
      health.recordFailure('node-2', new Error('Test'));

      // Node 3: Unhealthy
      health.recordFailure('node-3', new Error('Test'));
      health.recordFailure('node-3', new Error('Test'));
      health.recordFailure('node-3', new Error('Test'));

      expect(health.isHealthy('node-1')).toBe(true);
      expect(health.isHealthy('node-2')).toBe(false);
      expect(health.isHealthy('node-3')).toBe(false);
    });
  });
});
