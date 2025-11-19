# Mode Switching Guide

## ✨ Four Backend Modes

anyclaude supports **four backend modes** to fit your needs:

1. **MLX** (default) - Local models on Apple Silicon with auto-launch
2. **LMStudio** - Local models cross-platform, manual server management
3. **OpenRouter** - 400+ cloud models at fraction of Claude API cost
4. **Claude** - Real Anthropic API for full features and reverse engineering

## Why Switch Modes?

**Use MLX when**:

- You have Apple Silicon (M1/M2/M3)
- You want the fastest local experience
- You want auto-launch and prompt caching
- Privacy is critical (100% local)

**Use LMStudio when**:

- You're on Windows/Linux (or macOS without MLX support)
- You want GUI model management
- You prefer manual server control

**Use OpenRouter when**:

- You want cloud convenience at low cost (84% cheaper than Claude)
- You want to try different models (GLM-4.6, Qwen, etc.)
- You want Claude-like quality without Anthropic API key
- You need cost savings for frequent use

**Use Claude when**:

- You need official Claude API features
- You want to reverse-engineer Claude Code's prompts
- You have Claude Max subscription or API key
- You're comparing local model behavior to Claude

---

## Quick Mode Switching

### Method 1: CLI Flag (Temporary Override)

```bash
# Override mode for this session only
anyclaude --mode=mlx
anyclaude --mode=lmstudio
anyclaude --mode=openrouter
anyclaude --mode=claude
```

### Method 2: Environment Variable

```bash
# Set for current terminal session
export ANYCLAUDE_MODE=openrouter
anyclaude

# Or inline (one-time)
ANYCLAUDE_MODE=claude anyclaude
```

### Method 3: Configuration File (Persistent)

Edit `.anyclauderc.json`:

```json
{
  "backend": "openrouter", // ← Change this to switch default mode
  "backends": {
    "mlx": {
      "enabled": true,
      "model": "/path/to/your/model"
    },
    "lmstudio": {
      "enabled": true
    },
    "openrouter": {
      "enabled": true,
      "apiKey": "sk-or-v1-...",
      "model": "z-ai/glm-4.6"
    },
    "claude": {
      "enabled": true
    }
  }
}
```

**Priority**: CLI flag > Environment variable > Config file > Default (mlx)

---

## Mode Details

### MLX Mode (Default)

**Setup**:

```json
{
  "backend": "mlx",
  "backends": {
    "mlx": {
      "enabled": true,
      "port": 8081,
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/mlx-server.py"
    }
  }
}
```

**Run**:

```bash
# Auto-launches server if model is configured
anyclaude

# Or explicit mode
anyclaude --mode=mlx
```

**Output**:

```
[anyclaude] Backend: VLLM-MLX
[anyclaude] Port: 8081
[anyclaude] Model: /path/to/model
[anyclaude] Server: auto-launch enabled
[anyclaude] Starting MLX server...
[anyclaude] Waiting for server to load model (30-50 seconds)...
[anyclaude] Server ready! 🚀
```

**Features**:

- ✅ Auto-launch and auto-cleanup
- ✅ Prompt caching (KV cache)
- ✅ 200K context window
- ✅ Tool calling support
- ✅ Streaming responses
- ✅ 100% local (no cloud)

---

### LMStudio Mode

**Setup**: Start LMStudio manually and load a model

**Run**:

```bash
anyclaude --mode=lmstudio
```

**Output**:

```
[anyclaude] Backend: LMSTUDIO
[anyclaude] Base URL: http://localhost:1234/v1
[anyclaude] Model: current-model (uses whatever is loaded)
```

**Features**:

- ✅ Cross-platform (Windows/Linux/macOS)
- ✅ GUI model management
- ✅ Manual server control
- ✅ Tool calling support
- ✅ 100% local (no cloud)

**Note**: You must start LMStudio server manually before running anyclaude.

---

### OpenRouter Mode

**Setup**:

