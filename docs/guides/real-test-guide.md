# Real Test Guide: Step-by-Step Instructions

**How to run a real test, generate traces, and analyze the results**

---

## Quick Start (5 Minutes)

### Step 1: Ensure Server is Running (Terminal 1)
```bash
source ~/.venv-mlx/bin/activate
python scripts/vllm-mlx-server.py \
  --model /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
  --port 8081

# Should show:
# INFO: Model loaded successfully
# Uvicorn running on http://0.0.0.0:8081
```

### Step 2: Run the Test (Terminal 2)
```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude
chmod +x scripts/run-real-test.sh
bash scripts/run-real-test.sh
```

This will:
1. ✅ Verify server is running
2. ✅ Clear old traces
3. ✅ Run 3 anyclaude requests (creating actual traces)
4. ✅ Analyze results automatically
5. ✅ Show interpretation

### Step 3: View Detailed Results (Terminal 2)
```bash
# See summary
python scripts/analyze-traces.py

# See specific details
python scripts/analyze-traces.py --detail 0
python scripts/analyze-traces.py --detail 1
python scripts/analyze-traces.py --detail 2
```

---

## What the Test Does

### Request 1: "Who are you?"
```
Purpose: Create the cache
Expected: cache_creation_input_tokens > 0
Expected: cache_read_input_tokens = 0 (first request)
```

### Request 2: "Tell me a joke"
```
Purpose: Reuse the cache
Expected: cache_creation_input_tokens = 0 (already cached)
Expected: cache_read_input_tokens > 0 (reading from cache)
```

### Request 3: "What is 2+2?"
```
Purpose: Verify cache reuse works consistently
Expected: cache_creation_input_tokens = 0
Expected: cache_read_input_tokens > 0 (same cache)
```

---

## Understanding the Results

### Successful Test Output

**Summary shows:**
```
Total Requests: 3
Cache Hits: 2/3 (66%)

Token Summary:
  Total Input: 6,144 tokens
  Total Output: 1,536 tokens
  Total Cached (read): 4,096 tokens
  Total New (created): 2,048 tokens
```

**Interpretation:**
- ✅ Request 1: Created 2,048 token cache (system prompt)
- ✅ Request 2: Read 2,048 from cache (saved those tokens!)
- ✅ Request 3: Read 2,048 from cache (saved again!)
- ✅ Total savings: 4,096 tokens (40% reduction)

### Detailed Trace Shows

```
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

**This proves:**
- Request 1 paid the cache creation cost (2,048 tokens)
- Requests 2-3 reused that cache (0 creation cost)
- System prompt is being cached and reused

---

## Analyzing Results in Detail

### View Specific Request

```bash
python scripts/analyze-traces.py --detail 0
```

**Output includes:**

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
    - Grep
    - Read
    - Edit
    - Write
    - (11 more)

📥 RESPONSE:
  Status: 200
  Input Tokens: 2,048
  Output Tokens: 512
  Cache Read: 0 tokens
  Cache Created: 2,048 tokens

  Response Content (512 chars):
    I am Claude Code, Anthropic's official CLI for Claude...

  Tool Calls: None (model responded directly)
```

---

## Step-by-Step Interpretation Guide

### What to Check #1: Cache Hits

```bash
python scripts/analyze-traces.py | grep "Cache Hits"
```

**Good Results:**
- ✅ "Cache Hits: 2/3 (66%)" - Caching is working
- ✅ "Cache Hits: 1/1 (100%)" - All requests hit cache

**Bad Results:**
- ❌ "Cache Hits: 0/3 (0%)" - Caching not working at all

### What to Check #2: Token Breakdown

```bash
python scripts/analyze-traces.py | grep -A 5 "Token Summary"
```

**Look for:**
- `Total Cached (read): XXX` should be > 0
- `Total New (created): XXX` should be low after first request
- Ratio of cached:new should favor cached

**Example Good:**
```
Total Input: 6,144 tokens
Total Cached (read): 4,096 tokens  ← Most were cached
Total New (created): 2,048 tokens  ← Only first request created
Savings: 4,096 tokens (40% reduction)
```

### What to Check #3: Individual Requests

```bash
python scripts/analyze-traces.py
```

Look at each request:

```
1. Status: ❌ CACHE MISS  ← Expected (first)
   Cache: Read 0 | Created 2,048

2. Status: ✅ CACHE HIT   ← Expected (second)
   Cache: Read 2,048 | Created 0

3. Status: ✅ CACHE HIT   ← Expected (third)
   Cache: Read 2,048 | Created 0
```

If **all show CACHE MISS**, caching isn't working.

### What to Check #4: Response Content

```bash
python scripts/analyze-traces.py --detail 0 | grep -A 10 "Response Content"
```

**This shows:**
- Exact text the model generated
- Whether it made sense
- How long it was

### What to Check #5: Tool Definitions

```bash
python scripts/analyze-traces.py --detail 0 | grep -A 20 "Tools"
```

**This shows:**
- Which tools were sent (should be 16+)
- All tools available to the model
- Tool calling capability

---

## Common Results & What They Mean

