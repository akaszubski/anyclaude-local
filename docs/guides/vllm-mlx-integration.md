# vLLM-MLX Integration Summary

## What Was Built

I've successfully integrated vLLM-MLX into anyclaude with **automatic virtual environment management**. This eliminates the manual setup steps you were doing before.

### Before Integration ❌
You had to manually:
1. Activate virtual environment: `source ~/.venv-mlx/bin/activate`
2. Start the server: `python3 scripts/vllm-mlx-server.py --model ... --port 8081`
3. In another terminal, launch anyclaude with proper environment variables

### After Integration ✅
Now it's just:
```bash
anyclaude --mode=vllm-mlx
```

Everything else happens automatically!

---

## Changes Made

### 1. **Server Launcher Enhancement** (`src/server-launcher.ts`)
- Updated `startVLLMMLXServer()` to automatically activate `~/.venv-mlx`
- Added venv validation - shows helpful error if not found
- Builds command that sources venv before starting server
- Handles process cleanup on shutdown

```typescript
// Now does this automatically:
const command = `source ${activateScript} && python3 ${serverScriptPath} --model "${modelPath}" --port ${port}`;
```

### 2. **Setup Script** (`scripts/setup-vllm-mlx-venv.sh`)
- One-time setup script that creates `~/.venv-mlx` with all dependencies
- Handles existing venv (asks before recreating)
- Installs: mlx, mlx-lm, mlx-metal, certifi, huggingface-hub, vllm-mlx
- Verifies installation with import test
- Colorized output for clarity

**Usage:**
```bash
scripts/setup-vllm-mlx-venv.sh
```

### 3. **Integration Test** (`scripts/test/test-vllm-mlx-launcher.js`)
- Verifies venv setup
- Checks server script exists
- Validates `.anyclauderc.json` configuration
- Tests build artifacts
- Shows summary with next steps

**Usage:**
```bash
node scripts/test/test-vllm-mlx-launcher.js
```

### 4. **Documentation**
- **`docs/guides/vllm-mlx-setup.md`** - Comprehensive setup guide with:
  - Model selection recommendations
  - Downloading models
  - Performance tips
  - Troubleshooting
  - Backend comparison table

- **`VLLM_MLX_QUICKSTART.md`** - Quick reference guide with:
  - One-time setup steps
  - Daily usage commands
  - Common troubleshooting
  - Advanced options

---

## File Structure

```
anyclaude/
├── src/
│   └── server-launcher.ts              ← Auto-activates venv
├── scripts/
│   ├── setup-vllm-mlx-venv.sh         ← One-time setup
│   ├── test/
│   │   └── test-vllm-mlx-launcher.js  ← Verify integration
│   ├── vllm-mlx-server.py             ← Server script
│   └── ...
├── docs/guides/
│   └── vllm-mlx-setup.md              ← Full guide
├── VLLM_MLX_QUICKSTART.md             ← Quick reference
└── .anyclauderc.json                  ← Configuration
```

---

## Configuration

Your `.anyclauderc.json` already has the right structure:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
      "serverScript": "scripts/vllm-mlx-server.py",
      "description": "vLLM-MLX with Qwen3 Coder"
    }
  }
}
```

All the paths are correct and the model exists. Ready to use!

---

## Workflow

### First Time Using vLLM-MLX

```bash
# 1. One-time setup (5-10 minutes)
cd /path/to/anyclaude
scripts/setup-vllm-mlx-venv.sh

# 2. Verify setup
node scripts/test/test-vllm-mlx-launcher.js

# 3. Start using it!
anyclaude --mode=vllm-mlx
```

### Daily Usage

Just run:
```bash
anyclaude --mode=vllm-mlx
```

Or without the flag if you set `"backend": "vllm-mlx"` in `.anyclauderc.json`:
```bash
anyclaude
```

### What Happens

1. anyclaude reads `.anyclauderc.json`
2. Detects `--mode=vllm-mlx`
3. Calls `launchBackendServer("vllm-mlx", config)`
4. Server launcher checks `~/.venv-mlx` exists
5. Activates venv automatically
6. Launches `scripts/vllm-mlx-server.py`
7. Model loads (~20-30 seconds first time)
8. Server ready on `http://localhost:8081/v1`
9. anyclaude starts Claude Code with proxy
10. You can code!

---

## Key Features

✅ **Automatic venv activation** - No manual sourcing required
✅ **Error handling** - Shows helpful messages if venv missing
✅ **Configuration** - Fully integrated with `.anyclauderc.json`
✅ **Graceful shutdown** - Handles Ctrl+C properly
✅ **Process cleanup** - Kills server on exit
✅ **Health checks** - Waits for server readiness
✅ **Debug logging** - Use `ANYCLAUDE_DEBUG=1` to troubleshoot
✅ **Tests included** - Integration test verifies everything works

