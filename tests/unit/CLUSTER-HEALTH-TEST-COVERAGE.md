# Cluster Health Test Coverage

## Test File: cluster-health.test.ts

**Status**: RED PHASE (TDD) - All tests expected to fail until implementation

**Module Under Test**: `src/cluster/cluster-health.ts`

**Purpose**: Comprehensive test suite for health monitoring system with circuit breaker pattern

---

## Test Categories (Total: 104 tests)

### 1. Error Classes (15 tests)

**HealthCheckTimeoutError** (5 tests)

- Constructor creates error with correct name and message
- Exposes nodeId property
- Exposes timeoutMs property
- Is instanceof Error
- Is instanceof HealthCheckTimeoutError

**HealthCheckFailedError** (6 tests)

- Constructor creates error with correct name and message
- Exposes nodeId property
- Exposes statusCode property
- Exposes statusText property
- Is instanceof Error
- Is instanceof HealthCheckFailedError

**HealthCheckNetworkError** (5 tests)

- Constructor creates error with correct name and message
- Exposes nodeId property
- Exposes cause property
- Is instanceof Error
- Is instanceof HealthCheckNetworkError

### 2. RollingWindowMetrics (29 tests)

**Constructor** (4 tests)

- Creates instance with default window size
- Creates instance with custom window size
- Throws on zero window size
- Throws on negative window size

**recordSuccess** (3 tests)

- Records successful request with latency
- Calculates correct average latency for multiple samples
- Throws on negative latency

**recordFailure** (3 tests)

- Records failed request
- Calculates correct success rate with mixed samples
- Excludes failures from latency calculation

**Time Window Behavior** (3 tests)

- Excludes samples outside time window
- Includes samples within time window
- Handles gradual sample expiration

**Circular Buffer** (2 tests)

- Handles buffer wraparound
- Maintains correct metrics after wraparound

**Edge Cases** (4 tests)

- Returns zero metrics when no samples
- Returns zero metrics when all samples expired
- Handles only failures in window
- Handles very high latency values

**Reset** (2 tests)

- Clears all samples
- Allows new samples after reset

### 3. NodeHealthTracker (35 tests)

**Constructor** (4 tests)

- Creates instance with valid config
- Starts in INITIALIZING state
- Has zero consecutive failures initially
- Has zero consecutive successes initially

**recordSuccess** (8 tests)

- Transitions from INITIALIZING to HEALTHY
- Increments consecutive successes
- Resets consecutive failures on success
- Transitions from UNHEALTHY to HEALTHY after recovery
- Transitions from DEGRADED to HEALTHY when success rate improves
- Resets backoff delay on success
- Records latency in metrics

**recordFailure** (9 tests)

- Increments consecutive failures
- Resets consecutive successes on failure
- Transitions to UNHEALTHY after maxConsecutiveFailures
- Transitions to DEGRADED when success rate below threshold
- Does not transition to DEGRADED if success rate above threshold
- Increases backoff delay exponentially
- Caps backoff delay at maxDelayMs
- Stores last error

**shouldAttemptRecovery** (5 tests)

- Returns false when node is HEALTHY
- Returns false when node is DEGRADED
- Returns true when node is UNHEALTHY and backoff elapsed
- Returns false when node is UNHEALTHY but backoff not elapsed
- Returns false when node is OFFLINE

**markOffline** (2 tests)

- Transitions to OFFLINE state
- Transitions from any state to OFFLINE

**getMetrics** (2 tests)

- Returns current metrics snapshot
- Reflects time window behavior

**getHealth** (1 test)

- Returns complete health snapshot

### 4. ClusterHealth (68 tests)

**Constructor** (2 tests)

- Creates instance with valid config
- Is not running initially

**startHealthChecks** (5 tests)

- Starts monitoring nodes
- Throws when starting twice without stopping
- Performs initial health check for all nodes
- Schedules periodic health checks
- Accepts empty nodes array

**stopHealthChecks** (5 tests)

- Stops monitoring
- Cancels in-flight health checks
- Clears all timers
- Is idempotent
- Allows restart after stop

**Health Check Execution** (6 tests)

- Makes HTTP request to /health endpoint
- Applies timeout to health checks
- Records success on healthy response
- Records failure on unhealthy response
- Records failure on timeout
- Records failure on network error

**Callbacks** (5 tests)

