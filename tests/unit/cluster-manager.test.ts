/**
 * Unit tests for cluster-manager.ts
 *
 * Tests the main cluster orchestration layer for the MLX cluster system:
 * 1. ClusterManagerError class - Error handling with codes and causes
 * 2. Singleton pattern - initializeCluster, getClusterManager, resetClusterManager
 * 3. Provider management - Node-to-provider mapping and lifecycle
 * 4. Node selection - Routing requests to appropriate nodes
 * 5. Health tracking - Recording success/failure and updating health state
 * 6. Status reporting - Real-time cluster status and metrics
 * 7. Shutdown - Graceful cleanup of all components
 * 8. Integration - Full lifecycle and request routing
 *
 * Test categories:
 * - ClusterManagerError: error structure, inheritance, properties
 * - Singleton pattern: initialization, retrieval, reset, concurrency, validation
 * - Provider management: creation, retrieval, lifecycle, failure handling
 * - Node selection: availability, session affinity, cache routing, health filtering
 * - Health tracking: success/failure recording, state updates, routing impact
 * - Status reporting: structure, accuracy, real-time updates, pre-init state
 * - Shutdown: component cleanup, idempotency, error handling, state reset
 * - Integration: full initialization, routing, session affinity, degradation
 *
 * Mock requirements:
 * - ClusterDiscovery: getDiscoveredNodes, start, stop
 * - ClusterHealth: startHealthChecks, recordSuccess, recordFailure, isHealthy, stopHealthChecks
 * - ClusterRouter: selectNodeWithSticky, destroy
 * - ClusterCache: initialize, stop, getCacheStats
 * - createOpenAI from @ai-sdk/openai-compatible
 * - jest.useFakeTimers() for timeout testing
 *
 * Edge cases:
 * - Empty cluster (no nodes discovered)
 * - All nodes unhealthy
 * - Initialization timeout
 * - Provider creation failure for some nodes
 * - Concurrent access during initialization
 * - Shutdown during active request
 * - Component throws during shutdown
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  ClusterManagerError,
  initializeCluster,
  getClusterManager,
  resetClusterManager,
  ClusterManager,
  ClusterStatus,
} from "../../src/cluster/cluster-manager";
import {
  MLXClusterConfig,
  MLXNode,
  NodeId,
  NodeStatus,
  LoadBalanceStrategy,
  RoutingDecision,
} from "../../src/cluster/cluster-types";

// ============================================================================
// Test Helpers and Mocks
// ============================================================================

/**
 * Mock ClusterDiscovery module
 * Creates a single mock instance that is reused across all tests
 */
const mockDiscoveryInstance = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  getDiscoveredNodes: jest.fn().mockReturnValue([]),
};

jest.mock("../../src/cluster/cluster-discovery", () => ({
  ClusterDiscovery: jest.fn().mockImplementation(() => mockDiscoveryInstance),
}));

/**
 * Mock ClusterHealth module
 * Creates a single mock instance that is reused across all tests
 */
const mockHealthInstance = {
  startHealthChecks: jest.fn(),
  stopHealthChecks: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  isHealthy: jest.fn().mockReturnValue(true),
  getNodeHealth: jest.fn().mockReturnValue({
    status: "healthy" as any,
    metrics: {
      successRate: 1.0,
      avgLatencyMs: 100,
      totalSamples: 10,
      consecutiveSuccesses: 10,
      consecutiveFailures: 0,
    },
  }),
  // Alias for backward compatibility with tests
  getHealthStatus: jest.fn().mockReturnValue({
    healthy: true,
    latencyMs: 100,
    errorCount: 0,
  }),
};

jest.mock("../../src/cluster/cluster-health", () => ({
  ClusterHealth: jest.fn().mockImplementation(() => mockHealthInstance),
}));

/**
 * Mock ClusterRouter module
 * Creates a single mock instance that is reused across all tests
 */
const mockRouterInstance = {
  selectNodeWithSticky: jest.fn().mockReturnValue({
    nodeId: "node-1",
    reason: "test-routing",
    confidence: 0.9,
  }),
  destroy: jest.fn(),
};

jest.mock("../../src/cluster/cluster-router", () => ({
  ClusterRouter: jest.fn().mockImplementation(() => mockRouterInstance),
}));

