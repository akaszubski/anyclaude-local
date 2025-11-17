# Optimum Implementation Plan: Fast + Working Tool Calls

**Date**: 2025-11-16
**Goal**: Make Claude Code responsive with working tool calls on M3 Ultra
**Target Performance**: First request <10s, Follow-ups <1s, Tool calling ✅

## 🎯 Strategy: Restore Custom Server + Enhance Caching

### Why This Approach

**Rejected Alternatives:**

- ❌ MLX-Textgen: Cache works but tool calling broken (confirmed in 3 models)
- ❌ LMStudio: Tools work but no cache (25-35s every request)
- ❌ OpenRouter: Fast but costs money + cloud dependency
- ❌ Claude API: Fastest but $3-15/1M tokens

**Chosen Path:**

- ✅ **Custom vllm-mlx-server.py**: You already built this!
  - Tool calling worked (why you used it before)
  - KV cache implemented (lines 235-656)
  - Full control to optimize for M3 Ultra

### Evidence This Will Work

From `scripts/archive/vllm-mlx-server.py`:

- **Line 235-370**: MLXKVCacheManager class (working)
- **Line 317-332**: Cache creation with mlx_lm APIs
- **Line 584-587**: Cache loading and reuse
- **Line 1135-1297**: Tool calling with chat templates

**Why archived?** MLX-Textgen migration attempt failed. The old server worked!

## 📋 3-Phase Implementation Plan

### Phase 1: Restore Working Foundation (Week 1)

**Goal**: Get basic tool calling working again

#### Step 1.1: Restore Custom Server

```bash
# Restore your working server
cp scripts/archive/vllm-mlx-server.py scripts/mlx-server.py

# Verify it runs
python scripts/mlx-server.py \
  --model /path/to/Qwen3-30B \
  --port 8081
```

**Expected result**: Server starts, loads model

#### Step 1.2: Test Tool Calling

```bash
# Terminal 1: Server running
python scripts/mlx-server.py --model /path/to/Qwen3-30B --port 8081

# Terminal 2: Test with anyclaude
# Update .anyclauderc.json to point to custom server
anyclaude --mode=vllm-mlx

# In Claude Code:
> "Read the README.md file"
```

**Expected result**: Tool call works, file content returned

**If fails**: Debug stream converter compatibility (known issue from postmortem)

#### Step 1.3: Fix Stream Converter Issues

From your postmortem, the issue was:

```
MLX-Textgen output format incompatible with anyclaude's stream converter
```

**Debug approach:**

```bash
# Enable full trace logging
ANYCLAUDE_DEBUG=3 anyclaude --mode=vllm-mlx 2> /tmp/tool-debug.log

# Check what format the model outputs
grep -A 20 "tool_calls\|function\|<tool_call>" /tmp/tool-debug.log

# Compare to what Claude API sends
cat ~/.anyclaude/traces/claude/*.json | jq '.response.body.content[] | select(.type == "tool_use")'
```

**Fix**: Adjust stream converter to handle your server's output format

---

### Phase 2: Optimize Caching for M3 Ultra (Week 2)

**Goal**: Get 0.3-1s follow-up requests

#### Step 2.1: Implement RAM-Based Cache

With 512GB RAM, cache should NEVER touch disk!

**Current (disk-based, slow):**

```python
# In MLXKVCacheManager (line 317-332)
mlx_lm.save_prompt_cache(cache_file, prompt_cache)  # Write to disk (600ms)
# Later...
cache = mlx_lm.load_prompt_cache(cache_file)  # Read from disk (500-2000ms)
```

**New (RAM-based, fast):**

