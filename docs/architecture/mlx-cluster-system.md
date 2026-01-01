# MLX Cluster System Architecture

## Overview

The MLX Cluster System provides a comprehensive foundation for managing distributed MLX inference nodes with intelligent load balancing, health monitoring, and cache-aware routing. This document describes the type system and architectural design that enables clustering.

## Motivation

As anyclaude scales beyond single-server deployments, the need for distributed inference becomes critical:

- **Load Distribution**: Spread requests across multiple MLX nodes
- **High Availability**: Automatic failover when nodes become unhealthy
- **Cache Efficiency**: Route requests to nodes with matching cached prompts
- **Observability**: Monitor cluster health and performance metrics

## Core Concepts

### Node States

Each node in the cluster progresses through well-defined operational states:

```
INITIALIZING → HEALTHY ⟷ DEGRADED ⟷ UNHEALTHY → OFFLINE
     ↓                                              ↑
     └──────────────────────────────────────────────┘
```

**State Definitions**:

- **INITIALIZING**: Node is starting up or performing initial health checks. Not eligible for request routing.
- **HEALTHY**: Node is fully operational, passing all health checks, and performing normally.
- **DEGRADED**: Node is operational but experiencing elevated latency, increased error rates, or other performance issues. Still handles traffic but deprioritized.
- **UNHEALTHY**: Node is failing health checks repeatedly but remains reachable. May be experiencing transient issues.
- **OFFLINE**: Node is unreachable, shut down, or permanently unavailable.

### Cluster Status

The overall cluster status reflects the aggregate state of all nodes:

```
STARTING → HEALTHY ⟷ DEGRADED ⟷ CRITICAL → OFFLINE
```

**Status Definitions**:

- **STARTING**: Cluster is initializing. All nodes are INITIALIZING or booting.
- **HEALTHY**: All nodes are HEALTHY. Full capacity available.
- **DEGRADED**: Some nodes are DEGRADED or UNHEALTHY, but at least one HEALTHY node exists.
- **CRITICAL**: Most nodes are UNHEALTHY or OFFLINE. Minimal capacity. May reject new requests.
- **OFFLINE**: All nodes are OFFLINE. No capacity. Cluster must fail requests.

### Load Balancing Strategies

The cluster supports four load balancing strategies suitable for different use cases:

#### 1. Round Robin

Simple rotation through healthy nodes:

```
Request 1 → Node 1
Request 2 → Node 2
Request 3 → Node 3
Request 4 → Node 1 (cycle repeats)
```

**Best For**: Uniform workloads, no cache affinity, simple deployments

**Characteristics**:
- O(1) routing decision
- No state tracking required beyond node list
- Fair distribution across healthy nodes

#### 2. Least Loaded

Route to node with fewest active requests:

```
Node 1: 3 in-flight requests
Node 2: 1 in-flight request  ← Route here
Node 3: 5 in-flight requests
```

**Best For**: Variable workload durations, burst handling

**Characteristics**:
- Minimizes queue depth
- Reduces worst-case latency
- Tracks active requests per node

#### 3. Cache Aware (Primary Strategy)

Prefer nodes with matching cached system prompt:

```
System Prompt Hash: abc123def456

Node 1: cache_hash = abc123def456 ← Route here (cache hit!)
Node 2: cache_hash = xyz789uvw012
Node 3: cache_hash = abc123def456 ← Route here (cache hit!)
```

**Best For**: Repeated interactions with same system prompt (Claude Code)

**Characteristics**:
- Maximizes KV cache hit rate
- Reduces prompt processing overhead
- Falls back to least-loaded if no exact match
- Critical for single-user Claude Code scenario

#### 4. Latency Based

Route to node with lowest average response time:

```
Node 1: avg latency = 250ms
Node 2: avg latency = 150ms  ← Route here
Node 3: avg latency = 400ms
```

**Best For**: Performance-critical applications, SLA-driven routing

**Characteristics**:
- Adapts to per-node performance variations
- Helps maintain consistent user experience
- Requires historical latency tracking

### Node Health Tracking

Health is monitored through key metrics:

```typescript
interface NodeHealth {
  lastCheck: number;           // Timestamp of most recent check (ms)
  consecutiveFailures: number; // Sequential failed health checks
  avgResponseTime: number;     // Average latency (ms)
  errorRate: number;           // Fraction of failed requests (0.0-1.0)
}
```

**Health Check Flow**:

```
┌─────────────────────────────────────┐
│ Health Check Interval Triggered     │
└──────────────┬──────────────────────┘
               │
               v
┌─────────────────────────────────────┐
│ Send Health Check Request           │
│ (lightweight ping or status check)   │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        v             v
    Success      Failure
        │             │
        v             v
    Reset Count  Increment Failures
        │             │
        │      ┌──────v──────┐
        │      │ Count >     │
        │      │ Max?        │
        │      └──┬───────┬──┘
        │         │       │
        │         Yes     No
        │         │       │
        │         v       v
        │      UNHEALTHY  Stay
        │         │       │
        └─────────┴───────┘
```

**Degraded Status Trigger**: If `errorRate > unhealthyThreshold`, mark node DEGRADED.

### KV Cache State

Tracks what's cached on each node to enable cache-aware routing:

```typescript
interface NodeCacheState {
  tokens: number;              // Tokens currently in KV cache
  systemPromptHash: string;    // Hash of cached system prompt
  lastUpdated: number;         // Timestamp of last cache update
}
```

**Cache Matching Algorithm**:

```typescript
function findCacheMatch(
  systemPromptHash: string,
  nodes: MLXNode[]
): MLXNode | null {
  // Look for exact cache match
  const match = nodes.find(
    n => n.status === NodeStatus.HEALTHY &&
         n.cache.systemPromptHash === systemPromptHash
  );

  // If found, use it (avoid cache miss overhead)
  if (match) return match;

  // Otherwise fall back to least-loaded
  return leastLoadedHealthyNode(nodes);
}
```

### Cache Coordination System

The Cache Coordination System manages KV cache state across the cluster with three key responsibilities:

**1. Cache Warmup**: Initialize nodes with system prompts on cluster startup
**2. State Tracking**: Maintain registry of what's cached on each node
**3. Synchronization**: Periodically poll nodes to update cache state

#### Cache Warmup Pattern

When the cluster initializes, all nodes warm up their KV caches with the system prompt:

```
Startup Sequence:
1. Load system prompt from config
2. Hash system prompt (SHA256) for identification
3. Warm up nodes in parallel with concurrency control (e.g., 4 at a time)
4. Register successful warmups in cache registry
5. Start periodic sync loop (default: 30 second intervals)

Benefits:
- Reduces latency on first real request (prompt already cached)
- Maximizes cache hit rate from the start
- Coordinates across cluster to avoid duplicate warmups
- Handles timeouts gracefully without blocking startup
```

#### Cache Registry

The registry tracks which nodes have which cached prompts using two indexes:

```typescript
// Primary index: nodeId → CacheEntry
entries: Map<string, {
  nodeId: string;
  nodeUrl: string;
  systemPromptHash: string;
  tokens: number;
  lastUpdated: number;
  hitRate?: number;
}>

// Hash index: systemPromptHash → Set<nodeId>
hashIndex: Map<string, Set<string>>
```

This dual-index design enables:
- **O(1) node lookup**: `registry.get(nodeId)` returns cache state instantly
- **O(1) cache lookup**: `registry.findNodesWithCache(hash)` finds all nodes with specific cache
- **Automatic synchronization**: Hash index updates automatically on set/delete operations

#### Cache Synchronization

Periodic synchronization keeps cache state fresh across the cluster:

```
Sync Loop:
1. Check if sync already in progress (prevent overlap)
2. Poll all nodes in parallel: GET /v1/cluster/cache
3. Collect responses: {systemPromptHash, tokens, hitRate}
4. Update registry with fresh state
5. Expire stale entries (older than maxCacheAgeSec)
6. Call onCacheSyncComplete callback with stats
7. Schedule next sync (respects interval, not blocked by duration)

Error Handling:
- Individual node failures don't stop overall sync
- Failed nodes are tracked separately from successful syncs
- Errors are reported via onCacheSyncError callback
- Cluster continues operating even if all syncs fail
```

#### Integration with Router

Cache coordination enables efficient routing:

```typescript
// Router receives routing context with system prompt hash
const context: RoutingContext = {
  systemPromptHash: 'abc123def456...',
  estimatedTokens: 5000,
};

// Look up nodes with matching cache
const cachedNodes = cacheRegistry.findNodesWithCache(context.systemPromptHash);

if (cachedNodes.length > 0) {
  // Route to cached node for KV cache hit
  return selectBestCachedNode(cachedNodes, healthyNodes);
} else {
  // Fall back to normal routing (will incur cache miss)
  return selectNodeByStrategy(healthyNodes, strategy);
}
```

#### Configuration

Cache coordination is configured via `CacheConfig`:

```typescript
interface CacheConfig {
  maxCacheAgeSec: number;        // TTL before cache entry expires (default: 300s)
  maxCacheSizeTokens: number;    // Maximum tokens per cache (default: 1M)
  minCacheHitRate: number;       // Minimum acceptable hit rate (default: 0.7)
}
```

