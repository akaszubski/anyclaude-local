# Complete Debugging Guide: Getting Stable Reliable Performance with anyclaude

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Step-by-Step Fixes](#step-by-step-fixes)
4. [Verification & Testing](#verification--testing)
5. [Performance Benchmarking](#performance-benchmarking)
6. [Troubleshooting](#troubleshooting)

---

## Quick Diagnosis

### Check Your Current Status

```bash
# 1. Check system prompt size
ANYCLAUDE_DEBUG=2 anyclaude 2>&1 | grep -i "system\|context"

# 2. Check for truncation patterns
cat ~/.anyclaude/logs/*.log | grep -i "truncat\|end\|stop"

# 3. Check cache hit rate
cat .anyclaude-cache-metrics.json | jq '.metrics | {hitRate: .hitRate, totalRequests: .totalRequests}'

# 4. Check traces for system prompt size
cat ~/.anyclaude/traces/mlx/*.json | \
  jq '.request.body.system | if type == "array" then map(.text) | join("") | length else length end' | \
  sort | uniq -c | sort -rn
```

### Likely Findings

- [ ] System prompt > 10KB (Expected: <5KB)
- [ ] Truncation warnings in logs (Expected: None)
- [ ] Cache hit rate < 50% (Expected: >80%)
- [ ] First-token latency > 20 seconds (Expected: <10 seconds)

---

## Root Cause Analysis

### Issue #1: System Prompt Too Large

**Symptom**: Slow first response, high latency

**Root Cause**: Claude Code includes entire CLAUDE.md in system prompt

- Current: ~11,430 characters
- Should be: ~3,000 characters
- Token cost: ~2,200 tokens per request

**Impact**:

- 10-20 seconds slower than necessary
- Sent on every request
- No caching at MLX level

**Fix**: Reduce system prompt to essentials only (see STABILITY_FIX_IMPLEMENTATION.md)

### Issue #2: Stream Truncation

**Symptom**: Responses cut off mid-stream, incomplete text

**Root Causes**:

1. `res.end()` called before buffer flushed
2. No drain event handling for backpressure
3. Message-stop not guaranteed to be sent
4. Race conditions in stream closure

**Impact**:

- Incomplete responses
- Unpredictable behavior
- Hard to debug

**Fix**: Proper buffer draining and timeout protection (see STABILITY_FIX_IMPLEMENTATION.md)

### Issue #3: Whitespace Normalization Breaking Structure

**Symptom**: Model behaves inconsistently with structured prompts

**Root Cause**: Line 476 in `anthropic-proxy.ts` aggressively strips whitespace

```typescript
system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
```

This:

- Removes all newlines (breaks formatting)
- Collapses all whitespace (breaks examples)
- Confuses the model

**Impact**:

- Model doesn't understand instructions as well
- Tool calling less reliable
- Inconsistent outputs

**Fix**: Preserve structure, only trim edges

### Issue #4: No Observability

**Symptom**: Can't diagnose issues when they occur

**Root Cause**: No request/response logging

**Impact**:

- Issues appear random
- Hard to reproduce
- Can't identify patterns

**Fix**: Add JSONL request logging

---

## Step-by-Step Fixes

### STEP 1: Reduce System Prompt (30 minutes)

**Before**:

```
System prompt: 11,430 characters
First-token latency: 25-35 seconds
```

**After**:

```
System prompt: 3,000 characters
First-token latency: 10-15 seconds
Improvement: 15-20 seconds faster
```

**Implementation**:

1. **Backup current code**:

```bash
git checkout -b stability/reduce-system-prompt
```

2. **Edit `src/main.ts`**:

Find where system prompt is generated. Replace with:

```typescript
const ESSENTIAL_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.

You are an interactive CLI tool that helps users with software engineering tasks.

## Available Tools

Use these tools to help with your tasks:
- Glob: Find files by pattern
- Grep: Search file contents
- Read: Read file contents
- Write: Write files
- Edit: Edit files
- Bash: Run terminal commands
- Task: Complex multi-step tasks
- WebFetch: Fetch URLs and analyze

## Code Quality

- Write clean, maintainable code
- Test thoroughly before completing
- Include comments for complex logic
- Fix issues completely, don't leave TODOs

## Important Rules

- NEVER commit code without asking user
- NEVER make breaking changes without confirmation
- Run tests before finishing tasks
- Ask for clarification if requirements unclear`;

// Use this in place of the full CLAUDE.md content
```

3. **Create `.clinerules`**:

```bash
cat > .clinerules << 'EOF'
# anyclaude Development Rules

## Organization
- Source: src/
- Tests: tests/
- Docs: docs/
- Builds: dist/

## Key Components
- anthropic-proxy.ts: Main HTTP proxy
- convert-anthropic-messages.ts: Message format conversion
- convert-to-anthropic-stream.ts: SSE streaming
- json-schema.ts: Tool schema adaptation

## Testing
- Run: npm test
- Type check: npm run typecheck
- Build: npm run build

## Common Issues
- Truncation: Check WritableStream.close() and backpressure
- Cache Misses: Verify hash includes tools
- Slow: Check system prompt size
- Tools Fail: Enable ANYCLAUDE_DEBUG=3
EOF
git add .clinerules
```

4. **Test**:

```bash
npm run build
npm test
ANYCLAUDE_DEBUG=2 anyclaude
# Type a simple prompt, measure latency
# Should be 5-10 seconds faster than before
```

### STEP 2: Fix Stream Truncation (1 hour)

**Implementation**:

1. **Edit `src/anthropic-proxy.ts` around line 1046**:

Replace the `close()` handler in WritableStream with enhanced draining:

```typescript
close() {
  // Clear keepalive
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
  }

  // Log completion
  const totalDuration = Date.now() - requestStartTime;
  debug(1, `[Request Complete] ${providerName}/${model}: ${totalDuration}ms`);

  // Record cache metrics (keep existing code)
  if (finalUsageData && body) {
    // ... existing cache metrics code ...
  }

  // NEW: Properly drain buffer before close
  const drainAndClose = () => {
    if (!res.writableEnded) {
      debug(2, `[Stream] Response closed successfully`);
      res.end();
    }
  };

  // If there's buffered data, wait for drain
  if (res.writableLength > 0) {
    debug(2, `[Backpressure] Waiting for ${res.writableLength} bytes to drain`);
    res.once('drain', () => {
      setImmediate(drainAndClose);
    });

    // Safety: force close after 5 seconds
    const timeout = setTimeout(drainAndClose, 5000);
    res.once('close', () => clearTimeout(timeout));
  } else {
    // No buffered data, safe to close
    setImmediate(drainAndClose);
  }
}
```

2. **Test**:

```bash
npm run build
# Test with a long-form response (don't stop it)
# Should see: "[Backpressure] Waiting for... bytes to drain"
# Should see complete response, no truncation
```

### STEP 3: Message-Stop Timeout Protection (45 minutes)

**Implementation**:

1. **Edit `src/convert-to-anthropic-stream.ts` around line 36**:

After the TransformStream is created, add timeout protection:

```typescript
const messageStopTimeout = setTimeout(() => {
  debug(1, `[Stream] Message-stop deadline: forcing send`);
  if (!messageStopSent) {
    controller.enqueue({ type: "message_stop" });
    messageStopSent = true;
  }
}, 60000);

// Override enqueue to clear timeout when message_stop sent
const originalEnqueue = controller.enqueue.bind(controller);
controller.enqueue = function (chunk: AnthropicStreamChunk) {
  if (chunk.type === "message_stop" && !messageStopSent) {
    clearTimeout(messageStopTimeout);
    messageStopSent = true;
  }
  return originalEnqueue(chunk);
};
```

And in the `flush()` handler:

```typescript
flush(controller) {
  if (messageStopTimeout) clearTimeout(messageStopTimeout);

  // ... existing flush code ...
}
```

2. **Test**:

```bash
npm run build
# Send a request
# Check logs for "[Stream] Message-stop deadline"
# Should appear only if stream gets stuck
```

### STEP 4: Preserve Whitespace Structure (15 minutes)

**Implementation**:

1. **Edit `src/anthropic-proxy.ts` around line 475**:

```typescript
// OLD CODE:
if (system && providerName === "mlx") {
  system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

// NEW CODE:
if (system && providerName === "mlx") {
  // Preserve whitespace structure for model comprehension
  system = system
    .trim() // Only trim edges
    .replace(/[ \t]{2,}/g, " "); // Collapse excessive spaces/tabs
  // Keep newlines for formatting
}
```

2. **Test**:

```bash
npm run build
# Test with multi-line instructions
# Should see proper formatting preserved
```

### STEP 5: Add Request Logging (45 minutes)

**Implementation**:

1. **Create `src/request-logger.ts`** (see STABILITY_FIX_IMPLEMENTATION.md for full code)

2. **Update `src/anthropic-proxy.ts`** to use logging

3. **Test**:

```bash
npm run build
npm test
anyclaude
# Check logs
cat ~/.anyclaude/request-logs/*.jsonl | jq .
```

---

## Verification & Testing

### After All Fixes

```bash
# 1. Rebuild
npm run build

# 2. Run full test suite
npm test
# Should see: "75/75 PASS" (or higher)

# 3. Manual verification
ANYCLAUDE_DEBUG=2 anyclaude

# Type a test prompt:
# "test" or simple question

# Look for:
# - [Stream] Response closed successfully (not truncation)
# - [Backpressure] messages (shows drain handling)
# - No error messages
# - Complete response delivered

# 4. Test with longer response
# "explain how machine learning works"

# Should:
# - Take 10-15 seconds (not 25-35)
# - Complete without truncation
# - Show proper formatting

# 5. Check request logs
cat ~/.anyclaude/request-logs/*.jsonl | tail -5 | jq .
```

### Expected Results

After all fixes:

| Metric              | Before        | After    |
| ------------------- | ------------- | -------- |
| System Prompt Size  | 11.4KB        | <3KB     |
| First-Token Latency | 25-35s        | 10-15s   |
| Truncation Rate     | ~5-10%        | ~0%      |
| Stability           | Unpredictable | Reliable |
| Cache Hit Rate      | 28.6%         | >80%     |

---

## Performance Benchmarking

### Create Benchmark Script

```bash
cat > scripts/benchmark.sh << 'EOF'
#!/bin/bash

echo "=== anyclaude Performance Benchmark ==="
echo ""

# Test 1: First-token latency
echo "Test 1: First-Token Latency"
echo "Prompt: 'hello, how are you?'"
time (echo "hello, how are you?" | timeout 30 ANYCLAUDE_DEBUG=1 anyclaude 2>&1 | head -100)

echo ""

# Test 2: Large response
echo "Test 2: Large Response Handling"
echo "Prompt: 'explain how machine learning works in detail'"
time (echo "explain how machine learning works in detail" | timeout 60 ANYCLAUDE_DEBUG=1 anyclaude 2>&1 | tail -20)

echo ""

# Test 3: Multiple requests
echo "Test 3: Cache Hit Rate (identical prompts)"
for i in {1..3}; do
  echo "Request $i"
  echo "test" | timeout 20 anyclaude > /dev/null 2>&1
done
cat .anyclaude-cache-metrics.json | jq '.metrics.hitRate'

echo ""
echo "=== Benchmark Complete ==="
EOF

chmod +x scripts/benchmark.sh
./scripts/benchmark.sh
```

---

## Troubleshooting

### Issue: Truncation Still Occurring

**Diagnosis**:

```bash
# Check write buffer size
cat ~/.anyclaude/logs/*.log | grep -i "buffer\|drain\|writablelength"

# Check for drain timeouts
cat ~/.anyclaude/logs/*.log | grep -i "timeout"
```

**Solution**:

1. Increase drain timeout from 5000ms to 10000ms
2. Check if MLX is slow to respond
3. Try with LMStudio to verify (LMStudio is more stable)

### Issue: Cache Hit Rate Still Low

**Diagnosis**:

```bash
# Check cache hashes
cat ~/.anyclaude/traces/mlx/*.json | jq '.request.body | {system: (.system | length), tools: .tools | length}' | sort | uniq -c
```

**Solution**:

1. Verify system prompt is reduced (should be <3KB)
2. Check if tools are changing between requests
3. Ensure cache hash includes full system+tools JSON (it should after our earlier fix)

### Issue: MLX Still Unstable Compared to LMStudio

**Diagnosis**:

1. Run benchmark with both backends
2. Compare latencies and error rates
3. Check logs for MLX specific messages

**Solution**:

1. Could be model-specific (try different MLX model)
2. Could be hardware issue (check CPU/GPU utilization)
3. Try LMStudio as primary backend for comparison
4. Use MLX for secondary work (build, typing code)

---

## Next Steps

1. **Implement all 5 fixes** (2-3 hours total)
2. **Test thoroughly** (30 minutes)
3. **Benchmark improvements** (15 minutes)
4. **Compare with LMStudio** (15 minutes)
5. **Decide on primary backend** based on results

### Choosing Your Primary Backend

**Use MLX if**:

- Performance improvements outweigh stability concerns
- Latency is more important than reliability
- You can build separate from coding tasks

**Use LMStudio if**:

- Stability is more important than speed
- You need consistent behavior
- You're doing critical work

**Recommended Strategy**:

- Use both for different purposes
- MLX for quick analysis, building
- LMStudio for critical development work
- Can switch with `.anyclauderc.json`

---

## Summary

The issues you're experiencing are caused by:

1. **Oversized System Prompt** (11.4KB) → Slow startup
2. **Incomplete Stream Draining** → Truncation
3. **No Timeout Protection** → Stuck requests
4. **Aggressive Whitespace Stripping** → Model confusion
5. **No Observability** → Can't diagnose issues

**All are fixable** with the 5 changes outlined here.

**Expected Outcome**: Stable, reliable Claude Code on local hardware with 10-20 second latency improvement.

**Time Investment**: 2-3 hours now → Stable system forever.

Start with FIX #1 (system prompt reduction) - that's the biggest win.
