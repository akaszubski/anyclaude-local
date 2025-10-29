# Error Handling Test Plan

**Status**: In Progress
**Last Updated**: 2025-10-29
**Coverage Target**: 80% of error scenarios

## Overview

This document outlines a comprehensive test strategy to capture 98+ untested error scenarios identified in the anyclaude codebase.

## Priority Matrix

### CRITICAL (P0) - Must Test Immediately
These errors directly break core functionality and impact user experience.

| # | Category | Scenario | Impact | Test File |
|---|----------|----------|--------|-----------|
| 1 | Stream | Backpressure buffer overflow | Truncated responses | `test-stream-backpressure.js` |
| 2 | Stream | Unknown chunk terminates stream | Incomplete responses | `test-stream-errors.js` |
| 3 | Stream | Drain event listener leak | Memory leak | `test-stream-errors.js` |
| 4 | File I/O | Permission denied on trace write | Lost request logs | `test-file-io-errors.js` |
| 5 | File I/O | Concurrent trace writes | Data corruption | `test-file-io-errors.js` |
| 6 | Tool Call | Circular reference in input | JSON.stringify crash | `test-tool-errors.js` |
| 7 | Tool Call | Missing tool in registry | Tool execution fails | `test-tool-errors.js` |
| 8 | Network | Connection timeout | Hung requests | `test-network-errors.js` |
| 9 | Config | Invalid JSON in .anyclauderc | Silent failure | `test-config-errors.js` |
| 10 | Message | Multiple system prompts | Conversion error | `test-message-errors.js` |

### HIGH (P1) - Should Test Before Release
These errors can cause data loss or inconsistent state.

| # | Category | Scenario | Impact | Test File |
|---|----------|----------|--------|-----------|
| 11 | File I/O | Disk full during trace write | Lost audit trail | `test-file-io-errors.js` |
| 12 | Process | Server crash after startup | Silent degradation | `test-process-errors.js` |
| 13 | Stream | Response already ended error | Swallowed exception | `test-stream-errors.js` |
| 14 | Tool Call | Tool input JSON parse fails | Malformed tool calls | `test-tool-errors.js` |
| 15 | Context | Message truncation throws | 503 response | `test-context-errors.js` |
| 16 | Cache | Usage fields missing | Wrong token counts | `test-cache-errors.js` |
| 17 | Proxy | Body too large | Request rejected silently | `test-proxy-errors.js` |
| 18 | Message | Circular reference in output | Conversion crash | `test-message-errors.js` |

### MEDIUM (P2) - Should Test Before 1.0 Release
These errors affect reliability under edge cases.

| # | Category | Scenario | Impact | Test File |
|---|----------|----------|--------|-----------|
| 19 | Provider | Fetch interceptor failure | Wrong request sent | `test-provider-errors.js` |
| 20 | Stream | Very large reasoning block | Memory exhaustion | `test-stream-errors.js` |
| 21 | File I/O | Path traversal attack | Security vulnerability | `test-file-io-errors.js` |
| 22 | Process | Concurrent server launches | Port conflict | `test-process-errors.js` |
| 23 | Trace | Corrupted JSON files | Unreadable traces | `test-trace-errors.js` |
| 24 | Schema | Infinite recursion in nested objects | Stack overflow | `test-schema-errors.js` |
| 25 | Schema | Circular $refs | Infinite loop | `test-schema-errors.js` |

## Test Files to Create

### 1. `tests/unit/test-stream-errors.js`
Tests for stream processing error scenarios.

**Scenarios to Cover**:
- [ ] Backpressure buffer full, drain event received
- [ ] Backpressure drain listener cleanup on error
- [ ] Unknown chunk types don't terminate stream
- [ ] Response.write() after response ended
- [ ] Very large text_delta chunks (memory pressure)
- [ ] Keepalive interval cleanup on abort
- [ ] Tool call state isolation between messages
- [ ] Tool tracking maps cleared between streams
- [ ] Circular reference in tool input
- [ ] Missing tool ID/name validation

**Metrics**:
- Lines of code: ~400
- Test cases: 10
- Estimated time: 2-3 hours

---

### 2. `tests/unit/test-file-io-errors.js`
Tests for file system and trace logging errors.

