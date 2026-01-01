## Summary

Create health monitoring for MLX cluster nodes with circuit breaker pattern.

## Background

Following the existing circuit-breaker.ts pattern, implement per-node health tracking with automatic failover.

## Requirements

### Health States

- HEALTHY: Normal operation
- DEGRADED: Experiencing issues but usable
- UNHEALTHY: Circuit open, not used for requests
- RECOVERING: Testing recovery after failure

### Functions to Implement

1. startHealthChecks(nodes: Map<string, NodeStatus>): void
2. isHealthy(nodeId: string): boolean
3. recordSuccess(nodeId: string): void
4. recordFailure(nodeId: string): void
5. getNodeHealth(nodeId: string): NodeHealth
6. shouldAttemptRecovery(nodeId: string): boolean

### Health Check Protocol

1. GET /v1/cluster/health every checkInterval ms
2. Track success/failure counts
3. Open circuit after failureThreshold failures
4. Attempt recovery after unhealthyBackoff period

### Metrics

- successRate: rolling window success percentage
- avgLatency: rolling average response time
- failureCount: total failures since last healthy
- lastCheck: timestamp of last health check

## File Location

src/cluster/cluster-health.ts

## Dependencies

- src/cluster/cluster-types.ts
- Follow patterns from src/circuit-breaker.ts

## Acceptance Criteria

- [ ] Periodic health checks to all nodes
- [ ] Circuit breaker opens after threshold failures
- [ ] Automatic recovery attempts after backoff
- [ ] Health state transitions are logged
- [ ] Metrics are accurate and updated
- [ ] Graceful shutdown stops health checks
- [ ] Unit tests for state transitions

## Labels

phase-2, cluster, health, reliability
