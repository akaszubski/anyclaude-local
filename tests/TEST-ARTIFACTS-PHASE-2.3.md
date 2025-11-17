# Test-Master Report: Issue #7 - Cache Warmup (Phase 2.3)

**Date**: 2025-11-17
**Agent**: test-master
**Status**: TDD Red Phase - All tests FAIL (feature not yet implemented)

---

## Executive Summary

Written comprehensive failing tests (TDD Red phase) for cache warmup feature that pre-populates KV cache with standard system prompts before server startup. Tests cover:

- **23 unit tests**: Function behavior, configuration, error handling
- **19 integration tests**: Server startup, cache hits, timeout handling, configuration
- **13 performance tests**: Latency benchmarks, throughput, cache efficiency

**Total: 55 tests** validating complete cache warmup feature

All tests FAIL initially because the warmup feature doesn't exist yet. Implementation will make these tests PASS.

---

## Test Files Created

### 1. tests/unit/test_cache_warmup.py

**23 Unit Tests** - Test individual warmup components in isolation

#### TestGetStandardSystemPrompt (6 tests)
Tests for `get_standard_system_prompt(warmup_file: Optional[str])` function:

1. `test_loads_from_file` - Loads prompt from specified file
2. `test_returns_fallback_when_file_missing` - Returns default when file doesn't exist
3. `test_returns_default_when_no_file_specified` - Returns default when no file given
4. `test_handles_empty_file` - Handles empty files gracefully
5. `test_handles_large_file` - Handles 100KB+ files
6. `test_handles_unicode_content` - Handles unicode characters correctly

#### TestWarmupKVCacheFunction (10 tests)
Tests for `warmup_kv_cache(model, tokenizer, cache_manager, timeout_sec, enabled)` async function:

1. `test_warmup_returns_bool` - Returns boolean (True/False)
2. `test_warmup_returns_true_on_success` - Returns True on successful warmup
3. `test_warmup_returns_false_on_failure` - Returns False on errors (graceful fallback)
4. `test_warmup_disabled_when_kv_cache_warmup_zero` - Skips warmup when KV_CACHE_WARMUP=0
5. `test_warmup_enabled_by_default` - Enabled when env var not set
6. `test_warmup_respects_timeout_config` - Uses WARMUP_TIMEOUT_SEC configuration
7. `test_warmup_populates_cache` - Adds entries to cache
8. `test_cache_key_generation_is_consistent` - Same input produces same cache key
9. `test_warmup_with_custom_system_file` - Uses WARMUP_SYSTEM_FILE env var
10. (Already covered by error handling tests below)

#### TestWarmupTimeout (3 tests)
Tests for timeout handling:

1. `test_warmup_timeout_default_is_60_seconds` - Default timeout is 60s
2. `test_warmup_respects_custom_timeout` - Custom timeout values work
3. `test_timeout_environment_variable_overrides_default` - WARMUP_TIMEOUT_SEC env var controls timeout

#### TestWarmupErrorHandling (5 tests)
Tests for error handling and graceful fallback:

1. `test_warmup_handles_missing_cache_manager` - Handles None cache_manager
2. `test_warmup_handles_missing_model` - Handles None model
3. `test_warmup_handles_missing_tokenizer` - Handles None tokenizer
4. `test_warmup_handles_tokenizer_encoding_error` - Handles tokenizer exceptions
5. `test_warmup_handles_cache_write_error` - Handles cache write failures

**Key Assertions**:
- Functions return correct types (str, bool)
- Configuration via environment variables works
- Error handling is graceful (no exceptions, returns False)
- Cache keys are generated consistently

---

### 2. tests/integration/test_cache_warmup_e2e.py

**19 Integration Tests** - Test cache warmup in realistic server scenarios

#### TestCacheWarmupServerStartup (3 tests)
Tests server startup with warmup:

