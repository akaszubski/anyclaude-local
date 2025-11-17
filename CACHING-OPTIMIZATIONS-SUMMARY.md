# Caching Optimizations Summary

## Problem

User reported "it was ok but not great" performance, even after switching to Qwen2.5-Coder-7B model. Analysis revealed:

**System overhead sent EVERY request:**
- System prompt: ~3,500 tokens
- Tool definitions: ~15,700 tokens
- **Total: ~19,000 tokens of redundant overhead per request**

Even with MLX's automatic KV caching, this caused:
1. Network overhead transmitting 19K tokens each time
2. Tokenization overhead
3. Poor cache hit rates due to growing conversation history
4. ~20 second responses for simple "who are you?" queries

## Solution: Three-Layer Caching Strategy

### Layer 1: Proxy-Side System Prompt Caching ✅

**File**: `src/anthropic-proxy.ts`

**What it does:**
- First request: Proxy sends full system prompt + tools to MLX server
- Subsequent requests: Proxy sends minimal `<cached:hash>` marker instead
- **Savings**: ~19,000 tokens NOT sent on follow-up requests (90%+ reduction!)

**How it works:**
```typescript
// First request (cache MISS)
system: "You are Claude Code, Anthropic's official CLI..." (3500 tokens)
tools: [... 17 tool definitions ...] (15,700 tokens)
→ Total sent: ~19,000 tokens

// Second request (cache HIT)
system: "<cached:a1b2c3d4e5f6>"  (20 characters = ~5 tokens)
tools: undefined  (0 tokens)
→ Total sent: ~5 tokens

// Savings: 19,000 - 5 = 18,995 tokens (99.97% reduction!)
```

### Layer 2: MLX Server Cache Key Recognition ✅

**File**: `scripts/mlx-server.py`

**What it does:**
- Detects `<cached:hash>` markers from proxy
- Looks up full system prompt + tools from in-memory cache
- Restores them before processing request
- On first request, caches system+tools for future use

**How it works:**
```python
# Detect cache marker
if content.startswith("<cached:") and content.endswith(">"):
    cache_key = content[8:-1]  # Extract hash

    # Restore from cache
    cached_system = self.cached_systems.get(cache_key)
    if cached_system:
        system_prompt, cached_tools = cached_system
        messages[0]["content"] = system_prompt  # Restore full system
        tools = cached_tools  # Restore tools
```

### Layer 3: Aggressive Message History Trimming ✅

**Files**: `scripts/lib/smart_cache.py`, `scripts/mlx-server.py`

**What it does:**
- Keeps only last 2 conversation turns (4 messages total)
- Makes prompts more cache-friendly for MLX's automatic KV caching
- Prevents prompt from growing unboundedly

**Before trimming:**
```
Request 1: system + tools + msg1 + msg2 + msg3 + ...
Request 2: system + tools + msg1 + msg2 + msg3 + msg4 + ...
Request 3: system + tools + msg1 + msg2 + msg3 + msg4 + msg5 + ...
→ Prompts never match (no KV cache hits)
```

**After trimming (window=2):**
```
Request 1: system + tools + msg1
Request 2: system + tools + msg1 + msg2
Request 3: system + tools + msg2 + msg3 ← prefix matches!
→ MLX KV cache hits on system+tools portion
```

## Performance Impact

### Expected Improvements

**First request** (cache MISS):
- No change (still sends full system+tools)
- ~19,000 tokens processed
- Time: ~10-20 seconds (model dependent)

**Second request** (cache HIT):
- Proxy skips ~18,995 tokens
- MLX reuses cached system+tools from KV cache
- Only processes new conversation (2-4 messages)
- **Expected time: 1-3 seconds** (5-10x faster!)

**Subsequent requests**:
- Continue benefiting from both caching layers
- Speed depends on conversation complexity
- Simple queries: 1-3 seconds
- Tool calling: 3-8 seconds

### Combined Speedup

| Layer | Optimization | Impact |
|-------|-------------|---------|
| **Proxy** | Skip sending system+tools | 90% network reduction |
| **MLX KV Cache** | Reuse cached prefix tokens | 3-5x processing speedup |
| **History Trimming** | Better prefix matching | Higher cache hit rate |
| **TOTAL** | All layers combined | **5-10x overall speedup** |

## Implementation Files Changed

### TypeScript (Proxy Layer)
- `src/anthropic-proxy.ts`:
  - Added cache key detection
  - Send `<cached:hash>` instead of full system on cache hits
  - Use `requestTools` variable to avoid redeclaration

### Python (MLX Server Layer)
- `scripts/mlx-server.py`:
  - Added `cached_systems` dictionary in `__init__`
  - Detect and restore cached system+tools from markers
  - Reduced history window from 8 to 2 messages
  - Added MLX KV cache effectiveness logging

- `scripts/lib/smart_cache.py`:
  - Changed default `max_history` from 4 to 2 turns
  - Better prompt optimization for KV cache hits

## Testing

### Manual Test

```bash
# Exit any running session
/exit

# Start fresh
anyclaude

# First request (cache MISS - will be slower)
> who are you?
# Expect: ~10-20 seconds

# Second request (cache HIT - should be MUCH faster!)
> who are you?
# Expect: ~1-3 seconds (5-10x faster!)

# Third request (cache HIT)
> who are you?
# Expect: ~1-3 seconds
```

### Check Logs

```bash
# Look for cache hit messages
tail -f ~/.anyclaude/logs/mlx-server.log | grep -E "Proxy Cache|Smart Cache|MLX KV Cache"

# Expected output on second request:
# [Proxy Cache] Detected cache key: a1b2c3d4e5f6
# [Proxy Cache] HIT - Restored 14235 chars system + 17 tools from cache
# [Smart Cache] Trimmed 2 old messages (4 → 2) for better MLX KV cache hits
# [MLX KV Cache] Prompt structure: system=3526tok + tools=15737tok + conversation=2msgs = 19263tok total
```

## Configuration

All optimizations are **enabled by default**. No configuration needed!

To adjust history window (advanced):
```python
# In scripts/mlx-server.py, line 1383:
messages, optimization_metadata = optimize_messages(messages, max_history=2)
#                                                              ↑
#                                                  Change to 4 or 6 for longer context
```

## Rollback (if needed)

If caching causes issues:

1. **Disable proxy caching:**
```typescript
// In src/anthropic-proxy.ts, line 492:
if (cachedPrompt.cached && false) {  // Add "&& false" to disable
```

2. **Disable message trimming:**
```python
# In scripts/mlx-server.py, line 1383:
# messages, optimization_metadata = optimize_messages(messages, max_history=2)  # Comment out
```

3. **Rebuild:**
```bash
npm run build
```

## Next Steps

1. **Test the optimizations** (start anyclaude and try "who are you?" 3 times)
2. **Monitor cache hit rate** in logs
3. **Report performance** improvements

Expected result: **2-3 second responses** for simple queries (vs 20+ seconds before)!
