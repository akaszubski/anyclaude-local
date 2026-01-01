## Summary

Update anthropic-proxy.ts to route requests through the MLX cluster when in cluster mode.

## Background

The proxy needs to select a cluster node for each request and handle cluster-specific failures.

## Requirements

### Request Routing

In the LMStudio/OpenRouter code path, add cluster handling:

1. If mode is mlx-cluster, get ClusterManager
2. Compute systemPromptHash and toolsHash
3. Call selectNode() to get target node
4. Get node-specific provider from ClusterManager
5. Use that provider for streamText()

### Session Handling

Extract or generate session ID for sticky routing:

- From request headers (X-Session-Id)
- From conversation context
- Generate UUID if not present

### Error Handling

If no healthy nodes available:

- Return 503 with cluster_unavailable error
- Include retry-after header

If node fails mid-stream:

- Record failure with ClusterManager
- Attempt retry on different node (if no content emitted)
- Otherwise propagate error to client

### Metrics

Record per-request:

- Selected node
- Cache hit (was system prompt cached?)
- Latency
- Success/failure

## File Location

Modify: src/anthropic-proxy.ts (around lines 460-480)

## Dependencies

- src/cluster/cluster-manager.ts
- src/cluster/cluster-types.ts

## Acceptance Criteria

- [ ] Cluster node selection before streamText
- [ ] Session-based sticky routing
- [ ] 503 response when no nodes available
- [ ] Failure recording updates cluster health
- [ ] Mid-stream failure handling
- [ ] Request metrics collected
- [ ] Debug logging for routing decisions
- [ ] No regression for other modes

## Labels

phase-3, integration, proxy, routing
