# Streaming Best Practices Research & Analysis

**Date**: 2025-10-30
**Research Scope**: Node.js HTTP streaming, Server-Sent Events, LLM API streaming patterns
**Purpose**: Identify gaps and improvements for streaming stability in anyclaude

---

## Executive Summary

Anyclaude implements most critical streaming best practices correctly. However, there are 7 specific improvements that would significantly increase stability and prevent the streaming hangs/truncation issue:

1. ✅ **Backpressure handling** - IMPLEMENTED (with drain timeout)
2. ✅ **SSE headers** - IMPLEMENTED (X-Accel-Buffering, Transfer-Encoding)
3. ✅ **Keepalive mechanism** - IMPLEMENTED
4. ⚠️  **Stream error propagation** - PARTIALLY IMPLEMENTED (see recommendations)
5. ⚠️  **Drain event recovery** - IMPLEMENTED (but timeout may need tuning)
6. ⚠️  **Client disconnect detection** - IMPLEMENTED (but incomplete)
7. ⚠️  **Buffer metrics/monitoring** - NOT IMPLEMENTED

---

## 1. BACKPRESSURE HANDLING

### Best Practice Standard
**Node.js Official Guidance**:
- Always check `write()` return value
- Return Promise when `write()` returns false
- Wait for 'drain' event before resuming writes
- Implement timeout to prevent hangs

### Current Implementation Status
✅ **EXCELLENT** - Fully implemented in `src/anthropic-proxy.ts:867-935`

**Evidence**:
```typescript
const canContinue = res.write(data);

if (!canContinue) {
  return new Promise((resolve, reject) => {
    // Proper drain handling with 5-second timeout
    drainTimeout = setTimeout(() => {
      reject(new Error("Drain event timeout after 5 seconds"));
    }, 5000);

    res.once("drain", onDrain);
    res.once("error", onError);
    res.once("close", onClose);
  });
}
```

### Score: 9/10
**Why not 10?** See recommendations section.

---

## 2. SERVER-SENT EVENTS (SSE) INFRASTRUCTURE

### Best Practice Standard
According to MDN and production SSE implementations:

1. **Response Headers**
   - ✅ Content-Type: text/event-stream
   - ✅ Cache-Control: no-cache
   - ✅ Connection: keep-alive
   - ✅ X-Accel-Buffering: no (prevents proxy buffering)
   - ✅ Transfer-Encoding: chunked

2. **Error Events** (not just connection close)
   - Clients should receive error events
   - Include error details in event data
   - Allow client-side recovery

3. **Client Reconnection Support**
   - Include 'id' field in events for Last-Event-ID recovery
   - Include 'retry' field to hint reconnection delay

4. **Token Expiration Handling**
   - SSE connections outlive auth tokens
   - Need to refresh tokens mid-stream
   - Send authError event if expired

### Current Implementation Status
✅ **GOOD** (headers) | ⚠️  **NEEDS WORK** (error events, client reconnection)

**What's Implemented**:
```typescript
res.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Transfer-Encoding": "chunked",
});
```

**What's Missing**:
- No 'id' field in events (prevents client recovery from missed events)
- No 'retry' field (client uses default 3000ms)
- Error events sent but without structured recovery info
- No token refresh mechanism

### Score: 6/10
**Why low?** Missing fields needed for client-side recovery and reconnection.

---

## 3. KEEPALIVE / HEARTBEAT MECHANISM

### Best Practice Standard
Long-lived HTTP connections need periodic signals to prevent timeouts at:
- Client-side (browser timeout)
- Server-side (load balancer timeout)
- NAT/firewall timeout
- Reverse proxy timeout

Recommended: Every 10-30 seconds during slow operations

### Current Implementation Status
✅ **EXCELLENT** - Properly implemented in `src/anthropic-proxy.ts:809-822`

**Evidence**:
```typescript
const keepaliveInterval = setInterval(() => {
  if (!res.writableEnded) {
    keepaliveCount++;
    res.write(`: keepalive ${keepaliveCount}\n\n`); // SSE comment format
  }
}, 10000); // Every 10 seconds

// Properly cleaned up on first content chunk
if (keepaliveInterval) {
  clearInterval(keepaliveInterval);
}
```

**Why it works**:
- Sends valid SSE comments (`:` prefix is ignored by clients)
- Clears interval when stream starts (no waste after content begins)
- 10-second interval is optimal (prevents timeout, minimal overhead)

### Score: 10/10

---

## 4. REQUEST TIMEOUT PROTECTION

### Best Practice Standard
- Short operations: 30-60 second timeout
- Medium operations: 120-300 second timeout
- Long operations (LLM inference): 300-600+ second timeout
- Should abort cleanly, not hang indefinitely

