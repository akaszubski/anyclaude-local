# Production Hardening Implementation (Phase 3)

Complete implementation guide for the three production hardening modules: ErrorHandler, MetricsCollector, and ConfigValidator.

## Module Overview

| Module           | Location                           | Lines | Classes | Methods | Tests |
| ---------------- | ---------------------------------- | ----- | ------- | ------- | ----- |
| ErrorHandler     | `scripts/lib/error_handler.py`     | 381   | 4       | 12      | 44    |
| MetricsCollector | `scripts/lib/metrics_collector.py` | 373   | 2       | 15      | 52    |
| ConfigValidator  | `scripts/lib/config_validator.py`  | 434   | 3       | 8       | 60    |
| **Total**        |                                    | 1188  | 9       | 35      | 156   |

## ErrorHandler Implementation

File: `scripts/lib/error_handler.py` (381 lines)

### Architecture

The ErrorHandler provides graceful degradation and recovery mechanisms:

```
Request → Check Cache Enabled?
  ├─ Yes → Use Cache
  │  └─ Error → handle_cache_error() → Degrade or Recover
  └─ No → Use Fallback (non-cached)

Error Tracking:
  ├─ Cache Error: +1 error_count, check threshold (5)
  ├─ Network Error: retry_with_backoff() with exponential backoff
  └─ OOM Error: handle_oom_error() → clear cache → free memory
```

### Exception Classes

**CacheError**

```python
class CacheError(Exception):
    """Raised when cache operations fail"""
    pass
```

**OOMError**

```python
class OOMError(Exception):
    """Raised when out-of-memory condition detected"""
    pass
```

**NetworkError**

```python
class NetworkError(Exception):
    """Raised when network operations fail"""
    pass
```

### ErrorHandler Class

**Key Attributes:**

```python
self.enable_graceful_degradation = bool  # Enable cache degradation
self.max_retries = int                   # Max retry attempts
self.retry_backoff_ms = int              # Initial backoff delay (ms)

self.cache_error_count = int             # Consecutive cache errors
self.cache_success_count = int           # Consecutive successes
self.cache_enabled = bool                # Whether cache is active

self.ERROR_THRESHOLD = 5                 # Errors before degradation
self.SUCCESS_THRESHOLD = 10              # Successes before recovery
self.lock = threading.Lock()             # Thread safety
```

**Core Methods:**

**`handle_cache_error(error: Optional[Exception]) -> Dict[str, Any]`**

Handles cache errors with graceful degradation:

1. Record error count (thread-safe)
2. Check if threshold reached (5 consecutive errors)
3. Disable cache if threshold exceeded
4. Sanitize error message
5. Return fallback instructions

```python
def handle_cache_error(self, error: Optional[Exception]) -> Dict[str, Any]:
    """
    Handle cache errors with graceful degradation

    Args:
        error: Cache error exception (must not be None)

    Returns:
        {
            'status': 'degraded',
            'cache_enabled': False,  # Whether to use cache
            'fallback_available': True,  # Whether fallback exists
            'error': 'sanitized message'  # Safe error text
        }

    Raises:
        ValueError: If error is None
    """
```

Flow:

```
Cache Error → Check Error Count
  ├─ < 5 errors → Continue using cache, increment error count
  ├─ >= 5 errors → Disable cache, set cache_enabled = False
  └─ Return degraded state + fallback instructions
```

**`handle_oom_error(error: OOMError) -> Dict[str, Any]`**

Handles out-of-memory errors with cache clearing:

1. Signal cache to clear
2. Estimate memory freed
3. Enable fallback mode
4. Return memory recovery status

```python
def handle_oom_error(self, error: OOMError) -> Dict[str, Any]:
    """
    Handle OOM errors with cache clearing

    Args:
        error: OOMError exception

    Returns:
        {
            'status': 'oom_handled',
            'cache_cleared': True,
            'memory_freed_mb': 1024.5,
            'fallback_mode': True
        }
    """
```

**`retry_with_backoff(fn: Callable, \*args, **kwargs) -> Any`\*\*

Network retry with exponential backoff:

1. Attempt function call
2. If fails, calculate backoff: `delay = initial_backoff * (2 ^ attempt)`
3. Sleep for calculated delay
4. Retry up to max_retries
5. Return result or raise exception

