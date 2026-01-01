/**
 * Unit tests for cluster-types.ts
 *
 * Tests the TypeScript interfaces and types for MLX cluster management:
 * 1. NodeStatus enum - States a node can be in
 * 2. LoadBalanceStrategy enum - Routing strategies
 * 3. ClusterStatus enum - Overall cluster health states
 * 4. NodeId type alias - String identifier for nodes
 * 5. NodeHealth interface - Health check data
 * 6. NodeCacheState interface - KV cache tracking
 * 7. NodeMetrics interface - Performance metrics
 * 8. MLXNode interface - Complete node representation
 * 9. HealthConfig interface - Health check configuration
 * 10. CacheConfig interface - Cache management config
 * 11. DiscoveryConfig interface - Node discovery settings
 * 12. RoutingConfig interface - Load balancing config
 * 13. MLXClusterConfig interface - Cluster configuration
 * 14. RoutingDecision interface - Routing algorithm output
 * 15. RoutingContext interface - Routing input data
 * 16. ClusterMetrics interface - Aggregate cluster metrics
 * 17. ClusterState interface - Complete cluster state
 *
 * Test categories:
 * - Enum value tests (verify string values are correct)
 * - Interface instantiation tests (create valid objects)
 * - Optional field tests (verify optionals work correctly)
 * - Type compatibility tests (Partial<T>, Required<T> patterns)
 * - Integration tests (types work together correctly)
 * - Edge cases (empty arrays, undefined optionals, etc.)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  NodeId,
  NodeStatus,
  LoadBalanceStrategy,
  ClusterStatus,
  NodeHealth,
  NodeCacheState,
  NodeMetrics,
  MLXNode,
  HealthConfig,
  CacheConfig,
  DiscoveryConfig,
  RoutingConfig,
  MLXClusterConfig,
  RoutingDecision,
  RoutingContext,
  ClusterMetrics,
  ClusterState,
} from "../../src/cluster/cluster-types";

// ============================================================================
// ENUM TESTS - Verify enum string values
// ============================================================================

describe("NodeStatus Enum", () => {
  test("should have INITIALIZING status", () => {
    expect(NodeStatus.INITIALIZING).toBe("initializing");
  });

  test("should have HEALTHY status", () => {
    expect(NodeStatus.HEALTHY).toBe("healthy");
  });

  test("should have DEGRADED status", () => {
    expect(NodeStatus.DEGRADED).toBe("degraded");
  });

  test("should have UNHEALTHY status", () => {
    expect(NodeStatus.UNHEALTHY).toBe("unhealthy");
  });

  test("should have OFFLINE status", () => {
    expect(NodeStatus.OFFLINE).toBe("offline");
  });

  test("should have exactly 5 status values", () => {
    const values = Object.values(NodeStatus);
    expect(values).toHaveLength(5);
  });
});

describe("LoadBalanceStrategy Enum", () => {
  test("should have ROUND_ROBIN strategy", () => {
    expect(LoadBalanceStrategy.ROUND_ROBIN).toBe("round-robin");
  });

  test("should have LEAST_LOADED strategy", () => {
    expect(LoadBalanceStrategy.LEAST_LOADED).toBe("least-loaded");
  });

  test("should have CACHE_AWARE strategy", () => {
    expect(LoadBalanceStrategy.CACHE_AWARE).toBe("cache-aware");
  });

  test("should have LATENCY_BASED strategy", () => {
    expect(LoadBalanceStrategy.LATENCY_BASED).toBe("latency-based");
  });

  test("should have exactly 4 strategy values", () => {
    const values = Object.values(LoadBalanceStrategy);
    expect(values).toHaveLength(4);
  });
});

describe("ClusterStatus Enum", () => {
  test("should have STARTING status", () => {
    expect(ClusterStatus.STARTING).toBe("starting");
  });

  test("should have HEALTHY status", () => {
    expect(ClusterStatus.HEALTHY).toBe("healthy");
  });

  test("should have DEGRADED status", () => {
    expect(ClusterStatus.DEGRADED).toBe("degraded");
  });

  test("should have CRITICAL status", () => {
    expect(ClusterStatus.CRITICAL).toBe("critical");
  });

  test("should have OFFLINE status", () => {
    expect(ClusterStatus.OFFLINE).toBe("offline");
  });

  test("should have exactly 5 status values", () => {
    const values = Object.values(ClusterStatus);
    expect(values).toHaveLength(5);
  });
});

// ============================================================================
// TYPE ALIAS TESTS - NodeId
// ============================================================================

describe("NodeId Type", () => {
  test("should accept string values", () => {
    const nodeId: NodeId = "node-1";
    expect(typeof nodeId).toBe("string");
  });

  test("should accept UUID-style strings", () => {
    const nodeId: NodeId = "550e8400-e29b-41d4-a716-446655440000";
    expect(nodeId).toMatch(/^[0-9a-f-]+$/i);
  });

  test("should accept descriptive node names", () => {
    const nodeId: NodeId = "mlx-worker-prod-01";
    expect(nodeId).toContain("mlx-worker");
  });
});

// ============================================================================
// INTERFACE TESTS - NodeHealth
// ============================================================================

describe("NodeHealth Interface", () => {
  test("should create valid NodeHealth object with all fields", () => {
    const health: NodeHealth = {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      avgResponseTime: 150,
      errorRate: 0.01,
    };

    expect(health.lastCheck).toBeGreaterThan(0);
    expect(health.consecutiveFailures).toBe(0);
    expect(health.avgResponseTime).toBe(150);
    expect(health.errorRate).toBe(0.01);
  });

  test("should allow high consecutive failures", () => {
    const health: NodeHealth = {
      lastCheck: Date.now(),
      consecutiveFailures: 5,
      avgResponseTime: 500,
      errorRate: 0.5,
    };

    expect(health.consecutiveFailures).toBe(5);
  });

  test("should handle zero response time", () => {
    const health: NodeHealth = {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      avgResponseTime: 0,
      errorRate: 0,
    };

    expect(health.avgResponseTime).toBe(0);
  });

  test("should handle 100% error rate", () => {
    const health: NodeHealth = {
      lastCheck: Date.now(),
      consecutiveFailures: 10,
      avgResponseTime: 1000,
      errorRate: 1.0,
    };

    expect(health.errorRate).toBe(1.0);
  });
});

// ============================================================================
// INTERFACE TESTS - NodeCacheState
// ============================================================================

describe("NodeCacheState Interface", () => {
  test("should create valid NodeCacheState with all fields", () => {
    const cacheState: NodeCacheState = {
      tokens: 2048,
      systemPromptHash: "sha256:abc123",
      lastUpdated: Date.now(),
    };

    expect(cacheState.tokens).toBe(2048);
    expect(cacheState.systemPromptHash).toBe("sha256:abc123");
    expect(cacheState.lastUpdated).toBeGreaterThan(0);
  });

  test("should handle empty cache (0 tokens)", () => {
    const cacheState: NodeCacheState = {
      tokens: 0,
      systemPromptHash: "",
      lastUpdated: Date.now(),
    };

    expect(cacheState.tokens).toBe(0);
    expect(cacheState.systemPromptHash).toBe("");
  });

  test("should handle large cache sizes", () => {
    const cacheState: NodeCacheState = {
      tokens: 128000,
      systemPromptHash: "sha256:" + "a".repeat(64),
      lastUpdated: Date.now(),
    };

    expect(cacheState.tokens).toBe(128000);
    expect(cacheState.systemPromptHash).toHaveLength(71); // 'sha256:' + 64 chars
  });

  test("should accept different hash formats", () => {
    const cacheState: NodeCacheState = {
      tokens: 4096,
      systemPromptHash: "md5:5d41402abc4b2a76b9719d911017c592",
      lastUpdated: Date.now(),
    };

    expect(cacheState.systemPromptHash).toContain("md5:");
  });
});

// ============================================================================
// INTERFACE TESTS - NodeMetrics
// ============================================================================

describe("NodeMetrics Interface", () => {
  test("should create valid NodeMetrics with all required fields", () => {
    const metrics: NodeMetrics = {
      requestsInFlight: 2,
      totalRequests: 100,
      cacheHitRate: 0.75,
      avgLatency: 200,
    };

    expect(metrics.requestsInFlight).toBe(2);
    expect(metrics.totalRequests).toBe(100);
    expect(metrics.cacheHitRate).toBe(0.75);
    expect(metrics.avgLatency).toBe(200);
  });

  test("should handle zero requests in flight", () => {
    const metrics: NodeMetrics = {
      requestsInFlight: 0,
      totalRequests: 1000,
      cacheHitRate: 0.9,
      avgLatency: 150,
    };

    expect(metrics.requestsInFlight).toBe(0);
  });

  test("should handle 100% cache hit rate", () => {
    const metrics: NodeMetrics = {
      requestsInFlight: 5,
      totalRequests: 500,
      cacheHitRate: 1.0,
      avgLatency: 50,
    };

    expect(metrics.cacheHitRate).toBe(1.0);
  });

  test("should handle 0% cache hit rate", () => {
    const metrics: NodeMetrics = {
      requestsInFlight: 3,
      totalRequests: 50,
      cacheHitRate: 0.0,
      avgLatency: 300,
    };

    expect(metrics.cacheHitRate).toBe(0.0);
  });

  test("should handle high load scenarios", () => {
    const metrics: NodeMetrics = {
      requestsInFlight: 100,
      totalRequests: 10000,
      cacheHitRate: 0.5,
      avgLatency: 1000,
    };

    expect(metrics.requestsInFlight).toBe(100);
    expect(metrics.avgLatency).toBe(1000);
  });
});

// ============================================================================
// INTERFACE TESTS - MLXNode (Complex Integration)
// ============================================================================

describe("MLXNode Interface", () => {
  test("should create valid MLXNode with all required fields", () => {
    const node: MLXNode = {
      id: "node-1",
      url: "http://localhost:8080",
      status: NodeStatus.HEALTHY,
      health: {
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        avgResponseTime: 150,
        errorRate: 0.01,
      },
      cache: {
        tokens: 2048,
        systemPromptHash: "sha256:abc123",
        lastUpdated: Date.now(),
      },
      metrics: {
        requestsInFlight: 2,
        totalRequests: 100,
        cacheHitRate: 0.75,
        avgLatency: 200,
      },
    };

    expect(node.id).toBe("node-1");
    expect(node.url).toBe("http://localhost:8080");
    expect(node.status).toBe(NodeStatus.HEALTHY);
    expect(node.health).toBeDefined();
    expect(node.cache).toBeDefined();
    expect(node.metrics).toBeDefined();
  });

  test("should create node with INITIALIZING status", () => {
    const node: MLXNode = {
      id: "node-2",
      url: "http://localhost:8081",
      status: NodeStatus.INITIALIZING,
      health: {
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        avgResponseTime: 0,
        errorRate: 0,
      },
      cache: {
        tokens: 0,
        systemPromptHash: "",
        lastUpdated: Date.now(),
      },
      metrics: {
        requestsInFlight: 0,
        totalRequests: 0,
        cacheHitRate: 0,
        avgLatency: 0,
      },
    };

    expect(node.status).toBe(NodeStatus.INITIALIZING);
    expect(node.metrics.totalRequests).toBe(0);
  });

  test("should create node with UNHEALTHY status", () => {
    const node: MLXNode = {
      id: "node-3",
      url: "http://localhost:8082",
      status: NodeStatus.UNHEALTHY,
      health: {
        lastCheck: Date.now(),
        consecutiveFailures: 5,
        avgResponseTime: 1000,
        errorRate: 0.8,
      },
      cache: {
        tokens: 1024,
        systemPromptHash: "sha256:old",
        lastUpdated: Date.now() - 60000,
      },
      metrics: {
        requestsInFlight: 10,
        totalRequests: 200,
        cacheHitRate: 0.2,
        avgLatency: 2000,
      },
    };

    expect(node.status).toBe(NodeStatus.UNHEALTHY);
    expect(node.health.consecutiveFailures).toBe(5);
  });

  test("should handle different URL formats", () => {
    const node: MLXNode = {
      id: "node-4",
      url: "https://mlx-worker-01.example.com:443/v1",
      status: NodeStatus.HEALTHY,
      health: {
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        avgResponseTime: 100,
        errorRate: 0,
      },
      cache: {
        tokens: 4096,
        systemPromptHash: "sha256:xyz789",
        lastUpdated: Date.now(),
      },
      metrics: {
        requestsInFlight: 1,
        totalRequests: 50,
        cacheHitRate: 0.95,
        avgLatency: 120,
      },
    };

    expect(node.url).toContain("https://");
    expect(node.url).toContain(":443");
  });
});

// ============================================================================
// INTERFACE TESTS - HealthConfig
// ============================================================================

describe("HealthConfig Interface", () => {
  test("should create valid HealthConfig with all fields", () => {
    const config: HealthConfig = {
      checkIntervalMs: 5000,
      timeoutMs: 2000,
      maxConsecutiveFailures: 3,
      unhealthyThreshold: 0.5,
    };

    expect(config.checkIntervalMs).toBe(5000);
    expect(config.timeoutMs).toBe(2000);
    expect(config.maxConsecutiveFailures).toBe(3);
    expect(config.unhealthyThreshold).toBe(0.5);
  });

  test("should handle aggressive health checking", () => {
    const config: HealthConfig = {
      checkIntervalMs: 1000,
      timeoutMs: 500,
      maxConsecutiveFailures: 1,
      unhealthyThreshold: 0.1,
    };

    expect(config.checkIntervalMs).toBe(1000);
    expect(config.maxConsecutiveFailures).toBe(1);
  });

  test("should handle lenient health checking", () => {
    const config: HealthConfig = {
      checkIntervalMs: 30000,
      timeoutMs: 10000,
      maxConsecutiveFailures: 10,
      unhealthyThreshold: 0.9,
    };

    expect(config.checkIntervalMs).toBe(30000);
    expect(config.maxConsecutiveFailures).toBe(10);
  });
});

// ============================================================================
// INTERFACE TESTS - CacheConfig
// ============================================================================

describe("CacheConfig Interface", () => {
  test("should create valid CacheConfig with all fields", () => {
    const config: CacheConfig = {
      maxCacheAgeSec: 3600,
      minCacheHitRate: 0.5,
      maxCacheSizeTokens: 128000,
    };

    expect(config.maxCacheAgeSec).toBe(3600);
    expect(config.minCacheHitRate).toBe(0.5);
    expect(config.maxCacheSizeTokens).toBe(128000);
  });

  test("should handle small cache configuration", () => {
    const config: CacheConfig = {
      maxCacheAgeSec: 60,
      minCacheHitRate: 0.1,
      maxCacheSizeTokens: 2048,
    };

    expect(config.maxCacheAgeSec).toBe(60);
    expect(config.maxCacheSizeTokens).toBe(2048);
  });

  test("should handle large cache configuration", () => {
    const config: CacheConfig = {
      maxCacheAgeSec: 86400,
      minCacheHitRate: 0.95,
      maxCacheSizeTokens: 1000000,
    };

    expect(config.maxCacheAgeSec).toBe(86400);
    expect(config.maxCacheSizeTokens).toBe(1000000);
  });
});

// ============================================================================
// INTERFACE TESTS - DiscoveryConfig
// ============================================================================

describe("DiscoveryConfig Interface", () => {
  test("should create valid DiscoveryConfig with static nodes", () => {
    const config: DiscoveryConfig = {
      mode: "static" as const,
      nodes: [
        { url: "http://localhost:8080", id: "node-1" },
        { url: "http://localhost:8081", id: "node-2" },
      ],
    };

    expect(config.mode).toBe("static");
    expect(config.nodes).toHaveLength(2);
    expect(config.nodes![0].url).toBe("http://localhost:8080");
  });

  test("should create DiscoveryConfig with empty nodes array", () => {
    const config: DiscoveryConfig = {
      mode: "static" as const,
      nodes: [],
    };

    expect(config.nodes).toHaveLength(0);
  });

  test("should create DiscoveryConfig with DNS mode", () => {
    const config: DiscoveryConfig = {
      mode: "dns" as const,
      dnsName: "mlx-cluster.local",
      port: 8080,
    };

    expect(config.mode).toBe("dns");
    expect(config.dnsName).toBe("mlx-cluster.local");
    expect(config.port).toBe(8080);
  });

  test("should create DiscoveryConfig with Kubernetes mode", () => {
    const config: DiscoveryConfig = {
      mode: "kubernetes" as const,
      namespace: "mlx-production",
      serviceLabel: "app=mlx-worker",
    };

    expect(config.mode).toBe("kubernetes");
    expect(config.namespace).toBe("mlx-production");
    expect(config.serviceLabel).toBe("app=mlx-worker");
  });

  test("should allow optional fields to be undefined", () => {
    const config: DiscoveryConfig = {
      mode: "static" as const,
    };

    expect(config.mode).toBe("static");
    expect(config.nodes).toBeUndefined();
  });
});

// ============================================================================
// INTERFACE TESTS - RoutingConfig
// ============================================================================

describe("RoutingConfig Interface", () => {
  test("should create valid RoutingConfig with default strategy", () => {
    const config: RoutingConfig = {
      strategy: LoadBalanceStrategy.ROUND_ROBIN,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    expect(config.strategy).toBe(LoadBalanceStrategy.ROUND_ROBIN);
    expect(config.maxRetries).toBe(3);
    expect(config.retryDelayMs).toBe(1000);
  });

  test("should support LEAST_LOADED strategy", () => {
    const config: RoutingConfig = {
      strategy: LoadBalanceStrategy.LEAST_LOADED,
      maxRetries: 2,
      retryDelayMs: 500,
    };

    expect(config.strategy).toBe(LoadBalanceStrategy.LEAST_LOADED);
  });

  test("should support CACHE_AWARE strategy", () => {
    const config: RoutingConfig = {
      strategy: LoadBalanceStrategy.CACHE_AWARE,
      maxRetries: 1,
      retryDelayMs: 100,
    };

    expect(config.strategy).toBe(LoadBalanceStrategy.CACHE_AWARE);
  });

  test("should support LATENCY_BASED strategy", () => {
    const config: RoutingConfig = {
      strategy: LoadBalanceStrategy.LATENCY_BASED,
      maxRetries: 5,
      retryDelayMs: 2000,
    };

    expect(config.strategy).toBe(LoadBalanceStrategy.LATENCY_BASED);
  });

  test("should handle zero retries configuration", () => {
    const config: RoutingConfig = {
      strategy: LoadBalanceStrategy.ROUND_ROBIN,
      maxRetries: 0,
      retryDelayMs: 0,
    };

    expect(config.maxRetries).toBe(0);
    expect(config.retryDelayMs).toBe(0);
  });
});

// ============================================================================
// INTERFACE TESTS - MLXClusterConfig (Integration)
// ============================================================================

describe("MLXClusterConfig Interface", () => {
  test("should create valid cluster config with all sections", () => {
    const config: MLXClusterConfig = {
      discovery: {
        mode: "static" as const,
        nodes: [{ url: "http://localhost:8080", id: "node-1" }],
      },
      health: {
        checkIntervalMs: 5000,
        timeoutMs: 2000,
        maxConsecutiveFailures: 3,
        unhealthyThreshold: 0.5,
      },
      cache: {
        maxCacheAgeSec: 3600,
        minCacheHitRate: 0.5,
        maxCacheSizeTokens: 128000,
      },
      routing: {
        strategy: LoadBalanceStrategy.CACHE_AWARE,
        maxRetries: 3,
        retryDelayMs: 1000,
      },
    };

    expect(config.discovery.mode).toBe("static");
    expect(config.health.checkIntervalMs).toBe(5000);
    expect(config.cache.maxCacheAgeSec).toBe(3600);
    expect(config.routing.strategy).toBe(LoadBalanceStrategy.CACHE_AWARE);
  });

  test("should create production-ready cluster config", () => {
    const config: MLXClusterConfig = {
      discovery: {
        mode: "kubernetes" as const,
        namespace: "production",
        serviceLabel: "app=mlx-worker",
      },
      health: {
        checkIntervalMs: 10000,
        timeoutMs: 5000,
        maxConsecutiveFailures: 2,
        unhealthyThreshold: 0.3,
      },
      cache: {
        maxCacheAgeSec: 7200,
        minCacheHitRate: 0.8,
        maxCacheSizeTokens: 256000,
      },
      routing: {
        strategy: LoadBalanceStrategy.LATENCY_BASED,
        maxRetries: 2,
        retryDelayMs: 500,
      },
    };

    expect(config.discovery.mode).toBe("kubernetes");
    expect(config.health.maxConsecutiveFailures).toBe(2);
    expect(config.cache.minCacheHitRate).toBe(0.8);
  });

  test("should create development cluster config", () => {
    const config: MLXClusterConfig = {
      discovery: {
        mode: "static" as const,
        nodes: [{ url: "http://localhost:8080", id: "dev-node" }],
      },
      health: {
        checkIntervalMs: 30000,
        timeoutMs: 10000,
        maxConsecutiveFailures: 5,
        unhealthyThreshold: 0.7,
      },
      cache: {
        maxCacheAgeSec: 1800,
        minCacheHitRate: 0.3,
        maxCacheSizeTokens: 64000,
      },
      routing: {
        strategy: LoadBalanceStrategy.ROUND_ROBIN,
        maxRetries: 1,
        retryDelayMs: 2000,
      },
    };

    expect(config.discovery.nodes).toHaveLength(1);
    expect(config.routing.strategy).toBe(LoadBalanceStrategy.ROUND_ROBIN);
  });
});

// ============================================================================
// INTERFACE TESTS - RoutingDecision
// ============================================================================

describe("RoutingDecision Interface", () => {
  test("should create valid routing decision with selected node", () => {
    const decision: RoutingDecision = {
      nodeId: "node-1",
      reason: "cache-hit",
      confidence: 0.95,
    };

    expect(decision.nodeId).toBe("node-1");
    expect(decision.reason).toBe("cache-hit");
    expect(decision.confidence).toBe(0.95);
  });

  test("should handle low confidence decisions", () => {
    const decision: RoutingDecision = {
      nodeId: "node-2",
      reason: "fallback-available",
      confidence: 0.2,
    };

    expect(decision.confidence).toBe(0.2);
  });

  test("should handle perfect confidence", () => {
    const decision: RoutingDecision = {
      nodeId: "node-3",
      reason: "exact-cache-match",
      confidence: 1.0,
    };

    expect(decision.confidence).toBe(1.0);
  });

  test("should allow descriptive reasons", () => {
    const decision: RoutingDecision = {
      nodeId: "node-4",
      reason: "lowest-latency-and-cache-hit",
      confidence: 0.85,
    };

    expect(decision.reason).toContain("latency");
    expect(decision.reason).toContain("cache-hit");
  });
});

// ============================================================================
// INTERFACE TESTS - RoutingContext
// ============================================================================

describe("RoutingContext Interface", () => {
  test("should create valid routing context with all fields", () => {
    const context: RoutingContext = {
      systemPromptHash: "sha256:abc123",
      estimatedTokens: 2048,
      userPriority: "normal" as const,
    };

    expect(context.systemPromptHash).toBe("sha256:abc123");
    expect(context.estimatedTokens).toBe(2048);
    expect(context.userPriority).toBe("normal");
  });

  test("should support high priority requests", () => {
    const context: RoutingContext = {
      systemPromptHash: "sha256:urgent",
      estimatedTokens: 512,
      userPriority: "high" as const,
    };

    expect(context.userPriority).toBe("high");
  });

  test("should support low priority requests", () => {
    const context: RoutingContext = {
      systemPromptHash: "sha256:batch",
      estimatedTokens: 8192,
      userPriority: "low" as const,
    };

    expect(context.userPriority).toBe("low");
    expect(context.estimatedTokens).toBe(8192);
  });

  test("should handle small token estimates", () => {
    const context: RoutingContext = {
      systemPromptHash: "sha256:small",
      estimatedTokens: 10,
      userPriority: "normal" as const,
    };

    expect(context.estimatedTokens).toBe(10);
  });

  test("should handle large token estimates", () => {
    const context: RoutingContext = {
      systemPromptHash: "sha256:large",
      estimatedTokens: 100000,
      userPriority: "normal" as const,
    };

    expect(context.estimatedTokens).toBe(100000);
  });
});

// ============================================================================
// INTERFACE TESTS - ClusterMetrics (Aggregated)
// ============================================================================

describe("ClusterMetrics Interface", () => {
  test("should create valid cluster metrics with all fields", () => {
    const metrics: ClusterMetrics = {
      totalNodes: 3,
      healthyNodes: 2,
      totalRequests: 1000,
      avgClusterLatency: 180,
      overallCacheHitRate: 0.75,
    };

    expect(metrics.totalNodes).toBe(3);
    expect(metrics.healthyNodes).toBe(2);
    expect(metrics.totalRequests).toBe(1000);
    expect(metrics.avgClusterLatency).toBe(180);
    expect(metrics.overallCacheHitRate).toBe(0.75);
  });

  test("should handle fully healthy cluster", () => {
    const metrics: ClusterMetrics = {
      totalNodes: 5,
      healthyNodes: 5,
      totalRequests: 5000,
      avgClusterLatency: 120,
      overallCacheHitRate: 0.95,
    };

    expect(metrics.healthyNodes).toBe(metrics.totalNodes);
    expect(metrics.overallCacheHitRate).toBe(0.95);
  });

  test("should handle fully degraded cluster", () => {
    const metrics: ClusterMetrics = {
      totalNodes: 4,
      healthyNodes: 0,
      totalRequests: 100,
      avgClusterLatency: 5000,
      overallCacheHitRate: 0.1,
    };

    expect(metrics.healthyNodes).toBe(0);
    expect(metrics.avgClusterLatency).toBe(5000);
  });

  test("should handle new cluster with no requests", () => {
    const metrics: ClusterMetrics = {
      totalNodes: 2,
      healthyNodes: 2,
      totalRequests: 0,
      avgClusterLatency: 0,
      overallCacheHitRate: 0,
    };

    expect(metrics.totalRequests).toBe(0);
    expect(metrics.avgClusterLatency).toBe(0);
  });

  test("should calculate partial health correctly", () => {
    const metrics: ClusterMetrics = {
      totalNodes: 10,
      healthyNodes: 7,
      totalRequests: 10000,
      avgClusterLatency: 250,
      overallCacheHitRate: 0.6,
    };

    const healthPercentage = (metrics.healthyNodes / metrics.totalNodes) * 100;
    expect(healthPercentage).toBe(70);
  });
});

// ============================================================================
// INTERFACE TESTS - ClusterState (Complete State)
// ============================================================================

describe("ClusterState Interface", () => {
  test("should create valid cluster state with all components", () => {
    const state: ClusterState = {
      status: ClusterStatus.HEALTHY,
      nodes: [
        {
          id: "node-1",
          url: "http://localhost:8080",
          status: NodeStatus.HEALTHY,
          health: {
            lastCheck: Date.now(),
            consecutiveFailures: 0,
            avgResponseTime: 150,
            errorRate: 0.01,
          },
          cache: {
            tokens: 2048,
            systemPromptHash: "sha256:abc123",
            lastUpdated: Date.now(),
          },
          metrics: {
            requestsInFlight: 2,
            totalRequests: 100,
            cacheHitRate: 0.75,
            avgLatency: 200,
          },
        },
      ],
      metrics: {
        totalNodes: 1,
        healthyNodes: 1,
        totalRequests: 100,
        avgClusterLatency: 200,
        overallCacheHitRate: 0.75,
      },
      lastUpdated: Date.now(),
    };

    expect(state.status).toBe(ClusterStatus.HEALTHY);
    expect(state.nodes).toHaveLength(1);
    expect(state.metrics.totalNodes).toBe(1);
    expect(state.lastUpdated).toBeGreaterThan(0);
  });

  test("should represent degraded cluster state", () => {
    const state: ClusterState = {
      status: ClusterStatus.DEGRADED,
      nodes: [
        {
          id: "node-1",
          url: "http://localhost:8080",
          status: NodeStatus.HEALTHY,
          health: {
            lastCheck: Date.now(),
            consecutiveFailures: 0,
            avgResponseTime: 150,
            errorRate: 0.01,
          },
          cache: {
            tokens: 2048,
            systemPromptHash: "sha256:abc123",
            lastUpdated: Date.now(),
          },
          metrics: {
            requestsInFlight: 2,
            totalRequests: 100,
            cacheHitRate: 0.75,
            avgLatency: 200,
          },
        },
        {
          id: "node-2",
          url: "http://localhost:8081",
          status: NodeStatus.UNHEALTHY,
          health: {
            lastCheck: Date.now(),
            consecutiveFailures: 3,
            avgResponseTime: 1000,
            errorRate: 0.6,
          },
          cache: {
            tokens: 0,
            systemPromptHash: "",
            lastUpdated: Date.now() - 60000,
          },
          metrics: {
            requestsInFlight: 10,
            totalRequests: 50,
            cacheHitRate: 0.2,
            avgLatency: 1500,
          },
        },
      ],
      metrics: {
        totalNodes: 2,
        healthyNodes: 1,
        totalRequests: 150,
        avgClusterLatency: 850,
        overallCacheHitRate: 0.475,
      },
      lastUpdated: Date.now(),
    };

    expect(state.status).toBe(ClusterStatus.DEGRADED);
    expect(state.nodes).toHaveLength(2);
    expect(state.metrics.healthyNodes).toBe(1);
  });

  test("should represent starting cluster state", () => {
    const state: ClusterState = {
      status: ClusterStatus.STARTING,
      nodes: [],
      metrics: {
        totalNodes: 0,
        healthyNodes: 0,
        totalRequests: 0,
        avgClusterLatency: 0,
        overallCacheHitRate: 0,
      },
      lastUpdated: Date.now(),
    };

    expect(state.status).toBe(ClusterStatus.STARTING);
    expect(state.nodes).toHaveLength(0);
  });

  test("should represent offline cluster state", () => {
    const state: ClusterState = {
      status: ClusterStatus.OFFLINE,
      nodes: [
        {
          id: "node-1",
          url: "http://localhost:8080",
          status: NodeStatus.OFFLINE,
          health: {
            lastCheck: Date.now() - 300000,
            consecutiveFailures: 10,
            avgResponseTime: 0,
            errorRate: 1.0,
          },
          cache: {
            tokens: 0,
            systemPromptHash: "",
            lastUpdated: Date.now() - 300000,
          },
          metrics: {
            requestsInFlight: 0,
            totalRequests: 0,
            cacheHitRate: 0,
            avgLatency: 0,
          },
        },
      ],
      metrics: {
        totalNodes: 1,
        healthyNodes: 0,
        totalRequests: 0,
        avgClusterLatency: 0,
        overallCacheHitRate: 0,
      },
      lastUpdated: Date.now(),
    };

    expect(state.status).toBe(ClusterStatus.OFFLINE);
    expect(state.metrics.healthyNodes).toBe(0);
  });
});

// ============================================================================
// TYPE COMPATIBILITY TESTS - Partial<T>, Required<T> patterns
// ============================================================================

describe("Type Compatibility - Partial and Required", () => {
  test("should support Partial<MLXClusterConfig>", () => {
    const partialConfig: Partial<MLXClusterConfig> = {
      routing: {
        strategy: LoadBalanceStrategy.ROUND_ROBIN,
        maxRetries: 3,
        retryDelayMs: 1000,
      },
    };

    expect(partialConfig.routing).toBeDefined();
    expect(partialConfig.discovery).toBeUndefined();
  });

  test("should support Partial<NodeMetrics>", () => {
    const partialMetrics: Partial<NodeMetrics> = {
      requestsInFlight: 5,
    };

    expect(partialMetrics.requestsInFlight).toBe(5);
    expect(partialMetrics.totalRequests).toBeUndefined();
  });

  test("should support Required<DiscoveryConfig>", () => {
    const requiredDiscovery: Required<DiscoveryConfig> = {
      mode: "static" as const,
      nodes: [{ url: "http://localhost:8080", id: "node-1" }],
      dnsName: "mlx.local",
      port: 8080,
      namespace: "default",
      serviceLabel: "app=mlx",
    };

    expect(requiredDiscovery.nodes).toBeDefined();
    expect(requiredDiscovery.dnsName).toBeDefined();
    expect(requiredDiscovery.namespace).toBeDefined();
  });

  test("should support Partial<ClusterState> for updates", () => {
    const stateUpdate: Partial<ClusterState> = {
      status: ClusterStatus.DEGRADED,
      lastUpdated: Date.now(),
    };

    expect(stateUpdate.status).toBe(ClusterStatus.DEGRADED);
    expect(stateUpdate.nodes).toBeUndefined();
  });
});

// ============================================================================
// EDGE CASES AND ERROR CONDITIONS
// ============================================================================

describe("Edge Cases - Empty and Extreme Values", () => {
  test("should handle empty cluster state", () => {
    const state: ClusterState = {
      status: ClusterStatus.STARTING,
      nodes: [],
      metrics: {
        totalNodes: 0,
        healthyNodes: 0,
        totalRequests: 0,
        avgClusterLatency: 0,
        overallCacheHitRate: 0,
      },
      lastUpdated: Date.now(),
    };

    expect(state.nodes).toHaveLength(0);
    expect(state.metrics.totalNodes).toBe(0);
  });

  test("should handle very large token counts", () => {
    const cache: NodeCacheState = {
      tokens: Number.MAX_SAFE_INTEGER,
      systemPromptHash: "sha256:huge",
      lastUpdated: Date.now(),
    };

    expect(cache.tokens).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("should handle zero latency (impossible but type-safe)", () => {
    const metrics: NodeMetrics = {
      requestsInFlight: 100,
      totalRequests: 1000,
      cacheHitRate: 1.0,
      avgLatency: 0,
    };

    expect(metrics.avgLatency).toBe(0);
  });

  test("should handle long node IDs", () => {
    const longId: NodeId =
      "mlx-worker-production-us-east-1a-instance-" + "x".repeat(100);
    expect(longId.length).toBeGreaterThan(100);
  });

  test("should handle fractional error rates", () => {
    const health: NodeHealth = {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      avgResponseTime: 150,
      errorRate: 0.123456789,
    };

    expect(health.errorRate).toBeCloseTo(0.123, 3);
  });
});

// ============================================================================
// INTEGRATION TESTS - Types Working Together
// ============================================================================

describe("Integration - Types Working Together", () => {
  test("should build complete cluster from config", () => {
    const config: MLXClusterConfig = {
      discovery: {
        mode: "static" as const,
        nodes: [
          { url: "http://localhost:8080", id: "node-1" },
          { url: "http://localhost:8081", id: "node-2" },
        ],
      },
      health: {
        checkIntervalMs: 5000,
        timeoutMs: 2000,
        maxConsecutiveFailures: 3,
        unhealthyThreshold: 0.5,
      },
      cache: {
        maxCacheAgeSec: 3600,
        minCacheHitRate: 0.5,
        maxCacheSizeTokens: 128000,
      },
      routing: {
        strategy: LoadBalanceStrategy.CACHE_AWARE,
        maxRetries: 3,
        retryDelayMs: 1000,
      },
    };

    const nodes: MLXNode[] = config.discovery.nodes!.map(
      (nodeConfig: { id: string; url: string }) => ({
        id: nodeConfig.id,
        url: nodeConfig.url,
        status: NodeStatus.INITIALIZING,
        health: {
          lastCheck: Date.now(),
          consecutiveFailures: 0,
          avgResponseTime: 0,
          errorRate: 0,
        },
        cache: {
          tokens: 0,
          systemPromptHash: "",
          lastUpdated: Date.now(),
        },
        metrics: {
          requestsInFlight: 0,
          totalRequests: 0,
          cacheHitRate: 0,
          avgLatency: 0,
        },
      })
    );

    const state: ClusterState = {
      status: ClusterStatus.STARTING,
      nodes,
      metrics: {
        totalNodes: nodes.length,
        healthyNodes: 0,
        totalRequests: 0,
        avgClusterLatency: 0,
        overallCacheHitRate: 0,
      },
      lastUpdated: Date.now(),
    };

    expect(state.nodes).toHaveLength(2);
    expect(state.status).toBe(ClusterStatus.STARTING);
  });

  test("should route request using context", () => {
    const context: RoutingContext = {
      systemPromptHash: "sha256:abc123",
      estimatedTokens: 2048,
      userPriority: "high" as const,
    };

    const decision: RoutingDecision = {
      nodeId: "node-1",
      reason: "cache-hit-high-priority",
      confidence: 0.9,
    };

    expect(decision.nodeId).toBe("node-1");
    expect(decision.reason).toContain("high-priority");
  });

  test("should update node status based on health", () => {
    const node: MLXNode = {
      id: "node-1",
      url: "http://localhost:8080",
      status: NodeStatus.HEALTHY,
      health: {
        lastCheck: Date.now(),
        consecutiveFailures: 3,
        avgResponseTime: 500,
        errorRate: 0.6,
      },
      cache: {
        tokens: 2048,
        systemPromptHash: "sha256:abc123",
        lastUpdated: Date.now(),
      },
      metrics: {
        requestsInFlight: 5,
        totalRequests: 100,
        cacheHitRate: 0.5,
        avgLatency: 600,
      },
    };

    // Simulate status update based on health
    const shouldBeUnhealthy = node.health.consecutiveFailures >= 3;
    expect(shouldBeUnhealthy).toBe(true);
  });
});
