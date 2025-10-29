# TDD Tests Documentation - Stability Fixes

## Overview

This document describes the comprehensive TDD (Test-Driven Development) test suite created to validate the three stability fixes for anyclaude.

**Tests Written**: 3 files with 27 total tests
**Location**: `tests/regression/test_*_fix.js`
**Status**: ✅ Ready for implementation

---

## Test Files Summary

### 1. test_stream_draining_fix.js (8 tests)
**File**: `tests/regression/test_stream_draining_fix.js`

**What it tests**: FIX #1 - Enhanced Stream Draining

**Tests**:
1. `res.writableLength` check exists
2. Drain event listener is registered
3. 5-second safety timeout is present
4. Write buffer backpressure handling
5. `writableEnded` flag check (prevents double-close)
6. `setImmediate` is still used for async closure
7. No synchronous `res.end()` calls in streaming path
8. Debug logging for draining exists

**Failure modes** (tests will FAIL if implementation is missing):
- Missing `res.writableLength` check → Test 1 fails (stream truncates)
- Missing drain event listener → Test 2 fails (no backpressure handling)
- Missing timeout guard → Test 3 fails (could hang)
- Missing `writableEnded` check → Test 5 fails (double-close error)

**Run**: `node tests/regression/test_stream_draining_fix.js`

---

### 2. test_message_stop_timeout_fix.js (9 tests)
**File**: `tests/regression/test_message_stop_timeout_fix.js`

**What it tests**: FIX #2 - Message-Stop Timeout Protection

**Tests**:
1. `messageStopTimeout` variable is declared
2. 60-second timeout is configured
3. `messageStopSent` flag prevents duplicates
4. Timeout is cleared in `flush()` handler
5. Timeout callback enqueues `message_stop`
6. Timeout is set after TransformStream creation
7. Debug logging for timeout firing
8. Original `flush()` fallback still present
9. No race condition between timeout and flush