- Invokes onStatusChange when node becomes healthy
- Invokes onStatusChange when node becomes unhealthy
- Invokes onHealthCheck after each check
- Does not crash if callbacks throw errors
- Handles missing callbacks gracefully

**Manual Recording** (4 tests)

- Allows manual success recording
- Allows manual failure recording
- Triggers callbacks on manual recording
- Handles unknown nodeId gracefully

**isHealthy** (4 tests)

- Returns true for healthy node
- Returns false for unhealthy node
- Returns false for degraded node
- Returns false for unknown nodeId

**getNodeHealth** (2 tests)

- Returns health snapshot for known node
- Throws for unknown nodeId

**shouldAttemptRecovery** (3 tests)

- Returns false for healthy node
- Returns true for unhealthy node after backoff
- Returns false for unknown nodeId

**Edge Cases** (7 tests)

- Handles rapid start/stop cycles
- Handles nodes going offline during monitoring
- Does not check UNHEALTHY nodes until backoff elapsed
- Handles AbortController signal cancellation
- Handles concurrent health checks for multiple nodes
- Handles different health states for different nodes

---

## Test Patterns Used

### Mocking

- `global.fetch` - Mock HTTP health check requests
- `jest.useFakeTimers()` - Control time advancement for periodic checks and backoff
- `jest.fn()` - Mock callbacks (onStatusChange, onHealthCheck)

### Helpers

- `createTestNode(id, url)` - Generate minimal MLX node fixtures
- `createTestNodes(count)` - Generate multiple nodes
- `createHealthyResponse()` - Mock successful HTTP response
- `createUnhealthyResponse(status)` - Mock failed HTTP response
- `createTimeoutError()` - Mock timeout error
- `createNetworkError()` - Mock network error
- `createMockCallbacks()` - Mock health check callbacks
- `advanceTimersAndFlush(ms)` - Advance fake timers and flush promises

### Assertions

- Type checking (instanceof)
- Property existence and values
- State transitions
- Metric calculations
- Callback invocation
- Error handling
- Edge case behavior

---

## Expected Test Results (TDD Red Phase)

**All 104 tests should FAIL** with:

```
Cannot find module '../../src/cluster/cluster-health'
```

This confirms we are in the TDD red phase - tests written before implementation.

---

## Implementation Requirements (from tests)

### Interfaces/Types to Export

- `HealthCheckResult` - Result of a health check (success/failure, latency, error)
- `HealthMetrics` - Aggregate metrics (success rate, avg latency, total samples)
- `HealthCallback` - Callback function types
- `BackoffConfig` - Exponential backoff configuration

### Classes to Export

- `HealthCheckTimeoutError` - Timeout error class
- `HealthCheckFailedError` - HTTP failure error class
- `HealthCheckNetworkError` - Network error class
- `RollingWindowMetrics` - Time-windowed metrics tracker
- `NodeHealthTracker` - Per-node health tracking with circuit breaker
- `ClusterHealth` - Main health monitoring orchestrator

### Key Behaviors to Implement

**RollingWindowMetrics**:

- Time-windowed circular buffer (default 30s window)
- Success rate calculation (successes / total samples)
- Average latency calculation (sum of successful latencies / success count)
- Automatic expiration of old samples
- Buffer wraparound handling

**NodeHealthTracker**:

- State machine: INITIALIZING → HEALTHY ↔ DEGRADED ↔ UNHEALTHY ↔ OFFLINE
- Circuit breaker pattern with exponential backoff
- Consecutive failure/success tracking
- Success rate threshold monitoring (degraded at <80%, unhealthy at <50%)
- Recovery attempt scheduling with backoff

**ClusterHealth**:

- Lifecycle management (start/stop/isRunning)
- Periodic health checks with configurable interval
- HTTP GET to `/health` endpoint with timeout
- Callback invocation on state changes
- Manual success/failure recording
- Per-node tracking via NodeHealthTracker
- AbortController for request cancellation

---

## Coverage Goals

- **Line coverage**: 95%+ (all execution paths)
- **Branch coverage**: 90%+ (all state transitions)
- **Function coverage**: 100% (all public methods)

---

## Next Steps

1. **CURRENT**: TDD Red Phase - Tests written and failing ✅
2. **NEXT**: Implementation Phase - Write minimal code to make tests pass
3. **THEN**: TDD Green Phase - Verify all tests pass
4. **FINALLY**: Refactor Phase - Optimize while keeping tests green
