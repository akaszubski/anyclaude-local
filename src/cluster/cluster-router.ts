/**
 * Cache-affinity request router for MLX cluster.
 *
 * This module provides intelligent routing and session management for distributing
 * requests across MLX cluster nodes with cache awareness.
 *
 * Key components:
 * - StickySessionManager: TTL-based session tracking with automatic cleanup
 * - ClusterRouter: Main orchestrator implementing multiple routing strategies
 *
 * Routing strategies:
 * - ROUND_ROBIN: Simple rotation through healthy nodes
 * - LEAST_LOADED: Route to node with fewest active requests
 * - CACHE_AWARE: Prefer nodes with matching system prompt cache
 * - LATENCY_BASED: Route to node with lowest average response time
 *
 * Cache-affinity scoring (CACHE_AWARE strategy):
 * - Cache match: +50 points (systemPromptHash matches)
 * - Tools match: +20 points (only if cache matches)
 * - Health score: +25 * successRate (1 - errorRate)
 * - Availability: +15 points if requestsInFlight < 5
 * - Recency: +10 points if lastUpdated within 60s
 * - Total max: 120 points
 * - Confidence: total / 120
 *
 * @module cluster-router
 */

import type {
  MLXNode,
  RoutingDecision,
  RoutingContext,
  NodeId,
  RoutingConfig,
} from "./cluster-types";
import { LoadBalanceStrategy, NodeStatus } from "./cluster-types";

// Re-export RoutingConfig so tests can import it from this module
export type { RoutingConfig } from "./cluster-types";

/**
 * Sticky session data structure.
 *
 * Tracks the association between a session ID and a node, with TTL expiration.
 *
 * Fields:
 * - sessionId: Unique session identifier
 * - nodeId: Node this session is pinned to
 * - createdAt: Timestamp when session was created (ms since epoch)
 * - expiresAt: Timestamp when session expires (ms since epoch)
 */
export interface StickySession {
  readonly sessionId: string;
  readonly nodeId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/**
 * Cache affinity score breakdown.
 *
 * Provides visibility into how the cache-aware scoring algorithm
 * evaluated a particular node.
 *
 * Fields:
 * - nodeId: Node being scored
 * - cacheMatch: Points from cache hash match (0 or 50)
 * - toolsMatch: Points from tools match (0 or 20)
 * - healthScore: Points from health (0-25)
 * - availability: Points from low load (0 or 15)
 * - recency: Points from recent cache update (0 or 10)
 * - total: Total score (0-120)
 */
export interface CacheAffinityScore {
  readonly nodeId: NodeId;
  readonly cacheMatch: number;
  readonly toolsMatch: number;
  readonly healthScore: number;
  readonly availability: number;
  readonly recency: number;
  readonly total: number;
}

/**
 * Callbacks for routing events.
 *
 * Enables observability and monitoring of routing decisions.
 *
 * Callbacks:
 * - onNodeSelected: Called when a node is successfully selected
 * - onSessionCreated: Called when a new sticky session is created
 * - onSessionExpired: Called when a session expires
 * - onRoutingFailed: Called when routing fails (no healthy nodes, etc.)
 */
export interface RouterCallbacks {
  onNodeSelected?: (decision: RoutingDecision) => void;
  onSessionCreated?: (sessionId: string, nodeId: string) => void;
  onSessionExpired?: (sessionId: string, nodeId: string) => void;
  onRoutingFailed?: (context: RoutingContext, reason: string) => void;
}

/**
 * Sticky session manager with TTL-based expiration.
 *
 * Manages session-to-node affinity with automatic cleanup of expired sessions.
 * Uses recursive setTimeout for cleanup to avoid timer overlap issues.
 *
 * Example:
 * ```typescript
 * const manager = new StickySessionManager(60000); // 1 minute TTL
 * manager.createSession('session-1', 'node-1');
 * const nodeId = manager.getSession('session-1'); // Returns 'node-1'
 * // After 1 minute...
 * const expired = manager.getSession('session-1'); // Returns null
 * ```
 */
export class StickySessionManager {
  private readonly sessions = new Map<string, StickySession>();
  private readonly ttlMs: number;
  private readonly callbacks?: RouterCallbacks;
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Create a sticky session manager.
   *
   * @param ttlMs - Session TTL in milliseconds (must be > 0)
   * @param callbacks - Optional callbacks for session lifecycle events
   * @throws Error if ttlMs <= 0
   */
  constructor(ttlMs: number, callbacks?: RouterCallbacks) {
    if (ttlMs <= 0) {
      throw new Error("TTL must be greater than 0");
    }

    this.ttlMs = ttlMs;
    this.callbacks = callbacks;

    // Start cleanup timer
    this.scheduleCleanup();
  }

