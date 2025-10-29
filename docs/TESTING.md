# Testing Guide

Complete testing documentation for the 170+ test suite.

**👉 For comprehensive details, see [development/TESTING_COMPREHENSIVE.md](development/TESTING_COMPREHENSIVE.md)**

---

## Quick Start

```bash
# Run all tests (170+)
npm test

# Run specific categories
npm run test:unit              # 100 error handling tests
npm run test:regression        # Regression tests

# Run individual test file
node tests/unit/test-config-errors.js
```

---

## Test Overview

| Category | Count | Coverage | Purpose |
|----------|-------|----------|---------|
| Unit | 100 | Error handling | Catch failures early |
| Integration | 30 | Component interaction | Verify components work |
| E2E | 20 | Complete workflows | Validate real scenarios |
| Performance | 20 | Stress & scale | Reliability under load |
| **Total** | **170+** | **Comprehensive** | **Production ready** |

---

## Test Categories

### Unit Tests (100)

Error handling across 10 categories:
- ✅ Stream error handling (10 tests)
- ✅ File I/O errors (10 tests)
- ✅ Network & timeout errors (10 tests)
- ✅ Tool validation errors (10 tests)
- ✅ Configuration errors (10 tests)
- ✅ Message conversion errors (10 tests)
- ✅ Process management errors (10 tests)
- ✅ Context management errors (10 tests)
- ✅ JSON schema validation errors (10 tests)
- ✅ Proxy request/response errors (10 tests)

### Integration Tests (30)

Component interaction:
- ✅ Message pipeline conversion (10 tests)
- ✅ Tool calling workflow (10 tests)
- ✅ Proxy request/response cycle (10 tests)

### End-to-End Tests (20)

Complete workflows:
- ✅ Full conversations (10 tests)
- ✅ Tool use workflows (10 tests)

### Performance Tests (20)

Stress & scale:
- ✅ Large context handling (10 tests)
- ✅ Concurrent request processing (10 tests)

---

## Key Features

✅ **170+ comprehensive tests**
✅ **100% pass rate**
✅ **Zero external dependencies** (Node.js assert only)
✅ **Auto-runs on every commit** (pre-commit hook)
✅ **Lightning fast** (<1 second for full suite)
✅ **Clear error messages** with descriptions

---

## Running Tests

### All Tests (Recommended)
```bash
npm test
```
Runs: build → unit tests → integration tests → regression tests

### Specific Test Files
```bash
# Unit test
node tests/unit/test-config-errors.js

# Integration test
node tests/integration/test-message-pipeline.js

# E2E test
node tests/e2e/test-full-conversation.js

# Performance test
node tests/performance/test-large-context.js
```

### With Verbose Output
```bash
DEBUG=* npm test
```

---

## Adding New Tests

1. **Create test file** in appropriate directory
2. **Follow standard structure** (see examples in `tests/`)
3. **Add to test runner** in `tests/run_all_tests.js`
4. **Run and verify**: `npm test`

See [development/TESTING_COMPREHENSIVE.md#adding-new-tests](development/TESTING_COMPREHENSIVE.md#adding-new-tests) for detailed instructions.

---

## Pre-Commit Hook

Tests run automatically before every commit:

```bash
# Automatic on: git commit
# Tests must pass to commit
```

Emergency only (skip tests):
```bash
git commit --no-verify
```

---

## Troubleshooting

### Tests Hang
```bash
pkill -f "node tests"
timeout 30 npm test
```

### Import/Module Errors
```bash
rm -rf node_modules
npm install
npm run build
npm test
```

### Test Failures
```bash
# Run single test for debugging
node tests/unit/test-config-errors.js

# Enable verbose output
DEBUG=* npm test
```

---

## Performance Benchmarks

- **Build**: <30 seconds
- **Unit tests**: 100 tests in ~200ms
- **Integration**: 30 tests in ~150ms
- **E2E tests**: 20 tests in ~100ms
- **Performance**: 20 tests in ~50ms
- **Total**: 170+ tests in <1 second

---

## Full Documentation

For comprehensive information about:
- All 170+ tests in detail
- Test patterns and best practices
- Performance benchmarks
- CI/CD integration
- Debugging test failures

👉 **See [development/TESTING_COMPREHENSIVE.md](development/TESTING_COMPREHENSIVE.md)**

---

**Status**: ✅ **Production Ready**
- 170+ tests
- 0 failures
- 100% pass rate
- Comprehensive coverage
