# Cluster Discovery Test Suite - TDD Implementation

## Summary

Comprehensive test suite for `src/cluster/cluster-discovery.ts` following TDD methodology (RED phase).

**Status**: Tests created and verified to FAIL (implementation doesn't exist yet)

**Test File**: `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/cluster-discovery.test.ts`

**Total Tests**: 87 comprehensive tests

## Test Coverage

### 1. DiscoveryError Class (12 tests)

- Error construction with code/message
- Error context (nodeId, url)
- Error codes: VALIDATION_FAILED, NODE_TIMEOUT, INVALID_URL, HTTP_ERROR, NETWORK_ERROR
- Error inheritance and catchability

### 2. Constructor & Initialization (10 tests)

- Instance creation with minimal/full config
- Callbacks (optional vs required)
- Initial state (isRunning=false, empty nodes)
- Config validation (invalid mode, missing nodes, negative intervals)
- Empty staticNodes array rejection

### 3. Lifecycle Management (15 tests)

- `start()`: Sets isRunning, creates timer, performs initial discovery, prevents double-start
- `stop()`: Clears isRunning, removes timer, prevents callbacks after stop
- `isRunning()`: Returns correct state throughout lifecycle
- Timer cleanup on stop

### 4. Static Node Discovery (10 tests)

- Single/multiple node discovery from config.staticNodes
- Node order preservation
- Failed node filtering (validation rejects bad nodes)
- All-nodes-failed scenario (returns empty array)
- Node deduplication (same ID or URL)

### 5. Node Validation (13 tests)

- HTTP GET to `/v1/models` endpoint
- Timeout via AbortSignal
- Response status handling (200 OK, 404, 500)
- JSON structure validation
- Timeout enforcement and fetch abortion
- Network error handling (DNS, connection refused)

### 6. Refresh Logic (12 tests)

- Periodic refresh at configured interval
- No premature refresh
- Continuous refresh until stopped
- New node detection (onNodeDiscovered callback)
- Lost node detection (onNodeLost callback)
- Multiple nodes appearing/disappearing
- Concurrent refresh prevention (isDiscovering flag)

### 7. Callback Invocation (10 tests)

- `onNodeDiscovered`: Invoked for new nodes
- `onNodeLost`: Invoked when nodes become unavailable
- `onDiscoveryError`: Invoked on timeout/network/HTTP errors
- Optional callbacks (no throw if undefined)
- Callback error handling (graceful failure)
- Error recovery (discovery continues after callback errors)

### 8. getDiscoveredNodes() (7 tests)

- Returns empty array initially
- Returns discovered nodes after start
- Returns immutable copy (no shared references)
- Reflects current state (updates on refresh)
- Node structure (id, url, lastSeen timestamp)

### 9. Memory Management (4 tests)

- Timer cleanup on stop
- No lingering timers after multiple start/stop cycles
- State cleanup on stop
- State reset on restart

### 10. Edge Cases (14 tests)

- Zero/very short/very long refresh intervals
- URLs with trailing slash, path, IPv6 addresses
- URL normalization
- Concurrent operations (stop during discovery, multiple getDiscoveredNodes)

## Mock Strategy

### Global Mocks

```typescript
global.fetch = jest.fn(); // HTTP request mocking
jest.useFakeTimers(); // Timer control
```

### Mock Helpers

- `createSuccessfulModelsResponse()`: Valid /v1/models response
- `createFailedResponse(status)`: HTTP error responses
- `createTimeoutError()`: Timeout simulation
- `createMockCallbacks()`: Jest spy functions for callbacks

## Test Execution

### Expected Result (TDD RED Phase)

```bash
npx jest tests/unit/cluster-discovery.test.ts
```

**Output**: ALL TESTS FAIL with error:

```
Cannot find module '../../src/cluster/cluster-discovery'
```

This confirms:

- Tests written BEFORE implementation (TDD best practice)
- Implementation will be created next (IMPLEMENT phase)
- Tests will verify implementation works (GREEN phase)

## Test Patterns Used

### Arrange-Act-Assert

```typescript
test("should discover single static node", async () => {
  // Arrange
  const config = createMinimalConfig();
  const discovery = new ClusterDiscovery(config);
  (global.fetch as jest.Mock).mockResolvedValue(
    createSuccessfulModelsResponse()
  );

  // Act
  await discovery.start();

  // Assert
  const nodes = discovery.getDiscoveredNodes();
  expect(nodes).toHaveLength(1);
  expect(nodes[0].id).toBe("node-1");
});
```

### Timer Testing

```typescript
test("should refresh nodes at configured interval", async () => {
  await discovery.start();
  (global.fetch as jest.Mock).mockClear();

  // Advance time to trigger refresh
  jest.advanceTimersByTime(config.refreshIntervalMs);
  await Promise.resolve();

  expect(global.fetch).toHaveBeenCalled();
});
```

### Callback Testing

```typescript
test("should invoke onNodeDiscovered", async () => {
  const callbacks = createMockCallbacks();
  const discovery = new ClusterDiscovery(config, callbacks);

  await discovery.start();

  expect(callbacks.onNodeDiscovered).toHaveBeenCalledWith(
    "node-1",
    "http://localhost:8080"
  );
});
```

## Next Steps

1. **IMPLEMENT Phase**: Create `src/cluster/cluster-discovery.ts`
2. **GREEN Phase**: Run tests until all pass
3. **REFACTOR Phase**: Optimize implementation while keeping tests green

## Coverage Goals

Target: **80%+ code coverage**

Areas covered:

- Lifecycle management
- Static discovery
- Node validation
- Refresh logic
- Callback invocation
- Error handling
- Edge cases
- Memory management

## Notes

- Tests use Jest fake timers for deterministic timing
- Fetch is globally mocked to avoid real HTTP requests
- All tests are isolated (beforeEach/afterEach cleanup)
- Tests verify both happy path and error scenarios
- Mock resets prevent test pollution
