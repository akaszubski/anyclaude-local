# Cache Performance - Quick Start

## TL;DR

anyclaude now automatically tracks prompt caching performance and explains why you didn't see speed improvements yet (small payloads, vLLM limitations).

## Three Ways to Check Cache Performance

### 1. **Automatic Report** (Easiest)

```bash
# Just run normally - stats show on exit
ANYCLAUDE_DEBUG=2 anyclaude
# ... use Claude Code ...
# On exit: Shows cache hits, cost savings, etc.
```

### 2. **Benchmark Script** (Measure Real Gain)

```bash
./scripts/test/benchmark-cache.sh 3
# Shows: First request vs cached request latency
# Expected: ~85% faster on cached requests
```

### 3. **View Raw Metrics** (Deep Dive)

```bash
cat ~/.anyclaude/cache-metrics/*.json | jq
# Shows: Every request/response with cache stats
```

## Why Cache Didn't Feel Faster

Based on research of Anthropic API, MLX, and MLX:

| Factor               | Impact                    | Solution                             |
| -------------------- | ------------------------- | ------------------------------------ |
| **Ephemeral Cache**  | 5-min TTL only            | Make repeated requests within 5 min  |
| **Small Payload**    | System prompt ~500 bytes  | Need 1000+ cached tokens for benefit |
| **MLX**              | Cache not fully optimized | Use Anthropic API for real gains     |
| **One-off Requests** | No cache reuse            | Create multi-request workflows       |

## Expected Performance

### Anthropic API + Large Cached Prompt

```
Request 1: 2000ms (writes cache)
Request 2: 300ms  (reads cache) → 85% faster! ✓
Request 3: 290ms  (reads cache) → 85% faster! ✓
```

### MLX

- Cache headers set but limited latency benefit
- Better for cost reduction than speed
- Future improvements possible

## What's Now Available

| Feature              | File                              | Purpose                  |
| -------------------- | --------------------------------- | ------------------------ |
| **Metrics Tracking** | `src/cache-metrics.ts`            | Auto-records cache stats |
| **Benchmark Tool**   | `scripts/test/benchmark-cache.sh` | Measure performance      |
| **Documentation**    | `docs/caching/CACHE_STRATEGY.md`  | Complete guide           |
| **Integration**      | `src/anthropic-proxy.ts`          | Tracks all requests      |

## Quick Test

```bash
# 1. Make requests with large cached content
ANYCLAUDE_DEBUG=2 anyclaude

# 2. On exit, see:
# ✓ Cache hit rate
# ✓ Tokens cached
# ✓ Estimated cost savings (~90% per cached token)

# 3. For real gains, repeat identical requests within 5 minutes
```

## Key Numbers to Know

- **Anthropic Latency Savings**: Up to 85% on cached requests
- **Anthropic Cost Savings**: 90% per cached token
- **Cache Write Cost**: 25% premium (one-time)
- **Cache Read Cost**: 10% of base (huge savings!)
- **Cache TTL**: 5 minutes default
- **Min Benefit**: 1000+ cached tokens

## Debugging

```bash
# See cache hits/misses
ANYCLAUDE_DEBUG=2 anyclaude | grep Cache

# View metrics file
cat ~/.anyclaude/cache-metrics/*.json | jq '.[] | {timestamp, cacheHit, mode}'

# Run benchmark
./scripts/test/benchmark-cache.sh 3
```

## Next: Real Cache Gains

To see the promised 85% latency improvement:

1. **Anthropic API mode**: `ANYCLAUDE_MODE=claude anyclaude`
2. **Make request with large system prompt** (1000+ tokens)
3. **Make identical request within 5 minutes** → Watch it run 85% faster!

Or use the benchmark script:

```bash
./scripts/test/benchmark-cache.sh 3
```

## Files to Know

- **Metrics**: `~/.anyclaude/cache-metrics/TIMESTAMP.json`
- **Benchmark**: `./scripts/test/benchmark-cache.sh`
- **Strategy Guide**: `./docs/caching/CACHE_STRATEGY.md`
- **Implementation Details**: `./docs/caching/IMPLEMENTATION_SUMMARY.md`

## Resources

- [Anthropic Caching Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- [vLLM Prefix Caching](https://docs.vllm.ai/en/latest/automatic_prefix_caching/apc.html)
- See `docs/caching/CACHE_STRATEGY.md` for complete guide
