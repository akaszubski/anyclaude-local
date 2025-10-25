# LMStudio Failover Fix - Complete Summary

## Problem Identified

The LMStudio failover was failing because the Vercel AI SDK v5.0+ uses OpenAI's **new Responses API format** by default, but LMStudio only supports the standard **Chat Completions API format**.

### The Smoking Gun

From your debug logs, the request was using:
```json
{
  "model": "gpt-oss-20b-mlx",
  "input": [                    // ❌ Should be "messages"
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",  // ❌ Should be "text"
          "text": "quota"
        }
      ]
    }
  ]
}
```

And the provider was:
```json
"provider": "openai.responses"   // ❌ Should be "openai"
```

## The Solution

**Single line fix** in `src/failover-manager.ts:85`:

```typescript
this.lmstudioProvider = createOpenAI({
  baseURL: this.config.lmstudioUrl,
  apiKey: this.config.lmstudioApiKey,
  compatibility: 'legacy',  // ✅ This forces standard Chat Completions format
  fetch: ...
});
```

## What Changed

### Files Modified

1. **`src/failover-manager.ts`** - Added `compatibility: 'legacy'` to LMStudio provider
2. **`DEBUG-LMSTUDIO.md`** - Updated with root cause and solution
3. **`CLAUDE.md`** - Added note about the compatibility mode

### Why It Works

The `compatibility: 'legacy'` option tells the AI SDK to:
- Use `messages` instead of `input`
- Use `{"type": "text"}` instead of `{"type": "input_text"}`
- Use the standard Chat Completions endpoint
- Send requests in the format LMStudio expects

## Testing the Fix

### 1. Rebuild the Project

```bash
bun run build
```

### 2. Test with LMStudio

```bash
# Make sure LMStudio is running with a model loaded
FORCE_LMSTUDIO=true ./dist/main.js
```

### 3. Verify the Request Format

Enable debug mode to see the request:

```bash
ANYCLAUDE_DEBUG=2 FORCE_LMSTUDIO=true ./dist/main.js
```

You should now see:
```
[LMStudio Fetch] Full body: {
  "model": "gpt-oss-20b-mlx",
  "messages": [              // ✅ Correct!
    {
      "role": "user",
      "content": "hello"
    }
  ],
  "stream": true
}
```

## Expected Behavior After Fix

1. **Requests will use Chat Completions format** - Standard OpenAI API format
2. **LMStudio will understand the requests** - No more format errors
3. **Streams will complete successfully** - No more premature termination
4. **Claude Code will work with local models** - Full failover functionality

## Debugging Resources

If you encounter issues after the fix:

1. **Enhanced Debug Script**: `./debug-local.sh`
   - Captures full verbose output
   - Saves logs to `debug-logs/`
   - Shows all stream chunks

2. **Debug Guide**: `DEBUG-LMSTUDIO.md`
   - Comprehensive troubleshooting steps
   - Common issues and solutions
   - Model recommendations

3. **Verbose Logging**: `ANYCLAUDE_DEBUG=2`
   - Shows every chunk received
   - Displays full request/response bodies
   - Tracks stream conversion in detail

## Technical Details

### API Format Comparison

**Responses API (doesn't work with LMStudio):**
```json
{
  "input": [...],
  "content": [{"type": "input_text", ...}]
}
```

**Chat Completions API (works with LMStudio):**
```json
{
  "messages": [...],
  "content": [{"type": "text", ...}]
}
```

### Provider Comparison

**Before Fix:**
- Provider: `openai.responses`
- Specification: v2 (Responses API)
- Compatible: Only with OpenAI's new API

**After Fix:**
- Provider: `openai` (with legacy mode)
- Specification: v1 (Chat Completions)
- Compatible: LMStudio, OpenRouter, and all OpenAI-compatible servers

## Next Steps

1. **Rebuild**: `bun run build`
2. **Test**: `FORCE_LMSTUDIO=true ./dist/main.js`
3. **Verify**: Ask Claude Code a question and ensure it responds
4. **Report**: Share results - did it work?

## Related Files

- `src/failover-manager.ts` - LMStudio provider configuration
- `src/anthropic-proxy.ts` - Request routing logic
- `src/convert-to-anthropic-stream.ts` - Stream conversion
- `DEBUG-LMSTUDIO.md` - Debugging guide
- `debug-local.sh` - Enhanced debug script

---

**Status**: ✅ Fix implemented and documented
**Testing Required**: Yes - rebuild and test with your LMStudio setup
**Breaking Changes**: None - only affects LMStudio failover functionality
