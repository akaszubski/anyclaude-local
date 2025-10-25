# LMStudio Debugging Guide

## Problem Summary (SOLVED)

**Root Cause:** The Vercel AI SDK v5.0+ uses OpenAI's new "Responses API" format by default, but LMStudio only supports the standard "Chat Completions API" format.

**The Fix:** Added `compatibility: 'legacy'` to the OpenAI provider configuration in `src/failover-manager.ts:85` to force the standard Chat Completions format.

### Original Problem

LMStudio was connecting successfully but the stream conversion was failing because:

1. The AI SDK was sending requests with `input` instead of `messages`
2. Message content used `input_text` type instead of `text`
3. LMStudio doesn't understand the Responses API format
4. Stream was terminating prematurely with empty pipeline errors

## What I Fixed

### 1. **PRIMARY FIX**: LMStudio Compatibility (`src/failover-manager.ts:85`)

**The Core Issue:** Vercel AI SDK v5+ uses OpenAI's new Responses API by default, which LMStudio doesn't support.

**The Solution:**
```typescript
this.lmstudioProvider = createOpenAI({
  baseURL: this.config.lmstudioUrl,
  apiKey: this.config.lmstudioApiKey,
  // CRITICAL: Force legacy Chat Completions format for LMStudio
  compatibility: 'legacy',  // ✅ This line fixes everything!
  fetch: ...
});
```

This forces the AI SDK to use the standard OpenAI Chat Completions API format that LMStudio expects.

**Before Fix:**
```json
{
  "model": "gpt-oss-20b-mlx",
  "input": [  // ❌ Wrong! LMStudio doesn't understand this
    {
      "role": "user",
      "content": [{"type": "input_text", "text": "hello"}]  // ❌ Wrong type!
    }
  ]
}
```

**After Fix:**
```json
{
  "model": "gpt-oss-20b-mlx",
  "messages": [  // ✅ Correct! Standard Chat Completions format
    {
      "role": "user",
      "content": [{"type": "text", "text": "hello"}]  // ✅ Correct type!
    }
  ]
}
```

### 2. Enhanced Error Logging (`src/convert-to-anthropic-stream.ts`)

**Before:** Empty pipeline errors were silently ignored
**After:** All pipeline errors are logged with context

```typescript
// Now logs:
// - Empty errors as warnings about stream cancellation
// - The chunk count when the error occurred
// - Clear indication that this is NOT normal behavior
```

### 2. Verbose Chunk Logging

**Before:** Only first 10 chunks logged at debug level 1
**After:**
- First 10 chunks at debug level 1
- ALL chunks at debug level 2 (verbose)
- Better error messages for unhandled chunk types

### 3. Enhanced Debug Script

Created `./debug-local.sh` with:
- Maximum debug verbosity (`ANYCLAUDE_DEBUG=2`)
- Log file capture in `debug-logs/`
- Clear status messages
- Helpful tips on what to look for

## How to Debug

### Run Enhanced Debug Mode

```bash
./debug-local.sh
```

This will:
1. ✓ Check LMStudio is running
2. ✓ Auto-detect your loaded model
3. ✓ Enable maximum debug verbosity
4. ✓ Log everything to `debug-logs/debug-TIMESTAMP.log`
5. ✓ Show ALL stream chunks (not just first 10)

### What to Look For

#### 1. Chunk Sequence

Look for the pattern of chunks being received:
```
[Stream Conversion] Raw chunk 1: {"type":"start"}
[Stream Conversion] Raw chunk 2: {"type":"start-step"}
[Stream Conversion] Raw chunk 3: {"type":"reasoning-start"}  # <-- Was this received?
[Stream Conversion] Raw chunk 4: {"type":"reasoning-end"}
[Stream Conversion] Raw chunk 5: {"type":"text-start"}
[Stream Conversion] Raw chunk 6: {"type":"text-delta"}
[Stream Conversion] Raw chunk 7: ???  # <-- What comes next?
```

**Key Question:** What chunk type comes after `text-delta`? That's likely the culprit.

#### 2. Unhandled Chunk Types

Look for messages like:
```
[Stream Conversion] ⚠️  Unhandled chunk type: SOME_TYPE
[Stream Conversion] Terminating stream due to unhandled chunk
```

This tells us exactly which chunk type the converter doesn't know how to handle.

#### 3. Pipeline Abortion

Look for:
```
[Stream Conversion] ⚠️  Pipeline aborted with empty error
[Stream Conversion] Last processed chunk count: N
```