**Tuning Guidelines**:

- **maxCacheAgeSec**: Lower values (60-180s) for frequently changing prompts, higher (300-600s) for stable systems
- **maxCacheSizeTokens**: Match your model's context window minus buffer for new tokens
- **minCacheHitRate**: Higher threshold (0.8-0.9) means cache hits only when very confident; lower (0.5-0.7) accepts more cache misses

#### Example: Cache-Aware Cluster Initialization

```typescript
import { ClusterCache } from './cluster/cluster-cache';

// 1. Create cache coordinator
const cacheCoordinator = new ClusterCache(
  { maxCacheAgeSec: 300 },
  {
    onCacheWarmedUp: (result) => {
      console.log(`[Cache] Node ${result.nodeId} warmed up in ${result.durationMs}ms`);
    },
    onCacheSyncComplete: (stats) => {
      console.log(`[Cache] Synced ${stats.syncedNodes}/${stats.totalNodes} nodes`);
    },
  }
);

// 2. Initialize with warmup and sync
const systemPrompt = loadSystemPrompt();
await cacheCoordinator.initialize(
  nodes,
  systemPrompt,
  {
    concurrency: 4,           // Warm 4 nodes at a time
    timeoutMs: 30000,         // 30 second timeout per node
    retryCount: 2,            // Retry failed warmups up to 2 times
    systemPrompt,
  },
  30000  // Sync every 30 seconds
);

// 3. Use in routing decisions
const context = {
  systemPromptHash: sha256(systemPrompt),
  estimatedTokens: 5000,
};

const cachedNodes = cacheCoordinator.findNodesWithCache(context.systemPromptHash);
if (cachedNodes.length > 0) {
  console.log(`Cache hit on ${cachedNodes.length} nodes!`);
  // Route to cached node for performance
}

// 4. Shutdown when cluster stops
cacheCoordinator.stop();
```

### Node Discovery

The cluster supports multiple discovery mechanisms for different deployment scenarios:

#### Static Discovery

Fixed list of known nodes in configuration:

```json
{
  "discovery": {
    "mode": "static",
    "nodes": [
      { "id": "node-1", "url": "http://10.0.1.10:8082/v1" },
      { "id": "node-2", "url": "http://10.0.1.11:8082/v1" },
      { "id": "node-3", "url": "http://10.0.1.12:8082/v1" }
    ]
  }
}
```

**Best For**: Small, stable clusters, local development

#### DNS Discovery

Dynamic discovery via DNS SRV records:

```json
{
  "discovery": {
    "mode": "dns",
    "dnsName": "_mlx._tcp.internal.example.com",
    "port": 8082
  }
}
```

**Query Flow**:

```
DNS Query: _mlx._tcp.internal.example.com SRV
    ↓
Returns: mlx-1.internal.example.com:8082
         mlx-2.internal.example.com:8082
         mlx-3.internal.example.com:8082
    ↓
Resolve each hostname to IP
    ↓
Connect to http://10.0.1.10:8082/v1, etc.
```

**Best For**: Cloud deployments, dynamic scaling, service discovery

#### Kubernetes Discovery

Service discovery via Kubernetes API:

```json
{
  "discovery": {
    "mode": "kubernetes",
    "namespace": "mlx-cluster",
    "serviceLabel": "app=mlx-worker"
  }
}
```

**Query Flow**:

```
List Pods in namespace with label app=mlx-worker
    ↓
Get Pod IPs and container ports
    ↓
Connect to http://<pod-ip>:8082/v1 for each pod
    ↓
Perform initial health check
    ↓
Add healthy pods to available nodes
```

**Best For**: Kubernetes deployments, high availability, auto-scaling

## Health Monitoring System

The health monitoring system tracks the reliability and availability of cluster nodes using a circuit breaker pattern with exponential backoff. This enables intelligent routing decisions and automatic failover.

### Circuit Breaker Pattern

Each node progresses through a well-defined state machine:

```
INITIALIZING
    |
    +-- first success --> HEALTHY
    |
HEALTHY <--> DEGRADED
   |            |
   |        +---+--------+
   |        | too many   |
   |        | failures   |
   |        v            |
   +---> UNHEALTHY <-----+
        |     ^
        | backoff
        | retry
        v
     OFFLINE
```

**State Transitions**:

1. **INITIALIZING to HEALTHY**: First successful health check
2. **HEALTHY to DEGRADED**: Success rate drops below 80% (configurable)
3. **DEGRADED to UNHEALTHY**: Success rate drops below 50% (configurable)
4. **UNHEALTHY to OFFLINE**: Exponential backoff expires with continued failures
5. **Any state to HEALTHY**: Sufficient consecutive successes (default: 5)

### Rolling Window Metrics

Health metrics are calculated using a circular buffer with time-window filtering:

```typescript
// Collect samples over time
[success, success, failure, success, success, ...]
                                    ^
                              Current time

// Filter by window (last 30 seconds)
[success at t-10s, success at t-5s, failure at t-3s, ...]

// Calculate metrics
successRate = 2/3 = 0.67
avgLatency = (125 + 140 + timeout) / 3 = ...
consecutiveSuccesses = 2 (most recent)
consecutiveFailures = 0
```

**Benefits**:
- O(1) recording (circular buffer append)
- O(n) metric calculation (filters by time window)
- Automatic age-out of old samples
- Fast state transitions on consecutive successes/failures

### Exponential Backoff

When a node transitions to UNHEALTHY or OFFLINE, it enters exponential backoff:

```
Attempt 1: Fail
  Wait: 1s (initialDelayMs)

Attempt 2: Fail
  Wait: 2s (1s * multiplier)

Attempt 3: Fail
  Wait: 4s (2s * multiplier)

Attempt 4: Fail
  Wait: 8s (4s * multiplier)

...max delay: 60s (configurable maxDelayMs)
```

**Configuration**:
```typescript
{
  initialDelayMs: 1000,      // Starting delay
  maxDelayMs: 60000,         // Cap at 60 seconds
  multiplier: 2              // Double each time
}
```

**Purpose**:
- Prevent hammering recovering nodes
- Allow time for transient issues to resolve
- Reduce resource usage on unstable nodes

### Integration with Routing

The router uses health metrics to make intelligent decisions:

```typescript
// Example: Cache-aware routing with health fallback
function selectNode(nodes, health, systemPromptHash) {
  // Prefer healthy nodes with cache match
  const healthy = nodes.filter(n => health.isHealthy(n.id));
  const cached = healthy.find(n => n.cache.systemPromptHash === systemPromptHash);
  if (cached) return cached;

  // Fall back to any healthy node
  if (healthy.length > 0) return healthy[0];

  // Last resort: degraded node (not UNHEALTHY or OFFLINE)
  const degraded = nodes.filter(n => {
    const status = health.getNodeHealth(n.id).status;
    return status === 'DEGRADED';
  });
  return degraded[0] || null;
}
```

### Configuration

Health monitoring is configured via HealthConfig:

```typescript
{
  checkIntervalMs: 5000,           // Check every 5 seconds
  timeoutMs: 2000,                 // 2 second timeout per check
  maxConsecutiveFailures: 3,       // 3 failures = UNHEALTHY
  unhealthyThreshold: 0.5,         // 50% success = UNHEALTHY
  degradedThreshold: 0.8           // 80% success = DEGRADED
}
```

### Components

**src/cluster/cluster-health.ts** (967 lines):
1. **RollingWindowMetrics** - Circular buffer for metric tracking
2. **NodeHealthTracker** - Per-node circuit breaker implementation
3. **ClusterHealth** - Orchestrator for all nodes
4. **Error classes** - HealthCheckTimeoutError, HealthCheckFailedError, HealthCheckNetworkError

**Test Coverage**: 150+ comprehensive unit tests covering:
- State transitions and thresholds
- Exponential backoff timing
- Time-window metric calculations
- Callback invocation order
- Edge cases (rapid start/stop, concurrent failures)

See docs/reference/cluster-health-api.md for complete API documentation.

## Type System

### Core Interfaces

```typescript
// Unique node identifier
type NodeId = string;

// Node status enum
enum NodeStatus {
  INITIALIZING,
  HEALTHY,
  DEGRADED,
  UNHEALTHY,
  OFFLINE
}

// Cluster status enum
enum ClusterStatus {
  STARTING,
  HEALTHY,
  DEGRADED,
  CRITICAL,
  OFFLINE
}

// Load balancing strategies
enum LoadBalanceStrategy {
  ROUND_ROBIN,
  LEAST_LOADED,
  CACHE_AWARE,
  LATENCY_BASED
}
```

### Complete Node Representation

```typescript
interface MLXNode {
  id: NodeId;                  // Unique identifier
  url: string;                 // HTTP endpoint
  status: NodeStatus;          // Current operational state
  health: NodeHealth;          // Health metrics
  cache: NodeCacheState;       // KV cache state
  metrics: NodeMetrics;        // Performance metrics
}
```

### Configuration

