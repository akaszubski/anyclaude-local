# Security Audit Report: Issue #13 - Tool Parser Plugin System + Circuit Breaker

**Audit Date:** November 19, 2025
**Auditor:** Security-Auditor Agent
**Status:** PASS with 2 identified findings

## Quick Summary

The tool parser plugin system and circuit breaker implementation demonstrate solid engineering with strong security fundamentals. Two actionable issues have been identified requiring remediation before production deployment:

1. **HIGH:** Unbounded memory growth in circuit breaker state_changes list
2. **MEDIUM:** Soft timeout on JSON parsing (not hard-enforced)

---

## Vulnerability Details

### 1. Unbounded Memory Growth in CircuitBreaker.state_changes

**Severity:** HIGH | **CVSS:** 4.3 (Medium Impact)

**Location:** `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/circuit_breaker.py:226-230`

**Problem:**
Every circuit state transition appends to the `state_changes` list with no size bounds:

```python
self._metrics.state_changes.append({
    'from_state': old_state.value,
    'to_state': new_state.value,
    'timestamp': time.time()
})
```

**Attack Scenario:**

- Process runs 7 days with 10 failures/minute = 100,800 entries
- Each entry ~150 bytes = 15 MB memory accumulation
- No pruning mechanism = indefinite growth until OOM

**Fix:**
Implement circular buffer with max size:

```python
MAX_STATE_CHANGES = 10000

if len(self._metrics.state_changes) > self.MAX_STATE_CHANGES:
    self._metrics.state_changes = self._metrics.state_changes[-self.MAX_STATE_CHANGES:]
```

**Impact:** Affects long-running processes; addressable with 3-line fix

---

### 2. Soft Timeout on JSON Parsing (Not Hard-Enforced)

**Severity:** MEDIUM | **CVSS:** 5.3 (Medium Impact)

**Location:** `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/tool_parsers.py:110-127`

**Problem:**
Timeout is validated AFTER json.loads() completes, not during parsing:

```python
# This happens AFTER json.loads() returns:
elapsed_ms = (time.perf_counter() - start_time) * 1000
if elapsed_ms > self.timeout_ms:
    raise ToolParseError(...)  # Too late - already parsed
```

**Attack Scenario:**

- Attacker sends deeply nested JSON: `{"a":{"b":{"c":...}}}` (1000+ levels)
- json.loads() blocks for seconds
- Timeout check triggers after parsing completes
- Thread is already blocked; no protection against thread pool exhaustion

**Fix:**
Implement hard timeout using threading:

```python
def _parse_with_hard_timeout(self, func, timeout_ms):
    result = [None]
    exception = [None]

    def wrapper():
        try:
            result[0] = func()
        except Exception as e:
            exception[0] = e

    thread = threading.Thread(target=wrapper, daemon=False)
    thread.start()
    thread.join(timeout=timeout_ms / 1000.0)

    if thread.is_alive():
        raise ToolParseError(f"Timeout after {timeout_ms}ms")

    if exception[0]:
        raise exception[0]
    return result[0]
```

**Impact:** Requires more complex implementation; critical for untrusted input scenarios

---

## What Passed (Security Strengths)

### Thread Safety ✓

- Proper lock usage (no deadlock risk)
- Locks released before external calls
- Concurrent operations validated in tests

### Input Validation ✓

- JSON size limit: 1 MB enforced
- Type validation before processing
- All JSON parsing wrapped in try-except
- Regex patterns use non-greedy quantifiers (no ReDoS)

### Error Handling ✓

- Custom exception types (ToolParseError, CircuitBreakerError)
- No sensitive data in error messages
- Graceful fallback chain (FallbackParser)

### Secrets Management ✓

- No hardcoded API keys or credentials
- .env properly in .gitignore
- No secrets in git history
- Error messages sanitized

### OWASP Top 10 Compliance ✓

- **A03 (Injection):** No SQL/command/code injection vectors
- **A04 (Insecure Design):** Circuit breaker pattern correctly implemented
- **A05 (Misconfiguration):** Secure defaults, all configurable
- **A06 (Vulnerable Components):** Only stdlib imports (json, re, time, threading)

### Test Coverage ✓

- Thread safety tests (test_concurrent_calls_are_thread_safe)
- Performance requirements (parse_under_5ms, overhead_under_1ms)
- Metrics accuracy tests
- State machine validation

---

## Files Reviewed

| File                                                                                   | Lines | Status   |
| -------------------------------------------------------------------------------------- | ----- | -------- |
| `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/tool_parsers.py`        | 561   | Reviewed |
| `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/lib/circuit_breaker.py`     | 230   | Reviewed |
| `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/unit/test_tool_parsers.py`    | ~800  | Reviewed |
| `/Users/andrewkaszubski/Documents/GitHub/anyclaude/tests/unit/test_circuit_breaker.py` | ~800  | Reviewed |

---

## Recommendations (Priority Order)

### Priority 1: Critical (Fix Before Production)

1. **Implement bounded state_changes history**
   - Add `MAX_STATE_CHANGES = 10000` constant
   - Trim list to last 10k entries when exceeded
   - Add test to verify bounds enforcement
   - Effort: Low (3-5 lines of code)

2. **Implement hard timeout for JSON parsing**
   - Create `_parse_with_hard_timeout()` method
   - Use threading.Thread with join(timeout)
   - Update OpenAIToolParser, CommentaryToolParser to use it
   - Add test with pathological JSON
   - Effort: Medium (20-30 lines of code)

### Priority 2: Important (Next Release)

3. **Add metrics bounds**
   - Cap total_calls, successes, failures to prevent integer overflow
   - Consider resetting metrics periodically for long-running processes
   - Effort: Low

4. **Add security logging**
   - Log timeout events (with parsed size, not content)
   - Log which parser succeeded
   - Log circuit breaker state changes
   - Effort: Medium

### Priority 3: Documentation

5. **Document threat model**
   - Add SECURITY.md section explaining assumptions
   - Document input constraints (max JSON size: 1MB)
   - Clarify timeout behavior and limitations
   - Effort: Low

---

## Testing Recommendations

### 1. Stress Test Memory Bounds

```python
def test_state_changes_bounded():
    breaker = CircuitBreaker(failure_threshold=1)
    for i in range(10000):
        try:
            breaker.call(lambda: 1/0)  # Always fails
        except:
            pass

    metrics = breaker.get_metrics()
    assert len(metrics.state_changes) <= 10000  # After fix
```

### 2. Test Hard Timeout

```python
def test_timeout_on_pathological_json():
    # Deeply nested JSON triggers worst-case parsing
    nested = "{" * 1000 + "}" * 1000

    start = time.time()
    try:
        parser.parse(nested)
    except ToolParseError:
        pass

    elapsed = time.time() - start
    assert elapsed < 1.0  # Should timeout quickly
```

### 3. Concurrent Stress Test

```python
def test_concurrent_heavy_load():
    threads = []
    for i in range(100):
        t = threading.Thread(
            target=lambda: registry.parse_with_fallback(test_data)
        )
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Verify no crashes, no memory leak
```

---

## Conclusion

The implementation is well-engineered with proper abstractions, thread safety, and input validation. The two identified issues are specific, actionable, and have clear remediation paths:

1. **Bounded history** - 3-line fix to prevent memory leak
2. **Hard timeout** - 20-line change to prevent DoS

Once addressed, this code is suitable for production deployment in Issue #13 release.

**Recommended Action:** Schedule fixes for next sprint before merging to main.
