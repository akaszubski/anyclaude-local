# Authentication Guide

## ✨ Multiple Authentication Methods

anyclaude supports **four backend modes** with different authentication methods:

1. **Claude API** - Traditional API key or Claude Max Plan (session-based)
2. **OpenRouter** - API key for 400+ models at lower cost
3. **vLLM-MLX** - No authentication (local server)
4. **LMStudio** - No authentication (local server)

This guide covers cloud modes (Claude API and OpenRouter). Local modes require no authentication.

---

## Claude API Authentication

anyclaude supports **both** Claude authentication methods automatically:

1. **Traditional API Key** - For users with Anthropic API accounts
2. **Claude Max Plan** - For users with claude.ai subscriptions (session-based)

**No configuration needed** - just works! 🎉

## Method 1: Traditional API Key

### Who Uses This

- Users with API access from console.anthropic.com
- Developers testing with API keys
- Users without Claude Max plan

### How to Use

```bash
# Set API key as environment variable
export ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Run in Claude mode
ANYCLAUDE_MODE=claude anyclaude
```

**Headers Sent to Anthropic**:

```http
x-api-key: sk-ant-api03-your-key-here
anthropic-version: 2023-06-01
```

### Where to Get API Key

1. Go to https://console.anthropic.com/
2. Navigate to "API Keys"
3. Create new key
4. Copy and save securely

## Method 2: Claude Max Plan (Session-Based)

### Who Uses This

- Users with Claude.ai Max subscription
- Users authenticated via `claude auth login`
- Users with active Claude Code CLI session

### How to Use

```bash
# No API key needed! Just run in Claude mode
ANYCLAUDE_MODE=claude anyclaude
```

**That's it!** Claude Code handles authentication automatically.

### How It Works

1. **You're already logged in** via Claude Code CLI
2. **Session token stored** in Claude Code's config (usually `~/.config/claude/`)
3. **Headers automatically added** by Claude Code when making requests
4. **anyclaude passes them through** to Anthropic without modification

**Headers Sent to Anthropic** (likely):

```http
Authorization: Bearer <session-token>
Cookie: session=<session-cookie>
anthropic-version: 2023-06-01
```

**Note**: You don't see these headers - Claude Code adds them automatically!

## How anyclaude Handles Both

### The Secret: Passthrough All Headers

```typescript
// In src/anthropic-proxy.ts (Claude mode)
const proxyToAnthropic = (body) => {
  delete req.headers["host"]; // Only remove host (for routing)

  const proxy = https.request({
    host: "api.anthropic.com",
    path: req.url,
    method: req.method,
    headers: req.headers, // ← ALL headers passed through!
  });
};
```

**This means**:

- ✅ If Claude Code sends `x-api-key` → We pass it through
- ✅ If Claude Code sends `Authorization: Bearer` → We pass it through
- ✅ If Claude Code sends session cookies → We pass it through
- ✅ If Claude Code sends custom headers → We pass it through

**We don't care which auth method - we just pass everything!**

---

## OpenRouter Authentication

### What is OpenRouter?