```typescript
interface MLXClusterConfig {
  discovery: DiscoveryConfig;  // How to find nodes
  health: HealthConfig;        // Health check settings
  cache: CacheConfig;          // Cache management settings
  routing: RoutingConfig;      // Load balancing settings
}
```

## Cluster State Management

The cluster maintains a complete state snapshot:

```typescript
interface ClusterState {
  status: ClusterStatus;       // Overall cluster health
  nodes: MLXNode[];            // All nodes with current state
  metrics: ClusterMetrics;     // Aggregated metrics
  lastUpdated: number;         // Snapshot timestamp
}
```

### State Updates

State is updated through:

1. **Health Checks**: Periodic checks update node status and metrics
2. **Request Processing**: Track in-flight requests, latency, errors
3. **Cache Invalidation**: Update cache state as nodes clear/repopulate KV cache
4. **Manual Updates**: Administrative actions (node removal, status override)

### Observability

The ClusterMetrics interface provides visibility:

```typescript
interface ClusterMetrics {
  totalNodes: number;          // Total configured nodes
  healthyNodes: number;        // Currently healthy nodes
  totalRequests: number;       // Cumulative request count
  avgClusterLatency: number;   // Average response time (ms)
  overallCacheHitRate: number; // Cache hit rate (0.0-1.0)
}
```

## Cluster Manager Orchestration

The `ClusterManager` class provides unified orchestration of all cluster subsystems, serving as the main entry point for cluster operations.

### Architecture

The ClusterManager coordinates five major components:

1. **ClusterDiscovery** - Finding and validating nodes
2. **ClusterHealth** - Monitoring node health and reliability
3. **ClusterRouter** - Selecting nodes based on strategy and context
4. **ClusterCache** - Coordinating KV cache state across nodes
5. **Provider Management** - Creating AI SDK providers for each node

```
┌─────────────────────────────────────────────────┐
│         ClusterManager (Singleton)              │
├─────────────────────────────────────────────────┤
│                                                 │
│  initializeCluster()                            │
│  getClusterManager()                            │
│  resetClusterManager()                          │
│                                                 │
├─────────────────────────────────────────────────┤
│   Public API:                                   │
│   • selectNode()         - Route request        │
│   • getNodeProvider()    - Get provider         │
│   • recordNodeSuccess()  - Update metrics       │
│   • recordNodeFailure()  - Track errors         │
│   • getStatus()          - Cluster snapshot     │
│   • shutdown()           - Graceful cleanup     │
├─────────────────────────────────────────────────┤
│                 Subsystems                      │
│  ┌────────────┐  ┌────────┐  ┌────────┐        │
│  │ Discovery  │  │ Health │  │ Router │        │
│  └────────────┘  └────────┘  └────────┘        │
│  ┌────────────┐  ┌──────────────┐              │
│  │   Cache    │  │   Providers  │              │
│  └────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────┘
```

### Initialization Sequence

ClusterManager initialization follows a precise sequence:

```
1. Validate Configuration
   ↓
2. Start Discovery
   ↓
3. Get Discovered Nodes
   ↓
4. Create Providers (per-node AI SDK instances)
   ↓
5. Start Health Checks
   ↓
6. Initialize Cache (non-fatal if fails)
   ↓
7. Create Router
   ↓
8. Set initialized = true
```

Each step integrates with the next:
- Discovery provides node list for providers and health checks
- Providers are created immediately to avoid delays during routing
- Health checks monitor discovered nodes
- Cache uses discovered nodes for warmup
- Router uses health and cache data for routing decisions

### Singleton Pattern

The ClusterManager uses the singleton pattern for lifecycle management:

```typescript
// Initialize once per application
const manager = await initializeCluster(config);

// Retrieve throughout application
const manager = getClusterManager();

// Reset when shutting down
resetClusterManager();
```

Key guarantees:
- **Single instance**: Only one ClusterManager per process
- **Prevent concurrent initialization**: Throws if already initializing
- **Graceful reset**: Safe to call resetClusterManager() multiple times
- **Idempotent shutdown**: Components handle multiple shutdowns gracefully

### Node Selection

The ClusterManager selects nodes for routing:

```typescript
const node = manager.selectNode(systemPromptHash, toolsHash, sessionId);
```

Selection process:
1. **Filter discovered nodes** to only healthy ones
2. **Build routing context** with prompt/tools hashes
3. **Call router** with session ID (for sticky routing)
4. **Return selected node** or null if no healthy nodes

The router integrates:
- **Health filtering**: Only routes to HEALTHY or DEGRADED nodes
- **Cache affinity**: Prioritizes nodes with matching cache
- **Session affinity**: Routes subsequent requests to same node
- **Load balancing**: Distributes across available nodes