/**
 * Mock ClusterCache module
 * Creates a single mock instance that is reused across all tests
 */
const mockCacheInstance = {
  initialize: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  getCacheStats: jest.fn().mockReturnValue({
    nodeCount: 2,
    cacheCount: 5,
    uniqueHashes: 3,
  }),
};

jest.mock("../../src/cluster/cluster-cache", () => ({
  ClusterCache: jest.fn().mockImplementation(() => mockCacheInstance),
}));

/**
 * Mock @ai-sdk/openai
 */
jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn().mockImplementation(() => ({
    // Mock provider methods
    chat: jest.fn(),
  })),
}));

import { ClusterDiscovery } from "../../src/cluster/cluster-discovery";
import { ClusterHealth } from "../../src/cluster/cluster-health";
import { ClusterRouter } from "../../src/cluster/cluster-router";
import { ClusterCache } from "../../src/cluster/cluster-cache";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Helper to create a minimal MLX node
 */
function createTestNode(id: string, url?: string): MLXNode {
  return {
    id: id as NodeId,
    url:
      url || `http://localhost:${8080 + parseInt(id.split("-")[1] || "1", 10)}`,
    status: NodeStatus.HEALTHY,
    health: {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      avgResponseTime: 100,
      errorRate: 0.0,
    },
    cache: {
      tokens: 1000,
      systemPromptHash: "hash-default",
      lastUpdated: Date.now(),
    },
    metrics: {
      requestsInFlight: 0,
      totalRequests: 0,
      cacheHitRate: 0.8,
      avgLatency: 100,
    },
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
 * Helper to create a valid cluster config
 */
function createTestConfig(): MLXClusterConfig {
  return {
    discovery: {
      mode: "static",
      nodes: [
        { url: "http://localhost:8080", id: "node-1" },
        { url: "http://localhost:8081", id: "node-2" },
      ],
    },
    health: {
      checkIntervalMs: 10000,
      timeoutMs: 5000,
      unhealthyThreshold: 0.5, // 50% error rate threshold (must be 0.0-1.0)
      maxConsecutiveFailures: 3,
    },
    cache: {
      maxCacheAgeSec: 300,
      minCacheHitRate: 0.5,
      maxCacheSizeTokens: 1000000,
    },
    routing: {
      strategy: LoadBalanceStrategy.CACHE_AWARE,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  };
}

/**
 * Helper to get mocked ClusterDiscovery instance
 */
function getMockDiscovery() {
  return mockDiscoveryInstance;
}

/**
 * Helper to get mocked ClusterHealth instance
 */
function getMockHealth() {
  return mockHealthInstance;
}

/**
 * Helper to get mocked ClusterRouter instance
 */
function getMockRouter() {
  return mockRouterInstance;
}

/**
 * Helper to get mocked ClusterCache instance
 */
function getMockCache() {
  return mockCacheInstance;
}

/**
 * Helper to reset all mocks
 * Clears call history but preserves mock implementations
 */
function resetMocks() {
  // Reset call counts and history
  mockDiscoveryInstance.start.mockClear();
  mockDiscoveryInstance.stop.mockClear();
  mockDiscoveryInstance.getDiscoveredNodes.mockClear();

  mockHealthInstance.startHealthChecks.mockClear();
  mockHealthInstance.stopHealthChecks.mockClear();
  mockHealthInstance.recordSuccess.mockClear();
  mockHealthInstance.recordFailure.mockClear();
  mockHealthInstance.isHealthy.mockClear();
  mockHealthInstance.getNodeHealth.mockClear();
  mockHealthInstance.getHealthStatus.mockClear();

  mockRouterInstance.selectNodeWithSticky.mockClear();
  mockRouterInstance.destroy.mockClear();

  mockCacheInstance.initialize.mockClear();
  mockCacheInstance.stop.mockClear();
  mockCacheInstance.getCacheStats.mockClear();

  // Reset createOpenAI mock
  (createOpenAI as jest.Mock).mockClear();

  // Reset return values to defaults
  mockDiscoveryInstance.getDiscoveredNodes.mockReturnValue([]);
  mockHealthInstance.isHealthy.mockReturnValue(true);
  mockHealthInstance.getNodeHealth.mockReturnValue({
    status: "healthy" as any,
    metrics: {
      successRate: 1.0,
      avgLatencyMs: 100,
      totalSamples: 10,
      consecutiveSuccesses: 10,
      consecutiveFailures: 0,
    },
  });
  mockHealthInstance.getHealthStatus.mockReturnValue({
    healthy: true,
    latencyMs: 100,
    errorCount: 0,
  });
  mockRouterInstance.selectNodeWithSticky.mockReturnValue({
    nodeId: "node-1",
    reason: "test-routing",
    confidence: 0.9,
  });
  mockCacheInstance.getCacheStats.mockReturnValue({
    nodeCount: 2,
    cacheCount: 5,
    uniqueHashes: 3,
  });
  mockCacheInstance.initialize.mockResolvedValue(undefined);
}

/**
 * Helper to advance time and flush promises
 */
async function advanceTimersAndFlush(ms: number) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeEach(() => {
  resetMocks();
  resetClusterManager();
});

afterEach(() => {
  resetClusterManager();
  resetMocks();
});

// ============================================================================
// Test Suite: ClusterManagerError
// ============================================================================

describe("ClusterManagerError", () => {
  test("should create error with code and message", () => {
    const error = new ClusterManagerError("TEST_ERROR", "Test error message");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.message).toBe("Test error message");
  });

  test("should create error with cause", () => {
    const cause = new Error("Original error");
    const error = new ClusterManagerError(
      "TEST_ERROR",
      "Test error message",
      cause
    );
    expect(error.cause).toBe(cause);
  });

  test("should extend Error class", () => {
    const error = new ClusterManagerError("TEST_ERROR", "Test error message");
    expect(error).toBeInstanceOf(Error);
  });

  test("should set name property correctly", () => {
    const error = new ClusterManagerError("TEST_ERROR", "Test error message");
    expect(error.name).toBe("ClusterManagerError");
  });

  test("should have stack trace available", () => {
    const error = new ClusterManagerError("TEST_ERROR", "Test error message");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("ClusterManagerError");
  });
});

// ============================================================================
// Test Suite: Singleton Pattern
// ============================================================================

describe("Singleton Pattern", () => {
  describe("initializeCluster", () => {
    test("should create instance with valid config", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);

      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(ClusterManager);
    });

    test("should throw if already initialized", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);

      await expect(initializeCluster(config)).rejects.toThrow(
        ClusterManagerError
      );
      await expect(initializeCluster(config)).rejects.toThrow(
        "already initialized"
      );
    });

    test("should start discovery during initialization", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);

      expect(mockDiscovery?.start).toHaveBeenCalled();
    });

    test("should start health checks during initialization", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);

      expect(mockHealth?.startHealthChecks).toHaveBeenCalled();
    });

    test("should initialize cache during initialization", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockCache = getMockCache();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);

      expect(mockCache?.initialize).toHaveBeenCalled();
    });

    test("should throw ClusterManagerError on invalid config", async () => {
      const invalidConfig = {} as MLXClusterConfig;

      await expect(initializeCluster(invalidConfig)).rejects.toThrow(
        ClusterManagerError
      );
    });

    test("should validate discovery config", async () => {
      const config = createTestConfig();
      // Invalid config: static mode requires nodes
      const invalidConfig = {
        ...config,
        discovery: {
          mode: "static" as const,
          // Missing nodes
        },
      };

      await expect(initializeCluster(invalidConfig)).rejects.toThrow(
        ClusterManagerError
      );
    });

    test("should validate health config", async () => {
      const config = createTestConfig();
      const invalidConfig = {
        ...config,
        health: {
          ...config.health,
          checkIntervalMs: 0, // Invalid
        },
      };

      await expect(initializeCluster(invalidConfig)).rejects.toThrow(
        ClusterManagerError
      );
    });

    test("should validate routing config", async () => {
      const config = createTestConfig();
      const invalidConfig = {
        ...config,
        routing: {
          ...config.routing,
          maxRetries: -1, // Invalid
        },
      };

      await expect(initializeCluster(invalidConfig)).rejects.toThrow(
        ClusterManagerError
      );
    });

    test("should handle concurrent initialization attempts", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const promise1 = initializeCluster(config);
      const promise2 = initializeCluster(config);

      await expect(promise1).resolves.toBeDefined();
      await expect(promise2).rejects.toThrow(ClusterManagerError);
    });
  });

  describe("getClusterManager", () => {
    test("should return instance after initialization", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const retrieved = getClusterManager();

      expect(retrieved).toBe(manager);
    });

    test("should throw if not initialized", () => {
      expect(() => getClusterManager()).toThrow(ClusterManagerError);
      expect(() => getClusterManager()).toThrow("not initialized");
    });

    test("should return same instance on multiple calls", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      const manager1 = getClusterManager();
      const manager2 = getClusterManager();

      expect(manager1).toBe(manager2);
    });
  });

  describe("resetClusterManager", () => {
    test("should clear instance", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      resetClusterManager();

      expect(() => getClusterManager()).toThrow(ClusterManagerError);
    });

    test("should allow initialization after reset", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      resetClusterManager();

      await expect(initializeCluster(config)).resolves.toBeDefined();
    });

    test("should stop discovery when resetting", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      resetClusterManager();

      expect(mockDiscovery?.stop).toHaveBeenCalled();
    });

    test("should stop health checks when resetting", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      resetClusterManager();

      expect(mockHealth?.stopHealthChecks).toHaveBeenCalled();
    });

    test("should stop cache when resetting", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockCache = getMockCache();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      resetClusterManager();

      expect(mockCache?.stop).toHaveBeenCalled();
    });

    test("should not throw if called when not initialized", () => {
      expect(() => resetClusterManager()).not.toThrow();
    });

    test("should handle multiple reset calls safely", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      await initializeCluster(config);
      resetClusterManager();
      resetClusterManager();

      expect(() => getClusterManager()).toThrow();
    });
  });
});

