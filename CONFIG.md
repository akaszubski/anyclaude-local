# AnyClaude Configuration Guide

## Overview

AnyClaude supports persistent configuration through `.anyclauderc` files. This eliminates the need to type long model paths or set environment variables every time you run AnyClaude.

## Configuration System

### How Configuration Works

Configuration is loaded in this order (highest to lowest priority):

1. **Environment Variables** - Overrides everything
   ```bash
   export ANYCLAUDE_MODE=mlx-lm
   export MLX_MODEL=/path/to/model
   ./anyclaude
   ```

2. **Home Directory Config** - `~/.anyclauderc`
   ```bash
   # Applied to all projects
   cat ~/.anyclauderc
   ```

3. **Project Directory Config** - `.anyclauderc` in repo root
   ```bash
   # Only applies to this project
   cat .anyclauderc
   ```

4. **Built-in Defaults** - Fallback if nothing else set
   ```
   ANYCLAUDE_MODE=mlx-omni
   MLX_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
   ANYCLAUDE_DEBUG=0
   ```

**Example**: If you set `MLX_MODEL` in `~/.anyclauderc` and override it with `ANYCLAUDE_MODE=mlx-omni`, the environment variable takes precedence.

## Configuration Files

### `.anyclauderc` Format

Configuration files are simple shell-style key=value pairs (one per line):

```bash
# Comments start with #

# Mode selection
ANYCLAUDE_MODE=mlx-lm

# Model specification
MLX_MODEL=/path/to/local/model

# Debug logging
ANYCLAUDE_DEBUG=0
```

**Important**: No spaces around `=` and no quotes needed for most values.

### Available Settings

#### ANYCLAUDE_MODE
**Type**: `mlx-omni` or `mlx-lm`
**Default**: `mlx-omni`

Controls which backend server to use. Choose based on your needs:

**MLX-Omni** (Native Anthropic API with KV Cache) - RECOMMENDED for speed
- Use HuggingFace model IDs only (mlx-community/...)
- Native Anthropic API format (same as real Claude API)
- **30x faster follow-ups** via Key-Value cache: 1st question ~30-40s, follow-ups <1s
- Full tool calling support and streaming
- Best for: Interactive development where follow-ups matter

```bash
ANYCLAUDE_MODE=mlx-omni
```

**MLX-LM** (OpenAI-compatible for any model)
- Support for local model file paths (filesystem)
- Support for HuggingFace model IDs (auto-downloads)
- No native KV cache support
- Consistent performance: ~25-40s per request
- Best for: Using large local models (like your Qwen3-Coder-30B)

```bash
ANYCLAUDE_MODE=mlx-lm
```

### MLX-Omni Architectural Notes

**Important**: MLX-Omni-Server does **NOT** accept model parameters on startup!

- MLX-Omni uses whatever model is **already loaded** in memory
- You must pre-load the model using: `mlx-omni-server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit`
- Or use `MLX_MODEL` environment variable BEFORE starting the launcher
- The `.anyclauderc` config file is **loaded for reference only** - it doesn't affect MLX-Omni startup

**Why?** MLX-Omni-Server is designed for persistent model loading. Once a model is loaded, AnyClaude just connects to it.

### When to Use MLX-Omni vs MLX-LM

| Feature | MLX-Omni | MLX-LM |
|---------|----------|--------|
| **Local Model Files** | ❌ No (HuggingFace IDs only) | ✅ Yes |
| **Config File Controls Model** | ❌ No (pre-load required) | ✅ Yes |
| **HuggingFace IDs** | ✅ Yes | ✅ Yes |
| **KV Cache (Fast Follow-ups)** | ✅ Yes (~30s → <1s) | ❌ No |
| **Qwen3-Coder-30B (local)** | ❌ Cannot use | ✅ Use this |
| **Small HuggingFace models** | ✅ Faster with cache | ✅ Works |

#### MLX_MODEL
**Type**: String (file path or HuggingFace ID)
**Default**: `mlx-community/Qwen2.5-1.5B-Instruct-4bit`

Specifies which model to use:

**For MLX-Omni** (HuggingFace IDs only):
```bash
MLX_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
MLX_MODEL=mlx-community/Llama-3.2-1B-Instruct-4bit
MLX_MODEL=mlx-community/Qwen2.5-3B-Instruct-4bit
```

**For MLX-LM** (local paths or HuggingFace IDs):
```bash
# Local path (preferred for large models)
MLX_MODEL=/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit

# HuggingFace ID (auto-downloads)
MLX_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
```

#### ANYCLAUDE_DEBUG
**Type**: `0`, `1`, `2`, or `3`
**Default**: `0`

Controls debug output verbosity:

- `0` - No debug output (silent)
- `1` - Basic debug info (startup, config loading)
- `2` - Verbose debug (API requests/responses)
- `3` - Trace mode (includes tool calls, streaming details)

```bash
ANYCLAUDE_DEBUG=1
```

#### MLX_LM_PORT
**Type**: Integer (port number)
**Default**: `8081`

Port for MLX-LM server (only used with `ANYCLAUDE_MODE=mlx-lm`):

```bash
MLX_LM_PORT=8081
```

#### MLX_OMNI_PORT
**Type**: Integer (port number)
**Default**: `8080`

Port for MLX-Omni server (only used with `ANYCLAUDE_MODE=mlx-omni`):

```bash
MLX_OMNI_PORT=8080
```

#### VENV_PATH
**Type**: String (file path)
**Default**: `~/.venv-mlx`

Path to Python virtual environment (only used with `ANYCLAUDE_MODE=mlx-lm`):

```bash
VENV_PATH=/path/to/venv
```

#### PROXY_ONLY
**Type**: `true` or `false`
**Default**: `false`

Run proxy server without spawning Claude Code (for testing):

```bash
PROXY_ONLY=true
```

## Quick Mode Switching

### MLX-LM (Uses config file - Recommended for local models)

Simply run - it loads the model from config:

```bash
./anyclaude mlx-lm
# Loads MLX_MODEL from .anyclauderc or ~/.anyclauderc
```

### MLX-Omni (Pre-load model separately - KV cache enabled)

**Important**: You must pre-load the model BEFORE running AnyClaude:

```bash
# In one terminal: Start MLX-Omni with the model
mlx-omni-server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit
# Wait for it to be ready (shows "Serving models...")

# In another terminal: Run AnyClaude
./anyclaude mlx-omni
# Now AnyClaude connects to the pre-loaded model with KV cache
```

Or in one command with environment variable:

```bash
# Start server with model and immediately run AnyClaude
export MLX_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
mlx-omni-server --model "$MLX_MODEL" &
sleep 15  # Wait for startup
./anyclaude mlx-omni
```

The launcher will connect to the appropriate backend (MLX-Omni or MLX-LM) and spawn Claude Code with full terminal support.

## Usage Patterns

### Pattern 1: Project-Specific Config

Store `.anyclauderc` in your project:

```bash
# In /Users/akaszubski/Documents/GitHub/anyclaude/.anyclauderc
ANYCLAUDE_MODE=mlx-lm
MLX_MODEL=/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
ANYCLAUDE_DEBUG=0
```

Then just run:
```bash
./anyclaude
# Uses settings from .anyclauderc
```

### Pattern 2: Global Config for All Projects

Store `~/.anyclauderc` in your home directory:

```bash
# In ~/.anyclauderc
ANYCLAUDE_MODE=mlx-lm
MLX_MODEL=/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
ANYCLAUDE_DEBUG=1
MLX_LM_PORT=8081
```

Then any project can use:
```bash
./anyclaude
# Uses settings from ~/.anyclauderc
```

Create it with:
```bash
cp .anyclauderc ~/.anyclauderc
```

### Pattern 3: Override with Environment Variables

Keep config files unchanged, override at runtime:

```bash
# Temporarily use different mode
export ANYCLAUDE_MODE=mlx-omni
./anyclaude
# Uses mlx-omni (overrides config file)

# Restore to config file default
unset ANYCLAUDE_MODE
./anyclaude
# Uses value from .anyclauderc or ~/.anyclauderc
```

### Pattern 4: Command-Line Overrides

Use command line arguments with config:

```bash
# Config file says mlx-lm, but switch to mlx-omni
./anyclaude mlx-omni
# Uses mlx-omni mode

# Config file has MLX_MODEL set, use it
./anyclaude mlx-lm
# Uses mode from config, MLX_MODEL from config
```

## Setup Instructions

### Initial Setup (One Time)

1. **Verify the project config exists:**
   ```bash
   cat .anyclauderc
   ```

2. **Test it works:**
   ```bash
   ./anyclaude mlx-lm
   # Should start with your configured model
   ```

3. **(Optional) Create home config for all projects:**
   ```bash
   cp .anyclauderc ~/.anyclauderc
   # Edit as needed:
   # nano ~/.anyclauderc
   ```

### Daily Usage

**Option A: Just run it (uses project or home config)**
```bash
./anyclaude
# Automatically loads .anyclauderc or ~/.anyclauderc
```

**Option B: Temporarily override**
```bash
export ANYCLAUDE_DEBUG=2
./anyclaude
# Uses config but with DEBUG=2
```

**Option C: Quick mode switch**
```bash
./anyclaude mlx-omni
# Override mode from config
```

## Troubleshooting

### "Server failed to start"

