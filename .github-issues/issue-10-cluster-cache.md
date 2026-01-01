## Summary

Create KV cache coordination for the MLX cluster to share system prompt cache across nodes.

## Background

The system prompt takes 2-3 minutes to process. We need to cache it once and share across all nodes to eliminate this delay on follow-up requests.

## Requirements

### Cache Warmup

1. On cluster initialization, warm all nodes with Claude Code system prompt
2. Compute KV cache on coordinator, broadcast to workers
3. Track which nodes have which cache warm

### Cache State Sync

Periodically sync cache state from all nodes:

- GET /v1/cluster/cache returns NodeCacheState
- Update local registry with node cache states

### Functions to Implement

1. warmUpNodes(nodes: Map<string, NodeStatus>): Promise<void>
2. warmUpNode(node: NodeStatus): Promise<void>
3. syncCacheState(nodes: Map<string, NodeStatus>): Promise<void>
4. getCacheRegistry(): Map<string, CacheEntry>
5. findNodesWithCache(cacheKey: string): string[]

### Cache Entry

- key: SHA-256 hash of system prompt
- tokenCount: number of tokens cached
- memoryBytes: serialized size
- nodes: list of nodes with this cache warm
- lastAccess: timestamp

## File Location

src/cluster/cluster-cache.ts

## Dependencies

- src/cluster/cluster-types.ts
- src/cluster/cluster-discovery.ts

## Acceptance Criteria

- [ ] Cache warmup on cluster initialization
- [ ] Parallel warmup with configurable concurrency
- [ ] Periodic cache state synchronization
- [ ] Registry tracks which nodes have which cache
- [ ] Warmup failures don't block cluster startup
- [ ] Cache metrics exposed for monitoring
- [ ] Unit tests for warmup and sync

## Labels

phase-2, cluster, caching, performance