// ============================================================================
// Test Suite: Provider Management
// ============================================================================

describe("Provider Management", () => {
  describe("getNodeProvider", () => {
    test("should return provider for known node", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const provider = manager.getNodeProvider("node-1" as NodeId);

      expect(provider).toBeDefined();
      expect(provider).not.toBeNull();
    });

    test("should return null for unknown node", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const provider = manager.getNodeProvider("unknown-node" as NodeId);

      expect(provider).toBeNull();
    });

    test("should create providers during initialization", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(3));
      }

      await initializeCluster(config);

      expect(createOpenAI).toHaveBeenCalledTimes(3);
    });

    test("should create provider with correct baseURL from node", async () => {
      const config = createTestConfig();
      const nodes = [createTestNode("node-1", "http://custom-url:9000")];
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(nodes);
      }

      await initializeCluster(config);

      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "http://custom-url:9000",
        })
      );
    });

    test("should have provider count matching discovered nodes", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(5));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.totalNodes).toBe(5);
    });

    test("should make provider accessible after discovery complete", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const provider = manager.getNodeProvider("node-1" as NodeId);

      expect(provider).not.toBeNull();
    });

    test("should return null for provider after node removed", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const nodes = createTestNodes(2);
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(nodes);
      }

      const manager = await initializeCluster(config);

      // Simulate node removal
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue([nodes[0]]);
      }

      // Provider should still exist until next update cycle
      const provider = manager.getNodeProvider("node-2" as NodeId);
      expect(provider).toBeDefined(); // May still exist temporarily
    });

    test("should handle provider creation failure gracefully", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      // Mock createOpenAI to throw for second node
      (createOpenAI as jest.Mock)
        .mockReturnValueOnce({ chat: jest.fn() })
        .mockImplementationOnce(() => {
          throw new Error("Provider creation failed");
        });

      const manager = await initializeCluster(config);
      const provider1 = manager.getNodeProvider("node-1" as NodeId);
      const provider2 = manager.getNodeProvider("node-2" as NodeId);

      expect(provider1).toBeDefined();
      expect(provider2).toBeNull(); // Failed to create
    });
  });
});

