# Debug Log: Stream Hang Issue

**Date**: October 26, 2025
**Issue**: anyclaude hangs indefinitely when LMStudio doesn't respond to requests
**Status**: IN PROGRESS

---

## Timeline

### Session Start: ~00:30 (Oct 26, 2025)

**Problem Report:**

- User reports: `anyclaude` hangs when sending `1+1=` to LMStudio
- Cannot exit with `/exit`, had to Ctrl+C
- Previously worked, now broken after rebuild

**Initial Investigation:**

```bash
# User tried rebuilding:
bun run build  # Failed - bun not in PATH
npm install -g .  # Reinstalled with old code

# Then tried:
anyclaude
> 1+1=
# ✽ Noodling… (esc to interrupt) - HANGS FOREVER
```

---

### 00:35 - First Diagnosis

**Checked:** Is the old timeout code in the build?

```bash
grep -n "inactivityTimer" dist/main.cjs
# Found at line 27650 - timeout code IS present
```

**Problem Identified:**

- Built code (Oct 26 00:49) has timeout protection
- BUT: Globally installed version (Oct 25 23:06) is OLD
- Solution: `npm install -g .` to use new build

**Action:** Reinstalled package globally

```bash
npm install -g .
# ✓ Updated installed version to Oct 26 00:49
```

---

### 00:45 - Still Hanging!

**User reports:** Timeout still not working after reinstall

```bash
anyclaude
> 1+1=
# ✽ Gitifying… (esc to interrupt) - STILL HANGS
```

**Critical Discovery:**

- Verified timeout code IS in installed version
- But timeout never triggers!

---

### 00:50 - Root Cause Found

**Analysis of `src/convert-to-anthropic-stream.ts`:**

```typescript
// OLD CODE (lines 19-47):
const transform = new TransformStream({
  transform(chunk, controller) {
    chunkCount++;

    // Clear existing timer
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    // Set NEW timer
    inactivityTimer = setTimeout(() => {
      // Force completion after 30s of inactivity
    }, 30000);

    // ... process chunk
  },
});
```

**THE BUG:**

- Timeout is only set **inside `transform()`**
- `transform()` only called **when a chunk arrives**
- **If LMStudio never sends ANY chunks**, timeout never initializes!
- Result: Infinite hang with no timeout protection

**Previous Fix (Oct 25):**

- Added timeout for HTTP fetch operations ✓
- Added timeout for model detection ✓
- But did NOT handle case where stream never sends chunks ✗

---

### 01:00 - Solution Implemented

**Fix Applied:**

Added `start()` function to TransformStream to initialize timeout BEFORE any chunks arrive:

```typescript
const transform = new TransformStream({
  start(controller) {
    // ✓ Initialize timeout IMMEDIATELY when stream created
    debug(2, `[Stream Conversion] Starting stream with 30s inactivity timeout`);
    inactivityTimer = setTimeout(() => {
      if (!messageStopSent) {
        debug(
          1,
          `[Stream Conversion] ⚠️  Stream timeout - no chunks received for 30s`
        );
        controller.enqueue({ type: "message_stop" });
        messageStopSent = true;
        controller.terminate();
      }
    }, 30000);
  },

  transform(chunk, controller) {
    // ✓ Reset timeout on each chunk (existing code)
    chunkCount++;
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }

    // ✓ Re-arm timeout for next chunk
    inactivityTimer = setTimeout(() => {
      if (!messageStopSent) {
        debug(
          1,
          `[Stream Conversion] ⚠️  Stream inactive for 30s after ${chunkCount} chunks`
        );
        // Force completion
      }
    }, 30000);

    // ... process chunk
  },
});
```

**Files Changed:**

1. `src/convert-to-anthropic-stream.ts:23-40` - Added `start()` function
2. `src/anthropic-proxy.ts:360-363` - Added debug logging for stream start

**Enhanced Debug Logging:**

```typescript
// Added to proxy:
debug(1, `[Stream] Starting stream conversion for ${providerName}/${model}`);
debug(2, `[Stream] Creating Anthropic stream from AI SDK stream`);
```

---

### 01:05 - Rebuild and Reinstall

**Build Process:**

```bash
~/.bun/bin/bun build --target node --format cjs --outfile dist/main.cjs ./src/main.ts
# ✓ Bundled 183 modules in 35ms
# ✓ main.cjs  0.93 MB

npm install -g .
# ✓ up to date in 353ms
```

**Verification:**

