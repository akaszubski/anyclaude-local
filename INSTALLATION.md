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

### Claude API (Production Use)

Best for: Most reliable, official Anthropic models

1. Get API key from https://console.anthropic.com
2. Set environment variable: `export ANTHROPIC_API_KEY=sk-ant-xxxxx`

## AnyClaude Setup

### 1. Install AnyClaude

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
```

### 2. Create Configuration File

Create `.anyclauderc.json` in your project root:

```json
{
  "backend": "lmstudio",
  "debug": {
    "level": 0,
    "enableTraces": false,
    "enableStreamLogging": false
  },
  "backends": {
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
      "model": "current-model",
      "description": "MLX Language Model with native KV cache"
    }
  }
}
```

**Key settings:**
- `backend`: Which backend to use (`lmstudio`, `mlx-lm`, or `claude`)
- `debug.level`: 0=off, 1=basic, 2=verbose, 3=trace
- `backends`: Configuration for each available backend

See [CONFIGURATION.md](CONFIGURATION.md) for detailed options.

### 3. Start Your Backend

**LMStudio:**
```bash
# LMStudio application handles startup - just ensure it's running and a model is loaded
```

**MLX-LM:**
```bash
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081
```

**Claude API:**
```bash
# Just need ANTHROPIC_API_KEY set
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 4. Run AnyClaude

```bash
# Basic usage (uses backend from .anyclauderc.json)
anyclaude

# Or override backend via CLI
anyclaude --mode=mlx-lm

# Or use environment variable
export ANYCLAUDE_MODE=mlx-lm
anyclaude

# With debug logging
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
# Mode selection
export ANYCLAUDE_MODE=mlx-lm|lmstudio|claude

# LMStudio
export LMSTUDIO_URL=http://localhost:1234/v1
export LMSTUDIO_MODEL=current-model
export LMSTUDIO_API_KEY=lm-studio

# MLX-LM
export MLX_LM_URL=http://localhost:8081/v1
export MLX_LM_MODEL=current-model
export MLX_LM_API_KEY=mlx-lm

# Claude API
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# Debug
export ANYCLAUDE_DEBUG=1      # 0=off, 1=basic, 2=verbose, 3=trace
export PROXY_ONLY=true        # Test proxy without launching Claude Code
```

## Support

- Report issues: https://github.com/anthropics/anyclaude/issues
- Review docs: See [README.md](README.md) and [CONFIGURATION.md](CONFIGURATION.md)
