# Claude Code Authentication Research

## Problem

Claude Code CLI (with Max plan) authenticates automatically without requiring `ANTHROPIC_API_KEY`. We need to understand and passthrough this authentication method.

## Authentication Methods

### Traditional API (What Most Users Have)
- Uses `x-api-key` header with API key from console.anthropic.com
- Format: `x-api-key: sk-ant-api03-...`
- This is what the trace logger expects

### Claude Code CLI (What You Have)
- **Session-based authentication** via OAuth/session tokens
- Stored in Claude Code's config directory
- Automatically included in requests
- No API key needed

## How Claude Code Authenticates

Claude Code likely uses one of these methods:

1. **Session Cookie**
   - `Cookie: session_token=...`
   - Set after `claude auth login`

2. **Bearer Token** (most likely)
   - `Authorization: Bearer <token>`
   - Refreshed automatically

3. **Custom Auth Header**
   - `X-Claude-Session: <token>`
   - Or similar proprietary header

## Solution: Passthrough All Auth Headers

Instead of requiring API key, we should **passthrough whatever auth headers Claude Code sends**:

```typescript
// In Claude mode: Passthrough ALL headers (including auth)
const proxy = https.request({
  host: "api.anthropic.com",
  path: req.url,
  method: req.method,
  headers: req.headers, // ← Includes whatever auth Claude Code sent
})
```

This already happens in our current implementation! ✅

## Testing Strategy

### Step 1: Run in Claude Mode (No API Key)

```bash
# Start anyclaude in Claude mode WITHOUT setting ANTHROPIC_API_KEY
ANYCLAUDE_MODE=claude anyclaude
```

**Expected**: Should work if Claude Code's auth headers are passed through

**If it fails**: We need to see what auth headers Claude Code is sending

### Step 2: Capture Auth Headers with Trace Logging

```bash
# Run with trace level 3
ANYCLAUDE_DEBUG=3 ANYCLAUDE_MODE=claude anyclaude 2> auth-trace.log

# In Claude Code, send a simple message
> Hello

# Check what auth headers were captured
grep -i "authorization\|cookie\|x-api-key\|x-claude" auth-trace.log
```

### Step 3: Check Trace Files

```bash
# View full request headers
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq '.request.headers'
```

**Look for**:
- `authorization: Bearer ...`
- `cookie: session=...`
- `x-api-key: ...` (if present)
- `x-claude-*: ...` (custom headers)

## Current Implementation Status

### ✅ What Already Works

Our current code in `anthropic-proxy.ts` line 68-145:

```typescript
const proxyToAnthropic = (body?: AnthropicMessagesRequest) => {
  delete req.headers["host"]; // Remove only host header

  // Create proxy request with ALL original headers (including auth!)
  const proxy = https.request({
    host: "api.anthropic.com",
    path: req.url,
    method: req.method,
    headers: req.headers, // ← Passthrough ALL headers
  }, (proxiedRes) => {
    // ... handle response
  });
}
```

**This should already work** because we're passing through all headers!

### Potential Issue: API Key Sanitization

In trace logger (`src/trace-logger.ts`), we redact API keys:

```typescript
function sanitizeApiKeys(obj: any): any {
  // Redacts: x-api-key, authorization, etc.
}
```

**This is fine** - it only affects trace files (for security), not the actual request to Anthropic.

## Testing Checklist

- [ ] Start anyclaude in Claude mode (no API key set)
- [ ] Send message in Claude Code
- [ ] Verify request reaches Anthropic successfully
- [ ] Check trace files show auth headers (redacted)
- [ ] Confirm responses come back correctly

## Expected Behavior

### If Using Session/Bearer Auth

**Request Headers** (as seen by Anthropic):
```json
{
  "authorization": "Bearer eyJhbGc...",
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
  "user-agent": "claude-cli/2.0.27"
}
```

**Trace File** (redacted for security):
```json
{
  "request": {
    "headers": {
      "authorization": "[REDACTED]",
      "anthropic-version": "2023-06-01"
    }
  }
}
```

### If Using API Key

**Request Headers**:
```json
{
  "x-api-key": "sk-ant-api03-...",
  "anthropic-version": "2023-06-01"
}
```

**Trace File** (redacted):
```json
{
  "request": {
    "headers": {
      "x-api-key": "[REDACTED]",
      "anthropic-version": "2023-06-01"
    }
  }
}
```

## Quick Test

```bash
# Terminal 1: Start proxy in Claude mode (no API key needed!)
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> auth-debug.log

# Terminal 2: In another terminal, check what's happening
tail -f auth-debug.log | grep -i "auth\|api-key\|bearer\|cookie"

# Terminal 3: Use Claude Code normally
# Just send a message and see what happens
```

## Troubleshooting

### Error: "Missing authentication"

**Cause**: Auth headers not being passed through

**Solution**: Check if we're accidentally filtering them

```typescript
// Make sure we're NOT doing this:
delete req.headers["authorization"]; // ❌ DON'T DELETE AUTH!
delete req.headers["x-api-key"];     // ❌ DON'T DELETE AUTH!

// Only delete:
delete req.headers["host"];          // ✅ OK to delete (proxy routing)
```

### Error: "Invalid API key"

**Cause**: Might be trying to use redacted value from trace

**Solution**: Verify we're using original headers, not sanitized ones

```typescript
// ✅ CORRECT: Use original headers for proxy
const proxy = https.request({
  headers: req.headers  // Original, unsanitized
});

// Then separately log sanitized version
logTrace(mode, {
  headers: sanitizeApiKeys(req.headers)  // Sanitized for logs only
});
```

## Summary

**Good News**: Our current implementation should already work! We passthrough all headers including auth.

**To Verify**:
1. Just run `ANYCLAUDE_MODE=claude anyclaude` (no API key needed)
2. Use Claude Code normally
3. Check if it works
4. If yes: Capture traces to see tool schemas
5. If no: Check debug logs to see what auth Claude Code is using

**The authentication is handled by Claude Code itself, we just need to not interfere with it!**

---

**Next Step**: Try it now and see what happens! 🚀
