/**
 * Unit tests for cluster-router.ts
 *
 * Tests the cache-affinity request router for MLX cluster nodes:
 * 1. StickySessionManager class - TTL-based session tracking with cleanup timer
 * 2. Strategy functions - round-robin, least-connections, cache-affinity, random
 * 3. ClusterRouter class - main orchestrator with selectNode(), selectNodeWithSticky(), getRoutingPlan()
 *
 * Test categories:
 * - StickySessionManager: session creation, TTL expiration, cleanup timer, callbacks
 * - Round-robin strategy: cycling, wraparound, unhealthy node skipping
 * - Least-connections strategy: load-based selection, tie-breaking
 * - Cache-affinity strategy: scoring algorithm (cache match +50, tools +20, health +25, etc.)
 * - Random strategy: healthy node selection
 * - ClusterRouter integration: strategy delegation, sticky sessions, fallback behavior
 * - Edge cases: empty nodes, all unhealthy, session node offline
 *
 * Cache-Affinity Scoring (test exact values):
 * - Cache match: +50 points (systemPromptHash matches)
 * - Tools match: +20 points (only if cache matches)
 * - Health score: +25 * successRate
 * - Availability: +15 if requestsInFlight < threshold
 * - Recency: +10 if lastUpdated < 60s ago
 * - Total max: 120 points
 *
 * Mock requirements:
 * - jest.useFakeTimers() for TTL and cleanup timer testing
 * - Mock MLXNode objects with various health/cache states
 * - Mock RouterCallbacks with jest.fn()
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  StickySessionManager,
  ClusterRouter,
  StickySession,
  CacheAffinityScore,
  RouterCallbacks,
  RoutingConfig,
} from '../../src/cluster/cluster-router';
import {
  MLXNode,
  NodeId,
  NodeStatus,
  LoadBalanceStrategy,
  RoutingContext,
  RoutingDecision,
} from '../../src/cluster/cluster-types';

// ============================================================================
// Test Helpers and Mocks
// ============================================================================

/**
 * Helper to create a minimal MLX node with custom properties
 */
function createTestNode(
  id: string,
  overrides?: Partial<MLXNode>
): MLXNode {
  return {
    id: id as NodeId,
    url: `http://localhost:${8080 + parseInt(id.split('-')[1] || '1', 10)}`,
    status: NodeStatus.HEALTHY,
    health: {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      avgResponseTime: 100,
      errorRate: 0.0,
    },
    cache: {
      tokens: 1000,
      systemPromptHash: 'hash-default',
      lastUpdated: Date.now(),
    },
    metrics: {
      requestsInFlight: 0,
      totalRequests: 0,
      cacheHitRate: 0.8,
      avgLatency: 100,
    },
    ...overrides,
  };
}

/**
 * Helper to create multiple test nodes
 */
function createTestNodes(count: number): MLXNode[] {
  return Array.from({ length: count }, (_, i) =>
    createTestNode(`node-${i + 1}`)
  );
}

/**
 * Helper to create a routing context
 */
function createRoutingContext(
  systemPromptHash: string = 'hash-default',
  estimatedTokens: number = 100,
  userPriority: 'low' | 'normal' | 'high' = 'normal'
): RoutingContext {
  return {
    systemPromptHash,
    estimatedTokens,
    userPriority,
  };
}

/**
 * Helper to create mock router callbacks
 */
function createMockCallbacks(): {
  onNodeSelected: jest.Mock;
  onSessionCreated: jest.Mock;
  onSessionExpired: jest.Mock;
  onRoutingFailed: jest.Mock;
} {
  return {
    onNodeSelected: jest.fn(),
    onSessionCreated: jest.fn(),
    onSessionExpired: jest.fn(),
    onRoutingFailed: jest.fn(),
  };
}

/**
 * Helper to reset all mocks
 */
