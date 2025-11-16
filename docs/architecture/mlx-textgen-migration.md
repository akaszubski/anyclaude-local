# MLX-Textgen Migration Design

**Date:** 2025-11-16
**Status:** Planning
**Author:** Claude Code (AI Assistant)

## Executive Summary

Migrate from custom `vllm-mlx-server.py` to production-grade **MLX-Textgen** server to enable working KV caching and 10-20x performance improvement for follow-up requests.

**Expected Performance:**

- First request: ~45-50s (builds cache)
- Follow-up requests: **2-5s** (vs current 45-50s)
- 10-20x speedup on repeated contexts

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code (Anthropic API format)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ anyclaude Proxy Layer (src/)                                │
│ ├─ anthropic-proxy.ts - HTTP server                         │
│ ├─ convert-anthropic-messages.ts - Format conversion        │
│ ├─ convert-to-anthropic-stream.ts - Stream conversion       │
│ ├─ prompt-cache.ts - Client-side caching (84.6% savings)    │
│ └─ cache-metrics.ts - Performance tracking                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend Servers                                             │
│ ├─ vllm-mlx → vllm-mlx-server.py (CUSTOM, 1400 lines)      │
│ │   ├─ MLX model loading                                    │
│ │   ├─ OpenAI API endpoint                                  │
│ │   ├─ Tool calling parsing (complex)                       │
│ │   ├─ KV caching (BROKEN - API doesn't exist)             │
│ │   └─ Response cache (works, 42.9% hit rate)              │
│ ├─ lmstudio → Remote LMStudio server                        │
│ ├─ openrouter → OpenRouter API                              │
│ └─ claude → Real Anthropic API                              │
└─────────────────────────────────────────────────────────────┘
```

### Current Issues

**vllm-mlx-server.py problems:**

1. ❌ **KV caching broken** - `mlx_lm` Python API for caching doesn't exist
2. ⚠️ **Complex tool calling** - 200+ lines of manual parsing (Harmony, Qwen XML formats)
3. ⚠️ **Single-threaded** - GPU lock prevents parallel requests
4. ⚠️ **Maintenance burden** - 1400 lines to maintain
5. ⚠️ **Performance** - No KV caching = slow follow-up requests (45-50s each)

**What works well:**

1. ✅ Client-side caching (84.6% token savings)
2. ✅ Response caching (42.9% hit rate)
3. ✅ Multi-backend abstraction
4. ✅ Auto-launch orchestration

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code (Anthropic API format)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ anyclaude Proxy Layer (UNCHANGED - still valuable!)         │
│ ├─ anthropic-proxy.ts - HTTP server                         │
│ ├─ convert-anthropic-messages.ts - Format conversion        │
│ ├─ convert-to-anthropic-stream.ts - Stream conversion       │
│ ├─ prompt-cache.ts - Client-side caching (84.6% savings)    │
│ └─ cache-metrics.ts - Performance tracking                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend Servers                                             │
│ ├─ vllm-mlx → MLX-Textgen (PRODUCTION-READY)               │
│ │   ✅ Built-in KV caching (disk-based, multi-slot)         │
│ │   ✅ Tool calling (native support)                         │
│ │   ✅ OpenAI API (drop-in compatible)                       │
│ │   ✅ Batch processing (optimized throughput)               │
│ │   ✅ Maintained by nath1295 (2025 updates)                 │
│ ├─ lmstudio → Remote LMStudio server                        │
│ ├─ openrouter → OpenRouter API                              │
│ └─ claude → Real Anthropic API                              │
└─────────────────────────────────────────────────────────────┘
```

### New Benefits

**MLX-Textgen advantages:**

1. ✅ **Working KV caching** - 10-20x speedup on follow-up requests
2. ✅ **Multi-slot disk cache** - Doesn't overwrite previous caches
3. ✅ **Native tool calling** - No manual parsing needed
4. ✅ **Production-tested** - Used by other projects
5. ✅ **Active maintenance** - Regular updates
6. ✅ **Simpler** - 1400 lines → `pip install mlx-textgen`

**anyclaude proxy still provides:**

1. ✅ Anthropic API compatibility (MLX-Textgen doesn't speak Anthropic format)
2. ✅ Client-side caching layer (token reduction)
3. ✅ Multi-backend abstraction (switch backends seamlessly)
4. ✅ Auto-launch orchestration
5. ✅ Response caching
6. ✅ Unified configuration

---

## Three-Layer Caching Strategy

After migration, you'll have **three working cache layers**:

### Layer 1: Client-Side (anyclaude proxy)

**Location:** `src/prompt-cache.ts`
**What:** Hashes system prompt + tools, reuses across requests
**Savings:** 84.6% token transmission reduction
**Speed:** Minimal impact (hash lookup)

### Layer 2: Response Cache (anyclaude proxy)

**Location:** `src/anthropic-proxy.ts` (PromptCache class)
**What:** Caches complete JSON responses by request hash
**Savings:** 42.9% hit rate (identical requests)
**Speed:** Instant (disk I/O)

### Layer 3: MLX KV Cache (MLX-Textgen)

**Location:** MLX-Textgen's cache directory
**What:** Caches model's key-value computations (the heavy part!)
**Savings:** 10-20x speedup on prefix reuse
**Speed:** **2-5s vs 45-50s** for follow-up requests

**Together:** These three layers provide maximum performance at every level.

---

## Migration Strategy

### Phase 1: Preparation ✓

- [x] Design new architecture
- [ ] Commit current working state to git
- [ ] Create backup of `vllm-mlx-server.py`
- [ ] Document current performance metrics

### Phase 2: Installation & Testing

- [ ] Install MLX-Textgen: `pip install mlx-textgen`
- [ ] Test standalone with Qwen3-Coder-30B
- [ ] Verify tool calling works
- [ ] Benchmark performance (first request, follow-up request)
- [ ] Test KV cache persistence

### Phase 3: Integration

- [ ] Create new `scripts/mlx-textgen-server.sh` launcher
- [ ] Update `.anyclauderc.json` configuration
- [ ] Update `src/main.ts` to support MLX-Textgen
- [ ] Add MLX-Textgen health check
- [ ] Test auto-launch/shutdown

### Phase 4: Testing

- [ ] Test tool calling with Claude Code
- [ ] Test multi-turn conversations (KV cache reuse)
- [ ] Test backend switching (MLX-Textgen ↔ LMStudio ↔ OpenRouter)
- [ ] Verify all three cache layers work together
- [ ] Performance benchmarks

### Phase 5: Cleanup & Documentation

- [ ] Archive `vllm-mlx-server.py` → `scripts/archive/`
- [ ] Update README.md
- [ ] Update CLAUDE.md
- [ ] Update docs/architecture/
- [ ] Git commit with detailed changelog

---

## Configuration Changes

### Current `.anyclauderc.json`:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "model": "/Users/.../Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
      "serverScript": "scripts/vllm-mlx-server.py"
    }
  }
}
```

### Proposed `.anyclauderc.json`:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "model": "/Users/.../Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
      "serverScript": "scripts/mlx-textgen-server.sh",
      "cache": {
        "enable_cache": true,
        "cache_slots": 10,
        "min_tokens_for_cache": 100
      }
    }
  }
}
```