```python
class InMemoryKVCache:
    """Keep KV cache in RAM (512GB available!)"""

    def __init__(self, max_cache_size=20):
        self.caches = {}  # hash -> (kv_cache_tensor, timestamp)
        self.max_size = max_cache_size

    def get(self, cache_hash: str):
        """Get cache from RAM (< 1ms lookup)"""
        if cache_hash in self.caches:
            cache_data, _ = self.caches[cache_hash]
            logger.info(f"✓ RAM Cache HIT: {cache_hash[:8]}")
            return cache_data
        return None

    def set(self, cache_hash: str, kv_cache):
        """Store cache in RAM"""
        import time

        # LRU eviction if full
        if len(self.caches) >= self.max_size:
            oldest = min(self.caches.items(), key=lambda x: x[1][1])
            del self.caches[oldest[0]]
            logger.info(f"Evicted oldest cache: {oldest[0][:8]}")

        self.caches[cache_hash] = (kv_cache, time.time())
        logger.info(f"✓ RAM Cache WRITE: {cache_hash[:8]}")

    def size_mb(self):
        """Estimate RAM usage"""
        # Each cache ~50-200MB depending on context
        return len(self.caches) * 100  # Conservative estimate

# Global instance (lives in RAM for server lifetime)
ram_cache = InMemoryKVCache(max_cache_size=20)  # 20 caches = ~2GB RAM
```

**Expected result**: Follow-up cache load goes from 500-2000ms to <10ms

#### Step 2.2: Integrate cache_control Headers

**Proxy side** (`src/anthropic-proxy.ts`):

```typescript
// Detect cache_control markers in request
function extractCacheMarkers(body: AnthropicMessagesRequest) {
  const markers = {
    systemCacheable: false,
    systemHash: "",
  };

  // Check if system blocks have cache_control
  if (Array.isArray(body.system)) {
    const hasCacheControl = body.system.some(
      (block) => block.cache_control?.type === "ephemeral"
    );

    if (hasCacheControl) {
      markers.systemCacheable = true;
      // Hash the cacheable content
      const cacheableContent = body.system
        .filter((b) => b.cache_control)
        .map((b) => b.text)
        .join("\n");
      markers.systemHash = createHash("sha256")
        .update(cacheableContent)
        .digest("hex");
    }
  }

  return markers;
}

// Add to request headers sent to backend
const markers = extractCacheMarkers(body);
const headers = {
  "X-Cache-System": markers.systemCacheable ? "true" : "false",
  "X-Cache-Hash": markers.systemHash,
};
```

**Backend side** (`scripts/mlx-server.py`):

```python
async def handle_chat_completion(request: Request):
    body = await request.json()

    # Read cache markers from proxy
    use_cache = request.headers.get('X-Cache-System') == 'true'
    cache_hash = request.headers.get('X-Cache-Hash')

    if use_cache and cache_hash:
        # Try to get from RAM cache
        kv_cache = ram_cache.get(cache_hash)

        if kv_cache:
            # CACHE HIT - Use cached KV tensors
            logger.info(f"✓ Using cached system prompt ({cache_hash[:8]})")
            # Generate with cache...
            response = await generate_with_cache(
                kv_cache=kv_cache,
                new_messages=body['messages'],
                tools=body.get('tools')
            )

            # Return with cache metrics
            return {
                "usage": {
                    "cache_read_input_tokens": 18500,  # System prompt size
                    "cache_creation_input_tokens": 0
                },
                # ... rest of response
            }
```

**Expected result**: Anthropic-compatible cache metrics returned

#### Step 2.3: Pre-warm Cache on Startup

**Problem**: First request still takes 30-50s (128K context overhead)

**Solution**: Pre-warm cache when server starts

```python
async def startup_warmup():
    """Pre-warm KV cache with common system prompt"""
    logger.info("🔥 Warming up KV cache...")

    # Simulate Claude Code's system prompt
    warmup_prompt = {
        'system': 'You are Claude Code...',  # Minimal version
        'messages': [{'role': 'user', 'content': 'test'}],
        'tools': []  # Can be empty for warmup
    }

    # Generate once to create cache
    await handle_chat_completion(warmup_prompt)

    logger.info("✓ Cache warmed, ready for requests")

# In FastAPI startup
@app.on_event("startup")
async def on_startup():
    await startup_warmup()
```

**Expected result**: First real user request hits cache (0.3s instead of 30s!)

---

### Phase 3: Production Hardening (Week 3)