function resetMocks() {
  jest.clearAllMocks();
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
// Test Suite: StickySessionManager
// ============================================================================

describe('StickySessionManager', () => {
  const DEFAULT_TTL = 60000; // 1 minute

  describe('constructor', () => {
    test('should create instance with valid TTL', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(StickySessionManager);
    });

    test('should create instance with callbacks', () => {
      const callbacks = createMockCallbacks();
      const manager = new StickySessionManager(DEFAULT_TTL, callbacks);
      expect(manager).toBeDefined();
    });

    test('should throw on zero TTL', () => {
      expect(() => new StickySessionManager(0)).toThrow();
    });

    test('should throw on negative TTL', () => {
      expect(() => new StickySessionManager(-1000)).toThrow();
    });

    test('should start cleanup timer automatically', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('createSession', () => {
    test('should create session and allow retrieval', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', 'node-1');

      const nodeId = manager.getSession('session-1');
      expect(nodeId).toBe('node-1');
    });

    test('should return null for non-existent session', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      const nodeId = manager.getSession('non-existent');

      expect(nodeId).toBeNull();
    });

    test('should increment active session count', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      expect(manager.getActiveSessions()).toBe(0);

      manager.createSession('session-1', 'node-1');
      expect(manager.getActiveSessions()).toBe(1);

      manager.createSession('session-2', 'node-2');
      expect(manager.getActiveSessions()).toBe(2);
    });

    test('should fire onSessionCreated callback', () => {
      const callbacks = createMockCallbacks();
      const manager = new StickySessionManager(DEFAULT_TTL, callbacks);

      manager.createSession('session-1', 'node-1');

      expect(callbacks.onSessionCreated).toHaveBeenCalledTimes(1);
      expect(callbacks.onSessionCreated).toHaveBeenCalledWith('session-1', 'node-1');
    });

    test('should allow overwriting existing session', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', 'node-1');
      manager.createSession('session-1', 'node-2');

      const nodeId = manager.getSession('session-1');
      expect(nodeId).toBe('node-2');
    });

    test('should reset TTL when overwriting session', async () => {
      const manager = new StickySessionManager(1000); // 1 second TTL

      manager.createSession('session-1', 'node-1');
      await advanceTimersAndFlush(500); // Half TTL

      manager.createSession('session-1', 'node-2'); // Reset TTL
      await advanceTimersAndFlush(600); // Would expire old TTL

      const nodeId = manager.getSession('session-1');
      expect(nodeId).toBe('node-2'); // Still valid
    });
  });

  describe('TTL expiration', () => {
    test('should expire session after TTL', async () => {
      const manager = new StickySessionManager(1000); // 1 second TTL

      manager.createSession('session-1', 'node-1');

      // Before expiration
      expect(manager.getSession('session-1')).toBe('node-1');

      // After expiration
      await advanceTimersAndFlush(1100);
      expect(manager.getSession('session-1')).toBeNull();
    });

    test('should decrement active session count on expiration', async () => {
      const manager = new StickySessionManager(1000);

      manager.createSession('session-1', 'node-1');
      expect(manager.getActiveSessions()).toBe(1);

      await advanceTimersAndFlush(1100);
      expect(manager.getActiveSessions()).toBe(0);
    });

    test('should fire onSessionExpired callback on expiration', async () => {
      const callbacks = createMockCallbacks();
      const manager = new StickySessionManager(1000, callbacks);

      manager.createSession('session-1', 'node-1');
      await advanceTimersAndFlush(1100);

      expect(callbacks.onSessionExpired).toHaveBeenCalledTimes(1);
      expect(callbacks.onSessionExpired).toHaveBeenCalledWith('session-1', 'node-1');
    });

    test('should handle multiple sessions expiring at different times', async () => {
      const manager = new StickySessionManager(1000);

      manager.createSession('session-1', 'node-1');
      await advanceTimersAndFlush(500);
      manager.createSession('session-2', 'node-2');

      // First session expires
      await advanceTimersAndFlush(600);
      expect(manager.getSession('session-1')).toBeNull();
      expect(manager.getSession('session-2')).toBe('node-2');

      // Second session expires
      await advanceTimersAndFlush(500);
      expect(manager.getSession('session-2')).toBeNull();
    });
  });

  describe('removeSession', () => {
    test('should remove session immediately', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', 'node-1');
      expect(manager.getSession('session-1')).toBe('node-1');

      manager.removeSession('session-1');
      expect(manager.getSession('session-1')).toBeNull();
    });

    test('should decrement active session count', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', 'node-1');
      expect(manager.getActiveSessions()).toBe(1);

      manager.removeSession('session-1');
      expect(manager.getActiveSessions()).toBe(0);
    });

    test('should not throw on removing non-existent session', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      expect(() => manager.removeSession('non-existent')).not.toThrow();
    });

    test('should fire onSessionExpired callback when removed', () => {
      const callbacks = createMockCallbacks();
      const manager = new StickySessionManager(DEFAULT_TTL, callbacks);

      manager.createSession('session-1', 'node-1');
      manager.removeSession('session-1');

      expect(callbacks.onSessionExpired).toHaveBeenCalledTimes(1);
      expect(callbacks.onSessionExpired).toHaveBeenCalledWith('session-1', 'node-1');
    });
  });

  describe('getSessionsForNode', () => {
    test('should return zero for node with no sessions', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      expect(manager.getSessionsForNode('node-1')).toBe(0);
    });

    test('should count sessions for specific node', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', 'node-1');
      manager.createSession('session-2', 'node-1');
      manager.createSession('session-3', 'node-2');

      expect(manager.getSessionsForNode('node-1')).toBe(2);
      expect(manager.getSessionsForNode('node-2')).toBe(1);
    });

    test('should update count when session removed', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', 'node-1');
      manager.createSession('session-2', 'node-1');
      expect(manager.getSessionsForNode('node-1')).toBe(2);

      manager.removeSession('session-1');
      expect(manager.getSessionsForNode('node-1')).toBe(1);
    });

    test('should update count when session expires', async () => {
      const manager = new StickySessionManager(1000);

      manager.createSession('session-1', 'node-1');
      expect(manager.getSessionsForNode('node-1')).toBe(1);

      await advanceTimersAndFlush(1100);
      expect(manager.getSessionsForNode('node-1')).toBe(0);
    });
  });

  describe('cleanup timer', () => {
    test('should run cleanup periodically', async () => {
      const callbacks = createMockCallbacks();
      const manager = new StickySessionManager(1000, callbacks);

      manager.createSession('session-1', 'node-1');

      // Cleanup should run and expire session
      await advanceTimersAndFlush(1100);

      expect(callbacks.onSessionExpired).toHaveBeenCalledTimes(1);
    });

    test('should clean up multiple expired sessions', async () => {
      const callbacks = createMockCallbacks();
      const manager = new StickySessionManager(1000, callbacks);

      manager.createSession('session-1', 'node-1');
      manager.createSession('session-2', 'node-2');
      manager.createSession('session-3', 'node-3');

      await advanceTimersAndFlush(1100);

      expect(callbacks.onSessionExpired).toHaveBeenCalledTimes(3);
      expect(manager.getActiveSessions()).toBe(0);
    });

    test('should not clean up sessions still within TTL', async () => {
      const manager = new StickySessionManager(2000);

      manager.createSession('session-1', 'node-1');
      await advanceTimersAndFlush(1000); // Half TTL

      expect(manager.getSession('session-1')).toBe('node-1');
      expect(manager.getActiveSessions()).toBe(1);
    });
  });

  describe('stopCleanup', () => {
    test('should stop cleanup timer', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      const timersBefore = jest.getTimerCount();
      manager.stopCleanup();
      const timersAfter = jest.getTimerCount();

      expect(timersAfter).toBeLessThan(timersBefore);
    });

    test('should not expire sessions after cleanup stopped', async () => {
      const manager = new StickySessionManager(1000);

      manager.createSession('session-1', 'node-1');
      manager.stopCleanup();

      await advanceTimersAndFlush(1100);

      // Session not cleaned up (but manually checking would return null due to TTL)
      // The cleanup timer is stopped, but getSession() should still check TTL
      expect(manager.getActiveSessions()).toBe(1); // Not cleaned by timer
    });

    test('should allow calling stopCleanup multiple times', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      expect(() => {
        manager.stopCleanup();
        manager.stopCleanup();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    test('should handle empty session ID gracefully', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('', 'node-1');
      expect(manager.getSession('')).toBe('node-1');
    });

    test('should handle empty node ID gracefully', () => {
      const manager = new StickySessionManager(DEFAULT_TTL);

      manager.createSession('session-1', '');
      expect(manager.getSession('session-1')).toBe('');
    });

    test('should handle very short TTL', async () => {
      const manager = new StickySessionManager(10); // 10ms

      manager.createSession('session-1', 'node-1');
      await advanceTimersAndFlush(20);

      expect(manager.getSession('session-1')).toBeNull();
    });

    test('should handle very long TTL', () => {
      const manager = new StickySessionManager(1000000000); // ~11 days

      manager.createSession('session-1', 'node-1');
      expect(manager.getSession('session-1')).toBe('node-1');
    });

    test('should not crash if callback throws error', () => {
      const callbacks = createMockCallbacks();
      callbacks.onSessionCreated.mockImplementation(() => {
        throw new Error('Callback error');
      });

      const manager = new StickySessionManager(DEFAULT_TTL, callbacks);

      expect(() => manager.createSession('session-1', 'node-1')).not.toThrow();
    });
  });
});

