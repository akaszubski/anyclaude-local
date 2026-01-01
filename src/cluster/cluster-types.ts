/**
 * TypeScript types and interfaces for MLX cluster management.
 *
 * This module defines the core data structures for:
 * - Node health tracking and monitoring
 * - KV cache state management
 * - Performance metrics collection
 * - Load balancing strategies
 * - Cluster configuration and state
 *
 * These types form the foundation of the MLX cluster system, enabling
 * intelligent routing, failover, and cache-aware load balancing.
 *
 * @module cluster-types
 */

/**
 * Unique identifier for a node in the MLX cluster.
 *
 * Can be any string format (UUID, descriptive name, etc.).
 * Examples:
 * - "node-1"
 * - "mlx-worker-prod-01"
 * - "550e8400-e29b-41d4-a716-446655440000"
 */
export type NodeId = string;

/**
 * Operational status of an individual MLX node.
 *
 * States:
 * - INITIALIZING: Node is starting up, not ready for traffic
 * - HEALTHY: Node is operational and performing well
 * - DEGRADED: Node is operational but experiencing issues (high latency, errors)
 * - UNHEALTHY: Node is failing health checks but still reachable
 * - OFFLINE: Node is unreachable or shut down
 */
export enum NodeStatus {
  INITIALIZING = "initializing",
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
  OFFLINE = "offline",
}

/**
 * Strategy for distributing requests across cluster nodes.
 *
 * Strategies:
 * - ROUND_ROBIN: Simple rotation through healthy nodes
 * - LEAST_LOADED: Route to node with fewest active requests
 * - CACHE_AWARE: Prefer nodes with matching system prompt cache
 * - LATENCY_BASED: Route to node with lowest average response time
 */
export enum LoadBalanceStrategy {
  ROUND_ROBIN = "round-robin",
  LEAST_LOADED = "least-loaded",
  CACHE_AWARE = "cache-aware",
  LATENCY_BASED = "latency-based",
}

/**
 * Overall health status of the entire cluster.
 *
 * States:
 * - STARTING: Cluster is initializing, not ready for production traffic
 * - HEALTHY: All nodes healthy, full capacity available
 * - DEGRADED: Some nodes unhealthy, reduced capacity
 * - CRITICAL: Most nodes unhealthy, minimal capacity
 * - OFFLINE: No healthy nodes available
 */
export enum ClusterStatus {
  STARTING = "starting",
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  CRITICAL = "critical",
  OFFLINE = "offline",
}

/**
 * Health check data for an MLX node.
 *
 * Tracks node reliability and performance over time to inform routing decisions.
 *
 * Fields:
 * - lastCheck: Timestamp of most recent health check (ms since epoch)
 * - consecutiveFailures: Number of sequential failed health checks
 * - avgResponseTime: Average response time in milliseconds
 * - errorRate: Percentage of requests that resulted in errors (0.0-1.0)
 */
export interface NodeHealth {
  readonly lastCheck: number;
  readonly consecutiveFailures: number;
  readonly avgResponseTime: number;
  readonly errorRate: number;
}

/**
 * KV cache state for an MLX node.
 *
 * Tracks what prompt data is cached on this node to enable cache-aware routing.
 *
 * Fields:
 * - tokens: Number of tokens currently in KV cache
 * - systemPromptHash: Hash of cached system prompt (for cache matching)
 * - lastUpdated: Timestamp of last cache update (ms since epoch)
 */
export interface NodeCacheState {
  readonly tokens: number;
  readonly systemPromptHash: string;
  readonly lastUpdated: number;
}

/**
 * Performance metrics for an MLX node.
 *
 * Tracks request volume and latency to inform load balancing decisions.
 *
 * Fields:
 * - requestsInFlight: Current number of active requests being processed
 * - totalRequests: Total requests handled since node started
 * - cacheHitRate: Percentage of requests that hit KV cache (0.0-1.0)
 * - avgLatency: Average request latency in milliseconds
 */
export interface NodeMetrics {
  readonly requestsInFlight: number;
  readonly totalRequests: number;
  readonly cacheHitRate: number;
  readonly avgLatency: number;
}

/**
 * Complete representation of a node in the MLX cluster.
 *
 * Combines node identity, status, health, cache state, and metrics.
 *
 * Fields:
 * - id: Unique identifier for this node
 * - url: HTTP endpoint for this node's MLX server
 * - status: Current operational status
 * - health: Health check data
 * - cache: KV cache state
 * - metrics: Performance metrics
 */
export interface MLXNode {
  readonly id: NodeId;
  readonly url: string;
  readonly status: NodeStatus;
  readonly health: NodeHealth;
  readonly cache: NodeCacheState;
  readonly metrics: NodeMetrics;
}

/**
 * Configuration for node health checking.
 *
 * Controls how frequently nodes are checked and when they're marked unhealthy.
 *
 * Fields:
 * - checkIntervalMs: Milliseconds between health checks
 * - timeoutMs: Health check timeout in milliseconds
 * - maxConsecutiveFailures: Failures before marking node unhealthy
 * - unhealthyThreshold: Error rate threshold for degraded status (0.0-1.0)
 */