```bash
# ✓ Timeout code present:
grep -c "Stream timeout - no chunks received for 30s" \
  /opt/homebrew/lib/node_modules/anyclaude-lmstudio/dist/main.cjs
# Output: 1

# ✓ Start function present:
grep -B 3 "Starting stream with 30s inactivity timeout" \
  /opt/homebrew/lib/node_modules/anyclaude-lmstudio/dist/main.cjs
# Found at line 27666
```

---

## Current Status

### ✓ Completed:

1. Identified root cause: timeout only initialized when chunks arrive
2. Implemented fix: `start()` function initializes timeout immediately
3. Added debug logging to track stream lifecycle
4. Built and installed updated code
5. Verified fix is in installed version

### ⏳ Pending Tests:

1. **Manual test:** Run `anyclaude` with `1+1=` and verify 30s timeout
2. **Debug test:** Run with `ANYCLAUDE_DEBUG=1` to see timeout messages
3. **Regression test:** Create automated test for this bug
4. **Commit:** Document fix and create regression test

---

## Expected Behavior After Fix

### Scenario 1: LMStudio Never Responds

```bash
ANYCLAUDE_DEBUG=1 anyclaude
> 1+1=

# Expected output:
[Stream] Starting stream conversion for lmstudio/gpt-oss-20b-mlx
[Stream Conversion] Starting stream with 30s inactivity timeout
# ... 30 seconds pass ...
[Stream Conversion] ⚠️  Stream timeout - no chunks received for 30s
# Prompt returns, can continue working
```

### Scenario 2: LMStudio Responds Then Hangs

```bash
ANYCLAUDE_DEBUG=1 anyclaude
> 1+1=

# Expected output:
[Stream] Starting stream conversion for lmstudio/gpt-oss-20b-mlx
[Stream Conversion] Starting stream with 30s inactivity timeout
[Stream Conversion] Raw chunk 1: { type: 'start-step' }
[Stream Conversion] Raw chunk 2: { type: 'text-delta' }
# ... chunks stop arriving ...
# ... 30 seconds pass ...
[Stream Conversion] ⚠️  Stream inactive for 30s after 2 chunks - forcing completion
# Prompt returns with partial response
```

### Scenario 3: LMStudio Works Normally

```bash
anyclaude
> 1+1=

# Expected output:
2

# No timeout messages, works normally
```

---

## Test Plan

### Next Steps:

1. **Test with LMStudio running:**

   ```bash
   ANYCLAUDE_DEBUG=1 anyclaude
   > 1+1=
   # Should timeout after 30s if model hangs
   ```

2. **Test with LMStudio stopped:**

   ```bash
   # Stop LMStudio server
   anyclaude
   > hello
   # Should get connection error or timeout
   ```

3. **Create regression test:**
   - Add test to `tests/regression/test_stream_start_timeout_regression.js`
   - Test that `start()` function initializes timeout
   - Test that timeout can trigger before any chunks arrive

4. **Update documentation:**
   - Update `TESTING.md` with new regression test
   - Document this bug in commit message
   - Add to known issues if not fully resolved

---

## Technical Details

### Why This Bug Was Hard to Catch

1. **Timing dependent:**
   - Only happens when LMStudio completely fails to respond
   - Works fine if LMStudio sends even 1 chunk

2. **Previous testing focused on:**
   - Timeout for HTTP connections ✓ (Oct 25 fix)
   - Timeout for model detection ✓ (Oct 25 fix)
   - Timeout for chunk inactivity ✗ (missed case)

3. **Stream API design:**
   - TransformStream has `transform()` for chunks
   - But also has `start()` for initialization
   - Easy to forget `start()` when adding timeout logic

### Related Code Locations

**Stream conversion:**

- `src/convert-to-anthropic-stream.ts:9-275`
- Key function: `convertToAnthropicStream()`
- Transform stream: lines 19-275

**Proxy server:**

- `src/anthropic-proxy.ts:141-400`
- Stream handling: lines 353-400
- Connects AI SDK → Anthropic stream conversion

**Timeout logic:**

- Initialization: `start()` at line 23
- Reset on chunk: `transform()` at line 41
- Cleanup: `flush()` at line 256

---

## Notes for Future Debugging

### Common Patterns to Watch:

1. **TransformStream initialization:**
   - Always implement `start()` for setup logic
   - Don't assume `transform()` will be called

2. **Timeout patterns:**
   - Set timeout in `start()`
   - Clear/reset in `transform()`
   - Clean up in `flush()`

