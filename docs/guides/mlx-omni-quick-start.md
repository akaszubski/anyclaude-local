# MLX-Omni-Server Quick Start Guide

## Overview

**MLX-Omni-Server** is the recommended integration for AnyClaude when you need both:
- **Fast performance** via native KV cache support (30-100x faster follow-ups)
- **Full tool calling** support (Read, Edit, Bash, etc. work seamlessly)

This guide gets you up and running with MLX-Omni-Server in 10 minutes.

## Why MLX-Omni vs MLX-LM?

| Feature | MLX-Omni | MLX-LM | LMStudio |
|---------|----------|--------|----------|
| **Tool Calling** | ✅ Yes | ❌ No | ✅ Yes |
| **KV Cache** | ✅ Yes (Native) | ✅ Yes (Native) | ❌ No |
| **API Format** | Anthropic (native) | OpenAI (compatible) | OpenAI (compatible) |
| **Follow-up Speed** | <1 second | <1 second | ~30 seconds |
| **First Query** | ~30-60 seconds | ~30-60 seconds | ~30 seconds |
| **Best For** | Analysis + tool use | Analysis only | Editing + tools |

**Bottom Line**: MLX-Omni is the best choice for Claude Code sessions that need both speed and full feature support.

## Installation & Setup

### 1. Install MLX-Omni-Server

```bash
# Using pip (recommended)
pip install mlx-omni-server

# Or using pipx (isolated environment)
pipx install mlx-omni-server
```

Verify installation:

```bash
mlx-omni-server --help
```

### 2. Start MLX-Omni-Server

```bash
# Set the model path
export MLX_MODEL="/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"

# Start the server on port 8080
mlx-omni-server --port 8080 --log-level info
```

**What this does**:
- Loads your Qwen3-Coder model on startup
- Exposes Anthropic API on `http://localhost:8080/anthropic`
- Enables native KV cache for subsequent queries
- Takes ~45 seconds to load the model on first run

**Tips**:
- Remove `--log-level info` for quieter output
- Use `--workers 1` for better tool calling (default)
- Model path can also be set as `MLX_MODEL` environment variable

### 3. Start AnyClaude with MLX-Omni

In another terminal:

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude

# Run with mlx-omni mode
ANYCLAUDE_MODE=mlx-omni ./dist/main-cli.js
```

This launches Claude Code with MLX-Omni-Server backend.

## How It Works

### First Query (Cold Cache)
```
Claude Code asks question → AnyClaude proxy → mlx-omni-server
mlx-omni computes system prompt (18,490 tokens) + user input
Stores computed KV in cache
Returns response (~30-60 seconds)
```

### Follow-up Queries (Cached)
```
Claude Code asks follow-up → AnyClaude proxy → mlx-omni-server
mlx-omni retrieves cached KV for system prompt (instant)
Only computes new user input tokens
Returns response (<1 second)
```

### Tool Calling
```
Claude Code needs to read file → AnyClaude proxy → mlx-omni-server
mlx-omni returns tool call response
AnyClaude executes the tool locally (Read, Edit, Bash, etc.)
Results are sent back to mlx-omni for continuation
Process repeats with cache still active
```

**Result**: Full Claude Code functionality with 30-100x faster follow-ups!

## Performance Expectations

| Scenario | Time | Note |
|----------|------|------|
| First query | ~30-60s | System prompt computed & cached |
| Follow-ups | <1s | Cached KV reused, instant |
| Tool call | <1-2s | Uses cache, executes locally |
| Session total (5 queries) | ~60s | vs 200+ seconds without cache (3x speedup) |
| Tool heavy session | ~45s | 3 tool calls + 2 analysis questions |

**Note**: Times vary based on:
- Model size (30B models are larger)
- System prompt size (18,490 tokens being cached)
- Response length (longer responses take longer to generate)
- Hardware (M4 Max shows better cache efficiency)
- Network latency (if mlx-omni is remote)

## Environment Variables

```bash
# Required
export ANYCLAUDE_MODE=mlx-omni
export MLX_OMNI_URL="http://localhost:8080/anthropic"
export MLX_MODEL="/path/to/model"

# Optional (these are the defaults)
export MLX_OMNI_API_KEY="mlx-omni"
export MLX_OMNI_MODEL="qwen3-coder-30b"

# Debug
export ANYCLAUDE_DEBUG=1  # Basic debug
export ANYCLAUDE_DEBUG=2  # Verbose debug
export ANYCLAUDE_DEBUG=3  # Trace (includes tool calls)
```

## Typical Session

```bash
# Terminal 1: Start mlx-omni-server
$ export MLX_MODEL="/path/to/Qwen3-Coder-30B"
$ mlx-omni-server --port 8080 --log-level info
mlx-omni-server listening on http://0.0.0.0:8080
[Ready for requests]