  /**
   * Create or update a session.
   *
   * If the session already exists, it will be updated with a new TTL.
   *
   * @param sessionId - Unique session identifier
   * @param nodeId - Node to pin this session to
   */
  createSession(sessionId: string, nodeId: string): void {
    const now = Date.now();
    const session: StickySession = {
      sessionId,
      nodeId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.sessions.set(sessionId, session);

    // Fire callback
    this.safeCallback(() => {
      this.callbacks?.onSessionCreated?.(sessionId, nodeId);
    });
  }

  /**
   * Get the node ID for a session.
   *
   * Returns null if the session doesn't exist or has expired.
   *
   * @param sessionId - Session to look up
   * @returns Node ID or null if session not found/expired
   */
  getSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if expired
    if (Date.now() >= session.expiresAt) {
      return null;
    }

    return session.nodeId;
  }

  /**
   * Remove a session.
   *
   * @param sessionId - Session to remove
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.delete(sessionId);

      // Fire expiration callback
      this.safeCallback(() => {
        this.callbacks?.onSessionExpired?.(session.sessionId, session.nodeId);
      });
    }
  }

  /**
   * Get count of active (non-expired) sessions.
   *
   * Note: This counts all sessions in the map, including expired ones
   * that haven't been cleaned up yet. The cleanup timer runs every 60s.
   *
   * @returns Number of active sessions
   */
  getActiveSessions(): number {
    return this.sessions.size;
  }

  /**
   * Get count of sessions for a specific node.
   *
   * @param nodeId - Node to count sessions for
   * @returns Number of sessions pinned to this node
   */
  getSessionsForNode(nodeId: string): number {
    let count = 0;
    const now = Date.now();

    for (const session of this.sessions.values()) {
      if (session.nodeId === nodeId && now <= session.expiresAt) {
        count++;
      }
    }

    return count;
  }

  /**
   * Stop the cleanup timer.
   *
   * Call this when destroying the manager to prevent memory leaks.
   * Can be called multiple times safely.
   */
  stopCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Schedule the next cleanup cycle.
   *
   * Uses recursive setTimeout to avoid timer overlap.
   * Runs every 1 second to catch expired sessions quickly.
   */
  private scheduleCleanup(): void {
    this.cleanupTimer = setTimeout(() => {
      this.cleanup();
      this.scheduleCleanup(); // Recursive
    }, 1000); // 1 second
  }

  /**
   * Clean up expired sessions.
   *
   * Removes all sessions past their TTL and fires expiration callbacks.
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: StickySession[] = [];

    // Find expired sessions
    for (const session of this.sessions.values()) {
      if (now >= session.expiresAt) {
        expired.push(session);
      }
    }

    // Remove and fire callbacks
    for (const session of expired) {
      this.sessions.delete(session.sessionId);

      this.safeCallback(() => {
        this.callbacks?.onSessionExpired?.(session.sessionId, session.nodeId);
      });
    }
  }

  /**
   * Safely execute a callback, catching any errors.
   *
   * @param fn - Callback function to execute
   */
  private safeCallback(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      // Swallow callback errors to prevent them from breaking the manager
    }
  }
}