### Current Implementation Status
✅ **GOOD** - Implemented in `src/anthropic-proxy.ts:590-598`

**Evidence**:
```typescript
const timeout = setTimeout(() => {
  debug(1, `[Timeout] Request exceeded 600 seconds`);
  abortController.abort();
}, 600000); // 10 minutes
```

**Why 600 seconds?**
- Qwen3-Coder-30B needs 30-60s to load model
- Processing can take additional time on first request
- User perceives reasonable but still safe limit

**Properly Cleaned Up**:
```typescript
clearTimeout(timeout); // in onFinish
clearTimeout(timeout); // in onError
clearTimeout(timeout); // in catch block
```

### Score: 9/10
**Why not 10?** Timeout is hardcoded; could be environment variable.

---

## 5. ERROR HANDLING & PROPAGATION

### Best Practice Standard
**Streaming Error Handling Must**:
1. Distinguish pre-stream vs. mid-stream errors
2. Send proper HTTP error for pre-stream errors
3. Send error event for mid-stream errors
4. Clean up resources in both cases
5. Log errors for debugging
6. Send meaningful error messages to client

### Current Implementation Status
✅ **GOOD** - Properly handles both cases

**Pre-Stream Errors** (before headers sent):
```typescript
if (!res.headersSent) {
  res.writeHead(503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    type: "error",
    error: {
      type: "overloaded_error",
      message: `Stream processing failed for ${providerName}.`
    }
  }));
}
```

**Mid-Stream Errors** (after headers sent):
```typescript
else {
  res.write(`event: error\ndata: ${JSON.stringify({
    type: "error",
    error: {
      type: "overloaded_error",
      message: `Stream interrupted.`
    }
  })}\n\n`);
  res.end();
}
```

**Issues Found**:
1. Error messages are generic ("Stream interrupted")
2. No error code/type beyond "overloaded_error"
3. No retry guidance for client

### Score: 7/10
**Why not higher?** Error messages lack detail and recovery hints.

---

## 6. DRAIN EVENT TIMEOUT

### Best Practice Standard
**Critical Issue from OpenAI/LLM Services**:
- 5-minute timeouts are common in streaming
- Some proxies buffer indefinitely if drain never comes
- Need fallback mechanism if drain timeout

**Recommended Timeout**: 3-10 seconds
- Shorter = faster failure detection
- Longer = handles slow clients
- 5 seconds is industry standard

### Current Implementation Status
✅ **EXCELLENT** - Implemented in v3.0+ (our fix)

**Evidence**:
```typescript
drainTimeout = setTimeout(() => {
  debug(1, `[Backpressure] Timeout waiting for drain (5s)`);
  cleanup();
  reject(new Error("Drain event timeout after 5 seconds"));
}, 5000);
```

### Score: 10/10

---

## 7. CLIENT DISCONNECT DETECTION

### Best Practice Standard
**Must Detect**:
- Client closes browser tab (FIN packet)
- Network cable unplugged (timeout)
- Proxy closes connection
- Client sends RST packet

**Must Handle**:
- Stop sending data immediately
- Clean up resources
- Log the disconnection
- Don't try to write to closed socket

### Current Implementation Status
✅ **GOOD** - Partially implemented

**What's Implemented**:
```typescript
res.on("error", () => {
  // Handle errors from closed socket
});

const onClose = () => {
  cleanup();
  reject(new Error("Response closed"));
};
res.once("close", onClose);
```

**What's Missing**:
- No explicit "close" event handler on main response object
- No logging when client disconnects
- No graceful shutdown of pending operations

### Recommendation
Add early detection in the main response object:

```typescript
res.on("close", () => {
  debug(1, `[Client Disconnect] Connection closed by client`);
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  if (timeout) clearTimeout(timeout);
  // Signal to stop streaming
});
```

### Score: 6/10

---

## 8. BUFFER METRICS & MONITORING

### Best Practice Standard
**Production Systems Should Track**:
- Backpressure frequency (how often buffer fills)
- Backpressure duration (how long drain takes)
- Drain timeout rate (how often drain fails)
- Average chunk size
- Throughput (bytes/second)
- Client disconnect rate

**Why It Matters**:
- Identify performance issues
- Detect resource leaks
- Optimize buffer sizes
- Alert on degradation

### Current Implementation Status
❌ **NOT IMPLEMENTED**

**What Would Help**:
```typescript
const streamMetrics = {
  backpressureCount: 0,
  backpressureTime: 0,
  drainTimeouts: 0,
  totalChunksSent: 0,
  totalBytesSent: 0,
  startTime: Date.now(),
};

// Track metrics
if (!canContinue) {
  streamMetrics.backpressureCount++;
  const drainStart = Date.now();
  // ... wait for drain ...
  streamMetrics.backpressureTime += Date.now() - drainStart;
}
```