---

## Rollback Plan

If migration fails, rollback is simple:

```bash
# 1. Restore old config
git checkout .anyclauderc.json

# 2. Use archived server
cp scripts/archive/vllm-mlx-server.py scripts/

# 3. Restart
anyclaude --mode=vllm-mlx
```

All changes are isolated to:

- `.anyclauderc.json` (config)
- `scripts/mlx-textgen-server.sh` (new launcher)
- `scripts/vllm-mlx-server.py` (archived, not deleted)

Your proxy code (`src/`) remains **unchanged**.

---

## Success Criteria

**Performance:**

- [ ] First request: ≤60s (acceptable for cache creation)
- [ ] Follow-up requests: ≤5s (10x faster than current 45-50s)
- [ ] Tool calling works (Read, Write, Edit, Bash, etc.)
- [ ] No errors in logs

**Functionality:**

- [ ] All backends still work (vllm-mlx, lmstudio, openrouter, claude)
- [ ] Auto-launch/shutdown works
- [ ] Multi-turn conversations work
- [ ] Three cache layers all working

**Quality:**

- [ ] No regressions (existing features still work)
- [ ] Documentation updated
- [ ] Git history clean
- [ ] Tests pass (if automated tests exist)

---

## Timeline Estimate

- **Phase 1 (Preparation):** 15-20 minutes
- **Phase 2 (Installation & Testing):** 30-45 minutes
- **Phase 3 (Integration):** 45-60 minutes
- **Phase 4 (Testing):** 30-45 minutes
- **Phase 5 (Cleanup):** 20-30 minutes

**Total:** 2.5 - 3.5 hours

---

## Dependencies

### New:

- `mlx-textgen` (Python package)
  - Includes: `mlx-lm`, `mlx-vlm`, `Outlines`, `FastAPI`

### Unchanged:

- `@anthropic-ai/sdk`
- `@ai-sdk/openai-compatible`
- All existing anyclaude dependencies

### No Conflicts:

MLX-Textgen uses standard dependencies that won't conflict with existing setup.

---

## Risk Assessment

**Low Risk:**

- MLX-Textgen is production-ready (actively maintained)
- No changes to proxy layer (proven to work)
- Easy rollback (just config changes)
- Standalone testing before integration

**Medium Risk:**

- MLX-Textgen may have different tool calling format
  - **Mitigation:** Test extensively before committing
- Performance may vary with different models
  - **Mitigation:** Benchmark with Qwen3-30B specifically

**High Risk:**

- None identified

---

## Questions to Resolve

1. **MLX-Textgen cache directory:** Where should we store caches?
   - Proposed: `~/.anyclaude/mlx-textgen-cache/`

2. **Auto-launch script:** Shell script or Python wrapper?
   - Proposed: Shell script for simplicity

3. **Logging:** Where should MLX-Textgen logs go?
   - Proposed: `~/.anyclaude/logs/mlx-textgen-server.log`

4. **Keep old server?** Archive or delete?
   - Proposed: Archive to `scripts/archive/` for 1-2 releases

---

## Next Steps

1. **Review this design** - User approval
2. **Commit current state** - Git safety net
3. **Execute Phase 2** - Install and test standalone
4. **Proceed phase by phase** - Incremental progress
5. **Test thoroughly** - No rushing

**Ready to proceed?** Say "yes" to start Phase 1 (git commit current state).