/**
 * Cache-affinity request router for MLX cluster.
 *
 * Main orchestrator that implements multiple routing strategies and
 * integrates with sticky session management.
 *
 * Strategies:
 * - ROUND_ROBIN: Cycle through healthy nodes
 * - LEAST_LOADED: Select node with fewest requestsInFlight
 * - CACHE_AWARE: Cache-affinity scoring algorithm
 * - LATENCY_BASED: Select node with lowest avgResponseTime
 *
 * Example:
 * ```typescript
 * const config: RoutingConfig = {
 *   strategy: LoadBalanceStrategy.CACHE_AWARE,
 *   maxRetries: 3,
 *   retryDelayMs: 1000,
 * };
 *
 * const router = new ClusterRouter(config);
 * const decision = router.selectNode(nodes, context);
 * console.log(`Route to ${decision.nodeId}: ${decision.reason}`);
 * ```
 */
export class ClusterRouter {
  private readonly config: RoutingConfig;
  private readonly sessionManager: StickySessionManager;
  private roundRobinIndex = 0;

  /**
   * Create a cluster router.
   *
   * @param config - Routing configuration
   * @param sessionTTL - Session TTL in milliseconds (default: 300000 = 5 minutes)
   * @param callbacks - Optional callbacks for routing events
   */
  constructor(
    config: RoutingConfig,
    sessionTTL: number = 300000,
    callbacks?: RouterCallbacks
  ) {
    this.config = config;
    this.sessionManager = new StickySessionManager(sessionTTL, callbacks);
  }

  /**
   * Select a node for a request.
   *
   * Delegates to the appropriate strategy function based on config.
   *
   * @param nodes - Available cluster nodes
   * @param context - Request context for routing decision
   * @returns Routing decision or null if no eligible nodes
   */
  selectNode(
    nodes: MLXNode[],
    context: RoutingContext
  ): RoutingDecision | null {
    // Filter to healthy/degraded nodes only
    const eligibleNodes = this.filterEligibleNodes(nodes);

    if (eligibleNodes.length === 0) {
      this.safeCallback(() => {
        this.sessionManager["callbacks"]?.onRoutingFailed?.(
          context,
          "No healthy nodes available"
        );
      });
      return null;
    }

    // Delegate to strategy
    let decision: RoutingDecision | null = null;

    switch (this.config.strategy) {
      case LoadBalanceStrategy.ROUND_ROBIN:
        decision = this.selectRoundRobin(eligibleNodes);
        break;

      case LoadBalanceStrategy.LEAST_LOADED:
        decision = this.selectLeastLoaded(eligibleNodes);
        break;

      case LoadBalanceStrategy.CACHE_AWARE:
        decision = this.selectCacheAware(eligibleNodes, context);
        break;

      case LoadBalanceStrategy.LATENCY_BASED:
        decision = this.selectLatencyBased(eligibleNodes);
        break;

      default:
        decision = this.selectRoundRobin(eligibleNodes);
    }

    if (decision) {
      this.safeCallback(() => {
        this.sessionManager["callbacks"]?.onNodeSelected?.(decision!);
      });
    } else {
      this.safeCallback(() => {
        this.sessionManager["callbacks"]?.onRoutingFailed?.(
          context,
          "Strategy returned no decision"
        );
      });
    }

    return decision;
  }