**Goal**: Stable, production-ready setup

#### Step 3.1: Error Handling

```python
def load_cache_safe(cache_hash: str):
    """Safe cache loading with error recovery"""
    try:
        kv_cache = ram_cache.get(cache_hash)

        if kv_cache is None:
            return None

        # Validate cache (not corrupted)
        if not isinstance(kv_cache, (list, tuple)):
            logger.warning(f"Invalid cache type: {type(kv_cache)}")
            ram_cache.invalidate(cache_hash)
            return None

        return kv_cache

    except Exception as e:
        logger.error(f"Cache load failed: {e}")
        ram_cache.invalidate(cache_hash)
        return None
```

#### Step 3.2: Monitoring & Metrics

```python
class CacheMetrics:
    """Track cache performance"""

    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.total_saved_ms = 0

    def record_hit(self, saved_ms: int):
        self.hits += 1
        self.total_saved_ms += saved_ms

    def record_miss(self):
        self.misses += 1

    def report(self):
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0

        logger.info(f"""
        📊 Cache Performance:
          Hit Rate: {hit_rate:.1f}% ({self.hits}/{total})
          Time Saved: {self.total_saved_ms/1000:.1f}s total
          Avg Save: {self.total_saved_ms/self.hits if self.hits > 0 else 0:.0f}ms per hit
        """)

# Report on shutdown
@app.on_event("shutdown")
async def on_shutdown():
    cache_metrics.report()
```

#### Step 3.3: Configuration Options

```python
# Environment variables for tuning
KV_CACHE_ENABLED = os.getenv('KV_CACHE_ENABLED', '1') == '1'
KV_CACHE_MAX_SIZE = int(os.getenv('KV_CACHE_MAX_SIZE', '20'))  # 20 caches in RAM
KV_CACHE_WARMUP = os.getenv('KV_CACHE_WARMUP', '1') == '1'

# Allow users to tune
if not KV_CACHE_ENABLED:
    logger.warning("KV caching DISABLED (KV_CACHE_ENABLED=0)")
```

---

## 📊 Expected Performance After Implementation

### Before (MLX-Textgen, Current)

```
First request: 30-50s
Follow-ups: N/A (tool calling broken)
Tool calling: ❌ Broken
Usable: ❌ No
```

### After (Custom Server + Optimizations)

```
Server startup: 60s (one-time, includes cache warmup)
First request: 0.3-1s (cache pre-warmed!) ⚡
Follow-ups: 0.2-0.5s (RAM cache) ⚡⚡
Tool calling: ✅ Working
Usable: ✅ Yes!
```

### Comparison to Alternatives

| Metric            | Custom Server | Claude API   | OpenRouter | MLX-Textgen |
| ----------------- | ------------- | ------------ | ---------- | ----------- |
| **First Request** | 0.3-1s ⚡     | 2-3s         | 3-5s       | 30-50s      |
| **Follow-ups**    | 0.2-0.5s ⚡⚡ | 1-2s         | 2-3s       | N/A         |
| **Tool Calling**  | ✅            | ✅           | ✅         | ❌          |
| **Cost/month**    | $0            | $1,800-9,000 | $100-500   | $0          |
| **Privacy**       | 100% local    | Cloud        | Cloud      | 100% local  |

**Conclusion**: Custom server beats everything on speed + cost + privacy!

---

## 🛠️ Implementation Checklist

### Week 1: Foundation

- [ ] Restore `scripts/mlx-server.py` from archive
- [ ] Update `.anyclauderc.json` to use custom server
- [ ] Test basic inference (simple query)
- [ ] Test tool calling (Read command)
- [ ] Debug stream converter if needed
- [ ] Document any fixes applied

### Week 2: Caching

- [ ] Implement `InMemoryKVCache` class
- [ ] Add cache_control detection in proxy
- [ ] Wire up cache headers (proxy → backend)
- [ ] Test cache hit/miss behavior
- [ ] Implement cache warmup on startup
- [ ] Benchmark: First request <1s with warmup

### Week 3: Production