### Provider Management

For each node, ClusterManager creates an AI SDK provider:

```typescript
const provider = manager.getNodeProvider(node.id);
const result = await generateText({
  model: provider('qwen2.5-coder:7b'),
  prompt: 'Your prompt...'
});
```

Provider creation (createProviderForNode):
- Uses `@ai-sdk/openai` for OpenAI-compatible servers
- Implements custom fetch for LMStudio compatibility
- Maps `max_tokens` → `max_completion_tokens`
- Enables llama.cpp's `cache_prompt` parameter
- Removes unsupported parameters (reasoning, service_tier)

### Status Reporting

The `getStatus()` method provides real-time cluster visibility:

```typescript
const status = manager.getStatus();
// {
//   initialized: true,
//   totalNodes: 3,
//   healthyNodes: 2,
//   nodes: [
//     { id: 'n1', url: 'http://...', healthy: true, latencyMs: 45, errorCount: 0 },
//     { id: 'n2', url: 'http://...', healthy: true, latencyMs: 52, errorCount: 1 },
//     { id: 'n3', url: 'http://...', healthy: false, latencyMs: undefined, errorCount: 15 }
//   ],
//   cacheStats: { nodeCount: 3, cacheCount: 2, uniqueHashes: 1 }
// }
```

Status includes:
- **Initialization status**: Whether manager is ready
- **Node counts**: Total vs healthy
- **Per-node details**: Health, latency, error counts
- **Cache stats**: Optional, if cache enabled

### Graceful Shutdown

The `shutdown()` method cleans up all resources:

```typescript
await manager.shutdown();
resetClusterManager();
```

Cleanup sequence (order matters!):
1. **Stop discovery** - No new nodes discovered
2. **Stop health checks** - No more health updates
3. **Stop cache** - Cache synchronization stops
4. **Destroy router** - Router resources released
5. **Clear providers** - AI SDK providers destroyed
6. **Set initialized = false** - Ready for re-initialization

The sequence prevents ordering issues:
- Discovery stops first (no race with health checks)
- Health stops before cache (cache depends on health state)
- Router destroys before providers (router may use providers)
- Set initialized flag last (graceful state transition)

### Error Handling

ClusterManager uses typed errors with descriptive codes:

- **ALREADY_INITIALIZED**: Prevents multiple managers
- **INITIALIZING**: Prevents concurrent initialization
- **INVALID_CONFIG**: Configuration validation failed
- **INITIALIZATION_FAILED**: Wrapped initialization errors
- **NOT_INITIALIZED**: getClusterManager() called before init

All errors inherit from `ClusterManagerError` with:
- `code`: Machine-readable error identifier
- `message`: Human-readable description
- `cause`: Original error (if wrapped)

### Usage Pattern

Complete workflow example:

```typescript
import {
  initializeCluster,
  getClusterManager,
  resetClusterManager,
} from './cluster';

// 1. Initialize cluster (once at startup)
const config: MLXClusterConfig = {
  discovery: { mode: 'static', nodes: [...] },
  health: { checkIntervalMs: 10000, ... },
  cache: { maxCacheAgeSec: 300, ... },
  routing: { strategy: 'cache-aware', ... }
};

const manager = await initializeCluster(config);

// 2. Use cluster throughout application
async function handleRequest(prompt: string, sessionId: string) {
  // Get manager instance
  const mgr = getClusterManager();

  // Select node for routing
  const node = mgr.selectNode(
    hashSystemPrompt(SYSTEM_PROMPT),
    hashTools(TOOLS),
    sessionId
  );

  if (!node) {
    throw new Error('No healthy nodes available');
  }

  // Get provider and execute request
  const provider = mgr.getNodeProvider(node.id);
  const startTime = Date.now();

  try {
    const result = await generateText({
      model: provider('qwen2.5-coder:7b'),
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      prompt
    });

    // Record success
    const latency = Date.now() - startTime;
    mgr.recordNodeSuccess(node.id, latency);

    return result;
  } catch (error) {
    // Record failure
    mgr.recordNodeFailure(node.id, error as Error);

    // Retry with different node or propagate error
    throw error;
  }
}

// 3. Monitor cluster health
function logClusterStatus() {
  const mgr = getClusterManager();
  const status = mgr.getStatus();

  console.log(`Cluster: ${status.healthyNodes}/${status.totalNodes} healthy`);
  console.log(`Cache: ${status.cacheStats?.cacheCount} cached, ${status.cacheStats?.uniqueHashes} unique`);

  for (const node of status.nodes) {
    console.log(`  ${node.id}: ${node.healthy ? 'HEALTHY' : 'UNHEALTHY'} (latency: ${node.latencyMs}ms)`);
  }
}

// 4. Graceful shutdown (on process exit)
process.on('SIGTERM', async () => {
  console.log('Shutting down cluster...');
  await getClusterManager().shutdown();
  resetClusterManager();
  process.exit(0);
});
```

