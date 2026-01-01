## Summary

Create the main ClusterManager class that orchestrates all cluster components.

## Background

The ClusterManager is the central coordinator that initializes and manages discovery, health, routing, and cache components.

## Requirements

### Singleton Pattern

- initializeCluster(config: MLXClusterConfig): Promise<ClusterManager>
- getClusterManager(): ClusterManager
- Throw if accessed before initialization

### Initialization Sequence

1. Parse and validate configuration
2. Discover nodes
3. Create per-node OpenAI providers
4. Start health monitoring
5. Warm up caches (if configured)
6. Start periodic cache coordination

### Core Methods

1. selectNode(systemPromptHash: string, toolsHash: string, sessionId?: string): Promise<NodeStatus | null>
2. getNodeProvider(nodeId: string): ProviderV2 | null
3. recordNodeSuccess(nodeId: string): void
4. recordNodeFailure(nodeId: string): void
5. getStatus(): ClusterStatus
6. shutdown(): Promise<void>

### Per-Node Provider

Create OpenAI provider for each node:

- Use node URL as baseURL
- Add cluster headers (X-Cluster-Node, X-Cluster-Request-Id)
- Apply LMStudio compatibility fixes (cache_prompt, etc.)

## File Location

src/cluster/cluster-manager.ts

## Dependencies

- src/cluster/cluster-types.ts
- src/cluster/cluster-config.ts
- src/cluster/cluster-discovery.ts
- src/cluster/cluster-health.ts
- src/cluster/cluster-router.ts
- src/cluster/cluster-cache.ts
- @ai-sdk/openai for providers

## Acceptance Criteria

- [ ] Singleton pattern with proper initialization
- [ ] All components initialized in correct order
- [ ] Per-node providers created correctly
- [ ] Node selection uses router with sticky sessions
- [ ] Success/failure recording updates health
- [ ] Status endpoint returns full cluster state
- [ ] Graceful shutdown stops all components
- [ ] Integration tests with mock cluster

## Labels

phase-2, cluster, orchestration, critical
