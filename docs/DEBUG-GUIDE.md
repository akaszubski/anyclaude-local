# Enhanced Debug Guide for LMStudio Integration

## Overview

The codebase now includes comprehensive debugging to help diagnose authentication and response issues with LMStudio.

## What's New

### 1. **Request Details Logging**

- LMStudio endpoint and model configuration
- Converted message format being sent to LMStudio
- Tool names and parameters
- System prompt preview

### 2. **Stream Conversion Logging**

- Raw chunk types received from AI SDK
- Chunk count and progression
- Unhandled chunk type detection
- Stream completion status

### 3. **Response Timing**

- Time to first chunk
- Time between chunks
- Warnings for slow responses (>10s, >30s)
- Stream stall detection (no chunks for >10s)

### 4. **Error Detection**

- Unknown chunk types from LMStudio
- Pipeline errors in stream conversion
- Timeout warnings

## How to Use

### Basic Debugging (Level 1)

Already enabled in your setup:

```bash
ANYCLAUDE_DEBUG=1 ./scripts/debug/start-local.sh
```

**What you'll see:**

- `[LMStudio Config]` - Endpoint URL, model name, circuit state
- `[Request Details]` - Message count, tools, tokens
- `[First Chunk]` - Time to first response
- `[Stream Conversion]` - Raw chunk types (first 10)
- `[Chunk 1-5]` - Chunk type progression
- Warnings for slow/stalled requests

### Verbose Debugging (Level 2)

For maximum detail:

```bash
ANYCLAUDE_DEBUG=2 ./scripts/debug/start-local.sh
```

**Additional output:**

- `[Full Request Body to Provider]` - Complete request sent to LMStudio
- `[LMStudio Request Details]` - System prompt preview, tool details
- `[Stream Conversion] Raw chunk N: fullChunk` - Complete chunk data
- `[Chunk Progress]` - Every 10th chunk timing

## Diagnosing Common Issues

### Issue: "Forming..." hangs forever

**Look for:**

1. **First chunk arrives but nothing after:**

   ```
   [First Chunk] lmstudio/model after 5ms
   [First Chunk Type] start
   ```

   - **Diagnosis:** LMStudio is responding but not sending actual content
   - **Check:** Is the model actually generating? Check LMStudio console

2. **No first chunk:**

   ```
   ⚠️  [Waiting for Response] lmstudio/model - no response after 5000ms
   ```

   - **Diagnosis:** LMStudio not responding to requests
   - **Check:** LMStudio server logs, API endpoint accessibility

3. **Unhandled chunk type:**

   ```
   [Stream Conversion] ⚠️  Unhandled chunk type: unknown-type
   ```

   - **Diagnosis:** LMStudio sending unexpected response format
   - **Check:** AI SDK compatibility, LMStudio version

### Issue: Authentication errors

**Look for:**

```
[LMStudio Config] {
  endpoint: 'http://localhost:1234/v1',
  model: 'deepseek-r1-distill-qwen-32b-abliterated',
  circuitState: 'OPEN'
}
```

Then check error logs in `/var/folders/.../anyclaude-errors.log`

### Issue: Model not responding with tools

**Look for:**

```
[Request Details] {
  toolCount: 15,
  messageCount: 5,
  ...
}
```

Check if LMStudio model supports tool calling. Many local models don't support structured tool use.

## Understanding Stream Chunk Types

Common chunk types you should see:

1. `start` - Stream initialization
2. `start-step` - Beginning of assistant response
3. `text-start` - Text content block starts
4. `text-delta` - Actual text content (this is what you want to see!)
5. `text-end` - Text block complete
6. `finish-step` - Response step complete
7. `finish` - Stream complete

**If you only see `start` and nothing else:**

- LMStudio may not be generating tokens
- Model may be stuck or waiting for something
- Request format may be incompatible

## Example Healthy Output

```
[Failover] Routing request to LMStudio: deepseek-r1-distill-qwen-32b-abliterated
[LMStudio Config] { endpoint: 'http://localhost:1234/v1', model: '...', circuitState: 'OPEN' }
[Request Start] lmstudio/... at 2025-10-25T08:28:20.924Z
[Request Details] { toolCount: 15, messageCount: 3, maxTokens: 8192 }
[LMStudio] Preparing request to deepseek-r1-distill-qwen-32b-abliterated
[First Chunk] lmstudio/... after 150ms
[First Chunk Type] start-step
[Stream Conversion] Raw chunk 1: { type: 'start-step' }
[Chunk 2] type=text-start
[Stream Conversion] Raw chunk 2: { type: 'text-start' }
[Chunk 3] type=text-delta
[Stream Conversion] Raw chunk 3: { type: 'text-delta' }
[Chunk 4] type=text-delta
[Stream Conversion] Raw chunk 4: { type: 'text-delta' }
[Chunk 5] type=text-delta
[Request Complete] lmstudio/...: 245 chunks in 3542ms total (3392ms streaming)
[Stream Conversion] Stream complete. Total chunks: 245
```

## Next Steps

1. **Run with debug enabled:** `./scripts/debug/start-local.sh`
2. **Try a simple prompt:** "hello"
3. **Check the output** for the patterns above
4. **Share the debug output** - Look for these key lines:
   - `[LMStudio Config]`
   - `[First Chunk Type]`
   - `[Stream Conversion] Raw chunk 1-5`
   - Any `⚠️` warnings
   - Any `Error` messages

## Debug Log Files

Errors are also logged to temp files:

- Error log: `/var/folders/.../anyclaude-errors.log`
- Debug dumps: `/var/folders/.../anyclaude-debug-*.json`

Check these for detailed error information if the console output isn't enough.