1. Get API key from [openrouter.ai](https://openrouter.ai)
2. Add to `.anyclauderc.json`:

```json
{
  "backend": "openrouter",
  "backends": {
    "openrouter": {
      "enabled": true,
      "apiKey": "sk-or-v1-YOUR_API_KEY_HERE",
      "model": "z-ai/glm-4.6"
    }
  }
}
```

Or use environment variable:

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

**Run**:

```bash
anyclaude --mode=openrouter
```

**Output**:

```
[anyclaude] Backend: OPENROUTER
[anyclaude] Using OpenRouter API
[anyclaude] Model: z-ai/glm-4.6
[anyclaude] Base URL: https://openrouter.ai/api/v1
[anyclaude] Features: tool calling + streaming
[anyclaude] Trace logging enabled for openrouter mode (prompts will be saved to ~/.anyclaude/traces/openrouter/)
```

**Features**:

- ✅ 400+ models available
- ✅ 84% cheaper than Claude API (GLM-4.6: $0.60/$2 per 1M tokens)
- ✅ Tool calling support
- ✅ Streaming responses
- ✅ Large context windows (up to 200K)
- ✅ Automatic trace logging
- ⚠️ Cloud-based (data sent to OpenRouter)

**Popular Models**:

- `z-ai/glm-4.6` - $0.60/$2 per 1M, 200K context (recommended)
- `qwen/qwen-2.5-72b-instruct` - $0.35/$0.70 per 1M (cheaper)
- `google/gemini-2.0-flash-exp:free` - FREE (limited)
- `anthropic/claude-3.5-sonnet` - $3/$15 per 1M (same as direct API)

See [OpenRouter Setup Guide](openrouter-setup.md) for complete list.

---

### Claude Mode

**Setup**:

Option A: Claude Max Plan (session-based)

```bash
# Already logged in via Claude CLI? Just run:
anyclaude --mode=claude
```

Option B: API Key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
anyclaude --mode=claude
```

**Run**:

```bash
anyclaude --mode=claude
```

**Output**:

```
[anyclaude] Backend: CLAUDE
[anyclaude] Using Anthropic API (real Claude)
[anyclaude] Authentication: detected
[anyclaude] Trace logging enabled for claude mode (prompts will be saved to ~/.anyclaude/traces/claude/)
```

**Features**:

- ✅ Official Claude API
- ✅ Highest quality responses
- ✅ Full Claude Code feature support
- ✅ Automatic trace logging for reverse engineering
- ✅ Support for both API key and Max Plan auth
- ⚠️ Most expensive ($3/$15 per 1M tokens)
- ⚠️ Cloud-based (data sent to Anthropic)

**Use Cases**:

- Reverse-engineering Claude Code's prompts and tool usage
- Comparing local model behavior to Claude
- When you need the best quality responses
- When you have Claude Max subscription

---

## Mode Comparison

| Feature            | MLX              | LMStudio         | OpenRouter           | Claude             |
| ------------------ | ---------------- | ---------------- | -------------------- | ------------------ |
| **Cost**           | Free             | Free             | $0.60-$2/1M tokens   | $3-$15/1M tokens   |
| **Privacy**        | 100% local       | 100% local       | Cloud                | Cloud              |
| **Platform**       | macOS (M1/M2/M3) | All platforms    | All platforms        | All platforms      |
| **Auto-launch**    | ✅ Yes           | ❌ Manual        | ✅ Cloud             | ✅ Cloud           |
| **Prompt Caching** | ✅ Yes           | ⚠️ Limited       | ✅ Yes               | ✅ Yes             |
| **Tool Calling**   | ✅ Yes           | ✅ Yes           | ✅ Yes               | ✅ Yes             |
| **Context Window** | Up to 200K       | Varies by model  | Up to 200K           | 200K               |
| **Speed**          | Very fast        | Fast             | Fast                 | Fast               |
| **Model Choice**   | Your MLX models  | Any LMStudio     | 400+ models          | Claude only        |
| **Trace Logging**  | Manual (DEBUG=3) | Manual (DEBUG=3) | ✅ Auto (redacted)   | ✅ Auto (redacted) |
| **Best For**       | Privacy, speed   | Cross-platform   | Cost savings, choice | Quality, analysis  |

---

## Common Workflows

### Workflow 1: Daily Development (Cost-Conscious)

```bash
# Use cheap cloud model for most work
export OPENROUTER_API_KEY="sk-or-v1-..."
anyclaude --mode=openrouter  # GLM-4.6 at $0.60/$2 per 1M

# Switch to Claude for critical tasks
anyclaude --mode=claude  # Uses Max Plan subscription
```

**Cost**: ~$0.05 per session (OpenRouter) vs $0.30 (Claude direct)

### Workflow 2: Privacy-First Development

```bash
# Use local model for all work
anyclaude  # defaults to mlx

# Only use cloud when absolutely needed
anyclaude --mode=claude  # for trace analysis
```

**Privacy**: 95% of work stays local

### Workflow 3: Reverse Engineering

```bash
# Step 1: Capture Claude's behavior
anyclaude --mode=claude
# Test: "What files changed?" → Check traces

# Step 2: Test local model
anyclaude --mode=mlx
# Test same: "What files changed?"

# Step 3: Compare
cat ~/.anyclaude/traces/claude/*.json | jq .
# Fix conversion based on differences
```

### Workflow 4: Model Comparison

```bash
# Test same prompt across all modes
PROMPT="Refactor this function to use async/await"

# Test each mode
anyclaude --mode=openrouter  # GLM-4.6
anyclaude --mode=openrouter  # Switch model to Qwen
anyclaude --mode=mlx    # Local model
anyclaude --mode=claude      # Official Claude

# Compare results and costs
```

---

## Quick Switch Aliases

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Quick mode switching
alias ac-local='anyclaude --mode=mlx'
alias ac-lm='anyclaude --mode=lmstudio'
alias ac-or='anyclaude --mode=openrouter'
alias ac-claude='anyclaude --mode=claude'

# With specific models
alias ac-cheap='OPENROUTER_MODEL="qwen/qwen-2.5-72b-instruct" anyclaude --mode=openrouter'
alias ac-free='OPENROUTER_MODEL="google/gemini-2.0-flash-exp:free" anyclaude --mode=openrouter'
```

Then use:

```bash
ac-local   # MLX
ac-or      # OpenRouter with GLM-4.6
ac-cheap   # OpenRouter with Qwen (cheaper)
ac-claude  # Real Claude API
```

---

## Troubleshooting

### Mode Not Switching

**Issue**: anyclaude still uses old mode

**Fix**:

1. Check CLI flag: `anyclaude --mode=openrouter` overrides everything
2. Check env var: `echo $ANYCLAUDE_MODE`
3. Check config: `cat .anyclauderc.json | jq .backend`
4. Priority: CLI > env > config

### "Backend not enabled"

**Issue**: Mode is set but backend is disabled

**Fix**: Enable in `.anyclauderc.json`:

```json
{
  "backends": {
    "openrouter": {
      "enabled": true // ← Set to true
    }
  }
}
```

### "Missing API key"

**Issue**: OpenRouter or Claude mode needs API key

**Fix**:

```bash
# For OpenRouter
export OPENROUTER_API_KEY="sk-or-v1-..."

# For Claude
export ANTHROPIC_API_KEY="sk-ant-..."

# Or add to .anyclauderc.json
```

### MLX Server Won't Start

**Issue**: Auto-launch fails

**Fix**:

1. Check model path: `ls /path/to/model`
2. Check port: `lsof -i :8081` (should be free)
3. Check logs: `~/.anyclaude/logs/mlx-server.log`
4. Manual start: `python3 scripts/mlx-server.py --model /path/to/model`

---

## Related Guides

- **[Authentication Guide](authentication.md)** - Setup API keys for cloud modes
- **[OpenRouter Setup](openrouter-setup.md)** - Complete OpenRouter configuration
- **[Trace Analysis](trace-analysis.md)** - Analyze Claude Code's prompts
- **[MLX Setup](mlx-setup.md)** - Configure local MLX models

---

**Status**: ✅ All modes fully supported and tested
**Last Updated**: 2025-11-01