export interface HealthConfig {
  readonly checkIntervalMs: number;
  readonly timeoutMs: number;
  readonly maxConsecutiveFailures: number;
  readonly unhealthyThreshold: number;
}

/**
 * Configuration for KV cache management.
 *
 * Controls cache size limits and when to invalidate stale cache entries.
 *
 * Fields:
 * - maxCacheAgeSec: Maximum age of cache entry before invalidation (seconds)
 * - minCacheHitRate: Minimum hit rate before triggering cache optimization (0.0-1.0)
 * - maxCacheSizeTokens: Maximum KV cache size in tokens
 */
export interface CacheConfig {
  readonly maxCacheAgeSec: number;
  readonly minCacheHitRate: number;
  readonly maxCacheSizeTokens: number;
}

/**
 * Configuration for node discovery.
 *
 * Defines how the cluster discovers available nodes.
 *
 * Discovery modes:
 * - static: Fixed list of node URLs (simple deployment)
 * - dns: DNS SRV record lookup (cloud deployment)
 * - kubernetes: Kubernetes service discovery (k8s deployment)
 *
 * Fields:
 * - mode: Discovery method to use
 * - nodes: Static node list (when mode='static')
 * - dnsName: DNS name to resolve (when mode='dns')
 * - port: Port for DNS-discovered nodes (when mode='dns')
 * - namespace: Kubernetes namespace (when mode='kubernetes')
 * - serviceLabel: Kubernetes service label selector (when mode='kubernetes')
 */
export interface DiscoveryConfig {
  readonly mode: "static" | "dns" | "kubernetes";
  readonly nodes?: Array<{ url: string; id: string }>;
  readonly dnsName?: string;
  readonly port?: number;
  readonly namespace?: string;
  readonly serviceLabel?: string;
}

/**
 * Configuration for request routing and load balancing.
 *
 * Controls how requests are distributed across cluster nodes.
 *
 * Fields:
 * - strategy: Load balancing algorithm to use
 * - maxRetries: Maximum retry attempts for failed requests
 * - retryDelayMs: Delay between retry attempts in milliseconds
 */
export interface RoutingConfig {
  readonly strategy: LoadBalanceStrategy;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

/**
 * Complete configuration for an MLX cluster.
 *
 * Combines discovery, health checking, cache management, and routing settings.
 *
 * Fields:
 * - discovery: Node discovery configuration
 * - health: Health check configuration
 * - cache: Cache management configuration
 * - routing: Load balancing configuration
 */
export interface MLXClusterConfig {
  readonly discovery: DiscoveryConfig;
  readonly health: HealthConfig;
  readonly cache: CacheConfig;
  readonly routing: RoutingConfig;
}

/**
 * Routing decision made by the load balancer.
 *
 * Documents which node was selected and why, for debugging and observability.
 *
 * Fields:
 * - nodeId: ID of node selected for this request
 * - reason: Human-readable explanation of why this node was chosen
 * - confidence: Confidence in this routing decision (0.0-1.0)
 */
export interface RoutingDecision {
  readonly nodeId: NodeId;
  readonly reason: string;
  readonly confidence: number;
}

/**
 * Context data for routing decisions.
 *
 * Provides the router with information about the request to make intelligent
 * routing choices (e.g., cache-aware routing based on system prompt hash).
 *
 * Fields:
 * - systemPromptHash: Hash of system prompt (for cache matching)
 * - estimatedTokens: Estimated token count for this request
 * - userPriority: Request priority level (affects routing weight)
 */
export interface RoutingContext {
  readonly systemPromptHash: string;
  readonly estimatedTokens: number;
  readonly userPriority: "low" | "normal" | "high";
}

/**
 * Aggregated metrics for the entire cluster.
 *
 * Combines metrics from all nodes to provide cluster-wide visibility.
 *
 * Fields:
 * - totalNodes: Total number of nodes in cluster
 * - healthyNodes: Number of nodes currently healthy
 * - totalRequests: Total requests handled by cluster
 * - avgClusterLatency: Average latency across all nodes (ms)
 * - overallCacheHitRate: Overall cache hit rate (0.0-1.0)
 */
export interface ClusterMetrics {
  readonly totalNodes: number;
  readonly healthyNodes: number;
  readonly totalRequests: number;
  readonly avgClusterLatency: number;
  readonly overallCacheHitRate: number;
}

/**
 * Complete state snapshot of the cluster.
 *
 * Represents the current state of all nodes and overall cluster health.
 * Used for monitoring, debugging, and administrative dashboards.
 *
 * Fields:
 * - status: Overall cluster status
 * - nodes: Array of all nodes in the cluster
 * - metrics: Aggregated cluster metrics
 * - lastUpdated: Timestamp of this state snapshot (ms since epoch)
 */
export interface ClusterState {
  readonly status: ClusterStatus;
  readonly nodes: readonly MLXNode[];
  readonly metrics: ClusterMetrics;
  readonly lastUpdated: number;
}