1. `test_server_warmup_disabled_skips_warmup` - KV_CACHE_WARMUP=0 skips warmup
2. `test_server_warmup_enabled_by_default` - Warmup runs by default
3. `test_server_starts_even_if_warmup_fails` - Server continues despite warmup failure
4. `test_warmup_runs_between_model_load_and_server_start` - Warmup sequence is correct

#### TestFirstRequestCacheHit (3 tests)
Tests cache hits on first request after warmup:

1. `test_cache_populated_after_warmup` - Cache has entries after warmup
2. `test_cache_hit_on_matching_prompt` - Cache retrieval works for matching prompts
3. `test_cache_statistics_show_entries_after_warmup` - Cache stats show populated entries

#### TestWarmupTimeout (3 tests)
Tests timeout behavior in realistic scenarios:

1. `test_warmup_timeout_is_respected` - Warmup completes within timeout
2. `test_warmup_timeout_configurable_via_env` - WARMUP_TIMEOUT_SEC controls timeout
3. `test_server_continues_if_warmup_times_out` - Server doesn't block on timeout

#### TestWarmupConfiguration (3 tests)
Tests environment variable configuration:

1. `test_kv_cache_warmup_enabled_default` - KV_CACHE_WARMUP=1 by default
2. `test_kv_cache_warmup_disabled_via_env` - KV_CACHE_WARMUP=0 disables
3. `test_warmup_system_file_env_var` - WARMUP_SYSTEM_FILE env var respected
4. `test_warmup_timeout_sec_env_var` - WARMUP_TIMEOUT_SEC env var respected

#### TestWarmupWithDifferentPrompts (3 tests)
Tests warmup with various prompt formats:

1. `test_warmup_with_short_prompt` - Works with short prompts
2. `test_warmup_with_long_prompt` - Works with 100+ line prompts
3. `test_warmup_with_structured_prompt` - Works with JSON/YAML-like prompts

#### TestWarmupCacheKeyConsistency (2 tests)
Tests cache key generation:

1. `test_same_prompt_generates_same_cache_key` - Consistent keys for identical inputs
2. `test_different_prompts_generate_different_cache_keys` - Different keys for different inputs

**Key Assertions**:
- Server starts even if warmup fails (graceful fallback)
- Cache has entries after successful warmup
- Environment variable configuration works
- Warmup completes within timeout
- Cache keys are consistent and unique

---

### 3. tests/integration/test_cache_warmup_performance.py

**13 Performance Tests** - Benchmark cache warmup performance

#### TestWarmupCompletionTime (3 tests)
Tests warmup duration:

1. `test_warmup_completes_within_60_seconds` - Warmup < 60s (timeout protection)
2. `test_warmup_completes_quickly` - Warmup < 100s on slow systems
3. `test_warmup_overhead_is_measured` - Logs warmup timing for monitoring

#### TestFirstRequestLatency (2 tests)
Tests request latency with warmed cache:

1. `test_first_request_hits_cache_within_1_second` - Cache hit < 1 second
2. `test_cache_operations_are_sub_millisecond` - GET/SET < 1ms, <5ms respectively

#### TestCacheHitRate (2 tests)
Tests cache effectiveness:

1. `test_cache_hit_rate_after_warmup` - Cache hit rate is reasonable after warmup
2. `test_cache_statistics_after_warmup` - Cache stats track hits/misses

#### TestWarmupCacheSizeImpact (2 tests)
Tests memory efficiency:

1. `test_warmup_memory_usage_is_reasonable` - Memory usage doesn't balloon
2. `test_cache_stays_within_memory_limit` - Respects configured memory limit

#### TestWarmupConcurrency (1 test)
Tests concurrent access:

1. `test_concurrent_cache_accesses_after_warmup` - Multiple threads access cache safely
2. `test_warmup_thread_safety` - Thread-safe cache operations

#### TestWarmupLatencyDistribution (1 test)
Tests latency percentiles:

1. `test_cache_operation_latency_percentiles` - p50 <1ms, p95 <5ms, p99 <10ms

