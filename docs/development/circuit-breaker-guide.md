# Circuit Breaker Guide

A comprehensive guide to understanding and using the circuit breaker pattern for resilient MLX inference.

## Overview

The circuit breaker is a resilience pattern that prevents cascading failures when calling a service that's failing. It works like an electrical circuit breaker: when too many failures occur, it "trips" and stops trying, preventing wasted resources.

**Key benefits**:

- **Fast Failure**: Immediately reject requests when service is failing (no timeout waits)
- **Recovery**: Automatically attempts recovery after timeout
- **Resource Protection**: Prevents overwhelming a failing service
- **Observability**: Detailed metrics on failures and recovery

## How It Works

### States

The circuit breaker has three states:

```
CLOSED (normal operation)
  ↓ (failures exceed threshold)
OPEN (failing, rejecting requests)
  ↓ (timeout expires)
HALF_OPEN (testing recovery)
  ↓ (success)
CLOSED (recovered!)

  OR ↓ (failure)
OPEN (still failing)
```

### State Descriptions

**CLOSED**

- Normal operation, all requests pass through
- Counts failures in background
- When failures reach threshold (5 by default), transitions to OPEN

**OPEN**

- Circuit is "tripped", all requests are rejected immediately
- Returns `CircuitBreakerError` without calling the underlying function
- Prevents overwhelming the failing service
- After timeout (60 seconds), transitions to HALF_OPEN to test recovery

**HALF_OPEN**

- Recovery test mode, limited requests allowed through
- If request succeeds, transitions to CLOSED
- If request fails, transitions back to OPEN
- Prevents flooding the service while testing recovery

## Basic Usage

### Simple Case: Wrapping a Function

```python
from lib.circuit_breaker import CircuitBreaker, CircuitBreakerError

def call_mlx_server(prompt: str) -> str:
    """Call MLX server (might fail)"""
    response = requests.post(
        "http://localhost:8080/v1/messages",
        json={"prompt": prompt}
    )
    return response.text

# Create circuit breaker
breaker = CircuitBreaker(
    failure_threshold=5,      # Trip after 5 failures
    recovery_timeout=60,      # Test recovery after 60 seconds
    name="mlx_server"
)

# Use it
try:
    response = breaker.call(call_mlx_server, "Hello, world!")
except CircuitBreakerError:
    # Circuit is open, service degraded
    print("MLX server is failing, using fallback")
    response = get_fallback_response()
```

### With Tool Parsers

```python
from lib.circuit_breaker import CircuitBreaker
from lib.tool_parsers import parser_registry

breaker = CircuitBreaker(name="tool_parsing")

def parse_tools(response: str):
    return breaker.call(
        parser_registry.parse_with_fallback,
        response
    )

# Use it
try:
    tools = parse_tools(model_response)
except CircuitBreakerError:
    print("Tool parsing failing, switching to text mode")
    tools = None
```

## Configuration

### Threshold

Number of consecutive failures before tripping:

```python
# More strict (trip faster)
breaker = CircuitBreaker(failure_threshold=3)

# Less strict (tolerate more failures)
breaker = CircuitBreaker(failure_threshold=10)

# Default is 5
breaker = CircuitBreaker()
```

**When to use different values**:

- **3-5**: Unreliable services, want fast feedback
- **5-10**: Normal services with occasional glitches
- **10+**: Very flaky services, need high tolerance

### Recovery Timeout

How long to wait in OPEN state before testing recovery:

```python
# Aggressive recovery (test every 10 seconds)
breaker = CircuitBreaker(recovery_timeout=10)

# Conservative recovery (test after 2 minutes)
breaker = CircuitBreaker(recovery_timeout=120)

# Default is 60 seconds
breaker = CircuitBreaker()
```

**When to use different values**:

- **10-30 seconds**: Service might recover quickly
- **60 seconds**: Normal case, good balance
- **120+ seconds**: Service takes time to recover

### Success Threshold (Half-Open)

How many successes needed to close the circuit:

```python
# Default is 1 success closes the circuit
breaker = CircuitBreaker(
    half_open_success_threshold=1
)

# Stricter: require 3 successes
breaker = CircuitBreaker(
    half_open_success_threshold=3
)
```

## Monitoring

### Check Current State

```python
from lib.circuit_breaker import CircuitBreakerState

breaker = CircuitBreaker(name="mlx_server")

state = breaker.get_state()
print(f"Current state: {state}")  # CircuitBreakerState.CLOSED

if state == CircuitBreakerState.OPEN:
    print("Service is failing!")
elif state == CircuitBreakerState.HALF_OPEN:
    print("Testing recovery...")
else:
    print("Service is healthy")
```

### Get Metrics

```python
metrics = breaker.get_metrics()

print(f"Total calls: {metrics.total_calls}")
print(f"Successes: {metrics.successes}")
print(f"Failures: {metrics.failures}")
print(f"Rejections: {metrics.rejections}")
print(f"Failure rate: {metrics.failure_rate:.1%}")
print(f"Rejection rate: {metrics.rejection_rate:.1%}")

# State change history
for change in metrics.state_changes:
    print(f"  {change['timestamp']}: {change['from_state']} -> {change['to_state']}")
```

### Real-Time Monitoring Example

```python
import time
from lib.circuit_breaker import CircuitBreakerState

breaker = CircuitBreaker(name="mlx_server")

def monitor_breaker():
    """Print breaker status every 10 seconds"""
    while True:
        metrics = breaker.get_metrics()
        state = breaker.get_state()

        print(f"[{state.value.upper()}]")
        print(f"  Calls: {metrics.total_calls} " +
              f"(Success: {metrics.successes}, Fail: {metrics.failures}, Reject: {metrics.rejections})")
        print(f"  Failure rate: {metrics.failure_rate:.1%}")
        print(f"  Rejection rate: {metrics.rejection_rate:.1%}")

        time.sleep(10)

# Run in background
import threading
monitor_thread = threading.Thread(target=monitor_breaker, daemon=True)
monitor_thread.start()
```

## Error Handling

### Catching CircuitBreakerError

```python
from lib.circuit_breaker import CircuitBreaker, CircuitBreakerError

breaker = CircuitBreaker(name="api_call")

try:
    result = breaker.call(some_api_call, arg1, arg2)
except CircuitBreakerError as e:
    # Circuit is open
    print(f"Circuit is open: {e}")
    # Implement fallback
    result = get_cached_result() or get_default_result()
```

### Error Types

```python
# CircuitBreakerError: Raised when circuit is OPEN
# (other errors from the wrapped function pass through)

try:
    result = breaker.call(risky_function)
except CircuitBreakerError:
    # Circuit is open, not calling risky_function
    print("Circuit open!")
except ValueError:
    # Error from risky_function itself
    print("risky_function raised ValueError")
except Exception as e:
    # Any other error
    print(f"Unexpected error: {e}")
```

## Integration Examples

### With Request Retry

```python
from lib.circuit_breaker import CircuitBreaker, CircuitBreakerError
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

def create_session_with_retry():
    """Create requests session with retry"""
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=0.5)
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    name="mlx_server"
)

session = create_session_with_retry()

def call_with_protection(prompt: str):
    """Call MLX server with circuit breaker + retry"""
    def wrapped_call():
        response = session.post(
            "http://localhost:8080/v1/messages",
            json={"prompt": prompt},
            timeout=30
        )
        return response.text

    try:
        return breaker.call(wrapped_call)
    except CircuitBreakerError:
        # Circuit open, use fallback
        return "Circuit breaker open, service unavailable"
```

### With Logging

```python
import logging
from lib.circuit_breaker import CircuitBreaker, CircuitBreakerState

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

breaker = CircuitBreaker(name="mlx_server")

def logged_call(prompt: str):
    """Call with logging"""
    state_before = breaker.get_state()

    try:
        result = breaker.call(some_function, prompt)
        logger.info(f"Success: {prompt[:50]}...")
        return result

    except Exception as e:
        state_after = breaker.get_state()

        if state_before != state_after:
            logger.warning(f"Circuit state changed: {state_before.value} -> {state_after.value}")

        logger.error(f"Error: {e}")
        raise
```