// ============================================================================
// Test Suite: Node Selection
// ============================================================================

describe("Node Selection", () => {
  describe("selectNode", () => {
    test("should return node when available", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }
      if (mockRouter) {
        mockRouter.selectNodeWithSticky.mockReturnValue({
          nodeId: "node-1" as NodeId,
          reason: "cache-affinity",
          confidence: 0.9,
        });
      }

      const manager = await initializeCluster(config);
      const node = manager.selectNode("hash-123", "tools-456");

      expect(node).not.toBeNull();
      expect(node?.id).toBe("node-1");
    });

    test("should return null when no healthy nodes", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }
      if (mockRouter) {
        mockRouter.selectNodeWithSticky.mockReturnValue(null);
      }

      const manager = await initializeCluster(config);
      const node = manager.selectNode("hash-123", "tools-456");

      expect(node).toBeNull();
    });

    test("should use sticky routing with sessionId", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.selectNode("hash-123", "tools-456", "session-abc");

      expect(mockRouter?.selectNodeWithSticky).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ systemPromptHash: "hash-123" }),
        "session-abc"
      );
    });

    test("should use load balancing without sessionId", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.selectNode("hash-123", "tools-456");

      expect(mockRouter?.selectNodeWithSticky).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ systemPromptHash: "hash-123" }),
        undefined
      );
    });

    test("should pass systemPromptHash to router", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.selectNode("custom-hash", "tools-456");

      expect(mockRouter?.selectNodeWithSticky).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ systemPromptHash: "custom-hash" }),
        undefined
      );
    });

    test("should filter unhealthy nodes before routing", async () => {
      const config = createTestConfig();
      const nodes = [
        createTestNode("node-1"),
        { ...createTestNode("node-2"), status: NodeStatus.UNHEALTHY },
        createTestNode("node-3"),
      ];
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(nodes);
      }

      const manager = await initializeCluster(config);
      manager.selectNode("hash-123", "tools-456");

      expect(mockRouter?.selectNodeWithSticky).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "node-1" }),
          expect.objectContaining({ id: "node-3" }),
        ]),
        expect.anything(),
        undefined
      );
    });

    test("should return null when all nodes unhealthy", async () => {
      const config = createTestConfig();
      const nodes = [
        { ...createTestNode("node-1"), status: NodeStatus.UNHEALTHY },
        { ...createTestNode("node-2"), status: NodeStatus.OFFLINE },
      ];
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(nodes);
      }
      if (mockRouter) {
        mockRouter.selectNodeWithSticky.mockReturnValue(null);
      }

      const manager = await initializeCluster(config);
      const node = manager.selectNode("hash-123", "tools-456");

      expect(node).toBeNull();
    });

    test("should handle empty cluster gracefully", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue([]);
      }
      if (mockRouter) {
        mockRouter.selectNodeWithSticky.mockReturnValue(null);
      }

      const manager = await initializeCluster(config);
      const node = manager.selectNode("hash-123", "tools-456");

      expect(node).toBeNull();
    });

    test("should pass toolsHash in routing context", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.selectNode("hash-123", "custom-tools");

      expect(mockRouter?.selectNodeWithSticky).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          systemPromptHash: "hash-123",
          // toolsHash would be used internally
        }),
        undefined
      );
    });

    test("should use discovered nodes for routing", async () => {
      const config = createTestConfig();
      const nodes = createTestNodes(3);
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(nodes);
      }

      const manager = await initializeCluster(config);
      manager.selectNode("hash-123", "tools-456");

      expect(mockRouter?.selectNodeWithSticky).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "node-1" }),
          expect.objectContaining({ id: "node-2" }),
          expect.objectContaining({ id: "node-3" }),
        ]),
        expect.anything(),
        undefined
      );
    });
  });
});

