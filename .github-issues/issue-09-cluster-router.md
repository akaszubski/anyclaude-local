## Summary

Create cache-affinity request router for the MLX cluster.

## Background

Route requests to nodes that already have the system prompt KV cache warm to minimize first-token latency.

## Requirements

### Routing Strategies

1. cache-affinity (default): Prefer nodes with matching cache
2. round-robin: Distribute evenly
3. least-connections: Route to least busy
4. random: Random selection (testing)

### Cache-Affinity Algorithm

Score each healthy node:

- Cache match: +50 points (system prompt hash matches)
- Tools match: +20 points (tools hash also matches)
- Health score: +25 points \* successRate
- Availability: +15 points \* (1 - cacheUsed/cacheCapacity)
- Recency bonus: +10 points if used in last minute

Select highest scoring node.

### Sticky Sessions

- Track sessionId -> nodeId mapping
- Prefer same node for conversation continuity
- Clear sticky after TTL or node unhealthy

### Functions to Implement

1. selectNode(nodes: NodeStatus[], systemPromptHash: string, toolsHash: string): NodeStatus | null
2. selectNodeWithSticky(sessionId: string, ...): NodeStatus | null
3. getRoutingPlan(requests: Request[]): Map<string, Request[]> - Batch routing

## File Location

src/cluster/cluster-router.ts

## Dependencies

- src/cluster/cluster-types.ts
- src/cluster/cluster-health.ts

## Acceptance Criteria

- [ ] All 4 routing strategies implemented
- [ ] Cache-affinity scoring is correct
- [ ] Sticky sessions work with TTL
- [ ] Only healthy nodes selected
- [ ] Batch routing groups by cache key
- [ ] Routing decisions logged at debug level
- [ ] Unit tests for each strategy

## Labels

phase-2, cluster, routing, performance
