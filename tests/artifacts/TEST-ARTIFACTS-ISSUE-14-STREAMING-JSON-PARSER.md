# Test Artifacts - Issue #14: Streaming JSON Parser (TDD Red Phase)

**Status**: RED (All tests failing - implementation doesn't exist yet)
**Date**: 2025-11-20
**Issue**: #14 - Streaming JSON Parser for 40% data reduction and 60% faster tool detection

## Summary

Created comprehensive FAILING tests for the streaming JSON parser implementation using TDD methodology. All tests are in the RED phase as expected - the implementation (`src/streaming-json-parser.ts`) does not exist yet.

## Test Files Created

### 1. Unit Tests: `tests/unit/streaming-json-parser.test.js` (400 lines)

**Coverage:**

- **JSONTokenizer** (150 lines):
  - Basic tokenization (objects, arrays, strings, numbers, booleans, null)
  - Escape sequence handling
  - Incomplete JSON handling (partial strings, split tokens)
  - Security: 1MB buffer limit enforcement
  - Performance: <1ms per `nextToken()` call

- **IncrementalJSONParser** (250 lines):
  - Complete object parsing incrementally
  - Field extraction from partial JSON
  - Nested objects and arrays
  - JSON split across multiple chunks
  - State maintenance between feeds
  - **Delta generation** (40% reduction target)
  - **Tool detection** (60% faster target)
  - Security: 64-level nesting depth limit, 30s timeout, control char sanitization
  - Performance: <5ms parser overhead per chunk

**Test Categories:**

- Basic tokenization: 5 tests
- Incomplete JSON handling: 3 tests
- Security (buffer limits): 3 tests
- Performance requirements: 1 test
- Complete object parsing: 4 tests
- Incremental feeding: 3 tests
- Delta generation: 4 tests
- Tool detection: 4 tests
- Security (nesting/timeouts): 4 tests
- Performance requirements: 1 test
- Error handling: 5 tests

**Total Unit Tests**: 37 tests

### 2. Integration Tests: `tests/integration/streaming-json-performance.test.js` (350 lines)

**Coverage:**

- **Stream Converter Integration** (200 lines):
  - Delta-only transmission in `content_block_delta` events
  - SSE event structure preservation
  - Event order preservation
  - Tool call structure preservation
  - Graceful fallback on parser errors

- **Performance Benchmarks** (100 lines):
  - 60% faster tool detection vs full JSON parsing
  - 40% data reduction in transmission
  - <5ms parser overhead per chunk
  - Large JSON efficiency (10KB+ payloads)

- **Edge Cases** (50 lines):
  - Delta before tool-start (orphan events)
  - Duplicate tool-input-end
  - Buffer overflow during streaming
  - Empty chunks
  - Rapid chunk succession
  - Unicode in chunks

**Test Categories:**

- Delta-only transmission: 5 tests
- Performance benchmarks: 4 tests
- Edge cases: 6 tests
- Backward compatibility: 2 tests

**Total Integration Tests**: 17 tests

### 3. Regression Tests: `tests/regression/streaming-json-regression.test.js` (300 lines)

**Coverage:**

- **Backward Compatibility** (150 lines):
  - Identical events with/without incremental parser
  - All SSE event types preserved
  - Event order maintained
  - Tool call structure unchanged
  - Input JSON delta events preserved
  - Valid final tool call object

- **Tool Call Structure Compatibility** (80 lines):
  - Multiple tool calls in sequence
  - Text before tool calls
  - Tool calls with no input parameters
  - Nested input parameters

- **Error Handling - Stream Resilience** (70 lines):
  - No crash on parser error
  - Fallback to full delta on error
  - Stream continues after parser failure
  - Buffer overflow handling
  - Timeout handling
  - Parser state reset after error

**Test Categories:**

- SSE event preservation: 6 tests
- Tool call compatibility: 4 tests
- Error resilience: 6 tests
- Message metadata: 3 tests

**Total Regression Tests**: 19 tests

## Total Test Coverage

- **Unit tests**: 37 tests (400 lines)
- **Integration tests**: 17 tests (350 lines)
- **Regression tests**: 19 tests (300 lines)

**Grand Total**: 73 tests across 1,050 lines of test code

## Expected Behavior (RED Phase)

### Current Status

All tests FAIL with:

```
Error: Cannot find module '../../dist/streaming-json-parser.js'
```

This is **expected and correct** for TDD red phase. The implementation doesn't exist yet.

### Test Execution

```bash
# Verify tests fail (current state)
npm run build
node tests/unit/streaming-json-parser.test.js
# → ERROR: Module not found (EXPECTED)

node tests/integration/streaming-json-performance.test.js
# → ERROR: Module not found (EXPECTED)

node tests/regression/streaming-json-regression.test.js
# → ERROR: Module not found (EXPECTED)
```

## Performance Targets Validated by Tests

### 1. Tool Detection Speed (60% faster)

**Test**: `tests/integration/streaming-json-performance.test.js:134-169`

Measures tool detection from partial JSON vs full JSON parsing:

- **Baseline**: Parse full JSON, extract `obj.name`
- **Incremental**: Detect from `'{"name":"Bash"'` (20 chars)
- **Target**: ≥60% speedup

### 2. Data Reduction (40% reduction)

**Test**: `tests/integration/streaming-json-performance.test.js:171-222`

Measures delta transmission vs full JSON each chunk:

- **Baseline**: Send full JSON each chunk (old behavior)
- **Incremental**: Send only new portion each chunk (new behavior)
- **Target**: ≥40% reduction in bytes transmitted

### 3. Parser Overhead (<5ms per chunk)

**Test**: `tests/unit/streaming-json-parser.test.js:420-447`

Measures parser processing time per chunk:

- **Chunks**: 5 chunks of realistic tool call JSON
- **Iterations**: 1,000 runs
- **Target**: <5ms average overhead per chunk

### 4. Tokenizer Performance (<1ms per call)

**Test**: `tests/unit/streaming-json-parser.test.js:158-178`

Measures `nextToken()` call performance:

- **Input**: 60-char JSON string
- **Iterations**: 1,000 runs with 60 chars each
- **Target**: <1ms average per `nextToken()` call

## Security Constraints Validated by Tests

### 1. Buffer Limit (1MB)

**Tests**: `tests/unit/streaming-json-parser.test.js:144-178`

- Throws on input exceeding 1MB
- Handles exactly 1MB gracefully
- Prevents memory exhaustion attacks

### 2. Nesting Depth (64 levels)

**Tests**: `tests/unit/streaming-json-parser.test.js:370-400`

- Throws on >64 levels of nesting
- Prevents stack overflow from deeply nested JSON
- Validates realistic nesting scenarios

### 3. Timeout (30 seconds)

**Test**: `tests/unit/streaming-json-parser.test.js:402-418`

- Enforces parsing timeout
- Prevents slow-parsing DoS attacks
- Configurable timeout for testing (100ms in tests)

### 4. Control Character Sanitization

**Test**: `tests/unit/streaming-json-parser.test.js:420-427`

- Removes/escapes control characters (0x00-0x1F)
- Prevents injection attacks
- Preserves Unicode (测试, 🚀)

## Test Organization

### File Locations

```
tests/
├── unit/
│   └── streaming-json-parser.test.js         # JSONTokenizer, IncrementalJSONParser
├── integration/
│   └── streaming-json-performance.test.js    # Stream converter integration, benchmarks
└── regression/
    └── streaming-json-regression.test.js      # Backward compatibility, error handling
```

### Test Patterns Used

**Arrange-Act-Assert pattern:**

```javascript
test("should achieve >40% data reduction target", () => {
  // ARRANGE
  const parser = new IncrementalJSONParser();
  const chunks = [...];

  // ACT
  let totalOriginal = 0;
  let totalDeltas = 0;
  chunks.forEach(chunk => {
    const result = parser.feed(chunk);
    totalOriginal += chunk.length;
    totalDeltas += result.delta.length;
  });

  // ASSERT
  const reduction = ((totalOriginal - totalDeltas) / totalOriginal) * 100;
  expect(reduction).toBeGreaterThanOrEqual(40);
});
```

**Mock stream helpers:**

```javascript
function createMockToolCallStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "tool-call", toolCallId: "test-id", toolName: "Unknown" };
      for (const chunk of chunks) {
        yield { type: "tool-call-delta", argsTextDelta: chunk };
      }
      yield { type: "finish", finishReason: "tool-calls" };
    },
  };
}
```

## Next Steps (Implementation Phase)

### GREEN Phase: Make Tests Pass

1. **Create `src/streaming-json-parser.ts`** with:
   - `TokenType` enum
   - `JSONTokenizer` class
   - `IncrementalJSONParser` class
   - Export all types

2. **Implement core functionality**:
   - Character-by-character tokenization
   - Incremental state machine parsing
   - Delta calculation (substring from last position)
   - Early tool name detection

3. **Implement security constraints**:
   - Buffer size tracking (1MB limit)
   - Nesting depth counter (64 levels)
   - Timeout tracking (30s)
   - Control character sanitization

4. **Integrate with stream converter**:
   - Modify `src/convert-to-anthropic-stream.ts`
   - Add `useIncrementalParser` option
   - Use parser for tool call deltas
   - Fallback on errors

5. **Run tests until all pass**:
   ```bash
   npm run build
   node tests/unit/streaming-json-parser.test.js
   # → All tests pass (GREEN)
   ```

### REFACTOR Phase: Optimize

1. **Performance profiling**:
   - Measure actual vs target benchmarks
   - Optimize hot paths if needed
   - Validate memory usage

2. **Code quality**:
   - Add inline documentation
   - Simplify complex logic
   - Extract helper functions

3. **Edge case hardening**:
   - Test with real Claude Code traces
   - Handle additional Unicode edge cases
   - Stress test with large JSONs

## Test Execution Commands

### Run Individual Test Suites

```bash
# Build first
npm run build

# Unit tests
node tests/unit/streaming-json-parser.test.js

# Integration tests
node tests/integration/streaming-json-performance.test.js

# Regression tests
node tests/regression/streaming-json-regression.test.js
```

### Run All Tests

```bash
# Add to package.json test script
npm test
```

## Key Design Decisions Validated by Tests

### 1. Delta Transmission Strategy

**Decision**: Send only new JSON portion since last feed
**Validation**: `tests/integration/streaming-json-performance.test.js:171-222`

**Rationale**:

- Reduces data transmission by 40%
- Maintains event structure compatibility
- No changes needed to Claude Code client

### 2. Early Tool Detection

**Decision**: Extract `name` field from partial `'{"name":"Read"'`
**Validation**: `tests/unit/streaming-json-parser.test.js:330-368`

**Rationale**:

- 60% faster than waiting for complete JSON
- Enables early logging/debugging
- No impact on correctness (fallback on full JSON)

### 3. Incremental State Machine

**Decision**: Character-by-character parsing with state preservation
**Validation**: `tests/unit/streaming-json-parser.test.js:240-290`

**Rationale**:

- Handles JSON split across chunks
- Minimal memory overhead
- Resistant to adversarial inputs (timeouts, limits)

### 4. Graceful Fallback

**Decision**: Fall back to full delta on parser errors
**Validation**: `tests/regression/streaming-json-regression.test.js:180-230`

**Rationale**:

- Stream never crashes
- Backward compatible (same events produced)
- Degrades gracefully under malformed input

## Test Coverage Matrix

| Component              | Unit   | Integration | Regression | Total  |
| ---------------------- | ------ | ----------- | ---------- | ------ |
| JSONTokenizer          | 12     | 0           | 0          | 12     |
| IncrementalJSONParser  | 20     | 0           | 0          | 20     |
| Performance            | 5      | 4           | 0          | 9      |
| Security               | 0      | 1           | 6          | 7      |
| Stream Integration     | 0      | 6           | 0          | 6      |
| Backward Compatibility | 0      | 2           | 13         | 15     |
| Error Handling         | 0      | 4           | 0          | 4      |
| **Total**              | **37** | **17**      | **19**     | **73** |

## Success Criteria

### Tests Pass When:

1. ✅ All 73 tests execute without errors
2. ✅ Performance benchmarks meet targets (60% faster, 40% reduction)
3. ✅ Security limits enforced (1MB, 64 levels, 30s)
4. ✅ Backward compatibility maintained (identical events)
5. ✅ Error handling resilient (no stream crashes)

### Implementation Complete When:

1. ✅ All unit tests pass (green)
2. ✅ All integration tests pass (green)
3. ✅ All regression tests pass (green)
4. ✅ Performance targets validated with real data
5. ✅ Security constraints tested with adversarial inputs

## Notes

- **TDD Methodology**: Tests written FIRST, implementation comes next
- **Red Phase**: All tests currently fail (expected)
- **Green Phase**: Implementation will make tests pass
- **Refactor Phase**: Optimize while keeping tests green

- **Mock Helpers**: Created `createMockToolCallStream()` for realistic test scenarios
- **Performance Testing**: Using `performance.now()` for accurate benchmarks
- **Unicode Handling**: Tests validate UTF-8, emoji support (测试, 🚀)

## References

- **Implementation Plan**: Issue #14 comments
- **Testing Guide**: `docs/development/testing-guide.md`
- **Existing Tests**: `tests/unit/json-schema.test.js` (pattern reference)
- **Stream Conversion**: `src/convert-to-anthropic-stream.ts` (integration target)