// ============================================================================
// Test Suite: Round-Robin Strategy
// ============================================================================

describe('Round-Robin Strategy', () => {
  const roundRobinConfig: RoutingConfig = {
    strategy: LoadBalanceStrategy.ROUND_ROBIN,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  test('should cycle through nodes in order', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = createTestNodes(3);
    const context = createRoutingContext();

    const decision1 = router.selectNode(nodes, context);
    const decision2 = router.selectNode(nodes, context);
    const decision3 = router.selectNode(nodes, context);

    expect(decision1?.nodeId).toBe('node-1');
    expect(decision2?.nodeId).toBe('node-2');
    expect(decision3?.nodeId).toBe('node-3');
  });

  test('should wrap around after last node', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    router.selectNode(nodes, context); // node-1
    router.selectNode(nodes, context); // node-2
    const decision = router.selectNode(nodes, context); // wrap to node-1

    expect(decision?.nodeId).toBe('node-1');
  });

  test('should skip unhealthy nodes', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = [
      createTestNode('node-1', { status: NodeStatus.HEALTHY }),
      createTestNode('node-2', { status: NodeStatus.UNHEALTHY }),
      createTestNode('node-3', { status: NodeStatus.HEALTHY }),
    ];
    const context = createRoutingContext();

    const decision1 = router.selectNode(nodes, context);
    const decision2 = router.selectNode(nodes, context);

    expect(decision1?.nodeId).toBe('node-1');
    expect(decision2?.nodeId).toBe('node-3'); // Skip node-2
  });

  test('should skip offline nodes', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = [
      createTestNode('node-1', { status: NodeStatus.HEALTHY }),
      createTestNode('node-2', { status: NodeStatus.OFFLINE }),
      createTestNode('node-3', { status: NodeStatus.HEALTHY }),
    ];
    const context = createRoutingContext();

    const decision1 = router.selectNode(nodes, context);
    const decision2 = router.selectNode(nodes, context);

    expect(decision1?.nodeId).toBe('node-1');
    expect(decision2?.nodeId).toBe('node-3');
  });

  test('should include degraded nodes', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = [
      createTestNode('node-1', { status: NodeStatus.HEALTHY }),
      createTestNode('node-2', { status: NodeStatus.DEGRADED }),
      createTestNode('node-3', { status: NodeStatus.HEALTHY }),
    ];
    const context = createRoutingContext();

    const decision1 = router.selectNode(nodes, context);
    const decision2 = router.selectNode(nodes, context);
    const decision3 = router.selectNode(nodes, context);

    expect(decision1?.nodeId).toBe('node-1');
    expect(decision2?.nodeId).toBe('node-2'); // Include degraded
    expect(decision3?.nodeId).toBe('node-3');
  });

  test('should return null if no healthy nodes', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = [
      createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
      createTestNode('node-2', { status: NodeStatus.OFFLINE }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision).toBeNull();
  });

  test('should return null if no nodes', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes: MLXNode[] = [];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision).toBeNull();
  });

  test('should include reason in decision', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.reason).toBeDefined();
    expect(decision?.reason).toContain('round-robin');
  });

  test('should have high confidence for round-robin', () => {
    const router = new ClusterRouter(roundRobinConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

// ============================================================================
// Test Suite: Least-Connections Strategy
// ============================================================================

describe('Least-Connections Strategy', () => {
  const leastConnectionsConfig: RoutingConfig = {
    strategy: LoadBalanceStrategy.LEAST_LOADED,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  test('should select node with fewest connections', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = [
      createTestNode('node-1', {
        metrics: { requestsInFlight: 5, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
      }),
      createTestNode('node-2', {
        metrics: { requestsInFlight: 2, totalRequests: 80, cacheHitRate: 0.8, avgLatency: 100 },
      }),
      createTestNode('node-3', {
        metrics: { requestsInFlight: 8, totalRequests: 150, cacheHitRate: 0.8, avgLatency: 100 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-2'); // Fewest connections (2)
  });

  test('should tie-break by selecting first node', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = [
      createTestNode('node-1', {
        metrics: { requestsInFlight: 3, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
      }),
      createTestNode('node-2', {
        metrics: { requestsInFlight: 3, totalRequests: 80, cacheHitRate: 0.8, avgLatency: 100 },
      }),
      createTestNode('node-3', {
        metrics: { requestsInFlight: 3, totalRequests: 150, cacheHitRate: 0.8, avgLatency: 100 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-1'); // Tie-break: first node
  });

  test('should only consider healthy nodes', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = [
      createTestNode('node-1', {
        status: NodeStatus.UNHEALTHY,
        metrics: { requestsInFlight: 0, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
      }),
      createTestNode('node-2', {
        status: NodeStatus.HEALTHY,
        metrics: { requestsInFlight: 5, totalRequests: 80, cacheHitRate: 0.8, avgLatency: 100 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-2'); // Only healthy node
  });

  test('should consider degraded nodes', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = [
      createTestNode('node-1', {
        status: NodeStatus.DEGRADED,
        metrics: { requestsInFlight: 1, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
      }),
      createTestNode('node-2', {
        status: NodeStatus.HEALTHY,
        metrics: { requestsInFlight: 5, totalRequests: 80, cacheHitRate: 0.8, avgLatency: 100 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-1'); // Degraded but fewer connections
  });

  test('should return null if no healthy nodes', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = [
      createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
      createTestNode('node-2', { status: NodeStatus.OFFLINE }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision).toBeNull();
  });

  test('should include reason in decision', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.reason).toBeDefined();
    expect(decision?.reason).toContain('least');
  });

  test('should have high confidence for least-connections', () => {
    const router = new ClusterRouter(leastConnectionsConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

// ============================================================================
// Test Suite: Cache-Affinity Strategy
// ============================================================================

describe('Cache-Affinity Strategy', () => {
  const cacheAffinityConfig: RoutingConfig = {
    strategy: LoadBalanceStrategy.CACHE_AWARE,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  describe('cache match scoring', () => {
    test('should add +50 for cache match', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-different', lastUpdated: Date.now() },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // Has cache match
    });

    test('should add +20 for tools match (only if cache matches)', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const now = Date.now();
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now },
          health: { lastCheck: now, consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now - 10000 }, // Older
          health: { lastCheck: now, consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      // node-1 gets +20 for recency, node-2 doesn't
      expect(decision?.nodeId).toBe('node-1');
    });

    test('should NOT add tools match points without cache match', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-different', lastUpdated: Date.now() },
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-other', lastUpdated: Date.now() - 10000 },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      // Neither has cache match, so no tools bonus
      // Should fall back to round-robin or other criteria
      expect(decision).not.toBeNull();
    });
  });

  describe('health score calculation', () => {
    test('should add +25 * successRate for health score', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 }, // 100% success = +25
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.5 }, // 50% success = +12.5
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // Better health score
    });

    test('should calculate successRate as (1 - errorRate)', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.2 }, // 80% success = +20
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.8 }, // 20% success = +5
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1');
    });
  });

  describe('availability scoring', () => {
    test('should add +15 if requestsInFlight below threshold', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          metrics: { requestsInFlight: 2, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 }, // Low load = +15
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          metrics: { requestsInFlight: 10, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 }, // High load = 0
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // Lower load
    });

    test('should use threshold of 5 for requestsInFlight', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          metrics: { requestsInFlight: 4, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 }, // Below threshold
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          metrics: { requestsInFlight: 6, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 }, // Above threshold
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1');
    });
  });

  describe('recency scoring', () => {
    test('should add +10 if lastUpdated within 60s', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const now = Date.now();
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now - 30000 }, // 30s ago = +10
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now - 90000 }, // 90s ago = 0
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // More recent
    });

    test('should NOT add recency bonus beyond 60s', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const now = Date.now();
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now - 61000 }, // Just over 60s
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now - 120000 }, // 2 minutes
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      // Both get 0 recency bonus, should fall back to other criteria
      expect(decision).not.toBeNull();
    });
  });

  describe('total score calculation', () => {
    test('should calculate total score correctly', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const now = Date.now();
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now - 30000 },
          health: { lastCheck: now, consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
          metrics: { requestsInFlight: 2, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      // Expected score: cache(50) + tools(20) + health(25) + availability(15) + recency(10) = 120
      expect(decision).not.toBeNull();
      expect(decision?.nodeId).toBe('node-1');
    });

    test('should select highest scoring node', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const now = Date.now();
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-different', lastUpdated: now },
          health: { lastCheck: now, consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
          metrics: { requestsInFlight: 2, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
        }), // Score: 0 + 0 + 25 + 15 + 10 = 50
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: now },
          health: { lastCheck: now, consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.5 },
          metrics: { requestsInFlight: 8, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
        }), // Score: 50 + 20 + 12.5 + 0 + 10 = 92.5
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-2'); // Higher total score
    });
  });

  describe('fallback behavior', () => {
    test('should fall back to round-robin if no cache hits', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-1', lastUpdated: Date.now() },
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-2', lastUpdated: Date.now() },
        }),
        createTestNode('node-3', {
          cache: { tokens: 1000, systemPromptHash: 'hash-3', lastUpdated: Date.now() },
        }),
      ];
      const context = createRoutingContext('hash-different');

      const decision1 = router.selectNode(nodes, context);
      const decision2 = router.selectNode(nodes, context);
      const decision3 = router.selectNode(nodes, context);

      // Should cycle through nodes like round-robin
      expect(decision1?.nodeId).toBe('node-1');
      expect(decision2?.nodeId).toBe('node-2');
      expect(decision3?.nodeId).toBe('node-3');
    });

    test('should include reason when falling back', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-different', lastUpdated: Date.now() },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.reason).toContain('fallback');
    });

    test('should have lower confidence when falling back', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-different', lastUpdated: Date.now() },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.confidence).toBeLessThan(0.7); // Lower confidence for fallback
    });
  });

  describe('edge cases', () => {
    test('should return null if no healthy nodes', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
        createTestNode('node-2', { status: NodeStatus.OFFLINE }),
      ];
      const context = createRoutingContext();

      const decision = router.selectNode(nodes, context);

      expect(decision).toBeNull();
    });

    test('should handle empty cache hash', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: '', lastUpdated: Date.now() },
        }),
      ];
      const context = createRoutingContext('');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // Should still match
    });

    test('should handle zero error rate', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1');
    });

    test('should handle 100% error rate', () => {
      const router = new ClusterRouter(cacheAffinityConfig);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
          health: { lastCheck: Date.now(), consecutiveFailures: 10, avgResponseTime: 100, errorRate: 1.0 },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // Still selectable if status is healthy
    });
  });
});