### With Metrics Export

```python
from lib.circuit_breaker import CircuitBreaker
import json

breaker = CircuitBreaker(name="mlx_server")

def export_metrics():
    """Export metrics as JSON"""
    metrics = breaker.get_metrics()
    state = breaker.get_state()

    data = {
        "name": breaker.name,
        "state": state.value,
        "metrics": {
            "total_calls": metrics.total_calls,
            "successes": metrics.successes,
            "failures": metrics.failures,
            "rejections": metrics.rejections,
            "failure_rate": metrics.failure_rate,
            "rejection_rate": metrics.rejection_rate,
        },
        "state_changes": metrics.state_changes
    }

    return json.dumps(data, indent=2, default=str)

# Export on demand
print(export_metrics())
```

## Performance

### Overhead Measurement

The circuit breaker has minimal overhead:

```python
import time
from lib.circuit_breaker import CircuitBreaker

breaker = CircuitBreaker(name="test")

def fast_function():
    return "ok"

# Measure overhead
iterations = 10000
start = time.time()

for _ in range(iterations):
    try:
        breaker.call(fast_function)
    except:
        pass

elapsed = (time.time() - start) * 1000
per_call = elapsed / iterations

print(f"Total: {elapsed:.1f}ms, Per call: {per_call:.3f}ms")
# Expected: <1ms total overhead for 10,000 calls
```

### Under Load

The circuit breaker scales well:

```python
import concurrent.futures
import time
from lib.circuit_breaker import CircuitBreaker

breaker = CircuitBreaker(name="load_test")

def api_call():
    time.sleep(0.01)  # Simulate 10ms API call
    return "ok"

# Simulate concurrent load
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    start = time.time()
    futures = [executor.submit(breaker.call, api_call) for _ in range(100)]
    results = [f.result() for f in futures]
    elapsed = time.time() - start

metrics = breaker.get_metrics()
print(f"Processed {metrics.total_calls} calls in {elapsed:.2f}s")
print(f"Throughput: {metrics.total_calls / elapsed:.0f} calls/sec")
```

## Testing

### Unit Tests

```python
import unittest
import time
from lib.circuit_breaker import CircuitBreaker, CircuitBreakerState, CircuitBreakerError

class TestCircuitBreaker(unittest.TestCase):
    def test_closed_state_allows_calls(self):
        """CLOSED state should allow calls"""
        breaker = CircuitBreaker()
        result = breaker.call(lambda: "ok")
        self.assertEqual(result, "ok")

    def test_trips_after_threshold(self):
        """Should trip after failures exceed threshold"""
        breaker = CircuitBreaker(failure_threshold=3)

        def failing():
            raise ValueError("Test error")

        # 3 failures
        for _ in range(3):
            try:
                breaker.call(failing)
            except ValueError:
                pass

        # Circuit should be OPEN
        self.assertEqual(breaker.get_state(), CircuitBreakerState.OPEN)

        # Next call should raise CircuitBreakerError, not ValueError
        with self.assertRaises(CircuitBreakerError):
            breaker.call(failing)

    def test_half_open_recovery(self):
        """Should transition HALF_OPEN -> CLOSED on success"""
        breaker = CircuitBreaker(
            failure_threshold=2,
            recovery_timeout=0.1  # Fast timeout for testing
        )

        def failing():
            raise ValueError()

        # Trip the breaker
        for _ in range(2):
            try:
                breaker.call(failing)
            except ValueError:
                pass

        self.assertEqual(breaker.get_state(), CircuitBreakerState.OPEN)

        # Wait for recovery timeout
        time.sleep(0.2)
        self.assertEqual(breaker.get_state(), CircuitBreakerState.HALF_OPEN)

        # Successful call should close it
        breaker.call(lambda: "ok")
        self.assertEqual(breaker.get_state(), CircuitBreakerState.CLOSED)

    def test_metrics_tracking(self):
        """Should track metrics accurately"""
        breaker = CircuitBreaker()

        # Successful calls
        for _ in range(5):
            breaker.call(lambda: "ok")

        metrics = breaker.get_metrics()
        self.assertEqual(metrics.successes, 5)
        self.assertEqual(metrics.failures, 0)
        self.assertEqual(metrics.failure_rate, 0.0)
```

