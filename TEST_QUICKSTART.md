# Quick Start: Run Real Test & Analyze (5 Minutes)

**Everything is automated. Just run 3 commands.**

---

## The 3 Commands

### Terminal 1: Start Server
```bash
source ~/.venv-mlx/bin/activate
python scripts/vllm-mlx-server.py \
  --model /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
  --port 8081
```

Wait for: `Uvicorn running on http://0.0.0.0:8081`

---

### Terminal 2: Run Test
```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude
bash scripts/run-real-test.sh
```

This will:
- Run 3 anyclaude commands
- Generate 3 trace files
- Analyze results automatically
- Show cache hits/misses

---

### Terminal 2: View Detailed Results
```bash
# Summary of all 3 requests
python scripts/analyze-traces.py

# Detailed view of request 1
python scripts/analyze-traces.py --detail 0

# Detailed view of request 2
python scripts/analyze-traces.py --detail 1

# Detailed view of request 3
python scripts/analyze-traces.py --detail 2
```

---

## What You'll See

### Summary Output
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

────────────────────────────────────────────────────────────────
RECENT REQUESTS (newest first):
────────────────────────────────────────────────────────────────

1. 2025-10-29T21:30:44.053Z
   Status: ❌ CACHE MISS
   Input: 2,048 | Output: 512
   Cache: Read 0 | Created 2,048
   User Query: Who are you?
   File: 2025-10-29T21-30-44-053Z.json

2. 2025-10-29T21:30:52.215Z
   Status: ✅ CACHE HIT
   Input: 2,048 | Output: 480
   Cache: Read 2,048 | Created 0
   User Query: Tell me a joke
   File: 2025-10-29T21-30-52-215Z.json

3. 2025-10-29T21:30:58.405Z
   Status: ✅ CACHE HIT
   Input: 2,048 | Output: 544
   Cache: Read 2,048 | Created 0
   User Query: What is 2+2?
   File: 2025-10-29T21-30-58-405Z.json
```

### Detailed Output
```
DETAILED TRACE: 2025-10-29T21-30-44-053Z.json

📨 REQUEST:
  Timestamp: 2025-10-29T21:30:44.053Z
  Model: claude-haiku-4-5-20251001
  Max Tokens: 4096

  System Prompt (2048 chars):
    You are Claude Code, Anthropic's official CLI for Claude...

  Messages (1):
    1. [user] Who are you?

  Tools (16):
    - Task
    - Bash
    - Glob
    - (13 more)

📥 RESPONSE:
  Status: 200
  Input Tokens: 2,048
  Output Tokens: 512
  Cache Read: 0 tokens
  Cache Created: 2,048 tokens

  Response Content (512 chars):
    I am Claude Code, Anthropic's official CLI...
```

---

## How to Interpret Results

### ✅ Good Results
```
Cache Hits: 2/3 (66%)
Cache Read: 4,096 tokens
Cache Created: 2,048 tokens
```

**Means:**
- First request created the cache (2,048 tokens)
- Requests 2-3 reused it (4,096 tokens saved!)
- Caching is working properly

### ❌ Bad Results
```
Cache Hits: 0/3 (0%)
Cache Read: 0 tokens
Cache Created: 6,144 tokens
```

**Means:**
- Every request treated as new
- No caching happening
- Check: Is vLLM-MLX server running? Is it correct version?

---

## Key Metrics to Check

1. **Cache Hit Rate**
   - Look for: "Cache Hits: 2/3 (66%)"
   - Good: > 50%
   - Bad: 0%

2. **Cache Read Tokens**
   - Look for: "Total Cached (read): 4,096"
   - Should be > 0 after first request

3. **Per-Request Status**
   - Request 1: Should show "❌ CACHE MISS"
   - Request 2: Should show "✅ CACHE HIT"
   - Request 3: Should show "✅ CACHE HIT"

4. **Cache Fields in Detail View**
   - "Cache Read: 0" (first request)
   - "Cache Created: 2,048" (first request)
   - "Cache Read: 2,048" (second request)
   - "Cache Created: 0" (second request)

---

## What Gets Tested

### Request 1: "Who are you?"
- Sends system prompt + 16 tools + user query
- Creates cache for system prompt
- Gets response from model

### Request 2: "Tell me a joke"
- Sends same system prompt (from cache!) + tools + different query
- System prompt read from cache
- Gets response from model

### Request 3: "What is 2+2?"
- Sends same system prompt (from cache!) + tools + different query
- System prompt read from cache
- Gets response from model

---

## Files Generated

**Traces:** `~/.anyclaude/traces/vllm-mlx/`
```
2025-10-29T21-30-44-053Z.json  (Request 1)
2025-10-29T21-30-52-215Z.json  (Request 2)
2025-10-29T21-30-58-405Z.json  (Request 3)
```

Each file contains:
- Complete request (system, tools, messages)
- Complete response (content, tool calls)
- All metadata (timestamp, headers, status)
- Token counts (input, output, cached, new)

---

## One-Line Summary

**Run test → See traces → Analyze automatically → Get results in seconds**

```bash
# Terminal 1 (keep running)
source ~/.venv-mlx/bin/activate && python scripts/vllm-mlx-server.py --model /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit --port 8081

# Terminal 2 (run once)
cd /Users/akaszubski/Documents/GitHub/anyclaude && bash scripts/run-real-test.sh && python scripts/analyze-traces.py
```

Done. Results displayed automatically.