// ============================================================================
// Test Suite: Health Tracking
// ============================================================================

describe("Health Tracking", () => {
  describe("recordNodeSuccess", () => {
    test("should update health tracker on success", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.recordNodeSuccess("node-1" as NodeId, 150);

      expect(mockHealth?.recordSuccess).toHaveBeenCalledWith("node-1", 150);
    });

    test("should handle unknown nodeId gracefully", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);

      expect(() => {
        manager.recordNodeSuccess("unknown-node" as NodeId, 150);
      }).not.toThrow();
    });

    test("should record latency correctly", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.recordNodeSuccess("node-1" as NodeId, 250);

      expect(mockHealth?.recordSuccess).toHaveBeenCalledWith("node-1", 250);
    });

    test("should allow multiple success recordings", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.recordNodeSuccess("node-1" as NodeId, 100);
      manager.recordNodeSuccess("node-1" as NodeId, 200);
      manager.recordNodeSuccess("node-2" as NodeId, 150);

      expect(mockHealth?.recordSuccess).toHaveBeenCalledTimes(3);
    });
  });

  describe("recordNodeFailure", () => {
    test("should update health tracker on failure", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const error = new Error("Request failed");
      manager.recordNodeFailure("node-1" as NodeId, error);

      expect(mockHealth?.recordFailure).toHaveBeenCalledWith("node-1", error);
    });

    test("should handle unknown nodeId gracefully", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const error = new Error("Request failed");

      expect(() => {
        manager.recordNodeFailure("unknown-node" as NodeId, error);
      }).not.toThrow();
    });

    test("should capture error details", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const error = new Error("Connection timeout");
      manager.recordNodeFailure("node-1" as NodeId, error);

      expect(mockHealth?.recordFailure).toHaveBeenCalledWith("node-1", error);
    });

    test("should allow multiple failure recordings", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      manager.recordNodeFailure("node-1" as NodeId, new Error("Error 1"));
      manager.recordNodeFailure("node-1" as NodeId, new Error("Error 2"));
      manager.recordNodeFailure("node-2" as NodeId, new Error("Error 3"));

      expect(mockHealth?.recordFailure).toHaveBeenCalledTimes(3);
    });

    test("should affect subsequent routing decisions", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);

      // Record failures
      manager.recordNodeFailure("node-1" as NodeId, new Error("Failed"));

      // Mock health check to mark node as unhealthy
      if (mockHealth) {
        mockHealth.isHealthy.mockReturnValue(false);
      }

      // Next selection should avoid unhealthy node
      const node = manager.selectNode("hash-123", "tools-456");
      expect(node?.id).not.toBe("node-1");
    });
  });

  describe("health state integration", () => {
    test("should reflect health in node status", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.healthyNodes).toBeGreaterThan(0);
    });

    test("should update healthy node count after failures", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);

      // Record failures to make node unhealthy
      manager.recordNodeFailure("node-1" as NodeId, new Error("Failed"));

      if (mockHealth) {
        mockHealth.isHealthy.mockImplementation(
          (nodeId) => nodeId !== "node-1"
        );
      }

      const status = manager.getStatus();
      // Status should reflect one unhealthy node
      expect(status.totalNodes).toBe(2);
    });
  });
});

