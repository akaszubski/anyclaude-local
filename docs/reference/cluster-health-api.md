# MLX Cluster Health Monitoring API Reference

**Module**: `src/cluster/cluster-health.ts` (967 lines)
**Tests**: `tests/unit/cluster-health.test.ts` (1527 lines, 150+ tests)
**Status**: Production-ready

---

## Overview

The cluster health monitoring module provides comprehensive health tracking for MLX cluster nodes using a circuit breaker pattern. It enables intelligent routing by monitoring node reliability over time and automatically managing node availability based on health metrics.

**Key Features**:
- Time-windowed success rate and latency tracking
- Circuit breaker state machine with automatic failover
- Exponential backoff for unhealthy nodes
- Rolling window metrics (configurable time window and sample limits)
- Callback-based monitoring for health status changes
- Manual health recording from request routing

---

## Core Classes

### RollingWindowMetrics

Tracks success rate and latency over a rolling time window using a circular buffer.

```typescript
new RollingWindowMetrics(
  windowSizeMs?: number,    // Default: 30000 (30 seconds)
  maxSamples?: number       // Default: 100
)
```

**Constructor Parameters**:
- `windowSizeMs`: Time window in milliseconds (must be > 0)
- `maxSamples`: Maximum samples to store before circular buffer wraps (must be > 0)

**Throws**:
- `Error` if windowSizeMs or maxSamples <= 0

**Methods**:

#### recordSuccess(latencyMs?: number): void

Records a successful operation.

**Parameters**:
- `latencyMs` (optional): Response latency in milliseconds

**Example**:
```typescript
metrics.recordSuccess(125); // 125ms response
metrics.recordSuccess();    // Success with no latency tracked
```

---

#### recordFailure(): void

Records a failed operation.

**Example**:
```typescript
metrics.recordFailure();
```

---

#### getMetrics(): HealthMetrics

Calculates aggregated health metrics based on samples within the time window.

**Returns**: HealthMetrics object with:
```typescript
{
  successRate: number;              // 0.0-1.0
  avgLatencyMs: number;             // Average latency (0 if no samples)
  totalSamples: number;             // Number of valid samples
  consecutiveSuccesses: number;     // Successes from most recent samples
  consecutiveFailures: number;      // Failures from most recent samples
}
```

**Note**: Only samples within the time window are included. Old samples are automatically excluded.

**Example**:
```typescript
const metrics = rollingMetrics.getMetrics();
console.log(`Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
console.log(`Avg latency: ${metrics.avgLatencyMs.toFixed(0)}ms`);
console.log(`Consecutive successes: ${metrics.consecutiveSuccesses}`);
```

---

#### reset(): void

Clears all recorded samples.

**Example**:
```typescript
metrics.reset();
```

---

### NodeHealthTracker

Tracks health status for a single node with circuit breaker pattern and exponential backoff.

```typescript
new NodeHealthTracker(
  nodeId: string,
  config?: Partial<ExtendedHealthConfig>,
  backoffConfig?: Partial<BackoffConfig>
)
```

**Constructor Parameters**:
- `nodeId`: Node identifier for tracking
- `config` (optional): Health check configuration (uses defaults if omitted)
- `backoffConfig` (optional): Exponential backoff configuration (uses defaults if omitted)

**Configuration Defaults**:
```typescript
// Health config
{
  checkIntervalMs: 5000,
  timeoutMs: 2000,
  maxConsecutiveFailures: 3,
  unhealthyThreshold: 0.5,    // Success rate < 50% = UNHEALTHY
  degradedThreshold: 0.8      // Success rate < 80% = DEGRADED
}

