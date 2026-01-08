# Circuit Breaker Configuration Guide

A complete guide to configuring and monitoring circuit breaker behavior for automatic failover and latency-based service degradation detection.

## Overview

The circuit breaker implements the classic 3-state pattern for resilient service communication. It protects your application from cascading failures when backend services become unavailable or experience degradation.

**What it does:**
- Automatically detects service failures and stops sending requests
- Monitors latency and can open circuit if responses become too slow
- Automatically tests service recovery at intervals
- Provides detailed metrics for monitoring and alerting

**When to use it:**
- Any critical service that needs failover capability
- Services with occasional transient failures
- Backend systems that might become unavailable during updates
- Services experiencing performance degradation

## Circuit Breaker States

The circuit breaker operates in three states:

```
┌─────────────────────────────────────────────────────────────┐
│                     CIRCUIT STATES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CLOSED (Normal Operation)                                 │
│  ├─ All requests pass through normally                    │
│  ├─ Failures tracked in background                        │
│  ├─ Latency monitored (if enabled)                        │
│  └─ Transitions to OPEN when:                             │
│     ├─ Failure count >= failureThreshold                  │
│     └─ Latency checks >= latencyConsecutiveChecks         │
│                                                             │
│  OPEN (Failing - Requests Rejected)                        │
│  ├─ All requests rejected immediately                     │
│  ├─ No timeouts - fast failure feedback                   │
│  ├─ Fallback systems engaged (if available)               │
│  └─ Transitions to HALF_OPEN after retryTimeout           │
│                                                             │
│  HALF_OPEN (Testing Recovery)                              │
│  ├─ Limited requests allowed through                      │
│  ├─ Testing if service has recovered                      │
│  ├─ If success: transitions to CLOSED                     │
│  └─ If failure: transitions back to OPEN                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### State Details

**CLOSED (Normal Operation)**

- Standard request/response flow
- Failures are counted, successes reset the counter
- If failure count reaches threshold, circuit opens
- If latency monitoring is enabled, consecutive high-latency checks are tracked
- Recommended when: Service is healthy and responsive

**OPEN (Failing)**

- All incoming requests are rejected immediately without calling the service
- Returns error indicating circuit is open (no timeout wait)
- Fallback systems should handle rejected requests
- Metrics continue to be collected
- After `retryTimeout` has passed, automatically transitions to HALF_OPEN
- Recommended when: Service is down or severely degraded

**HALF_OPEN (Testing Recovery)**

- A single request is allowed through to test if service has recovered
- If request succeeds, circuit closes and returns to normal
- If request fails, circuit re-opens with reset retry timer
- Prevents overwhelming a recovering service with traffic
- Recommended when: Service should be recovering but we're not sure yet

## Configuration Options

### Failure-Based Detection

Controls when the circuit opens due to request failures.

#### failureThreshold

**Type:** `number`
**Default:** `3`
**Range:** `1-10`

Number of consecutive failures before opening the circuit.

```typescript
// Strict - trip quickly on 2 failures
const config = {
  failureThreshold: 2,  // Open after 2 failures
};

// Normal - tolerate some transient failures
const config = {
  failureThreshold: 5,  // Open after 5 failures (recommended)
};

// Lenient - allow service to degrade gracefully
const config = {
  failureThreshold: 10,  // Open after 10 failures
};
```

**When to adjust:**

| Value | Use Case | Notes |
|-------|----------|-------|
| 2-3 | Unstable services | Trip quickly, fail fast |
| 5 | Normal case | Balances protection with tolerance |
| 8-10 | Flaky services | Tolerate occasional failures |

#### successThreshold

**Type:** `number`
**Default:** `2`
**Range:** `1-5`

Number of consecutive successes in HALF_OPEN state before closing the circuit.

```typescript
// Fast recovery
const config = {
  successThreshold: 1,  // Close after 1 success (risky)
};

// Balanced (recommended)
const config = {
  successThreshold: 2,  // Close after 2 successes
};

// Conservative
const config = {
  successThreshold: 3,  // Close after 3 successes (safer)
};
```

**When to adjust:**

- **1**: Very responsive services, rare false positives
- **2**: Standard case, good balance
- **3+**: Critical services, need high confidence

### Latency-Based Detection

Monitors response latency and opens circuit if requests become too slow.

**Important:** Latency monitoring is **disabled by default** (threshold = 0).

#### latencyThresholdMs

**Type:** `number`
**Default:** `0` (disabled)
**Unit:** milliseconds

Maximum acceptable latency. If a request exceeds this, it counts as a "high latency" event.

```typescript
// Disable latency monitoring
const config = {
  latencyThresholdMs: 0,  // Disabled
};