**Scenarios to Cover**:
- [ ] mkdir fails with EACCES (permission denied)
- [ ] writeFileSync fails with ENOSPC (disk full)
- [ ] File deleted between readdir and access
- [ ] Race condition: two processes write trace simultaneously
- [ ] Home directory not writable
- [ ] Path traversal attack in filename construction
- [ ] Very large trace files (>1GB)
- [ ] Corrupted JSON in existing trace files
- [ ] Timestamp collision within millisecond
- [ ] Log directory already exists (EEXIST)

**Metrics**:
- Lines of code: ~350
- Test cases: 10
- Estimated time: 2-3 hours

---

### 3. `tests/unit/test-network-errors.js`
Tests for network and timeout errors.

**Scenarios to Cover**:
- [ ] Fetch timeout to vLLM-MLX server
- [ ] Connection refused (server not running)
- [ ] Partial response (connection drops mid-stream)
- [ ] Non-JSON response from server
- [ ] Slow server (delay > keepalive interval)
- [ ] Multiple timeouts in sequence (retry exhaustion)
- [ ] Socket reset by peer
- [ ] DNS resolution failure
- [ ] HTTP 5xx errors from backend
- [ ] Response headers missing Content-Type

**Metrics**:
- Lines of code: ~380
- Test cases: 10
- Estimated time: 2-3 hours

---

### 4. `tests/unit/test-tool-errors.js`
Tests for tool calling validation and error handling.

**Scenarios to Cover**:
- [ ] Tool input with circular reference
- [ ] Tool not in registry (tool_call with unknown ID)
- [ ] Missing toolName or toolCallId field
- [ ] Tool input JSON parse fails
- [ ] Invalid tool name (not valid identifier)
- [ ] Tool arguments exceed max size
- [ ] Multiple concurrent tool calls (deduplication)
- [ ] Tool call arrives out of order
- [ ] Tool input-end without deltas, then tool-call
- [ ] Empty tool input object

**Metrics**:
- Lines of code: ~320
- Test cases: 10
- Estimated time: 2-3 hours

---

### 5. `tests/unit/test-config-errors.js`
Tests for configuration loading and validation.

**Scenarios to Cover**:
- [ ] Invalid JSON in .anyclauderc.json
- [ ] Missing required fields in config
- [ ] Invalid backend specified
- [ ] Invalid port number (negative, >65535)
- [ ] Conflicting environment variables
- [ ] Missing .anyclauderc when required
- [ ] Config file permissions (unreadable)
- [ ] Path traversal in model field
- [ ] API key exposed in config
- [ ] Invalid baseUrl format

**Metrics**:
- Lines of code: ~280
- Test cases: 10
- Estimated time: 2 hours

---

### 6. `tests/unit/test-message-errors.js`
Tests for message conversion and validation errors.

**Scenarios to Cover**:
- [ ] Multiple system prompts in messages
- [ ] Empty message content array
- [ ] Invalid role (not user/assistant/system)
- [ ] Circular reference in tool result
- [ ] PDF too large to convert
- [ ] Invalid base64 in file data
- [ ] URL media file returns 404
- [ ] Tool call not found in response
- [ ] Tool result content type mismatch
- [ ] Non-UTF8 encoded file data

**Metrics**:
- Lines of code: ~360
- Test cases: 10
- Estimated time: 2-3 hours

---

### 7. `tests/unit/test-process-errors.js`
Tests for server launcher and process management.

**Scenarios to Cover**:
- [ ] Model path doesn't exist
- [ ] Server crashes after startup
- [ ] Server process group already killed
- [ ] Python not found or wrong version
- [ ] Virtual environment corrupted
- [ ] Port already in use
- [ ] Process spawn fails (too many open files)
- [ ] Concurrent server launches (race condition)
- [ ] Server output very large (buffer overflow)
- [ ] Model loading timeout

**Metrics**:
- Lines of code: ~340
- Test cases: 10
- Estimated time: 2-3 hours

---

### 8. `tests/unit/test-context-errors.js`
Tests for context management and token counting.

**Scenarios to Cover**:
- [ ] Context length query returns undefined
- [ ] Message truncation throws error
- [ ] tiktoken encoder not freed on error
- [ ] Estimated tokens returns NaN
- [ ] Available space calculation goes negative
- [ ] System prompt array missing `.text` property
- [ ] Tool count exceeds context limit
- [ ] Message count exceeds context limit
- [ ] Truncation creates invalid message sequence
- [ ] Cache metrics calculation fails

