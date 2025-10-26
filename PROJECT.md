# AnyClaude Project Documentation

## Project Vision

**Make Claude Code work seamlessly with local LMStudio models as if they were the real Claude API.**

AnyClaude is a translation layer that bridges the gap between Claude Code (Anthropic's official CLI tool) and local/alternative AI providers. Whether you're using Claude Max (session-based auth), Claude API (API keys), or local LMStudio models, anyclaude provides a unified, privacy-focused development experience.

## Origins: A Port for Privacy

This project is a **port of the original anyclaude** concept, reimagined specifically for **Claude Code 2.0** compatibility. The goal is to enable developers to:

1. **Use Claude Code offline** with local models via LMStudio
2. **Maintain privacy** by keeping code and conversations on-device
3. **Avoid API costs** while retaining Claude Code's excellent developer experience
4. **Work seamlessly** - local models should "just work" like real Claude
5. **Support both auth methods** - Claude Max (session tokens) and Claude API (API keys)

### Why Claude Code 2.0?

Claude Code represents Anthropic's vision for AI-powered development - sophisticated tool use, multi-step reasoning, and seamless integration with development workflows. However, it requires either:
- **Claude Max subscription** ($20-200/month) with session-based auth, OR
- **Claude API access** with pay-per-token pricing

AnyClaude makes this premium experience accessible with:
- **Free local models** via LMStudio (Qwen, DeepSeek, etc.)
- **Complete privacy** - your code never leaves your machine
- **No API costs** - run unlimited queries on your hardware
- **Offline capability** - work without internet access

## Core Principle: Active Translation, Not Simple Passthrough

While anyclaude acts as an HTTP proxy server, its primary role is **intelligent translation and adaptation**:

### What Makes It More Than a Proxy

1. **Bidirectional Format Translation**
   - Claude Code sends: Anthropic Messages API format
   - LMStudio expects: OpenAI Chat Completions format
   - We translate in both directions, preserving semantics

2. **Streaming Protocol Adaptation**
   - Claude Code expects: Server-Sent Events (SSE) with specific event types
   - LMStudio sends: OpenAI streaming format via AI SDK
   - We convert chunk-by-chunk in real-time

3. **Tool Call Translation**
   - Claude Code uses: Atomic tool calls (complete parameters at once)
   - AI SDK sends: Streaming tool parameters (progressive updates)
   - We buffer and consolidate to match expectations

4. **Authentication Flexibility**
   - Claude Max: Session-based Bearer tokens
   - Claude API: API keys in headers
   - Both: Transparent passthrough in "claude" mode

5. **Context Window Management**
   - Claude: 200K tokens
   - Local models: Often 8K-128K
   - We automatically truncate to fit model capacity

6. **Schema Adaptation** (planned)
   - Simplify complex tool schemas for weaker models
   - Validate and correct tool parameters
   - Provide model-specific hints and guidance

## Architecture

### Dual-Mode Design

#### Claude Mode (`ANYCLAUDE_MODE=claude`)
**Purpose**: Baseline comparison and debugging

- Transparently passes through to `api.anthropic.com`
- Works with both Claude Max (Bearer tokens) and API keys
- Logs all requests/responses for comparison
- Shows how real Claude handles the same scenarios
- Used to identify translation gaps

**Use Cases**:
- Debugging: Compare local model behavior vs real Claude
- Verification: Ensure our passthrough doesn't break anything
- Learning: Understand how Claude uses tools
- Testing: Validate authentication handling

#### LMStudio Mode (`ANYCLAUDE_MODE=lmstudio`, default)
**Purpose**: Production use with local models

- Full translation layer with all adaptations
- Routes to local LMStudio server (default: `http://localhost:1234/v1`)
- Applies message format conversion, streaming translation, context management
- Model-agnostic: works with whatever model LMStudio has loaded
- Hot-swappable: switch models in LMStudio without restarting anyclaude

**Use Cases**:
- Development: Privacy-focused coding with local models
- Experimentation: Test different models easily
- Cost savings: Unlimited queries without API charges
- Offline work: No internet required

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Claude Code (claude.ai/code)                                    │
│ • Sends Anthropic Messages API requests                         │
│ • Expects SSE streaming responses                               │
│ • Uses tools for file ops, git, web search, etc.                │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP Request (Anthropic format)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: HTTP Proxy (src/anthropic-proxy.ts)                   │
│ • Intercepts requests to api.anthropic.com                      │
│ • Routes based on mode: claude | lmstudio                       │
│ • Provides debug logging and trace capture                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┴────────────────┐
         ▼                                ▼
┌──────────────────┐            ┌──────────────────────────┐
│ Claude Mode      │            │ LMStudio Mode            │
│ • Passthrough    │            │ • Full translation       │
│ • Trace logging  │            │ • Format conversion      │
│ • Both auth types│            │ • Stream adaptation      │
└────────┬─────────┘            └─────────┬────────────────┘
         │                                 │
         ▼                                 ▼
┌──────────────────┐            ┌──────────────────────────┐
│ Real Claude API  │            │ Layer 2: Message Format  │
│ api.anthropic.com│            │ (convert-anthropic-      │
└──────────────────┘            │  messages.ts)            │
                                │ • Anthropic → OpenAI     │
                                │ • Context truncation     │
                                │ • System prompt handling │
                                └─────────┬────────────────┘
                                          │
                                          ▼
                                ┌──────────────────────────┐
                                │ Layer 3: Tool Schemas    │
                                │ (json-schema.ts)         │
                                │ • Schema conversion      │
                                │ • Future: Simplification │
                                └─────────┬────────────────┘
                                          │
                                          ▼
                                ┌──────────────────────────┐
                                │ Layer 4: AI SDK Provider │
                                │ (main.ts)                │
                                │ • OpenAI-compatible      │
                                │ • Streaming enabled      │
                                │ • Tool use support       │
                                └─────────┬────────────────┘
                                          │
                                          ▼
                                ┌──────────────────────────┐
                                │ LMStudio Server          │
                                │ localhost:1234/v1        │
                                │ • Any loaded model       │
                                │ • Hot-swappable          │
                                └─────────┬────────────────┘
                                          │
                                          ▼
                                ┌──────────────────────────┐
                                │ Layer 5: Stream Format   │
                                │ (convert-to-anthropic-   │
                                │  stream.ts)              │
                                │ • AI SDK → Anthropic SSE │
                                │ • Tool call consolidation│
                                │ • Event type mapping     │
                                └─────────┬────────────────┘
                                          │
                         ┌────────────────┴─────────┐
                         ▼                          ▼
              SSE Response Stream         Debugging Logs
              (Anthropic format)          (stderr, trace files)
```

## Key Translation Challenges & Solutions

### 1. Streaming Tool Parameters (SOLVED)

**Problem**: "Error reading file" and tool execution failures with LMStudio models

**Root Cause**:
- AI SDK sends tool calls in TWO formats simultaneously:
  1. **Streaming**: `tool-input-start` → `tool-input-delta` (many) → `tool-input-end` → `tool-call`
  2. **Atomic**: `tool-call` (for backward compatibility)
- Our initial approach SKIPPED streaming events and only sent `tool-call`
- This created duplicates when both were received, with first having empty `input: {}`
- Claude Code expects streaming format via `input_json_delta` events

**Solution** (`src/convert-to-anthropic-stream.ts`):
```typescript
// Track which tools we've sent via streaming to avoid duplicates
const streamedToolIds = new Set<string>();

case "tool-input-start": {
  // Send streaming tool parameters as input_json_delta (Anthropic format)
  streamedToolIds.add(chunk.id); // Mark as streamed
  controller.enqueue({
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: chunk.id,
      name: chunk.toolName,
      input: {}, // Start empty, build via deltas
    },
  });
  break;
}