[OpenRouter](https://openrouter.ai) is a unified API providing access to 400+ AI models through one endpoint:

- **Cost savings**: GLM-4.6 at $0.60/$2 per 1M tokens (vs Claude $3/$15) - **84% cheaper**
- **Model choice**: Access Claude, GPT-4, Qwen, GLM, and 400+ other models
- **Same features**: Tool calling, streaming, large context windows
- **One API key**: Works with all models

### Who Uses This

- Users who want cheaper cloud models than Claude API
- Users who want to try different models (Qwen, GLM-4.6, etc.)
- Users who want flexibility to switch models without changing code
- Users who want access to Claude via API without Anthropic API key

### How to Set Up

**Step 1: Get OpenRouter API Key**

1. Visit [openrouter.ai](https://openrouter.ai)
2. Sign up for free account
3. Add credits ($5 minimum recommended)
4. Generate API key from dashboard

**Step 2: Configure anyclaude**

Add to `.anyclauderc.json`:

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

Or use environment variable:

```bash
export OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY_HERE"
anyclaude --mode=openrouter
```

**Step 3: Run**

```bash
# Using config file
anyclaude

# Or override with env var
OPENROUTER_API_KEY="sk-or-v1-..." anyclaude --mode=openrouter
```

### Security: API Keys Redacted

OpenRouter API keys are **automatically redacted** in trace files, just like Claude API keys:

```json
{
  "request": {
    "headers": {
      "authorization": "[REDACTED]",
      "http-referer": "https://github.com/...",
      "x-title": "anyclaude"
    }
  }
}
```

**Safe to share**: Trace files don't expose your OpenRouter credentials!

### Popular Models

**Recommended for Coding** (default):

```json
"model": "z-ai/glm-4.6"  // $0.60/$2 per 1M, 200K context
```

**Cheaper Alternative**:

```json
"model": "qwen/qwen-2.5-72b-instruct"  // $0.35/$0.70 per 1M
```

**Free Tier** (testing):

```json
"model": "google/gemini-2.0-flash-exp:free"  // FREE
```

**Premium Models**:

```json
"model": "anthropic/claude-3.5-sonnet"  // $3/$15 per 1M (same as direct API)
"model": "openai/gpt-4"  // $10/$30 per 1M
```

See [OpenRouter Setup Guide](openrouter-setup.md) for complete model list and cost comparison.

### Troubleshooting OpenRouter

**"Invalid API key"**:

1. Check API key starts with `sk-or-v1-`
2. Verify key is correct in `.anyclauderc.json` or environment
3. Check OpenRouter dashboard for key status

**"Insufficient credits"**:

1. Visit [openrouter.ai/credits](https://openrouter.ai/credits)
2. Add more credits ($5 minimum)
3. Wait 1-2 minutes for credits to be available

**"Model not found"**:

1. Check exact model ID at [openrouter.ai/models](https://openrouter.ai/models)
2. Model IDs are case-sensitive (e.g., `z-ai/glm-4.6` not `glm-4.6`)

---

## Comparison: All Authentication Methods

| Feature               | Claude API Key               | Claude Max Plan             | OpenRouter                 | Local Models (vLLM/LM)    |
| --------------------- | ---------------------------- | --------------------------- | -------------------------- | ------------------------- |
| **Cost**              | $3/$15 per 1M tokens         | $20/month unlimited         | $0.60/$2 per 1M (GLM-4.6)  | Free (hardware only)      |
| **Setup**             | Export ANTHROPIC_API_KEY     | Already logged in           | OPENROUTER_API_KEY         | No auth needed            |
| **Best For**          | API development              | Interactive Claude Code use | Cost savings, model choice | Privacy, offline use      |
| **Authentication**    | x-api-key header             | Bearer token / session      | Authorization header       | None (local)              |
| **anyclaude Support** | ✅ Yes                       | ✅ Yes                      | ✅ Yes                     | ✅ Yes                    |
| **Trace Logging**     | ✅ Yes (auto, redacted)      | ✅ Yes (auto, redacted)     | ✅ Yes (auto, redacted)    | ⚠️ Manual (DEBUG=3)       |
| **Privacy**           | Cloud (Anthropic)            | Cloud (Anthropic)           | Cloud (OpenRouter)         | 100% local                |

## Testing Both Methods

### Test API Key Auth

```bash
# Terminal 1: Set API key and run
export ANTHROPIC_API_KEY=sk-ant-your-key
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> api-key-test.log

# Terminal 2: Check it's using API key
grep "x-api-key" api-key-test.log
# Should see: x-api-key: [REDACTED]
```

### Test Session Auth (Max Plan)

```bash
# Terminal 1: No API key, just run (you're already logged in!)
unset ANTHROPIC_API_KEY  # Make sure no API key is set
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> session-test.log

# Terminal 2: Check it's using session
grep -i "authorization\|bearer\|cookie" session-test.log
# Should see: Authorization: [REDACTED] or similar
```

## Security: API Keys Redacted in Traces

**Important**: Both auth methods are **automatically redacted** in trace files for security!

### What Gets Redacted

```typescript
// In src/trace-logger.ts
const AUTH_HEADER_PATTERNS = [
  "x-api-key",
  "api-key",
  "authorization",
  "auth-token",
  "bearer",
  "cookie",
];

// All these headers → "[REDACTED]" in trace files
```

### Trace File Example

**Request with API Key**:

```json
{
  "request": {
    "headers": {
      "x-api-key": "[REDACTED]",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    }
  }
}
```

**Request with Session Token**:

```json
{
  "request": {
    "headers": {
      "authorization": "[REDACTED]",
      "cookie": "[REDACTED]",
      "anthropic-version": "2023-06-01"
    }
  }
}
```

**Safe to share**: You can upload trace files to GitHub without exposing credentials!

## Recommended Usage

### For Reverse Engineering (Your Use Case)

**Use Claude Max Plan** (session-based):

```bash
# You're already logged in, just run:
ANYCLAUDE_MODE=claude anyclaude

# Or with trace logging:
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> traces.log

# Test tool calling in Claude Code
> What files have changed?
> Read the README.md file

# Check traces
cat ~/.anyclaude/traces/claude/*.json | jq .
```

**Benefits**:

- ✅ No API key setup needed
- ✅ Unlimited usage (Max plan)
- ✅ Same auth Claude Code uses normally
- ✅ Real production behavior

### For API Development

**Use API Key**:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
ANYCLAUDE_MODE=claude anyclaude
```

**Benefits**:

- ✅ Easier to automate
- ✅ Works in CI/CD
- ✅ Separate from personal account

## Troubleshooting

### "Authentication failed" with Max Plan

**Check**:

1. Are you logged into Claude Code CLI?

   ```bash
   claude auth status
   ```

2. Try logging in again:

   ```bash
   claude auth login
   ```

3. Verify Claude Code works normally:
   ```bash
   claude -p "Hello"
   ```

### "Invalid API key" with API Key Method

**Check**:

1. Is ANTHROPIC_API_KEY set?

   ```bash
   echo $ANTHROPIC_API_KEY
   ```

2. Is key valid? (starts with `sk-ant-api03-`)

3. Try the key directly:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
   ```

### "No authentication provided"

**Cause**: Neither API key nor session auth available

**Solution**:

- **Option A**: Set API key (`export ANTHROPIC_API_KEY=...`)
- **Option B**: Login to Claude Code (`claude auth login`)

## Quick Start Guide

### I Have Claude Max Plan

```bash
# Just run - authentication handled automatically!
ANYCLAUDE_MODE=claude anyclaude
```

### I Have API Key

```bash
# Set key once
export ANTHROPIC_API_KEY=sk-ant-your-key

# Then run
ANYCLAUDE_MODE=claude anyclaude
```

### I Want to Switch Between Them

```bash
# Use Max plan (unset API key)
unset ANTHROPIC_API_KEY
ANYCLAUDE_MODE=claude anyclaude

# Use API key
export ANTHROPIC_API_KEY=sk-ant-your-key
ANYCLAUDE_MODE=claude anyclaude
```

## Summary

✅ **Claude API Key**: Supported - set `ANTHROPIC_API_KEY`
✅ **Claude Max Plan**: Supported - login via `claude auth login`
✅ **OpenRouter API**: Supported - set `OPENROUTER_API_KEY` or use `.anyclauderc.json`
✅ **Local Models**: No authentication needed
✅ **Secure**: All credentials automatically redacted in trace files
✅ **Simple**: Multiple auth methods, choose what works for you!

### Quick Start by Use Case

**I want the cheapest cloud option**:

```bash
# OpenRouter with GLM-4.6 (84% cheaper than Claude)
export OPENROUTER_API_KEY="sk-or-v1-..."
anyclaude --mode=openrouter
```

**I have Claude Max subscription**:

```bash
# Use your existing Claude Max plan
anyclaude --mode=claude
```

**I have Claude API key**:

```bash
# Use traditional API key
export ANTHROPIC_API_KEY="sk-ant-..."
anyclaude --mode=claude
```

**I want 100% privacy**:

```bash
# Use local models (no cloud, no auth)
anyclaude  # defaults to vllm-mlx if configured
```

---

**Related Guides**:

- **[OpenRouter Setup](openrouter-setup.md)** - Complete OpenRouter configuration
- **[Mode Switching](mode-switching.md)** - Switch between backends
- **[Trace Analysis](trace-analysis.md)** - Analyze prompts and tool usage

**Status**: ✅ All authentication methods fully supported and tested