3. **Stream debugging:**
   - Use debug levels: 1=important, 2=verbose
   - Log at stream lifecycle events: start, chunk, finish, flush
   - Track chunk counts and timings

### Debug Environment Variables:

```bash
ANYCLAUDE_DEBUG=1    # Basic debug logging
ANYCLAUDE_DEBUG=2    # Verbose debug logging
PROXY_ONLY=true      # Test proxy without Claude Code
LMSTUDIO_URL=...     # Override LMStudio endpoint
```

---

## References

- Previous timeout fix: Commit `f89b928` (Oct 25, 2025)
- Testing documentation: `TESTING.md`
- Regression tests: `tests/regression/`
- Manual tests: `tests/manual/test_stream_timeout.js`

---

## 01:15 - Test Results

**Test Environment:**

```bash
ANYCLAUDE_DEBUG=1 anyclaude
```

**Test Case:** User typed `1+1=`

**Debug Output:**

```
[ANYCLAUDE DEBUG] [Request Start] lmstudio/gpt-oss-20b-mlx at 2025-10-25T14:02:29.797Z
[ANYCLAUDE DEBUG] [Request Details] lmstudio/gpt-oss-20b-mlx {"system":"...","toolCount":0,"messageCount":2,"maxTokens":32000}
[ANYCLAUDE DEBUG] [Stream] Starting stream conversion for lmstudio/gpt-oss-20b-mlx
[ANYCLAUDE DEBUG] [Stream Conversion] Raw chunk 1: {"type":"start"}
# ... some chunks arrive ...
[ANYCLAUDE DEBUG] [Stream Conversion] Raw chunk 4: {"type":"reasoning-end"}
[ANYCLAUDE DEBUG] [Stream Conversion] Raw chunk 5: {"type":"text-start"}
# HANGS HERE - no more chunks
```

**Critical Observation:**

✓ Stream DOES start - `[Stream] Starting stream conversion` appears
✓ Chunks DO arrive - Chunks 1, 4, 5 are received
✗ Stream HANGS after chunk 5 - No more chunks, no timeout message

**Analysis:**

The bug is MORE SUBTLE than we thought:

1. **start() timeout IS initialized** (we see "Starting stream conversion")
2. **transform() IS called** (we see chunks being processed)
3. **transform() timeout IS re-armed** (on each chunk)
4. **BUT: Timeout message NEVER appears**

**Question for User:** Did you wait the full 30 seconds before pressing Ctrl+C?

If YES: The timeout isn't triggering even though it should
If NO: We need to wait 30s to see if timeout works

---

---

## 01:20 - CRITICAL INSIGHT FROM USER

**User Feedback:**

> "hey its not working... its normally pretty responsive so i suspect its something else"
> "when it worked it worked fast"

**Key Realization:**

❌ **This is NOT a timeout issue!**
✓ **This is a REGRESSION - we BROKE something that was working!**

**Evidence:**

1. When it works, it's FAST (not slow/30s wait)
2. It was working before our changes
3. Chunks ARE arriving (1, 4, 5) but then stop
4. After `text-start`, no `text-delta` chunks appear

**Hypothesis:**

Our timeout code might be BREAKING the stream instead of protecting it!

Suspicious code we added:

```typescript
controller.terminate(); // ← This might be killing the stream!
```

**Action Plan:**

1. Compare old working version (ab0452c) vs current broken version
2. Identify what changed that breaks normal operation
3. Remove or fix the breaking change
4. Test with working LMStudio response

---

---

## 01:25 - Testing Old Working Version

**Actions Taken:**

```bash
# Stashed all our timeout changes
git stash

# Rebuilt with old working version (commit 2e8237c, before timeout code)
~/.bun/bin/bun build ...

# Reinstalled globally
npm install -g .
```

**What This Tests:**

This reverts to the version BEFORE we added:

- `start()` function with timeout
- `controller.terminate()` calls
- `messageStopSent` tracking
- All the inactivity timer code

**Expected Result:**

If this works fast and completes responses, then we KNOW our timeout code broke it!

**User Action Required:**

Please test now:

```bash
anyclaude
> 1+1=
```

Should respond fast with "2" or similar.

---

---

## 01:30 - ROOT CAUSE FOUND!

**Investigation Results:**

1. **LMStudio works perfectly:** Tested direct curl - stream completes successfully
2. **AI SDK works perfectly:** Created test script - full stream with all chunks including finish
3. **anyclaude hangs:** Stops at chunk 5 (text-start), no more chunks after that

**Root Cause:**

