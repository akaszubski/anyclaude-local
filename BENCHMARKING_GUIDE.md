# vLLM-MLX Benchmarking Guide

## What You Have

Three ways to measure cache effectiveness **right now**:

1. **Analyze Existing Traces** - Your past Claude Code usage
2. **Active Benchmarking** - Send test requests and measure response time
3. **Server Health Endpoint** - Real-time cache statistics

---

## Option 1: Analyze Your Existing Traces

Your past Claude Code sessions are already logged. Let's analyze them:

```bash
python3 scripts/analyze-vllm-traces.py
```

**What it shows:**
```
📊 CACHE SUMMARY:
   Total requests: 18
   Unique requests: 14
   Potential cache hits: 4
   Cache hit rate: 22.2%
```

This tells you:
- ✅ You've made 18 requests
- ✅ 14 were unique
- ✅ 4 were repeats (potential cache hits)
- ✅ **22.2% of your requests could use cache**

**Interpretation:**
- 22.2% hit rate is reasonable for real usage
- With caching, you saved time on 4 requests
- More usage = higher hit rate (system learns patterns)

---

## Option 2: Active Benchmarking with Test Requests

Measure actual response time differences:

```bash
./scripts/benchmark-vllm-cache.sh http://localhost:8081 5
```

**What it does:**
1. First request (uncached) → Full inference time
2. Identical second request → Should be much faster if cache works
3. Different query → Cache miss again
4. Back to first query → Cache hit again

**Output looks like:**
```
==================================================
TEST 1: First Request (UNCACHED)
==================================================
Test: First request - should be slow (full inference)
  Samples: 5
  Min: 2800ms
  Max: 2900ms
  Avg: 2850ms
  Latencies: 2800 2850 2880 2900 2850

==================================================
TEST 2: Identical Second Request (SHOULD BE CACHED)
==================================================
Test: Second identical request - should be much faster if cache works
  Min: 45ms
  Max: 120ms
  Avg: 75ms
  Latencies: 45 50 75 100 120

==================================================
CACHE EFFECTIVENESS ANALYSIS
==================================================

Interpretation:
  If Test 1 ≈ Test 2: Cache is NOT working ❌
  If Test 2 << Test 1 (10x+ faster): Cache IS working ✅
```

**Speedup Calculation:**
```
Test 1 avg: 2850ms
Test 2 avg: 75ms
Speedup: 2850 / 75 = 38x faster
```

---

## Option 3: Server Health Endpoint

Check cache stats in real-time:

```bash
curl http://localhost:8081/health | jq '.cache'
```

**Output:**
```json
{
  "hits": 42,
  "misses": 8,
  "total_requests": 50,
  "hit_rate": "84.0%",
  "cached_items": 8
}
```

**Interpretation:**
- `hits: 42` = 42 requests served from cache
- `misses: 8` = 8 requests needed full inference
- `hit_rate: 84%` = 84% of recent requests hit cache
- `cached_items: 8` = 8 responses stored in memory

---

## How to Run All Three

### Step 1: Check Existing Traces

```bash
python3 scripts/analyze-vllm-traces.py
```

Shows what happened in your past usage.

### Step 2: Run Active Benchmark

Before running tests, start your server:

```bash
# Terminal 1: Start server
PROXY_ONLY=true ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx

# Terminal 2: Run benchmark
./scripts/benchmark-vllm-cache.sh http://localhost:8081
```

### Step 3: Check Server Stats

```bash
curl http://localhost:8081/health | jq '.cache'

# Watch live (updates every second)
watch -n 1 'curl -s http://localhost:8081/health | jq .cache'
```

---

## Interpreting Results

### Cache IS Working ✅

**Signs:**
```
Test 1 (uncached): 2850ms
Test 2 (cached):    50ms
Speedup: 57x

Server stats: hit_rate 80%+
Traces: 30%+ hit rate
```

### Cache NOT Working ❌

**Signs:**
```
Test 1 (uncached): 2850ms
Test 2 (cached):   2800ms
Speedup: 1.02x

Server stats: hit_rate 0%
Traces: 0% hit rate
```

### Partial/Degraded Cache ⚠️

**Signs:**
```
Test 1 (uncached): 2850ms
Test 2 (cached):   800ms
Speedup: 3.5x (should be 50x+)

Server stats: hit_rate 40%
```

**Possible causes:**
- Cache size too small (can fit fewer responses)
- Cache being evicted (responses not stored long enough)
- Keys not matching properly (identical requests not recognized)

---

## What's Currently Happening (From Your Traces)

Your actual usage shows:

```
18 total requests made
14 unique requests
4 identical requests (cache hit candidates)
22.2% natural cache hit rate

Top tools used:
  - Task (7 times)
  - Bash (7 times)
  - Glob (7 times)
  - Grep (7 times)
```

This is **realistic** because:
- You're using Claude Code for real work
- Each session has mostly unique requests
- Some patterns repeat (like asking for same thing twice)
- 22% hit rate from natural patterns is good baseline

---

## How to Improve Hit Rate

### 1. Reuse System Prompts
System prompt cached = automatic speedup for all requests in same session

### 2. Ask Same Questions Twice
If you ask "what is in this file?" and later ask again → cache hit

### 3. Tool Patterns
If you use same tool combination repeatedly → cache hit

### 4. Batch Similar Requests
Group similar context together → higher hit rate

---

## Expected Performance

### First Request (Always Slow)
```
Qwen3-Coder-30B on Apple Silicon: 2500-3500ms
```

### Cached Request (Should Be Fast)
```
Network + JSON parsing: 20-100ms
Speedup: 25-175x
```

### Factors That Affect Latency

| Factor | Impact |
|--------|--------|
| Model size | ±1000ms (30B vs 8B) |
| Message count | ±200ms (1 vs 10 messages) |
| Tool definitions | ±200ms (0 vs 17 tools) |
| System prompt size | ±100ms (small vs large) |
| System load | ±500ms (idle vs busy) |

---

## Quick Checks

### Is Cache Working?

Run this and compare timings:

```bash
# Warm up
curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}], "stream": false}' \
  > /dev/null

# First measurement
time curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}], "stream": false}' \
  > /dev/null

# Second identical request
time curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}], "stream": false}' \
  > /dev/null
```

**Expected:**
```
First:  real 2.850s   <- Full inference
Second: real 0.050s   <- Cache hit (57x faster)
```

### Check Cache Stats

```bash
curl http://localhost:8081/health | jq '.cache'
```

**Expected:**
```json
{
  "hits": 10,
  "hit_rate": "50.0%"
}
```

---

## Troubleshooting

### Hit rate is 0%

**Check:**
```bash
# 1. Is server running?
curl http://localhost:8081/health

# 2. Are identical requests actually identical?
# (Messages, tools, model must be exactly the same)

# 3. Is cache size too small?
# (Default: 32 items, gets evicted if full)

# 4. Are you using streaming?
# (Streaming requests don't use same cache)
```

### Second request is still slow

**Possible causes:**
1. **Requests aren't identical** - Even small differences prevent cache hit
   - Different system prompts?
   - Different tool order?
   - Different message formatting?

2. **Cache was evicted** - If cache is full (32 items), oldest gets removed
   - Solution: Make more requests to same data

3. **Server restarted** - Cache is in-memory, lost on restart
   - Solution: Don't restart between cached request pairs

### Hit rate dropped suddenly

**Possible causes:**
1. **Cache size exceeded** - Switched to new queries
2. **Server restarted** - Lost in-memory cache
3. **Different model** - Requests to different model don't share cache

---

## Data-Driven Next Steps

Based on your current benchmarks:

**If cache hit rate > 30%:**
✅ Cache is working well
→ Continue using normally, benefit from hits

**If cache hit rate 10-30%:**
⚠️ Cache working but limited benefit
→ Look for repeating patterns to improve hit rate

**If cache hit rate < 10%:**
❌ Cache not effective
→ Check if cache is actually enabled
→ Run active benchmark to verify

---

## Commands Reference

```bash
# Analyze past usage
python3 scripts/analyze-vllm-traces.py

# Run benchmark (requires server running)
./scripts/benchmark-vllm-cache.sh http://localhost:8081

# Check server health
curl http://localhost:8081/health | jq '.cache'

# Monitor live
watch -n 1 'curl -s http://localhost:8081/health | jq .cache'

# Single request timing
time curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}], "stream": false}'
```

---

## Summary

**You can measure cache effectiveness right now with:**

1. **Past usage analysis** - `python3 scripts/analyze-vllm-traces.py`
   - Shows real hit rate from your actual work
   - Currently: 22.2% from 18 requests

2. **Active benchmarking** - `./scripts/benchmark-vllm-cache.sh`
   - Send identical requests
   - Measure latency difference
   - Should see 25-1425x speedup if working

3. **Server health endpoint** - `curl http://localhost:8081/health | jq '.cache'`
   - Real-time cache stats
   - Hit rate percentage
   - Items cached

**Start with option 1 (analyze existing traces) to see your current baseline!**