// Backoff config
{
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2
}
```

**Methods**:

#### recordSuccess(latencyMs?: number): void

Records a successful health check and updates state machine.

**Parameters**:
- `latencyMs` (optional): Health check latency in milliseconds

**State Transitions**:
- INITIALIZING to HEALTHY (on first success)
- DEGRADED to HEALTHY (with sufficient consecutive successes)
- UNHEALTHY to HEALTHY (with sufficient consecutive successes)
- OFFLINE to HEALTHY (with sufficient consecutive successes)

**Example**:
```typescript
tracker.recordSuccess(125);
```

---

#### recordFailure(error?: Error): void

Records a failed health check and updates state machine.

**Parameters**:
- `error` (optional): Error object from health check

**State Transitions**:
- INITIALIZING to UNHEALTHY (on max consecutive failures)
- HEALTHY to DEGRADED (when success rate drops below degradedThreshold)
- DEGRADED to UNHEALTHY (when success rate drops below unhealthyThreshold)
- UNHEALTHY to OFFLINE (after too many failures, with exponential backoff)

**Example**:
```typescript
tracker.recordFailure(new Error('Connection timeout'));
```

---

#### getStatus(): NodeStatus

Returns the current health status.

**Returns**: One of:
- `NodeStatus.INITIALIZING`: Node starting up
- `NodeStatus.HEALTHY`: Node fully operational
- `NodeStatus.DEGRADED`: Node operational but experiencing issues
- `NodeStatus.UNHEALTHY`: Node failing checks but still reachable
- `NodeStatus.OFFLINE`: Node unreachable or shut down

**Example**:
```typescript
if (tracker.getStatus() === NodeStatus.HEALTHY) {
  console.log('Node is healthy');
}
```

---

#### getHealth(): HealthMetrics

Returns aggregated health metrics for the node.

**Returns**: HealthMetrics object (see RollingWindowMetrics.getMetrics())

**Example**:
```typescript
const health = tracker.getHealth();
console.log(`Success rate: ${(health.successRate * 100).toFixed(1)}%`);
```

---

#### isEligibleForRetry(): boolean

Checks if the node is eligible for retry (not in backoff cooldown).

**Returns**: `true` if node can be retried, `false` if in backoff

**Use Case**: For routing logic to respect exponential backoff

**Example**:
```typescript
if (tracker.isEligibleForRetry()) {
  // Safe to route to this node
} else {
  // Node is in backoff, try another node
}
```

---

#### getBackoffDelayMs(): number

Returns the current exponential backoff delay in milliseconds.

**Returns**: Current backoff delay (0 if not in backoff)

**Example**:
```typescript
const delay = tracker.getBackoffDelayMs();
console.log(`Node will retry in ${delay}ms`);
```

---

### ClusterHealth

Orchestrates health checks across multiple cluster nodes.

```typescript
new ClusterHealth(
  config?: Partial<ExtendedHealthConfig>,
  backoffConfig?: Partial<BackoffConfig>,
  callbacks?: HealthCallbacks
)
```

**Constructor Parameters**:
- `config` (optional): Health check configuration
- `backoffConfig` (optional): Exponential backoff configuration
- `callbacks` (optional): Status change and check result callbacks

**Example**:
```typescript
const health = new ClusterHealth(
  { checkIntervalMs: 5000, timeoutMs: 2000 },
  { initialDelayMs: 1000, maxDelayMs: 60000, multiplier: 2 },
  {
    onStatusChange: (nodeId, oldStatus, newStatus, metrics) => {
      console.log(`${nodeId}: ${oldStatus} to ${newStatus}`);
    },
    onHealthCheck: (nodeId, result) => {
      if (result.success) {
        console.log(`${nodeId} health check passed (${result.latencyMs}ms)`);
      } else {
        console.error(`${nodeId} health check failed:`, result.error?.message);
      }
    }
  }
);
```

**Methods**:

#### startHealthChecks(nodes: MLXNode[]): void

Starts periodic health checks for the given nodes.

**Parameters**:
- `nodes`: Array of nodes to monitor

**Throws**:
- `Error` if health checks are already running

**Behavior**:
- Initializes health trackers for each node
- Schedules periodic health check for each node
- Sets running flag to true

**Example**:
```typescript
const nodes = [
  { id: 'node-1', url: 'http://localhost:8080/v1' },
  { id: 'node-2', url: 'http://localhost:8081/v1' },
];