## Troubleshooting

### Circuit Never Closes

**Problem**: Circuit is stuck in OPEN state.

**Solution**: Check recovery timeout and test the underlying service:

```python
breaker = CircuitBreaker()
state = breaker.get_state()
print(f"State: {state}")

# Try manual reset
breaker.reset()
print(f"After reset: {breaker.get_state()}")

# Verify underlying service is healthy
def test_service():
    # Call the service directly
    pass

try:
    test_service()
    print("Service is healthy, circuit should recover")
except Exception as e:
    print(f"Service still failing: {e}")
```

### Too Many Rejections

**Problem**: Circuit is rejecting too many requests.

**Solution**: Adjust failure threshold:

```python
# Current config
breaker = CircuitBreaker(failure_threshold=5)

# More lenient
breaker = CircuitBreaker(failure_threshold=10)

# Or increase recovery timeout
breaker = CircuitBreaker(recovery_timeout=120)
```

### Slow Recovery

**Problem**: Takes too long for circuit to attempt recovery.

**Solution**: Reduce recovery timeout:

```python
# Current: wait 60 seconds
breaker = CircuitBreaker(recovery_timeout=60)

# Faster: wait 30 seconds
breaker = CircuitBreaker(recovery_timeout=30)
```

## Best Practices

1. **Set Appropriate Thresholds**
   - Too strict: Trips on normal transient errors
   - Too lenient: Doesn't protect from cascading failures
   - Start with default (5) and adjust based on metrics

2. **Monitor Metrics**
   - Log state transitions
   - Alert on high rejection rates
   - Track failure patterns over time

3. **Implement Fallbacks**
   - Always handle `CircuitBreakerError`
   - Have cached or default responses ready
   - Log when circuit opens for debugging

4. **Test Recovery**
   - Verify underlying service recovers
   - Don't just fix circuit, fix root cause
   - Monitor metrics after recovery

5. **Combine with Retry**
   - Use with exponential backoff for transient errors
   - Circuit breaker handles persistent failures
   - Retry handles temporary glitches

## API Reference

### CircuitBreaker

```python
def __init__(
    self,
    failure_threshold: int = 5,
    recovery_timeout: int = 60,
    half_open_success_threshold: int = 1,
    name: str = "circuit_breaker"
):
    """Initialize circuit breaker"""

def call(self, func: Callable, *args, **kwargs) -> Any:
    """Call function with circuit breaker protection"""
    # Raises CircuitBreakerError if circuit is OPEN

def get_state(self) -> CircuitBreakerState:
    """Get current circuit state"""

def get_metrics(self) -> CircuitBreakerMetrics:
    """Get detailed metrics"""

def reset(self) -> None:
    """Reset to CLOSED state"""
```

### CircuitBreakerState

Enum with three values:

```python
class CircuitBreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"
```

### CircuitBreakerMetrics

Metrics data class:

```python
@dataclass
class CircuitBreakerMetrics:
    total_calls: int
    successes: int
    failures: int
    rejections: int
    state_changes: List[Dict[str, Any]]

    @property
    def failure_rate(self) -> float:
        """Failure rate (0.0-1.0)"""

    @property
    def rejection_rate(self) -> float:
        """Rejection rate (0.0-1.0)"""
```

## See Also

- `scripts/lib/circuit_breaker.py` - Implementation
- `tests/unit/test_circuit_breaker.py` - Unit tests
- `tests/integration/test_parser_failover.py` - Integration with parsers
- `docs/development/tool-parser-plugins.md` - Parser integration