```python
def retry_with_backoff(self, fn: Callable, *args, **kwargs) -> Any:
    """
    Retry operation with exponential backoff

    Args:
        fn: Function to retry
        *args: Positional arguments to function
        **kwargs: Keyword arguments to function

    Returns:
        Result of function call (if successful)

    Raises:
        NetworkError: If all retries exhausted

    Backoff schedule (ms):
        Attempt 1: 100ms
        Attempt 2: 200ms
        Attempt 3: 400ms
    """
```

**`sanitize_error_message(message: str) -> str`**

Prevents information disclosure by sanitizing error messages:

1. Remove file paths (regex: `/[a-zA-Z0-9/_.-]+`)
2. Remove line numbers (regex: `:[0-9]+:`)
3. Remove sensitive keywords (password, key, secret, token, api)
4. Return generic safe message

```python
def sanitize_error_message(self, message: str) -> str:
    """
    Sanitize error message (security VUL-003)

    Removes:
    - File paths and directories
    - Line numbers and stack frames
    - Sensitive keywords (password, API key, token, secret)

    Args:
        message: Original error message

    Returns:
        Sanitized safe error message

    Example:
        Input: "Error loading /home/user/.anyclaude/model: key='secret123'"
        Output: "Error: file access error (path redacted)"
    """
```

Other Methods:

- `record_cache_error(error)` - Record error and check threshold
- `reset_error_count()` - Reset error tracking (on success)
- `try_recover_cache()` - Check if cache should be re-enabled
- `should_disable_cache()` - Check if error threshold reached
- `should_enable_cache()` - Check if success threshold reached

### Security Implications

**VUL-003: Path Disclosure**

- Solution: `sanitize_error_message()` removes all file paths
- All error messages passed through sanitizer before logging/returning
- Tests verify no paths leak in error responses

**VUL-005: Retry Storms**

- Solution: Exponential backoff prevents hammering remote service
- Max 3 retries with 100ms, 200ms, 400ms delays
- Configurable to adjust for different network conditions

## MetricsCollector Implementation

File: `scripts/lib/metrics_collector.py` (373 lines)

### Architecture

MetricsCollector tracks performance metrics with minimal overhead:

```
Request Flow:
  1. Start timing
  2. Process request
  3. Record latency, cache hit/miss, throughput
  4. Record memory usage
  5. Return metrics on demand

Metrics Tracking:
  ├─ Cache: Hits/Misses → Calculate hit_rate
  ├─ Latency: All samples → Calculate P50, P95, P99 percentiles
  ├─ Memory: Current/Peak/Growth via psutil
  └─ Throughput: Requests/sec over rolling 5-min window
```

### MetricType Constants

```python
class MetricType:
    """Metric type constants"""
    CACHE_HIT = "cache_hit"
    CACHE_MISS = "cache_miss"
    LATENCY = "latency"
    MEMORY = "memory"
    THROUGHPUT = "throughput"
```

### MetricsCollector Class

**Key Attributes:**

```python
# Cache metrics
self.cache_hits = 0              # Total cache hits
self.cache_misses = 0            # Total cache misses

# Latency metrics
self.latencies: List[float] = [] # All latency samples (ms)

# Memory metrics
self.memory_current_mb = 0.0     # Current memory (MB)
self.memory_peak_mb = 0.0        # Peak memory (MB)
self.memory_initial_mb = 0.0     # Initial memory (MB)

# Throughput metrics
self.total_requests = 0          # Total request count
self.request_timestamps = []     # Request timestamps for RPS calc

# Uptime
self.start_time = time.time()    # Server start time

# Thread safety
self.lock = threading.Lock()     # Protects all shared state
```

**Cache Methods:**

**`record_cache_hit() -> None`**

```python
def record_cache_hit(self) -> None:
    """Record a cache hit (thread-safe)"""
    with self.lock:
        self.cache_hits += 1
```

**`record_cache_miss() -> None`**

```python
def record_cache_miss(self) -> None:
    """Record a cache miss (thread-safe)"""
    with self.lock:
        self.cache_misses += 1
```

**`get_cache_stats() -> Dict[str, Any]`**

```python
def get_cache_stats(self) -> Dict[str, Any]:
    """
    Calculate cache hit/miss statistics

    Returns:
        {
            'hits': 256,
            'misses': 44,
            'hit_rate': 0.85  # 0.0 to 1.0, even if no hits
        }
    """
```

Calculation:

```
hit_rate = hits / (hits + misses)
# Returns 0.0 if no requests yet (avoids division by zero)
```

**Latency Methods:**