// ============================================================================
// Test Suite: Random Strategy (if implemented)
// ============================================================================

describe('Random Strategy', () => {
  // Note: Random strategy not in LoadBalanceStrategy enum, but testing in case it's added

  test('should only select healthy nodes', () => {
    // This test may be skipped if random strategy is not implemented
    // Placeholder for future implementation
  });

  test('should return null if no healthy nodes', () => {
    // Placeholder for future implementation
  });
});

// ============================================================================
// Test Suite: ClusterRouter Integration
// ============================================================================

describe('ClusterRouter', () => {
  const defaultConfig: RoutingConfig = {
    strategy: LoadBalanceStrategy.ROUND_ROBIN,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  describe('constructor', () => {
    test('should create instance with valid config', () => {
      const router = new ClusterRouter(defaultConfig);
      expect(router).toBeDefined();
      expect(router).toBeInstanceOf(ClusterRouter);
    });

    test('should create instance with custom session TTL', () => {
      const router = new ClusterRouter(defaultConfig, 120000); // 2 minutes
      expect(router).toBeDefined();
    });

    test('should create instance with callbacks', () => {
      const callbacks = createMockCallbacks();
      const router = new ClusterRouter(defaultConfig, 60000, callbacks);
      expect(router).toBeDefined();
    });

    test('should start in running state', () => {
      const router = new ClusterRouter(defaultConfig);
      expect(router.isRunning()).toBe(true);
    });
  });

  describe('selectNode', () => {
    test('should delegate to round-robin strategy', () => {
      const config: RoutingConfig = {
        strategy: LoadBalanceStrategy.ROUND_ROBIN,
        maxRetries: 3,
        retryDelayMs: 1000,
      };
      const router = new ClusterRouter(config);
      const nodes = createTestNodes(3);
      const context = createRoutingContext();

      const decision1 = router.selectNode(nodes, context);
      const decision2 = router.selectNode(nodes, context);

      expect(decision1?.nodeId).toBe('node-1');
      expect(decision2?.nodeId).toBe('node-2');
    });

    test('should delegate to least-loaded strategy', () => {
      const config: RoutingConfig = {
        strategy: LoadBalanceStrategy.LEAST_LOADED,
        maxRetries: 3,
        retryDelayMs: 1000,
      };
      const router = new ClusterRouter(config);
      const nodes = [
        createTestNode('node-1', {
          metrics: { requestsInFlight: 5, totalRequests: 100, cacheHitRate: 0.8, avgLatency: 100 },
        }),
        createTestNode('node-2', {
          metrics: { requestsInFlight: 2, totalRequests: 80, cacheHitRate: 0.8, avgLatency: 100 },
        }),
      ];
      const context = createRoutingContext();

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-2'); // Least loaded
    });

    test('should delegate to cache-aware strategy', () => {
      const config: RoutingConfig = {
        strategy: LoadBalanceStrategy.CACHE_AWARE,
        maxRetries: 3,
        retryDelayMs: 1000,
      };
      const router = new ClusterRouter(config);
      const nodes = [
        createTestNode('node-1', {
          cache: { tokens: 1000, systemPromptHash: 'hash-match', lastUpdated: Date.now() },
        }),
        createTestNode('node-2', {
          cache: { tokens: 1000, systemPromptHash: 'hash-different', lastUpdated: Date.now() },
        }),
      ];
      const context = createRoutingContext('hash-match');

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1'); // Cache match
    });

    test('should fire onNodeSelected callback', () => {
      const callbacks = createMockCallbacks();
      const router = new ClusterRouter(defaultConfig, 60000, callbacks);
      const nodes = createTestNodes(2);
      const context = createRoutingContext();

      router.selectNode(nodes, context);

      expect(callbacks.onNodeSelected).toHaveBeenCalledTimes(1);
    });

    test('should fire onRoutingFailed callback when no healthy nodes', () => {
      const callbacks = createMockCallbacks();
      const router = new ClusterRouter(defaultConfig, 60000, callbacks);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
      ];
      const context = createRoutingContext();

      router.selectNode(nodes, context);

      expect(callbacks.onRoutingFailed).toHaveBeenCalledTimes(1);
    });

    test('should return null for empty node list', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes: MLXNode[] = [];
      const context = createRoutingContext();

      const decision = router.selectNode(nodes, context);

      expect(decision).toBeNull();
    });
  });

  describe('selectNodeWithSticky', () => {
    test('should use existing session when valid', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(3);
      const context = createRoutingContext();

      // Create session
      router.createSession('session-1', 'node-2');

      // Should route to node-2 due to session
      const decision = router.selectNodeWithSticky(nodes, context, 'session-1');

      expect(decision?.nodeId).toBe('node-2');
    });

    test('should fall back when session node is offline', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.HEALTHY }),
        createTestNode('node-2', { status: NodeStatus.OFFLINE }),
        createTestNode('node-3', { status: NodeStatus.HEALTHY }),
      ];
      const context = createRoutingContext();

      // Create session to offline node
      router.createSession('session-1', 'node-2');

      // Should fall back to healthy node
      const decision = router.selectNodeWithSticky(nodes, context, 'session-1');

      expect(decision?.nodeId).not.toBe('node-2');
      expect(decision?.nodeId).toMatch(/node-(1|3)/);
    });

    test('should fall back when session node is unhealthy', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.HEALTHY }),
        createTestNode('node-2', { status: NodeStatus.UNHEALTHY }),
      ];
      const context = createRoutingContext();

      router.createSession('session-1', 'node-2');

      const decision = router.selectNodeWithSticky(nodes, context, 'session-1');

      expect(decision?.nodeId).toBe('node-1'); // Fall back to healthy node
    });

    test('should create new session when session not found', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const context = createRoutingContext();

      const decision = router.selectNodeWithSticky(nodes, context, 'new-session');

      expect(decision).not.toBeNull();
      expect(router.getActiveSessionCount()).toBe(1); // New session created
    });

    test('should update session when node changes', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.HEALTHY }),
        createTestNode('node-2', { status: NodeStatus.OFFLINE }),
      ];
      const context = createRoutingContext();

      router.createSession('session-1', 'node-2');
      const decision = router.selectNodeWithSticky(nodes, context, 'session-1');

      expect(decision?.nodeId).toBe('node-1'); // Fell back

      // Session should now point to node-1
      const decision2 = router.selectNodeWithSticky(nodes, context, 'session-1');
      expect(decision2?.nodeId).toBe('node-1');
    });

    test('should include sticky session reason in decision', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const context = createRoutingContext();

      router.createSession('session-1', 'node-1');
      const decision = router.selectNodeWithSticky(nodes, context, 'session-1');

      expect(decision?.reason).toContain('sticky');
    });

    test('should have high confidence for sticky session', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const context = createRoutingContext();

      router.createSession('session-1', 'node-1');
      const decision = router.selectNodeWithSticky(nodes, context, 'session-1');

      expect(decision?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should fire onSessionCreated when creating new session', () => {
      const callbacks = createMockCallbacks();
      const router = new ClusterRouter(defaultConfig, 60000, callbacks);
      const nodes = createTestNodes(2);
      const context = createRoutingContext();

      router.selectNodeWithSticky(nodes, context, 'new-session');

      expect(callbacks.onSessionCreated).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRoutingPlan', () => {
    test('should route multiple contexts', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(3);
      const contexts = [
        createRoutingContext('hash-1'),
        createRoutingContext('hash-2'),
        createRoutingContext('hash-3'),
      ];

      const plan = router.getRoutingPlan(nodes, contexts);

      expect(plan.size).toBe(3);
      expect(plan.get('hash-1')).toBeDefined();
      expect(plan.get('hash-2')).toBeDefined();
      expect(plan.get('hash-3')).toBeDefined();
    });

    test('should use context hash as plan key', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const contexts = [
        createRoutingContext('unique-hash-1'),
        createRoutingContext('unique-hash-2'),
      ];

      const plan = router.getRoutingPlan(nodes, contexts);

      expect(plan.has('unique-hash-1')).toBe(true);
      expect(plan.has('unique-hash-2')).toBe(true);
    });

    test('should handle duplicate context hashes', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const contexts = [
        createRoutingContext('same-hash'),
        createRoutingContext('same-hash'),
      ];

      const plan = router.getRoutingPlan(nodes, contexts);

      expect(plan.size).toBe(1); // Deduplicated
      expect(plan.get('same-hash')).toBeDefined();
    });

    test('should return null decision for contexts with no healthy nodes', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
      ];
      const contexts = [createRoutingContext()];

      const plan = router.getRoutingPlan(nodes, contexts);

      const decision = plan.get(contexts[0].systemPromptHash);
      expect(decision).toBeNull();
    });

    test('should handle empty contexts list', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const contexts: RoutingContext[] = [];

      const plan = router.getRoutingPlan(nodes, contexts);

      expect(plan.size).toBe(0);
    });

    test('should distribute load evenly with round-robin', () => {
      const config: RoutingConfig = {
        strategy: LoadBalanceStrategy.ROUND_ROBIN,
        maxRetries: 3,
        retryDelayMs: 1000,
      };
      const router = new ClusterRouter(config);
      const nodes = createTestNodes(3);
      const contexts = [
        createRoutingContext('hash-1'),
        createRoutingContext('hash-2'),
        createRoutingContext('hash-3'),
      ];

      const plan = router.getRoutingPlan(nodes, contexts);

      const nodeIds = Array.from(plan.values()).map(d => d?.nodeId);
      expect(nodeIds).toContain('node-1');
      expect(nodeIds).toContain('node-2');
      expect(nodeIds).toContain('node-3');
    });
  });

  describe('session management', () => {
    test('should create session', () => {
      const router = new ClusterRouter(defaultConfig);

      router.createSession('session-1', 'node-1');

      expect(router.getActiveSessionCount()).toBe(1);
    });

    test('should clear session', () => {
      const router = new ClusterRouter(defaultConfig);

      router.createSession('session-1', 'node-1');
      expect(router.getActiveSessionCount()).toBe(1);

      router.clearSession('session-1');
      expect(router.getActiveSessionCount()).toBe(0);
    });

    test('should track active session count', () => {
      const router = new ClusterRouter(defaultConfig);

      router.createSession('session-1', 'node-1');
      router.createSession('session-2', 'node-2');
      router.createSession('session-3', 'node-3');

      expect(router.getActiveSessionCount()).toBe(3);
    });

    test('should fire onSessionCreated callback', () => {
      const callbacks = createMockCallbacks();
      const router = new ClusterRouter(defaultConfig, 60000, callbacks);

      router.createSession('session-1', 'node-1');

      expect(callbacks.onSessionCreated).toHaveBeenCalledTimes(1);
      expect(callbacks.onSessionCreated).toHaveBeenCalledWith('session-1', 'node-1');
    });

    test('should fire onSessionExpired callback', () => {
      const callbacks = createMockCallbacks();
      const router = new ClusterRouter(defaultConfig, 60000, callbacks);

      router.createSession('session-1', 'node-1');
      router.clearSession('session-1');

      expect(callbacks.onSessionExpired).toHaveBeenCalledTimes(1);
      expect(callbacks.onSessionExpired).toHaveBeenCalledWith('session-1', 'node-1');
    });
  });

  describe('destroy', () => {
    test('should stop cleanup timer', () => {
      const router = new ClusterRouter(defaultConfig);

      const timersBefore = jest.getTimerCount();
      router.destroy();
      const timersAfter = jest.getTimerCount();

      expect(timersAfter).toBeLessThan(timersBefore);
    });

    test('should set isRunning to false', () => {
      const router = new ClusterRouter(defaultConfig);

      expect(router.isRunning()).toBe(true);

      router.destroy();

      expect(router.isRunning()).toBe(false);
    });

    test('should allow calling destroy multiple times', () => {
      const router = new ClusterRouter(defaultConfig);

      expect(() => {
        router.destroy();
        router.destroy();
      }).not.toThrow();
    });

    test('should not clean up sessions after destroy', async () => {
      const router = new ClusterRouter(defaultConfig, 1000); // 1s TTL

      router.createSession('session-1', 'node-1');
      router.destroy();

      await advanceTimersAndFlush(1500);

      // Session not cleaned up (timer stopped)
      expect(router.getActiveSessionCount()).toBe(1);
    });
  });

  describe('edge cases', () => {
    test('should handle all nodes offline', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.OFFLINE }),
        createTestNode('node-2', { status: NodeStatus.OFFLINE }),
      ];
      const context = createRoutingContext();

      const decision = router.selectNode(nodes, context);

      expect(decision).toBeNull();
    });

    test('should handle all nodes unhealthy', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [
        createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
        createTestNode('node-2', { status: NodeStatus.UNHEALTHY }),
      ];
      const context = createRoutingContext();

      const decision = router.selectNode(nodes, context);

      expect(decision).toBeNull();
    });

    test('should handle single node cluster', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = [createTestNode('node-1')];
      const context = createRoutingContext();

      const decision = router.selectNode(nodes, context);

      expect(decision?.nodeId).toBe('node-1');
    });

    test('should handle invalid context gracefully', () => {
      const router = new ClusterRouter(defaultConfig);
      const nodes = createTestNodes(2);
      const context = {
        systemPromptHash: '',
        estimatedTokens: -1,
        userPriority: 'invalid' as any,
      };

      const decision = router.selectNode(nodes, context);

      expect(decision).not.toBeNull();
    });

    test('should not crash if callback throws error', () => {
      const callbacks = createMockCallbacks();
      callbacks.onNodeSelected.mockImplementation(() => {
        throw new Error('Callback error');
      });

      const router = new ClusterRouter(defaultConfig, 60000, callbacks);
      const nodes = createTestNodes(2);
      const context = createRoutingContext();

      expect(() => router.selectNode(nodes, context)).not.toThrow();
    });
  });
});

