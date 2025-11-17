# Production Hardening API Reference (Phase 3)

Production-grade error handling, metrics collection, and configuration validation for MLX-Textgen server.

## Overview

Phase 3 introduces three production hardening systems:

1. **ErrorHandler** - Graceful error recovery with OOM detection and cache corruption handling
2. **MetricsCollector** - Real-time performance monitoring (cache hit rates, latency percentiles, memory usage)
3. **ConfigValidator** - Pre-startup configuration validation preventing server misconfiguration

## `/v1/metrics` Endpoint

Real-time performance metrics endpoint exposed by the MLX-Textgen server.

### Request

```http
GET /v1/metrics?format=json
GET /v1/metrics?format=prometheus
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `json` | Response format: `json` or `prometheus` |

### Response (JSON Format)

```json
{
  "timestamp": 1731804000.123,
  "uptime_seconds": 3600.45,
  "cache": {
    "hits": 256,
    "misses": 44,
    "hit_rate": 0.85
  },
  "latency": {
    "p50_ms": 125.3,
    "p95_ms": 450.2,
    "p99_ms": 892.5,
    "samples": 300
  },
  "memory": {
    "current_mb": 4850.2,
    "peak_mb": 5120.1,
    "initial_mb": 3200.0,
    "growth_mb": 1650.2
  },
  "throughput": {
    "requests_per_second": 2.5,
    "total_requests": 9000,
    "window_seconds": 300
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | float | Unix timestamp of metric collection |
| `uptime_seconds` | float | Time since server startup |
| `cache.hits` | int | Total cache hits |
| `cache.misses` | int | Total cache misses |
| `cache.hit_rate` | float | Hit rate as percentage (0.0-1.0) |
| `latency.p50_ms` | float | Median latency (50th percentile) |
| `latency.p95_ms` | float | 95th percentile latency |
| `latency.p99_ms` | float | 99th percentile latency |
| `latency.samples` | int | Number of latency samples collected |
| `memory.current_mb` | float | Current memory usage in MB |
| `memory.peak_mb` | float | Peak memory usage since startup |
| `memory.initial_mb` | float | Memory usage at startup |
| `memory.growth_mb` | float | Total memory growth since startup |
| `throughput.requests_per_second` | float | Requests per second (rolling window) |
| `throughput.total_requests` | int | Total requests since startup |
| `throughput.window_seconds` | int | Time window for throughput calculation |

### Response (Prometheus Format)

```
# HELP mlx_server_cache_hits Total cache hits
# TYPE mlx_server_cache_hits counter
mlx_server_cache_hits 256

# HELP mlx_server_cache_misses Total cache misses
# TYPE mlx_server_cache_misses counter
mlx_server_cache_misses 44

# HELP mlx_server_cache_hit_rate Cache hit rate (0-1)
# TYPE mlx_server_cache_hit_rate gauge
mlx_server_cache_hit_rate 0.85

# HELP mlx_server_latency_p50_ms Median request latency
# TYPE mlx_server_latency_p50_ms gauge
mlx_server_latency_p50_ms 125.3

# HELP mlx_server_latency_p95_ms 95th percentile request latency
# TYPE mlx_server_latency_p95_ms gauge
mlx_server_latency_p95_ms 450.2

# HELP mlx_server_latency_p99_ms 99th percentile request latency
# TYPE mlx_server_latency_p99_ms gauge
mlx_server_latency_p99_ms 892.5

# HELP mlx_server_memory_current_mb Current memory usage
# TYPE mlx_server_memory_current_mb gauge
mlx_server_memory_current_mb 4850.2

# HELP mlx_server_memory_peak_mb Peak memory usage
# TYPE mlx_server_memory_peak_mb gauge
mlx_server_memory_peak_mb 5120.1

# HELP mlx_server_memory_growth_mb Total memory growth
# TYPE mlx_server_memory_growth_mb gauge
mlx_server_memory_growth_mb 1650.2

# HELP mlx_server_throughput_rps Requests per second
# TYPE mlx_server_throughput_rps gauge
mlx_server_throughput_rps 2.5

# HELP mlx_server_uptime_seconds Server uptime
# TYPE mlx_server_uptime_seconds counter
mlx_server_uptime_seconds 3600.45
```

### Examples

**Query metrics in JSON format:**

```bash
curl http://localhost:8080/v1/metrics
# or explicitly:
curl http://localhost:8080/v1/metrics?format=json
```

**Query metrics in Prometheus format:**

```bash
curl http://localhost:8080/v1/metrics?format=prometheus
```

**Monitor metrics every 10 seconds:**

```bash
watch -n 10 'curl -s http://localhost:8080/v1/metrics | jq .'
```

**Extract specific metrics:**

```bash
# Get cache hit rate
curl -s http://localhost:8080/v1/metrics | jq '.cache.hit_rate'

# Get 95th percentile latency
curl -s http://localhost:8080/v1/metrics | jq '.latency.p95_ms'

# Get current memory usage
curl -s http://localhost:8080/v1/metrics | jq '.memory.current_mb'
```

## ErrorHandler API

Python module: `scripts/lib/error_handler.py`

Provides production error handling with graceful degradation.

### Classes

#### `CacheError`

Exception raised when cache operations fail.

```python
try:
    # cache operation
except CacheError as e:
    logger.error(f"Cache operation failed: {e}")
```

#### `OOMError`

Exception raised when out-of-memory condition is detected.

```python
from lib.error_handler import OOMError

try:
    # memory-intensive operation
except OOMError as e:
    logger.error(f"Out of memory: {e}")
```

#### `NetworkError`

Exception raised when network operations fail.

```python
from lib.error_handler import NetworkError

try:
    # network operation
except NetworkError as e:
    logger.error(f"Network error: {e}")
```

#### `ErrorHandler`

Main error handling class.

**Initialization:**

```python
from lib.error_handler import ErrorHandler

handler = ErrorHandler(
    enable_graceful_degradation=True,  # Disable cache on persistent errors
    max_retries=3,                      # Max retry attempts
    retry_backoff_ms=100                # Initial backoff delay
)
```

**Methods:**

**`handle_cache_error(error: Optional[Exception]) -> Dict[str, Any]`**

Handle cache errors with graceful degradation.

```python
try:
    # cache operation
except Exception as e:
    result = handler.handle_cache_error(e)
    if not result['cache_enabled']:
        logger.warning("Cache disabled due to persistent errors")
        # Fallback to non-cached requests
```

Returns:

```python
{
    'status': 'degraded',
    'cache_enabled': False,  # Whether cache is still enabled
    'fallback_available': True,  # Whether fallback is available
    'error': 'sanitized error message'  # Safe error message
}
```

**`handle_oom_error(error: OOMError) -> Dict[str, Any]`**

Handle out-of-memory errors with cache clearing.

```python
from lib.error_handler import OOMError

try:
    # memory operation
except OOMError as e:
    result = handler.handle_oom_error(e)
    if result['cache_cleared']:
        logger.info("Cache cleared to free memory")
```

Returns:

```python
{
    'status': 'oom_handled',
    'cache_cleared': True,  # Whether cache was cleared
    'memory_freed_mb': 1024.5,  # Approximate memory freed
    'fallback_mode': True  # Whether fallback mode activated
}
```

**`retry_with_backoff(fn: Callable, *args, **kwargs) -> Any`**

Retry operation with exponential backoff.

```python
def make_request():
    return requests.get('http://remote-api')

response = handler.retry_with_backoff(make_request)
```

**`sanitize_error_message(message: str) -> str`**

Sanitize error message to prevent information disclosure.

```python
unsafe_msg = f"Error loading {path}: {error}"
safe_msg = handler.sanitize_error_message(unsafe_msg)
# Output: "Error: configuration error (path redacted)"
```

## MetricsCollector API

Python module: `scripts/lib/metrics_collector.py`

Performance metrics tracking with thread-safe concurrent access.

### MetricType Constants

```python
from lib.metrics_collector import MetricType

MetricType.CACHE_HIT      # Record cache hit
MetricType.CACHE_MISS     # Record cache miss
MetricType.LATENCY        # Record request latency
MetricType.MEMORY         # Record memory usage
MetricType.THROUGHPUT     # Record throughput
```

### MetricsCollector Class

**Initialization:**

```python
from lib.metrics_collector import MetricsCollector

metrics = MetricsCollector(
    enable_memory_tracking=True,      # Track memory usage
    enable_latency_tracking=True      # Track latency
)
```

**Methods:**

**`record_cache_hit() -> None`**

Record a cache hit.

```python
if cache_match_found:
    metrics.record_cache_hit()
```

**`record_cache_miss() -> None`**

Record a cache miss.

```python
if cache_match_not_found:
    metrics.record_cache_miss()
```

**`get_cache_stats() -> Dict[str, Any]`**

Get current cache hit/miss statistics.

```python
stats = metrics.get_cache_stats()
print(f"Hit rate: {stats['hit_rate']:.2%}")
```

Returns:

```python
{
    'hits': 256,
    'misses': 44,
    'hit_rate': 0.85  # 0.0 to 1.0
}
```

**`record_latency(latency_ms: float) -> None`**

Record request latency in milliseconds.

```python
start = time.time()
# ... request processing ...
elapsed = (time.time() - start) * 1000
metrics.record_latency(elapsed)
```

**`get_latency_stats() -> Dict[str, Any]`**

Get latency statistics including percentiles.

```python
stats = metrics.get_latency_stats()
print(f"P99 latency: {stats['p99']:.1f}ms")
```

Returns:

```python
{
    'latencies': [125.3, 145.2, ...],  # All samples
    'p50': 125.3,    # Median
    'p95': 450.2,    # 95th percentile
    'p99': 892.5     # 99th percentile
}
```

**`record_memory_usage() -> None`**

Record current memory usage via psutil.

```python
metrics.record_memory_usage()
```

**`get_memory_stats() -> Dict[str, Any]`**

Get memory usage statistics.

```python
stats = metrics.get_memory_stats()
print(f"Current: {stats['current_mb']:.1f}MB")
print(f"Peak: {stats['peak_mb']:.1f}MB")
```

Returns:

```python
{
    'current_mb': 4850.2,
    'peak_mb': 5120.1,
    'initial_mb': 3200.0,
    'growth_mb': 1650.2
}
```

**`record_throughput() -> None`**

Record a request for throughput calculation.

```python
metrics.record_throughput()
```

**`get_throughput_stats() -> Dict[str, Any]`**

Get throughput statistics.

```python
stats = metrics.get_throughput_stats()
print(f"Requests/sec: {stats['requests_per_second']:.1f}")
```

Returns:

```python
{
    'requests_per_second': 2.5,
    'total_requests': 9000,
    'window_seconds': 300
}
```

**`export_metrics_json() -> Dict[str, Any]`**

Export all metrics as JSON dictionary.

```python
metrics_json = metrics.export_metrics_json()
# Suitable for /v1/metrics endpoint
```

**`export_metrics_prometheus() -> str`**

Export metrics in Prometheus text format.

```python
prometheus_text = metrics.export_metrics_prometheus()
# Return from /v1/metrics?format=prometheus
```

## ConfigValidator API

Python module: `scripts/lib/config_validator.py`

Configuration validation at server startup.

### Exceptions

**`ValidationError`**

Raised when configuration validation fails.

```python
from lib.config_validator import ValidationError

try:
    validator.validate_env_var('PORT', required=True, var_type='int')
except ValidationError as e:
    logger.error(f"Config validation failed: {e}")
    sys.exit(1)
```

**`DependencyError`**

Raised when a required dependency is missing or too old.

```python
from lib.config_validator import DependencyError

try:
    validator.validate_dependency('torch', min_version='2.0')
except DependencyError as e:
    logger.error(f"Missing dependency: {e}")
    sys.exit(1)
```

### ConfigValidator Class

**Initialization:**

```python
from lib.config_validator import ConfigValidator

validator = ConfigValidator()
```

**Methods:**

**`validate_port(port: Any) -> Dict[str, Any]`**

Validate port number.

```python
result = validator.validate_port(8080)
# Returns: {'valid': True, 'port': 8080}

result = validator.validate_port("80")
# Returns: {'valid': True, 'port': 80, 'warning': 'Port 80 is privileged...'}
```

Raises `ValidationError` if port is invalid.

**`validate_env_var(var_name: str, required: bool = False, var_type: str = 'str', min_value: Optional[int] = None, max_value: Optional[int] = None) -> Dict[str, Any]`**

Validate environment variable.

```python
# Validate required integer variable
result = validator.validate_env_var(
    'MAX_REQUESTS',
    required=True,
    var_type='int',
    min_value=1,
    max_value=10000
)

# Validate optional string variable
result = validator.validate_env_var(
    'MODEL_PATH',
    required=False,
    var_type='str'
)
```

Returns:

```python
{
    'valid': True,
    'value': 8080,  # Converted to specified type
    'var_name': 'PORT'
}
```

**`validate_model_path(model_path: str) -> Dict[str, Any]`**

Validate model path existence and permissions.

```python
result = validator.validate_model_path('/path/to/model')
# Returns: {'valid': True, 'path': '/path/to/model', 'exists': True, ...}
```

**`validate_dependency(module_name: str, min_version: Optional[str] = None) -> Dict[str, Any]`**

Validate dependency is installed and meets version requirement.

```python
# Check if mlx is installed
result = validator.validate_dependency('mlx')

# Check if torch is version 2.0 or higher
result = validator.validate_dependency('torch', min_version='2.0')
```

Raises `DependencyError` if dependency is missing or too old.

**`validate_all_config() -> Dict[str, Any]`**

Run complete configuration validation.

```python
result = validator.validate_all_config()
if not result['valid']:
    for error in result['errors']:
        logger.error(f"Config error: {error}")
    sys.exit(1)
```

Returns:

```python
{
    'valid': True,  # All checks passed
    'warnings': [...],  # Non-fatal issues
    'errors': [],  # Critical issues
    'checks_passed': 15,
    'checks_failed': 0
}
```

## Integration Examples

### Enable Production Hardening in MLX Server

```python
from lib.error_handler import ErrorHandler
from lib.metrics_collector import MetricsCollector
from lib.config_validator import ConfigValidator

# Initialize all three systems
error_handler = ErrorHandler(enable_graceful_degradation=True)
metrics = MetricsCollector(enable_memory_tracking=True)
validator = ConfigValidator()

# Validate config at startup
config_result = validator.validate_all_config()
if not config_result['valid']:
    sys.exit(1)

# Use in request handler
@app.post("/v1/completions")
async def handle_completion(request):
    start = time.time()

    try:
        # ... process request ...
        metrics.record_cache_hit()
        return response
    except CacheError as e:
        result = error_handler.handle_cache_error(e)
        if result['cache_enabled']:
            # Retry with cache
            pass
        else:
            # Use fallback (non-cached)
            pass
    finally:
        elapsed = (time.time() - start) * 1000
        metrics.record_latency(elapsed)
        metrics.record_throughput()
        metrics.record_memory_usage()
```

### Monitor Server Health

```bash
#!/bin/bash
# Monitor metrics every 10 seconds
while true; do
    metrics=$(curl -s http://localhost:8080/v1/metrics)

    cache_rate=$(echo "$metrics" | jq '.cache.hit_rate * 100')
    p99_latency=$(echo "$metrics" | jq '.latency.p99_ms')
    memory_mb=$(echo "$metrics" | jq '.memory.current_mb')

    echo "Cache: $cache_rate% | P99: ${p99_latency}ms | Memory: ${memory_mb}MB"
    sleep 10
done
```

### Configure and Run Stress Test

```bash
# Run 100-request stress test
python3 tests/integration/test_production_hardening.py TestStressAndRecovery

# Monitor metrics during test
curl http://localhost:8080/v1/metrics | jq .
```

## Security Notes

**ErrorHandler Security:**

- All error messages are sanitized to prevent path disclosure (VUL-003)
- File paths are redacted from logs and error responses
- Network errors don't leak internal server details

**ConfigValidator Security:**

- Path traversal protection in model path validation
- File size limits for file-based configuration
- Privilege level checking for port numbers < 1024

**MetricsCollector Security:**

- No sensitive data in metric exports
- Metrics are purely performance-related
- Safe for exposure via public APIs

See `docs/development/security-fixes-cache-warmup.md` for complete security audit.