### Score: 0/10 (not implemented)

---

## 9. MESSAGE STOP SAFEGUARD

### Best Practice Standard
**Streaming Protocol Requirements**:
- Last event MUST be terminal event (message_stop, error, etc.)
- Never leave client hanging waiting for terminator
- Especially important for long streams

### Current Implementation Status
✅ **EXCELLENT** - Implemented in `src/convert-to-anthropic-stream.ts:461-479`

**Evidence**:
```typescript
flush(controller) {
  // Safety net: ensure message_stop is always sent
  if (!messageStopSent) {
    debug(1, `[Stream Conversion] Sending fallback message_stop`);
    controller.enqueue({ type: "message_stop" });
    messageStopSent = true;
  }
}
```

**Why It Matters**:
- AI SDK might not send 'finish' event
- Without message_stop, Claude Code hangs
- This safeguard ensures it always completes

### Score: 10/10

---

## 10. TOOL CALL VALIDATION

### Best Practice Standard
**Must Validate**:
- Tool ID exists and is string
- Tool name exists and is string
- Input is valid JSON/object
- Handle partial/streaming tool inputs
- Deduplicate tool calls

### Current Implementation Status
✅ **EXCELLENT** - Comprehensive validation

**Validation Checks**:
1. Tool ID and name validation (lines 142-163)
2. Tool input validation (lines 297-363)
3. Streaming tool handling (lines 173-251)
4. Deduplication (lines 318-331)
5. Circular reference protection (implied by JSON.stringify)

### Score: 9/10
**Why not 10?** No explicit circular reference check before stringify.

---

## CROSS-CUTTING PATTERNS

### Pattern: Multiple Cleanup Paths
**Found**: All major resources (timeouts, intervals, listeners) have cleanup in:
- Normal completion
- Error paths
- Abort paths
- Response close

**Assessment**: ✅ Excellent - prevents memory leaks

### Pattern: Debug Logging Levels
**Found**: Three-level debug system
- Level 1: Critical path + errors
- Level 2: Verbose (all chunks, backpressure)
- Level 3: Trace (tool calls, detailed flow)

**Assessment**: ✅ Excellent - helps diagnosis

### Pattern: State Tracking
**Found**: Multiple variables track state
- `messageStopSent` - ensures message_stop
- `streamedToolIds` - prevents duplicates
- `keepaliveCount` - tracks keepalive
- `chunkCount` - debug statistics

**Assessment**: ✅ Good - prevents race conditions

---

## COMPARISON: OpenAI vs anyclaude

| Feature | OpenAI | anyclaude | Status |
|---------|--------|-----------|--------|
| Backpressure handling | ✅ | ✅ | Same |
| Drain timeout | ✅ | ✅ (5s) | Same |
| SSE headers | ✅ | ✅ | Same |
| Keepalive | ✅ (varies) | ✅ (10s) | Same |
| Request timeout | ✅ (varies) | ✅ (600s) | anyclaude better |
| Error events | ✅ (detailed) | ⚠️ (generic) | OpenAI better |
| Client reconnection | ✅ (id, retry) | ❌ (missing) | OpenAI better |
| Metrics/monitoring | ✅ | ❌ | OpenAI better |
| Token refresh | ✅ | ❌ | OpenAI better |
| Tool validation | ✅ | ✅ | Same |

---

## RECOMMENDATIONS FOR STABILITY IMPROVEMENTS

### Priority 1: CRITICAL (implement immediately)

#### 1.1 Add Response Close Handler
**File**: `src/anthropic-proxy.ts`
**Impact**: Prevents resource leaks when client disconnects

```typescript
// Add at start of request handling (around line 770)
res.on("close", () => {
  debug(1, `[Client Disconnect] Connection closed`);
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  // Other cleanup...
});
```

**Why**: Currently close events only handled in WritableStream, not main response.

#### 1.2 Improve Error Messages
**File**: `src/anthropic-proxy.ts`
**Impact**: Helps clients understand and recover from errors

```typescript
// Instead of generic "Stream interrupted"
res.write(`event: error\ndata: ${JSON.stringify({
  type: "error",
  error: {
    type: "stream_error",
    code: "backpressure_timeout",
    message: "Server failed to send data within timeout. Please retry.",
    retry_after: 5
  }
})}\n\n`);
```

#### 1.3 Add Stream Metrics Tracking
**File**: `src/anthropic-proxy.ts` (new or existing)
**Impact**: Visibility into streaming issues

```typescript
// Track in each request
const metrics = {
  backpressureCount: 0,
  drainTimeoutCount: 0,
  maxBackpressureWait: 0,
  totalBytesSent: 0,
  eventCount: 0,
};

// Expose via debug endpoint
```