case "tool-input-delta": {
  // Stream each piece of JSON incrementally
  controller.enqueue({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: chunk.delta },
  });
  break;
}

case "tool-input-end": {
  controller.enqueue({ type: "content_block_stop", index });
  index += 1;
  break;
}

case "tool-call": {
  // Skip if already sent via streaming (avoid duplicate)
  if (streamedToolIds.has(chunk.toolCallId)) break;

  // Handle atomic tool calls (non-streaming models)
  controller.enqueue({
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: chunk.toolCallId,
      name: chunk.toolName,
      input: chunk.input,
    },
  });
  controller.enqueue({ type: "content_block_stop", index });
  index += 1;
  break;
}
```

**Key Insight**: Comparing to [coder/anyclaude](https://github.com/coder/anyclaude) revealed the correct approach - use streaming `input_json_delta` events, not atomic calls.

**Result**: ✅ Tool calls work perfectly - 0 errors. Verified with Qwen3 Coder 30B, GPT-OSS-20B, and multiple tool types.

**See**: `ISSUE-tool-calling.md` for complete investigation and fix details.

### 2. Context Window Limits

**Problem**: Local models have smaller context windows than Claude (8K-128K vs 200K)

**Solution** (`src/context-manager.ts`):
- Query model's actual context length via LMStudio API
- Calculate token usage for messages and tools
- Automatically truncate conversation history to fit
- Preserve recent messages and system prompt
- Log warnings when truncation occurs

### 3. Authentication Flexibility

**Problem**: Claude Code uses two different auth methods:
- Claude Max: Session-based Bearer tokens (no API key needed)
- Claude API: Traditional API keys in headers

**Solution** (`src/anthropic-proxy.ts:71-93`):
- Transparent header passthrough in claude mode
- No auth required for lmstudio mode (local server)
- Works seamlessly with both subscription types

### 4. Slow Model Timeouts

**Problem**: Local models can take 60+ seconds for complex requests, causing Claude Code to timeout

**Solution** (`src/anthropic-proxy.ts`):
- 10-second SSE keepalive pings during streaming
- Prevents client timeout while model thinks
- Cleared once actual streaming begins

### 5. Hardware-Dependent Performance

**Reality**: Model performance varies based on your hardware

**Factors**:
- GPU type and VRAM (most critical for large models)
- RAM amount (affects context window size)
- CPU speed (for CPU-only inference)
- Model size vs available VRAM (quantization may be needed)

**Tested Models**:
- Qwen Coder 30B - Works well with adequate VRAM
- GPT-OSS 20B - Good balance of size/performance
- Mistral, Llama, DeepSeek - Compatibility varies by model variant

**Note**: Tool calling requires model support. Not all LMStudio-compatible models support the OpenAI tool calling format.

## Translation Components

### Message Format Translation (`src/convert-anthropic-messages.ts`)

**Anthropic → OpenAI**:
```typescript
// Anthropic format
{
  "model": "claude-sonnet-4",
  "system": "You are a helpful assistant",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "tools": [...]
}