// Monitor for 5-second threshold (typical APIs)
const config = {
  latencyThresholdMs: 5000,  // 5 seconds
};

// Strict 1-second SLA
const config = {
  latencyThresholdMs: 1000,  // 1 second
};

// Very strict 100ms for local services
const config = {
  latencyThresholdMs: 100,  // 100ms
};
```

**Typical Values:**

| Service | Threshold | Notes |
|---------|-----------|-------|
| Local (same machine) | 100-500ms | Very fast, low latency |
| Regional API | 500-2000ms | Some network latency |
| Internet API | 2000-5000ms | Expect variable latency |
| Disabled | 0 | Only use failure detection |

#### latencyConsecutiveChecks

**Type:** `number`
**Default:** `3`
**Range:** `2-10`

Number of consecutive high-latency samples before opening the circuit.

```typescript
// Very sensitive - open after 2 slow requests
const config = {
  latencyConsecutiveChecks: 2,
};

// Balanced - allow some latency spikes
const config = {
  latencyConsecutiveChecks: 3,  // Recommended
};

// Tolerant - only react to sustained slowness
const config = {
  latencyConsecutiveChecks: 5,
};
```

**Example Scenario:**

With default settings (threshold=1000ms, consecutive=3):

```
Request 1: 800ms  ✓ OK
Request 2: 1100ms ⚠ HIGH (count: 1)
Request 3: 1050ms ⚠ HIGH (count: 2)
Request 4: 1200ms ⚠ HIGH (count: 3) → Circuit OPENS

Request 5: Rejected immediately
```

#### latencyWindowMs

**Type:** `number`
**Default:** `1000`
**Unit:** milliseconds

Rolling time window for latency samples. Only samples within this window are considered for percentile calculations.

```typescript
// 1-second window (default)
const config = {
  latencyWindowMs: 1000,  // Last 1 second of samples
};

// 5-second window for smoothing
const config = {
  latencyWindowMs: 5000,  // Last 5 seconds of samples
};

// 10-second window for trending
const config = {
  latencyWindowMs: 10000,  // Last 10 seconds of samples
};
```

**Impact:**
- Smaller window: More responsive to latency spikes, noisier metrics
- Larger window: Smoother metrics, slower to react to degradation

#### autoCheckLatency

**Type:** `boolean`
**Default:** `false`

Automatically check latency threshold each time a sample is recorded.

```typescript
// Manual checking
const config = {
  autoCheckLatency: false,  // Check explicitly with checkLatencyThreshold()
};

// Automatic checking
const config = {
  autoCheckLatency: true,   // Check on every recordLatency() call
};
```

**When to enable:**
- Real-time latency monitoring required
- Can handle overhead of checks
- Want automatic circuit opens on latency

**When to disable:**
- Batch checking in monitoring thread
- Performance sensitive operations
- Want control over check timing

### Recovery Configuration

#### retryTimeout

**Type:** `number`
**Default:** `30000`
**Unit:** milliseconds
**Range:** `5000-300000`

Time to wait in OPEN state before transitioning to HALF_OPEN and attempting recovery.

```typescript
// Aggressive recovery (retry quickly)
const config = {
  retryTimeout: 10000,  // Try again after 10 seconds
};

// Standard (default)
const config = {
  retryTimeout: 30000,  // Try again after 30 seconds
};

// Conservative (give service time to recover)
const config = {
  retryTimeout: 60000,  // Try again after 1 minute
};
```

**Typical Values:**

| Service | Timeout | Rationale |
|---------|---------|-----------|
| Local development | 5-10 seconds | Quick feedback |
| Regional service | 30 seconds | Standard case |
| Critical service | 60 seconds | Avoid thundering herd |
| Cloud service | 90-120 seconds | Account for deployment |

#### requestTimeout

**Type:** `number`
**Default:** `5000`
**Unit:** milliseconds

Maximum time to wait for a request before considering it failed.

```typescript
// Fast timeout (strict)
const config = {
  requestTimeout: 2000,  // 2 second timeout
};

// Standard (default)
const config = {
  requestTimeout: 5000,  // 5 second timeout
};

