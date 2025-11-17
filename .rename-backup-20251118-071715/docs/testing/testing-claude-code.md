# Testing Claude Code Integration with anyclaude

This guide explains how to test that **real Claude Code** works correctly with the anyclaude proxy, including message format validation, cache behavior, and end-to-end integration.

## Quick Start

Run the comprehensive test suite:

```bash
# Run all tests (unit + regression + integration)
npm test

# Run just the Claude Code format tests
npm run test:integration:format

# Run just the cache validation tests
npm run test:integration:cache
```

## Test Suites Overview

### 1. Unit Tests (26 tests)

Location: `tests/unit/`

Tests core functionality in isolation:

- Trace logger
- JSON schema transformation
- Trace analyzer
- LMStudio client
- Tool calling edge cases

Run with:

```bash
npm run test:unit
```

### 2. Regression Tests (27 tests)

Location: `tests/regression/`

Tests that ensure fixes don't break:

- Stream draining (fix #1)
- Message-stop timeout (fix #2)
- Request logging (fix #3)
- Cache hash consistency
- Stream completion

Run with:

```bash
npm run test:regression
```

### 3. Integration Tests - Format Validation

Location: `tests/integration/test_claude_code_e2e.js`

**Purpose**: Validates that anyclaude handles the exact message formats Claude Code expects.

**10 Test Groups** (25 assertions):

1. **Basic Connectivity** - Proxy is reachable
2. **Message Format** - System prompts, messages, roles
3. **Tool Calling** - Tool use IDs, inputs, results
4. **Streaming Format** - SSE format, event types
5. **Error Handling** - Error response structure
6. **Cache Control** - Cache headers and metrics
7. **Request Logging** - JSONL format and fields
8. **Stream Backpressure** - Large responses, timeouts
9. **Message Round-Trip** - Content preservation
10. **Proxy Behavior** - Runtime detection

Run with:

```bash
npm run test:integration:format
```

### 4. Integration Tests - Cache Validation (UAT)

Location: `tests/integration/test_genai_cache_validation.js`

**Purpose**: User Acceptance Testing (UAT) for cache behavior and consistent GenAI results.

**8 Test Suites** (28 assertions):

#### Suite 1: Message Format Validation

- System message role and content
- User message format
- Multiple content blocks

#### Suite 2: Cache Control Validation

- Cache control headers
- Ephemeral cache type
- Cache with large system prompts

#### Suite 3: Cache Metrics Validation

- Cache creation tokens
- Cache read tokens
- Cache hit rate calculation
- Token usage breakdown

#### Suite 4: Cache Consistency

- Request sequence (miss → hit → hit)
- Cache key consistency
- Cache expiration handling

#### Suite 5: Request Logging and Metrics

- Log directory creation
- JSONL format validation
- Log entry structure
- Cache metrics aggregation

#### Suite 6: Response Consistency

- Message ID format
- Response role
- Content blocks
- Stop reason
- Usage statistics

#### Suite 7: Tool Call Validation

- Tool use ID format
- Tool names
- Tool input validation
- Tool result handling

#### Suite 8: Streaming Validation

- Event sequence
- Text delta chunks
- Text reconstruction

Run with:

```bash
npm run test:integration:cache
```

## Test Execution Flow

```
npm test
├── Build TypeScript → dist/main.js
├── Unit Tests (26)
│   ├── Trace Logger (8)
│   ├── JSON Schema (18)
│   ├── Trace Analyzer (8)
│   ├── LMStudio Client (12)
│   └── Tool Calling (5)
├── Regression Tests (27)
│   ├── Structure (1)
│   ├── Stream Completion (3)
│   ├── Cache Hash (8)
│   ├── Stream Flush (8)
│   ├── Stream Draining (8)
│   ├── Message-Stop Timeout (9)
│   └── Request Logging (10)
└── Integration Tests (53)
    ├── Format Validation (25)
    └── Cache Validation (28)

Total: 106 tests
Expected: All passing ✅
Time: ~30-60 seconds
```

## Testing With a Running Proxy

### Option 1: Quick Format Check (No Proxy Needed)

```bash
npm run test:integration:format
# Tests without connecting to proxy (25 assertions pass)
```

### Option 2: Full Integration (With Proxy)

```bash
# Terminal 1: Start the proxy
PROXY_ONLY=true bun run src/main.ts

# Terminal 2: Run tests with proxy detection
ANYCLAUDE_PROXY_PORT=60877 npm run test:integration:format
```

### Option 3: Full End-to-End (With vLLM-MLX)

```bash
# Terminal 1: Start vLLM-MLX server
python3 scripts/vllm-mlx-server.py --model /path/to/model

# Terminal 2: Start the proxy
PROXY_ONLY=true bun run src/main.ts

# Terminal 3: Run integration tests
npm run test:integration:cache

# Terminal 4: Run Claude Code manually
anyclaude

# Terminal 5: Monitor cache behavior
tail -f ~/.anyclaude/request-logs/*.jsonl | jq .
```

## Reading Test Output

### Passing Test Output

```
════════════════════════════════════════════════════════════════════════════════
  GENAI CACHE VALIDATION - USER ACCEPTANCE TESTING (UAT)
════════════════════════════════════════════════════════════════════════════════

┌─ Format Validation
  │  System message role
  ├─ ✓ System message role is correct
  │  System message content structure
  ├─ ✓ System message content is properly structured
  ...

════════════════════════════════════════════════════════════════════════════════
  TEST SUMMARY
════════════════════════════════════════════════════════════════════════════════
  Passed: 28
  Failed: 0
════════════════════════════════════════════════════════════════════════════════

✅ ALL TESTS PASSED - GENAI INTEGRATION VALIDATED
```

### Interpreting Results

- ✓ = Test passed
- ✗ = Test failed
- ℹ = Informational (expected, not a failure)

## Test Coverage

### Message Formats ✅

- [x] System prompts with cache control
- [x] User/assistant messages
- [x] Multiple content blocks
- [x] Tool use and tool results
- [x] Error responses

### Cache Behavior ✅

- [x] Cache control headers
- [x] Cache metrics collection
- [x] Cache hit rate tracking
- [x] Token usage breakdown
- [x] Cache consistency across requests

### Streaming ✅

- [x] Server-Sent Events (SSE) format
- [x] Event sequencing
- [x] Text delta chunks
- [x] Message deltas
- [x] Stream completion

### Request Logging ✅

- [x] JSONL format
- [x] Request metadata
- [x] Cache metrics
- [x] Response metrics
- [x] Error tracking

## Validating Real Claude Code Behavior

To verify Claude Code works correctly end-to-end:

### 1. Check Logs While Running Claude Code

```bash
# Monitor request logs in real-time
tail -f ~/.anyclaude/request-logs/*.jsonl | jq '.'

# Or with filtering
tail -f ~/.anyclaude/request-logs/*.jsonl | \
  jq 'select(.cache_read_input_tokens > 0) | .'
```

### 2. Verify Cache Hits

```bash
# Count cache hits vs misses
jq -s '
  {
    total: length,
    cache_hits: map(select(.cache_read_input_tokens > 0) | 1) | add // 0,
    cache_misses: map(select(.cache_creation_input_tokens > 0) | 1) | add // 0,
    hit_rate: ((map(select(.cache_read_input_tokens > 0) | 1) | add // 0) / length * 100)
  }
' ~/.anyclaude/request-logs/2025-10-30.jsonl
```

Output:

```json
{
  "total": 42,
  "cache_hits": 28,
  "cache_misses": 14,
  "hit_rate": 66.66666666666666
}
```

### 3. Verify Message Format Consistency

```bash
# Check that all requests have required fields
jq -s 'map(
  if .timestamp and .systemSize != null and .toolCount != null then
    "valid"
  else
    "invalid: " + (.timestamp // "missing timestamp") + " " +
              ((.systemSize // "missing systemSize")) + " " +
              ((.toolCount // "missing toolCount"))
  end
) | unique' ~/.anyclaude/request-logs/*.jsonl
```

### 4. Test Tool Calling

In Claude Code, try using tools:

```
> Create a file called test.txt with content "hello"
```

Claude Code will:

1. Ask to use the file_create tool
2. Send tool result back to model
3. The request will be logged with tool metrics

Check logs:

```bash
jq 'select(.toolCount > 0)' ~/.anyclaude/request-logs/*.jsonl | head -1
```

## Debugging Failed Tests

### Test: "Connection error"

This is expected if the proxy isn't running. The test gracefully handles this.

To run with proxy:

```bash
PROXY_ONLY=true bun run src/main.ts &
sleep 2
ANYCLAUDE_PROXY_PORT=60877 npm run test:integration:format
```

### Test: Cache metrics mismatch

The test expects cache hits from repeated requests. On first run, cache hit rate will be low.

To see cache behavior:

1. Run `anyclaude` multiple times with similar prompts
2. Check logs for cache metrics
3. Run test again - should show higher cache hit rate

### Test: Missing log directory

On first run, logs haven't been created yet. This is expected.

To generate logs:

```bash
# Start proxy and run a request through it
PROXY_ONLY=true bun run src/main.ts &
# Make an API call...
# Check logs
ls -la ~/.anyclaude/request-logs/
```

## Performance Expectations

### Test Execution Time

- Unit tests: ~5-10 seconds
- Regression tests: ~10-15 seconds
- Integration tests: ~5 seconds
- Total: ~20-30 seconds

### Claude Code Interaction

When running `anyclaude`:

- First request: 2-5 seconds (cache miss, system prompt cached)
- Subsequent requests: 1-2 seconds (cache hit)
- Large file operations: 5-10 seconds

### Cache Performance

- First request: ~100% of tokens charged
- Subsequent requests: ~25% of tokens charged (75% savings from cache)
- Cache expires after 5 minutes of inactivity

## CI/CD Integration

The test suite integrates with git hooks:

```bash
# Pre-commit hook (fast)
git commit -m "message"
# Runs: typecheck (~5s)

# Pre-push hook (comprehensive)
git push origin main
# Runs: npm test (all 106 tests, ~30-60s)
```

To skip hooks (not recommended):

```bash
git push --no-verify  # Skip all hooks
```

## Continuous Testing

Monitor test behavior over time:

```bash
# Run tests and save results
npm test > test-results-$(date +%Y-%m-%d-%H%M%S).log 2>&1

# Or watch mode (requires nodemon)
npm install -D nodemon
nodemon --ext ts,js --watch src --watch tests npm test
```

## What These Tests Validate

✅ **Message Format**

- Claude Code can send messages in the exact format
- System prompts are properly formatted
- Tool calls are in the correct structure

✅ **Cache Behavior**

- Cache control headers are understood
- Cache metrics are collected
- Cache hit rates improve on repeated requests

✅ **Streaming**

- Responses stream correctly via SSE
- Events arrive in proper sequence
- Large responses don't get truncated

✅ **Request Logging**

- All requests are logged to JSONL
- Metrics are properly recorded
- Cache performance is tracked

✅ **Real Claude Code**

- Proxy handles actual Claude Code requests
- Tool calling works end-to-end
- Responses are formatted correctly

## Troubleshooting

### "Tests pass locally but fail in CI"

Make sure CI environment has:

- Node.js 18+
- TypeScript 5+
- No firewall blocking localhost:60877

### "Cache tests fail but manual testing works"

Cache behavior depends on timing. Run tests sequentially:

```bash
npm run test:integration:cache -- --no-parallel
```

### "Streaming tests fail"

Ensure vLLM-MLX or LMStudio isn't returning truncated responses:

```bash
# Check server logs
tail -f ~/.anyclaude/logs/vllm-mlx-server.log
```

## Next Steps

1. ✅ Run basic format tests: `npm run test:integration:format`
2. ✅ Run cache validation: `npm run test:integration:cache`
3. ✅ Monitor logs while using Claude Code: `tail -f ~/.anyclaude/request-logs/*.jsonl`
4. ✅ Verify tool calling works in Claude Code
5. ✅ Check cache hit rates improve over time

## Additional Resources

- [CLAUDE.md](../CLAUDE.md) - Project configuration
- [PROJECT.md](../PROJECT.md) - Architecture details
- [docs/debugging/](../docs/debugging/) - Debugging guides
- [.anyclauderc.json](../.anyclauderc.json) - Configuration example
