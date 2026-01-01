## Summary

Create TypeScript type definitions for the distributed MLX cluster infrastructure.

## Background

The distributed MLX cluster needs well-defined types for nodes, configuration, routing, cache state, and health monitoring.

## Requirements

### Node Types

- NodeId: string
- NodeStatus: id, url, health, cache, weight, tags
- NodeHealth: isHealthy, successRate, failureCount, lastCheck, state
- NodeCacheState: systemPromptHash, toolsHash, cacheCapacity, cacheUsed, hitRate, isWarm

### Configuration Types

- MLXClusterConfig: enabled, discovery, routing, cache, health, metrics
- DiscoveryConfig: method (static/mdns), staticNodes, mdnsService, refreshInterval
- RoutingConfig: strategy, stickySession, stickyTTL, maxRetries
- CacheConfig: systemPromptWarmup, warmupOnDiscovery, shareSystemPrompt
- HealthConfig: checkInterval, timeout, failureThreshold, recoveryThreshold

### Routing Types

- LoadBalanceStrategy: "cache-affinity" | "round-robin" | "least-connections" | "random"
- RoutingDecision: nodeId, reason, score, cacheHit

### State Types

- ClusterStatus: nodeCount, healthyNodes, nodes[], routing, metrics
- ClusterMetrics: totalRequests, successRate, avgLatency, cacheHitRate

## File Location

src/cluster/cluster-types.ts

## Acceptance Criteria

- [ ] All types exported and documented with JSDoc
- [ ] Consistent naming convention (PascalCase for types)
- [ ] Optional fields marked with ?
- [ ] Sensible default values documented
- [ ] Types are strict (no any or unknown unless necessary)
- [ ] Re-export from src/cluster/index.ts

## Labels

phase-2, cluster, types