// Translated to OpenAI format
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello"}
  ],
  "tools": [...],  // Converted schema format
}
```

### Tool Schema Translation (`src/json-schema.ts`)

**Anthropic → OpenAI**:
```typescript
// Anthropic format
{
  "name": "Read",
  "description": "Reads a file...",
  "input_schema": {
    "type": "object",
    "properties": {...},
    "required": ["file_path"]
  }
}

// Translated to OpenAI format
{
  "type": "function",
  "function": {
    "name": "Read",
    "description": "Reads a file...",
    "parameters": {
      "type": "object",
      "properties": {...},
      "required": ["file_path"]
    }
  }
}
```

### Stream Event Translation (`src/convert-to-anthropic-stream.ts`)

**AI SDK → Anthropic SSE**:
```typescript
// AI SDK stream chunk
{type: "text-start"}
{type: "text-delta", text: "Hello"}
{type: "text-end"}

// Translated to Anthropic SSE
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}
```

## Debugging Architecture

### Multi-Level Debug Logging

Set `ANYCLAUDE_DEBUG=1|2|3` for increasing verbosity:

**Level 1** (Basic):
- Request/response summary
- Errors and warnings
- Tool call counts
- Context truncation warnings

**Level 2** (Verbose):
- Full request/response bodies
- Stream chunk details
- Duplicate filtering info
- SSE event details

**Level 3** (TRACE):
- Tool schemas sent by Claude Code
- Individual tool call details with parameters
- Stream conversion step-by-step
- Both modes: Claude API tool calls AND LMStudio tool calls

### Debug Output

**stderr**: Real-time logging
```bash
ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/debug.log
```

**Trace files**: Full request/response capture
```
~/.anyclaude/traces/claude/2025-10-26T00-37-59-155Z.json
~/.anyclaude/traces/lmstudio/2025-10-26T00-42-13-328Z.json
```

**Error files**: Automatic capture of 4xx errors
```
/var/folders/.../anyclaude-errors.log
/var/folders/.../anyclaude-debug-*.json
```

### Comparison Testing

**compare-modes.sh**: Side-by-side comparison of Claude vs LMStudio
```bash
./compare-modes.sh "Read the README.md file"
```

Shows:
- Tool schema differences (17 vs 17 tools)
- Tool calls made (0 vs 3 for same prompt)
- Parameter formats
- Response differences

**analyze-tool-calls.sh**: Extract tool call details from logs
```bash
./analyze-tool-calls.sh
```

Displays:
- Tool call count
- Parameter details
- SSE events sent to Claude Code
- Useful for debugging "Invalid tool parameters"

## Development Workflow

### 1. Identify Issue
```bash
# Run with debug logging
ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/issue.log