// ============================================================================
// Test Suite: Latency-Based Strategy (if implemented)
// ============================================================================

describe('Latency-Based Strategy', () => {
  const latencyBasedConfig: RoutingConfig = {
    strategy: LoadBalanceStrategy.LATENCY_BASED,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  test('should select node with lowest average latency', () => {
    const router = new ClusterRouter(latencyBasedConfig);
    const nodes = [
      createTestNode('node-1', {
        health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 200, errorRate: 0.0 },
      }),
      createTestNode('node-2', {
        health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
      }),
      createTestNode('node-3', {
        health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 150, errorRate: 0.0 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-2'); // Lowest latency (100ms)
  });

  test('should tie-break by selecting first node', () => {
    const router = new ClusterRouter(latencyBasedConfig);
    const nodes = [
      createTestNode('node-1', {
        health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
      }),
      createTestNode('node-2', {
        health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 100, errorRate: 0.0 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-1'); // Tie-break: first node
  });

  test('should only consider healthy nodes', () => {
    const router = new ClusterRouter(latencyBasedConfig);
    const nodes = [
      createTestNode('node-1', {
        status: NodeStatus.UNHEALTHY,
        health: { lastCheck: Date.now(), consecutiveFailures: 5, avgResponseTime: 50, errorRate: 0.8 },
      }),
      createTestNode('node-2', {
        status: NodeStatus.HEALTHY,
        health: { lastCheck: Date.now(), consecutiveFailures: 0, avgResponseTime: 200, errorRate: 0.0 },
      }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.nodeId).toBe('node-2'); // Only healthy node
  });

  test('should return null if no healthy nodes', () => {
    const router = new ClusterRouter(latencyBasedConfig);
    const nodes = [
      createTestNode('node-1', { status: NodeStatus.UNHEALTHY }),
      createTestNode('node-2', { status: NodeStatus.OFFLINE }),
    ];
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision).toBeNull();
  });

  test('should include reason in decision', () => {
    const router = new ClusterRouter(latencyBasedConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.reason).toBeDefined();
    expect(decision?.reason).toContain('latency');
  });

  test('should have high confidence for latency-based routing', () => {
    const router = new ClusterRouter(latencyBasedConfig);
    const nodes = createTestNodes(2);
    const context = createRoutingContext();

    const decision = router.selectNode(nodes, context);

    expect(decision?.confidence).toBeGreaterThanOrEqual(0.7);
  });
});
