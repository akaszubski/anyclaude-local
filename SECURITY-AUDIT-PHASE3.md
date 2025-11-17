# SECURITY AUDIT: Phase 3 Production Hardening

**Audit Date**: 2025-11-17
**Auditor**: Claude Security Analyst (claude-haiku-4-5)
**Scope**: Phase 3 Production Hardening Implementation
**Overall Status**: FAIL (Multiple vulnerabilities identified)

## Executive Summary

Phase 3 implements production hardening with error handling, metrics collection, and configuration validation. While the code demonstrates security awareness (path sanitization in error messages, thread safety, input validation), **critical vulnerabilities exist** that would prevent production deployment:

1. **CRITICAL**: Unauthenticated metrics endpoint (`/v1/metrics`) exposes operational details
2. **HIGH**: Unbounded memory growth in metrics (latencies list grows indefinitely)
3. **HIGH**: Information disclosure via model path logging
4. **MEDIUM**: Metrics endpoint returns all raw latencies (privacy concern)
5. **MEDIUM**: Model path revealed in error messages under certain conditions

---

## VULNERABILITIES FOUND

### 1. CRITICAL - Unauthenticated Metrics Endpoint (OWASP A01:2021 - Broken Access Control)

**File**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/mlx-server.py` (Line 1351-1357)

**Vulnerability**: `/v1/metrics` endpoint is publicly accessible with no authentication required.

**Code**:

```python
@self.app.get("/v1/metrics")
async def metrics(format: str = 'json'):
    """Performance metrics endpoint (Phase 3)"""
    if format == 'prometheus':
        return self.metrics.export_metrics_prometheus()
    else:
        return self.metrics.export_metrics_json()
```

**Attack Vector**: Any unauthenticated client can:

- Obtain cache hit/miss statistics
- Extract latency data for all requests
- Monitor memory usage patterns
- Calculate request throughput and traffic patterns
- Determine model availability and response times
- Infer operational capacity and load patterns

**Exposed Data** (`/v1/metrics?format=json`):

```json
{
  "timestamp": 1700177000.123,
  "uptime_seconds": 3600,
  "cache": {
    "cache_hits": 150,
    "cache_misses": 50,
    "hit_rate": 0.75
  },
  "latency": {
    "latencies": [12.5, 15.3, 14.1, ...],  # ALL request latencies exposed
    "p50": 14.1,
    "p95": 19.2,
    "p99": 22.5
  },
  "memory": {
    "current_mb": 512.3,
    "peak_mb": 602.1,
    "growth_percent": 18.5
  },
  "throughput": {
    "total_requests": 200,
    "requests_per_second": 0.055
  }
}
```

**Severity**: **CRITICAL**

**Recommendation**:

- Add API key authentication to `/v1/metrics` endpoint
- Implement bearer token validation before returning metrics
- Consider restricting metrics to localhost-only access
- Use FastAPI security dependencies:

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials

security = HTTPBearer()

async def verify_metrics_auth(credentials: HTTPAuthCredentials = Depends(security)):
    if credentials.credentials != os.environ.get("METRICS_API_KEY"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return credentials.credentials

@self.app.get("/v1/metrics")
async def metrics(
    format: str = 'json',
    auth: str = Depends(verify_metrics_auth)
):
    # ... endpoint code
```

---

### 2. HIGH - Unbounded Memory Growth in Metrics (Resource Exhaustion)

**File**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/metrics_collector.py` (Lines 59, 120, 148)

**Vulnerability**: Both `self.latencies` and `self.request_timestamps` lists grow indefinitely without bounds.

**Code**:

```python
# Line 59: Initialization
self.latencies: List[float] = []

# Line 120: Recording latency (unbounded append)
with self.lock:
    self.latencies.append(latency_ms)

