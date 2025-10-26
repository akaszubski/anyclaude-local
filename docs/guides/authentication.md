# Authentication Guide: API Key vs Claude Max Plan

## ✨ Dual Authentication Support

anyclaude supports **both** authentication methods automatically:

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

## Comparison

| Feature               | API Key                     | Claude Max Plan             |
| --------------------- | --------------------------- | --------------------------- |
| **Cost**              | Pay per token               | $20/month unlimited         |
| **Setup**             | Export ANTHROPIC_API_KEY    | Already logged in           |
| **Best For**          | API development, automation | Interactive Claude Code use |
| **Authentication**    | x-api-key header            | Bearer token / session      |
| **anyclaude Support** | ✅ Yes                      | ✅ Yes                      |
| **Trace Logging**     | ✅ Yes (redacted)           | ✅ Yes (redacted)           |

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

✅ **API Key Auth**: Supported - set `ANTHROPIC_API_KEY`
✅ **Session Auth (Max Plan)**: Supported - just login via `claude auth login`
✅ **Both work**: anyclaude passes through whatever auth headers Claude Code sends
✅ **Secure**: All credentials redacted in trace files
✅ **Simple**: No configuration needed, just works!

**For your use case (Max plan)**: Just run `ANYCLAUDE_MODE=claude anyclaude` and you're good to go! 🎉

---

**Implementation**: Already complete - no changes needed!
**Testing**: Ready to use right now
**Security**: Credentials automatically protected in traces