## Implementation Roadmap

The cluster system is being built in layered phases with comprehensive testing at each stage:

### Phase 1: Types (COMPLETE - Issue #22)
- Comprehensive TypeScript interfaces
- Enum definitions for states and strategies
- 100+ unit tests for type validation
- Documentation with examples

### Phase 2: Core Infrastructure (COMPLETE)
- **Issue #23**: Configuration Parser (654 lines, 97 tests)
  - File-based and environment variable configuration
  - Comprehensive validation with error reporting
  - Support for static, DNS, and Kubernetes discovery modes

- **Issue #24**: Node Discovery System (409 lines, 87 tests)
  - Periodic node discovery with HTTP validation
  - Lifecycle callbacks for operational monitoring
  - Static discovery mode with extensibility for DNS/K8s

- **Issue #25**: Health Monitoring (967 lines, 150+ tests)
  - Circuit breaker pattern with rolling window metrics
  - Exponential backoff for unhealthy nodes
  - State machine transitions: INITIALIZING → HEALTHY ↔ DEGRADED ↔ UNHEALTHY → OFFLINE

- **Issue #26**: Request Router (735 lines)
  - Multi-strategy request routing
  - Cache-affinity scoring algorithm
  - Sticky session management with TTL expiration
  - Strategies: ROUND_ROBIN, LEAST_LOADED, CACHE_AWARE, LATENCY_BASED

- **Issue #27**: KV Cache Coordination (696 lines, 100+ tests)
  - Multi-component cache management system
  - Hash-indexed cache state tracking per node
  - Parallel cache warming with concurrency control
  - Periodic cache synchronization
  - Metrics tracking: Hit rates, node counts, cache statistics

- **Issue #28**: Main Cluster Orchestration (743 lines, 120+ tests)
  - Central coordination of cluster discovery, health, cache, and routing
  - Singleton pattern for lifecycle management
  - AI SDK provider creation and management
  - Node selection with session affinity
  - Real-time cluster status reporting
  - Graceful shutdown with proper cleanup sequencing

### Phase 3: Integration (IN PROGRESS - Issue #28)
- Central cluster orchestration providing unified API
- Integrates all cluster subsystems (discovery, health, cache, routing)
- Provider management for per-node AI SDK instances
- Session affinity support for multi-turn conversations
- Real-time cluster health metrics
- Planned: Integrate into proxy request handling
- Planned: Cache invalidation signals from health monitoring
- Planned: Administrative API for cluster management
- Planned: Observability dashboard with metrics visualization

### Phase 4: Production Hardening (Planned)
- Load testing and performance optimization
- Advanced auto-recovery mechanisms
- Cluster rebalancing strategies
- Disaster recovery procedures
- Geographic failover for multi-region deployments

## Example Usage

### Creating a Cluster Configuration

```typescript
import {
  MLXClusterConfig,
  DiscoveryConfig,
  HealthConfig,
  CacheConfig,
  RoutingConfig,
  LoadBalanceStrategy
} from './cluster/cluster-types';

const config: MLXClusterConfig = {
  discovery: {
    mode: 'static',
    nodes: [
      { id: 'node-1', url: 'http://10.0.1.10:8082/v1' },
      { id: 'node-2', url: 'http://10.0.1.11:8082/v1' },
      { id: 'node-3', url: 'http://10.0.1.12:8082/v1' }
    ]
  },
  health: {
    checkIntervalMs: 5000,
    timeoutMs: 3000,
    maxConsecutiveFailures: 3,
    unhealthyThreshold: 0.15
  },
  cache: {
    maxCacheAgeSec: 3600,
    minCacheHitRate: 0.6,
    maxCacheSizeTokens: 32768
  },
  routing: {
    strategy: LoadBalanceStrategy.CACHE_AWARE,
    maxRetries: 2,
    retryDelayMs: 100
  }
};
```

### Routing a Request