# Line 148: Exported in metrics (full list)
return {
    'latencies': self.latencies.copy(),  # Returns entire list
    'p50': p50,
    # ...
}
```

**Attack Vector**: Memory exhaustion via continuous metrics polling:

- Each request appends to unbounded lists
- Long-running server (days/weeks) accumulates millions of entries
- Each `/v1/metrics` call copies entire lists
- Potential OOM crash after 1-2 weeks of operation

**Example**: 100 requests/second × 86400 seconds/day × 7 days = **60.48 million entries**

- At 8 bytes per float: ~480 MB in `latencies` list alone
- Memory grows continuously until server crashes

**Severity**: **HIGH**

**Recommendation**:

- Implement circular buffer/ring buffer (fixed max size)
- Add max_size parameter to MetricsCollector:

```python
def __init__(self, enable_latency_tracking=True, max_latencies=10000):
    self.latencies: List[float] = []
    self.max_latencies = max_latencies

def record_latency(self, latency_ms: float):
    if latency_ms < 0:
        raise ValueError("Latency cannot be negative")
    if not self.enable_latency_tracking:
        return

    with self.lock:
        self.latencies.append(latency_ms)
        # Keep only last N latencies
        if len(self.latencies) > self.max_latencies:
            self.latencies.pop(0)  # Or use deque for O(1) operations

# Same for request_timestamps:
def record_request(self):
    with self.lock:
        self.total_requests += 1
        self.request_timestamps.append(time.time())
        if len(self.request_timestamps) > self.max_latencies:
            self.request_timestamps.pop(0)
```

- Don't expose raw latencies list in metrics export
- Return only aggregated statistics (p50, p95, p99, min, max, avg)

---

### 3. HIGH - Information Disclosure via Model Path Logging

**File**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/mlx-server.py` (Lines 1366-1369)

**Vulnerability**: Full model path is logged and visible in server output/logs.

**Code**:

```python
logger.info(f"Loading MLX model from: {self.model_path}")
# Example output: "Loading MLX model from: /Users/andrew/.cache/huggingface/models/Qwen3-Coder-30B-MLX-4bit"
```

**Attack Vector**: Information disclosure via:

- Server logs accessible via CloudWatch, ELK, Splunk, etc.
- Container logs accessible in Kubernetes/Docker deployments
- Monitoring dashboards that display logs
- Error messages if model loading fails

**Exposed Information**:

- Full filesystem paths reveal user home directory structure
- Model names/versions reveal capabilities to attackers
- Cache location reveals storage strategy
- Can be combined with other vulnerabilities for targeted attacks

**Severity**: **HIGH**

**Recommendation**:

- Use sanitized log messages (filename only):

```python
try:
    logger.info(f"Loading MLX model: {Path(self.model_path).name}")
    # Use error handler's sanitization:
    self.model, self.tokenizer = mlx_lm.load(self.model_path)
    logger.info(f"Model loaded successfully")
except Exception as e:
    sanitized_error = self.error_handler.sanitize_error_message(str(e))
    logger.error(f"Failed to load model: {sanitized_error}")
```

---

### 4. MEDIUM - Full Latencies List Exposed in Metrics (Privacy/Resource Concern)

**File**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/metrics_collector.py` (Lines 141-150)

**Vulnerability**: Raw latencies list returned in metrics export allows analysis of individual request patterns.

**Code**:

```python
return {
    'latencies': self.latencies.copy(),  # Full list exposed
    'p50': p50,
    'p95': p95,
    'p99': p99
}
```

**Impact**:

- **Pattern Analysis**: Attackers can identify request timing patterns
- **User Fingerprinting**: Latencies correlate with specific user requests
- **Data Inference**: Timing patterns reveal model behavior, cached vs. non-cached requests
- **Load Inference**: Request timing reveals peak traffic times
- **Bandwidth**: Exporting millions of latency entries consumes bandwidth

**Severity**: **MEDIUM**

**Recommendation**:

- Remove raw latencies from export
- Export only aggregated statistics:

```python
def export_metrics_json(self) -> Dict[str, Any]:
    cache_stats = self.get_cache_stats()
    latency_stats = self.get_latency_stats()
    memory_stats = self.get_memory_stats()
    throughput_stats = self.get_throughput_stats()

    uptime_seconds = time.time() - self.start_time

    return {
        'timestamp': time.time(),
        'uptime_seconds': uptime_seconds,
        'cache': cache_stats,
        'latency': {
            'p50': latency_stats.get('p50', 0),
            'p95': latency_stats.get('p95', 0),
            'p99': latency_stats.get('p99', 0),
            # Remove 'latencies' raw list
        },
        'memory': memory_stats,
        'throughput': throughput_stats
    }