Located in `src/main.ts:112-126` - The timeout protection code added for model detection:

```typescript
// BUG: This REPLACES the AI SDK's signal!
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120000);

const response = await globalThis.fetch(url, {
  ...init,
  signal: init?.signal || controller.signal, // ← BREAKS STREAMING!
});
```

**Why It Breaks Streaming:**

1. AI SDK creates a signal to control the stream lifecycle
2. Our code REPLACES that signal with our timeout signal (`init?.signal || controller.signal`)
3. AI SDK loses control of the stream because we overwrote its signal
4. Stream hangs because the SDK can't manage it properly

**The Fix:**

Only add timeout if there's NO existing signal:

```typescript
// Only add timeout if there's no existing signal
// (streaming requests provide their own signal and must not be replaced)
if (!init?.signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const response = await globalThis.fetch(url, {
    ...init,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  return response;
} else {
  // Use existing signal for streaming requests
  return globalThis.fetch(url, init);
}
```

**Files Changed:**

- `src/main.ts:112-132` - Fixed signal handling to preserve AI SDK's stream signal

**Verification:**

- Built: ✓
- Installed: ✓
- Ready to test: ✓

---

---

## 01:35 - Testing Pre-Model-Detection Version

**User Report:** Signal fix didn't work either!

**New Approach:** Test the version BEFORE model detection was added

**Actions:**

```bash
# Restored src/main.ts from commit 3e3ca6a (before f89b928)
git checkout 3e3ca6a -- src/main.ts

# Rebuilt (181 modules instead of 183 - simpler code)
bun build ...

# Reinstalled
npm install -g .
```

**What This Tests:**

This is the version from commit 3e3ca6a:

- ✗ NO model auto-detection
- ✗ NO timeout protection in fetch wrapper
- ✗ NO dotenv config() call
- ✓ Simple, direct fetch wrapper (just body modifications)

**Expected Result:**

If this works, then ANY of the changes in f89b928 or later broke it:

- Model detection code
- Fetch timeout wrapper
- dotenv config

**User Action Required:**

Please test NOW:

```bash
anyclaude
> 1+1=
```

Should complete fast if this version works!

---

---

## 01:40 - BREAKTHROUGH!

**I Created an Automated Test Instead of Asking You to Test!**

Created `tests/manual/test_proxy_response.js` to test the proxy directly.

**Test Results:**

```bash
✓ Proxy started at: http://localhost:51654
✓ Response received in 79ms
  Content-Type: text/event-stream

[SSE Chunk 1] type="message_start"
[SSE Chunk 2] type="content_block_start" (block_type="thinking")
[SSE Chunk 3] type="content_block_stop"
[SSE Chunk 4] type="content_block_start" (block_type="text")
[SSE Chunk 5] type="content_block_delta" (text="2...")  ← THE ANSWER!
[SSE Chunk 6] type="content_block_stop"
[SSE Chunk 7] type="message_delta" (stop_reason="end_turn")
[SSE Chunk 8] type="message_stop"

✓ Stream completed with 8 chunks
✓ Got message_stop event

SUCCESS! Proxy is working correctly.
```

**Critical Discovery:**

THE PROXY WORKS PERFECTLY when tested directly! It:

- ✓ Returns proper SSE stream (text/event-stream)
- ✓ Sends all required chunks including message_stop
- ✓ Includes the actual text answer ("2")
- ✓ Completes in 79ms

**The Mystery:**

1. Direct test of proxy → ✓ Works perfectly
2. User runs `anyclaude` via Claude Code → ✗ Hangs

**Hypothesis:**

Claude Code might be:

1. Sending different request parameters
2. Handling the stream differently
3. Getting stuck on a specific chunk type
4. Having issues with the "thinking" block

**Next Step:**

Need to capture what Claude Code is actually sending/receiving when it hangs.

---

---

## 01:45 - Adding Request Logging

**Confirmed:** User's test also shows SUCCESS! Proxy works perfectly.

**Next Step:** Capture what Claude Code sends when it hangs

**Added Logging:**

- `src/anthropic-proxy.ts:157-165` - Log all incoming request parameters
- Shows: stream, max_tokens, temperature, message count, tools count

**Rebuilt and installed** version with logging.

**User Action Required:**

Run anyclaude with debug logging to capture Claude Code's actual request:

```bash
ANYCLAUDE_DEBUG=1 anyclaude
> 1+1=
# Let it hang for a bit, then Ctrl+C
# Copy all the output, especially lines like:
# [Request] Anthropic Messages API request: { ... }
```

