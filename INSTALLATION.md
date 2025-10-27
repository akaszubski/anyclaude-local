# Installation Guide

Quick setup guide for AnyClaude with local model backends.

## Prerequisites

- Node.js 18+ and bun or npm
- Claude Code 2.0 installed (`claude` command available)
- One of the supported backends installed

## Supported Backends

### LMStudio (Recommended for Getting Started)

Best for: First-time setup, compatibility testing

1. Download LMStudio from https://lmstudio.ai
2. Install and launch the application
3. Download a model (e.g., Qwen3-Coder)
4. Start the local server (LMStudio will show the URL, typically `http://localhost:1234`)

### MLX-LM (Best Performance)

Best for: Apple Silicon Macs, KV cache optimization

Prerequisites:
- macOS with Apple Silicon (M1/M2/M3+)
- Python 3.9+

Installation:
```bash
# Create virtual environment
python3 -m venv ~/.venv-mlx
source ~/.venv-mlx/bin/activate

# Install MLX-LM
pip install mlx-lm

# Verify installation
python3 -m mlx_lm --help
```

Starting the server:
```bash
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081
```

### vLLM-MLX (Auto-launch with Prompt Caching & Tool Calling)

Best for: Apple Silicon Macs, automatic server startup, advanced features

Features:
- 🚀 **Auto-launches** when you run `anyclaude`
- 📦 **Prompt caching** (40-50% faster follow-ups)
- 🔧 **Tool/function calling** support
- 🛑 **Auto-cleanup** when you exit (no orphaned processes)

Prerequisites:
- macOS with Apple Silicon (M1/M2/M3+)
- Python 3.9+

Installation:
```bash
# Create virtual environment
python3 -m venv ~/.venv-mlx
source ~/.venv-mlx/bin/activate

# Install vLLM-MLX and dependencies
pip install mlx-lm fastapi uvicorn pydantic

# Verify installation
python3 -m mlx_lm --help
```

The server will auto-launch when configured in `.anyclauderc.json` - no manual startup needed!

### Claude API (Production Use)

Best for: Most reliable, official Anthropic models

1. Get API key from https://console.anthropic.com
2. Set environment variable: `export ANTHROPIC_API_KEY=sk-ant-xxxxx`

## AnyClaude Setup

### 1. Install AnyClaude

**Option A: Global Installation (Recommended)**

Install anyclaude globally so you can run it from anywhere:

```bash
# Clone repository
git clone https://github.com/anthropics/anyclaude.git
cd anyclaude

# Install dependencies and build
bun install
bun run build

# Install globally (creates `anyclaude` command)
bun install -g $(pwd)

# Verify installation
which anyclaude
anyclaude --help
```

Now you can run `anyclaude` from any directory.

**Option B: Local Development**

For development or testing without global installation:

```bash
# Clone repository
git clone https://github.com/anthropics/anyclaude.git
cd anyclaude

# Install dependencies
bun install
# or: npm install

# Build the project
bun run build
# or: npm run build

# Run locally
bun run ./dist/main.js
```

### 2. Create Configuration File

Create `.anyclauderc.json` in your project root:

**Example: vLLM-MLX (Recommended for Apple Silicon)**
```json
{
  "backend": "vllm-mlx",
  "debug": {
    "level": 0,
    "enableTraces": false,
    "enableStreamLogging": false
  },
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/mlx-model",
      "serverScript": "scripts/vllm-mlx-server.py",
      "description": "vLLM-MLX: Auto-launch, prompt caching, tool calling"
    },
    "lmstudio": {
      "enabled": true,
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "current-model",
      "description": "LMStudio local model server"
    },
    "mlx-lm": {
      "enabled": true,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-lm",
      "model": "/path/to/mlx-model",
      "description": "MLX Language Model with native KV cache"
    },
    "claude": {
      "enabled": true,
      "description": "Official Anthropic Claude API"
    }
  }
}
```

**Key settings:**
- `backend`: Which backend to use (`vllm-mlx`, `lmstudio`, `mlx-lm`, or `claude`)
- `backends[backend].model`: Full path to model (for vLLM-MLX and MLX-LM) or `current-model` for LMStudio
- `debug.level`: 0=off, 1=basic, 2=verbose, 3=trace
- For vLLM-MLX: Server auto-launches on startup and auto-cleans up on exit

See [CONFIGURATION.md](CONFIGURATION.md) for detailed options.

### 3. Start Your Backend

**vLLM-MLX (Auto-launch):**
```bash
# No manual startup needed! Server launches automatically when you run anyclaude
# Just make sure your .anyclauderc.json is configured with vllm-mlx backend
anyclaude
```

**LMStudio (Manual):**
```bash
# LMStudio application handles startup - just ensure it's running and a model is loaded
# Then run: anyclaude
```

**MLX-LM (Manual):**
```bash
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081
# In another terminal: anyclaude
```