#### TestWarmupComparisonWithoutCache (1 test)
Tests cache speedup:

1. `test_warmed_cache_is_faster_than_cold` - Cache 100x+ faster than cold requests

**Performance Targets Validated**:
- Warmup completion: < 60 seconds
- Cache hit latency: < 1 second (target <100ms)
- Cache operation latency: <1ms GET, <5ms SET
- Cache speedup vs cold: 100x+
- Memory efficiency: Configurable limits enforced

---

## Environment Variables Tested

### KV_CACHE_WARMUP
- **Purpose**: Enable/disable cache warmup
- **Values**: `1` (enabled, default), `0` (disabled)
- **Tests**: 8 tests validate this configuration

### WARMUP_TIMEOUT_SEC
- **Purpose**: Timeout for warmup operation
- **Default**: 60 seconds
- **Tests**: 5 tests validate timeout handling
- **Assertions**: Server continues even if timeout occurs

### WARMUP_SYSTEM_FILE
- **Purpose**: Custom system prompt file for warmup
- **Default**: Built-in fallback prompt
- **Tests**: 3 tests validate custom files

---

## Test Execution Summary

```
Total Tests: 55

Unit Tests:          23
  - get_standard_system_prompt: 6 tests
  - warmup_kv_cache function: 10 tests
  - timeout handling: 3 tests
  - error handling: 5 tests

Integration Tests:   19
  - server startup: 4 tests
  - first request cache hits: 3 tests
  - timeout handling: 3 tests
  - configuration: 4 tests
  - different prompts: 3 tests
  - cache key consistency: 2 tests

Performance Tests:   13
  - warmup completion time: 3 tests
  - first request latency: 2 tests
  - cache hit rate: 2 tests
  - cache size impact: 2 tests
  - concurrency: 2 tests
  - latency distribution: 1 test
  - cache speedup: 1 test
```

---

## TDD Status

### RED Phase: All Tests Fail

✅ **55/55 tests FAIL** - Expected because:

1. **`get_standard_system_prompt()` doesn't exist** in mlx-server.py
2. **`warmup_kv_cache()` async function doesn't exist** in mlx-server.py
3. **No warmup integration** in `VLLMMLXServer.run()` startup method
4. **No environment variable handling** for warmup configuration

**Example failures**:
```
ERROR: test_loads_from_file (test_cache_warmup.TestGetStandardSystemPrompt)
  NotImplementedError: get_standard_system_prompt not yet implemented

ERROR: test_warmup_returns_bool (test_cache_warmup.TestWarmupKVCacheFunction)
  NotImplementedError: warmup_kv_cache not yet implemented
```

### GREEN Phase: What Implementation Must Do

To make tests PASS, implementer must:

1. **Create `get_standard_system_prompt(warmup_file=None)` function**
   - Read from file if provided
   - Return fallback prompt if file missing
   - Handle unicode and large files

2. **Create `warmup_kv_cache()` async function**
   - Load model and tokenizer parameters
   - Generate standard prompt via `get_standard_system_prompt()`
   - Tokenize prompt
   - Generate KV cache
   - Store in RAM cache manager
   - Return True on success, False on failure

3. **Add timeout protection**
   - Use `asyncio.wait_for(warmup_kv_cache(), timeout=timeout_sec)`
   - Catch `asyncio.TimeoutError` and continue (graceful fallback)

4. **Integrate into `VLLMMLXServer.run()` method**
   - After `asyncio.run(self.load_model())`
   - Before `uvicorn.run()`
   - Check `KV_CACHE_WARMUP` env var

5. **Handle environment variables**
   - `KV_CACHE_WARMUP`: 1 (enabled) / 0 (disabled)
   - `WARMUP_TIMEOUT_SEC`: Timeout in seconds (default 60)
   - `WARMUP_SYSTEM_FILE`: Custom system prompt file path

---

## Test Coverage Analysis

### Functions Tested