  /**
   * Select a node with sticky session support.
   *
   * If a session exists and the node is healthy, returns that node.
   * Otherwise, falls back to normal routing and updates the session.
   *
   * @param nodes - Available cluster nodes
   * @param context - Request context
   * @param sessionId - Session identifier
   * @returns Routing decision or null if no eligible nodes
   */
  selectNodeWithSticky(
    nodes: MLXNode[],
    context: RoutingContext,
    sessionId: string
  ): RoutingDecision | null {
    // Check for existing session
    const existingNodeId = this.sessionManager.getSession(sessionId);

    if (existingNodeId) {
      // Find the node
      const node = nodes.find((n) => n.id === existingNodeId);

      // If node is healthy/degraded, use it
      if (
        node &&
        (node.status === NodeStatus.HEALTHY ||
          node.status === NodeStatus.DEGRADED)
      ) {
        return {
          nodeId: existingNodeId,
          reason: `sticky session: ${sessionId}`,
          confidence: 0.95,
        };
      }

      // Node is offline/unhealthy, fall back to normal routing
    }

    // No session or node unavailable - select normally
    const decision = this.selectNode(nodes, context);

    if (decision) {
      // Create/update session
      this.sessionManager.createSession(sessionId, decision.nodeId);
    }

    return decision;
  }

  /**
   * Get routing plan for multiple contexts.
   *
   * Returns a map of context hash -> routing decision.
   *
   * @param nodes - Available cluster nodes
   * @param contexts - Array of routing contexts
   * @returns Map of context hash to routing decision
   */
  getRoutingPlan(
    nodes: MLXNode[],
    contexts: RoutingContext[]
  ): Map<string, RoutingDecision | null> {
    const plan = new Map<string, RoutingDecision | null>();

    for (const context of contexts) {
      const decision = this.selectNode(nodes, context);
      plan.set(context.systemPromptHash, decision);
    }

    return plan;
  }

  /**
   * Create a sticky session.
   *
   * @param sessionId - Session identifier
   * @param nodeId - Node to pin session to
   */
  createSession(sessionId: string, nodeId: string): void {
    this.sessionManager.createSession(sessionId, nodeId);
  }

  /**
   * Clear a sticky session.
   *
   * @param sessionId - Session to remove
   */
  clearSession(sessionId: string): void {
    this.sessionManager.removeSession(sessionId);
  }

  /**
   * Get count of active sessions.
   *
   * @returns Number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessionManager.getActiveSessions();
  }

  /**
   * Check if router is running.
   *
   * @returns True if cleanup timer is active
   */
  isRunning(): boolean {
    return this.sessionManager["cleanupTimer"] !== null;
  }

  /**
   * Destroy the router and cleanup resources.
   *
   * Stops the session cleanup timer to prevent memory leaks.
   */
  destroy(): void {
    this.sessionManager.stopCleanup();
  }

  /**
   * Filter nodes to only healthy and degraded nodes.
   *
   * @param nodes - All nodes
   * @returns Nodes with HEALTHY or DEGRADED status
   */
  private filterEligibleNodes(nodes: MLXNode[]): MLXNode[] {
    return nodes.filter(
      (node) =>
        node.status === NodeStatus.HEALTHY ||
        node.status === NodeStatus.DEGRADED
    );
  }

  /**
   * Round-robin strategy: cycle through nodes.
   *
   * @param nodes - Eligible nodes
   * @returns Routing decision
   */
  private selectRoundRobin(nodes: MLXNode[]): RoutingDecision | null {
    if (nodes.length === 0) {
      return null;
    }

    const node = nodes[this.roundRobinIndex % nodes.length];
    this.roundRobinIndex++;

    return {
      nodeId: node.id,
      reason: "round-robin selection",
      confidence: 0.8,
    };
  }

  /**
   * Least-loaded strategy: select node with fewest active requests.
   *
   * @param nodes - Eligible nodes
   * @returns Routing decision
   */
  private selectLeastLoaded(nodes: MLXNode[]): RoutingDecision | null {
    if (nodes.length === 0) {
      return null;
    }

    let minLoad = Infinity;
    let selectedNode = nodes[0];

    for (const node of nodes) {
      if (node.metrics.requestsInFlight < minLoad) {
        minLoad = node.metrics.requestsInFlight;
        selectedNode = node;
      }
    }

    return {
      nodeId: selectedNode.id,
      reason: `least-loaded: ${minLoad} requests in flight`,
      confidence: 0.85,
    };
  }