### Result 1: Perfect Cache Behavior
```
Cache Hits: 2/3 (66%)
Total Cached: 4,096 tokens
Total New: 2,048 tokens

✅ INTERPRETATION: Caching is working perfectly
   - First request created cache
   - Subsequent requests reused it
   - 40% token reduction achieved
```

### Result 2: No Cache Hits
```
Cache Hits: 0/3 (0%)
Total Cached: 0 tokens
Total New: 6,144 tokens

❌ INTERPRETATION: Caching not working
   - Every request treated as new
   - System prompt re-processed 3 times
   - No token savings

FIX: Check vLLM-MLX server supports caching
```

### Result 3: Partial Cache Hits
```
Cache Hits: 1/3 (33%)
Total Cached: 2,048 tokens
Total New: 4,096 tokens

⚠️  INTERPRETATION: Caching intermittent
   - Only second request hit cache
   - Maybe cache cleared between requests
   - Or different prompts (different cache key)
```

### Result 4: Different Token Counts
```
Request 1: Input 2,048 | Output 512
Request 2: Input 2,048 | Output 480
Request 3: Input 2,048 | Output 544

✅ INTERPRETATION: Normal variation
   - Same input (system prompt)
   - Different outputs (different queries)
   - Proves system prompt was cached (constant)
```

---

## Advanced: Extracting Raw Data

### Get all token counts
```bash
python << 'EOF'
import json
from pathlib import Path

traces_dir = Path.home() / ".anyclaude" / "traces" / "vllm-mlx"
for trace_file in sorted(traces_dir.glob("*.json"))[-3:]:
    with open(trace_file) as f:
        data = json.load(f)
        usage = data["response"]["body"].get("usage", {})
        cache_read = usage.get("cache_read_input_tokens", 0)
        cache_created = usage.get("cache_creation_input_tokens", 0)
        status = "HIT" if cache_read > 0 else "MISS"
        print(f"{trace_file.name}: {status} (read:{cache_read}, created:{cache_created})")
EOF
```

### Get all user queries
```bash
python << 'EOF'
import json
from pathlib import Path

traces_dir = Path.home() / ".anyclaude" / "traces" / "vllm-mlx"
for trace_file in sorted(traces_dir.glob("*.json"))[-3:]:
    with open(trace_file) as f:
        data = json.load(f)
        messages = data["request"]["body"].get("messages", [])
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if block.get("type") == "text":
                            print(f"{trace_file.name}: {block.get('text')[:80]}")
EOF
```

### Compare request/response sizes
```bash
python << 'EOF'
import json
from pathlib import Path

traces_dir = Path.home() / ".anyclaude" / "traces" / "vllm-mlx"
for trace_file in sorted(traces_dir.glob("*.json"))[-3:]:
    with open(trace_file) as f:
        data = json.load(f)
        request = data.get("request", {}).get("body", {})
        response = data.get("response", {}).get("body", {})
        req_size = len(json.dumps(request))
        resp_size = len(json.dumps(response))
        print(f"{trace_file.name}: request {req_size} bytes, response {resp_size} bytes")
EOF
```

---

## Troubleshooting

### Test Fails: "Server not running"
```bash
# Check if server is listening
curl http://localhost:8081/v1/models

# If fails, start server:
source ~/.venv-mlx/bin/activate
python scripts/vllm-mlx-server.py --model /path/to/model --port 8081
```

### Test Fails: "No traces generated"
```bash
# Check trace directory exists
ls -lh ~/.anyclaude/traces/vllm-mlx/

# If empty:
# 1. Verify anyclaude can reach server (see above)
# 2. Check .anyclauderc.json has vllm-mlx backend
# 3. Run anyclaude manually and see error
ANYCLAUDE_DEBUG=2 anyclaude
```

### Traces Exist But No Cache Hits
```bash
# Check if vLLM-MLX server supports caching
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "test",
    "messages": [{"role": "user", "content": "test"}],
    "stream": false
  }' | jq '.usage'

# Look for:
# - "cache_read_input_tokens": should be supported
# - "cache_creation_input_tokens": should be supported

# If missing, upgrade vLLM-MLX server
```

### Tokens Always Zero
```bash
# vLLM-MLX might not be returning usage stats
# Check one trace file directly:
cat ~/.anyclaude/traces/vllm-mlx/$(ls -t ~/.anyclaude/traces/vllm-mlx/ | head -1) | jq '.response.body.usage'

# Should show:
# {
#   "prompt_tokens": 2048,
#   "completion_tokens": 512,
#   ...
# }

# If all zeros, vLLM-MLX server isn't calculating tokens
```

---

## Summary: Real Test in 3 Commands

```bash
# 1. Ensure server running (Terminal 1)
source ~/.venv-mlx/bin/activate
python scripts/vllm-mlx-server.py --model /path/to/model --port 8081

# 2. Run test (Terminal 2)
bash scripts/run-real-test.sh

# 3. View results (Terminal 2)
python scripts/analyze-traces.py
python scripts/analyze-traces.py --detail 0
python scripts/analyze-traces.py --detail 1
python scripts/analyze-traces.py --detail 2
```

**That's it. Everything is traced and analyzed automatically.**