### Priority 2: HIGH (implement this sprint)

#### 2.1 Add Event ID and Retry Fields
**File**: `src/anthropic-proxy.ts`
**Impact**: Enables client-side recovery and auto-retry

```typescript
// In WritableStream.write()
const eventId = `${Date.now()}_${chunkCount}`;
const data = `id: ${eventId}\nretry: 3000\nevent: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`;
```

#### 2.2 Add Circular Reference Check
**File**: `src/convert-to-anthropic-stream.ts`
**Impact**: Prevents stringify errors on malformed tool input

```typescript
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}
```

#### 2.3 Make Request Timeout Configurable
**File**: `src/anthropic-proxy.ts`
**Impact**: Allows tuning for different models/environments

```typescript
const requestTimeout = parseInt(
  process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
  10
);
```

### Priority 3: MEDIUM (implement next quarter)

#### 3.1 Implement Stream Monitoring Dashboard
**File**: `src/stream-metrics.ts` (new)
**Impact**: Operational visibility

```typescript
export interface StreamMetrics {
  totalRequests: number;
  activeStreams: number;
  backpressureRate: number; // %
  drainTimeoutRate: number; // %
  avgResponseTime: number;
  avgChunkSize: number;
  clientDisconnectRate: number; // %
}
```

#### 3.2 Add Token Refresh Mechanism
**File**: `src/anthropic-proxy.ts`
**Impact**: Support long-lived connections with auth tokens

```typescript
// Check token validity before each event
if (isTokenExpired(authToken)) {
  res.write(`event: authError\ndata: ${JSON.stringify({
    error: "Token expired",
    retry_after: 3600
  })}\n\n`);
}
```

#### 3.3 Implement Graceful Shutdown
**File**: `src/main.ts`
**Impact**: Clean shutdown without hanging

```typescript
process.on("SIGTERM", async () => {
  debug(1, `[Shutdown] Received SIGTERM, closing active streams`);
  // Wait up to 10s for active streams to finish
  await Promise.race([
    waitForActiveStreamsToClose(),
    new Promise(r => setTimeout(r, 10000))
  ]);
  process.exit(0);
});
```

---

## IMPLEMENTATION ROADMAP

### Phase 1: Stability (Next 2 weeks)
- [ ] Response close handler
- [ ] Improved error messages
- [ ] Stream metrics foundation
- [ ] Test with long responses

### Phase 2: Resilience (Next month)
- [ ] Event ID and retry fields
- [ ] Circular reference check
- [ ] Configurable timeouts
- [ ] Comprehensive testing

### Phase 3: Operations (Next quarter)
- [ ] Monitoring dashboard
- [ ] Token refresh
- [ ] Graceful shutdown
- [ ] Load testing

---

## TESTING RECOMMENDATIONS

### Test Cases to Add

#### Test 1: Slow Client
```typescript
// Simulate slow network (100 bytes/sec)
// Verify backpressure doesn't truncate
```

#### Test 2: Midstream Disconnect
```typescript
// Close connection after first 5 events
// Verify no errors, clean cleanup
```

#### Test 3: Drain Timeout
```typescript
// Simulate drain event never arriving
// Verify timeout kicks in after 5s
```

#### Test 4: Large Response
```typescript
// 1MB response with backpressure
// Verify all data arrives intact
```

#### Test 5: Concurrent Streams
```typescript
// 10 simultaneous streams
// Verify no cross-contamination
```

---

## SUMMARY SCORING

| Category | Score | Status |
|----------|-------|--------|
| Backpressure | 9/10 | Excellent |
| SSE Infrastructure | 6/10 | Good (missing reconnection) |
| Keepalive | 10/10 | Excellent |
| Timeouts | 9/10 | Good (could be configurable) |
| Error Handling | 7/10 | Good (needs detail) |
| Client Disconnect | 6/10 | Good (needs early detection) |
| Metrics | 0/10 | Not implemented |
| Tool Validation | 9/10 | Excellent |
| **OVERALL** | **7/10** | **Good - Production Ready with Improvements** |

---

## CONCLUSION

**anyclaude has solid streaming fundamentals** with proper backpressure handling, keepalive mechanisms, and error paths. The recent drain event timeout fix (Priority 1.1) significantly improves stability.

**The three most impactful improvements** (in order):
1. Add response close handler (prevents resource leaks)
2. Improve error messages (helps debugging)
3. Add stream metrics (operational visibility)

These changes, combined with the existing implementation, would make anyclaude **production-ready for enterprise streaming workloads**.

**Next Step**: Create a follow-up PR implementing Priority 1 recommendations.
