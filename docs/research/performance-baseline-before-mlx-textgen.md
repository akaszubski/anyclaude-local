# Performance Baseline - Before MLX-Textgen Migration

**Date:** 2025-11-16
**Hardware:** M3 Ultra with 512GB RAM
**Model:** Qwen3-Coder-30B-A3B-Instruct-MLX-4bit

## Current Performance (mlx-server.py)

### Response Times

- **Average request:** 45-50 seconds
- **First request:** ~50 seconds (cold start)
- **Follow-up requests:** ~45-50 seconds (KV cache broken, no speedup)

### Throughput

- **Tokens/second:** 807 tokens/sec
- **Expected throughput:** 2000-3000 tokens/sec (M3 Ultra should do better)

### Cache Performance

**Layer 1: Client-Side Caching (anyclaude proxy)**

- Token savings: 84.6%
- Cache hits: 3/7 requests (42.86%)
- Total input tokens: 56,711
- Cache creation tokens: 15,387
- Cache read tokens: 24,306
- **Status:** ✅ Working

**Layer 2: Response Cache (anyclaude proxy)**

- Hit rate: 42.9%
- **Status:** ✅ Working

**Layer 3: MLX KV Cache (mlx-server.py)**

- Cache creation attempts: Multiple
- Cache files created: 0 (empty ~/.anyclaude/kv-cache/)
- **Status:** ❌ Broken (Python API doesn't exist)

### Issues

1. **No working KV caching** - MLX-LM Python API for prompt caching doesn't exist
2. **No speedup on follow-up requests** - Every request processes full 43K token prompt
3. **Below expected throughput** - 807 tokens/sec vs expected 2000-3000 tokens/sec

## Migration Goals (MLX-Textgen)

### Expected Performance

- **First request:** ≤60 seconds (cache creation)
- **Follow-up requests:** 2-5 seconds (**10-20x speedup**)
- **Throughput:** 2000-3000 tokens/sec

### Expected Benefits

- ✅ Working disk-based KV caching
- ✅ Multi-slot cache (no overwriting)
- ✅ Native tool calling support
- ✅ Production-ready server
- ✅ Less maintenance (1400 lines → pip package)

## Test Methodology

Performance measured during actual Claude Code usage:

- Reading README.md and summarizing
- Multi-turn conversations
- Tool calling (Read, Write, Edit)
- Debug logging enabled (ANYCLAUDE_DEBUG=2)

**Logs analyzed:**

- `~/.anyclaude/logs/mlx-server.log`
- `.anyclaude-cache-metrics.json`
- Debug session logs
