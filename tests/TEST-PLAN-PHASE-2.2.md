# Test Plan: Phase 2.2 - Cache_Control Headers Integration

**Phase**: 2.2
**Feature**: Integrate cache_control headers (Proxy ↔ Backend)
**Test Master**: test-master agent (TDD Red Phase)
**Status**: Tests Written and Ready for Implementation
**Date**: 2025-11-17

## Test Strategy Overview

This test plan implements **Test-Driven Development (TDD)** methodology:

1. **Red Phase (CURRENT)**: Write tests that fail initially
2. **Green Phase (Next)**: Implement code to make tests pass
3. **Refactor Phase (Final)**: Optimize and clean up

Current status: **RED PHASE COMPLETE** - All tests written and ready for implementation.

## Test Scope

### What We Test
- Cache marker extraction from Anthropic messages
- SHA256 hash generation for cache keys
- Token estimation for cache metrics
- HTTP header generation (X-Cache-*)
- End-to-end cache flow through proxy

### What We Don't Test (Out of Scope)
- Actual cache backend operations
- Network latency impacts
- Database performance
- Authentication logic
- Model-specific behavior

## Test Pyramid

```
        / \
       /   \  Integration Tests (2 files, 23 tests)
      /-----\  - Header formatting
     /       \ - Request/response validation
    /         \
   /-----------\
  /   Unit Tests (3 files, 61 tests)
 / - Hash generation
/_- Marker extraction
- Token estimation
```

**Total: 84 tests across 5 files**

## Test Files and Coverage

### Unit Tests (3 files, 61 tests)

#### File 1: test-cache-hash-consistency.js (17 tests)
**Purpose**: Validate SHA256 hash generation

Test Suites:
1. Hash Generation Basics (4 tests)
   - Generate valid SHA256 hash
   - Deterministic hashing
   - Different content = different hash
   - Different order = different hash

2. Hash Properties (2 tests)
   - Exactly 64 hex characters
   - Lowercase only

3. Different Input Formats (4 tests)
   - Array of text blocks
   - System as string
   - Empty arrays
   - Empty text blocks

4. Special Characters (3 tests)
   - Unicode characters
   - Special characters (quotes, newlines)
   - Unicode normalization

5. Hash Sensitivity (2 tests)
   - Single character difference
   - Whitespace difference

6. Hash Cacheability (2 tests)
   - Same hash for identical cache_control
   - Different hash if cache_control differs

**Run**: `node tests/unit/test-cache-hash-consistency.js`

#### File 2: test-cache-marker-extraction.js (14 tests)
**Purpose**: Validate cache marker extraction

Test Suites:
1. Extract System Markers (3 tests)
   - Extract markers from system
   - Identify non-cacheable system
   - Handle string format

2. Count User Blocks (3 tests)
   - Count single cacheable block
   - Count multiple blocks
   - Return 0 when no cache

3. Marker Objects (2 tests)
   - Return required fields
   - Populate cache text

4. Mixed Blocks (2 tests)
   - Mixed cacheable/non-cacheable
   - Empty requests

5. System + User (2 tests)
   - Both system and user cache
   - No cache markers

6. Assistant Messages (1 test)
   - Ignore assistant messages

7. Format Validation (1 test)
   - Only ephemeral type

**Run**: `node tests/unit/test-cache-marker-extraction.js`

#### File 3: test-token-estimation.js (30 tests)
**Purpose**: Validate token count estimation

Test Suites:
1. Basic Estimation (5 tests)
   - 4 chars = 1 token
   - 5 chars = 2 tokens
   - 12 chars = 3 tokens
   - 100 chars = 25 tokens
   - Math.ceil rounding

2. Edge Cases (6 tests)
   - Empty string = 0 tokens
   - Null handling
   - Undefined handling
   - Single character
   - Two characters
   - Three characters

3. Common Patterns (4 tests)
   - System prompt
   - Sentence
   - Paragraph
   - JSON text

4. Special Characters (4 tests)
   - Spaces
   - Newlines and tabs
   - Punctuation
   - Unicode

5. Accuracy (2 tests)
   - Within 15% for typical text
   - Reasonable for long text

6. Consistency (2 tests)
   - Same estimate for same text
   - Combine tokens correctly

7. Header Usage (2 tests)
   - Convert to string
   - Numeric for HTTP

8. Large Text (3 tests)
   - 10K characters
   - 100K characters
   - 1M characters

9. Integration (2 tests)
   - Combine system blocks
   - Combine system + user cache

**Run**: `node tests/unit/test-token-estimation.js`

### Integration Tests (2 files, 23 tests)

#### File 4: test-cache-headers.js (23 tests)
**Purpose**: Validate HTTP header generation

Test Suites:
1. Header Generation (3 tests)
   - X-Cache-Hash (SHA256)
   - X-Cache-Tokens (numeric)
   - X-Cache-System (base64)

2. Format Validation (4 tests)
   - Hash is 64 hex chars
   - Hash rejects invalid
   - Tokens are numeric string
   - System is valid base64

3. Header Presence (3 tests)
   - Headers when cache_control present
   - Headers omitted when absent
   - Only ephemeral type

4. Multiple Blocks (3 tests)
   - Combine system blocks
   - Include user blocks
   - Hash both system and user

5. Consistency (3 tests)
   - Same hash for same content
   - Different hash for different
   - Same tokens for same text

6. Encoding Safety (3 tests)
   - Special characters
   - Unicode characters
   - Very long content

7. Real-World Examples (2 tests)
   - Typical Claude prompt
   - Consistent across systems