```

---

### 5. MEDIUM - Model Path Revealed in Validation Errors

**File**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/config_validator.py` (Lines 159-180)

**Vulnerability**: Full model path exposed in validation error messages.

**Code**:

```python
def validate_model_path(self, model_path: str) -> Dict[str, Any]:
    # Check existence
    if not os.path.exists(model_path):
        raise ValidationError(f"Model path does not exist: {model_path}")
        # ^ Full path in exception

    if not os.path.isdir(model_path):
        raise ValidationError(f"Model path is not a directory: {model_path}")
        # ^ Full path in exception

    if not (has_config and has_tokenizer and has_weights):
        raise ValidationError(
            f"Model path missing required files (...): {model_path}"
            # ^ Full path in exception
        )
```

**Attack Vector**: Exceptions may be logged or returned to clients, revealing paths.

**Severity**: **MEDIUM**

**Recommendation**:

- Sanitize error messages:

```python
def validate_model_path(self, model_path: str) -> Dict[str, Any]:
    try:
        # Check existence
        if not os.path.exists(model_path):
            raise ValidationError("Model path does not exist")

        # Check if directory
        if not os.path.isdir(model_path):
            raise ValidationError("Model path is not a directory")

        # ... rest of validation

        if not (has_config and has_tokenizer and has_weights):
            raise ValidationError("Model is missing required files")
    except ValidationError:
        raise
```

---

## SECURITY CHECKS COMPLETED

### Path Traversal (VUL-003)

- [x] **PASS**: `get_standard_system_prompt()` properly validates paths
  - Uses `Path.resolve()` for symlink canonicalization
  - Validates against whitelist with `relative_to()` check
  - File size limits (1MB max)
  - Sanitized log messages

- [x] **PASS**: Error message sanitization
  - Regex patterns remove full paths
  - User home directory replaced with `~`
  - Proper exception handling

### Secrets in Code

- [x] **PASS**: No hardcoded API keys, tokens, or secrets found
- [x] **PASS**: `.env` properly gitignored
- [x] **PASS**: Git history clean (no secrets committed)
- [x] **PASS**: No secrets in configuration files

### Input Validation

- [x] **PASS**: Port validation
  - Numeric conversion with error handling
  - Range checking (1-65535)
  - Privileged port warnings

- [x] **PASS**: Environment variable validation
  - Type checking (int, bool, str)
  - Range validation for integers
  - Boolean parsing

- [x] **PARTIAL**: Model path validation
  - File existence checked
  - Directory verification
  - Permission checks (readable)
  - Required files validated
  - BUT: Full paths logged/exposed in errors

### Thread Safety

- [x] **PASS**: Threading locks properly used
  - `ErrorHandler`: Uses single `threading.Lock()`
  - `MetricsCollector`: Uses single `threading.Lock()`
  - All shared state protected
  - No race conditions detected

### Authentication/Authorization

- [x] **FAIL**: `/v1/metrics` endpoint has NO authentication
- [x] **FAIL**: `/health` endpoint has NO authentication
- [x] **PASS**: `/v1/chat/completions` properly integrated with FastAPI

### Resource Exhaustion

- [x] **FAIL**: Unbounded latencies list causes memory leak
- [x] **FAIL**: Unbounded request_timestamps list causes memory leak
- [x] **PARTIAL**: OOM detection exists but no prevention

### Information Disclosure

- [x] **FAIL**: Full model paths logged at startup
- [x] **FAIL**: Full latencies list exposed in metrics
- [x] **PASS**: Cache keys are hashed (not raw prompts)
- [x] **PASS**: No user data logged