**Claude API (No server needed):**
```bash
# Just set API key
export ANTHROPIC_API_KEY=sk-ant-xxxxx
# Then run: anyclaude --mode=claude
```

### 4. Run AnyClaude

**Basic usage:**
```bash
# Uses backend configured in .anyclauderc.json
anyclaude
```

For vLLM-MLX: Server auto-launches, model loads, then Claude Code starts. That's it!

**Advanced usage:**
```bash
# Override backend via CLI flag
anyclaude --mode=mlx-lm

# Or use environment variable
export ANYCLAUDE_MODE=mlx-lm
anyclaude

# With debug logging (see what's happening)
ANYCLAUDE_DEBUG=1 anyclaude

# Proxy-only mode (test configuration without launching Claude Code)
PROXY_ONLY=true anyclaude
```

## Configuration Priority

Settings are checked in this order (highest to lowest priority):

1. **CLI flags** (`anyclaude --mode=mlx-lm`)
2. **Environment variables** (`export ANYCLAUDE_MODE=mlx-lm`)
3. **Configuration file** (`.anyclauderc.json`)
4. **Defaults** (LMStudio at localhost:1234)

Example:
```bash
# Config file says: lmstudio
# Env var says: mlx-lm
# CLI says: claude
# Result: Claude mode is used (CLI wins)

export ANYCLAUDE_MODE=mlx-lm
anyclaude --mode=claude
```

## Testing Your Setup

### Verify Backend is Running

```bash
# Test LMStudio
curl http://localhost:1234/v1/models

# Test MLX-LM
curl http://localhost:8081/v1/models

# Test Claude API (set API key first)
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Test AnyClaude Proxy

```bash
# Start proxy without launching Claude Code
PROXY_ONLY=true anyclaude

# Should output something like:
# [anyclaude] Mode: LMSTUDIO
# [anyclaude] Proxy URL: http://localhost:3000
# [anyclaude] LMStudio endpoint: http://localhost:1234/v1
```

### Launch Claude Code

```bash
# Run with your configured backend
anyclaude

# Try a simple question
# Type: "Who are you?"
```

## Common Issues

### Backend Connection Errors

**Problem:** "Connection refused at localhost:1234"

**Solution:**
1. Verify backend is running: `curl http://localhost:1234/v1/models`
2. Check port is correct in `.anyclauderc.json`
3. Ensure model is loaded in LMStudio (check LMStudio UI)

### Wrong Mode Selected

**Problem:** Config says MLX-LM but connects to LMStudio

**Solution:**
```bash
# Check which mode is being used
PROXY_ONLY=true ANYCLAUDE_DEBUG=1 anyclaude

# Priority: CLI flag > env var > config file > defaults
# Use CLI flag to override
anyclaude --mode=mlx-lm
```

### Model Not Found

**Problem:** "Model 'current-model' not found"

**Solution:**
- LMStudio: Just load a model in the LMStudio UI, AnyClaude will use it
- MLX-LM: Model path must be correct, verify in server output

### Port Already in Use

**Problem:** "EADDRINUSE localhost:8081"

**Solution:**
1. Use different port in `.anyclauderc.json`
2. Or kill existing process:
   ```bash
   lsof -i :8081  # Find PID
   kill <PID>
   ```

## Next Steps

1. Read [CONFIGURATION.md](CONFIGURATION.md) for advanced options
2. Check [README.md](README.md) for feature overview
3. Review [PROJECT.md](PROJECT.md) for architecture details

## Environment Variables Quick Reference

```bash
# Mode selection (vllm-mlx|mlx-lm|lmstudio|claude)
export ANYCLAUDE_MODE=vllm-mlx

# vLLM-MLX (auto-launches server)
export VLLM_MLX_URL=http://localhost:8081/v1
export VLLM_MLX_MODEL=current-model
export VLLM_MLX_API_KEY=vllm-mlx

# LMStudio
export LMSTUDIO_URL=http://localhost:1234/v1
export LMSTUDIO_MODEL=current-model
export LMSTUDIO_API_KEY=lm-studio

# MLX-LM (manual server startup)
export MLX_LM_URL=http://localhost:8081/v1
export MLX_LM_MODEL=/path/to/mlx-model
export MLX_LM_API_KEY=mlx-lm

# Claude API (official, no server needed)
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# Debug and testing
export ANYCLAUDE_DEBUG=1      # 0=off, 1=basic, 2=verbose, 3=trace
export PROXY_ONLY=true        # Test proxy without launching Claude Code
export ANYCLAUDE_NO_AUTO_LAUNCH=true  # Skip auto-launch (for debugging)
```

## Support

- Report issues: https://github.com/anthropics/anyclaude/issues
- Review docs: See [README.md](README.md) and [CONFIGURATION.md](CONFIGURATION.md)