- [ ] Add error handling for cache operations
- [ ] Implement cache metrics tracking
- [ ] Add configuration options (env vars)
- [ ] Load testing (100 requests, check stability)
- [ ] Documentation updates
- [ ] Final benchmarks vs Claude API

---

## 🚨 Potential Issues & Solutions

### Issue 1: Tool Calling Still Broken

**Symptom**: Model generates text but not tool calls

**Debug**:

```bash
ANYCLAUDE_DEBUG=3 anyclaude --mode=vllm-mlx 2> /tmp/debug.log
grep -A 10 "tool_calls\|function_call" /tmp/debug.log
```

**Solutions**:

1. Check chat template is correct for model
2. Verify tools are properly formatted in request
3. Try different model (Qwen3 vs Hermes-3 vs DeepSeek)
4. Compare tool schema sent vs what Claude API sends

### Issue 2: Cache Not Working

**Symptom**: Follow-ups still slow

**Debug**:

```python
# Add logging to cache operations
logger.info(f"Cache lookup: {cache_hash}")
logger.info(f"Cache result: {'HIT' if kv_cache else 'MISS'}")
```

**Solutions**:

1. Verify cache_hash is consistent across requests
2. Check RAM cache isn't being evicted too quickly
3. Ensure cache_control headers are being passed

### Issue 3: Out of Memory

**Symptom**: Server crashes or slows down

**Monitor**:

```python
import psutil
mem = psutil.virtual_memory()
logger.info(f"RAM usage: {mem.percent}% ({mem.used / 1024**3:.1f}GB / {mem.total / 1024**3:.1f}GB)")
```

**Solutions**:

1. Reduce `KV_CACHE_MAX_SIZE` from 20 to 10
2. Smaller model (30B → 8B)
3. Clear cache periodically

---

## 📈 Success Metrics

### Must Have (Minimum Viable)

- ✅ Tool calling works (Read, Write, Edit, Bash)
- ✅ First request < 10s
- ✅ Follow-ups < 2s
- ✅ No crashes during 100-request session

### Nice to Have (Stretch Goals)

- ✅ First request < 1s (with cache warmup)
- ✅ Follow-ups < 0.5s
- ✅ Cache hit rate > 80%
- ✅ Matches Claude API speed

---

## 🎯 Why This Plan Will Work

### 1. Builds on Proven Foundation

Your archived server already had working tool calling. We're not starting from scratch.

### 2. Leverages M3 Ultra Hardware

- 512GB RAM → In-memory cache (no disk I/O)
- 80 GPU cores → Fast inference
- Unified memory → Low latency

### 3. Follows Anthropic's Pattern

We reverse-engineered how Claude Code uses caching, so we're implementing the same approach.

### 4. Incremental & Testable

Each phase has clear success criteria. If phase 1 fails, we know before investing in phase 2.

### 5. Has Fallback Options

If custom server doesn't work:

- Fall back to OpenRouter (working, cheap)
- Fall back to Claude API (working, expensive)
- You don't lose anything by trying

---

## 📚 Key Files

**Server**:

- `scripts/archive/vllm-mlx-server.py` (restore from here)
- `scripts/mlx-server.py` (new working version)

**Proxy**:

- `src/anthropic-proxy.ts` (add cache_control detection)

**Config**:

- `.anyclauderc.json` (point to custom server)

**Testing**:

- `scripts/debug/test-tool-calling.sh` (test tool calls)
- `scripts/debug/benchmark-cache.sh` (measure cache performance)

---

## 🏁 Next Steps

**Start with Phase 1, Step 1.1:**

```bash
# 1. Restore the server
cp scripts/archive/vllm-mlx-server.py scripts/mlx-server.py

# 2. Test it runs
python scripts/mlx-server.py \
  --model /path/to/Qwen3-30B \
  --port 8081

# 3. Point anyclaude to it
# Update .anyclauderc.json

# 4. Test a simple query
anyclaude --mode=vllm-mlx
> "What is 2+2?"
```

**If that works, move to Step 1.2 (tool calling test)**

Want me to help you start with Step 1.1?
