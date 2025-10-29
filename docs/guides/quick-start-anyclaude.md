# Quick Start: anyclaude with vLLM-MLX

## The Fix

Your `anyclaude` was crashing Python because it was trying to auto-spawn the vLLM-MLX server as a subprocess. This is now fixed by disabling auto-launch. **You'll start the server manually instead**, which is actually more reliable.

## 2-Terminal Setup

### Terminal 1: Start the Server

```bash
source ~/.venv-mlx/bin/activate && python3 /Users/akaszubski/Documents/GitHub/anyclaude/scripts/vllm-mlx-server.py \
  --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081
```

Wait for this output:

```
[2025-10-29 ...] [vllm-mlx] INFO: Model loaded successfully
INFO:     Application startup complete.
```

(This takes ~10 seconds for model loading)

### Terminal 2: Run anyclaude

```bash
anyclaude
```

It will now:

1. See your server running on port 8081
2. Start without trying to spawn Python
3. Launch Claude Code with proper configuration
4. You can start asking questions!

## What Changed

| Before                            | After                      |
| --------------------------------- | -------------------------- |
| `anyclaude` tried to spawn server | You start server manually  |
| Caused macOS crash dialogs        | No crash dialogs           |
| Auto-launch could fail silently   | Clear status in Terminal 1 |
| Hard to debug                     | Errors logged to file      |

## Configuration

Your `.anyclauderc.json` now has:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "model": "current-model", // ← This disables auto-launch
      "serverScript": "scripts/vllm-mlx-server.py"
    }
  }
}
```

The `"model": "current-model"` tells anyclaude: "Don't auto-launch, assume server is already running"

## Troubleshooting

### If Terminal 2 hangs waiting for server...

- Make sure Terminal 1 server is running
- Check port 8081: `lsof -i :8081`
- Restart server in Terminal 1

### If Claude Code doesn't launch...

```bash
ANYCLAUDE_DEBUG=1 anyclaude
```

Check logs at:

```bash
cat ~/.anyclaude/logs/vllm-mlx-server.log
```

### If you want to switch back to auto-launch (risky)...

Edit `.anyclauderc.json` and change:

```json
"model": "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
```

But expect the crash dialog to return.

## Quick Aliases

Add to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
# Start vLLM-MLX server in background
alias vllm-start='source ~/.venv-mlx/bin/activate && python3 ~/Documents/GitHub/anyclaude/scripts/vllm-mlx-server.py --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" --port 8081 &'

# Check if server is running
alias vllm-status='lsof -i :8081 && echo "Server running" || echo "Server not running"'

# Kill server
alias vllm-stop='pkill -f "vllm-mlx-server.py"'
```

Then:

```bash
vllm-start  # Terminal 1
anyclaude   # Terminal 2
```

## What You're Getting

✅ No more crash dialogs
✅ Qwen3-Coder-30B local model with prompt caching
✅ Tool calling support
✅ Full Claude Code IDE features
✅ Traces logged to `~/.anyclaude/traces/vllm-mlx/`

## Debug Output

To see what's happening:

```bash
# Verbose debug output in Terminal 2
ANYCLAUDE_DEBUG=1 anyclaude
```

To see all events (including tool calls):

```bash
# Most verbose
ANYCLAUDE_DEBUG=3 anyclaude
```

## Done! 🎉

You're all set. The crash issue is fixed. Just remember the 2-terminal setup:

1. **Terminal 1**: `source ~/.venv-mlx/bin/activate && python3 .../vllm-mlx-server.py ...`
2. **Terminal 2**: `anyclaude`

That's it!
