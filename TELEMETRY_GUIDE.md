# Telemetry Collection Guide

## What This Does

Instead of artificial tests, we **capture real data from your actual Claude Code usage**. This lets us:

1. ✅ See real bottlenecks (not theoretical)
2. ✅ Identify cache effectiveness in practice
3. ✅ Find patterns (e.g., which models are slowest)
4. ✅ Measure improvements over time
5. ✅ Reverse-engineer what needs optimization

---

## How It Works

Every time you use Claude Code with vLLM-MLX, we capture:

```
Request Details:
  - Messages sent
  - Tools available
  - System prompt

Response Details:
  - Latency (how long it took)
  - Status (success/error/timeout)
  - Tokens generated
  - Cache hit or miss

Environment:
  - Model used
  - Provider used
  - CPU/memory usage
```

Data is saved to: `~/.anyclaude/telemetry/session-*.jsonl`

---

## Setup (One Time)

### 1. Integrate Telemetry into Proxy

Edit `src/anthropic-proxy.ts` to record metrics:

```typescript
import { TelemetryCollector, type RequestMetric } from "./telemetry-collector";

// In your proxy creation:
const telemetry = new TelemetryCollector();

// When handling a request:
const metric: RequestMetric = {
  timestamp: new Date().toISOString(),
  request_id: crypto.randomUUID(),
  provider: mode,  // "vllm-mlx", "lmstudio", etc
  model: model,    // "Qwen3-Coder-30B"

  // From request
  message_count: messages.length,
  message_tokens: countTokens(messages),
  has_system_prompt: !!systemPrompt,
  has_tools: tools?.length > 0,
  tool_count: tools?.length || 0,
  stream: false,

  // From response
  status: "success",
  finish_reason: "stop",
  tool_calls_made: toolCalls?.length || 0,

  // Timing
  request_start_ms: Date.now(),
  request_end_ms: Date.now(),
  latency_ms: 2850,

  // Cache
  cache_hit: false,

  // Response
  response_tokens: countTokens(response),
  response_length: response.length,
};

telemetry.recordRequest(metric);
```

### 2. Enable Telemetry

```bash
# Telemetry enabled by default
anyclaude --mode=vllm-mlx

# Disable if needed
export ANYCLAUDE_TELEMETRY=0
anyclaude --mode=vllm-mlx
```

---

## Usage

### Just Use Claude Code Normally

```bash
anyclaude --mode=vllm-mlx

# Use it for your work...
# Write code, ask questions, etc
# All activity is being recorded
```

### End Session & Get Report

When you exit Claude Code:

```bash
# Telemetry automatically prints summary:
╔════════════════════════════════════════╗
║     vLLM-MLX SESSION SUMMARY           ║
╚════════════════════════════════════════╝

Session ID: 1730000000000-abc12def
Duration: 45m 23s

Requests:
  Total: 127
  Successful: 125
  Failed: 2
  Timeouts: 0

Performance:
  Avg latency: 1820ms
  Min/Max: 45ms / 3200ms
  P95/P99: 2850ms / 3100ms

Cache Performance:
  Cache hits: 42 (33.1%)

Tokens:
  Input: 45,230
  Output: 12,450
  Tool calls: 8

Models:
  - Qwen3-Coder-30B

📊 Full summary saved to: /Users/.../session-abc12def-summary.json
📋 All metrics saved to: /Users/.../session-abc12def-metrics.jsonl
```

---

## Analyzing Your Data

### View Raw Metrics

```bash
# Find your session files
ls ~/.anyclaude/telemetry/

# Look at raw metrics (JSONL format - one JSON per line)
cat ~/.anyclaude/telemetry/session-*.jsonl | jq '.'

# Pretty-print first few
head -5 ~/.anyclaude/telemetry/session-*.jsonl | jq '.'
```

### Analyze with TelemetryCollector

```typescript
import { TelemetryCollector } from "./src/telemetry-collector";

// Analyze a metrics file
TelemetryCollector.analyzeTelemetryData(
  "/Users/.../session-abc12def-metrics.jsonl"
);

// Output:
// 📊 Telemetry Analysis
// ════════════════════════════════════════
//
// By Provider:
//   vllm-mlx: 127 requests, avg 1820ms
//
// Cache Hits: 42/127 (33.1%)
//
// Slowest Requests:
//   3200ms - Qwen3-Coder-30B (uncached, 8 messages)
//   3150ms - Qwen3-Coder-30B (uncached, 5 messages)
//   ...
```

### Extract Specific Data

```bash
# All cache misses (slow requests)
grep '"cache_hit":false' ~/.anyclaude/telemetry/*.jsonl | jq '.'

# All timeouts (errors)
grep '"status":"timeout"' ~/.anyclaude/telemetry/*.jsonl | jq '.latency_ms'

# Tool calling patterns
grep '"tool_calls_made":[1-9]' ~/.anyclaude/telemetry/*.jsonl | jq '.tool_calls_made'

# Average latency per model
grep -o '"model":"[^"]*"' ~/.anyclaude/telemetry/*.jsonl | sort | uniq -c

# Cache hit rate over time
for file in ~/.anyclaude/telemetry/*.jsonl; do
  cache_hits=$(grep '"cache_hit":true' "$file" | wc -l)
  total=$(wc -l < "$file")
  rate=$((cache_hits * 100 / total))
  echo "$(basename $file): $rate%"
done
```

---

## What Data Tells Us

### Example Analysis

**Your telemetry shows:**
```
127 requests over 45 minutes
Average latency: 1820ms
Cache hit rate: 33.1%

Slowest: 3200ms (uncached)
Fastest: 45ms (cached)
```

