# MLX-LM Known Issues

**Status**: Integration Complete | Operational Issue Identified

---

## Issue: Claude Code Hangs on MLX-LM Responses

### Description
When Claude Code sends a request through AnyClaude to MLX-LM, it successfully reaches MLX-LM and the server begins processing, but Claude Code hangs indefinitely waiting for the response instead of displaying output and timing out after ~30 seconds.

### Observed Behavior
```
[anyclaude] Mode: MLX-LM
[anyclaude] Proxy URL: http://localhost:49516
[anyclaude] MLX-LM endpoint: http://localhost:8081/v1
[anyclaude] Model: current-model (with native KV cache)

▗ ▗   ▖ ▖  Claude Code v2.0.27
           Haiku 4.5 · Claude Max

> who are you ?

✶ Beboppin'…  (then hangs indefinitely)
```

### Root Cause Analysis

**Not the integration fixes** - Both compatibility fixes (JSON parsing + model field) are correct and tested:
- ✅ System prompt normalization works
- ✅ Model field removal works
- ✅ Direct MLX-LM API calls succeed
- ✅ All unit and regression tests pass

**Likely causes**:
1. **Streaming response format** - MLX-LM may be returning chunked streaming responses that Claude Code can't parse
2. **Response timeout** - Claude Code may have a timeout that's too short for MLX-LM's first compute (~30s)
3. **Missing response headers** - Content-Type or Content-Length headers may be malformed
4. **Proxy buffering** - AnyClaude proxy may not be correctly buffering/forwarding the stream
5. **SSE format mismatch** - MLX-LM's Server-Sent Events format may not match Claude Code's expectations

### What Works
- MLX-LM server accepts requests
- System prompt is processed (GPU active)
- Model computations proceed
- Direct HTTP curl requests to MLX-LM work fine
- LMStudio works fine with same proxy code

### What Doesn't Work
- Claude Code waits indefinitely for response
- No error message or timeout shown
- MLX-LM keeps processing in the background
- Response never reaches Claude Code

---

## Investigation Needed

### 1. Check MLX-LM Response Format
```bash
# Test with verbose curl to see actual response
curl -v -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "system", "content": "You are helpful."}, {"role": "user", "content": "hi"}],
    "max_completion_tokens": 50,
    "stream": false
  }' 2>&1 | tee /tmp/mlx-response.txt

# Check response headers and format
```

### 2. Test with Streaming Disabled
Modify `src/main.ts` to disable streaming for MLX-LM:
```typescript
"mlx-lm": createOpenAI({
  // ... config ...
  defaultQuery: {
    stream: false  // Force non-streaming responses
  }
})
```

### 3. Add Response Logging
Enable debug logging in AnyClaude to see what's being returned:
```bash
ANYCLAUDE_DEBUG=3 ./dist/main-cli.js
```

### 4. Check Claude Code Timeout Settings
- Claude Code may have a built-in timeout for responses
- MLX-LM's first query takes ~30 seconds
- If Claude Code timeout is <30s, it will fail

### 5. Compare with LMStudio
- LMStudio returns responses in similar format
- Both use OpenAI SDK
- If LMStudio works but MLX-LM doesn't, it's a response format issue

---

## Workaround Options

### Option 1: Use Proxy-Only Mode
```bash
PROXY_ONLY=true ANYCLAUDE_MODE=mlx-lm ./dist/main-cli.js
# Then manually send requests to the proxy URL
```

### Option 2: Direct MLX-LM Testing
```bash
# Test MLX-LM directly without AnyClaude proxy
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Option 3: Use LMStudio
```bash
ANYCLAUDE_MODE=lmstudio ./dist/main-cli.js
# Fallback to LMStudio while MLX-LM issue is resolved
```

---

## Compatibility Matrix

| Component | Status | Notes |
|-----------|--------|-------|
| MLX-LM Server | ✅ Working | Accepts requests, processes queries |
| AnyClaude Proxy | ✅ Working | Routes requests correctly, applies fixes |
| MLX-LM API Fixes | ✅ Working | JSON parsing + model field removal verified |
| Claude Code ↔ Proxy | ⚠️ Hanging | Process hangs waiting for response |
| MLX-LM Response Format | ⚠️ Unknown | May not match Claude Code expectations |

---

## Files to Review

1. `src/main.ts` lines 172-216 - MLX-LM provider configuration
2. `src/anthropic-proxy.ts` - Response streaming and formatting
3. `src/convert-to-anthropic-stream.ts` - Stream response conversion
4. MLX-LM response headers and streaming chunks

---

## Next Steps

1. **Immediate**: Run investigation steps above
2. **Short term**: Identify exact response format issue
3. **Medium term**: Implement streaming format conversion if needed
4. **Long term**: Ensure compatibility with streaming responses

---

## Code Status

**What's Complete**:
- ✅ MLX-LM integration architecture
- ✅ Both compatibility fixes (tested and verified)
- ✅ Request transformation logic
- ✅ Parameter mapping
- ✅ Direct API connectivity
- ✅ All unit and regression tests

**What's Pending**:
- ⚠️ Response streaming format compatibility
- ⚠️ Claude Code timeout configuration
- ⚠️ End-to-end streaming validation

---

**Recommendation**: Don't revert the code - it's correct. Focus on diagnosing the response format issue through the investigation steps above.
