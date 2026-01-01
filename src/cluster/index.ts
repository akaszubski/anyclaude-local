/**
 * MLX Cluster Management
 *
 * This module provides types, interfaces, and utilities for managing a cluster
 * of MLX inference nodes with intelligent load balancing, cache-aware routing,
 * and automatic failover.
 *
 * Key features:
 * - Health monitoring and automatic node eviction
 * - Cache-aware routing to maximize KV cache hits
 * - Multiple load balancing strategies (round-robin, least-loaded, latency-based)
 * - Node discovery (static, DNS, Kubernetes)
 * - Comprehensive metrics and observability
 *
 * @module cluster
 */

// Re-export types from cluster-types (excluding DiscoveryConfig to avoid conflict)
export type {
  NodeId,
  MLXNode,
  NodeStatus,
  NodeHealth,
  NodeCacheState,
  NodeMetrics,
  LoadBalanceStrategy,
  ClusterStatus,
  HealthConfig,
  CacheConfig,
  RoutingConfig,
  MLXClusterConfig,
  RoutingDecision,
  RoutingContext,
  ClusterMetrics,
  ClusterState,
} from "./cluster-types";
export {
  NodeStatus as NodeStatusEnum,
  LoadBalanceStrategy as LoadBalanceStrategyEnum,
  ClusterStatus as ClusterStatusEnum,
} from "./cluster-types";

// Re-export all functions and types from cluster-config
export * from "./cluster-config";

// Re-export cluster discovery (includes its own DiscoveryConfig)
export * from "./cluster-discovery";

// Re-export health monitoring
export * from "./cluster-health";

// Re-export cluster router
export * from "./cluster-router";

// Re-export cache coordination
export * from "./cluster-cache";

// Re-export cluster manager
export * from "./cluster-manager";
