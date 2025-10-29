# vLLM-MLX Quick Start Guide

Your anyclaude setup now includes **integrated vLLM-MLX support** with automatic virtual environment management!

## One-Time Setup

### Step 1: Initialize the Virtual Environment

```bash
cd /path/to/anyclaude
scripts/setup-vllm-mlx-venv.sh
```

This creates and configures `~/.venv-mlx` with all dependencies (mlx, mlx-lm, vllm-mlx, certifi, etc.). Takes 5-10 minutes.

**Already done?** Skip to Step 2.

### Step 2: Verify Your Model Path

Edit `.anyclauderc.json` and ensure the `vllm-mlx` section has your model path:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/mlx-model"
    }
  }
}
```

Replace `/path/to/your/mlx-model` with your actual model path.

## Daily Usage

### Start anyclaude with vLLM-MLX

```bash
anyclaude --mode=vllm-mlx
```

Or if you set `"backend": "vllm-mlx"` in config, just:

```bash
anyclaude
```

### What Happens Automatically

1. ✓ Checks virtual environment exists (`~/.venv-mlx`)
2. ✓ Activates venv
3. ✓ Launches vLLM-MLX server on port 8081
4. ✓ Loads your model (~20-30 seconds first time)
5. ✓ Starts Claude Code connected to the server

You'll see output like:

```
[anyclaude] Starting vLLM-MLX server...
[anyclaude] Model: Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
[anyclaude] Port: 8081
[anyclaude] Waiting ~30 seconds for model to load...
[vllm-mlx] INFO: Model loaded successfully
[anyclaude] vLLM-MLX server started successfully
[anyclaude] Proxy URL: http://localhost:...
```

Then Claude Code launches automatically!

## Features

✅ **Prompt caching** - 40-50% faster follow-ups
✅ **Tool/function calling** - Full support
✅ **Native MLX** - No conversions needed
✅ **Auto-launch** - Server starts automatically
✅ **Graceful shutdown** - Handles Ctrl+C properly

## Troubleshooting

### "Python virtual environment not found"

```bash
scripts/setup-vllm-mlx-venv.sh
```

### "Model path not found"

Check `.anyclauderc.json`:
- Use absolute paths (not relative)
- Verify model exists: `ls /path/to/your/model`
- No spaces or special characters in paths

### Server won't start / timeout

```bash
# Check if port 8081 is available
lsof -i :8081

# If busy, kill it or use different port
kill -9 <PID>
```

### Model is too slow

Try a smaller model. For coding tasks:
- Qwen3-Coder-6.7B (fastest)
- DeepSeek-Coder-6.7B (fast + code)
- **Qwen3-Coder-30B (recommended)**

Or enable debug logs:

```bash
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx
```

## Advanced Options

### Manual Server Control

```bash
# Terminal 1: Start server manually
source ~/.venv-mlx/bin/activate
python3 scripts/vllm-mlx-server.py --model /path/to/model --port 8081

# Terminal 2: Start anyclaude without auto-launching
ANYCLAUDE_NO_AUTO_LAUNCH=true anyclaude --mode=vllm-mlx
```

### Custom Port

Edit `.anyclauderc.json`:

```json
{
  "backends": {
    "vllm-mlx": {
      "port": 9000,
      "baseUrl": "http://localhost:9000/v1"
    }
  }
}
```

### Debug Levels

```bash
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx    # Basic
ANYCLAUDE_DEBUG=2 anyclaude --mode=vllm-mlx    # Verbose
ANYCLAUDE_DEBUG=3 anyclaude --mode=vllm-mlx    # Trace (tool calls)
```

## Verify Setup

Run the integration test anytime:

```bash
node scripts/test/test-vllm-mlx-launcher.js
```

Should show all ✓ PASS.

## Architecture

```
anyclaude
├─ Detects --mode=vllm-mlx
├─ Checks ~/.venv-mlx (or shows setup instructions)
├─ Activates venv automatically
├─ Launches vLLM-MLX server with your model
├─ Creates Anthropic API proxy
├─ Launches Claude Code with ANTHROPIC_BASE_URL pointing to proxy
└─ Handles graceful shutdown (SIGINT/SIGTERM)
```

## See Also

- **Full setup guide**: [docs/guides/vllm-mlx-setup.md](docs/guides/vllm-mlx-setup.md)
- **All backends**: [README.md](README.md)
- **Architecture**: [PROJECT.md](PROJECT.md)
- **Troubleshooting**: [docs/debugging/tool-calling-fix.md](docs/debugging/tool-calling-fix.md)

---

**Questions?** Check the [full setup guide](docs/guides/vllm-mlx-setup.md).
