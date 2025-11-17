# Anthropic Prompt Caching Analysis (Reverse Engineered)

**Date**: 2025-11-16
**Source**: Real Claude Code → Anthropic API traffic captures
**Traces**: `~/.anyclaude/traces/claude/`

## 🎯 Key Findings

### Cache Control Placement

Claude Code marks content for caching as follows:

1. **System Prompts**: ✅ **BOTH** system blocks marked with `cache_control: { type: "ephemeral" }`
2. **Tools**: ❌ **NO** tools marked with `cache_control` (0 out of 17)

This is **different** from Anthropic's documentation which suggests marking the last tool!

### Actual Request Structure

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code, Anthropic's official CLI for Claude...",
      "cache_control": { "type": "ephemeral" }  // ← First block cached!
    },
    {
      "type": "text",
      "text": "\nYou are an interactive CLI tool that helps users...",
      "cache_control": { "type": "ephemeral" }  // ← Second block also cached!
    }
  ],
  "tools": [
    {
      "name": "Read",
      "description": "Reads a file...",
      "input_schema": {...}
      // ❌ NO cache_control here!
    },
    // ... 16 more tools, none with cache_control
  ],
  "messages": [...]
}
```

### System Prompt Content

**System Block 1** (~18,000 tokens):

- Main Claude Code instructions
- Tool usage guidelines
- Examples and best practices

**System Block 2** (~500 tokens):

- Interactive CLI tool description
- Additional instructions

**Total cacheable**: ~18,500 tokens (system prompts only)

### Tools (Not Cached)

17 tools sent in every request:

- Read, Write, Edit, Bash, Git, WebSearch, etc.
- Each tool has: name, description, input_schema
- **None** have `cache_control` markers
- Estimated size: ~5,000-10,000 tokens

## 📊 Response Format (Expected)

Based on Anthropic docs, responses should include:

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [...],
  "model": "claude-sonnet-4-5-20250929",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 50,                      // New user input only
    "output_tokens": 256,
    "cache_creation_input_tokens": 18500,    // First request
    "cache_read_input_tokens": 0
  }
}
```

**On cache hit:**

```json
{
  "usage": {
    "input_tokens": 50, // New user input only
    "output_tokens": 256,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 18500 // ← Retrieved from cache!
  }
}
```

**Note**: Our traces have streaming responses (response.body is a string), so usage metrics weren't captured in full response format.

## 🔍 Implications for vllm-mlx Implementation

### What to Cache

Based on actual Claude Code behavior:

1. **Cache the system prompt blocks**
   - All system blocks marked with `cache_control: ephemeral`
   - ~18,500 tokens total

2. **Do NOT cache tools**
   - Claude Code doesn't mark them
   - Tools change less frequently anyway
   - Would add complexity without clear benefit

### Cache Key Strategy

```python
# Build cache key from system blocks only
cache_key_parts = []

for block in request['system']:
    if block.get('cache_control', {}).get('type') == 'ephemeral':
        cache_key_parts.append(('system', block['text']))

cache_hash = hashlib.sha256(
    json.dumps(cache_key_parts, sort_keys=True).encode()
).hexdigest()
```

### KV Cache Implementation

```python
# Check for cache hit
kv_cache_path = f"{CACHE_DIR}/{cache_hash}.npz"

if os.path.exists(kv_cache_path):
    # CACHE HIT - Load pre-computed KV tensors
    kv_cache = load_kv_cache(kv_cache_path)
    cache_read_tokens = estimate_system_tokens(cache_key_parts)

    # Generate with cached system prompt
    response = generate_with_cache(
        system_kv_cache=kv_cache,  # ← Skip system recomputation!
        tools=request['tools'],
        messages=request['messages']
    )

    return {
        "usage": {
            "cache_read_input_tokens": cache_read_tokens,  # ← ~18,500
            "cache_creation_input_tokens": 0
        }
    }
else:
    # CACHE MISS - Compute and save
    response, kv_cache = generate_and_save_cache(
        system=request['system'],
        tools=request['tools'],
        messages=request['messages']
    )

    save_kv_cache(kv_cache, kv_cache_path)

    return {
        "usage": {
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": estimate_system_tokens(cache_key_parts)
        }
    }
```

## 💡 Key Insights

### 1. Simpler Than Expected

Claude Code only caches system prompts, not tools. This makes implementation simpler:

- ✅ Fewer cache keys to manage
- ✅ Smaller cache storage (just system prompt KV tensors)
- ✅ More predictable cache hit rate

### 2. System Prompt is the Bottleneck

The ~18,500 token system prompt is what's killing performance:

- First request: ~30 seconds to process 18,500 tokens
- Follow-up: Could be <1 second if cached!
- **30x speedup potential** from caching system only

### 3. Tools Don't Need Caching

Tools (~5,000-10,000 tokens) are:

- Smaller than system prompt
- Less expensive to reprocess
- Not marked by Claude Code
- Can be processed fresh each time

### 4. Cache Hit Rate

With system-only caching:

- Cache key = hash of both system blocks
- Cache valid for ~5 minutes (ephemeral TTL)
- Hit rate depends on how often system changes
- In practice: Very high (system rarely changes during a session)

## 📋 Implementation Checklist

### Phase 1: Detect Cache Markers (Proxy)

- [ ] Extract `cache_control` from system blocks
- [ ] Build cache key from marked blocks
- [ ] Pass cache key to backend via custom header

### Phase 2: Implement KV Caching (Backend)

- [ ] Receive cache key from proxy
- [ ] Check for existing KV cache file
- [ ] Load cached KV tensors on hit
- [ ] Generate and save KV cache on miss
- [ ] Return proper usage metrics

### Phase 3: Test & Verify

- [ ] First request shows `cache_creation_input_tokens > 0`
- [ ] Second request shows `cache_read_input_tokens > 0`
- [ ] Speed improvement: 20-30x on follow-ups
- [ ] Cache metrics match Anthropic format

## 🔬 Testing Protocol

```bash
# Run vllm-mlx with caching implementation
anyclaude --mode=vllm-mlx

# Request 1 (cache write)
> Ask: "What is 2+2?"
Expected: ~30 seconds, cache_creation_input_tokens: 18500

# Request 2 (same query = cache hit)
> Ask: "What is 2+2?"
Expected: <1 second, cache_read_input_tokens: 18500

# Request 3 (different query = still cache hit on system)
> Ask: "Write a hello world function"
Expected: <2 seconds, cache_read_input_tokens: 18500
```

## 📚 References

- **Trace Files**: `~/.anyclaude/traces/claude/2025-11-16T*.json`
- **Analysis Script**: `scripts/debug/analyze-cache-traces.sh`
- **Anthropic Docs**: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- **Our Implementation**: `src/anthropic-proxy.ts`, `scripts/vllm-mlx-server.py`

## 🎯 Next Steps

1. **Implement proxy cache detection** (extract cache_control from system)
2. **Pass to backend** (custom header with cache key)
3. **Implement vllm-mlx KV caching** (load/save KV tensors)
4. **Test end-to-end** (verify 20-30x speedup)
5. **Document usage** (update README with caching info)