**Check your config:**
```bash
# Show active configuration
cat .anyclauderc
```

**Verify model path exists:**
```bash
# If using local path
ls /Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit

# Should show model files exist
```

**Check logs:**
```bash
# MLX-LM logs
tail -f /tmp/anyclaude-mlx-lm-logs/mlx-lm-server.log

# MLX-Omni logs
tail -f /tmp/anyclaude-mlx-omni-logs/mlx-omni-server.log
```

### "Port already in use"

**Change port in config:**
```bash
# Edit .anyclauderc or ~/.anyclauderc
MLX_LM_PORT=8082  # Use different port
```

Or override at runtime:
```bash
export MLX_LM_PORT=8082
./anyclaude mlx-lm
```

### "Config not being read"

**Verify config file exists:**
```bash
# Project config
ls -la .anyclauderc

# Home config
ls -la ~/.anyclauderc
```

**Check environment override:**
```bash
# These have highest priority, check if set
echo $ANYCLAUDE_MODE
echo $MLX_MODEL
echo $ANYCLAUDE_DEBUG
```

**Unset if overriding:**
```bash
unset ANYCLAUDE_MODE
unset MLX_MODEL
./anyclaude
# Now uses config file
```

### "Wrong model loading"

**Debug configuration loading:**
```bash
# Enable debug and check what's loaded
ANYCLAUDE_DEBUG=1 ./anyclaude 2>&1 | grep -i config
```

**Check precedence:**
```bash
# What's in project config?
grep MLX_MODEL .anyclauderc

# What's in home config?
grep MLX_MODEL ~/.anyclauderc

# What's in environment?
echo $MLX_MODEL

# Environment wins if set, then home, then project
```

## Examples

### Example 1: Default Setup (What You Have Now)

**Your `.anyclauderc`:**
```bash
ANYCLAUDE_MODE=mlx-lm
MLX_MODEL=/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
ANYCLAUDE_DEBUG=0
```

**Usage:**
```bash
./anyclaude
# Starts MLX-LM with Qwen3-Coder-30B
```

### Example 2: Development Setup

**Your `~/.anyclauderc`:**
```bash
ANYCLAUDE_MODE=mlx-lm
MLX_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
ANYCLAUDE_DEBUG=1
```

**Usage (any project):**
```bash
./anyclaude
# Fast startup with smaller model + debug output
```

### Example 3: Multi-Model Setup

**Project has `.anyclauderc` for large model:**
```bash
ANYCLAUDE_MODE=mlx-lm
MLX_MODEL=/Users/akaszubski/ai-tools/.../Qwen3-Coder-30B...
```

**Home has `~/.anyclauderc` for small model:**
```bash
ANYCLAUDE_MODE=mlx-lm
MLX_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
```

**Usage:**
```bash
cd ~/Documents/GitHub/anyclaude
./anyclaude
# Uses project config with Qwen3-Coder-30B

cd ~/other-project
./anyclaude
# Uses home config with Qwen2.5-1.5B (if no .anyclauderc in ~/other-project)
```

## File Organization

```
~/.anyclauderc                    # Home config (global)
  ↑
  └─ Applied to all projects
     Unless overridden by:

~/project/.anyclauderc            # Project config (local)
  ↑
  └─ Applied only to this project
     Unless overridden by:

export ANYCLAUDE_MODE=...         # Environment (highest priority)
```

## Best Practices

1. **Version control project config**
   ```bash
   # Commit .anyclauderc to git
   git add .anyclauderc
   git commit -m "config: set default model"
   ```

2. **Keep home config outside version control**
   ```bash
   # ~/.anyclauderc should be personal preferences
   # Don't commit it to any repo
   ```

3. **Use comments for clarity**
   ```bash
   # .anyclauderc

   # Use large model for code generation
   ANYCLAUDE_MODE=mlx-lm
   MLX_MODEL=/path/to/Qwen3-Coder-30B

   # Enable debug for development
   ANYCLAUDE_DEBUG=1
   ```

4. **Document project-specific choices**
   ```bash
   # In .anyclauderc
   # NOTE: Uses Qwen3-Coder-30B for better code quality
   # Change MLX_MODEL if you need a faster, smaller model
   ```

5. **Keep sensitive paths in home config**
   ```bash
   # ~/.anyclauderc (personal machine)
   MLX_MODEL=/Users/akaszubski/ai-tools/lmstudio/...

   # Don't hardcode personal paths in .anyclauderc (version controlled)
   ```

## See Also

- [QUICK-START.md](QUICK-START.md) - Quick start guide
- [LOCAL-MODEL-GUIDE.md](LOCAL-MODEL-GUIDE.md) - Using local models
- [anyclaude-launcher-guide.md](anyclaude-launcher-guide.md) - Advanced launcher options
