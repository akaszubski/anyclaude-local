# Tracing and Metrics Guide

**Everything anyclaude does is being tracked and recorded.**

---

## What Gets Traced

✅ **Automatically saved to `~/.anyclaude/traces/[mode]/`**

- Every request timestamp
- Exact system prompts (full text)
- Every user message (exact text)
- All tool definitions sent to the model
- Request/response headers
- Response content (full text)
- Tool calls made by the model
- Cache status (hit/miss)
- Token counts (input, output, cached, new)

✅ **Cache metrics saved to `~/.anyclaude/cache-metrics/`**

- Cache creation tokens
- Cache read tokens
- Cost savings
- Hit rate statistics

---

## How to Analyze Traces

### Quick Summary (All Recent Requests)
```bash
python scripts/analyze-traces.py
```

**Output shows:**
- Total requests analyzed
- Cache hit rate (%)
- Total tokens used
- Cached vs new tokens
- Each request's cache status
- Exact user queries

### Detailed View (Specific Request)
```bash
# View details of first trace
python scripts/analyze-traces.py --detail 0

# View details of second trace
python scripts/analyze-traces.py --detail 1
```

**Output shows:**
- Full system prompt (first 200 chars)
- All user messages
- All tools sent
- Exact response content
- Tool calls made by model
- Token breakdown

### Different Backend
```bash
# Analyze Claude API traces
python scripts/analyze-traces.py --backend claude

# Analyze LMStudio traces
python scripts/analyze-traces.py --backend lmstudio
```

---

## Trace File Locations

```
~/.anyclaude/traces/
  ├── vllm-mlx/          # vLLM-MLX traces (local model)
  ├── claude/            # Real Claude API traces
  ├── lmstudio/          # LMStudio traces
  └── mlx-lm/            # MLX-LM traces

~/.anyclaude/cache-metrics/
  └── YYYY-MM-DDTHH-MM-SS-MMMZ.json
```

---

## What Each Trace Contains

**Request Section:**
```json
{
  "timestamp": "2025-10-28T10:53:44.053Z",
  "mode": "vllm-mlx",
  "request": {
    "method": "POST",
    "url": "/v1/messages",
    "headers": { ... },
    "body": {
      "model": "claude-haiku-4-5-20251001",
      "messages": [ ... ],           // ← Your exact messages
      "system": [ ... ],             // ← Your exact system prompt
      "tools": [ ... ],              // ← All tool definitions
      "max_tokens": 4096
    }
  }
}
```

**Response Section:**
```json
{
  "response": {
    "statusCode": 200,
    "headers": { ... },
    "body": {
      "choices": [{
        "message": {
          "content": "...",          // ← Exact response text
          "tool_calls": [ ... ]      // ← Tool calls made
        }
      }],
      "usage": {
        "prompt_tokens": 2048,       // ← Input tokens
        "completion_tokens": 512,    // ← Output tokens
        "cache_creation_input_tokens": 1024,   // ← New cached
        "cache_read_input_tokens": 0           // ← Read from cache
      }
    }
  }
}
```

---

## Real-World Examples

### Example 1: Cache Miss → Cache Hit

**Request 1 (10:53:44.053Z) - Cache MISS**
```
Status: ❌ CACHE MISS
Input: 2,048 tokens | Output: 512 tokens
Cache: Read 0 | Created 2,048
User: "Who are you?"
```

**Request 2 (10:53:44.215Z) - Cache HIT**
```
Status: ✅ CACHE HIT
Input: 2,048 tokens | Output: 512 tokens
Cache: Read 2,048 | Created 0
User: "Tell me a joke"
```

**Result:** System prompt (2048 tokens) reused from cache!

---

### Example 2: Tool Calling

**Request with tools:**
```
Tools: 16 (Task, Bash, Read, Edit, Glob, etc.)
User: "Fix this bug for me"
Response: Tool called → "Bash" (from 16 available)
```

**Trace shows exactly:**
- Which tools were sent
- Which one was called
- What parameters were used

---

### Example 3: Performance Tracking

**Three consecutive requests:**
```
1. foo query
   Input: 1,000 | Output: 200 | Cache: MISS (create 1000)

2. bar query
   Input: 1,000 | Output: 150 | Cache: HIT (read 1000, create 0)

3. baz query
   Input: 1,000 | Output: 180 | Cache: HIT (read 1000, create 0)
```

**Insights:**
- First request paid the cache creation cost
- Requests 2-3 saved 1000 tokens each (30% reduction in token cost)
- System prompt cached successfully