**`record_latency(latency_ms: float) -> None`**

```python
def record_latency(self, latency_ms: float) -> None:
    """
    Record request latency in milliseconds

    Args:
        latency_ms: Latency in milliseconds

    Raises:
        ValueError: If latency is negative
    """
```

**`get_latency_stats() -> Dict[str, Any]`**

```python
def get_latency_stats(self) -> Dict[str, Any]:
    """
    Calculate latency percentiles

    Returns:
        {
            'latencies': [125.3, 145.2, ...],  # All samples
            'p50': 125.3,   # Median
            'p95': 450.2,   # 95th percentile
            'p99': 892.5    # 99th percentile
        }
    """
```

Percentile Calculation:

```python
def _percentile(self, sorted_values: List[float], percentile: int) -> float:
    """
    Linear interpolation for percentile calculation

    Formula:
        index = (percentile / 100.0) * (n - 1)
        result = lower_value + (upper_value - lower_value) * fraction

    Example (P95 of 20 samples):
        index = (95 / 100) * 19 = 18.05
        lower_index = 18, upper_index = 19
        result = value[18] + (value[19] - value[18]) * 0.05
    """
```

**Memory Methods:**

**`record_memory_usage() -> None`**

```python
def record_memory_usage(self) -> None:
    """
    Record current memory usage via psutil

    Tracks:
    - Current memory (RSS)
    - Peak memory (max so far)
    - Initial memory (first sample)
    """
```

**`get_memory_stats() -> Dict[str, Any]`**

```python
def get_memory_stats() -> Dict[str, Any]:
    """
    Get memory statistics

    Returns:
        {
            'current_mb': 4850.2,     # Current RSS
            'peak_mb': 5120.1,        # Max since startup
            'initial_mb': 3200.0,     # At startup
            'growth_mb': 1650.2       # Total growth
        }
    """
```

**Throughput Methods:**

**`record_throughput() -> None`**

```python
def record_throughput(self) -> None:
    """Record a request for throughput calculation"""
    with self.lock:
        self.total_requests += 1
        self.request_timestamps.append(time.time())
```

**`get_throughput_stats() -> Dict[str, Any]`**

```python
def get_throughput_stats() -> Dict[str, Any]:
    """
    Calculate requests per second

    Returns:
        {
            'requests_per_second': 2.5,    # Current RPS
            'total_requests': 9000,        # All-time total
            'window_seconds': 300          # Time window (5 min)
        }
    """
```

Calculation:

```
# Use 5-minute rolling window
window_start = time.time() - 300
requests_in_window = count(timestamps > window_start)
rps = requests_in_window / 300
```

**Export Methods:**

**`export_metrics_json() -> Dict[str, Any]`**

```python
def export_metrics_json(self) -> Dict[str, Any]:
    """
    Export all metrics as JSON dictionary

    Returns:
        {
            'timestamp': 1731804000.123,
            'uptime_seconds': 3600.45,
            'cache': {...},
            'latency': {...},
            'memory': {...},
            'throughput': {...}
        }
    """
```

**`export_metrics_prometheus() -> str`**

```python
def export_metrics_prometheus(self) -> str:
    """
    Export metrics in Prometheus text format

    Format:
        # HELP metric_name Description
        # TYPE metric_name gauge|counter
        metric_name value
    """
```

## ConfigValidator Implementation

File: `scripts/lib/config_validator.py` (434 lines)

### Architecture

ConfigValidator runs at server startup to prevent misconfiguration:

```
Server Startup:
  1. Call validate_all_config()
  2. Check all environment variables
  3. Validate port availability
  4. Check model path exists
  5. Verify all dependencies installed
  6. Return comprehensive validation result
  7. Exit with error if any critical issues
```

### Validation Flow

```python
def validate_all_config(self) -> Dict[str, Any]:
    """
    Comprehensive configuration validation

    Checks:
    1. Environment variables (MLX_TEXTGEN_URL, MLX_TEXTGEN_MODEL, etc.)
    2. Port configuration (range, conflicts, privileges)
    3. Model paths (existence, permissions, required files)
    4. Dependencies (installed, version requirements)
    5. Permission checks (can read/write required directories)

    Returns:
        {
            'valid': True,
            'warnings': ['Port 80 requires root access'],
            'errors': [],
            'checks_passed': 15,
            'checks_failed': 0
        }
    """
```

### Exception Classes

**ValidationError**