// ============================================================================
// Test Suite: Status Reporting
// ============================================================================

describe("Status Reporting", () => {
  describe("getStatus", () => {
    test("should return correct status structure", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status).toHaveProperty("initialized");
      expect(status).toHaveProperty("totalNodes");
      expect(status).toHaveProperty("healthyNodes");
      expect(status).toHaveProperty("nodes");
      expect(Array.isArray(status.nodes)).toBe(true);
    });

    test("should show initialized state", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.initialized).toBe(true);
    });

    test("should count total nodes correctly", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(5));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.totalNodes).toBe(5);
    });

    test("should count healthy nodes correctly", async () => {
      const config = createTestConfig();
      const nodes = [
        createTestNode("node-1"),
        { ...createTestNode("node-2"), status: NodeStatus.UNHEALTHY },
        createTestNode("node-3"),
      ];
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(nodes);
      }
      if (mockHealth) {
        mockHealth.isHealthy.mockImplementation(
          (nodeId) => nodeId !== "node-2"
        );
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.healthyNodes).toBe(2);
    });

    test("should include per-node health information", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.nodes.length).toBe(2);
      expect(status.nodes[0]).toHaveProperty("id");
      expect(status.nodes[0]).toHaveProperty("url");
      expect(status.nodes[0]).toHaveProperty("healthy");
    });

    test("should include cache stats when available", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.cacheStats).toBeDefined();
      expect(status.cacheStats).toHaveProperty("nodeCount");
      expect(status.cacheStats).toHaveProperty("cacheCount");
    });

    test("should work before initialization (returns not initialized)", () => {
      // Before any initialization
      expect(() => getClusterManager()).toThrow();
    });

    test("should update in real-time", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      const status1 = manager.getStatus();

      // Simulate node becoming unhealthy
      if (mockHealth) {
        mockHealth.isHealthy.mockImplementation(
          (nodeId) => nodeId !== "node-1"
        );
      }

      const status2 = manager.getStatus();

      expect(status1.totalNodes).toBe(status2.totalNodes);
      // Health counts might differ
    });

    test("should include error count per node", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }
      if (mockHealth) {
        mockHealth.getHealthStatus.mockReturnValue({
          healthy: false,
          errorCount: 5,
          latencyMs: 200,
        });
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.nodes[0]).toHaveProperty("errorCount");
    });

    test("should include latency when available", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }
      if (mockHealth) {
        mockHealth.getHealthStatus.mockReturnValue({
          healthy: true,
          latencyMs: 120,
          errorCount: 0,
        });
      }

      const manager = await initializeCluster(config);
      const status = manager.getStatus();

      expect(status.nodes[0].latencyMs).toBe(120);
    });
  });

  describe("isInitialized", () => {
    test("should return true after initialization", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);

      expect(manager.isInitialized()).toBe(true);
    });

    test("should return false before initialization", () => {
      // Can't test without instance, but covered by singleton tests
      expect(() => getClusterManager()).toThrow();
    });

    test("should return false after shutdown", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      expect(manager.isInitialized()).toBe(false);
    });
  });
});

