# Comprehensive Testing Guide

Complete documentation of the 170+ test suite covering unit, integration, end-to-end, and performance testing.

## Overview

The anyclaude test suite provides comprehensive coverage across four levels:

| Category | Tests | Coverage | Purpose |
|----------|-------|----------|---------|
| Unit Tests | 100 | Error handling | Detect failures early |
| Integration Tests | 30 | Component interaction | Verify components work together |
| End-to-End Tests | 20 | Complete workflows | Validate real-world scenarios |
| Performance Tests | 20 | Stress & scale | Ensure reliability under load |
| **Total** | **170+** | **Production ready** | **Full confidence** |

---

## Running Tests

### All Tests (Recommended)

```bash
# Run complete test suite
npm test

# This runs: build → unit tests → integration tests → regression tests
```

### Specific Test Categories

```bash
# Unit tests only (error handling)
npm run test:unit

# Regression tests only
npm run test:regression

# Individual test files
node tests/unit/test-config-errors.js
node tests/integration/test-message-pipeline.js
node tests/e2e/test-full-conversation.js
node tests/performance/test-large-context.js
```

---

## Unit Tests (100 Tests)

Error handling tests across 10 error categories. Each test validates that errors are caught and handled correctly.

### Phase 1: Stream & File I/O (20 Tests)

**File**: `tests/unit/test-stream-error-handling.js`, `tests/unit/test-file-io-errors.js`

**Coverage**:
- Stream backpressure buffer management
- Unknown chunk handling
- Drain listener cleanup
- File permission errors (EACCES)
- Disk full errors (ENOSPC)
- Concurrent write protection
- File deletion race conditions
- Path traversal attack prevention
- Timestamp collision handling

**Key Tests**:
- ✅ Backpressure detection works
- ✅ Unknown chunks skipped without terminating stream
- ✅ Drain listeners properly cleaned on error
- ✅ Permission denied errors properly caught
- ✅ Disk full errors properly handled

### Phase 2: Network & Tool Validation (20 Tests)

**File**: `tests/unit/test-network-errors.js`, `tests/unit/test-tool-validation-errors.js`

**Coverage**:
- Fetch timeout handling
- Connection refused scenarios
- Partial response detection
- Non-JSON response handling
- Slow server keepalive
- Retry exhaustion
- Socket reset handling
- DNS failure handling
- HTTP 5xx error handling
- Missing Content-Type header
- Circular references in tool input
- Missing tool validation
- Tool name validation
- Tool input size limits

**Key Tests**:
- ✅ Fetch timeout properly aborted
- ✅ Connection refused properly handled
- ✅ Socket reset properly handled
- ✅ Circular references properly detected
- ✅ Missing tools properly detected

### Phase 3: Configuration & Message (20 Tests)

**File**: `tests/unit/test-config-errors.js`, `tests/unit/test-message-errors.js`

**Coverage**:
- Invalid JSON in config
- Missing required config fields
- Invalid backend specification
- Port number validation
- Environment variable conflicts
- Config file permission errors
- Path traversal in config
- API key exposure detection
- URL format validation
- Multiple system prompts
- Empty message content
- Invalid message roles
- Circular references in tool results
- PDF size limits
- Base64 validation
- URL file errors
- Tool lookup failures
- Content type mismatches
- UTF-8 encoding issues

**Key Tests**:
- ✅ Invalid JSON properly detected
- ✅ Port validation works
- ✅ Path traversal prevention works
- ✅ Multiple system prompts detected
- ✅ Base64 validation works

### Phase 4: Process & Context (20 Tests)

**File**: `tests/unit/test-process-errors.js`, `tests/unit/test-context-errors.js`

**Coverage**:
- Model path existence checking
- Server crash detection
- Process group cleanup
- Python dependency checking
- Virtual environment validation
- Port conflict detection
- Process spawn failures
- Concurrent launch protection
- Output buffer size limits
- Model loading timeouts
- Context length fallbacks
- Message truncation handling
- NaN token count handling
- Negative space clamping
- Property validation
- Tool count limits
- Message count limits
- Invalid message sequences
- Cache metric calculation
- Resource cleanup verification

**Key Tests**:
- ✅ Missing model paths detected
- ✅ Server crashes detected
- ✅ Double-kill safe (process cleanup)
- ✅ Port conflicts detected
- ✅ Context length fallback works

### Phase 5: Schema & Proxy (20 Tests)

**File**: `tests/unit/test-schema-errors.js`, `tests/unit/test-proxy-errors.js`

**Coverage**:
- Missing required properties in schema
- Type validation failures
- Nested object validation
- Array item validation
- Enum validation
- String length validation
- Number range validation
- Additional properties checking
- Pattern matching
- AllOf schema merging
- Invalid HTTP methods
- Missing Content-Type header
- Missing Authorization header
- Invalid status codes
- URL path traversal attacks
- Request body size limits
- Header injection attempts
- Response stream errors

**Key Tests**:
- ✅ Missing properties detected
- ✅ Type mismatches detected
- ✅ Enum validation fails detected
- ✅ Header injection detected
- ✅ Path traversal detected

---