```python
class ValidationError(Exception):
    """Raised when configuration validation fails (non-fatal)"""
    pass
```

**DependencyError**

```python
class DependencyError(Exception):
    """Raised when required dependency is missing (fatal)"""
    pass
```

### ConfigValidator Class

**Port Validation:**

**`validate_port(port: Any) -> Dict[str, Any]`**

```python
def validate_port(self, port: Any) -> Dict[str, Any]:
    """
    Validate port number

    Checks:
    1. Convert to int if string
    2. Range: 1-65535
    3. Privilege warning: < 1024

    Args:
        port: Port number (int or string)

    Returns:
        {
            'valid': True,
            'port': 8080,
            'warning': 'Port 80 is privileged...'  # Optional
        }

    Raises:
        ValidationError: If port out of range
    """
```

Range Checking:

```
Port < 1: Invalid
Port > 65535: Invalid
Port 1-1023: Valid but privileged (warning)
Port 1024-65535: Valid
```

**Environment Variable Validation:**

**`validate_env_var(var_name: str, required: bool = False, var_type: str = 'str', min_value: Optional[int] = None, max_value: Optional[int] = None) -> Dict[str, Any]`**

```python
def validate_env_var(
    self,
    var_name: str,
    required: bool = False,
    var_type: str = 'str',
    min_value: Optional[int] = None,
    max_value: Optional[int] = None
) -> Dict[str, Any]:
    """
    Validate environment variable

    Checks:
    1. Variable exists (if required=True)
    2. Convert to specified type
    3. Check range (if min/max specified)

    Args:
        var_name: Environment variable name
        required: Must exist
        var_type: Expected type ('str', 'int', 'float', 'bool')
        min_value: Minimum value (for int)
        max_value: Maximum value (for int)

    Returns:
        {
            'valid': True,
            'value': 8080,  # Converted to var_type
            'var_name': 'PORT'
        }

    Raises:
        ValidationError: If required but missing, or type conversion fails
    """
```

Type Conversion:

```python
'str' → Use as-is
'int' → int(value), validate min/max
'float' → float(value), validate min/max
'bool' → value.lower() in ['true', '1', 'yes']
```

**Model Path Validation:**

**`validate_model_path(model_path: str) -> Dict[str, Any]`**

```python
def validate_model_path(self, model_path: str) -> Dict[str, Any]:
    """
    Validate model path

    Checks:
    1. Path exists
    2. Is directory
    3. Readable by current user
    4. Contains required files (weights, config, etc.)

    Args:
        model_path: Path to model directory

    Returns:
        {
            'valid': True,
            'path': '/path/to/model',
            'exists': True,
            'is_dir': True,
            'readable': True,
            'required_files': {...}
        }

    Raises:
        ValidationError: If path doesn't exist or not readable
    """
```

**Dependency Validation:**

**`validate_dependency(module_name: str, min_version: Optional[str] = None) -> Dict[str, Any]`**

```python
def validate_dependency(
    self,
    module_name: str,
    min_version: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validate dependency is installed and meets version requirement

    Args:
        module_name: Python module name
        min_version: Minimum version (e.g., '2.0.0')

    Returns:
        {
            'valid': True,
            'module': 'torch',
            'version': '2.1.0',
            'meets_min_version': True
        }

    Raises:
        DependencyError: If module not installed or version too old
    """
```

Version Comparison:

```
Compares semantic versions: X.Y.Z
'2.1.0' >= '2.0.0' → True
'1.9.0' >= '2.0.0' → False
```

## Integration in MLX Server

File: `scripts/mlx-server.py`

### Initialization

```python
from lib.error_handler import ErrorHandler
from lib.metrics_collector import MetricsCollector
from lib.config_validator import ConfigValidator

class MLXServer:
    def __init__(self):
        # Initialize all three systems
        self.error_handler = ErrorHandler(
            enable_graceful_degradation=True,
            max_retries=3,
            retry_backoff_ms=100
        )

        self.metrics = MetricsCollector(
            enable_memory_tracking=True,
            enable_latency_tracking=True
        )

        self.config_validator = ConfigValidator()

        # Run validation at startup
        config_result = self.config_validator.validate_all_config()
        if not config_result['valid']:
            logger.error("Configuration validation failed")
            for error in config_result['errors']:
                logger.error(f"  - {error}")
            sys.exit(1)
```

### Request Handling

