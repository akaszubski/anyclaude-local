# Stream Truncation Fix: Research & Solutions

**Last Updated**: 2025-10-29
**Status**: Implemented
**Relevant Files**: `src/anthropic-proxy.ts`, `src/convert-to-anthropic-stream.ts`

## Problem Statement

Claude Code responses were being truncated mid-stream, cutting off at arbitrary points during the response generation. This affected both short and long responses, making the tool unreliable.

**Symptoms**:
- Responses ending abruptly mid-sentence
- Missing `message_stop` event from SSE stream
- No errors reported by the proxy or client
- Consistent truncation patterns across different requests

## Root Cause Analysis

Through research and investigation, we identified **multiple overlapping issues**:

### 1. Backpressure Handling (Primary Issue)

Node.js `res.write()` returns a **boolean** indicating whether the buffer has space:
- Returns `true`: Data written immediately
- Returns `false`: Internal buffer is full (typically 16KB by default)

**The Bug**: The WritableStream implementation was ignoring this return value:

```typescript
// WRONG - Ignores backpressure!
res.write(`event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`);
// Continues immediately without waiting for drain event
```

When the buffer filled up, the write would silently fail or be dropped, causing the stream to end prematurely.

**Reference**: [Node.js Backpressure Documentation](https://nodejs.org/en/learn/modules/backpressuring-in-streams/)

### 2. SSE Buffering at Proxy/Gateway Level

Intermediate proxies and gateways can buffer SSE responses, truncating them at buffer boundaries (typically 32KB with HTTP/2).

**Solution**: Disable buffering with headers:
```
X-Accel-Buffering: no  // Disable nginx/Accel buffering
Transfer-Encoding: chunked  // Use chunked encoding for streaming
```

**Reference**: [Server-Sent Events Buffering Issues](https://github.com/encode/uvicorn/issues/689)

### 3. High-Water Mark Limits

WritableStreams have a default buffer size (highWaterMark):
- For binary streams: 16KB
- For object mode: 16 objects

When buffer exceeds this threshold, backpressure signals kick in.

## Implementation

### Fix 1: Add SSE Response Headers

**File**: `src/anthropic-proxy.ts:833-840`

```typescript
res.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",        // ← NEW: Disable proxy buffering
  "Transfer-Encoding": "chunked",     // ← NEW: Force chunked encoding
});
```

**Why**: Tells all intermediaries to not buffer, send data immediately.

### Fix 2: Handle Backpressure in WritableStream

**File**: `src/anthropic-proxy.ts:890-945`

```typescript
write(chunk) {
  // ... logging and setup code ...

  const data = `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`;
  const canContinue = res.write(data);

  // CRITICAL: Handle backpressure
  if (!canContinue) {
    // Buffer is full - return Promise that waits for 'drain' event
    return new Promise((resolve, reject) => {
      const onDrain = () => {
        debug(2, `[Backpressure] Drain event received, resuming writes`);
        res.removeListener('drain', onDrain);
        res.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        res.removeListener('drain', onDrain);
        res.removeListener('error', onError);
        reject(err);
      };
      res.once('drain', onDrain);
      res.once('error', onError);
    });
  }
}
```

**Why**:
- Checks if `res.write()` returns `false`
- Returns a Promise that pauses the stream
- Resumes when the 'drain' event fires (buffer emptied)
- Properly handles errors during backpressure wait

### Fix 3: Add Stream Abort Handler

**File**: `src/anthropic-proxy.ts:959-968`

```typescript
abort(reason) {
  // Handle stream cancellation/abort
  debug(1, `[Stream Abort] Stream aborted:`, reason);
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
  }
  if (!res.writableEnded) {
    res.end();
  }
}
```

**Why**: Ensures graceful cleanup if the stream is aborted unexpectedly.

## Research Findings

### Key Resources

1. **Node.js Backpressure Handling**
   - [Node.js Backpressuring Guide](https://nodejs.org/en/learn/modules/backpressuring-in-streams/)
   - Key insight: Ignoring `write()` return value can cause memory leaks and data loss

2. **SSE Streaming Issues**
   - [Uvicorn SSE Buffering Issue #689](https://github.com/encode/uvicorn/issues/689)
   - Key insight: HTTP/2 and proxies can buffer SSE at 32KB boundaries

3. **WritableStream Backpressure Pattern**
   - Correct pattern: Return Promise from write() that resolves after drain
   - Memory efficiency: ~87.81 MB (respecting backpressure) vs ~1.52 GB (ignoring it)

### Common Patterns

**Pattern 1: Backpressure-aware Write**
```typescript
// Correct way to handle backpressure
if (!res.write(data)) {
  // Buffer full - wait for drain
  return new Promise((resolve) => {
    res.once('drain', resolve);
  });
}
```

**Pattern 2: SSE Headers for Streaming**
```typescript
res.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",        // Disable nginx buffering
  "Transfer-Encoding": "chunked",    // Use chunked encoding
});
```

**Pattern 3: Proper Stream Lifecycle**
```typescript
const transform = new WritableStream({
  write(chunk) {
    // Handle the write, return Promise if backpressure
  },
  close() {
    // Cleanup on normal completion
  },
  abort(reason) {
    // Handle early termination
  },
});
```

## Testing

### Regression Test Suite

Created two test suites to validate the fix:

**TypeScript/Jest Tests** (`tests/regression/stream-truncation.test.ts`):
- Short response test
- Medium response test
- Long response test
- Event sequence validation
- Backpressure handling validation

**Node.js Manual Tests** (`scripts/test/stream-truncation.mjs`):
- Direct HTTP requests to proxy
- Response completeness validation
- Event counting
- Size validation

### How to Run Tests

```bash
# Run with Jest
npm test -- tests/regression/stream-truncation.test.ts

# Run manual tests (requires running proxy)
node scripts/test/stream-truncation.mjs 58798
```

## Expected Behavior After Fix

✅ **Before**: Responses truncated, missing final events
✅ **After**: Complete responses, all events received, `message_stop` present

**Indicators of Success**:
1. All responses end with `message_stop` event
2. No data loss even for large responses (>10KB)
3. Debug logs show backpressure events being handled
4. Memory usage remains stable

## Debug Logging

Enable debug logging to see backpressure in action:

```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

Look for these debug messages:
- `[Backpressure] Buffer full, waiting for drain event` - Backpressure detected
- `[Backpressure] Drain event received, resuming writes` - Buffer drained, resuming
- `[WritableStream] Received chunk of type: ...` - Stream events flowing

## Architecture Diagram

```
Claude Code
    ↓
[Proxy HTTP Server]
    ↓
res.write(data) ← Returns boolean
    ├─ true → continue immediately
    └─ false → wait for 'drain' event
              ↓
         res.on('drain') fires
              ↓
         resume writing
    ↓
[SSE Headers: X-Accel-Buffering: no]
    ↓
[Chunked Encoding]
    ↓
Claude Code receives complete SSE stream
```

## References & Links

- **Node.js Streams**: https://nodejs.org/api/stream.html
- **Web Streams API**: https://nodejs.org/api/webstreams.html
- **Backpressure Guide**: https://nodejs.org/en/learn/modules/backpressuring-in-streams/
- **SSE Spec**: https://html.spec.whatwg.org/multipage/server-sent-events.html
- **Uvicorn Issue #689**: https://github.com/encode/uvicorn/issues/689

## Related Issues

This fix addresses the common pattern where:
1. SSE streaming gets truncated at buffer boundaries
2. Responses cut off mid-word
3. Final completion events never arrive
4. Data loss occurs without error messages

Similar issues have been reported in:
- OpenAI SDK streaming issues
- Anthropic SDK streaming issues
- LiteLLM proxying issues
- Generic SSE buffering problems
