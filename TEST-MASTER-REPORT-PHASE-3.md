# Test Master Report: Phase 3 - Production Hardening

**Status**: TDD RED PHASE - All tests FAILING (as expected)

**Date**: 2025-11-17

**Objective**: Write comprehensive FAILING tests for Phase 3: Production Hardening (Issue #8)

## Test Files Created

### Unit Tests (3 files, 88 tests)

#### 1. `/tests/unit/test_error_handler.py` (22 tests)

Tests for the `ErrorHandler` class that provides production-grade error handling.

**Test Categories**:
- **TestErrorHandlerBasics** (5 tests)
  - Initialization
  - Cache error handling → graceful degradation
  - OOM error handling → cache clearing
  - Network error handling → exponential backoff retry
  - Error message sanitization (VUL-003 security fix)

- **TestErrorHandlerCacheRecovery** (3 tests)
  - Detect cache corruption (truncated JSON, invalid data)
  - Recover from corruption (clear entry, preserve valid entries)
  - Selective recovery (only clear corrupted, not all cache)

- **TestErrorHandlerOOMDetection** (3 tests)
  - Detect OOM condition before crash (>90% memory usage)
  - Safe memory usage not flagged as OOM
  - Preventive cache clearing when threshold exceeded

- **TestErrorHandlerNetworkRetry** (4 tests)
  - Retry with exponential backoff
  - Success on first try (no retry)
  - Retry on failure (up to max_retries)
  - Exponential delay increase (100ms, 200ms, 400ms)

- **TestErrorHandlerGracefulDegradation** (3 tests)
  - Disable cache after persistent errors (5+ errors)
  - Re-enable cache after recovery (10+ successful ops)
  - Degradation can be disabled via config

- **TestErrorHandlerEdgeCases** (4 tests)
  - Empty error message
  - Null error (ValueError expected)
  - Zero backoff retry
  - OOM detection when psutil unavailable

**Expected Behavior**:
- All tests FAIL until `scripts/lib/error_handler.py` is implemented
- Import error: `NotImplementedError: ErrorHandler not yet implemented`

---

#### 2. `/tests/unit/test_metrics_collector.py` (30 tests)

Tests for the `MetricsCollector` class that tracks performance metrics.

**Test Categories**:
- **TestMetricsCollectorBasics** (5 tests)
  - Initialization
  - Record cache hits/misses
  - Calculate cache hit rate (70% from 7 hits, 3 misses)
  - Handle zero requests (0% hit rate)

- **TestMetricsCollectorLatency** (4 tests)
  - Record latency values
  - Calculate P50/P95/P99 percentiles
  - Handle few samples (< 10)
  - Latency tracking can be disabled

- **TestMetricsCollectorMemory** (4 tests)
  - Record current memory usage
  - Track peak memory usage
  - Calculate memory growth percentage
  - Memory tracking can be disabled

- **TestMetricsCollectorThroughput** (3 tests)
  - Record requests
  - Calculate requests per second
  - Windowed throughput (sliding window)

- **TestMetricsCollectorExport** (4 tests)
  - Export metrics as JSON
  - Export metrics as Prometheus format
  - Include timestamp in exports
  - Include uptime in exports

- **TestMetricsCollectorReset** (3 tests)
  - Reset cache stats
  - Reset latency stats
  - Reset all metrics at once

- **TestMetricsCollectorThreadSafety** (2 tests)
  - Concurrent cache hit recording (10 threads × 100 hits = 1000)
  - Concurrent latency recording (5 threads × 50 samples = 250)

- **TestMetricsCollectorEdgeCases** (5 tests)
  - Reject negative latency (ValueError)
  - Accept zero latency
  - Handle extremely high latency (1 hour)
  - Export with no data (zero values)
  - Handle psutil unavailable

**Expected Behavior**:
- All tests FAIL until `scripts/lib/metrics_collector.py` is implemented
- Import error: `NotImplementedError: MetricsCollector not yet implemented`

---

#### 3. `/tests/unit/test_config_validator.py` (36 tests)

Tests for the `ConfigValidator` class that validates configuration.

**Test Categories**:
- **TestConfigValidatorBasics** (3 tests)
  - Initialization
  - Valid port numbers (8080, 8000, 3000)
  - Invalid port numbers (0, 65536, -1) → ValidationError
  - Privileged ports (< 1024) → warning

- **TestConfigValidatorEnvironmentVariables** (8 tests)
  - Required env var present → valid
  - Required env var missing → ValidationError
  - Optional env var missing → valid (with default)
  - Integer type validation (PORT=8080)
  - Invalid integer → ValidationError
  - Range validation (min/max)
  - Boolean type validation (1/true/yes → True, 0/false/no → False)

- **TestConfigValidatorModelPath** (6 tests)
  - Path exists and is directory → valid
  - Path doesn't exist → ValidationError
  - File instead of directory → ValidationError
  - Unreadable path → ValidationError
  - Contains required files (config.json, tokenizer.json, model.safetensors)
  - Missing required files → ValidationError

- **TestConfigValidatorPortConflicts** (4 tests)
  - Available port detected
  - In-use port detected
  - Timeout handled gracefully (fail open)
  - Find available port in range

- **TestConfigValidatorDependencies** (5 tests)
  - Installed dependency detected
  - Missing dependency detected
  - Check all dependencies (psutil, mlx, mlx_lm, safetensors)
  - Version requirement (min_version check)
  - Old version rejected → DependencyError

- **TestConfigValidatorComplete** (2 tests)
  - Valid complete config passes all checks
  - Collect all validation errors (not just first)

- **TestConfigValidatorEdgeCases** (8 tests)
  - Boundary values (port 1024, 65535)
  - Empty string env var → missing
  - Whitespace-only env var → missing
  - Symlink to model directory → valid
  - Dependency with no `__version__` → 'unknown'
  - String port number converted to int
  - Invalid string port → ValidationError

**Expected Behavior**:
- All tests FAIL until `scripts/lib/config_validator.py` is implemented
- Import error: `NotImplementedError: ConfigValidator not yet implemented`

---

### Integration Tests (3 files, 55 tests)

#### 4. `/tests/integration/test_cache_corruption_recovery.py` (21 tests)

Tests cache corruption recovery in realistic scenarios.

**Test Categories**:
- **TestCacheCorruptionDetection** (4 tests)
  - Detect truncated JSON
  - Detect invalid JSON syntax
  - Detect binary corruption (null bytes, invalid UTF-8)
  - Valid data not flagged as corrupted

- **TestCacheCorruptionRecovery** (4 tests)
  - Recover from single corrupted entry
  - Recover from multiple corrupted entries
  - Total corruption → clear all
  - Recovery updates metrics

- **TestCacheCorruptionGracefulDegradation** (3 tests)
  - Persistent corruption disables cache
  - Degraded mode continues serving requests
  - Recovery from degraded mode (re-enable cache)

- **TestCacheCorruptionWithServer** (4 tests)
  - Server logs corruption warnings (not errors)
  - Server returns valid response despite corruption
  - Recovery doesn't block requests (non-blocking)

- **TestCacheCorruptionSecurity** (3 tests)
  - Sanitize error messages (no file paths - VUL-003)
  - Logs don't leak cache data (sensitive prompts)
  - Validate replacement data (prevent XSS)

- **TestCacheCorruptionEdgeCases** (3 tests)
  - Empty cache detection
  - Recover from nonexistent entry
  - Concurrent recovery operations (thread-safe)
  - Corruption during active request

**Expected Behavior**:
- All tests FAIL until `scripts/lib/error_handler.py` is implemented
- Import error: `NotImplementedError: ErrorHandler not yet implemented`

---

#### 5. `/tests/integration/test_mlx_server_stress.py` (14 tests)

Tests server stability under stress conditions.

**Test Categories**:
- **TestSequentialStress** (3 tests)
  - 100 sequential requests complete (>90% success rate)
  - Latency remains stable (P95 < 2x P50)
  - Memory growth < 20% over 100 requests

- **TestConcurrentStress** (4 tests)
  - 10 concurrent requests all complete
  - No race conditions (20 concurrent requests)
  - Cache thread-safety (30 requests, same prompt)
  - Memory stable under concurrent load

- **TestLongRunningSession** (2 tests - skipped by default)
  - 2-hour session stability (~240 requests, <5% failure rate)
  - 4-hour session no memory leak (< 20% growth)

- **TestMemoryLeakDetection** (3 tests)
  - Detect gradual memory growth (1MB per request)
  - Memory leak triggers cleanup (OOM prevention)
  - Stable memory doesn't trigger false positives

- **TestStressTestEdgeCases** (2 tests)
  - Handle intermittent failures (5% failure rate)
  - Varying response sizes (100KB to 1MB)

**Expected Behavior**:
- All tests FAIL until `scripts/lib/metrics_collector.py` and `scripts/lib/error_handler.py` are implemented
- Import error: `NotImplementedError: MetricsCollector not yet implemented`

---

#### 6. `/tests/integration/test_metrics_endpoint.py` (20 tests)

Tests the `/v1/metrics` endpoint.

**Test Categories**:
- **TestMetricsEndpointBasics** (6 tests)
  - Returns valid JSON (200 OK, application/json)
  - Includes all categories (cache, latency, memory, throughput)
  - Cache stats (hits, misses, hit rate)
  - Latency percentiles (P50, P95, P99)
  - Memory stats (current_mb, peak_mb)
  - Throughput stats (total_requests, requests_per_second)

- **TestMetricsEndpointPrometheus** (3 tests)
  - Prometheus format support (`?format=prometheus`)
  - Includes HELP text (`# HELP cache_hit_total ...`)
  - Includes TYPE annotations (`# TYPE cache_hit_total counter`)

- **TestMetricsEndpointRealTime** (3 tests)
  - Metrics update in real-time (5 new requests reflected)
  - Timestamp updates on each request
  - Uptime increases over time

- **TestMetricsEndpointErrorHandling** (3 tests)
  - Invalid format → 400 Bad Request
  - Works when psutil unavailable (degraded metrics)
  - Empty metrics (zero values, no errors)

- **TestMetricsEndpointSecurity** (3 tests)
  - No sensitive data leaks (no file paths, API keys)
  - CORS headers set
  - Read-only endpoint (POST/PUT/DELETE → 405)

- **TestMetricsEndpointFiltering** (2 tests)
  - Filter by category (`?category=cache`)
  - Filter multiple categories (`?category=cache,latency`)

**Expected Behavior**:
- All tests FAIL until `scripts/lib/metrics_collector.py` is implemented
- Import error: `NotImplementedError: MetricsCollector not yet implemented`

---

### Regression Tests (1 file, 8 tests)

#### 7. `/tests/regression/test_error_recovery_regression.js` (8 tests)

JavaScript regression tests for error recovery.

**Test Categories**:
- Cache corruption doesn't crash server
- OOM condition doesn't crash server
- Network timeouts retry with exponential backoff
- Graceful degradation continues serving requests
- Recovery from degraded mode
- Concurrent errors don't cause race conditions
- Error logs are sanitized (VUL-003)
- Server starts with corrupted cache

**Expected Behavior**:
- All tests FAIL until `scripts/lib/error_handler.py` is implemented
- Error: `ErrorHandler not yet implemented - ...`

---

## Test Summary

| Category | File Count | Test Count | Status |
|----------|-----------|-----------|--------|
| **Unit Tests** | 3 | 88 | FAIL (RED) |
| **Integration Tests** | 3 | 55 | FAIL (RED) |
| **Regression Tests** | 1 | 8 | FAIL (RED) |
| **TOTAL** | **7** | **151** | **FAIL (RED)** |

---

## Test Execution Results

### Unit Tests

```bash
# test_error_handler.py: 22 tests
python3 tests/unit/test_error_handler.py
# Result: 22 errors - NotImplementedError: ErrorHandler not yet implemented

# test_metrics_collector.py: 30 tests
python3 tests/unit/test_metrics_collector.py
# Result: 30 errors - NotImplementedError: MetricsCollector not yet implemented

# test_config_validator.py: 36 tests
python3 tests/unit/test_config_validator.py
# Result: 36 errors - NotImplementedError: ConfigValidator not yet implemented
```

### Integration Tests

```bash
# test_cache_corruption_recovery.py: 21 tests
python3 tests/integration/test_cache_corruption_recovery.py
# Result: 21 errors - NotImplementedError: ErrorHandler not yet implemented

# test_mlx_server_stress.py: 14 tests (2 skipped)
python3 tests/integration/test_mlx_server_stress.py
# Result: 12 errors, 2 skipped - NotImplementedError: MetricsCollector not yet implemented

# test_metrics_endpoint.py: 20 tests
python3 tests/integration/test_metrics_endpoint.py
# Result: 20 errors - NotImplementedError: MetricsCollector not yet implemented
```

### Regression Tests

```bash
# test_error_recovery_regression.js: 8 tests
node tests/regression/test_error_recovery_regression.js
# Result: 8 failed - ErrorHandler not yet implemented
```

---

## Implementation Checklist

### Phase 3.1: Error Handling (Issue #8.1)

**Module**: `scripts/lib/error_handler.py`

**Classes**:
- [ ] `ErrorHandler` - Main error handling class
- [ ] `CacheError` - Exception for cache errors
- [ ] `OOMError` - Exception for OOM conditions
- [ ] `NetworkError` - Exception for network errors

**Methods**:
- [ ] `handle_cache_error()` - Graceful degradation on cache errors
- [ ] `handle_oom_error()` - Cache clearing on OOM
- [ ] `handle_network_error()` - Retry with exponential backoff
- [ ] `sanitize_error_message()` - Security VUL-003 fix
- [ ] `detect_cache_corruption()` - Detect corrupted cache data
- [ ] `recover_from_cache_corruption()` - Clear corrupted entries
- [ ] `detect_oom_condition()` - Detect high memory usage (>90%)
- [ ] `prevent_oom()` - Preventive cache clearing
- [ ] `retry_with_backoff()` - Exponential backoff retry logic
- [ ] `record_cache_error()` - Track errors for degradation
- [ ] `record_cache_success()` - Track successes for recovery
- [ ] `check_degradation_status()` - Check if degraded mode

**Tests**: 22 unit + 21 integration + 8 regression = **51 tests**

---

### Phase 3.2: Performance Metrics (Issue #8.2)

**Module**: `scripts/lib/metrics_collector.py`

**Classes**:
- [ ] `MetricsCollector` - Main metrics collection class
- [ ] `MetricType` - Enum for metric types

**Methods**:
- [ ] `record_cache_hit()` - Increment cache hit counter
- [ ] `record_cache_miss()` - Increment cache miss counter
- [ ] `get_cache_stats()` - Get cache hit/miss/rate
- [ ] `record_latency()` - Record request latency
- [ ] `get_latency_stats()` - Get P50/P95/P99 percentiles
- [ ] `record_memory_usage()` - Record current memory (psutil)
- [ ] `get_memory_stats()` - Get current/peak/growth
- [ ] `record_request()` - Increment request counter
- [ ] `get_throughput_stats()` - Get requests/second
- [ ] `export_metrics_json()` - Export as JSON
- [ ] `export_metrics_prometheus()` - Export Prometheus format
- [ ] `reset_cache_stats()` - Reset cache metrics
- [ ] `reset_latency_stats()` - Reset latency metrics
- [ ] `reset_all_metrics()` - Reset all metrics

**Server Integration**:
- [ ] Add `/v1/metrics` endpoint to `scripts/mlx-server.py`
- [ ] Support `?format=json` (default)
- [ ] Support `?format=prometheus`
- [ ] Support `?category=cache,latency,...` filtering

**Tests**: 30 unit + 20 integration = **50 tests**

---

### Phase 3.3: Configuration Validation (Issue #8.3)

**Module**: `scripts/lib/config_validator.py`

**Classes**:
- [ ] `ConfigValidator` - Main validation class
- [ ] `ValidationError` - Exception for validation errors
- [ ] `DependencyError` - Exception for dependency errors

**Methods**:
- [ ] `validate_port()` - Validate port number (1024-65535)
- [ ] `validate_env_var()` - Validate environment variable
- [ ] `validate_model_path()` - Validate model directory
- [ ] `check_port_available()` - Check if port is free
- [ ] `find_available_port()` - Find free port in range
- [ ] `check_dependency()` - Check if dependency installed
- [ ] `check_all_dependencies()` - Check all required deps
- [ ] `validate_complete_config()` - Validate entire config

**Dependencies to Check**:
- [ ] `psutil` - For memory tracking
- [ ] `mlx` - For MLX models
- [ ] `mlx_lm` - For MLX language models
- [ ] `safetensors` - For model weights

**Tests**: 36 unit = **36 tests**

---

### Phase 3.4: Stability Testing (Issue #8.4)

**Test Files**:
- [x] `tests/integration/test_mlx_server_stress.py` (14 tests written)

**Stress Tests**:
- [ ] 100 sequential requests (>90% success rate)
- [ ] Latency stability (P95 < 2x P50)
- [ ] Memory growth < 20% over 100 requests
- [ ] 10 concurrent requests (all complete)
- [ ] Cache thread-safety (30 concurrent requests)
- [ ] Memory leak detection (gradual growth detection)
- [ ] OOM prevention (cleanup at 90%+ memory)

**Long-Running Tests** (manual):
- [ ] 2-hour session stability (~240 requests, <5% failure)
- [ ] 4-hour session memory leak check (< 20% growth)

**Tests**: 14 integration = **14 tests**

---

## Next Steps

1. **Implement ErrorHandler** (`scripts/lib/error_handler.py`)
   - Start with basic error handling
   - Add cache corruption detection
   - Add OOM detection
   - Add retry logic
   - Add graceful degradation
   - Run tests: `python3 tests/unit/test_error_handler.py`

2. **Implement MetricsCollector** (`scripts/lib/metrics_collector.py`)
   - Start with cache metrics (hit/miss)
   - Add latency tracking (P50/P95/P99)
   - Add memory tracking (psutil)
   - Add throughput tracking
   - Add export methods (JSON, Prometheus)
   - Run tests: `python3 tests/unit/test_metrics_collector.py`

3. **Implement ConfigValidator** (`scripts/lib/config_validator.py`)
   - Start with port validation
   - Add env var validation
   - Add model path validation
   - Add dependency checks
   - Run tests: `python3 tests/unit/test_config_validator.py`

4. **Integrate into Server** (`scripts/mlx-server.py`)
   - Add ErrorHandler to request handling
   - Add MetricsCollector to server lifecycle
   - Add ConfigValidator to startup
   - Add `/v1/metrics` endpoint
   - Run integration tests

5. **Run Stability Tests**
   - Sequential stress test (100 requests)
   - Concurrent stress test (10 simultaneous)
   - Memory leak detection
   - Long-running tests (manual, 2-4 hours)

6. **Verify TDD GREEN Phase**
   - All 151 tests should PASS
   - Document results in `TEST-MASTER-REPORT-PHASE-3-GREEN.md`

---

## Test Coverage Goals

| Module | Target Coverage | Unit Tests | Integration Tests |
|--------|----------------|-----------|------------------|
| `error_handler.py` | 80%+ | 22 | 21 |
| `metrics_collector.py` | 80%+ | 30 | 20 |
| `config_validator.py` | 80%+ | 36 | 0 |
| **Total** | **80%+** | **88** | **41** |

---

## Security Considerations

All tests include security validation:

- **VUL-003**: Error messages sanitized (no file paths)
  - Tested in: `test_error_handler.py`, `test_cache_corruption_recovery.py`
  - Example: `/Users/test/.anyclaude/cache/data.json` → `cache error`

- **Thread Safety**: Concurrent operations tested
  - Tested in: `test_metrics_collector.py`, `test_mlx_server_stress.py`
  - Example: 10 threads × 100 operations = 1000 (no race conditions)

- **Input Validation**: All inputs validated
  - Tested in: `test_config_validator.py`
  - Example: Port range, env var types, model paths

- **Graceful Degradation**: No data loss on errors
  - Tested in: `test_error_handler.py`, `test_cache_corruption_recovery.py`
  - Example: Cache corruption → degraded mode, continue serving

---

## Performance Targets

Based on implementation plan (Issue #8):

| Metric | Target | Test |
|--------|--------|------|
| Sequential requests | 100 complete, >90% success | `test_mlx_server_stress.py::test_100_sequential_requests_complete` |
| Latency stability | P95 < 2x P50 | `test_mlx_server_stress.py::test_sequential_stress_latency_stability` |
| Memory growth | < 20% over 100 requests | `test_mlx_server_stress.py::test_sequential_stress_no_memory_leak` |
| Concurrent requests | 10 simultaneous, all complete | `test_mlx_server_stress.py::test_10_concurrent_requests_all_complete` |
| Cache hit rate | Tracked and exported | `test_metrics_endpoint.py::test_metrics_endpoint_cache_stats` |
| Latency percentiles | P50/P95/P99 tracked | `test_metrics_endpoint.py::test_metrics_endpoint_latency_percentiles` |
| Memory usage | Current/peak tracked | `test_metrics_endpoint.py::test_metrics_endpoint_memory_stats` |
| Throughput | Requests/second tracked | `test_metrics_endpoint.py::test_metrics_endpoint_throughput_stats` |

---

## Conclusion

**TDD RED Phase Complete**: 151 tests written, all FAILING as expected.

**Next Step**: Implement the modules to turn tests GREEN.

**Test Files**:
1. `/tests/unit/test_error_handler.py` (22 tests)
2. `/tests/unit/test_metrics_collector.py` (30 tests)
3. `/tests/unit/test_config_validator.py` (36 tests)
4. `/tests/integration/test_cache_corruption_recovery.py` (21 tests)
5. `/tests/integration/test_mlx_server_stress.py` (14 tests)
6. `/tests/integration/test_metrics_endpoint.py` (20 tests)
7. `/tests/regression/test_error_recovery_regression.js` (8 tests)

**Total**: 7 files, 151 tests, all FAILING (RED).

The tests are comprehensive, cover edge cases, test security, and validate the complete implementation plan for Phase 3: Production Hardening.