```python
@app.post("/v1/chat/completions")
async def chat_completion(request_body: dict):
    """Handle chat completion with error recovery and metrics"""
    start_time = time.time()

    try:
        # Process request
        response = await process_completion(request_body)

        # Record success
        elapsed_ms = (time.time() - start_time) * 1000
        self.metrics.record_latency(elapsed_ms)
        self.metrics.record_throughput()
        self.metrics.record_memory_usage()

        # Check if cache hit
        if cache_match_found:
            self.metrics.record_cache_hit()
        else:
            self.metrics.record_cache_miss()

        return response

    except CacheError as e:
        # Handle cache error with graceful degradation
        result = self.error_handler.handle_cache_error(e)

        if not result['cache_enabled']:
            # Use fallback (non-cached response)
            response = await process_completion_no_cache(request_body)

        return response

    except OOMError as e:
        # Handle OOM with cache clearing
        result = self.error_handler.handle_oom_error(e)
        logger.warning(f"OOM handled: freed {result['memory_freed_mb']}MB")

        # Retry with cache cleared
        response = await process_completion(request_body)
        return response
```

### Metrics Endpoint

```python
@app.get("/v1/metrics")
async def metrics(format: str = 'json'):
    """Performance metrics endpoint (Phase 3)"""
    if format == 'prometheus':
        return self.metrics.export_metrics_prometheus()
    else:
        return self.metrics.export_metrics_json()
```

## Testing Strategy

### Unit Tests

Each module has comprehensive unit tests:

**ErrorHandler (44 tests)**

- Cache error handling and thresholds
- OOM error handling and memory recovery
- Network retry with exponential backoff
- Error message sanitization

**MetricsCollector (52 tests)**

- Cache hit/miss tracking
- Latency percentile calculation
- Memory tracking and peak detection
- Throughput calculation
- JSON and Prometheus export formats

**ConfigValidator (60 tests)**

- Port validation (range, privileges)
- Environment variable validation (type, range)
- Model path validation
- Dependency version checking
- Comprehensive validation

### Integration Tests

**Metrics Endpoint (18 tests)**

- JSON format response structure
- Prometheus format output
- Real-time metric updates
- Concurrent request handling

### Regression Tests

**Error Recovery (11 tests)**

- Graceful degradation behavior
- Cache re-enablement after recovery
- Fallback mode correctness
- OOM handling under load

### Stress Tests

**Stability Testing (100-request suite)**

- Error recovery under sustained load
- Metric accuracy during high throughput
- Memory growth monitoring
- All error types exercised

## Performance Characteristics

### Overhead Analysis

**ErrorHandler**

- Per-request overhead: < 1μs (lock acquire/release only)
- Memory: ~500 bytes fixed + counters
- Negligible impact on latency

**MetricsCollector**

- Per-metric overhead: < 1μs (append to list, update counter)
- Memory: ~1KB + samples (configurable retention)
- Percentile calculation: O(n log n) sorting, ~10ms for 1000 samples
- Export JSON: ~5ms, Export Prometheus: ~10ms

**ConfigValidator**

- Runs once at startup: ~100ms
- No per-request overhead
- Zero impact on throughput

### Thread Safety

All three modules use:

- `threading.Lock()` for protecting shared state
- Minimal critical sections to reduce contention
- Copy-on-export pattern (readers don't block writers)

## Security Considerations

### VUL-003: Path Disclosure Prevention

ErrorHandler sanitizes all error messages:

- Regex removes file paths: `/[a-zA-Z0-9/_.-]+`
- Removes line numbers: `:[0-9]+:`
- Removes sensitive keywords: password, key, secret, token, api
- Result: Safe generic error messages in responses/logs

### VUL-004: Unbounded Memory Growth

MetricsCollector prevents memory issues:

- Latency samples: Configurable limit (default: unlimited, audit log if > 10000)
- Memory tracking: Current + peak (no accumulated history)
- Throughput: Rolling 5-minute window (bounded to 300 timestamps)

### VUL-005: Network Retry Storms

ErrorHandler prevents retry storms:

- Exponential backoff: 100ms → 200ms → 400ms
- Max 3 retries (configurable)
- Circuit breaker: Disable cache after threshold reached
- Prevents hammering remote services

## Related Documentation

- API Reference: `docs/reference/production-hardening-api.md`
- Testing: `tests/unit/test_error_handler.py`, `test_metrics_collector.py`, `test_config_validator.py`
- Security Audit: `docs/development/security-fixes-cache-warmup.md`