health.startHealthChecks(nodes);
```

---

#### stopHealthChecks(): void

Stops all periodic health checks and cleans up timers.

**Behavior**:
- Clears all scheduled timers
- Sets running flag to false
- Does not reset metrics or status

**Example**:
```typescript
health.stopHealthChecks();
```

---

#### isHealthy(nodeId: string): boolean

Checks if a specific node is healthy.

**Parameters**:
- `nodeId`: Node identifier

**Returns**: `true` if node status is HEALTHY, `false` otherwise

**Throws**:
- `Error` if node is unknown

**Example**:
```typescript
if (health.isHealthy('node-1')) {
  // Route to this node
} else {
  // Try another node
}
```

---

#### getNodeHealth(nodeId: string): { status: NodeStatus; metrics: HealthMetrics }

Gets health status and metrics for a specific node.

**Parameters**:
- `nodeId`: Node identifier

**Returns**: Object with status and metrics

**Throws**:
- `Error` if node is unknown

**Example**:
```typescript
const { status, metrics } = health.getNodeHealth('node-1');
console.log(`${status}: ${(metrics.successRate * 100).toFixed(1)}%`);
```

---

#### getAllNodeHealth(): Map<string, { status: NodeStatus; metrics: HealthMetrics }>

Gets health status and metrics for all nodes.

**Returns**: Map of nodeId to {status, metrics}

**Example**:
```typescript
const allHealth = health.getAllNodeHealth();
for (const [nodeId, { status, metrics }] of allHealth) {
  console.log(`${nodeId}: ${status} (${metrics.successRate * 100}%)`);
}
```

---

#### recordSuccess(nodeId: string, latencyMs: number): void

Manually records a successful request for a node.

**Parameters**:
- `nodeId`: Node identifier
- `latencyMs`: Request latency in milliseconds

**Behavior**:
- Updates node health metrics
- May trigger state transitions
- Ignores if node is unknown

**Use Case**: Recording results from actual request routing (not just periodic health checks)

**Example**:
```typescript
// After successfully routing a request to node-1
health.recordSuccess('node-1', 125);
```

---

#### recordFailure(nodeId: string, error?: Error): void

Manually records a failed request for a node.

**Parameters**:
- `nodeId`: Node identifier
- `error` (optional): Error from the request

**Behavior**:
- Updates node health metrics
- May trigger state transitions
- Ignores if node is unknown

**Use Case**: Recording results from actual request routing

**Example**:
```typescript
// Request to node-1 failed
health.recordFailure('node-1', new Error('Connection timeout'));
```

---

## Error Classes

### HealthCheckTimeoutError

Thrown when a health check exceeds its timeout.

```typescript
new HealthCheckTimeoutError(nodeId: string, timeoutMs: number)
```

**Properties**:
- `nodeId`: Node ID that timed out
- `timeoutMs`: Timeout duration
- `message`: Human-readable error message

**Example**:
```typescript
try {
  // Health check code
} catch (err) {
  if (err instanceof HealthCheckTimeoutError) {
    console.log(`${err.nodeId} timed out after ${err.timeoutMs}ms`);
  }
}
```

---

### HealthCheckFailedError

Thrown when a health check receives an HTTP error response.

```typescript
new HealthCheckFailedError(
  nodeId: string,
  statusCode: number,
  statusText: string
)
```

**Properties**:
- `nodeId`: Node ID that failed
- `statusCode`: HTTP status code (e.g., 500)
- `statusText`: HTTP status text (e.g., 'Internal Server Error')

**Example**:
```typescript
try {
  // Health check code
} catch (err) {
  if (err instanceof HealthCheckFailedError) {
    console.log(`${err.nodeId} returned ${err.statusCode}: ${err.statusText}`);
  }
}
```

---

### HealthCheckNetworkError

Thrown when a health check encounters a network error.

```typescript
new HealthCheckNetworkError(nodeId: string, cause: Error)
```

**Properties**:
- `nodeId`: Node ID that failed
- `cause`: Original error from the network request

**Example**:
```typescript
try {
  // Health check code
} catch (err) {
  if (err instanceof HealthCheckNetworkError) {
    console.log(`${err.nodeId} network error: ${err.cause.message}`);
  }
}
```

---

## Interfaces and Types

### HealthCheckResult

Result of a single health check operation.

```typescript
interface HealthCheckResult {
  readonly success: boolean;
  readonly latencyMs?: number;
  readonly error?: Error;
}
```

**Fields**:
- `success`: Whether the health check passed
- `latencyMs`: Response time (only if success)
- `error`: Error object (only if !success)

---

### HealthMetrics

Aggregated health metrics for a node.

```typescript
interface HealthMetrics {
  readonly successRate: number;           // 0.0-1.0
  readonly avgLatencyMs: number;          // Average latency
  readonly totalSamples: number;          // Number of valid samples
  readonly consecutiveSuccesses: number;  // Successes from recent samples
  readonly consecutiveFailures: number;   // Failures from recent samples
  readonly status?: NodeStatus;           // Current status (optional)
  readonly lastError?: Error;             // Last error (optional)
  readonly lastCheckTime?: number;        // Timestamp of last check
}
```

---

### HealthCallback

Callback invoked when node health status changes.

```typescript
type HealthCallback = (
  nodeId: string,
  oldStatus: NodeStatus,
  newStatus: NodeStatus,
  metrics: HealthMetrics
) => void
```

**Parameters**:
- `nodeId`: Node that changed status
- `oldStatus`: Previous status
- `newStatus`: New status
- `metrics`: Current health metrics

---

### HealthCheckCallback

Callback invoked after each health check.

```typescript
type HealthCheckCallback = (
  nodeId: string,
  result: HealthCheckResult
) => void
```

**Parameters**:
- `nodeId`: Node that was checked
- `result`: Health check result (success, latency, or error)

---

### HealthCallbacks

Optional callbacks for health events.

```typescript
interface HealthCallbacks {
  onStatusChange?: HealthCallback;
  onHealthCheck?: HealthCheckCallback;
}
```

---

### BackoffConfig

Configuration for exponential backoff.

```typescript
interface BackoffConfig {
  readonly initialDelayMs: number;  // Starting delay (default: 1000)
  readonly maxDelayMs: number;      // Maximum delay (default: 60000)
  readonly multiplier: number;      // Growth factor (default: 2)
}
```

**Examples**:
```typescript
// Fast backoff (for quick recovery testing)
{ initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 }