8. Missing Headers (2 tests)
   - Omit when no cache_control
   - Omit for empty request

**Run**: `node tests/integration/test-cache-headers.js`

#### File 5: test-cache-e2e.js (Structure Complete)
**Purpose**: End-to-end cache flow validation

Test Suites:
1. Request Acceptance (2 tests)
   - Accept request with cache markers
   - Return valid Anthropic format

2. Cache Metrics (2 tests)
   - Include cache fields in usage
   - Differentiate creation vs hits

3. Header Generation (2 tests)
   - Generate X-Cache-Hash
   - Omit for non-cacheable

4. Token Counting (2 tests)
   - Count input tokens
   - Track cache creation tokens

5. Format Validation (2 tests)
   - Handle array system
   - Handle mixed blocks

6. Multiple Requests (2 tests)
   - Maintain cache state
   - Different cache for different msgs

7. Response Format (2 tests)
   - Content blocks in format
   - Stop reason included

8. Cache Consistency (2 tests)
   - Consistent hash for identical
   - Different hash for different

9. Error Handling (2 tests)
   - Handle malformed requests
   - Preserve all fields

**Run**: `PROXY_ONLY=true bun run src/main.ts` then `node tests/integration/test-cache-e2e.js`

## Test Execution

### Quick Run (Unit Tests Only)
```bash
node tests/unit/test-cache-hash-consistency.js
node tests/unit/test-cache-marker-extraction.js
node tests/unit/test-token-estimation.js
```

**Expected Result**: 61 tests, 61 passed

### Integration Tests
```bash
node tests/integration/test-cache-headers.js
```

**Expected Result**: 23 tests, 23 passed

### Full Test Suite (E2E requires backend)
```bash
# Terminal 1: Start proxy
PROXY_ONLY=true bun run src/main.ts

# Terminal 2: Run E2E tests
node tests/integration/test-cache-e2e.js
```

### Batch Execution
```bash
#!/bin/bash
echo "Running cache header tests..."
node tests/unit/test-cache-hash-consistency.js || exit 1
node tests/unit/test-cache-marker-extraction.js || exit 1
node tests/unit/test-token-estimation.js || exit 1
node tests/integration/test-cache-headers.js || exit 1
echo "All tests passed!"
```

## Test Data

### Sample Request (with cache_control)
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 100,
  "system": [
    {
      "type": "text",
      "text": "You are Claude, an AI assistant.",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Hello",
          "cache_control": { "type": "ephemeral" }
        }
      ]
    }
  ]
}
```

### Sample Headers (to be generated)
```http
X-Cache-Hash: a3f5d2e1c9b8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3
X-Cache-Tokens: 12
X-Cache-System: WW91IGFyZSBDbGF1ZGUsIGFuIEFJIGFzc2lzdGFudC4=
```

### Sample Response (with cache metrics)
```json
{
  "id": "msg_1234567890abcdef",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Hello! How can I help you today?" }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 50,
    "output_tokens": 10,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 50
  }
}
```

## Success Criteria

### Pass Criteria
- [x] All 84 tests compile without errors
- [x] All 84 tests execute successfully
- [x] All 84 tests currently pass (pre-implementation)
- [x] Each test follows Arrange-Act-Assert pattern
- [x] Test names clearly describe what is tested
- [x] Tests use mock implementations

### Implementation Success
- [ ] All unit tests pass without modification
- [ ] All integration tests pass without modification
- [ ] No additional tests needed
- [ ] All code paths covered by tests
- [ ] Cache hit rate >80% in real workload

## Known Limitations

### Pre-Implementation
- Tests use mock functions (real module doesn't exist yet)
- E2E tests require running proxy + backend
- No actual network testing
- No performance benchmarking

### By Design
- Tests don't validate cache database
- Tests don't test model-specific behavior
- Tests don't validate authentication
- Tests don't test error recovery

## Next Phase: Implementation

### Phase Breakdown
1. **Phase 1**: Implement cache-control-extractor module
   - generateCacheHash() function
   - extractMarkers() function
   - estimateTokens() function

2. **Phase 2**: Integrate with proxy
   - Modify anthropic-proxy.ts
   - Add header generation logic
   - Pass headers to backend

3. **Phase 3**: Backend integration
   - Modify mlx-server.py
   - Parse cache headers
   - Return Anthropic metrics

4. **Phase 4**: Validation
   - Run all tests
   - Benchmark cache hits
   - Verify metrics

## Test Maintenance

### Adding New Tests
1. Create test in appropriate file
2. Follow Arrange-Act-Assert pattern
3. Add clear test name
4. Update TEST-ARTIFACTS document
5. Run all tests to verify

### Updating Tests
1. Only update if requirements change
2. Update test name if testing different thing
3. Don't change test logic without reason
4. Verify all tests still pass

### Test Cleanup
- Remove tests only if feature removed
- Archive old tests rather than delete
- Document reason for removal
- Update coverage metrics

## Related Documentation

- PROJECT.md: Architecture overview
- CLAUDE.md: Project standards
- TEST-ARTIFACTS-PHASE-2.2-CACHE-HEADERS.md: Detailed test report
- docs/development/testing-guide.md: Testing standards

## Contact & Questions

For questions about these tests:
1. Review TEST-ARTIFACTS-PHASE-2.2-CACHE-HEADERS.md
2. Check individual test file comments
3. Run tests with ANYCLAUDE_DEBUG=2 for verbose output
4. Review test data examples above

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Test Framework**: Node.js assert + custom expect
**Status**: Ready for implementation phase