# Trigger the issue
# Examine logs
grep -A 10 "ERROR\|Invalid" /tmp/issue.log
```

### 2. Compare with Real Claude
```bash
# Test with real Claude API
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/claude.log
# Use same prompt

# Compare logs
./compare-modes.sh "problematic prompt"
```

### 3. Identify Translation Gap
```bash
# Extract tool calls from both modes
grep -A 8 "\[Tool Call\]" /tmp/claude.log > /tmp/claude-tools.txt
grep -A 8 "\[Tool Call\]" /tmp/lmstudio.log > /tmp/lmstudio-tools.txt

# Find differences
diff -u /tmp/claude-tools.txt /tmp/lmstudio-tools.txt
```

### 4. Implement Translation
Choose the appropriate layer:
- **Message format issue** → `convert-anthropic-messages.ts`
- **Tool schema issue** → `json-schema.ts` or `model-adapters.ts`
- **Streaming issue** → `convert-to-anthropic-stream.ts`
- **Request routing** → `anthropic-proxy.ts`

### 5. Test & Iterate
```bash
# Rebuild
npm run build

# Test fix
ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/fixed.log

# Verify improvement
./analyze-tool-calls.sh
```

## File Structure

### Core Files

| File | Purpose | Lines | Complexity |
|------|---------|-------|------------|
| `src/main.ts` | Entry point, LMStudio provider setup | ~200 | Low |
| `src/anthropic-proxy.ts` | HTTP proxy server, mode routing | ~650 | Medium |
| `src/convert-anthropic-messages.ts` | Message format translation | ~300 | High |
| `src/convert-to-anthropic-stream.ts` | Stream format translation | ~250 | High |
| `src/json-schema.ts` | Tool schema conversion | ~150 | Medium |
| `src/context-manager.ts` | Context window management | ~180 | Medium |
| `src/model-adapters.ts` | Model-specific adaptations (planned) | ~120 | Low |
| `src/debug.ts` | Multi-level debug logging | ~100 | Low |
| `src/trace-logger.ts` | Request/response tracing | ~80 | Low |

### Configuration Files

- `tsconfig.json` - TypeScript config for development
- `tsconfig.build.json` - TypeScript config for production builds
- `package.json` - Dependencies and build scripts
- `.gitignore` - Ignore node_modules, dist, traces, etc.

### Documentation

- `README.md` - User-facing documentation
- `PROJECT.md` - This file (architecture, development guide)
- `CLAUDE.md` - Instructions for Claude Code when editing this project
- `DEBUG-QUICK-START.md` - Quick guide to debug tool call issues
- `TOOL-CALL-DEBUG.md` - Detailed tool call debugging guide

### Scripts

- `compare-modes.sh` - Compare Claude vs LMStudio behavior
- `analyze-tool-calls.sh` - Extract tool call details from logs
- `monitor-tool-calls.sh` - Real-time tool call monitoring

## Future Enhancements

### 1. Model Adapters (In Progress)
**Goal**: Per-model schema and parameter adaptations

Framework exists in `src/model-adapters.ts`, planned features:
- **Schema simplification** for weaker models
- **Parameter validation** and correction
- **Tool selection guidance** (hints in descriptions)
- **Model-specific prompts** for better tool use

Example:
```typescript
const MODEL_CONFIGS = {
  "qwen": {
    simplifySchemas: true,
    maxToolsPerRequest: 10,
    requireAllParameters: true,
  },
  "deepseek": {
    simplifySchemas: false,
    enhanceDescriptions: true,
  }
};
```

### 2. Additional Providers
**Goal**: Support beyond LMStudio

Potential targets:
- **Ollama** - Popular local model runner
- **OpenRouter** - Proxy to multiple providers
- **Azure OpenAI** - Enterprise deployments
- **Custom endpoints** - Any OpenAI-compatible API

### 3. Response Quality Improvements
**Goal**: Better handling of model quirks

Ideas:
- Detect and retry failed tool calls
- Normalize stop sequences
- Fix formatting inconsistencies
- Handle models that ignore system prompts

### 4. Performance Optimizations
**Goal**: Faster responses, lower latency

Ideas:
- Connection pooling to LMStudio
- Request/response compression
- Smarter context truncation (keep important messages)
- Parallel tool calls where possible

### 5. Configuration UI
**Goal**: Easier setup and model management

Ideas:
- Web UI for configuration
- Model selection and testing
- Real-time debug log viewer
- Performance metrics dashboard

## Design Principles

### 1. **Translation, Not Replacement**
We don't try to replicate Claude's intelligence - we translate between formats so local models can use Claude Code's interface.

### 2. **Preserve Semantics**
Format conversion should maintain meaning. A tool call in Anthropic format should behave identically when converted to OpenAI format.

### 3. **Graceful Degradation**
When features aren't supported (e.g., thinking blocks for non-reasoning models), silently adapt rather than error.

### 4. **Transparent Debugging**
Every translation step should be observable with appropriate debug levels. Users should understand what's happening.

### 5. **Privacy First**
Local mode should never leak data. No analytics, no telemetry, no external calls except to user's own LMStudio server.

### 6. **Zero Config (But Configurable)**
Work out-of-box with sensible defaults. But allow power users to tune everything.

## Success Metrics

### Functionality
- ✅ Basic message translation (Anthropic ↔ OpenAI)
- ✅ Streaming responses with SSE
- ✅ Tool call translation (with fixes for duplicates)
- ✅ Context window management
- ✅ Hot model switching
- ✅ Both auth methods (Claude Max + API keys)
- 🔄 Schema adaptation for weaker models (in progress)
- ⏳ Parameter validation and correction (planned)

### Compatibility
- ✅ Claude Code 2.0 (latest version)
- ✅ LMStudio server
- ✅ MacOS (primary platform)
- ✅ Linux (tested)
- ⏳ Windows (untested but should work)

### User Experience
- ✅ Installation via npm
- ✅ Single command to start (`anyclaude`)
- ✅ Works with default LMStudio setup
- ✅ Clear error messages
- ✅ Comprehensive debug logging
- 🔄 Documentation coverage (improving)

## Getting Help

### Common Issues

**"Invalid tool parameters"**
- See `DEBUG-QUICK-START.md` for step-by-step debugging
- Run with `ANYCLAUDE_DEBUG=3` to see tool call details
- Use `./analyze-tool-calls.sh` to extract parameters
- Compare with Claude mode to see expected format

**"Context too long"**
- Models have smaller context than Claude
- Check debug logs for truncation warnings
- Use shorter prompts or fewer files
- Consider models with larger context (32K+)

**"Connection refused"**
- Ensure LMStudio server is running
- Default: `http://localhost:1234/v1`
- Check `LMSTUDIO_URL` environment variable
- Test with: `curl http://localhost:1234/v1/models`

**"Authentication failed"** (Claude mode)
- Claude Max: Ensure session is active
- Claude API: Check API key is valid
- Headers are passed through transparently
- Check trace logs for request details

### Debug Resources

1. **Quick debugging**: `DEBUG-QUICK-START.md`
2. **Tool call issues**: `TOOL-CALL-DEBUG.md`
3. **Comparison testing**: `./compare-modes.sh`
4. **Real-time monitoring**: `./monitor-tool-calls.sh`
5. **Log analysis**: `./analyze-tool-calls.sh`

### Contributing

This is an open-source project. Contributions welcome:

1. **Test with your models** - Try different LMStudio models
2. **Report issues** - Include debug logs and model info
3. **Improve translations** - Better schema adaptations, parameter fixes
4. **Add providers** - Ollama, OpenRouter, etc.
5. **Documentation** - Clarify setup, add examples

## License & Credits

AnyClaude is built on:
- **Vercel AI SDK** - Unified interface for AI providers
- **Claude Code** - Anthropic's official CLI tool
- **LMStudio** - Local model serving
- **Original anyclaude** - Concept and inspiration

Created to make Claude Code's excellent developer experience accessible to privacy-focused developers using local models.

---

**"Bridging the gap between Claude Code and local models through intelligent translation."**
