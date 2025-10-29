# anyclaude Setup Verification Guide

**Last Updated**: 2025-10-29

This guide provides exact reproduction steps with expected output to verify everything works.

## Prerequisites

```bash
# Python venv for MLX
~/.venv-mlx/bin/python --version  # Should be Python 3.11+

# Node/bun
bun --version  # or npm --version
```

## Step 1: Build anyclaude

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude

# Install dependencies
bun install

# Build TypeScript
bun run build

# Verify build succeeded
ls -lh dist/main.js
# Output: -rw-r--r-- ... dist/main.js (should exist and be >100KB)
```

## Step 2: Start vLLM-MLX Server (Terminal 1)

```bash
# Activate venv
source ~/.venv-mlx/bin/activate

# Start server
python scripts/vllm-mlx-server.py \
  --model /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
  --port 8081

# Expected output:
# [2025-10-29 ...] [vllm-mlx] INFO: Starting vLLM-MLX Server on 0.0.0.0:8081
# [2025-10-29 ...] [vllm-mlx] INFO: Loading MLX model from: /Users/akaszubski/ai-tools/...
# [2025-10-29 ...] [vllm-mlx] INFO: Model loaded successfully
# INFO:     Started server process [PID]
# INFO:     Uvicorn running on http://0.0.0.0:8081
```

## Step 3: Health Check (Terminal 2)

```bash
# Run health check
bash scripts/startup-health-check.sh

# Expected output:
# ✅ vLLM-MLX server is running
# ✅ Server responds to requests
# ✅ Caching field present in response
# ✅ Tool calls field present in response
# ✅ vllm-mlx configured in .anyclauderc.json
# ✅ TypeScript build present
# ✅ ALL HEALTH CHECKS PASSED
```

## Step 4: Test Caching (Terminal 2)

```bash
# Test cache functionality
source ~/.venv-mlx/bin/activate
python scripts/test-cache-verification.py

# Expected output:
# === CACHE VERIFICATION TEST ===
#
# 1️⃣  First request (should CREATE cache)...
#    Cache created: 500+ tokens
#
# 2️⃣  Second request (should READ from cache)...
#    Cache read: 500+ tokens
#    Cache created: 0 tokens
#    ✅ CACHE HIT! Read 500+ tokens from cache
```

## Step 5: Test Tool Calling (Terminal 2)

```bash
# Test tool calling
source ~/.venv-mlx/bin/activate
python scripts/test-tool-calling.py

# Expected output:
# === TOOL CALLING VERIFICATION TEST ===
#
# 1️⃣  Sending request with tool definition...
#    Tool: get_weather
#
# 2️⃣  Checking response format...
#    tool_calls field present: True
#    ✅ Tool calls field present in response
```

## Step 6: Run anyclaude (Terminal 2)

```bash
# Configure anyclaude to use vllm-mlx
cat .anyclauderc.json | grep -A 2 '"backend"'
# Output should show: "backend": "vllm-mlx"

# Start anyclaude
anyclaude

# Expected output:
# ▗ ▗   ▖ ▖  Claude Code v2.0.28
#            Haiku 4.5 · Claude Max
#   ▘▘ ▝▝    /Users/akaszubski/Documents/GitHub/anyclaude
#
# [Prompt Cache] MISS - Caching new system+tools 6c02a5f5
# [Prompt Cache] MISS - Caching new system+tools d6a3087c
#
# > your prompt here
```

## Step 7: Verify It Actually Works

Type in anyclaude:

```
> Who are you?
```

**Expected behavior:**
- ✅ Responds quickly (local model)
- ✅ Response is coherent (from Qwen3 model)
- ✅ No network calls to Anthropic API
- ✅ Prompt cache hits on subsequent requests

**Check logs for cache hits:**

```bash
# In another terminal, watch the server logs
tail -f /var/folders/7s/.../anyclaude-debug-*.json | jq .

# Look for:
# "cache_read_input_tokens": 9000  # System prompt cached!
```

## Troubleshooting

### Cache not working?

**Problem**: `cache_read_input_tokens` always 0

**Solution**:
1. Check vLLM-MLX version: `python -c "import mlx_lm; print(mlx_lm.__version__)"`
2. Verify PromptCache class is in server: `grep -n "class PromptCache" scripts/vllm-mlx-server.py`
3. Restart server: `pkill -9 vllm-mlx-server.py`

### Tool calling not working?

**Problem**: `tool_calls` field not in response

**Solution**:
1. Verify tools are being sent: Check .anyclauderc.json has tools array
2. Check server logs for tool definition parsing errors
3. Note: Qwen3-Coder may not reliably use tools (it's a code model)

### Server crashes on startup?

**Problem**: "Model loaded successfully" not printed

**Solution**:
1. Verify model path exists: `ls /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit/config.json`
2. Check MLX is installed: `source ~/.venv-mlx/bin/activate && python -c "import mlx_lm; print('✅ MLX LM available')"`
3. Run with debug: `PYTHONUNBUFFERED=1 python scripts/vllm-mlx-server.py ...`

### anyclaude won't start?

**Problem**: "Cannot connect to API"

**Solution**:
1. Verify server is running: `curl http://localhost:8081/v1/models`
2. Check config: `cat .anyclauderc.json | grep baseUrl`
3. Try manual test: `curl -X POST http://localhost:8081/v1/chat/completions ...`

## What to Verify

- [ ] vLLM-MLX server starts and logs "Model loaded successfully"
- [ ] `curl http://localhost:8081/v1/models` returns model list
- [ ] Cache verification shows cache hits on repeated requests
- [ ] Tool calling verification shows tool_calls field in response
- [ ] anyclaude connects and responds to prompts
- [ ] Second request to anyclaude is faster (uses cache)

## Minimal Reproduction (Copy-Paste)

```bash
# Terminal 1: Start server
source ~/.venv-mlx/bin/activate
python scripts/vllm-mlx-server.py \
  --model /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
  --port 8081

# Terminal 2: Run tests and anyclaude
cd /Users/akaszubski/Documents/GitHub/anyclaude
bash scripts/startup-health-check.sh
source ~/.venv-mlx/bin/activate
python scripts/test-cache-verification.py
python scripts/test-tool-calling.py
anyclaude
```

## Expected Results

| Component | Status | Evidence |
|-----------|--------|----------|
| Server | Running | `curl http://localhost:8081/v1/models` ✅ |
| Caching | Working | `cache_read_input_tokens` > 0 ✅ |
| Tool Calling | Working | `tool_calls` field present ✅ |
| anyclaude | Connected | Responds to prompts ✅ |
| Performance | Fast | 9000-token system prompt cached ✅ |