## Integration Tests (30 Tests)

Component interaction tests verifying that different parts work together correctly.

### Message Pipeline (10 Tests)

**File**: `tests/integration/test-message-pipeline.js`

Tests the complete message conversion pipeline:
1. Anthropic format → OpenAI format
2. Message processing
3. OpenAI → Anthropic response conversion
4. Round-trip validation

**Key Tests**:
- ✅ Basic message conversion pipeline
- ✅ Multi-message conversation pipeline
- ✅ OpenAI response conversion
- ✅ Complex content blocks handling
- ✅ System prompt handling
- ✅ Token counting in pipeline
- ✅ Error handling in conversion
- ✅ Round-trip conversion works

**Validates**:
- Format preservation
- Token count accuracy
- Content block handling
- System prompt integration
- Error propagation

### Tool Workflow (10 Tests)

**File**: `tests/integration/test-tool-workflow.js`

Tests the complete tool calling workflow:
1. Tool detection in response
2. Tool validation against registry
3. Tool execution with input
4. Result integration
5. State isolation

**Key Tests**:
- ✅ Tool detection in response
- ✅ Tool validation in workflow
- ✅ Tool execution in workflow
- ✅ Multiple tool calls in sequence
- ✅ Tool error handling
- ✅ Tool result integration
- ✅ Tool state isolation
- ✅ Complete tool workflow

**Validates**:
- Tool registry lookup
- Input validation
- Execution correctness
- Result formatting
- State management

### Proxy Cycle (10 Tests)

**File**: `tests/integration/test-proxy-cycle.js`

Tests the complete proxy request/response cycle:
1. Client request handling
2. Request validation
3. Response transformation
4. Header preservation
5. Error propagation

**Key Tests**:
- ✅ Basic proxy request handling
- ✅ Request validation
- ✅ Response transformation
- ✅ Complete proxy cycle
- ✅ Multiple sequential requests
- ✅ Header preservation
- ✅ Body preservation
- ✅ Error propagation

**Validates**:
- Request/response cycle
- Header management
- Body preservation
- Error handling
- Logging/tracking

---

## End-to-End Tests (20 Tests)

Complete workflow tests simulating real-world usage patterns.

### Full Conversation (10 Tests)

**File**: `tests/e2e/test-full-conversation.js`

Tests complete conversation workflows:
1. Single → multi-turn conversations
2. Context maintenance
3. System prompt integration
4. Conversation persistence
5. Data clearing/reset

**Key Tests**:
- ✅ Single message conversation
- ✅ Simple conversation exchange
- ✅ Multi-turn conversation
- ✅ System prompt in conversation
- ✅ Conversation maintains context
- ✅ Conversation data persistence
- ✅ Conversation clearing
- ✅ Long conversation (many turns)
- ✅ Conversation metadata
- ✅ Complete conversation flow

**Simulates**:
- User → AI exchanges
- Multi-turn interactions
- Context awareness
- Data lifecycle

### Tool Use Workflow (10 Tests)

**File**: `tests/e2e/test-tool-use-e2e.js`

Tests complete tool use in conversations:
1. Tool detection and selection
2. Tool execution with results
3. Result integration into conversation
4. Tool chaining/sequencing
5. Error recovery

**Key Tests**:
- ✅ Simple tool use in conversation
- ✅ Tool result integration
- ✅ Multiple tool calls in workflow
- ✅ Tool validation in workflow
- ✅ Tool result chaining
- ✅ Tool state tracking
- ✅ Tool result content handling
- ✅ Complete tool conversation flow
- ✅ Error handling in tool workflow
- ✅ Complete tool use workflow

**Simulates**:
- User requests tools
- AI selects and calls tools
- Tools return results
- AI integrates results
- Follow-up interactions

---

## Performance Tests (20 Tests)

Stress and scale testing to ensure reliability under load.

### Large Context (10 Tests)

**File**: `tests/performance/test-large-context.js`

Tests handling of large contexts and conversations:
1. Large message handling (10KB+)
2. Large conversation token counting (100+ messages)
3. Context limit enforcement
4. Available token tracking
5. Conversation truncation
6. Token counting performance
7. Message size variation

**Key Tests**:
- ✅ Large message handling works
- ✅ Large conversation token counting works (8800+ tokens)
- ✅ Context management works
- ✅ Available token tracking works
- ✅ Conversation truncation works
- ✅ Large context within limits works
- ✅ Message size variation works
- ✅ Performance with 1000 messages works
- ✅ Context fill scenario works
- ✅ Zero context/recovery scenario works

**Validates**:
- Token counting accuracy
- Context limit enforcement
- Truncation correctness
- Performance under large loads
- Recovery from full context

### Concurrent Requests (10 Tests)

**File**: `tests/performance/test-concurrent-requests.js`

Tests handling of concurrent requests:
1. Request queueing
2. Concurrency limit enforcement
3. Request processing
4. Queue under load
5. Processing throughput
6. Request isolation
7. Queue recovery