```typescript
import { RoutingContext, LoadBalanceStrategy } from './cluster/cluster-types';
import { ClusterRouter } from './cluster/cluster-router';

const config: RoutingConfig = {
  strategy: LoadBalanceStrategy.CACHE_AWARE,
  maxRetries: 3,
  retryDelayMs: 100
};

const router = new ClusterRouter(config, 300000, {
  onNodeSelected: (decision) => {
    console.log(`Routed to ${decision.nodeId}: ${decision.reason}`);
  },
  onRoutingFailed: (context, reason) => {
    console.error(`Routing failed: ${reason}`);
  }
});

const context: RoutingContext = {
  systemPromptHash: 'abc123def456',
  estimatedTokens: 15000,
  userPriority: 'normal'
};

// Stateless routing (e.g., one-off requests)
const decision = router.selectNode(nodes, context);
if (decision) {
  // Route request to decision.nodeId
  console.log(`Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
}

// Session-based routing (e.g., multi-turn conversations)
const decision2 = router.selectNodeWithSticky(nodes, context, 'user-123');
// Next request from user-123 will use same node (while session valid)
```

### Request Router Implementation

The `ClusterRouter` class provides intelligent request routing with multiple strategies and session affinity:

**Key Features**:

1. **Multiple Routing Strategies**:
   - **ROUND_ROBIN**: Simple rotation through healthy nodes
   - **LEAST_LOADED**: Route to node with fewest active requests
   - **CACHE_AWARE** (Primary): Score nodes based on cache match, health, and availability
   - **LATENCY_BASED**: Route to node with lowest average response time

2. **Cache-Affinity Scoring** (CACHE_AWARE strategy):
   - Cache match: +50 points (if systemPromptHash matches)
   - Tools match: +20 points (only if cache matches)
   - Health score: +25 * successRate (0-25 points)
   - Availability: +15 points if requestsInFlight < 5
   - Recency: +10 points if cache updated within 60 seconds
   - **Total maximum: 120 points**
   - Confidence = total / 120
   - Falls back to round-robin if no cache hits found

3. **Session Management**:
   - TTL-based session tracking (default: 5 minutes)
   - Sticky sessions: Route subsequent requests to same node while session valid
   - Automatic cleanup: Expired sessions removed periodically
   - Lifecycle callbacks: onSessionCreated, onSessionExpired

4. **Health-Aware Filtering**:
   - Only routes to HEALTHY or DEGRADED nodes
   - Automatically skips UNHEALTHY, OFFLINE nodes
   - Integration with ClusterHealth for real-time status

5. **Observability**:
   - Routing reason explains decision (e.g., "cache-aware: score 115/120")
   - Confidence score indicates decision quality (0.0-1.0)
   - Callbacks for routing decisions and failures
   - Error handling: Callback exceptions don't break routing

## Integration Points

The cluster system integrates with:

1. **Proxy Server** (`src/anthropic-proxy.ts`)
   - Routes incoming requests to best node
   - Collects response metrics
   - Handles failover

2. **Message Conversion** (`src/convert-anthropic-messages.ts`)
   - May be duplicated per-node or shared
   - Caches converted schemas per-node

3. **Configuration** (`.anyclauderc.json`)
   - Node list and discovery settings
   - Health check parameters
   - Load balancing strategy

4. **Monitoring & Observability**
   - Health check alerts
   - Metrics export
   - Dashboard integration

## Security Considerations

- **Node Authentication**: Use API keys per node (in `HealthConfig`)
- **Request Isolation**: Ensure user A's cache doesn't leak to user B
- **System Prompt Privacy**: Hash algorithm must not reveal prompt content
- **Network Security**: All inter-node communication should use TLS

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Node selection (round-robin) | O(1) | Increment counter modulo node count |
| Node selection (least-loaded) | O(n) | Linear scan through nodes |
| Node selection (cache-aware) | O(n) | Hash lookup + least-loaded fallback |
| Health check | O(1) per node | Independent operations |
| Cluster state update | O(n) | Aggregate metrics across all nodes |

## Testing

The type system includes comprehensive unit tests:

- **Node state transitions**: Validate valid state changes
- **Health metric calculations**: Verify averaging and thresholds
- **Cache state management**: Test hash tracking
- **Configuration validation**: Ensure required fields present
- **Discovery modes**: Verify static, DNS, Kubernetes support
- **Routing context**: Test confidence scoring
- **Edge cases**: Null handling, boundary values, invalid configs

See `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/cluster-types.test.ts` for full test suite.

## References

- [Keep a Changelog Format](https://keepachangelog.com/)
- [TypeScript Handbook - Interfaces](https://www.typescriptlang.org/docs/handbook/interfaces.html)
- [DNS SRV Records - RFC 2782](https://tools.ietf.org/html/rfc2782)
- [Kubernetes Service Discovery](https://kubernetes.io/docs/concepts/services-networking/service/)