This tells us the stream was cancelled without a proper error message.

## Possible Root Causes

### Theory 1: Missing `reasoning-start` chunk

Notice chunk 3 is missing in your output - it jumps from chunk 2 to chunk 4. If LMStudio is sending `reasoning-delta` chunks without a `reasoning-start`, the converter might be confused.

**Fix:** We may need to make `reasoning-start` optional and auto-detect it.

### Theory 2: Unexpected chunk after `text-delta`

LMStudio might be sending a chunk type we don't handle, such as:
- `step-finish` (some providers use this)
- `text-done` (some use this instead of `text-end`)
- A custom LMStudio-specific chunk type

**Fix:** Add handling for the specific chunk type.

### Theory 3: Malformed chunk

LMStudio might be sending a chunk with:
- Missing `type` field
- Undefined or null `type`
- A chunk that doesn't match the expected format

**Fix:** Add defensive checks for chunk structure.

### Theory 4: Stream closes prematurely

LMStudio might be closing the connection before sending `finish-step` and `finish` chunks.

**Fix:** Handle incomplete streams more gracefully.

## Next Steps

### Step 1: Run Debug Script

```bash
./debug-local.sh
```

Ask a simple question like "what is 2+2" and capture the full output.

### Step 2: Analyze the Output

1. Look for the EXACT chunk sequence
2. Find the chunk number where it fails
3. Identify what chunk type causes the error
4. Check if `fullChunk` data is logged (at verbose level 2)

### Step 3: Share Debug Log

Send me the debug log file from `debug-logs/debug-TIMESTAMP.log` or just the relevant chunk sequence.

### Step 4: I'll Implement the Fix

Once we know the exact chunk type that's failing, I can add support for it in the stream converter.

## Quick Test Without Claude Code

If you want to test LMStudio directly (without Claude Code):

```bash
# Set environment
export FORCE_LMSTUDIO=true
export LMSTUDIO_URL=http://localhost:1234/v1
export LMSTUDIO_MODEL=gpt-oss-20b-mlx  # or your model
export ANYCLAUDE_DEBUG=2
export PROXY_ONLY=true

# Run proxy only
~/.bun/bin/bun run src/main.ts
```

Then in another terminal:
```bash
# Get the proxy URL from the output (e.g., http://localhost:52385)
PROXY_URL=http://localhost:XXXXX

# Test with curl
curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -H "x-api-key: fake-key" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 100,
    "stream": true,
    "messages": [{"role": "user", "content": "what is 2+2"}]
  }'
```

This will show the raw SSE stream from the proxy without Claude Code's UI.

## Model Recommendations

Based on your LMStudio models, here are my recommendations:

1. **Best for coding:** `deepseek-r1-distill-qwen-32b-abliterated`
   - Reasoning capabilities
   - Large enough for complex tasks
   - Uncensored for tool use

2. **Fastest:** `mistralai/devstral-small-2505`
   - Optimized for code
   - Small = faster responses
   - Official Mistral model

3. **Good balance:** `qwen3-coder-30b-a3b-instruct-mlx`
   - Specialized for coding
   - 30B parameters = good quality
   - MLX optimized for M-series Macs

4. **Current (gpt-oss-20b-mlx):** Should work but might have quirks
   - Make sure it's properly loaded
   - Check LMStudio logs for model errors

## Common Issues

### Issue: "No models loaded in LMStudio"
**Fix:** Load a model in LMStudio's UI first

### Issue: "LMStudio server is NOT running"
**Fix:** Start the server in LMStudio (Server tab → Start Server)

### Issue: Model loads but streams are slow
**Fix:**
- Check your Mac's Activity Monitor - is the model using GPU?
- Try a smaller model
- Reduce context length in LMStudio settings

### Issue: Streams start then hang forever
**Fix:**
- Check LMStudio's console for errors
- Try a different model
- Restart LMStudio

## Files Modified

1. `src/convert-to-anthropic-stream.ts` - Enhanced logging and error handling
2. `debug-local.sh` - New enhanced debug script (run this!)
3. This file - Debug documentation

## Contact

If the debug output is very long, you can:
1. Save it to a file: `./debug-local.sh > debug.txt 2>&1`
2. Share just the chunk sequence (look for "Raw chunk" lines)
3. Share the error message (look for "⚠️" or "Pipeline error")

Good luck! The enhanced logging should give us exactly what we need to fix this.