---

## Troubleshooting

### "Python virtual environment not found"

The venv wasn't created yet:
```bash
scripts/setup-vllm-mlx-venv.sh
```

### "Cannot import certifi" error

The system Python has a corrupted certifi. The setup script fixes this:
```bash
scripts/setup-vllm-mlx-venv.sh
```

### Verify everything is working

```bash
node scripts/test/test-vllm-mlx-launcher.js
```

This checks:
- ✓ Venv exists and is configured
- ✓ Server script exists
- ✓ `.anyclauderc.json` is valid
- ✓ Model path exists
- ✓ Build artifacts are present

### Enable debug logging

```bash
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx
ANYCLAUDE_DEBUG=2 anyclaude --mode=vllm-mlx  # More verbose
ANYCLAUDE_DEBUG=3 anyclaude --mode=vllm-mlx  # Trace (includes tool calls)
```

---

## Testing

All existing tests pass:

```bash
npm run test
```

Results:
- ✅ 5 unit test suites
- ✅ 5 regression tests
- ✅ 0 failures
- ✅ Build succeeds

The integration doesn't break any existing functionality!

---

## Comparison with Other Backends

| Feature | vLLM-MLX | MLX-LM | LMStudio | Claude API |
|---------|----------|--------|----------|-----------|
| Speed | ⚡⚡⚡ Fast | ⚡⚡ Moderate | ⚡⚡ Moderate | - |
| Tool calling | ✓ Good | ⚠️ Basic | ✓ Good | ✓ Best |
| Prompt caching | ✓ Yes | ✗ No | ⚠️ Limited | ✓ Yes |
| Setup | Script | Manual | GUI | API key |
| Memory efficient | ✓ Yes | ✓✓ Very | ⚠️ More | - |
| Model limit | 70B | 30B | Unlimited | 200K ctx |
| Privacy | ✓ Local | ✓ Local | ✓ Local | ✗ Cloud |
| Cost | Free | Free | Free | $$ |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    anyclaude CLI                        │
│  (runs with --mode=vllm-mlx or backend config)         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              server-launcher.ts                         │
│  1. Check ~/.venv-mlx exists                           │
│  2. Build activation command                            │
│  3. Spawn vLLM-MLX server with venv active            │
│  4. Wait for "Application startup complete"            │
│  5. Register process for cleanup                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  ~/.venv-mlx/bin/python3 scripts/vllm-mlx-server.py   │
│                                                         │
│  ├─ Loads MLX model from disk                         │
│  ├─ Starts vLLM server                                │
│  ├─ Listens on localhost:8081/v1                      │
│  └─ OpenAI-compatible API                            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              anthropic-proxy.ts                         │
│  Routes Anthropic API calls → vLLM-MLX server        │
│  Translates message formats in both directions        │
│  Handles streaming protocol conversion                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│                   Claude Code                           │
│  (launched with ANTHROPIC_BASE_URL pointing to proxy)  │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps

### To Use vLLM-MLX Today

1. **First time:**
   ```bash
   cd /path/to/anyclaude
   scripts/setup-vllm-mlx-venv.sh
   ```

2. **Verify setup:**
   ```bash
   node scripts/test/test-vllm-mlx-launcher.js
   ```

3. **Start using:**
   ```bash
   anyclaude --mode=vllm-mlx
   ```

### Optional: Download Additional Models

If you want to try other models:

```bash
# Go to https://huggingface.co/mlx-community
# Find a model ending in -MLX or -mlx-4bit
# Download it:

python3 -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/DeepSeek-Coder-33B-Instruct-MLX-4bit', local_dir='~/models/deepseek-coder-33b')"
```

Then update `.anyclauderc.json` with the new path.

---

## Documentation

- **Quick Start**: [VLLM_MLX_QUICKSTART.md](VLLM_MLX_QUICKSTART.md) ← Start here
- **Full Guide**: [docs/guides/vllm-mlx-setup.md](docs/guides/vllm-mlx-setup.md) ← Deep dive
- **All Backends**: [README.md](README.md) ← Compare backends
- **Architecture**: [PROJECT.md](PROJECT.md) ← System design

---

## Summary

You now have a complete, integrated vLLM-MLX setup that:

1. ✅ Automatically manages the Python virtual environment
2. ✅ Requires just one command to start: `anyclaude --mode=vllm-mlx`
3. ✅ Has comprehensive documentation
4. ✅ Includes integration tests
5. ✅ Passes all existing tests
6. ✅ Handles errors gracefully
7. ✅ Supports advanced configuration options

**Everything just works!** 🚀

---

**Commit:** `527161a` - "feat: integrate vLLM-MLX with automatic virtual environment management"