  /**
   * Latency-based strategy: select node with lowest average response time.
   *
   * @param nodes - Eligible nodes
   * @returns Routing decision
   */
  private selectLatencyBased(nodes: MLXNode[]): RoutingDecision | null {
    if (nodes.length === 0) {
      return null;
    }

    let minLatency = Infinity;
    let selectedNode = nodes[0];

    for (const node of nodes) {
      if (node.health.avgResponseTime < minLatency) {
        minLatency = node.health.avgResponseTime;
        selectedNode = node;
      }
    }

    return {
      nodeId: selectedNode.id,
      reason: `latency-based: ${minLatency.toFixed(1)}ms avg response time`,
      confidence: 0.85,
    };
  }

  /**
   * Cache-aware strategy: score nodes based on cache affinity.
   *
   * Scoring algorithm:
   * - Cache match: +50 (systemPromptHash matches)
   * - Tools match: +20 (only if cache matches)
   * - Health score: +25 * successRate
   * - Availability: +15 if requestsInFlight < 5
   * - Recency: +10 if lastUpdated within 60s
   * - Total max: 120 points
   *
   * Falls back to round-robin if no cache hits.
   *
   * @param nodes - Eligible nodes
   * @param context - Request context with systemPromptHash
   * @returns Routing decision
   */
  private selectCacheAware(
    nodes: MLXNode[],
    context: RoutingContext
  ): RoutingDecision | null {
    if (nodes.length === 0) {
      return null;
    }

    const scores: CacheAffinityScore[] = [];
    const now = Date.now();
    let hasCacheHit = false;

    for (const node of nodes) {
      // Cache match: +50
      const cacheMatch =
        node.cache.systemPromptHash === context.systemPromptHash ? 50 : 0;

      if (cacheMatch > 0) {
        hasCacheHit = true;
      }

      // Tools match: +20 (only if cache matches)
      const toolsMatch = cacheMatch > 0 ? 20 : 0;

      // Health score: +25 * successRate
      const successRate = 1 - node.health.errorRate;
      const healthScore = 25 * successRate;

      // Availability: +15 if requestsInFlight < 5
      const availability = node.metrics.requestsInFlight < 5 ? 15 : 0;

      // Recency: +10 if lastUpdated within 60s
      const age = now - node.cache.lastUpdated;
      const recency = age < 60000 ? 10 : 0;

      // Total score
      const total =
        cacheMatch + toolsMatch + healthScore + availability + recency;

      scores.push({
        nodeId: node.id,
        cacheMatch,
        toolsMatch,
        healthScore,
        availability,
        recency,
        total,
      });
    }

    // If no cache hits, fall back to round-robin
    if (!hasCacheHit) {
      const rrDecision = this.selectRoundRobin(nodes);
      if (rrDecision) {
        return {
          ...rrDecision,
          reason: `cache-aware fallback: ${rrDecision.reason}`,
          confidence: 0.5, // Lower confidence when falling back
        };
      }
    }

    // Select highest scoring node
    let bestScore = scores[0];
    for (const score of scores) {
      if (score.total > bestScore.total) {
        bestScore = score;
      }
    }

    // Confidence = total / max (120)
    const confidence = bestScore.total / 120;

    return {
      nodeId: bestScore.nodeId,
      reason: `cache-aware: score ${bestScore.total}/120 (cache=${bestScore.cacheMatch}, tools=${bestScore.toolsMatch}, health=${bestScore.healthScore.toFixed(1)}, avail=${bestScore.availability}, recent=${bestScore.recency})`,
      confidence,
    };
  }

  /**
   * Safely execute a callback, catching any errors.
   *
   * @param fn - Callback function to execute
   */
  private safeCallback(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      // Swallow callback errors
    }
  }
}