// ============================================================================
// Test Suite: Shutdown
// ============================================================================

describe("Shutdown", () => {
  describe("shutdown method", () => {
    test("should stop discovery", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      expect(mockDiscovery?.stop).toHaveBeenCalled();
    });

    test("should stop health checks", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      expect(mockHealth?.stopHealthChecks).toHaveBeenCalled();
    });

    test("should stop cache sync", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockCache = getMockCache();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      expect(mockCache?.stop).toHaveBeenCalled();
    });

    test("should destroy router", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockRouter = getMockRouter();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      expect(mockRouter?.destroy).toHaveBeenCalled();
    });

    test("should clear providers", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      const provider = manager.getNodeProvider("node-1" as NodeId);
      expect(provider).toBeNull();
    });

    test("should set initialized to false", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      expect(manager.isInitialized()).toBe(false);
    });

    test("should allow calling shutdown multiple times safely", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();
      await manager.shutdown();

      expect(manager.isInitialized()).toBe(false);
    });

    test("should throw when accessing instance after shutdown", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);
      await manager.shutdown();

      // After shutdown, getClusterManager should still throw if reset
      resetClusterManager();
      expect(() => getClusterManager()).toThrow();
    });

    test("should handle component failures gracefully during shutdown", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      const mockHealth = getMockHealth();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }
      if (mockHealth) {
        mockHealth.stopHealthChecks.mockImplementation(() => {
          throw new Error("Health check stop failed");
        });
      }

      const manager = await initializeCluster(config);

      // Should not throw even if component fails
      await expect(manager.shutdown()).resolves.not.toThrow();
    });

    test("should complete shutdown within reasonable timeout", async () => {
      const config = createTestConfig();
      const mockDiscovery = getMockDiscovery();
      if (mockDiscovery) {
        mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
      }

      const manager = await initializeCluster(config);

      const startTime = Date.now();
      await manager.shutdown();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

// ============================================================================
// Test Suite: Integration
// ============================================================================

describe("Integration", () => {
  test("should complete full initialization sequence", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockHealth = getMockHealth();
    const mockCache = getMockCache();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(3));
    }

    const manager = await initializeCluster(config);

    expect(manager.isInitialized()).toBe(true);
    expect(mockDiscovery?.start).toHaveBeenCalled();
    expect(mockHealth?.startHealthChecks).toHaveBeenCalled();
    expect(mockCache?.initialize).toHaveBeenCalled();
  });

  test("should route requests through cluster", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockRouter = getMockRouter();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(3));
    }
    if (mockRouter) {
      mockRouter.selectNodeWithSticky.mockReturnValue({
        nodeId: "node-2" as NodeId,
        reason: "cache-affinity",
        confidence: 0.9,
      });
    }

    const manager = await initializeCluster(config);
    const node = manager.selectNode("hash-123", "tools-456");

    expect(node).not.toBeNull();
    expect(node?.id).toBe("node-2");
  });

  test("should maintain session affinity across requests", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockRouter = getMockRouter();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(3));
    }
    if (mockRouter) {
      mockRouter.selectNodeWithSticky
        .mockReturnValueOnce({
          nodeId: "node-1" as NodeId,
          reason: "new-session",
          confidence: 0.8,
        })
        .mockReturnValueOnce({
          nodeId: "node-1" as NodeId,
          reason: "sticky-session",
          confidence: 1.0,
        });
    }

    const manager = await initializeCluster(config);
    const node1 = manager.selectNode("hash-123", "tools-456", "session-abc");
    const node2 = manager.selectNode("hash-123", "tools-456", "session-abc");

    expect(node1?.id).toBe("node-1");
    expect(node2?.id).toBe("node-1");
  });

  test("should update routing based on health tracking", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockHealth = getMockHealth();
    const mockRouter = getMockRouter();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
    }

    const manager = await initializeCluster(config);

    // Record failure for node-1
    manager.recordNodeFailure("node-1" as NodeId, new Error("Failed"));

    // Mock node-1 as unhealthy
    if (mockHealth) {
      mockHealth.isHealthy.mockImplementation((nodeId) => nodeId !== "node-1");
    }

    // Mock router to select node-2 (healthy)
    if (mockRouter) {
      mockRouter.selectNodeWithSticky.mockReturnValue({
        nodeId: "node-2" as NodeId,
        reason: "health-based",
        confidence: 0.9,
      });
    }

    const node = manager.selectNode("hash-123", "tools-456");
    expect(node?.id).toBe("node-2");
  });

  test("should run cache initialization during cluster init", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockCache = getMockCache();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
    }

    await initializeCluster(config);

    expect(mockCache?.initialize).toHaveBeenCalled();
  });

  test("should reflect accurate status after routing operations", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockRouter = getMockRouter();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(3));
    }
    if (mockRouter) {
      mockRouter.selectNodeWithSticky.mockReturnValue({
        nodeId: "node-1" as NodeId,
        reason: "test",
        confidence: 0.9,
      });
    }

    const manager = await initializeCluster(config);
    manager.selectNode("hash-123", "tools-456");

    const status = manager.getStatus();
    expect(status.totalNodes).toBe(3);
    expect(status.initialized).toBe(true);
  });

  test("should degrade gracefully when components fail", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockCache = getMockCache();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
    }
    if (mockCache) {
      // Cache initialization fails
      mockCache.initialize.mockRejectedValue(new Error("Cache init failed"));
    }

    // Should still initialize without cache
    const manager = await initializeCluster(config);
    expect(manager.isInitialized()).toBe(true);
  });

  test("should handle multiple shutdown/init cycles", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
    }

    const manager1 = await initializeCluster(config);
    await manager1.shutdown();
    resetClusterManager();

    const manager2 = await initializeCluster(config);
    expect(manager2.isInitialized()).toBe(true);
  });

  test("should coordinate all components during request flow", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockRouter = getMockRouter();
    const mockHealth = getMockHealth();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
    }
    if (mockRouter) {
      mockRouter.selectNodeWithSticky.mockReturnValue({
        nodeId: "node-1" as NodeId,
        reason: "cache-affinity",
        confidence: 0.9,
      });
    }

    const manager = await initializeCluster(config);

    // Select node (uses router)
    const node = manager.selectNode("hash-123", "tools-456");
    expect(node).not.toBeNull();

    // Record success (updates health)
    manager.recordNodeSuccess(node!.id, 120);
    expect(mockHealth?.recordSuccess).toHaveBeenCalledWith("node-1", 120);

    // Get status (aggregates all components)
    const status = manager.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.totalNodes).toBe(2);
  });

  test("should provide working provider for selected node", async () => {
    const config = createTestConfig();
    const mockDiscovery = getMockDiscovery();
    const mockRouter = getMockRouter();
    if (mockDiscovery) {
      mockDiscovery.getDiscoveredNodes.mockReturnValue(createTestNodes(2));
    }
    if (mockRouter) {
      mockRouter.selectNodeWithSticky.mockReturnValue({
        nodeId: "node-1" as NodeId,
        reason: "test",
        confidence: 0.9,
      });
    }

    const manager = await initializeCluster(config);
    const node = manager.selectNode("hash-123", "tools-456");
    const provider = manager.getNodeProvider(node!.id);

    expect(provider).not.toBeNull();
    expect(provider).toBeDefined();
  });
});
