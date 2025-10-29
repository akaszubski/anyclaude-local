# Quick Start: Run Real Test Now

**Everything is set up. Just run these 3 simple commands.**

---

## What We've Built

✅ **vLLM-MLX Server** - Local inference with prompt caching + tool calling
✅ **anyclaude Proxy** - Translates Anthropic API → OpenAI format
✅ **Automated Test** - 3 requests with cache verification
✅ **Results Analysis** - Shows cache hits, token counts, proof of caching

---

## Run It Right Now

### Terminal 1: Start the Server

```bash
source ~/.venv-mlx/bin/activate && \
python /Users/akaszubski/Documents/GitHub/anyclaude/scripts/vllm-mlx-server.py \
  --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081
```

Wait for:

```
INFO:     Uvicorn running on http://0.0.0.0:8081
```

---

### Terminal 2: Run the Test

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude && \
bash scripts/run-real-test.sh
```

This will:

1. ✅ Verify server is running
2. ✅ Clear old trace files
3. ✅ Run 3 anyclaude requests
4. ✅ Automatically analyze results
5. ✅ Show cache hit rate + token breakdown

---

## What You'll See

### Success Output:

```
════════════════════════════════════════════════════════════════
📊 TRACE ANALYSIS SUMMARY
════════════════════════════════════════════════════════════════

Total Requests: 3
Cache Hits: 2/3 (66%)

Token Summary:
  Total Input: 6,144 tokens
  Total Output: 1,536 tokens
  Total Cached (read): 4,096 tokens
  Total New (created): 2,048 tokens
```

**This proves:**

- Request 1: Created 2,048 token cache
- Request 2: Read 2,048 from cache (saved!)
- Request 3: Read 2,048 from cache (saved!)

---

## Optional: See Detailed Results

```bash
# See summary again
python scripts/analyze-traces.py

# See details of each request
python scripts/analyze-traces.py --detail 0
python scripts/analyze-traces.py --detail 1
python scripts/analyze-traces.py --detail 2
```

---

## Success Criteria Checklist

✅ **Cache Working**

- Look for "Cache Hits: 2/3 (66%)"
- Look for "Total Cached (read): 4,096 tokens"

✅ **Server Stable**

- No crashes during test
- All 3 requests complete
- Response times reasonable

✅ **Tool Support**

- Check detailed output for "Tools: 16"
- Confirms tool definitions sent

✅ **Traces Generated**

- Files in `~/.anyclaude/traces/vllm-mlx/`
- Each contains full request/response

---

## If It Fails

### "Server not running"

```bash
# Check server in Terminal 1 is still outputting logs
# If crashed, restart it:
source ~/.venv-mlx/bin/activate && \
python scripts/vllm-mlx-server.py \
  --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081
```

### "No traces generated"

```bash
# Verify server is responding:
curl http://localhost:8081/v1/models

# Verify config is correct:
cat .anyclauderc.json | grep backend
# Should show: "backend": "vllm-mlx"

# Rebuild anyclaude:
bun run build
```

### "Cache not working (0%)"

```bash
# Check vLLM-MLX server has caching support:
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"test"}],"stream":false}' | jq '.usage'

# Should show: "cache_creation_input_tokens" and "cache_read_input_tokens" fields
```

---

## What Each Request Does

| Request | Query            | Expected                        | Proves                |
| ------- | ---------------- | ------------------------------- | --------------------- |
| 1       | "Who are you?"   | cache_creation_input_tokens > 0 | Cache creation works  |
| 2       | "Tell me a joke" | cache_read_input_tokens > 0     | Cache reuse works     |
| 3       | "What is 2+2?"   | cache_read_input_tokens > 0     | Consistent cache hits |

---

## Files That Were Created/Modified

**For this test:**

- `scripts/run-real-test.sh` - Automated test runner
- `scripts/analyze-traces.py` - Results analyzer
- `scripts/vllm-mlx-server.py` - Server with caching + tools (restored)

**Documentation:**

- `ENGINEERING_LOG.md` - Complete engineering record
- `TEST_QUICKSTART.md` - 5-minute reference
- `REAL_TEST_GUIDE.md` - Detailed guide
- `TRACING_AND_METRICS.md` - Tracing explanation

**Configuration:**

- `.anyclauderc.json` - Set to vllm-mlx backend

---

## After the Test: What's Next

Once you confirm caching is working:

1. **Use anyclaude normally** - Just run `anyclaude` and it will use cached prompts
2. **Monitor performance** - Traces saved to `~/.anyclaude/traces/vllm-mlx/`
3. **Check metrics** - Run `python scripts/analyze-traces.py` anytime
4. **Switch backends** - Set `.anyclauderc.json` backend to "lmstudio" or "claude" if needed

---

## Complete 3-Command Summary

```bash
# Terminal 1 (Server - leave running):
source ~/.venv-mlx/bin/activate && python /Users/akaszubski/Documents/GitHub/anyclaude/scripts/vllm-mlx-server.py --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" --port 8081

# Terminal 2 (Test):
cd /Users/akaszubski/Documents/GitHub/anyclaude && bash scripts/run-real-test.sh

# Terminal 2 (View results):
python scripts/analyze-traces.py
```

**That's it. Everything else is automated.**

---

**Status**: ✅ Ready to test with Claude Code
**Test Duration**: ~2-3 minutes
**Success Indicator**: "Cache Hits: 2/3 (66%)" in results
