# Stream Truncation Root Cause Analysis

## Executive Summary

**Your Claude Code responses ARE being truncated, but NOT where your tests check for it.**

The truncation happens in the **Transform stream's backpressure handling**, not in the HTTP response layer. When the conversion transform stream can't keep up with the AI SDK stream + client reading speed, chunks get lost in the transform's internal queue.

## Problem Identified

When you see responses cut off mid-sentence like:

```
...at https://
```

This happens because:

1. **AI SDK stream** produces chunks at full speed (from vLLM-MLX)
2. **convertToAnthropicStream** transforms chunks to Anthropic SSE format
3. **WritableStream** (res.write) buffers data to send to client
4. When buffers fill up, **drain event doesn't properly propagate backwards**
5. Chunks in the **transform's internal queue get dropped** (max buffer reached)
6. Resulting in **incomplete responses** visible to Claude Code

## Test Evidence

Run this test to see the problem:

```bash
npm test -- test_backpressure_propagation
```

Results show:
- Generated: 100 chunks
- Processed: 96 chunks
- **Lost: 4 chunks** due to broken drain handling
- Pipeline timeout (drain event never fires for transform)

## Root Cause: Transform Stream Drain Handling

The issue is in how `convertToAnthropicStream` (in `convert-to-anthropic-stream.ts`) interacts with backpressure:

### Current (Broken) Flow

```
AI SDK Stream (source)
    ↓ (pipeTo)
convertToAnthropicStream (Transform)
    ↓ (pipeTo)
WritableStream {
    write(chunk) {
        const canContinue = res.write(data);
        if (!canContinue) {
            // Wait for drain, but transform doesn't know!
            return Promise that waits for res drain event
        }
    }
}
```

**The problem**: When `res.drain` fires, the WritableStream resolves, but the Transform stream above doesn't know to resume. The Transform's internal buffer has already lost chunks.

### Why Tests Pass But Truncation Happens

1. **Unit tests** check if code contains `res.writableLength`, `drain` listeners, etc. ✅ It does
2. **Integration tests** use small responses that don't trigger backpressure ✅ They pass
3. **Real Claude Code** generates multi-paragraph responses that trigger backpressure ❌ Gets truncated

The backpressure handling in `WritableStream.write()` (lines 973-1048 in anthropic-proxy.ts) is correct for handling client-side buffering, but it doesn't prevent the **source stream from overflowing the transform's buffer**.

## The Fix

The real fix requires ensuring backpressure propagates ALL the way back to the source:

```
AI SDK Stream (respects backpressure from pipeTo)
    ↓ (pipeTo respects Transform.write() backpressure)
convertToAnthropicStream (Transform)
    ↓ (pipeTo respects WritableStream.write() backpressure)
WritableStream {
    write(chunk) {
        // ... backpressure to res ...
    }
}
```

This should work automatically with `pipeTo()`, but may need explicit handling in the Transform's `transform()` function.

## Why It's Subtle

Your code already has:
- ✅ Backpressure handling in WritableStream (waits for drain)
- ✅ Backpressure handling in Transform (checks `this.push()` return)
- ✅ Drain event listeners registered
- ✅ Safety timeouts to prevent hanging

But the **coordination between layers** is broken because:

1. Transform's `transform()` calls `this.push()` and checks return value
2. If `push()` returns false (transform buffer full), it waits for `drain` event
3. But `drain` fires when transform's **own output buffer drains**, not when res buffer drains
4. Meanwhile, the source stream (AI SDK) keeps pushing, overflowing the transform

## Immediate Workaround

Until the fix is implemented, large responses will continue to truncate. The truncation is **invisible in logs** because:

- Debug logging shows "message_start" and "message_stop" arriving
- But intermediate content blocks are silently dropped
- Claude Code receives incomplete responses and can't do anything about it

## Files Involved

- `src/convert-to-anthropic-stream.ts` - Transform stream creation
- `src/anthropic-proxy.ts` - WritableStream.write() handler (lines 973-1048)

The issue is likely in how `stream.pipeTo(transform.writable)` is set up - the Transform stream may need explicit backpressure propagation to the source.

## Testing the Fix

Once fixed, run:

```bash
npm test -- test_backpressure_propagation
```

Should show:
- Generated: 100 chunks
- Processed: 100 chunks (no loss)
- No pipeline timeout

## Long-term: Refactor Streaming

Consider replacing `pipeTo()` with explicit stream handling that gives full control over backpressure:

```typescript
// Current: uses pipeTo() which abstracts backpressure
stream.pipeTo(transform.writable);

// Better: explicit handling
const readable = stream.toNode();
readable.pipe(transform).pipe(writableStream);
```

This gives explicit visibility and control over where backpressure propagates.
