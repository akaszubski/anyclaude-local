# OpenRouter Setup Guide

Access 400+ AI models through OpenRouter at a fraction of Claude API costs.

## Why OpenRouter?

**Cost Savings:**

- GLM-4.6: $0.60/$2 per 1M tokens (vs Claude $3/$15) - **84% cheaper**
- Qwen 2.5 72B: $0.35/$0.70 per 1M tokens - **Even cheaper!**
- Many models with **FREE tiers**

**Features:**

- ✅ 200K context window (GLM-4.6)
- ✅ Tool calling support (Read, Write, Edit, Bash, etc.)
- ✅ Streaming responses
- ✅ Trace logging enabled by default
- ✅ Access Claude, GPT-4, and 400+ other models through one API

## Quick Start

### 1. Get OpenRouter API Key

1. Visit [openrouter.ai](https://openrouter.ai)
2. Sign up for free account
3. Add credits ($5 minimum recommended)
4. Generate API key from dashboard

### 2. Configure anyclaude

**Option A: Copy example config (recommended)**

```bash
cd /path/to/your/project
cp .anyclauderc.example-openrouter.json .anyclauderc.json
```

Edit `.anyclauderc.json` and add your API key:

```json
{
  "backend": "openrouter",
  "backends": {
    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-YOUR_API_KEY_HERE",
      "model": "z-ai/glm-4.6"
    }
  }
}
```

**Option B: Use environment variable**

```bash
export OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY_HERE"
anyclaude --mode=openrouter
```

### 3. Run anyclaude

```bash
anyclaude
```

You should see:

```
[anyclaude] Backend: OPENROUTER
[anyclaude] Using OpenRouter API
[anyclaude] Model: z-ai/glm-4.6
[anyclaude] Base URL: https://openrouter.ai/api/v1
[anyclaude] Features: tool calling + streaming
[anyclaude] Trace logging enabled for openrouter mode (prompts will be saved to ~/.anyclaude/traces/openrouter/)
```

## Popular Models

### Recommended for Coding

**GLM-4.6** (Default)

```json
"model": "z-ai/glm-4.6"
```

- **Cost**: $0.60/$2 per 1M tokens
- **Context**: 200K tokens
- **Best for**: Coding, long context
- **Strengths**: Excellent code generation, huge context window

**Qwen 2.5 72B Instruct**

```json
"model": "qwen/qwen-2.5-72b-instruct"
```

- **Cost**: $0.35/$0.70 per 1M tokens
- **Context**: 128K tokens
- **Best for**: Budget-conscious coding
- **Strengths**: Great quality for price

### Free Models

**Gemini 2.0 Flash Experimental**

```json
"model": "google/gemini-2.0-flash-exp:free"
```

- **Cost**: FREE
- **Context**: 32K tokens
- **Best for**: Testing, simple tasks
- **Limitations**: Limited context, rate limits

### Premium Models (via OpenRouter)

**Claude 3.5 Sonnet**

```json
"model": "anthropic/claude-3.5-sonnet"
```

- **Cost**: $3/$15 per 1M tokens (same as direct API)
- **Context**: 200K tokens
- **Note**: Use direct Claude API instead (anyclaude --mode=claude)

**GPT-4**

```json
"model": "openai/gpt-4"
```

- **Cost**: $10/$30 per 1M tokens
- **Context**: 128K tokens

See full list: [openrouter.ai/models](https://openrouter.ai/models)

## Configuration Reference

### Full .anyclauderc.json Example

```json
{
  "backend": "openrouter",
  "debug": {
    "level": 3,
    "enableTraces": true
  },
  "backends": {
    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-YOUR_KEY_HERE",
      "model": "z-ai/glm-4.6",
      "description": "OpenRouter with GLM-4.6"
    }
  }
}
```

### Environment Variables

Override config file settings:

```bash
# API Key
export OPENROUTER_API_KEY="sk-or-v1-..."

# Model selection
export OPENROUTER_MODEL="qwen/qwen-2.5-72b-instruct"

# Base URL (advanced)
export OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"

# Debug level
export ANYCLAUDE_DEBUG=3  # Trace logging
```

## Cost Tracking

OpenRouter provides usage tracking in their dashboard:

1. Visit [openrouter.ai/activity](https://openrouter.ai/activity)
2. View requests, tokens used, and costs
3. Set spending limits

**Typical coding session cost (50K input + 10K output):**

- GLM-4.6: $0.05
- Qwen 2.5 72B: $0.03
- Claude (direct): $0.30

## Trace Logging

Trace logging is **enabled by default** for OpenRouter mode. All prompts and responses are saved to:

```
~/.anyclaude/traces/openrouter/
```

### View Traces

```bash
# List all traces
ls -lht ~/.anyclaude/traces/openrouter/

# View latest trace
cat ~/.anyclaude/traces/openrouter/trace-*.json | tail -1 | jq .

# Extract system prompt
jq -r '.request.body.system' ~/.anyclaude/traces/openrouter/trace-*.json | tail -1
```

See [Trace Analysis Guide](trace-analysis.md) for detailed analysis.

### Disable Trace Logging

```bash
ANYCLAUDE_DEBUG=0 anyclaude --mode=openrouter
```

## Switching Models

### During Session

You can't switch models mid-session. Exit Claude Code and edit `.anyclauderc.json`:

```json
{
  "backends": {
    "openrouter": {
      "model": "qwen/qwen-2.5-72b-instruct" // Changed from glm-4.6
    }
  }
}
```

### Quick Test Different Models

```bash
# Test with Qwen
OPENROUTER_MODEL="qwen/qwen-2.5-72b-instruct" anyclaude

# Test with Gemini (free)
OPENROUTER_MODEL="google/gemini-2.0-flash-exp:free" anyclaude
```

## Troubleshooting

### "Invalid API key" Error

1. Check API key is correct in `.anyclauderc.json`
2. Verify key starts with `sk-or-v1-`
3. Check OpenRouter dashboard for key status

### "Insufficient credits" Error

1. Visit [openrouter.ai/credits](https://openrouter.ai/credits)
2. Add more credits ($5 minimum)
3. Wait 1-2 minutes for credits to be available

### Model Not Found

1. Check model ID at [openrouter.ai/models](https://openrouter.ai/models)
2. Verify exact spelling (case-sensitive)
3. Example: `z-ai/glm-4.6` not `glm-4.6`

### Slow Responses

Some free/cheap models may have:

- Rate limiting during high usage
- Slower inference times
- Try premium models or local models instead

## Comparison: OpenRouter vs Local vs Claude

| Feature      | OpenRouter                 | Local (MLX)        | Claude API                |
| ------------ | -------------------------- | ----------------------- | ------------------------- |
| Cost         | $0.05/session              | Free                    | $0.30/session             |
| Privacy      | Cloud (sent to OpenRouter) | 100% local              | Cloud (sent to Anthropic) |
| Setup        | Easy (API key only)        | Medium (model download) | Easy (API key only)       |
| Speed        | Fast                       | Very fast               | Fast                      |
| Model choice | 400+ models                | Your models only        | Claude only               |
| Context      | Up to 200K                 | Depends on hardware     | 200K                      |
| Tool calling | ✅ Yes                     | ✅ Yes                  | ✅ Yes                    |

## Next Steps

- **[Mode Switching](mode-switching.md)** - Switch between OpenRouter, local, and Claude
- **[Trace Analysis](trace-analysis.md)** - Analyze Claude Code's prompting patterns
- **[Authentication](authentication.md)** - Manage API keys for different modes

---

**Need help?** See [Troubleshooting Guide](../debugging/) or open an issue on GitHub.
