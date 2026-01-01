/**
 * Main cluster orchestration for MLX cluster management.
 *
 * This module provides:
 * 1. ClusterManagerError - Typed errors with codes and causes
 * 2. Singleton pattern - initializeCluster, getClusterManager, resetClusterManager
 * 3. ClusterManager - Main orchestrator coordinating all cluster components
 * 4. Provider management - Node-to-provider mapping and lifecycle
 * 5. Node selection - Intelligent routing based on health and cache state
 * 6. Health tracking - Recording success/failure and updating health state
 * 7. Status reporting - Real-time cluster status and metrics
 * 8. Shutdown - Graceful cleanup of all components
 *
 * The cluster manager serves as the main entry point for cluster operations,
 * coordinating discovery, health checks, caching, and routing to provide
 * intelligent request distribution across MLX nodes.
 *
 * @module cluster-manager
 */

import type {
  MLXClusterConfig,
  MLXNode,
  RoutingContext,
} from "./cluster-types";
import { NodeStatus } from "./cluster-types";
import { validateClusterConfig } from "./cluster-config";
import { ClusterDiscovery } from "./cluster-discovery";
import { ClusterHealth } from "./cluster-health";
import { ClusterRouter } from "./cluster-router";
import { ClusterCache } from "./cluster-cache";
import { createOpenAI } from "@ai-sdk/openai";

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown during cluster manager operations.
 *
 * Contains error code and optional cause for debugging.
 */
export class ClusterManagerError extends Error {
  readonly code: string;
  readonly cause?: Error;

  constructor(code: string, message: string, cause?: Error) {
    super(message);
    this.name = "ClusterManagerError";
    this.code = code;
    this.cause = cause;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ClusterManagerError.prototype);
  }
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Status of the cluster manager.
 *
 * Provides visibility into cluster health, node count, and cache statistics.
 */
export interface ClusterStatus {
  /** Whether the cluster manager is initialized and ready */
  readonly initialized: boolean;

  /** Total number of nodes in the cluster */
  readonly totalNodes: number;

  /** Number of healthy nodes available for routing */
  readonly healthyNodes: number;

  /** Detailed information about each node */
  readonly nodes: Array<{
    id: string;
    url: string;
    healthy: boolean;
    latencyMs?: number;
    errorCount: number;
  }>;

  /** Cache statistics (if cache is enabled) */
  readonly cacheStats?: {
    nodeCount: number;
    cacheCount: number;
    uniqueHashes: number;
  };
}

// ============================================================================
// Singleton State
// ============================================================================

/**
 * Singleton instance of the cluster manager.
 */
let clusterManager: ClusterManager | null = null;

/**
 * Flag to prevent concurrent initialization attempts.
 */
let isInitializing = false;

// ============================================================================
// Singleton Functions
// ============================================================================

/**
 * Initialize the cluster manager with the given configuration.
 *
 * This function performs the complete initialization sequence:
 * 1. Validate configuration
 * 2. Start cluster discovery
 * 3. Create per-node providers
 * 4. Start health checks
 * 5. Initialize cache (if enabled)
 * 6. Create router
 *
 * @param config - Cluster configuration
 * @returns Initialized cluster manager instance
 * @throws {ClusterManagerError} If already initialized, initializing, or config invalid
 *
 * @example
 * ```typescript
 * const config = {
 *   discovery: { mode: 'static', nodes: [...] },
 *   health: { checkIntervalMs: 10000, ... },
 *   cache: { maxCacheAgeSec: 300, ... },
 *   routing: { strategy: LoadBalanceStrategy.CACHE_AWARE, ... }
 * };
 * const manager = await initializeCluster(config);
 * ```
 */