This will show us what's different between:

- Our simple test (works)
- Claude Code's request (hangs)

---

---

## 01:50 - THE FIX!

**Root Cause Identified:**

From the debug output:

```
[ANYCLAUDE DEBUG] [Stream Conversion] Stream complete. Total chunks: 20
```

The stream processes all 20 chunks and flush() is called, but **message_stop is never sent!**

**Why:**

The AI SDK stream from LMStudio doesn't send a 'finish' chunk. Instead, the stream just ends and flush() is called. But the old flush() only logged "Stream complete" and didn't send message_stop.

**The Fix:**

Added message_stop fallback in flush():

```typescript
// src/convert-to-anthropic-stream.ts:213-224
flush(controller) {
  // Ensure message_stop is sent even if AI SDK doesn't send 'finish' event
  if (!messageStopSent) {
    debug(1, `[Stream Conversion] ⚠️  No 'finish' event received, sending message_stop in flush()`);
    controller.enqueue({ type: "message_stop" });
    messageStopSent = true;
  }

  if (isDebugEnabled()) {
    debug(1, `[Stream Conversion] Stream complete. Total chunks: ${chunkCount}`);
  }
}
```

**Files Changed:**

1. `src/convert-to-anthropic-stream.ts:15` - Added `messageStopSent` tracking
2. `src/convert-to-anthropic-stream.ts:84` - Mark sent when 'finish' chunk arrives
3. `src/convert-to-anthropic-stream.ts:213-224` - Send message_stop in flush() fallback

**Verification:**

- ✓ Automated test still works
- ✓ Built and installed globally
- Ready to test with Claude Code!

---

---

## 01:55 - Still Hanging!

**User Report:** Still hangs with "Kneading..." spinner

**Verification:** Flush fix IS installed in the global version

**Next Step:** Run with ANYCLAUDE_DEBUG=1 to see if flush() is being called and if message_stop is being sent

---

---

## 02:00 - DISCOVERED THE HISTORY!

**User asked:** "How does this work with other LLM providers?"

**Key Discovery:**

This is a **FORK** of the original `anyclaude` project:

- **Original anyclaude**: Supported OpenAI, Google, xAI using AI SDK
- **This fork (anyclaude-lmstudio)**: Simplified to ONLY support LMStudio

**Critical Finding:**

Checked git history - `flush()` was added on **Oct 25, 2025** (yesterday!) in commit `feda233`:

```typescript
// ADDED YESTERDAY - BUT NO message_stop!
flush(controller) {
  if (isDebugEnabled()) {
    debug(1, `[Stream Conversion] Stream complete. Total chunks: ${chunkCount}`);
  }
},
```

**Before that commit (original version):**

- NO flush() function at all!
- Just simple error handling

**This means:**

1. The bug was introduced YESTERDAY when flush() was added without message_stop
2. It might have NEVER worked properly with LMStudio streaming!
3. The original anyclaude may have had the same issue OR different providers behave differently

**Question for User:**

When you said "it worked once" - was that:

- Before Oct 25 (before yesterday's changes)?
- With a different provider (not LMStudio)?
- Or maybe it never actually completed, just didn't hang as long?

---

---

## 02:05 - ROOT CAUSE IDENTIFIED!

**The Exact Bug:**

`controller.enqueue({ type: "message_stop" })` in `src/convert-to-anthropic-stream.ts:81` **BLOCKS FOREVER** on the second and subsequent requests!

**Evidence:**

Request 1 (works):

```
>>> ENTERED case "finish" block
messageStopSent=false BEFORE enqueue
[HTTP Write] Sending chunk type="message_stop"  ← enqueue() completed!
message_stop enqueued successfully
```

Request 2+ (hangs):

```
>>> ENTERED case "finish" block
messageStopSent=false BEFORE enqueue
# ← HANGS HERE at controller.enqueue()!
# ← NEVER reaches next log line
```

**Why It Blocks:**

`TransformStream.controller.enqueue()` blocks when the readable side's internal buffer is full (backpressure). The WritableStream isn't consuming fast enough, so the TransformStream can't accept more chunks.

**Question:**

Why does this only happen on the 2nd+ request? The first request's `message_stop` goes through fine!

**Hypothesis:**

1. Stream state not reset between requests?
2. HTTP response closes before message_stop can be written?
3. WritableStream closed but TransformStream doesn't know?

---

**Last Updated:** Oct 26, 2025 02:05
**Next Update:** After testing res.write() behavior
