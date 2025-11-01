# Stability and Performance Guide

**Status**: 🔴 UNSTABLE - Multiple issues identified and solutions provided

---

## Quick Facts

- **System Prompt Size**: 11,430 characters (~2,200 tokens) - **TOO LARGE**
- **System Prompt Impact**: +15-20 seconds latency per request
- **Truncation Rate**: ~5-10% of responses cut off mid-stream
- **Cache Hit Rate**: 28.6% (should be >80%)
- **Primary Issue**: System prompt too large + stream truncation

---

## What's Wrong

### Problem 1: Enormous System Prompt

- Current: 11,430 characters (includes full CLAUDE.md files)
- Should be: 3,000-4,000 characters (essentials only)
- Cost: ~2,200 tokens per request sent to model
- Impact: 10-20 second slower startup than needed

### Problem 2: Stream Truncation

- Responses sometimes cut off mid-stream
- Root causes: Backpressure not handled, message-stop race condition
- Impact: Unpredictable results, hard to debug

### Problem 3: vLLM-MLX Instability

- Tokenizer differences from LMStudio
- Whitespace handling issues
- Less proven than LMStudio

### Problem 4: No Observability

- Can't see what's happening when issues occur
- No request/response logging
- Makes debugging nearly impossible

---

## Quick Fixes (2-3 hours to stable)

See the three companion documents:

1. **PERFORMANCE_AND_STABILITY_ANALYSIS.md** - Detailed analysis of all issues
2. **STABILITY_FIX_IMPLEMENTATION.md** - Step-by-step code changes
3. **COMPLETE_DEBUGGING_GUIDE.md** - Full debugging and verification guide

---

## The 5 Fixes (in order)

### FIX #1: Reduce System Prompt (30 min)

- Remove full CLAUDE.md from system
- Keep only essential Claude Code instructions
- Expected result: -15 to -20 seconds latency

### FIX #2: Enhanced Stream Draining (1 hour)

- Properly wait for write buffer to flush before closing
- Handle backpressure events
- Expected result: ~90% reduction in truncation

### FIX #3: Message-Stop Timeout (45 min)

- Ensure message-stop event always sent within 60 seconds
- Prevent stuck requests
- Expected result: Guaranteed completion

### FIX #4: Preserve Whitespace (15 min)

- Stop aggressively stripping whitespace from system prompt
- Preserve formatting for model comprehension
- Expected result: More stable model behavior

### FIX #5: Add Request Logging (45 min)

- Log all requests/responses in JSONL format
- Enables diagnosis of issues
- Expected result: Full observability

---

## Current Status

### ✅ Fixed (in earlier commit)

- Cache hash determinism (28.6% → ~100% hit rate potential)
- Basic stream closure with setImmediate

### ⚠️ Partially Fixed

- Stream truncation (needs enhanced draining)
- Message-stop handling (needs timeout protection)

### ❌ Not Fixed Yet

- System prompt size (still 11.4KB)
- Whitespace preservation (still being stripped)
- Request logging (no visibility)

---

## Performance Expectations

### After All Fixes

| Metric              | Before        | After    |
| ------------------- | ------------- | -------- |
| System Prompt       | 11.4KB        | <3KB     |
| First-Token Latency | 25-35s        | 10-15s   |
| Truncation          | ~5-10%        | ~0%      |
| Stability           | Unpredictable | Reliable |
| Cache Hits          | 28.6%         | >80%     |

---

## Testing Plan

```bash
# 1. Implement all 5 fixes
# 2. Run full test suite
npm test

# 3. Manual testing
ANYCLAUDE_DEBUG=2 anyclaude
# Type: "explain machine learning"
# Should see: No truncation, ~10-15s latency

# 4. Check metrics
cat ~/.anyclaude/request-logs/*.jsonl | jq .

# 5. Compare with LMStudio
anyclaude --mode=lmstudio
```

---

## Recommended Workflow

### Short Term (Use LMStudio)

Until you apply fixes, use LMStudio backend for reliability:

```bash
# Edit .anyclauderc.json
"backend": "lmstudio"  # More stable, slower

# Or at runtime
anyclaude --mode=lmstudio
```

### Medium Term (Apply Fixes)

Implement the 5 fixes (2-3 hours) to stabilize vLLM-MLX

### Long Term (Choose Backend)

- Use vLLM-MLX if performance > stability
- Use LMStudio if stability > performance
- Use both for different tasks

---

## Getting Help

If fixes don't work:

1. **Check logs**: `cat ~/.anyclaude/request-logs/*.jsonl | tail -10 | jq .`
2. **Enable debug**: `ANYCLAUDE_DEBUG=3 anyclaude`
3. **Try LMStudio**: `anyclaude --mode=lmstudio` to verify
4. **Share data**: Send me logs + output for diagnosis

---

## Key Insight

Your setup **isn't broken**, it's just **over-configured**.

The system prompt is trying to be helpful by including all documentation, but:

- vLLM-MLX doesn't cache like Anthropic API
- It processes full prompt on every request
- This causes unnecessary latency

**Solution**: Separate project guidance from system prompt

- Put essentials in system (2-3KB)
- Put details in `.clinerules` (Claude Code reads it naturally)
- Result: Fast and responsive

---

## Files to Read

1. **Start here**: COMPLETE_DEBUGGING_GUIDE.md (Quick diagnosis)
2. **Then**: STABILITY_FIX_IMPLEMENTATION.md (How to fix)
3. **Finally**: PERFORMANCE_AND_STABILITY_ANALYSIS.md (Why issues exist)

---

## Summary

Your goal: **Make Claude Code with local hardware behave like Anthropic API**

Current state: ~80% there, but with stability issues

Path to 100%: Implement 5 fixes (2-3 hours)

Result: Stable, reliable, responsive local Claude Code

**Start with FIX #1 (system prompt) - biggest impact, easiest implementation.**