---

## SUMMARY BY OWASP TOP 10

| OWASP Risk                     | Issue                          | Status   |
| ------------------------------ | ------------------------------ | -------- |
| A01: Broken Access Control     | No auth on `/v1/metrics`       | **FAIL** |
| A02: Cryptographic Failures    | N/A                            | PASS     |
| A03: Injection                 | N/A (input validation present) | PASS     |
| A04: Insecure Design           | Unbounded memory growth        | **FAIL** |
| A05: Security Misconfiguration | Model path logging             | **FAIL** |
| A06: Vulnerable Components     | Dependencies ok                | PASS     |
| A07: Authentication            | Metrics endpoint unprotected   | **FAIL** |
| A08: Integrity Issues          | Data validation present        | PASS     |
| A09: Logging Disclosure        | Paths logged                   | **FAIL** |
| A10: SSRF                      | N/A                            | PASS     |

---

## RISK ASSESSMENT

**Current Status**: **PRODUCTION DEPLOYMENT NOT RECOMMENDED**

**Critical Issues**: 2

- Unauthenticated metrics endpoint
- Unbounded memory growth

**High Issues**: 2

- Information disclosure (model paths)
- Memory resource exhaustion risk

**Medium Issues**: 1

- Latencies list exposure

**Estimated Time to Fix**: 4-6 hours

1. Add authentication to metrics endpoint (1-2 hours)
2. Implement bounded metrics collections (1-2 hours)
3. Sanitize all logging (1-2 hours)
4. Testing and validation (1 hour)

---

## RECOMMENDATIONS (Priority Order)

### P0 - CRITICAL (Must fix before deployment)

1. **Protect `/v1/metrics` endpoint with API key authentication**
   - File: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/mlx-server.py`
   - Add `Depends(verify_metrics_auth)` to endpoint
   - Use environment variable for API key

2. **Implement bounded metrics collections**
   - File: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/metrics_collector.py`
   - Add `max_latencies` parameter (default 10000)
   - Use circular buffer or deque
   - Remove raw lists from exports

### P1 - HIGH (Should fix before deployment)

3. **Sanitize all logging output**
   - File: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/mlx-server.py`
   - Use `Path(self.model_path).name` instead of full path
   - Use error handler's `sanitize_error_message()`

4. **Sanitize validation error messages**
   - File: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/config_validator.py`
   - Remove full paths from exceptions
   - Use generic error messages

### P2 - MEDIUM (Should fix)

5. **Remove raw latencies from metrics export**
   - Only export aggregated statistics (p50, p95, p99)
   - Reduces bandwidth and improves privacy

---

## FILES AFFECTED

```
/Users/andrewkaszubski/Documents/GitHub/anyclaude/
├── scripts/
│   ├── mlx-server.py               ❌ 2 issues (logging, auth)
│   └── lib/
│       ├── metrics_collector.py    ❌ 2 issues (unbounded lists, exposure)
│       ├── config_validator.py     ❌ 1 issue (path disclosure)
│       └── error_handler.py        ✅ PASS (proper sanitization)
└── .gitignore                      ✅ PASS (proper secret management)
```

---

## CONCLUSION

**Overall Security Status**: **FAIL**

Phase 3 implementation shows good security practices in:

- Path traversal prevention (VUL-001 through VUL-005)
- Thread safety (proper locking)
- Input validation
- Secrets management

However, critical vulnerabilities prevent production deployment:

1. Unauthenticated metrics endpoint exposes operational details
2. Unbounded memory growth causes resource exhaustion
3. Sensitive information logged in plaintext

**Recommendation**: Address P0 and P1 issues before any production deployment. Estimated fix time: 4-6 hours.

**Test After Fixes**:

- Verify `/v1/metrics` returns 403 without valid API key
- Monitor memory growth under load (24-hour test)
- Verify no paths appear in logs
- Test error messages for path disclosure

---

**Report Generated**: 2025-11-17
**Auditor**: Claude Security Analyst (Haiku 4.5)