# Terminal 2: Start AnyClaude
$ ANYCLAUDE_MODE=mlx-omni ./dist/main-cli.js
[anyclaude] Mode: MLX-OMNI
[anyclaude] Proxy URL: http://localhost:52001
[anyclaude] MLX-Omni endpoint: http://localhost:8080/anthropic

Claude Code ready → Ask your first question
"Analyze this code for performance issues"
⏱️  ~40 seconds (system prompt computed & cached)

Claude Code → Ask follow-up
"What about memory usage?"
⏱️  <1 second (cache hit!)

Claude Code → Try a tool call
"Read src/main.ts and tell me what it does"
⏱️  ~1 second (cache + local tool execution)

Claude Code → Another analysis
"Can you refactor it?"
⏱️  <1 second (cache hit!)
```

## Troubleshooting

### MLX-Omni-Server doesn't start

```bash
# Check Python installation
which python3
python3 --version

# Check mlx-omni is installed
pip list | grep mlx-omni

# Reinstall if needed
pip install --upgrade mlx-omni-server
```

### "Connection refused" error

```bash
# Verify mlx-omni-server is listening
curl http://localhost:8080/anthropic/v1/models

# If not responding, check if port is in use
lsof -i :8080

# Restart the server
pkill -f mlx-omni-server
export MLX_MODEL="/path/to/model"
mlx-omni-server --port 8080
```

### Slow follow-ups (<1s expected)

- First request may still be warming up
- Try 2-3 more queries to see cache hit
- Check mlx-omni logs for "KV cache" messages
- Verify system prompt is being cached

### Tool calling not working

```bash
# Check if mlx-omni-server supports Anthropic API
curl -X POST http://localhost:8080/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mlx-omni" \
  -d '{"model":"qwen3-coder-30b","messages":[{"role":"user","content":"Hello"}]}'
```

### AnyClaude shows wrong mode

```bash
# Wrong - environment variable not set during spawn
ANYCLAUDE_MODE=mlx-omni ./dist/main-cli.js

# Correct - always works
export ANYCLAUDE_MODE=mlx-omni
./dist/main-cli.js
```

## Advanced Configuration

### Using a Remote MLX-Omni-Server

```bash
# Start mlx-omni on server (0.0.0.0 listens on all interfaces)
mlx-omni-server --host 0.0.0.0 --port 8080

# Connect from AnyClaude on local machine
export MLX_OMNI_URL="http://192.168.1.100:8080/anthropic"
ANYCLAUDE_MODE=mlx-omni ./dist/main-cli.js
```

### Running Multiple Workers

```bash
# For better concurrency with tool calling
mlx-omni-server --port 8080 --workers 2
```

### Monitor Cache Usage

```bash
# Watch mlx-omni logs for cache statistics
tail -f <mlx-omni-log-file> | grep -i cache
```

## Comparison with Other Modes

From `README.md`:

| Feature | MLX-Omni | MLX-LM | LMStudio | Claude API |
|---------|----------|--------|----------|-----------|
| KV Cache | ✅ Yes (30-100x) | ✅ Yes (30-100x) | ❌ No | ✅ Yes |
| Tool Calling | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| Speed (follow-ups) | <1s | <1s | ~30s | ~5s |
| Cost | $0 | $0 | $0 | $$ |
| Model Control | Loaded on startup | Loaded on startup | UI | N/A |
| Best For | **Analysis + Tools** | **Analysis Only** | **Editing/Files** | **Premium** |

## Next Steps

1. **Immediate**: Test with analysis + tool calling
   - Run a long analysis query
   - Follow up with 2-3 quick questions (feel the speedup)
   - Try a tool call (Read file, Check code, etc.)

2. **Production**: Use hybrid mode strategy
   - MLX-Omni for analysis tasks and Q&A (fast + tools)
   - LMStudio for editing/multi-file ops if needed
   - Switch between them as needed via `ANYCLAUDE_MODE`

3. **Optimization**: Monitor and tune
   - Track cache hit rates
   - Monitor system prompt size (can be reduced if needed)
   - Test with different models (30B vs smaller)

## References

- [MLX-Omni-Server GitHub](https://github.com/ml-explore/mlx-omni-server)
- [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages)
- [KV Cache Explanation](https://en.wikipedia.org/wiki/Transformer_(machine_learning_model)#Computational_and_memory_efficiency)
- [AnyClaude Architecture](../../PROJECT.md)
- [MLX-LM Quick Start](./mlx-lm-quick-start.md) - For analysis-only use cases
