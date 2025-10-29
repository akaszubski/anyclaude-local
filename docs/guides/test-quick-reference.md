# Cache Testing - Quick Reference

## Fastest Way to Test (5 minutes)

### Terminal 1: Build & Start Proxy
```bash
bun run build
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

**Output:** `Proxy listening at: http://localhost:XXXXX`

### Terminal 2: Run Quick Test
```bash
ANTHROPIC_API_KEY=your-key ./scripts/test/test-cache-quick.sh
```

**Expected Output:**
```
Request 1/3: ✓ 2850ms
Request 2/3: ✓ 450ms
Request 3/3: ✓ 420ms

Results
──────────────────────────────
Latencies:
  Request 1: 2850ms (baseline)
  Request 2: 450ms
  Request 3: 420ms

Improvements:
  Request 2: 84% faster  ✓
  Request 3: 85% faster  ✓

✓ Cache is working! Requests 2+ are significantly faster
```

### What to Look for in Terminal 1
```
[Prompt Cache] MISS - Caching new system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 2850ms

[Prompt Cache] HIT - Reusing cached system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 450ms  ✓

[Prompt Cache] HIT - Reusing cached system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 420ms  ✓
```

## Testing Methods

| Method | Time | Details |
|--------|------|---------|
| **Quick Test** | 5 min | Run test script above |
| **Manual Curl** | 10 min | Run 3 curl commands |
| **Claude Code** | 15 min | Use anyclaude naturally |
| **Full Test Suite** | 30 min | Run all tests in TESTING_CACHE_PERFORMANCE.md |

## Quick Commands Reference

### Start with Debug
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

### Verbose Debug (More Output)
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts | grep -E "\[Prompt Cache\]|\[Request Complete\]"
```

### Run Test Script
```bash
ANTHROPIC_API_KEY=your-key ./scripts/test/test-cache-quick.sh
```

### Manual Single Request (Using Proxy)
```bash
# First, start proxy in Terminal 1:
PROXY_ONLY=true bun run src/main.ts

# Then in Terminal 2:
curl -X POST http://localhost:52345/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-API-KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 50,
    "system": [{"type": "text", "text": "You are helpful."}],
    "messages": [{"role": "user", "content": [{"type": "text", "text": "Say hi"}]}]
  }' \
  -w "\nTime: %{time_total}s\n"
```

### Using Claude Code Naturally
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
# ... use Claude normally, make 3+ requests
# Watch Terminal for: [Prompt Cache] HIT
```

## Success Criteria

### ✅ Cache Working
- Request 1: `[Prompt Cache] MISS` + ~3 seconds
- Request 2: `[Prompt Cache] HIT` + ~0.5 seconds (6x faster!)
- Request 3: `[Prompt Cache] HIT` + ~0.5 seconds (6x faster!)

### ❌ Cache Not Working
- All requests show: `[Prompt Cache] MISS`
- All requests take ~3 seconds
- No speed improvement

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **All requests show MISS** | System prompt changing each request - check with debug output |
| **"address already in use"** | `pkill -f vllm-mlx` then try again |
| **No API key error** | `export ANTHROPIC_API_KEY=your-key` |
| **Curl not found** | `brew install curl` (macOS) or `apt install curl` (Linux) |
| **Still slow** | Check if model is still initializing (first few requests are always slow) |

## Performance Expectations

| Request | System Prompt | Time | Speed |
|---------|---------------|------|-------|
| 1 | Sent (9,000 tokens) | 2.8s | 1x baseline |
| 2 | Cached ✓ | 0.4s | **7x faster** |
| 3 | Cached ✓ | 0.4s | **7x faster** |
| 4 (new) | Sent (9,000 tokens) | 2.7s | 1x (new prompt) |

## Files to Know

| File | Purpose |
|------|---------|
| **TESTING_CACHE_PERFORMANCE.md** | Complete testing guide |
| **PERFORMANCE_GUIDE.md** | Performance overview |
| **scripts/test/test-cache-quick.sh** | Automated test script |
| **src/prompt-cache.ts** | Cache implementation |
| **src/anthropic-proxy.ts** | Integration point |

## One-Liner Commands

### Test with 3 requests and show timing
```bash
for i in 1 2 3; do echo "Request $i" && time (curl -s http://localhost:52345/v1/messages -H "Authorization: Bearer $ANTHROPIC_API_KEY" -H "Content-Type: application/json" -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"system":[{"type":"text","text":"Help."}],"messages":[{"role":"user","content":[{"type":"text","text":"Hi"}]}]}' > /dev/null); done
```

### Show only cache logs
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts 2>&1 | grep "Cache\|Complete"
```

### Count cache hits
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts 2>&1 | grep -c "HIT"
```

## Next Steps After Testing

1. **Verify cache is working** - See HIT on request 2+
2. **Note the speed improvement** - Should be 5-10x faster
3. **Read PERFORMANCE_GUIDE.md** - Understand what you're seeing
4. **Commit changes** - Save your work
5. **Use anyclaude** - Cache will work automatically going forward

## Questions?

Check these files:
- **TESTING_CACHE_PERFORMANCE.md** - Detailed testing guide
- **PROMPT_CACHE_EXPLANATION.md** - How caching works
- **PERFORMANCE_GUIDE.md** - What to expect