// Generous (slow services)
const config = {
  requestTimeout: 10000,  // 10 second timeout
};
```

**Note:** This should align with your actual request SLAs. Set it too low and transient slow requests get counted as failures; too high and you wait unnecessarily.

## Configuration Examples

### Local MLX Service (Fast, Reliable)

```typescript
const config = {
  failureThreshold: 2,        // Strict - fail fast
  successThreshold: 1,        // Fast recovery
  retryTimeout: 10000,        // Quick retry
  requestTimeout: 5000,       // Standard timeout
  latencyThresholdMs: 1000,   // 1 second SLA
  latencyConsecutiveChecks: 2,// Sensitive to slowness
  latencyWindowMs: 1000,      // 1 second window
  autoCheckLatency: true,     // Real-time monitoring
};
```

### Remote API (Variable Latency)

```typescript
const config = {
  failureThreshold: 5,        // Tolerate transient failures
  successThreshold: 2,        // Verify recovery
  retryTimeout: 30000,        // Standard retry
  requestTimeout: 10000,      // Give it time
  latencyThresholdMs: 5000,   // 5 second SLA
  latencyConsecutiveChecks: 3,// Tolerate some slowness
  latencyWindowMs: 5000,      // 5 second window
  autoCheckLatency: false,    // Batch checking
};
```

### Failure-Only Mode (No Latency Monitoring)

```typescript
const config = {
  failureThreshold: 5,        // Standard
  successThreshold: 2,        // Standard
  retryTimeout: 30000,        // Standard
  requestTimeout: 5000,       // Standard
  latencyThresholdMs: 0,      // Disabled
  autoCheckLatency: false,    // Not needed
};
```

### Strict Service (Critical Path)

```typescript
const config = {
  failureThreshold: 3,        // Strict
  successThreshold: 3,        // High confidence
  retryTimeout: 60000,        // Long wait
  requestTimeout: 3000,       // Short timeout
  latencyThresholdMs: 500,    // Strict 500ms SLA
  latencyConsecutiveChecks: 2,// React quickly
  latencyWindowMs: 2000,      // 2 second window
  autoCheckLatency: true,     // Real-time
};
```

## Monitoring Endpoints

The circuit breaker exposes a metrics endpoint for monitoring and alerting.

### GET /v1/circuit-breaker/metrics

Returns complete circuit breaker metrics in JSON format.

**Request:**
```bash
curl http://localhost:8080/v1/circuit-breaker/metrics
```

**Response:**
```json
{
  "state": "CLOSED",
  "failureCount": 2,
  "successCount": 125,
  "avgLatencyMs": 234.56,
  "latencySamples": 45,
  "minLatencyMs": 120,
  "maxLatencyMs": 890,
  "p50LatencyMs": 210.5,
  "p95LatencyMs": 750.3,
  "p99LatencyMs": 880.1,
  "consecutiveHighLatency": 0,
  "nextAttempt": null,
  "timestamp": "2025-01-08T10:30:45.123Z"
}
```

### Metrics Field Reference

| Field | Type | Meaning |
|-------|------|---------|
| `state` | `CLOSED\|OPEN\|HALF_OPEN` | Current circuit state |
| `failureCount` | number | Total failures recorded |
| `successCount` | number | Total successes recorded |
| `avgLatencyMs` | number | Average latency in milliseconds |
| `latencySamples` | number | Number of latency samples in current window |
| `minLatencyMs` | number | Minimum latency observed |
| `maxLatencyMs` | number | Maximum latency observed |
| `p50LatencyMs` | number | 50th percentile (median) latency |
| `p95LatencyMs` | number | 95th percentile latency (SLA level) |
| `p99LatencyMs` | number | 99th percentile latency (worst case) |
| `consecutiveHighLatency` | number | Current consecutive high-latency count |
| `nextAttempt` | string\|null | ISO timestamp of next HALF_OPEN attempt (null if CLOSED) |
| `timestamp` | string | Metrics collection timestamp |

### Monitoring in Code

```typescript
import { CircuitBreaker, CircuitState } from './src/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  latencyThresholdMs: 2000,
});

// Set up state change listener
breaker.onStateChangeListener((newState, reason) => {
  console.log(`Circuit state changed to ${newState}${reason ? ` (${reason})` : ''}`);

  // Trigger alerts, log events, etc.
  if (newState === CircuitState.OPEN) {
    alert(`Service degraded: ${reason}`);
  }
});

// Record requests
try {
  const start = Date.now();
  const result = await callService();
  const latency = Date.now() - start;

  breaker.recordSuccess();
  breaker.recordLatency(latency);
} catch (error) {
  breaker.recordFailure();
}

// Check metrics
const metrics = breaker.getMetrics();
console.log(`Current state: ${metrics.state}`);
console.log(`P95 latency: ${metrics.p95LatencyMs}ms`);
```

## Usage Patterns

### Basic Protection

```typescript
import { CircuitBreaker } from './src/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  retryTimeout: 30000,
});

