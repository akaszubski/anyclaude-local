# Testing Prompt Cache Performance - Complete Guide

## Quick Test (5 minutes)

### Step 1: Build the Project
```bash
bun run build
```

### Step 2: Run with Debug Enabled
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

### Step 3: Use Claude Code Normally
```
# In Claude Code, ask simple questions:
# 1. "What is 2+2?"
# 2. "What is 3+3?"
# 3. "What is 4+4?"
```

### Step 4: Check Output
Look for these log messages:
```
[Prompt Cache] MISS - Caching new system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 3000ms

[Prompt Cache] HIT - Reusing cached system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 500ms   ← 6x faster!
```

## Detailed Testing Method

### Test Setup

#### Terminal 1: Start Proxy (Separate from Claude Code)
```bash
PROXY_ONLY=true ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

Output will show:
```
Proxy listening at: http://localhost:52345
```

Note the port number (52345 or similar).

#### Terminal 2: Set Environment
```bash
export PROXY_URL="http://localhost:52345"
export ANTHROPIC_API_KEY="your-key-here"
```

### Test 1: Verify Cache Hit Pattern

#### Request 1 (Cache Miss - creates cache)
```bash
curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "system": [{"type": "text", "text": "You are a helpful assistant."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "What is 2+2?"}]}]
  }' \
  -w "\nRequest took: %{time_total}s\n"
```

**Expected Output:**
- Terminal 1 shows: `[Prompt Cache] MISS - Caching new system+tools...`
- `time_total`: 2-3 seconds
- Response: `4`

#### Request 2 (Cache Hit - reuses cache)
```bash
# Identical request
curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "system": [{"type": "text", "text": "You are a helpful assistant."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "What is 3+3?"}]}]
  }' \
  -w "\nRequest took: %{time_total}s\n"
```

**Expected Output:**
- Terminal 1 shows: `[Prompt Cache] HIT - Reusing cached system+tools...`
- `time_total`: **0.3-0.5 seconds** (6x faster!)
- Response: `6`

#### Request 3 (Cache Hit again)
```bash
# Another identical request (still cached)
curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "system": [{"type": "text", "text": "You are a helpful assistant."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "What is 5+5?"}]}]
  }' \
  -w "\nRequest took: %{time_total}s\n"
```

**Expected Output:**
- Terminal 1 shows: `[Prompt Cache] HIT - Reusing cached system+tools...`
- `time_total`: **0.3-0.5 seconds** (6x faster!)
- Response: `10`

### Test 2: Different System Prompt (Cache Miss)

Change the system prompt:
```bash
curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "system": [{"type": "text", "text": "You are a math expert."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "What is 10+10?"}]}]
  }' \
  -w "\nRequest took: %{time_total}s\n"
```

**Expected Output:**
- Terminal 1 shows: `[Prompt Cache] MISS - Caching new system+tools...`
- `time_total`: 2-3 seconds (slow again, new system prompt)
- Response: `20`

### Test Results Summary

| Request | System Prompt | Cache | Time | Speed |
|---------|---------------|-------|------|-------|
| 1 | "helpful" | MISS | 2.8s | 1x |
| 2 | "helpful" | HIT | 0.4s | **7x faster** |
| 3 | "helpful" | HIT | 0.4s | **7x faster** |
| 4 | "math expert" | MISS | 2.7s | 1x (new prompt) |
| 5 | "math expert" | HIT | 0.4s | **7x faster** |

## Test with Claude Code Directly

### Method 1: Simple (Just Use It)

```bash
# Terminal 1: Start anyclaude
ANYCLAUDE_DEBUG=2 bun run src/main.ts

# Terminal 2: Use Claude Code normally
# Ask 3-5 questions in a row
# Watch the request times in Terminal 1

# Expected pattern:
# Request 1: [Prompt Cache] MISS ... 2800ms
# Request 2: [Prompt Cache] HIT ... 450ms   ✓
# Request 3: [Prompt Cache] HIT ... 420ms   ✓
# Request 4: [Prompt Cache] HIT ... 480ms   ✓
```

### Method 2: Timed Test (Accurate Measurement)

```bash
# Terminal 1: Start anyclaude with timing info
ANYCLAUDE_DEBUG=2 bun run src/main.ts 2>&1 | grep -E "\[Request Complete\]|\[Prompt Cache\]"

# Terminal 2: Use Claude Code
# Make requests and watch Terminal 1 output

# You should see pattern like:
# [Prompt Cache] MISS - Caching new system+tools xyz789ab
# [Request Complete] vllm-mlx/Qwen30B: 3200ms
# [Prompt Cache] HIT - Reusing cached system+tools xyz789ab
# [Request Complete] vllm-mlx/Qwen30B: 480ms
# [Prompt Cache] HIT - Reusing cached system+tools xyz789ab
# [Request Complete] vllm-mlx/Qwen30B: 420ms
```

### Method 3: Automated Test Script

Create `test-cache.sh`:
```bash
#!/bin/bash

PROXY_URL="http://localhost:52345"
API_KEY="$ANTHROPIC_API_KEY"

echo "Testing Prompt Cache Performance"
echo "=================================="
echo ""

# Test 1: Cache Miss
echo "Request 1 (Cache Miss)..."
time curl -s -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 50,
    "system": [{"type": "text", "text": "You are helpful."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "Say hi"}]}]
  }' > /dev/null

echo ""
echo "Request 2 (Cache Hit)..."
time curl -s -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 50,
    "system": [{"type": "text", "text": "You are helpful."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "Say bye"}]}]
  }' > /dev/null

echo ""
echo "Request 3 (Cache Hit)..."
time curl -s -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 50,
    "system": [{"type": "text", "text": "You are helpful."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "Say goodbye"}]}]
  }' > /dev/null

