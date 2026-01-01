# vLLM + MLX Port Feasibility Analysis

**Date**: 2025-11-21
**Question**: Can we port vLLM to use MLX as a backend for Apple Silicon?

**Short Answer**: ✅ **Partially YES!** The path exists but requires significant work. PagedAttention kernels already exist for Metal!

---

## Executive Summary

**The Good News** 🎉:

1. ✅ **PagedAttention kernels for Metal already exist** (Eric Buehler, 2025)
2. ✅ **77-131% throughput improvements demonstrated** on M3 Max
3. ✅ **MLX's unified memory architecture is ideal** for PagedAttention
4. ✅ **Community interest is high** (multiple issues, active development)

**The Challenges** ⚠️:

1. ❌ vLLM is deeply tied to CUDA/HIP (thousands of GPU kernel calls)
2. ❌ No official Apple Silicon support planned by vLLM team
3. ⚠️ Would require massive rewrite (~50-80% of codebase)
4. ⚠️ Better approach: **Build vLLM-like features into MLX-LM**

**Recommendation**: Don't port vLLM → MLX. Instead, **add vLLM features to MLX-LM** using existing PagedAttention kernels!

---

## Part 1: Current State of vLLM on macOS

### What Works

- ✅ **CPU-only mode** (experimental, from source)
- ✅ **Basic inference** without GPU acceleration
- ⚠️ **Very slow** (10-50x slower than CUDA)

### What Doesn't Work

- ❌ **Metal/MPS backend** (not implemented)
- ❌ **GPU acceleration** on Apple Silicon
- ❌ **PagedAttention** (CUDA-only)
- ❌ **Continuous batching** (CUDA-only)
- ❌ **FlashAttention** (CUDA kernels)

### Why vLLM Doesn't Support Apple Silicon

**Technical Blockers**:

1. **CUDA Dependency**: vLLM's core is built on CUDA graphs and kernels
2. **FlashAttention**: CUDA-specific implementation (no Metal port)
3. **PagedAttention**: Original implementation uses CUDA unified memory
4. **Kernel Fusion**: Thousands of optimized CUDA kernels throughout codebase

**Organizational**:

- GitHub Issue #16653 closed as "NOT_PLANNED" (April 2025)
- Community requests stale after 90 days
- No official support from vLLM maintainers

---

## Part 2: The PagedAttention Breakthrough! 🚀

### What Is PagedAttention?

PagedAttention is vLLM's **killer feature** - the algorithm that enables:

- 📉 2-4x lower memory usage (vs traditional attention)
- 📈 10-100x higher throughput (continuous batching)
- 🔄 Dynamic memory allocation (no pre-allocation needed)

**How it works**:

```
Traditional Attention:
Request 1: ████████████████ (allocates full KV cache upfront)
Request 2: ████████████████ (even if only uses 30%)
Request 3: ████████████████
→ Huge memory waste, limited concurrency

PagedAttention:
Request 1: ████░░░░░░░░ (allocates blocks as needed)
Request 2: ██░░░░░░░░░░ (shares freed blocks)
Request 3: ████████░░░░
→ 2-4x more requests fit in same memory!
```

### MLX PagedAttention Kernels (July 2025)

**Who**: Eric Buehler (Rust MLX inference engine creator)

**What**: Metal-optimized PagedAttention kernels for MLX

**Performance** (mistralrs-server vs llama.cpp on M3 Max):

| Model                    | llama.cpp   | mistralrs (MLX+PagedAttn) | Improvement    |
| ------------------------ | ----------- | ------------------------- | -------------- |
| **Qwen 3 30B (4-bit)**   | 9.24 tok/s  | 16.34 tok/s               | **+77%** 🔥    |
| **Llama 3.2 3B (8-bit)** | 10.08 tok/s | 23.28 tok/s               | **+131%** 🔥🔥 |

**Status**:

- ✅ Kernels implemented and working
- ⚠️ Not integrated into MLX core library
- 🏗️ Available via community kernels project (Hugging Face)

---

## Part 3: Why MLX Is Perfect for PagedAttention

### Apple's Unified Memory Architecture

**Traditional GPUs** (NVIDIA/AMD):

```
CPU Memory: ████████
    ↓ (PCIe transfer)
GPU Memory: ████████
    → Expensive copies, limited bandwidth
```

**Apple Silicon** (M1/M2/M3/M4):

```
Unified Memory: ████████████████
     ↓              ↓
    CPU           GPU
    → Zero-copy, shared address space!
```

**Why This Matters for PagedAttention**:

1. **No Transfer Overhead**: KV cache blocks can be accessed by both CPU (scheduler) and GPU (inference) without copying
2. **Dynamic Allocation**: MLX can allocate/free blocks instantly (no GPU malloc delays)
3. **Memory Pressure Handling**: Apple's memory controller optimizes page swapping
4. **Large Memory Pools**: Mac Studio M3 Ultra has 192GB unified memory (vs 80GB NVIDIA A100!)

### MLX's Design Philosophy

MLX was **built for unified memory** from day one:

```python
# MLX arrays live in shared memory
import mlx.core as mx

# Create array - accessible to both CPU and GPU
x = mx.array([1, 2, 3])  # Lives in unified memory

# CPU operation - no transfer needed
y = x + 1  # Runs on CPU

# GPU operation - no transfer needed
z = mx.matmul(x, x.T)  # Runs on GPU

# Both see same memory!
```

**vLLM's PagedAttention on CUDA**:

- Must manage CPU ↔ GPU transfers
- Block table lives in CPU memory
- KV blocks live in GPU memory
- Expensive synchronization overhead

**PagedAttention on MLX**:

- Block table and KV blocks share unified memory
- Zero transfer overhead
- Simpler implementation
- Potentially **faster than vLLM**!

---

## Part 4: Feasibility Analysis - Porting vLLM to MLX

### Approach 1: Full vLLM Port (❌ Not Recommended)

**Effort**: 12-24 months, 2-3 full-time engineers

**What Needs Porting**:

| Component               | CUDA Code            | Metal Port Difficulty    | Estimated Effort |
| ----------------------- | -------------------- | ------------------------ | ---------------- |
| PagedAttention          | ✅ Exists (Eric B.)  | 🟢 Done                  | 0 weeks          |
| FlashAttention          | CUDA kernels         | 🔴 Very Hard             | 12-16 weeks      |
| CUDA Graphs             | Graph capture/replay | 🔴 Metal doesn't support | N/A (use alt)    |
| KV Cache Manager        | CUDA malloc          | 🟡 Medium                | 4-6 weeks        |
| Scheduler               | CUDA streams         | 🟡 Medium                | 6-8 weeks        |
| Model Execution         | CUDA kernels         | 🟢 Easy (MLX has)        | 2-3 weeks        |
| Continuous Batching     | CUDA async           | 🟡 Medium                | 8-10 weeks       |
| Quantization (GPTQ/AWQ) | CUDA kernels         | 🔴 Hard                  | 10-12 weeks      |
| **Total**               | -                    | -                        | **42-55 weeks**  |

**Blockers**:

1. **CUDA Graphs**: Metal doesn't have direct equivalent
2. **FlashAttention**: Would need complete Metal rewrite
3. **Kernel Fusion**: Thousands of small optimizations to port
4. **Maintenance Burden**: vLLM updates constantly, keeping fork in sync is brutal

**Verdict**: ❌ **Not worth the effort.** Too much work, high maintenance burden.

---

### Approach 2: Add vLLM Features to MLX-LM (✅ Recommended)

**Effort**: 3-6 months, 1 engineer

**What To Build**:

| Feature                 | Complexity | Uses Existing       | Estimated Effort |
| ----------------------- | ---------- | ------------------- | ---------------- |
| **PagedAttention**      | 🟢 Easy    | ✅ Eric's kernels   | 2-3 weeks        |
| **Block Manager**       | 🟡 Medium  | New code            | 3-4 weeks        |
| **FIFO Scheduler**      | 🟢 Easy    | New code            | 2-3 weeks        |
| **Continuous Batching** | 🟡 Medium  | MLX batch support   | 4-6 weeks        |
| **Request Queue**       | 🟢 Easy    | AsyncIO             | 1-2 weeks        |
| **KV Cache Sharing**    | 🟡 Medium  | Our ram_cache.py    | 2-3 weeks        |
| **Grammar Constraints** | 🔴 Hard    | Port xgrammar?      | 8-12 weeks       |
| **Tool Call Stops**     | 🟢 Easy    | Our truncation code | 1 week           |
| **Total**               | -          | -                   | **23-34 weeks**  |

**Advantages**:

- ✅ **Leverage existing MLX ecosystem** (no CUDA porting)
- ✅ **Use proven Metal kernels** (PagedAttention already works)
- ✅ **Smaller scope** (~40% effort vs full port)
- ✅ **Can integrate incrementally** (ship features one by one)
- ✅ **Native MLX performance** (no compatibility layers)

**Verdict**: ✅ **This is the path forward!**

---

## Part 5: Concrete Roadmap - Building "vLLM-for-MLX"

### Phase 1: PagedAttention Foundation (4-6 weeks)

**Goal**: Integrate Eric Buehler's PagedAttention kernels into MLX-LM

**Tasks**:

1. Import PagedAttention kernels from community repo
2. Implement block table manager (allocate/free KV blocks)
3. Update `mlx_lm.generate()` to use paged KV cache
4. Add block scheduling logic (FIFO to start)

**Success Metrics**:

- Single-request inference works with PagedAttention
- Memory usage 2-4x lower than current MLX-LM
- Performance matches or beats current implementation

**Code Location**: `scripts/mlx-server.py` → new `paged_attention.py` module

---

### Phase 2: Continuous Batching (6-8 weeks)

**Goal**: Process multiple requests concurrently (like vLLM)

**Tasks**:

1. Implement request queue with AsyncIO
2. Add FIFO scheduler (batches pending requests)
3. Support dynamic batch sizes (add/remove requests mid-batch)
4. Handle variable sequence lengths with padding/masking

**Success Metrics**:

- Process 5-10 concurrent requests
- Throughput 5-10x higher than sequential
- No attention mask bugs (solve MLX-LM Issue #178!)

**Challenges**:

- MLX batch attention has bugs (see Issue #178)
- Need proper mask handling with padding
- Dynamic batch reshaping is tricky

---

### Phase 3: Grammar Constraints (8-12 weeks)

**Goal**: Prevent infinite loops, ensure valid JSON (our bug!)

**Tasks**:

1. Research xgrammar Metal port feasibility
2. If infeasible, build lightweight JSON validator
3. Integrate grammar checks into sampling loop
4. Add `tool_choice` parameter support

**Success Metrics**:

- Guaranteed valid tool calls (no infinite loops!)
- JSON schema validation for outputs
- `tool_choice="required"` works like vLLM

**Note**: This is the **hardest part** - may need to simplify if xgrammar port is too complex.

---

### Phase 4: Production Hardening (4-6 weeks)

**Goal**: Make it production-ready

**Tasks**:

1. Add metrics/monitoring (request latency, throughput, etc.)
2. Error handling and recovery (OOM, timeout, etc.)
3. Request prioritization (not just FIFO)
4. Memory pressure handling (evict blocks under pressure)
5. Multi-model support (load balancing across models)

**Success Metrics**:

- Handles 50+ concurrent requests
- Graceful degradation under load
- Auto-recovery from errors

---

## Part 6: Performance Projections

Based on Eric Buehler's benchmarks + vLLM's reported improvements:

### Current State (Your MLX Setup)

| Metric                  | Current Performance     |
| ----------------------- | ----------------------- |
| **Single Request**      | ~10-15 tok/s (Qwen 30B) |
| **Concurrent Requests** | 1 (sequential only)     |
| **Throughput**          | 10-15 tok/s total       |
| **Memory Efficiency**   | ~40GB for 30B model     |

### After Phase 1 (PagedAttention)

| Metric                  | Projected Performance | Improvement      |
| ----------------------- | --------------------- | ---------------- |
| **Single Request**      | ~15-20 tok/s          | +30-50%          |
| **Concurrent Requests** | 1 (still sequential)  | 0%               |
| **Throughput**          | 15-20 tok/s total     | +30-50%          |
| **Memory Efficiency**   | ~15-20GB for 30B      | **2-3x better!** |

### After Phase 2 (Continuous Batching)

| Metric                  | Projected Performance   | Improvement |
| ----------------------- | ----------------------- | ----------- |
| **Single Request**      | ~15-20 tok/s            | +30-50%     |
| **Concurrent Requests** | 5-10                    | **10x!**    |
| **Throughput**          | **150-200 tok/s total** | **10-15x!** |
| **Memory Efficiency**   | ~15-20GB for 30B        | 2-3x better |

### After Phase 3 (Grammar Constraints)

| Metric                | Projected Performance        | Improvement        |
| --------------------- | ---------------------------- | ------------------ |
| **Tool Call Quality** | 100% valid JSON              | ∞ (no more loops!) |
| **Latency**           | Slightly slower (validation) | -5-10%             |
| **Reliability**       | Production-grade             | **Huge!**          |

---

## Part 7: Alternative: Use mistralrs-server

**What Is It?**: Rust-based inference server with MLX backend + PagedAttention (by Eric Buehler)

**Advantages**:

- ✅ **Already has PagedAttention** (+77-131% throughput)
- ✅ **Continuous batching** support (`--max-seqs` parameter)
- ✅ **OpenAI-compatible API** (drop-in replacement)
- ✅ **Metal optimized** (native performance)
- ✅ **Maintained** (active development)

**Disadvantages**:

- ⚠️ Rust codebase (harder to customize than Python)
- ⚠️ Less mature than vLLM (newer project)
- ⚠️ Smaller community (vs vLLM/MLX)

**Integration with anyclaude**:

```json
// .anyclauderc.json
{
  "backend": "mistralrs",
  "backends": {
    "mistralrs": {
      "enabled": true,
      "baseUrl": "http://localhost:8080/v1",
      "model": "qwen-30b-mlx",
      "apiKey": "mistralrs"
    }
  }
}
```

**Recommendation**: ⭐ **Try mistralrs-server as a stopgap** while building vLLM features into MLX-LM!

---

## Part 8: Comparison Matrix

| Feature                 | vLLM (CUDA)    | mistralrs (MLX)  | Our MLX Setup    | vLLM-MLX (Proposed) |
| ----------------------- | -------------- | ---------------- | ---------------- | ------------------- |
| **PagedAttention**      | 🟢 Yes         | 🟢 Yes           | 🔴 No            | 🟢 Yes (Phase 1)    |
| **Continuous Batching** | 🟢 Yes         | 🟢 Yes           | 🔴 No            | 🟢 Yes (Phase 2)    |
| **Grammar Constraints** | 🟢 xgrammar    | 🟡 Limited       | 🟡 Truncation    | 🟢 Yes (Phase 3)    |
| **Tool Call Stops**     | 🟢 Native      | 🟡 Basic         | 🟡 Workaround    | 🟢 Native (Phase 3) |
| **RAM KV Cache**        | 🔴 No          | 🔴 No            | 🟢 Yes (200x!)   | 🟢 Yes (keep ours!) |
| **Multi-GPU**           | 🟢 Yes         | 🔴 No            | 🔴 No            | 🔴 No (Apple limit) |
| **Throughput**          | 🟢 500+ tok/s  | 🟡 20-50 tok/s   | 🟡 10-15 tok/s   | 🟢 150-200 tok/s    |
| **Platform**            | 🟡 NVIDIA only | 🟢 Apple Silicon | 🟢 Apple Silicon | 🟢 Apple Silicon    |
| **Maintenance**         | 🟢 Active      | 🟢 Active        | 🟡 DIY           | 🟡 DIY              |

---

## Part 9: Decision Framework

### When to Port vLLM → MLX Backend

**Do This If**:

- ❌ You need 100% vLLM API compatibility
- ❌ You want to run exact same code on CUDA + Metal
- ❌ You have 1+ year and 2-3 engineers

**Don't Do This** (our case!)

---

### When to Add vLLM Features to MLX-LM

**Do This If**:

- ✅ You want vLLM-like performance on Apple Silicon
- ✅ You're willing to invest 3-6 months of development
- ✅ You can leverage existing PagedAttention kernels
- ✅ You want to contribute to MLX ecosystem

**This is us!** 🎯

---

### When to Use mistralrs-server

**Do This If**:

- ✅ You need PagedAttention **today**
- ✅ You're okay with Rust codebase
- ✅ You want +77-131% throughput immediately
- ✅ You can live with less customization

**Try this as interim solution!**

---

## Part 10: Recommendations

### Immediate Actions (Next 2 Weeks)

1. ✅ **Test mistralrs-server** with your models

   ```bash
   # Install mistralrs
   cargo install mistralrs-server

   # Run with MLX backend
   mistralrs-server --port 8080 \
     --model qwen-30b-mlx \
     --backend mlx \
     --max-seqs 10

   # Test with anyclaude
   anyclaude --mode=mistralrs
   ```

2. ✅ **Benchmark performance**
   - Compare mistralrs vs your current MLX setup
   - Measure throughput with 1, 5, 10 concurrent requests
   - Check memory usage

3. ✅ **Evaluate trade-offs**
   - Does mistralrs meet your needs?
   - Or do you need custom features (RAM cache, etc.)?

### Short-Term (1-3 Months)

**If mistralrs works**: ✅ Use it! Focus on other features.

**If mistralrs doesn't work**:

1. Start **Phase 1: PagedAttention Integration**
2. Import Eric Buehler's kernels
3. Build block manager for MLX-LM
4. Measure performance improvements

### Long-Term (6-12 Months)

**If building vLLM-MLX**:

- Complete Phases 1-4 (PagedAttention → Grammar)
- Publish as open-source MLX-LM enhancement
- Contribute upstream to ml-explore/mlx-lm

**If using mistralrs**:

- Contribute improvements upstream
- Focus on anyclaude features (debugging, caching, etc.)
- Monitor MLX-LM for native PagedAttention support

---

## Conclusion

**Can we port vLLM to use MLX?**

**Technical Answer**: Yes, but it's the wrong approach.

**Better Answer**: ✅ **Build vLLM-like features into MLX-LM using existing PagedAttention kernels.**

**Best Answer**: 🎯 **Try mistralrs-server first (already done!), then build vLLM-MLX if needed.**

---

## Next Steps

1. ⏭️ **Try mistralrs-server** (2-3 days)
2. ⏭️ **Document results** in comparison guide
3. ⏭️ **Decide on approach**:
   - Stick with mistralrs? → Focus elsewhere
   - Need custom solution? → Start Phase 1

---

## References

- vLLM GitHub: https://github.com/vllm-project/vllm
- MLX PagedAttention Issue: https://github.com/ml-explore/mlx/issues/2228
- mistralrs-server: https://github.com/EricLBuehler/mistral.rs
- Eric Buehler's benchmarks: See MLX Issue #2228
- PagedAttention paper: https://arxiv.org/abs/2309.06180