async function callService(request: Request): Promise<Response> {
  // Check if circuit allows request
  if (!breaker.shouldAllowRequest()) {
    // Circuit is open - use fallback
    return getFallbackResponse();
  }

  try {
    const response = await anthropicClient.messages.create(request);
    breaker.recordSuccess();
    return response;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}
```

### With Latency Monitoring

```typescript
async function callServiceWithLatencyMonitoring(request: Request): Promise<Response> {
  if (!breaker.shouldAllowRequest()) {
    return getFallbackResponse();
  }

  const start = Date.now();
  try {
    const response = await anthropicClient.messages.create(request);
    const latency = Date.now() - start;

    breaker.recordSuccess();
    breaker.recordLatency(latency);  // Automatically checks threshold if enabled

    return response;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}
```

### State Change Notifications

```typescript
const breaker = new CircuitBreaker({...});

breaker.onStateChangeListener((newState, reason) => {
  if (newState === CircuitState.OPEN) {
    logger.error(`Circuit opened: ${reason}`);
    metrics.increment('circuit_breaker.trips');
    sendAlert(`Service degraded: ${reason}`);
  } else if (newState === CircuitState.CLOSED) {
    logger.info('Circuit recovered');
    metrics.increment('circuit_breaker.recoveries');
  }
});
```

## Troubleshooting

### Circuit Stuck in OPEN

**Symptom:** Circuit remains OPEN indefinitely.

**Diagnosis:**
```typescript
const metrics = breaker.getMetrics();
if (metrics.state === CircuitState.OPEN) {
  console.log(`Next retry attempt: ${metrics.nextAttempt}`);
  // Check if timestamp is in the past (should have transitioned)
}
```

**Solutions:**
1. Verify underlying service is healthy
2. Check `retryTimeout` isn't too large
3. Manually reset: `breaker.reset()`
4. Increase `failureThreshold` if service is flaky

### Too Many Rejections

**Symptom:** Circuit opens too frequently.

**Solutions:**
1. Increase `failureThreshold`: `failureThreshold: 5` → `failureThreshold: 8`
2. Increase `successThreshold` to require more successes before recovery
3. Increase `retryTimeout` to give service longer to recover
4. Disable latency monitoring if not needed: `latencyThresholdMs: 0`

### Latency Threshold Too Sensitive

**Symptom:** Circuit opens due to latency spikes that are normal.

**Solutions:**
1. Increase `latencyThresholdMs` (e.g., 1000 → 2000)
2. Increase `latencyConsecutiveChecks` (e.g., 2 → 5)
3. Increase `latencyWindowMs` for smoothing
4. Set `autoCheckLatency: false` and check manually on non-critical paths

### P95/P99 Latency Increasing

**Symptom:** Metrics show latency percentiles growing.

**Analysis:**
```typescript
const metrics = breaker.getMetrics();
console.log(`P50: ${metrics.p50LatencyMs}ms (median)`);
console.log(`P95: ${metrics.p95LatencyMs}ms (95% users see this)`);
console.log(`P99: ${metrics.p99LatencyMs}ms (worst 1% see this)`);

// If P95 is much higher than P50, service is degrading
const degradationFactor = metrics.p95LatencyMs / metrics.p50LatencyMs;
if (degradationFactor > 5) {
  console.warn('Service latency distribution is degrading');
}
```

**Solutions:**
1. Adjust latency threshold based on your SLA
2. Investigate root cause (scaling, overload, etc.)
3. Consider lowering `latencyThresholdMs` to catch issues earlier

## Best Practices

1. **Start Conservative**
   - Use defaults first
   - Monitor metrics for a week
   - Adjust based on actual behavior

2. **Monitor Metrics**
   - Set up alerts on `state === OPEN`
   - Track `p95LatencyMs` for SLA violations
   - Watch `consecutiveHighLatency` for early warning

3. **Test Recovery**
   - Verify fallback systems work
   - Test manual recovery (`breaker.reset()`)
   - Load test with circuit open

4. **Document Your Settings**
   - Include rationale in code comments
   - Document SLA assumptions
   - Update when requirements change

5. **Combine with Monitoring**
   - Correlate circuit state with alerts
   - Track state transition frequency
   - Use percentiles for SLA monitoring

## See Also

- [Production Hardening API Reference](../reference/production-hardening-api.md) - Comprehensive monitoring
- [Development Guide](./circuit-breaker-guide.md) - Detailed implementation patterns
- [Configuration Guide](./configuration.md) - Full anyclaude configuration