**What this means:**
- ✅ Server is working (no timeouts)
- ✅ Cache is helping (33% speedup from hits)
- ⚠️ Could improve with better cache strategy
- 💡 Opportunity: Tool calling patterns?

### Finding Bottlenecks

```bash
# Show all slow requests (> 3 seconds)
jq 'select(.latency_ms > 3000)' ~/.anyclaude/telemetry/*.jsonl

# Group by slowest factor
jq 'select(.latency_ms > 2500) | {model, message_count, response_tokens}' \
  ~/.anyclaude/telemetry/*.jsonl | sort | uniq -c
```

This reveals patterns like:
- "Requests with 10+ messages are always slow"
- "Tool-heavy requests take 2x longer"
- "First request of session always misses cache"

---

## Comparing Before/After

### Capture Baseline

```bash
# Use old version without fixes
git checkout 527161a -- scripts/vllm-mlx-server.py

# Use for a while
anyclaude --mode=vllm-mlx
# ... work for 30 minutes ...
# exit

# Rename to keep
mv ~/.anyclaude/telemetry/session-*.jsonl ~/.anyclaude/telemetry/BEFORE-*.jsonl
```

### Capture With Fixes

```bash
# Use new fixed version
git checkout main -- scripts/vllm-mlx-server.py

# Use for same amount of time
anyclaude --mode=vllm-mlx
# ... work for 30 minutes ...
# exit

# Rename to keep
mv ~/.anyclaude/telemetry/session-*.jsonl ~/.anyclaude/telemetry/AFTER-*.jsonl
```

### Compare Results

```bash
# Parse and compare
python3 << 'EOF'
import json
import statistics

before_latencies = []
before_hits = 0

# Read BEFORE data
with open(os.path.expanduser("~/.anyclaude/telemetry/BEFORE-*.jsonl")) as f:
    for line in f:
        data = json.loads(line)
        before_latencies.append(data['latency_ms'])
        if data.get('cache_hit'):
            before_hits += 1

after_latencies = []
after_hits = 0

# Read AFTER data
with open(os.path.expanduser("~/.anyclaude/telemetry/AFTER-*.jsonl")) as f:
    for line in f:
        data = json.loads(line)
        after_latencies.append(data['latency_ms'])
        if data.get('cache_hit'):
            after_hits += 1

# Compare
print("BEFORE vs AFTER")
print(f"Average latency: {statistics.mean(before_latencies):.0f}ms → {statistics.mean(after_latencies):.0f}ms")
print(f"Cache hit rate: {before_hits/len(before_latencies)*100:.1f}% → {after_hits/len(after_latencies)*100:.1f}%")
print(f"Improvement: {(1 - statistics.mean(after_latencies)/statistics.mean(before_latencies))*100:.1f}% faster")
EOF
```

---

## Key Metrics to Watch

| Metric | What It Means | Goal |
|--------|--------------|------|
| **Avg Latency** | How long typical request takes | < 1000ms |
| **P99 Latency** | Worst case (99th percentile) | < 3500ms |
| **Cache Hit Rate** | % of requests served from cache | > 30% |
| **Timeout Rate** | % of requests that timed out | 0% |
| **Tool Call Rate** | % of requests using tools | Varies |

---

## Sharing Data for Analysis

To share your telemetry with others:

```bash
# Anonymize and share
python3 << 'EOF'
import json

# Read metrics
with open(os.path.expanduser("~/.anyclaude/telemetry/session-*.jsonl")) as f:
    for line in f:
        data = json.loads(line)
        # Remove sensitive info
        del data['request_id']
        # Keep what matters for analysis
        print(json.dumps(data))
EOF

# Save to file
cat ~/.anyclaude/telemetry/session-*.jsonl | \
  jq 'del(.request_id)' > /tmp/telemetry-for-analysis.jsonl

# Share /tmp/telemetry-for-analysis.jsonl
```

---

## Reverse Engineering Improvements

Based on telemetry, we can identify:

1. **Cache Effectiveness**
   - Hit rate by message count
   - System prompt impact
   - Tool definition size impact

2. **Performance Characteristics**
   - Model speed variations
   - Load impact on latency
   - First-request penalty

3. **Usage Patterns**
   - Common request types
   - Tool calling frequency
   - Conversation length distribution

4. **Error Patterns**
   - Timeouts (frequency, triggers)
   - Tool parsing failures
   - Provider-specific issues

All of this guides next improvements.

---

## Implementation Checklist

- [ ] Merge telemetry-collector.ts into project
- [ ] Integrate into src/anthropic-proxy.ts
- [ ] Add TelemetryCollector initialization
- [ ] Record metrics on each request
- [ ] Test with ANYCLAUDE_TELEMETRY=1
- [ ] Use Claude Code for real work
- [ ] Collect data for 1-2 weeks
- [ ] Analyze patterns
- [ ] Propose optimizations

---

## Summary

**How to get real data:**

1. **Enable telemetry** - `ANYCLAUDE_TELEMETRY=1 anyclaude`
2. **Use Claude Code normally** - Work on real projects
3. **Let data accumulate** - Sessions over 1-2 weeks
4. **Analyze patterns** - Find bottlenecks
5. **Optimize based on data** - Not guesses

This is much more powerful than artificial tests because it captures **your actual usage patterns** and lets us optimize for **real-world scenarios**.

---

## Next Steps

Ready to integrate telemetry? I'll:

1. ✅ Create telemetry-collector.ts (done)
2. ⏳ Integrate into proxy (need to do)
3. ⏳ Build analysis tools (optional)
4. ⏳ Start collecting your data

Want me to integrate the telemetry into the proxy now?