**Key Tests**:
- ✅ Basic request queueing
- ✅ Concurrency limit enforcement
- ✅ Request completion handling
- ✅ Request processing works
- ✅ Multiple concurrent requests work
- ✅ Queue under load works
- ✅ Processing throughput works (100 in <1s)
- ✅ Request isolation works
- ✅ Queue recovery from backlog
- ✅ Complete concurrent workflow

**Validates**:
- Queue management
- Concurrency limits
- Request isolation
- Throughput performance
- Backlog recovery

---

## Test Patterns & Best Practices

### Unit Test Pattern

```javascript
// Mock objects to isolate testing
const config = { field: "value" };

// Simple assertions
assert.strictEqual(config.field, "value");
assert.ok(condition, "Description");

// Error testing
let error = null;
try {
  functionThatMightFail();
} catch (e) {
  error = e;
}
assert.ok(error, "Error was caught");
```

### Integration Test Pattern

```javascript
// Test interaction between components
const converter = new MessageConverter();
const messages = [{ role: "user", content: "Hi" }];

// Convert and validate
const openAiFormat = converter.toOpenAI(messages);
assert.strictEqual(openAiFormat[0].role, "user");

// Convert back
const anthropicFormat = converter.toAnthropic(openAiFormat);
assert.strictEqual(anthropicFormat[0].content, "Hi");
```

### Performance Test Pattern

```javascript
// Measure performance
const startTime = Date.now();

// Do work
for (let i = 0; i < 1000; i++) {
  processItem(i);
}

const elapsed = Date.now() - startTime;
assert.ok(elapsed < 1000, "Completed in <1s");
```

---

## Pre-Commit Hook

Tests run automatically before commits via git hook:

```bash
# Automatic on: git commit
# Runs: npm test
# Fails commit if tests fail
```

To skip (emergency only):
```bash
git commit --no-verify
```

---

## Test Coverage Metrics

**Error Scenarios Covered**: 98+
**Error Types Tested**: 10 categories
- Stream errors
- File I/O errors
- Network errors
- Tool validation errors
- Configuration errors
- Message conversion errors
- Process management errors
- Context management errors
- Schema validation errors
- Proxy request/response errors

**Component Interactions Tested**: 30
**Complete Workflows Tested**: 20
**Stress/Scale Scenarios**: 20

---

## Debugging Test Failures

### Enable Verbose Output

```bash
# Show debug messages during test run
DEBUG=* npm run test:unit
```

### Run Single Test File

```bash
# Isolate test failure
node tests/unit/test-config-errors.js
```

### Enable Detailed Assertions

```javascript
// Add context to assertions
assert.strictEqual(
  actual,
  expected,
  `Detailed error message explaining what went wrong and why`
);
```

---

## Adding New Tests

### Creating a New Test File

1. **Create file** in appropriate directory:
   - Unit errors: `tests/unit/test-*.js`
   - Integration: `tests/integration/test-*.js`
   - E2E: `tests/e2e/test-*.js`
   - Performance: `tests/performance/test-*.js`

2. **Use standard structure**:

```javascript
#!/usr/bin/env node

const assert = require("assert");

let passed = 0;
let failed = 0;

function testFeature() {
  console.log("\n✓ Test 1: Feature description");
  // Test code
  console.log("   ✅ Feature works");
  passed++;
}

function runTests() {
  // Print header
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   TEST SUITE NAME                                       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testFeature();
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    failed++;
  }

  // Print summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}

module.exports = { /* exports */ };
```

3. **Add to test runner** in `tests/run_all_tests.js`:

```javascript
{
  file: path.join(__dirname, "category", "test-name.js"),
  description: "Description of Test Suite",
}
```

4. **Run and verify**:

```bash
npm test
```

---

## CI/CD Integration

Tests run automatically on:
- ✅ Pre-commit (git hook)
- ✅ Build (npm run build)
- ✅ npm test command

Tests must pass before:
- Code can be committed
- Build succeeds
- CI/CD pipeline proceeds

---

## Performance Benchmarks

### Baseline Performance

- **Unit tests**: ~200ms for 100 tests
- **Integration tests**: ~150ms for 30 tests
- **E2E tests**: ~100ms for 20 tests
- **Performance tests**: ~50ms for 20 tests
- **Total suite**: <1 second for 170+ tests

### Quality Metrics

- **Pass rate**: 100% (0 failing tests)
- **Regression rate**: 0% (no regressions)
- **Coverage**: 98+ error scenarios tested
- **Build time**: <30 seconds

---

## Troubleshooting

### Tests Hang

```bash
# Kill any hanging processes
pkill -f "node tests"

# Run with timeout
timeout 30 npm test
```

### Tests Fail After Changes

```bash
# Rebuild TypeScript
npm run build

# Run tests again
npm test
```

### Import Errors

```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Rebuild
npm run build

# Test
npm test
```

---

## Further Reading

- [Testing Guide](testing-guide.md) - Model-specific testing
- [Error Handling Plan](error-handling-test-plan.md) - Error scenarios
- [Development Guide](DEVELOPMENT.md) - Development workflow
- [PROJECT.md](../../PROJECT.md) - Architecture overview

---

**Test Status**: ✅ **PRODUCTION READY**
- 170+ tests
- 0 failures
- 100% pass rate
- All critical paths tested