**Failure modes** (tests will FAIL if implementation is missing):
- Missing `messageStopTimeout` → Test 1 fails (no timeout mechanism)
- Missing 60000ms timeout → Test 2 fails (wrong timeout duration)
- Missing `!messageStopSent` check → Test 3 fails (duplicate messages)
- Missing `clearTimeout` → Test 4 fails (timeout fires after completion)
- Missing enqueue logic → Test 5 fails (timeout doesn't actually force stop)

**Run**: `node tests/regression/test_message_stop_timeout_fix.js`

---

### 3. test_request_logging_fix.js (10 tests)
**File**: `tests/regression/test_request_logging_fix.js`

**What it tests**: FIX #3 - Request/Response Logging

**Tests**:
1. `src/request-logger.ts` file exists
2. `logRequest` function is exported
3. Log directory creation is implemented
4. JSONL format is used
5. Required log fields present (timestamp, systemSize, toolCount, etc.)
6. Recursive directory creation with safe options
7. Error handling is implemented
8. `logRequest` is called in anthropic-proxy.ts
9. Log files in correct directory (~/.anyclaude/request-logs/)
10. JSONL files use date-based naming (YYYY-MM-DD.jsonl)

**Failure modes** (tests will FAIL if implementation is missing):
- Missing request-logger.ts → Test 1 fails (no logging module)
- Missing export → Test 2 fails (can't import function)
- Missing directory creation → Test 3 fails (writes fail)
- Missing JSON.stringify → Test 4 fails (not JSONL format)
- Missing required fields → Test 5 fails (incomplete logs)
- Missing integration in proxy → Test 8 fails (requests not logged)

**Run**: `node tests/regression/test_request_logging_fix.js`

---

## Running All Tests

### Run Individual Test Files
```bash
node tests/regression/test_stream_draining_fix.js
node tests/regression/test_message_stop_timeout_fix.js
node tests/regression/test_request_logging_fix.js
```

### Run All Regression Tests
```bash
npm test -- tests/regression
```

### Run Full Test Suite
```bash
npm test
```

---

## Test Execution Flow

### Before Implementation
```
✗ FIX #1 tests fail (stream draining not implemented)
✗ FIX #2 tests fail (message-stop timeout not implemented)
✗ FIX #3 tests fail (request logging not implemented)
```

### After Implementation
```
✅ All FIX #1 tests pass
✅ All FIX #2 tests pass
✅ All FIX #3 tests pass
✅ All 75 existing tests still pass (regression tests)
```

---

## Test-Driven Development (TDD) Workflow

### Step 1: ✅ COMPLETE - Write Tests First
**What we did**:
- Created 3 comprehensive test files
- Tests verify what could go wrong
- Tests document expected behavior
- Each test has clear failure mode

**Status**: Tests written and ready to run

### Step 2: NEXT - Verify Tests Fail First
```bash
# Run tests to confirm they fail (expected)
npm test
```

**Expected**: See failures for stream draining, message-stop timeout, request logging
**Why**: Confirms tests are actually checking for the fix

### Step 3: IMPLEMENT - Implement Fixes One by One
1. Implement FIX #1 (stream draining)
2. Run tests: `npm test` → should see FIX #1 tests pass
3. Implement FIX #2 (message-stop timeout)
4. Run tests: `npm test` → should see FIX #2 tests pass
5. Implement FIX #3 (request logging)
6. Run tests: `npm test` → should see FIX #3 tests pass

### Step 4: VERIFY - All Tests Pass
```bash
npm test
# Expected: All 75+ tests pass, including new stability tests
```

### Step 5: COMMIT - Clean, Atomic Commits
```bash
# After implementing each fix:
git add src/file-changed.ts tests/regression/test_fix.js
git commit -m "fix: implement FIX #1 (stream draining) with comprehensive tests"
```

---

## Test Success Criteria

### All Tests Pass When:

**FIX #1 (Stream Draining)**:
- ✅ `res.writableLength` is checked before closing
- ✅ Drain event listener is registered
- ✅ 5-second timeout guard exists
- ✅ `writableEnded` prevents double-close
- ✅ No synchronous `res.end()` in write path

**FIX #2 (Message-Stop Timeout)**:
- ✅ `messageStopTimeout` variable exists
- ✅ 60-second timeout is configured
- ✅ `messageStopSent` flag prevents duplicates
- ✅ Timeout is cleared in flush handler
- ✅ Message-stop is enqueued on timeout

**FIX #3 (Request Logging)**:
- ✅ `request-logger.ts` module exists
- ✅ `logRequest` function is exported
- ✅ Directory creation is implemented
- ✅ JSONL format is used
- ✅ Required fields are logged
- ✅ Integration in anthropic-proxy.ts

---

## Test Documentation for Each Fix

### FIX #1: Stream Draining Tests Explained

**Why this fix is needed**:
- Problem: `res.end()` called before write buffer fully flushed
- Symptom: Responses truncated at 5-10% rate
- Solution: Check `res.writableLength`, wait for 'drain' event

**What each test verifies**:

| Test | Checks | Purpose |
|------|--------|---------|
| Test 1 | `res.writableLength` exists | Detects buffered data |
| Test 2 | drain event listener | Waits for buffer ready |
| Test 3 | 5-second timeout | Prevents hanging |
| Test 4 | write backpressure | Handles full buffers |
| Test 5 | writableEnded check | Prevents double-close |
| Test 6 | setImmediate still used | Maintains async closure |
| Test 7 | No sync res.end() | Safe from truncation |
| Test 8 | Debug logging | Verifiable fix working |

**Expected improvement**: 90% reduction in truncation (5-10% → ~0%)

---

### FIX #2: Message-Stop Timeout Tests Explained

**Why this fix is needed**:
- Problem: Message-stop event sometimes not sent
- Symptom: Requests hang, no response completion
- Solution: Force message-stop after 60 seconds timeout

**What each test verifies**:

| Test | Checks | Purpose |
|------|--------|---------|
| Test 1 | messageStopTimeout variable | Stores timeout reference |
| Test 2 | 60000ms timeout | Correct duration |
| Test 3 | messageStopSent flag | Prevents duplicates |
| Test 4 | clearTimeout in flush | Cleanup after normal completion |
| Test 5 | controller.enqueue message_stop | Actually sends stop event |
| Test 6 | Timeout after TransformStream | Monitors whole stream |
| Test 7 | Debug logging | Visible in logs |
| Test 8 | flush() fallback present | Two guarantees of completion |
| Test 9 | No race condition | Thread-safe flag checking |

**Expected improvement**: 100% response completion (no stuck requests)

---

### FIX #3: Request Logging Tests Explained

**Why this fix is needed**:
- Problem: Can't see what's happening when issues occur
- Symptom: Issues appear random, hard to debug
- Solution: Log all requests to JSONL format

**What each test verifies**:

| Test | Checks | Purpose |
|------|--------|---------|
| Test 1 | request-logger.ts exists | Dedicated module |
| Test 2 | logRequest exported | Can be imported |
| Test 3 | Directory creation logic | Creates ~/.anyclaude/request-logs |
| Test 4 | JSON.stringify + append | JSONL format correct |
| Test 5 | Required fields | timestamp, systemSize, toolCount, etc. |
| Test 6 | Recursive mkdir | Creates parent dirs |
| Test 7 | Error handling | Won't crash logging |
| Test 8 | Integration in proxy | Called for each request |
| Test 9 | Correct directory path | ~/.anyclaude/request-logs/ |
| Test 10 | Date-based naming | YYYY-MM-DD.jsonl files |

**Expected improvement**: Full observability for debugging

---

## Reverting If Something Goes Wrong

### Revert Individual Fix
```bash
# If FIX #1 causes problems:
git revert <commit-hash>  # Revert just FIX #1
npm test                   # Verify other tests still pass
```

### Revert All Fixes
```bash
# Go back to before any fixes
git revert HEAD~2          # Revert last 3 commits (if each fix is one commit)
npm test                   # Verify all tests still pass
```

### Since Tests Are Committed First
- You have a clean commit history
- Each fix can be reverted independently
- Tests serve as documentation
- Easy to identify what broke

---

## Test Output Examples

### When Tests Pass (After Implementation)
```
================================================================================
STREAM DRAINING FIX - TDD TESTS
================================================================================

[Test 1] close() handler checks for buffered data (res.writableLength)
✓ PASS: res.writableLength check is present

[Test 2] close() handler listens for drain event
✓ PASS: drain event listener is registered

... (all 8 tests pass)

✅ All stream draining tests passed!

FIX #1 Implementation Status: ✅ READY TO IMPLEMENT
```

### When Tests Fail (Before Implementation)
```
[Test 1] close() handler checks for buffered data (res.writableLength)
✗ FAIL: res.writableLength check is missing
  → Stream will close immediately without draining

[Test 2] close() handler listens for drain event
✗ FAIL: drain event listener is missing
  → No guarantee that buffered data gets written

... (Tests explain what's missing)

FIX #1 Implementation Status: ⏳ NOT YET IMPLEMENTED
This is expected - tests written first per TDD approach
```

---

## Integration with CI/CD

These tests are integrated with:

### Pre-commit Hook
- Runs TypeScript type checking
- Format validation
- Quick sanity checks

### Pre-push Hook
- Runs full test suite including these regression tests
- Must pass before pushing to GitHub

### GitHub Actions (if configured)
- Runs all tests on PR
- Blocks merge if tests fail

---

## Documentation Purpose

Each test includes:
1. **What it verifies** - Clear statement of what's being tested
2. **Why it matters** - Explanation of the failure mode
3. **Pass criteria** - What must exist for test to pass
4. **Failure explanation** - What happens if test fails

This makes the tests **self-documenting** - they explain the fix requirements without reading implementation docs.

---

## Next Steps

### ✅ COMPLETE
1. Tests written in 3 files (27 total tests)
2. All tests documented here
3. Ready for implementation

### 🔜 NEXT
1. **Run tests** to confirm they fail (expected)
   ```bash
   npm test
   ```

2. **Implement FIX #1** (stream draining in anthropic-proxy.ts)
   ```bash
   npm test  # Verify FIX #1 tests pass
   ```

3. **Implement FIX #2** (message-stop timeout in convert-to-anthropic-stream.ts)
   ```bash
   npm test  # Verify FIX #2 tests pass
   ```

4. **Implement FIX #3** (request logging in new request-logger.ts)
   ```bash
   npm test  # Verify FIX #3 tests pass
   ```

5. **Verify all tests pass** (75+ tests total)
   ```bash
   npm test  # Should see: ✅ All tests pass
   ```

6. **Commit with message**:
   ```bash
   git commit -m "fix: implement 3 stability fixes with comprehensive test coverage

   - FIX #1: Enhanced stream draining (prevents truncation)
   - FIX #2: Message-stop timeout (guarantees completion)
   - FIX #3: Request logging (enables debugging)

   Tests written first per TDD approach, all 27+ tests pass"
   ```

---

## Questions?

If tests fail after implementation:
1. Check test output - it explains what's expected
2. Review comments in test file for specific failure mode
3. Compare implementation against ACTION_PLAN_STABILITY.md code examples
4. Verify all changes were saved and TypeScript compiled (npm run build)

Good luck! 🚀
