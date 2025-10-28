# anyclaude Quick Start Guide

Get anyclaude running in 2 minutes with automatic dependency setup.

## One-Command Setup

```bash
scripts/setup-complete.sh
```

This script will:
- ✅ Check/install Claude Code CLI (local version)
- ✅ Create Python virtual environment
- ✅ Install all required dependencies
- ✅ Configure everything automatically
- ✅ Verify the setup

## Then Just Run

```bash
anyclaude --mode=vllm-mlx
```

Claude Code will open and connect to your local vLLM-MLX server.

---

## What Gets Set Up

### 1. Claude Code CLI
- Installs the **local** command-line version (NOT Claude Code Max/web)
- This is required because the web version doesn't support custom API endpoints

### 2. Python Virtual Environment (`~/.venv-mlx`)
- Isolated Python environment for MLX
- Contains: fastapi, uvicorn, mlx-lm, and dependencies

### 3. Configuration (`.anyclauderc.json`)
- vLLM-MLX backend settings
- Model path
- Port configuration

### 4. Build System
- Installs bun (if needed)
- Builds anyclaude from source

---

## Verify Setup Anytime

```bash
anyclaude --check-setup
```

Shows the status of all dependencies.

---

## Common Issues

### "Claude Code Max is not compatible"
You have the web version installed. The setup script will guide you to install the local CLI version instead.

### "Python virtual environment not found"
Run the setup script again: `scripts/setup-complete.sh`

### "Model path not found"
Update `.anyclauderc.json` with the correct path to your MLX model directory.

---

## Running anyclaude

### Standard mode (with all logging)
```bash
anyclaude --mode=vllm-mlx
```

### With debug output
```bash
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx
```

### With verbose debug logging
```bash
ANYCLAUDE_DEBUG=2 anyclaude --mode=vllm-mlx
```

### With trace debug (includes tool calls)
```bash
ANYCLAUDE_DEBUG=3 anyclaude --mode=vllm-mlx
```

---

## Using Other Backends

### LMStudio (local)
```bash
anyclaude --mode=lmstudio
```
(Make sure LMStudio is running with a model loaded)

### Real Claude API
```bash
anyclaude --mode=claude
```
(Requires `ANTHROPIC_API_KEY` environment variable)

---

## Configuration

Edit `.anyclauderc.json` to customize:

```json
{
  "backend": "vllm-mlx",
  "debug": {
    "level": 0,
    "enableTraces": false
  },
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/mlx/model"
    }
  }
}
```

---

## Next Steps

1. Run: `scripts/setup-complete.sh`
2. Run: `anyclaude --mode=vllm-mlx`
3. Start asking Claude Code questions!

Need help? Check `CLAUDE.md` or see `docs/` for detailed guides.
