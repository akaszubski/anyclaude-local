# Reverse Engineering Anthropic's Prompt Caching

**Goal**: Understand exactly how Claude Code uses Anthropic's prompt caching, then replicate it in our mlx backend.

## Quick Start

```bash
# Step 1: Capture real Anthropic API traffic
./scripts/debug/capture-anthropic-caching.sh

# During Claude Code session:
# 1. Ask: "What is 2+2?"
# 2. Ask again: "What is 2+2?" (same request = cache hit!)
# 3. Ask: "Write a hello world function" (different = cache miss)
# 4. Exit with /exit

# Step 2: Analyze captured traces
./scripts/debug/analyze-cache-traces.sh

# Step 3: View implementation template
cat ~/.anyclaude/analysis/mlx-cache-implementation.md
```

## What We're Looking For

### 1. Request Format - Where does `cache_control` appear?

**Expected pattern** (from Anthropic docs):

```json
{
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code..."
    },
    {
      "type": "text",
      "text": "More instructions...",
      "cache_control": { "type": "ephemeral" }  // ← Last block marked
    }
  ],
  "tools": [
    { "name": "Read", ... },
    { "name": "Write", ... },
    { "name": "Edit", ... },
    ...
    {
      "name": "WebSearch",
      "cache_control": { "type": "ephemeral" }  // ← Last tool marked
    }
  ]
}
```

**Key insight**: Anthropic only marks the LAST item in arrays with `cache_control`. This marks everything up to that point as cacheable.

### 2. Response Format - Cache Metrics

**First request (cache write):**

```json
{
  "usage": {
    "input_tokens": 50, // Only user input
    "output_tokens": 256,
    "cache_creation_input_tokens": 18490, // ← System + tools cached
    "cache_read_input_tokens": 0
  }
}
```

**Second request (cache hit):**

```json
{
  "usage": {
    "input_tokens": 50, // Only user input
    "output_tokens": 256,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 18490 // ← Retrieved from cache!
  }
}
```

**Key insight**:

- `input_tokens` = only NEW tokens (excludes cached)
- `cache_creation_input_tokens` = tokens written to cache (first request)
- `cache_read_input_tokens` = tokens retrieved from cache (follow-up)

### 3. Cache Behavior

**From Anthropic documentation:**

- Cache TTL: 5 minutes (ephemeral type)
- Cache key: Exact match of cacheable content
- Cache applies to: System prompt + tools (marked with cache_control)

## Expected Traces

After running `capture-anthropic-caching.sh`, you should see:

```
~/.anyclaude/traces/claude/
  2025-11-16T10-30-00-123Z.json  ← Request 1 (cache write)
  2025-11-16T10-30-15-456Z.json  ← Request 2 (cache hit!)
  2025-11-16T10-30-30-789Z.json  ← Request 3 (cache miss)
```

**View with:**

```bash
# Pretty print first trace
cat ~/.anyclaude/traces/claude/2025-11-16T10-30-00-*.json | jq .

# Extract just cache_control markers
jq '.request.body.system[] | select(.cache_control)' ~/.anyclaude/traces/claude/*.json

# Extract cache metrics
jq '.response.body.usage | {input_tokens, cache_creation_input_tokens, cache_read_input_tokens}' ~/.anyclaude/traces/claude/*.json
```

## Implementation Plan

Once we understand the pattern, we'll implement it in 3 layers:

### Layer 1: Proxy (src/anthropic-proxy.ts)

**Detect cache markers:**

```typescript
function extractCacheMarkers(body: AnthropicMessagesRequest) {
  const markers = {
    systemCacheable: false,
    toolsCacheable: false,
  };

  // Check if last system block has cache_control
  if (Array.isArray(body.system) && body.system.length > 0) {
    const lastBlock = body.system[body.system.length - 1];
    if (lastBlock?.cache_control?.type === "ephemeral") {
      markers.systemCacheable = true;
    }
  }

  // Check if last tool has cache_control
  if (body.tools && body.tools.length > 0) {
    const lastTool = body.tools[body.tools.length - 1];
    if (lastTool?.cache_control?.type === "ephemeral") {
      markers.toolsCacheable = true;
    }
  }

  return markers;
}
```

**Pass to backend via custom headers:**

```typescript
const headers = {
  "X-Cache-System": markers.systemCacheable ? "true" : "false",
  "X-Cache-Tools": markers.toolsCacheable ? "true" : "false",
};
```

### Layer 2: Backend (scripts/mlx-server.py)

**Read cache markers:**

```python
async def handle_request(request: Request):
    # Extract cache control from custom headers
    cache_system = request.headers.get('X-Cache-System') == 'true'
    cache_tools = request.headers.get('X-Cache-Tools') == 'true'

    # Build cache key from cacheable components
    cache_key = build_cache_key(
        system=body['messages'][0]['content'] if cache_system else None,
        tools=body.get('tools') if cache_tools else None
    )
```

**Implement KV caching:**

```python
# Check for cache hit
kv_cache_path = f"{CACHE_DIR}/{cache_key}.npz"

if os.path.exists(kv_cache_path):
    # CACHE HIT
    kv_cache = load_kv_cache(kv_cache_path)
    cache_read_tokens = estimate_tokens(cached_content)

    response = generate_with_cache(
        prompt=prompt,
        kv_cache=kv_cache  # ← Skip recomputing!
    )

    return {
        "usage": {
            "cache_read_input_tokens": cache_read_tokens,
            "cache_creation_input_tokens": 0
        }
    }
else:
    # CACHE MISS
    response, kv_cache = generate_and_save_cache(prompt)
    save_kv_cache(kv_cache, kv_cache_path)

    return {
        "usage": {
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": estimate_tokens(cached_content)
        }
    }
```

### Layer 3: Testing

**Verify caching works:**

```bash
# Run with mlx backend
anyclaude --mode=mlx

# First request (should be slow, create cache)
# Ask: "What is 2+2?"
# Expected: ~30 seconds

# Second identical request (should be fast, hit cache)
# Ask: "What is 2+2?"
# Expected: <1 second (30x faster!)

# Check metrics
tail ~/.anyclaude/logs/debug-session-*.log | grep "cache_read_input_tokens"
# Should show: cache_read_input_tokens > 0
```

## Success Criteria

✅ Trace captures show `cache_control` markers on last system block and last tool

✅ First request returns `cache_creation_input_tokens > 0`

✅ Second identical request returns `cache_read_input_tokens > 0`

✅ mlx backend implements same pattern

✅ Local caching achieves 20-30x speedup on follow-up requests

✅ Cache metrics match Anthropic's format exactly

## References

- **Anthropic Prompt Caching Docs**: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- **Trace Logger**: `src/trace-logger.ts`
- **Cache Metrics**: `src/cache-metrics.ts`
- **Proxy**: `src/anthropic-proxy.ts`

## Troubleshooting

**No traces captured?**

- Check `ANTHROPIC_API_KEY` is set
- Or ensure `claude` auth session is active
- Run with `ANYCLAUDE_DEBUG=3` to verify

**Traces don't show cache_control?**

- Claude Code may not be using caching (old version?)
- Check Anthropic API version in traces
- Try making multiple identical requests

**Cache not working in mlx?**

- Verify cache markers detected in proxy
- Check mlx logs for cache hit/miss
- Ensure KV cache directory exists and is writable