---

## Analyzing Specific Scenarios

### "Is caching actually working?"

```bash
python scripts/analyze-traces.py | grep "Cache Hits"
# Shows: Cache Hits: 5/10 (50%)
# If 0%, caching isn't working
```

### "What exact prompt did I use?"

```bash
python scripts/analyze-traces.py --detail 0 | grep "User Query" -A 5
# Shows exact text of your query
```

### "What tokens am I using?"

```bash
python scripts/analyze-traces.py | grep "Token Summary" -A 5
# Shows total tokens across all requests
```

### "Which tool was called?"

```bash
python scripts/analyze-traces.py --detail 0 | grep "Tool Calls" -A 5
# Shows which tools model used
```

---

## Understanding the Numbers

### Token Costs

- **prompt_tokens**: Tokens from your input (system + messages)
- **completion_tokens**: Tokens from model's response
- **cache_creation_input_tokens**: New tokens added to cache
- **cache_read_input_tokens**: Tokens read from cache

**Cost Impact:**
- Cache creation: Full cost (write to cache)
- Cache read: ~10-25% cost (cheaper than new tokens)
- New processing: Full cost

**Example:**
```
Request 1: 2000 tokens → Cache
Cost: 2000 tokens

Request 2: 2000 tokens from cache + 100 new
Cost: ~200-500 tokens (cache read is cheaper)

Savings: 1500-1800 tokens (75-90% savings!)
```

### Hit Rate

- **0%**: No caching happening
- **50%**: Some patterns repeated
- **80-90%**: Great caching (system prompt reused)

---

## Real-Time Monitoring

While running anyclaude, traces are written immediately:

```bash
# Watch traces being written in real-time
watch -n 1 'ls -lh ~/.anyclaude/traces/vllm-mlx/ | tail -5'

# See latest trace file
tail -n 50 ~/.anyclaude/traces/vllm-mlx/$(ls -t ~/.anyclaude/traces/vllm-mlx/ | head -1)
```

---

## Extracting Raw Data

### Get all prompts used
```bash
python scripts/analyze-traces.py | grep "User Query"
```

### Get token statistics
```python
import json
from pathlib import Path

traces_dir = Path.home() / ".anyclaude" / "traces" / "vllm-mlx"
for trace_file in sorted(traces_dir.glob("*.json"))[-5:]:
    with open(trace_file) as f:
        data = json.load(f)
        usage = data["response"]["body"].get("usage", {})
        print(f"{trace_file.name}: {usage.get('prompt_tokens', 0)} input, {usage.get('completion_tokens', 0)} output")
```

### Export traces for analysis
```bash
# Copy all traces to a folder for backup/analysis
cp -r ~/.anyclaude/traces/vllm-mlx ~/anyclaude-traces-backup
```

---

## Debugging with Traces

When something goes wrong:

1. **Check trace exists**
   ```bash
   ls -lh ~/.anyclaude/traces/vllm-mlx/
   ```

2. **Analyze the trace**
   ```bash
   python scripts/analyze-traces.py --detail 0
   ```

3. **Look for:**
   - Cache hits/misses (working?)
   - Tool calls (were tools sent?)
   - Response status (error or 200?)
   - Token counts (reasonable?)

4. **Compare backends**
   ```bash
   # Check if Claude API works
   python scripts/analyze-traces.py --backend claude

   # Check if vllm-mlx works
   python scripts/analyze-traces.py --backend vllm-mlx
   ```

---

## Privacy & Security

All traces are stored locally (not sent anywhere):
- `~/.anyclaude/` (user home directory)
- API keys are automatically redacted (`[REDACTED]`)
- Traces are mode-specific (not shared between backends)
- No data sent to Anthropic or any external service

---

## Summary: What You Can Verify

✅ **Every request is saved with:**
- Exact timestamp
- Full system prompt (text)
- All user messages (text)
- All tools (definitions)
- Full response (text)
- Cache status (hit/miss)
- Token counts

✅ **Analyze with:**
- `python scripts/analyze-traces.py` (summary)
- `python scripts/analyze-traces.py --detail 0` (details)

✅ **See what's actually happening:**
- Caching working? ✅ Token numbers prove it
- Tools sent? ✅ Trace shows them
- What did I prompt? ✅ Full text in trace
- How fast? ✅ Timestamp shows it

No guessing. No hope. All evidence is in `~/.anyclaude/traces/`.