// Slow backoff (for stable production)
{ initialDelayMs: 5000, maxDelayMs: 300000, multiplier: 1.5 }
```

---

## Circuit Breaker State Machine

The health monitoring system implements a circuit breaker pattern with the following states and transitions:

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

**State Definitions**:

- **INITIALIZING**: Node starting up, waiting for first health check
- **HEALTHY**: Node fully operational, passing all checks
- **DEGRADED**: Node operational but experiencing issues (high latency, elevated error rate)
- **UNHEALTHY**: Node failing health checks repeatedly
- **OFFLINE**: Node unreachable or permanently unavailable

**Triggers**:

- **HEALTHY to DEGRADED**: Success rate drops below degradedThreshold (default: 80%)
- **DEGRADED to UNHEALTHY**: Success rate drops below unhealthyThreshold (default: 50%)
- **UNHEALTHY to OFFLINE**: Exponential backoff expires and node still failing
- **Any to HEALTHY**: Sufficient consecutive successes (default: 5)
- **Any to INITIALIZING**: Manual reset (via constructor)

---

## Usage Patterns

### Basic Health Monitoring

```typescript
import { ClusterHealth } from './cluster-health';
import { NodeStatus } from './cluster-types';

const health = new ClusterHealth();
const nodes = [
  { id: 'node-1', url: 'http://localhost:8080/v1' },
  { id: 'node-2', url: 'http://localhost:8081/v1' },
];

health.startHealthChecks(nodes);

// Later: record request results
health.recordSuccess('node-1', 125);
health.recordFailure('node-2');

// Check health before routing
if (health.isHealthy('node-1')) {
  routeRequestToNode('node-1');
} else {
  routeRequestToNode('node-2');
}

health.stopHealthChecks();
```

### Monitoring with Callbacks

```typescript
const health = new ClusterHealth(
  { checkIntervalMs: 5000 },
  {},
  {
    onStatusChange: (nodeId, oldStatus, newStatus, metrics) => {
      console.log(`${nodeId}: ${oldStatus} to ${newStatus}`);
      console.log(`Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);

      if (newStatus === NodeStatus.OFFLINE) {
        // Alert operations team
        sendAlert(`Node ${nodeId} is offline!`);
      }
    },
    onHealthCheck: (nodeId, result) => {
      if (!result.success) {
        console.warn(`Health check failed for ${nodeId}:`, result.error?.message);
      }
    }
  }
);

health.startHealthChecks(nodes);
```

### Integration with Load Balancing

```typescript
function selectNode(nodes: MLXNode[], health: ClusterHealth): MLXNode | null {
  // Find all healthy nodes
  const healthyNodes = nodes.filter(n => health.isHealthy(n.id));

  if (healthyNodes.length === 0) {
    // No healthy nodes, fall back to degraded
    const degradedNodes = nodes.filter(n => {
      const { status } = health.getNodeHealth(n.id);
      return status === NodeStatus.DEGRADED;
    });
    if (degradedNodes.length > 0) {
      return degradedNodes[0];
    }
    return null;
  }

  // Use round-robin on healthy nodes
  return healthyNodes[Math.floor(Math.random() * healthyNodes.length)];
}
```

---

## Integration with Cluster System

The health monitoring module integrates with other cluster components:

- **cluster-types.ts**: Uses NodeStatus and MLXNode types
- **cluster-config.ts**: Reads health check settings from HealthConfig
- **cluster-discovery.ts**: Works with discovered nodes
- **Router**: Uses health metrics to make routing decisions

---

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| recordSuccess/recordFailure | O(1) | Amortized constant time |
| getMetrics() | O(n) | Filters samples by time window |
| startHealthChecks() | O(m) | m = number of nodes |
| recordSuccess (all nodes) | O(m) | Per-node recording |
| getAllNodeHealth() | O(m * n) | m = nodes, n = samples per node |

---

## Testing

The module includes 150+ comprehensive unit tests covering:
- Rolling window metrics and circular buffer behavior
- Circuit breaker state transitions
- Exponential backoff timing
- Callback invocation order
- Edge cases (rapid start/stop, offline nodes, errors)
- Integration scenarios

Run tests with:
```bash
npm test -- tests/unit/cluster-health.test.ts
```

---

## See Also

- MLX Cluster System Architecture (docs/architecture/mlx-cluster-system.md)
- Cluster Configuration API (docs/reference/cluster-config-api.md)
- Node Discovery API (docs/reference/cluster-discovery-api.md)
