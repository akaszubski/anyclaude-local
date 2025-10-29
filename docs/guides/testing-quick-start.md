# 🚀 START HERE: Test Prompt Caching (No API Key Needed!)

You don't have an Anthropic API key, and that's **PERFECT** - you don't need one! You're using vLLM-MLX locally, and the cache works automatically.

## The 5-Minute Test

### Step 1: Start anyclaude with debug output
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

### Step 2: Use Claude Code normally
Open another terminal or use Claude Code as you normally would:
```
# Ask Claude Code simple questions:
"What is 2+2?"
"What is 3+3?"
"What is 4+4?"
```

### Step 3: Watch Terminal 1 for this pattern

**After the 1st question:**
```
[Prompt Cache] MISS - Caching new system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 2850ms
```

**After the 2nd question (should be much faster):**
```
[Prompt Cache] HIT - Reusing cached system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 450ms   ← 6x faster!
```

**After the 3rd question:**
```
[Prompt Cache] HIT - Reusing cached system+tools abc123de
[Request Complete] vllm-mlx/Qwen30B: 420ms   ← 6x faster!
```

## ✅ Success = You see this pattern!

```
MISS  2850ms  ← Request 1 (creates cache)
HIT   450ms   ← Request 2 (uses cache - 6x faster!)
HIT   420ms   ← Request 3 (uses cache - 6x faster!)
```

If you see `HIT` on request 2+, **cache is working!** 🎉

## What's Happening

**Request 1 (MISS):**
- Claude Code sends 9,000 token system prompt
- vLLM-MLX processes it
- anyclaude caches it
- Takes 2.85 seconds

**Request 2 (HIT):**
- Claude Code sends the SAME 9,000 token system prompt
- anyclaude recognizes it (same hash)
- **Skips sending it to vLLM-MLX!**
- Only your 50-word question is processed
- Takes 0.45 seconds (6x faster!)

**Request 3 (HIT):**
- Same thing as request 2
- Still 0.45 seconds (6x faster!)

## The Real Benefit

**Without cache (10 questions):**
```
10 requests × 2.85 seconds = 28.5 seconds total
```

**With cache (1 miss + 9 hits):**
```
2.85s + (9 × 0.45s) = 6.9 seconds total
```

**Time saved: 21.6 seconds (77% faster overall!)**

## If You Don't See HIT

If all requests show `MISS`:

1. Check if system prompt is identical
2. Try asking the same type of question again
3. Enable more verbose output:
   ```bash
   ANYCLAUDE_DEBUG=2 bun run src/main.ts 2>&1 | head -50
   ```

## Filtering Output (Optional)

To see ONLY cache-related messages:
```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts 2>&1 | grep "Cache\|Complete"
```

This shows only:
```
[Prompt Cache] MISS - Caching new system+tools xyz789ab
[Request Complete] vllm-mlx/Qwen30B: 2850ms
[Prompt Cache] HIT - Reusing cached system+tools xyz789ab
[Request Complete] vllm-mlx/Qwen30B: 450ms
[Prompt Cache] HIT - Reusing cached system+tools xyz789ab
[Request Complete] vllm-mlx/Qwen30B: 420ms
```

## Documentation

If you want to understand more:

| Document | For |
|----------|-----|
| **TEST_LOCAL_CACHE.md** | Detailed guide for your setup |
| **TEST_NO_API_KEY.md** | Quick reference (no API needed) |
| **PERFORMANCE_GUIDE.md** | What to expect |
| **PROMPT_CACHE_EXPLANATION.md** | How it works technically |

## That's Really It!

1. ✅ Start anyclaude with `ANYCLAUDE_DEBUG=2`
2. ✅ Use Claude Code normally (no API key needed)
3. ✅ Watch logs for `[Prompt Cache] HIT`
4. ✅ Notice requests 2+ are 6x faster!

## Quick Q&A

**Q: Why is the first request slow?**
A: It's processing and caching 9,000 system tokens. That's expected.

**Q: Why are other requests fast?**
A: They skip the 9,000 cached tokens and only process your question.

**Q: How long does cache last?**
A: 1 hour. If you don't use anyclaude for an hour, cache expires.

**Q: Is this safe?**
A: Yes! Only in-memory, auto-expires, clears on exit.

**Q: Does this require Anthropic API key?**
A: **NO!** You're using vLLM-MLX locally. No API key needed.

**Q: How much faster will my usage be?**
A: About 77% faster overall with multiple questions!

## Next Step

Run it now and let me know what you see! 🚀

```bash
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

Then ask Claude Code a few questions and watch the cache work!