**Metrics**:
- Lines of code: ~290
- Test cases: 10
- Estimated time: 2 hours

---

### 9. `tests/unit/test-schema-errors.js`
Tests for JSON schema validation and adaptation.

**Scenarios to Cover**:
- [ ] Infinite recursion in nested objects
- [ ] Circular $refs in schema
- [ ] Conflicting property definitions in allOf
- [ ] null property treated as object
- [ ] Duplicate values in required array
- [ ] oneOf with no valid option
- [ ] Required field missing from definition
- [ ] Format value causes validation failure
- [ ] additionalProperties edge cases
- [ ] propertyNames without pattern

**Metrics**:
- Lines of code: ~310
- Test cases: 10
- Estimated time: 2 hours

---

### 10. `tests/unit/test-proxy-errors.js`
Tests for proxy request/response handling.

**Scenarios to Cover**:
- [ ] Missing request URL
- [ ] Request body too large (>100MB)
- [ ] JSON parse fails on request body
- [ ] Response already sent error
- [ ] Keepalive not cleared on error path
- [ ] Provider returns non-JSON response
- [ ] Tool parser fails on tool_call chunk
- [ ] Message conversion throws error
- [ ] WriteHead called after write
- [ ] Response headers already sent

**Metrics**:
- Lines of code: ~330
- Test cases: 10
- Estimated time: 2-3 hours

---

## Implementation Order

1. **Week 1**: Stream errors + File I/O errors (most critical)
2. **Week 2**: Tool errors + Network errors (high impact)
3. **Week 3**: Config + Message errors (reliability)
4. **Week 4**: Process + Context errors (completeness)
5. **Week 5**: Schema + Proxy errors (edge cases)

## Test Infrastructure Needed

### Mock/Stub Utilities
- [ ] Mock WritableStream for backpressure testing
- [ ] Mock file system (memfs) for I/O testing
- [ ] Mock fetch for network testing
- [ ] Mock child_process for process testing
- [ ] Mock JSON serialization to trigger circular refs

### Test Fixtures
- [ ] Invalid .anyclauderc.json files (malformed JSON, wrong types)
- [ ] Large file payloads (test memory limits)
- [ ] Complex nested schemas (test recursion)
- [ ] Tool definitions with edge cases

### Helper Functions
- [ ] `expectError(fn, errorType, message)` - assert error thrown
- [ ] `expectNoMemoryLeak(fn)` - detect memory growth
- [ ] `expectTimeout(promise, ms)` - assert timeout
- [ ] `expectStateChange(before, after, expected)` - track state

## Success Criteria

- [ ] 80%+ coverage of identified error scenarios
- [ ] All P0 errors have tests (10/10)
- [ ] All P1 errors have tests (8/8)
- [ ] Error messages are user-friendly
- [ ] No unhandled exceptions escape to user
- [ ] Memory leaks detected and fixed
- [ ] Race conditions properly handled
- [ ] Security vulnerabilities prevented

## Estimated Effort

| Phase | Effort | Bugs Expected |
|-------|--------|---------------|
| Stream errors | 2-3h | 3-5 bugs |
| File I/O errors | 2-3h | 2-4 bugs |
| Tool errors | 2-3h | 2-3 bugs |
| Network errors | 2-3h | 2-3 bugs |
| Config errors | 2h | 1-2 bugs |
| Message errors | 2-3h | 1-2 bugs |
| Process errors | 2-3h | 2-3 bugs |
| Context errors | 2h | 1-2 bugs |
| Schema errors | 2h | 1-2 bugs |
| Proxy errors | 2-3h | 2-3 bugs |
| **TOTAL** | **~21-24 hours** | **~20-30 bugs** |

## Questions to Answer

1. **Which errors are most important for your use case?** (Prioritize accordingly)
2. **Do you want integration tests or unit tests?** (This plan is unit tests)
3. **What's your tolerance for test execution time?** (Larger test suite = slower CI)
4. **Do you want end-to-end error scenario tests?** (e.g., actual file permission errors)
5. **Should we add error telemetry/metrics?** (Track error frequency in production)

## Next Steps

1. Pick 2-3 highest-priority test files to implement first
2. Set up mock/stub infrastructure
3. Implement tests incrementally (10 tests per file)
4. Run tests in CI/CD pipeline
5. Fix bugs as they're discovered
6. Measure coverage improvement