echo ""
echo "Expected: Request 2 & 3 should be ~6-10x faster than Request 1"
```

Run it:
```bash
chmod +x test-cache.sh
PROXY_ONLY=true ANYCLAUDE_DEBUG=2 bun run src/main.ts &
sleep 2
./test-cache.sh
```

## Understanding the Results

### Good Performance (Cache Working)

```
Request 1 (MISS): 2.8 seconds  ✓
Request 2 (HIT):  0.4 seconds  ✓ (7x faster!)
Request 3 (HIT):  0.4 seconds  ✓ (7x faster!)
```

**What this means:**
- First request: ~100 tokens/second (expected for local model)
- Second+: Skipped 9,000 tokens → massive speedup
- Cache is working perfectly!

### Poor Performance (Cache Not Working)

```
Request 1 (MISS): 2.8 seconds
Request 2 (MISS): 2.8 seconds  ✗ (should be HIT)
Request 3 (MISS): 2.8 seconds  ✗ (should be HIT)
```

**Debug steps:**
```bash
# Check if system prompt is exactly identical
# (Even a space difference = different hash = no cache hit)

# Enable verbose debug
ANYCLAUDE_DEBUG=2 bun run src/main.ts

# Look for:
# [Prompt Cache] HIT or [Prompt Cache] MISS
# If always MISS, system prompt is changing
```

## Performance Metrics to Track

### Metric 1: Time-to-First-Token (TTFT)
```
Request 1: 2800ms (baseline, no cache)
Request 2: 400ms  (cached)
Improvement: (2800-400)/2800 = 86% faster
```

### Metric 2: Tokens Processed
```
Request 1: 9000 tokens (system) + 50 tokens (user) = 9050 total
Request 2: 0 tokens (cached) + 50 tokens (user) = 50 total
Saved: 9000 tokens/request!
```

### Metric 3: Token Throughput
```
Local model: ~150 tokens/second
Request 1: 9050 tokens ÷ 150 = 60 seconds
Request 2: 50 tokens ÷ 150 = 0.3 seconds
Speedup: 60/0.3 = 200x for computation alone
(Network/latency adds overhead)
```

## Troubleshooting Test Issues

### Problem: All Requests Show "MISS"

**Possible causes:**
1. System prompt changes slightly each request (dynamic content)
2. Tools list changes each request
3. Cache hash doesn't match

**Solution:**
```bash
# Check if you're sending identical prompts
ANYCLAUDE_DEBUG=2 bun run src/main.ts | grep "system\|tools"

# If you see different tools/system each request, that's why
```

### Problem: Cache Hit but No Speed Improvement

**Possible causes:**
1. Network latency dominates (not local!)
2. Model disk/memory bottleneck
3. Backend server is slow

**Solution:**
```bash
# Test with tiny prompt to isolate cache benefit
# If still slow, bottleneck is elsewhere
```

### Problem: Getting "address already in use" Error

```bash
# Kill old process
pkill -f "bun run src/main.ts"
pkill -f vllm-mlx

# Then try again
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

## Complete End-to-End Test

### Step 1: Clean Start
```bash
pkill -f "bun run\|vllm-mlx"
sleep 1
```

### Step 2: Start Proxy
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
# Note the port: http://localhost:XXXXX
```

### Step 3: In New Terminal - Run Tests
```bash
export PROXY_URL="http://localhost:52345"  # Replace with your port
export API_KEY="your-anthropic-key"

# Test 1: Cache miss
echo "=== Request 1 (Cache Miss) ==="
curl -w "Time: %{time_total}s\n" -s -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"system":[{"type":"text","text":"You are helpful."}],"messages":[{"role":"user","content":[{"type":"text","text":"Say one word"}]}]}' | jq -r '.content[0].text'

# Test 2: Cache hit
echo "=== Request 2 (Cache Hit) ==="
curl -w "Time: %{time_total}s\n" -s -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"system":[{"type":"text","text":"You are helpful."}],"messages":[{"role":"user","content":[{"type":"text","text":"Say another word"}]}]}' | jq -r '.content[0].text'

# Test 3: Cache hit again
echo "=== Request 3 (Cache Hit) ==="
curl -w "Time: %{time_total}s\n" -s -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"system":[{"type":"text","text":"You are helpful."}],"messages":[{"role":"user","content":[{"type":"text","text":"Say one more word"}]}]}' | jq -r '.content[0].text'
```

### Step 4: Analyze Results

Check Terminal 1 output:
```
[Prompt Cache] MISS - Caching new system+tools...
[Request Complete] vllm-mlx/Qwen30B: 2850ms

[Prompt Cache] HIT - Reusing cached system+tools...
[Request Complete] vllm-mlx/Qwen30B: 450ms  ✓

[Prompt Cache] HIT - Reusing cached system+tools...
[Request Complete] vllm-mlx/Qwen30B: 420ms  ✓
```

Check Terminal 2 timings:
```
Time: 2.95s
Time: 0.55s  ← 5-6x faster!
Time: 0.52s  ← 5-6x faster!
```

## Success Criteria

✅ **Cache is working if:**
- Request 1 shows: `[Prompt Cache] MISS`
- Request 2 shows: `[Prompt Cache] HIT`
- Request 2 is 5-10x faster than Request 1
- Request 3 is similar speed to Request 2

❌ **Cache is NOT working if:**
- All requests show: `[Prompt Cache] MISS`
- All requests take ~3 seconds
- No speed improvement between requests

## Next Steps

1. **Run the quick test above** (5 minutes)
2. **Verify you see HIT on request 2+**
3. **Note the time improvement**
4. **Read results** and confirm cache is working
5. **Commit the changes** once verified

Good luck! Let me know what results you see!