| Function | Unit Tests | Integration Tests | Performance Tests | Total |
|----------|-----------|------------------|------------------|-------|
| `get_standard_system_prompt()` | 6 | 3 | 0 | 9 |
| `warmup_kv_cache()` | 10 | 16 | 13 | 39 |
| **Total** | **16** | **19** | **13** | **48** |

### Error Scenarios Covered

- Missing cache manager
- Missing model
- Missing tokenizer
- Tokenizer encoding errors
- Cache write errors
- Timeout expiration
- Missing config file
- Empty config file

### Configuration Covered

- Default behavior (warmup enabled)
- Disabled via KV_CACHE_WARMUP=0
- Custom timeout via WARMUP_TIMEOUT_SEC
- Custom prompt file via WARMUP_SYSTEM_FILE

### Performance Metrics Validated

- Warmup completion time: < 60 seconds
- First request with cache: < 1 second
- Cache GET: < 1 millisecond
- Cache SET: < 5 milliseconds
- Cache hit rate: > 0% (depends on implementation)
- Memory efficiency: Within configured limits

---

## Next Steps

1. **Code Implementer Agent**: Implement cache warmup to make tests PASS
   - See `docs/development/optimum-implementation-plan.md` Phase 1 for design
   - Implement `get_standard_system_prompt()` in mlx-server.py
   - Implement `warmup_kv_cache()` as async function
   - Integrate into `VLLMMLXServer.run()` between load_model() and uvicorn.run()

2. **Run Tests**:
   ```bash
   # Unit tests
   python3 -m unittest discover -s tests/unit -p "test_cache_warmup.py" -v

   # Integration tests
   python3 -m unittest discover -s tests/integration -p "test_cache_warmup_e2e.py" -v

   # Performance tests
   python3 -m unittest discover -s tests/integration -p "test_cache_warmup_performance.py" -v
   ```

3. **Verify All Tests PASS**: 55/55 tests should pass after implementation

---

## Key Design Decisions

### Why Separate Test Files?

1. **test_cache_warmup.py** (Unit)
   - Fast execution
   - Test individual functions
   - No async overhead
   - Easy to debug

2. **test_cache_warmup_e2e.py** (Integration)
   - Test realistic server startup scenarios
   - Validate configuration handling
   - Test error recovery

3. **test_cache_warmup_performance.py** (Performance)
   - Benchmark critical paths
   - Validate performance targets
   - Monitor cache efficiency

### Why Async Tests?

`warmup_kv_cache()` is async because:
- Model generation is CPU-bound, can block event loop
- Better integration with FastAPI/uvicorn async server
- Allows timeout protection via `asyncio.wait_for()`

### Why Graceful Fallback?

Server must start even if warmup fails because:
- Warmup is optimization, not requirement
- Network glitches, file errors shouldn't block server
- First request will be slower but functional
- Degradation, not failure

---

## Test Artifacts

**Created Files**:
1. `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/unit/test_cache_warmup.py` (540 lines, 23 tests)
2. `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/integration/test_cache_warmup_e2e.py` (580 lines, 19 tests)
3. `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/integration/test_cache_warmup_performance.py` (620 lines, 13 tests)
4. `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/TEST-ARTIFACTS-PHASE-2.3.md` (this file)

**Test Status**: 55 FAILING tests (TDD Red Phase)

---

## Quality Metrics

- **Code Coverage Target**: 80%+ of warmup functions
- **Test Completeness**: All major code paths tested
- **Performance Validation**: Critical timing requirements captured
- **Error Handling**: 8+ error scenarios tested
- **Configuration**: 3 environment variables validated
- **Concurrency**: Thread-safety tested

---

## References

- **Planning Document**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/docs/development/optimum-implementation-plan.md` (Phase 1)
- **Implementation Location**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/mlx-server.py`
- **Cache Manager**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/ram_cache.py`
- **Previous Test Examples**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/unit/test_ram_cache.py`

---

**Report Generated**: 2025-11-17
**Test-Master Agent**: Ready for implementer phase