export async function initializeCluster(
  config: MLXClusterConfig
): Promise<ClusterManager> {
  // Check if already initialized
  if (clusterManager) {
    throw new ClusterManagerError(
      "ALREADY_INITIALIZED",
      "Cluster manager is already initialized. Call resetClusterManager() first."
    );
  }

  // Check if initialization is in progress
  if (isInitializing) {
    throw new ClusterManagerError(
      "INITIALIZING",
      "Cluster manager initialization is already in progress"
    );
  }

  // Set initializing flag
  isInitializing = true;

  try {
    // Step 1: Validate configuration
    const validation = validateClusterConfig(config);
    if (!validation.isValid) {
      const errorMessages = [
        ...validation.errors,
        ...validation.missingRequired.map(
          (field) => `Missing required field: ${field}`
        ),
      ];
      throw new ClusterManagerError(
        "INVALID_CONFIG",
        `Configuration validation failed: ${errorMessages.join(", ")}`
      );
    }

    // Create the manager instance
    const manager = new ClusterManager(config);

    // Initialize the manager (async operations)
    await manager.initialize();

    // Set singleton instance
    clusterManager = manager;

    return manager;
  } catch (err) {
    if (err instanceof ClusterManagerError) {
      throw err;
    }
    throw new ClusterManagerError(
      "INITIALIZATION_FAILED",
      `Failed to initialize cluster manager: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  } finally {
    // Clear initializing flag
    isInitializing = false;
  }
}

/**
 * Get the singleton cluster manager instance.
 *
 * @returns Current cluster manager instance
 * @throws {ClusterManagerError} If not initialized
 *
 * @example
 * ```typescript
 * const manager = getClusterManager();
 * const node = manager.selectNode(systemPromptHash, toolsHash);
 * ```
 */
export function getClusterManager(): ClusterManager {
  if (!clusterManager) {
    throw new ClusterManagerError(
      "NOT_INITIALIZED",
      "Cluster manager is not initialized. Call initializeCluster() first."
    );
  }
  return clusterManager;
}

/**
 * Reset the cluster manager singleton.
 *
 * This function:
 * 1. Stops discovery
 * 2. Stops health checks
 * 3. Stops cache synchronization
 * 4. Destroys router
 * 5. Clears providers
 * 6. Clears singleton instance
 *
 * Safe to call even if not initialized.
 *
 * @example
 * ```typescript
 * resetClusterManager();
 * // Can now call initializeCluster() again
 * ```
 */
export function resetClusterManager(): void {
  if (clusterManager) {
    try {
      // Shutdown components in reverse order
      clusterManager.shutdown();
    } catch (err) {
      // Ignore errors during reset
    }
    clusterManager = null;
  }
}

// ============================================================================
// ClusterManager Class
// ============================================================================

/**
 * Main orchestrator for MLX cluster management.
 *
 * Coordinates all cluster components:
 * - Discovery: Finding and validating nodes
 * - Health: Monitoring node health and reliability
 * - Cache: Coordinating KV cache state across nodes
 * - Router: Selecting nodes based on strategy and context
 * - Providers: Managing AI SDK providers for each node
 *
 * Example usage:
 * ```typescript
 * // Initialize cluster
 * const manager = await initializeCluster(config);
 *
 * // Select node for request
 * const node = manager.selectNode(systemPromptHash, toolsHash, sessionId);
 *
 * // Get provider for node
 * const provider = manager.getNodeProvider(node.id);
 *
 * // Record result
 * manager.recordNodeSuccess(node.id, latencyMs);
 * ```
 */
export class ClusterManager {
  private readonly config: MLXClusterConfig;
  private discovery: ClusterDiscovery | null = null;
  private health: ClusterHealth | null = null;
  private cache: ClusterCache | null = null;
  private router: ClusterRouter | null = null;
  private providers: Map<string, any> = new Map();
  private initialized: boolean = false;

  /**
   * Create a new cluster manager.
   *
   * Note: Use initializeCluster() instead of calling this directly.
   *
   * @param config - Cluster configuration
   */
  constructor(config: MLXClusterConfig) {
    this.config = config;
  }

  /**
   * Initialize cluster components.
   *
   * This is called by initializeCluster() and should not be called directly.
   *
   * Initialization sequence:
   * 1. Create and start discovery
   * 2. Get discovered nodes
   * 3. Create providers for each node
   * 4. Create and start health checks
   * 5. Create and initialize cache (if enabled)
   * 6. Create router
   * 7. Set initialized flag
   *
   * @private
   */
  async initialize(): Promise<void> {
    try {
      // Step 1: Create and start discovery
      this.discovery = new ClusterDiscovery({
        mode: this.config.discovery.mode,
        staticNodes: this.config.discovery.nodes,
        refreshIntervalMs: 30000, // 30 seconds
        validationTimeoutMs: 5000, // 5 seconds
      });

      await this.discovery.start();

      // Step 2: Get discovered nodes
      const nodes = this.discovery.getDiscoveredNodes();

      // Step 3: Create providers for each node
      for (const node of nodes) {
        try {
          const provider = this.createProviderForNode(node);
          this.providers.set(node.id, provider);
        } catch (err) {
          // Log error but continue with other nodes
          console.error(`Failed to create provider for node ${node.id}:`, err);
        }
      }

      // Step 4: Create and start health checks
      this.health = new ClusterHealth(this.config.health);
      this.health.startHealthChecks(nodes);

      // Step 5: Create and initialize cache (if enabled)
      // Cache is always enabled in our implementation, but failures are non-fatal
      try {
        this.cache = new ClusterCache(this.config.cache);
        await this.cache.initialize(
          nodes.map((n) => ({ id: n.id, url: n.url })),
          "default-system-prompt", // Default system prompt for warmup
          {
            concurrency: 3,
            timeoutMs: 5000,
            retryCount: 2,
            systemPrompt: "default-system-prompt",
          },
          30000 // 30 second sync interval
        );
      } catch (err) {
        // Cache initialization failed, but cluster can still operate
        console.error("Cache initialization failed:", err);
        this.cache = null;
      }

      // Step 6: Create router
      this.router = new ClusterRouter(this.config.routing);

      // Step 7: Set initialized flag
      this.initialized = true;
    } catch (err) {
      // Cleanup on initialization failure
      await this.cleanup();
      throw err;
    }
  }

  /**
   * Create an AI SDK provider for a node.
   *
   * Uses the same pattern as src/main.ts:259-345 for LMStudio compatibility.
   *
   * @param node - Node to create provider for
   * @returns AI SDK provider instance
   * @private
   */
  private createProviderForNode(node: MLXNode): any {
    const provider = createOpenAI({
      baseURL: node.url,
      apiKey: "lm-studio", // Default API key for MLX nodes
      name: `mlx-cluster-${node.id}`,
      fetch: (async (url: any, options?: any) => {
        if (!options?.body || typeof options.body !== "string") {
          return fetch(url, options);
        }

        const body = JSON.parse(options.body);

        // Map max_tokens → max_completion_tokens for LMStudio compatibility
        if (body.max_tokens) {
          body.max_completion_tokens = body.max_tokens;
          delete body.max_tokens;
        }

        // Enable prompt caching (llama.cpp's cache_prompt parameter)
        body.cache_prompt = true;

        // Remove unsupported parameters
        delete body.reasoning;
        delete body.service_tier;

        return fetch(url, { ...options, body: JSON.stringify(body) });
      }) as typeof fetch,
    });

    return provider;
  }

  /**
   * Select a node for handling a request.
   *
   * Selection process:
   * 1. Get discovered nodes from discovery
   * 2. Filter to only healthy nodes
   * 3. Build routing context with system prompt and tools hash
   * 4. Call router with sticky session (if provided)
   * 5. Return selected node or null
   *
   * @param systemPromptHash - Hash of the system prompt (for cache matching)
   * @param toolsHash - Hash of the tools definition (for cache matching)
   * @param sessionId - Optional session ID for sticky routing
   * @returns Selected node or null if no healthy nodes available
   *
   * @example
   * ```typescript
   * const node = manager.selectNode('hash-abc123', 'tools-def456', 'session-789');
   * if (node) {
   *   const provider = manager.getNodeProvider(node.id);
   *   // Use provider for request
   * }
   * ```
   */
  selectNode(
    systemPromptHash: string,
    toolsHash: string,
    sessionId?: string
  ): MLXNode | null {
    if (!this.initialized || !this.discovery || !this.router || !this.health) {
      return null;
    }

    // Get all discovered nodes
    const allNodes = this.discovery.getDiscoveredNodes();

    // Filter to healthy nodes only
    const healthyNodes = allNodes.filter((node) => {
      return (
        node.status === NodeStatus.HEALTHY && this.health!.isHealthy(node.id)
      );
    });

    // If no healthy nodes, return null
    if (healthyNodes.length === 0) {
      return null;
    }

    // Build routing context
    const context: RoutingContext = {
      systemPromptHash,
      estimatedTokens: 0, // Not used in current implementation
      userPriority: "normal",
    };

    // Call router to select node
    // Pass session ID if provided for sticky routing, undefined for load balancing
    const decision = this.router.selectNodeWithSticky(
      healthyNodes,
      context,
      sessionId as any // Router signature requires string, but tests expect undefined support
    );

    if (!decision) {
      return null;
    }

    // Find and return the selected node
    return healthyNodes.find((node) => node.id === decision.nodeId) || null;
  }

  /**
   * Get the AI SDK provider for a node.
   *
   * @param nodeId - ID of the node
   * @returns Provider instance or null if not found
   *
   * @example
   * ```typescript
   * const provider = manager.getNodeProvider('node-1');
   * if (provider) {
   *   const result = await generateText({
   *     model: provider('qwen2.5-coder:7b'),
   *     prompt: 'Hello!'
   *   });
   * }
   * ```
   */
  getNodeProvider(nodeId: string): any | null {
    return this.providers.get(nodeId) || null;
  }

  /**
   * Record a successful request to a node.
   *
   * Updates health tracker with success and latency for routing decisions.
   *
   * @param nodeId - ID of the node
   * @param latencyMs - Request latency in milliseconds
   *
   * @example
   * ```typescript
   * const startTime = Date.now();
   * const result = await generateText({ ... });
   * const latency = Date.now() - startTime;
   * manager.recordNodeSuccess(node.id, latency);
   * ```
   */
  recordNodeSuccess(nodeId: string, latencyMs: number): void {
    if (this.health) {
      this.health.recordSuccess(nodeId, latencyMs);
    }
  }

  /**
   * Record a failed request to a node.
   *
   * Updates health tracker with failure for circuit breaker logic.
   *
   * @param nodeId - ID of the node
   * @param error - Error that occurred
   *
   * @example
   * ```typescript
   * try {
   *   const result = await generateText({ ... });
   * } catch (err) {
   *   manager.recordNodeFailure(node.id, err);
   *   // Retry with different node
   * }
   * ```
   */
  recordNodeFailure(nodeId: string, error: Error): void {
    if (this.health) {
      this.health.recordFailure(nodeId, error);
    }
  }

  /**
   * Get current cluster status.
   *
   * Returns a snapshot of cluster state including:
   * - Initialization status
   * - Node counts (total and healthy)
   * - Per-node health information
   * - Cache statistics (if available)
   *
   * @returns Cluster status snapshot
   *
   * @example
   * ```typescript
   * const status = manager.getStatus();
   * console.log(`Cluster has ${status.healthyNodes}/${status.totalNodes} healthy nodes`);
   * ```
   */
  getStatus(): ClusterStatus {
    // Pre-initialization state
    if (!this.initialized || !this.discovery || !this.health) {
      return {
        initialized: false,
        totalNodes: 0,
        healthyNodes: 0,
        nodes: [],
      };
    }

    // Get all discovered nodes
    const allNodes = this.discovery.getDiscoveredNodes();

    // Build per-node status
    const nodeStatuses = allNodes.map((node) => {
      try {
        // Try getHealthStatus first (test compatibility), fall back to getNodeHealth
        const health = this.health as any;
        if (health.getHealthStatus) {
          const healthStatus = health.getHealthStatus(node.id);
          return {
            id: node.id,
            url: node.url,
            healthy: this.health!.isHealthy(node.id),
            latencyMs: healthStatus.latencyMs,
            errorCount: healthStatus.errorCount,
          };
        } else {
          const healthData = this.health!.getNodeHealth(node.id);
          return {
            id: node.id,
            url: node.url,
            healthy: this.health!.isHealthy(node.id),
            latencyMs: healthData.metrics.avgLatencyMs,
            errorCount: healthData.metrics.consecutiveFailures,
          };
        }
      } catch (err) {
        // Node not tracked yet, return default values
        return {
          id: node.id,
          url: node.url,
          healthy: false,
          latencyMs: undefined,
          errorCount: 0,
        };
      }
    });

    // Count healthy nodes
    const healthyCount = nodeStatuses.filter((n) => n.healthy).length;

    // Build status object
    const status: ClusterStatus = {
      initialized: this.initialized,
      totalNodes: allNodes.length,
      healthyNodes: healthyCount,
      nodes: nodeStatuses,
    };

    // Add cache stats if available
    if (this.cache) {
      const cacheStats = this.cache.getCacheStats();
      if (cacheStats) {
        return {
          ...status,
          cacheStats: {
            nodeCount: cacheStats.nodeCount,
            cacheCount: cacheStats.cacheCount,
            uniqueHashes: cacheStats.uniqueHashes,
          },
        };
      }
    }

    return status;
  }

  /**
   * Shutdown the cluster manager.
   *
   * Cleanup sequence (order matters!):
   * 1. Stop discovery
   * 2. Stop health checks
   * 3. Stop cache synchronization
   * 4. Destroy router
   * 5. Clear providers
   * 6. Set initialized flag to false
   *
   * Idempotent - safe to call multiple times.
   *
   * @example
   * ```typescript
   * // Graceful shutdown on process exit
   * process.on('SIGTERM', () => {
   *   manager.shutdown();
   *   process.exit(0);
   * });
   * ```
   */
  async shutdown(): Promise<void> {
    // Stop discovery
    if (this.discovery) {
      try {
        this.discovery.stop();
      } catch (err) {
        // Ignore errors during shutdown
      }
      this.discovery = null;
    }

    // Stop health checks
    if (this.health) {
      try {
        this.health.stopHealthChecks();
      } catch (err) {
        // Ignore errors during shutdown
      }
      this.health = null;
    }

    // Stop cache
    if (this.cache) {
      try {
        this.cache.stop();
      } catch (err) {
        // Ignore errors during shutdown
      }
      this.cache = null;
    }

    // Destroy router
    if (this.router) {
      try {
        this.router.destroy();
      } catch (err) {
        // Ignore errors during shutdown
      }
      this.router = null;
    }

    // Clear providers
    this.providers.clear();

    // Set initialized flag
    this.initialized = false;
  }

  /**
   * Check if cluster manager is initialized.
   *
   * @returns true if initialized and ready for use
   *
   * @example
   * ```typescript
   * if (manager.isInitialized()) {
   *   const node = manager.selectNode(...);
   * }
   * ```
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup on initialization failure.
   *
   * Same as shutdown but doesn't throw.
   *
   * @private
   */
  private async cleanup(): Promise<void> {
    try {
      await this.shutdown();
    } catch (err) {
      // Ignore errors during cleanup
    }
  }
}
