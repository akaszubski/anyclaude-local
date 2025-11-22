# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**anyclaude** is a translation layer for Claude Code that enables using local models (LMStudio) or cloud models (OpenRouter) through the Anthropic API format.

**Supported Backends**:
- **LMStudio** - Local models with manual server management (100% privacy)
- **OpenRouter** - 400+ cloud models at 84% lower cost than Claude API
- **Claude API** - Official Anthropic API for comparison and analysis

The proxy intercepts Anthropic API calls and translates them to/from the OpenAI Chat Completions format.

## 📁 File Organization Standards

**CRITICAL**: Follow these standards to keep the project organized over time.

### Root Directory (Keep Clean!)

**Only these files belong in root:**

```
README.md              # Project overview
CHANGELOG.md           # Version history
LICENSE                # MIT license
CODE_OF_CONDUCT.md     # Community guidelines
CONTRIBUTING.md        # Contribution guide
SECURITY.md            # Security policy
CLAUDE.md              # This file - Claude Code instructions
PROJECT.md             # Architecture deep-dive
package.json           # Node.js config
tsconfig.json / tsconfig.build.json  # TypeScript config
.gitignore             # Git ignore rules
```

**Everything else goes in subdirectories!**

### Documentation: `docs/`

```
docs/
├── README.md                    # Documentation index
├── guides/                      # User guides
├── development/                 # Development guides
├── debugging/                   # Debugging resources
├── architecture/                # Architecture docs
└── reference/                   # Technical references
```

### Scripts: `scripts/`

```
scripts/
├── debug/                       # Debugging scripts
└── test/                        # Test scripts
```

### Source Code: `src/`

```
src/
├── main.ts                      # Entry point
├── anthropic-proxy.ts           # HTTP proxy server
├── convert-anthropic-messages.ts # Message format conversion
├── convert-to-anthropic-stream.ts # Stream conversion
├── debug.ts                     # Debug logging
└── trace-logger.ts              # Trace file management
```

### Tests: `tests/`

```
tests/
├── unit/                        # Unit tests
├── integration/                 # Integration tests
└── regression/                  # Regression tests
```

### Build Output: `dist/` (gitignored)

```
dist/                            # Generated, never commit
```

## 🚨 When Working on This Project

### Before Creating New Files

1. **Ask yourself**: Does this belong in root or a subdirectory?
2. **Documentation** → `docs/[category]/filename.md`
3. **Scripts** → `scripts/[debug|test]/filename.sh`
4. **Source code** → `src/filename.ts`
5. **Tests** → `tests/[unit|integration|regression]/filename.js`

### Before Committing

1. **Check root directory**: `ls *.md *.sh *.log | wc -l` should be ≤ 8 markdown files
2. **No log files**: All `*.log` files should be gitignored
3. **No temporary files**: Clean up test outputs, debug logs, etc.
4. **Update docs/README.md**: If you added documentation

## Architecture

The proxy works by:

1. Spawning a local HTTP server that mimics the Anthropic API
2. Intercepting `/v1/messages` requests
3. Converting Anthropic message format to OpenAI Chat Completions format
4. Routing to LMStudio or OpenRouter
5. Converting responses back to Anthropic format
6. Setting `ANTHROPIC_BASE_URL` to point Claude Code at the proxy

Key components:

- `src/main.ts`: Entry point that configures backend provider and spawns Claude with proxy
- `src/anthropic-proxy.ts`: HTTP server that handles request/response translation
- `src/convert-anthropic-messages.ts`: Bidirectional message format conversion
- `src/convert-to-anthropic-stream.ts`: Stream response conversion

See [PROJECT.md](PROJECT.md) for complete architectural deep-dive.

## Development Commands

```bash
# Install dependencies
bun install

# Build the project (creates dist/main.js with shebang)
bun run build

# Run the built binary
bun run ./dist/main.js

# The build command:
# 1. Compiles TypeScript to CommonJS for Node.js compatibility
# 2. Adds Node shebang for CLI execution
```

## Testing

Test the proxy manually:

```bash
# Run in proxy-only mode to get the URL
PROXY_ONLY=true bun run src/main.ts

# Test with debug logging
ANYCLAUDE_DEBUG=1 bun run src/main.ts

# Test with verbose debug logging
ANYCLAUDE_DEBUG=2 bun run src/main.ts

# Test with trace debug logging (tool calls)
ANYCLAUDE_DEBUG=3 bun run src/main.ts
```

## Environment Variables

**LMStudio Configuration:**

- `LMSTUDIO_URL`: LMStudio server URL (default: `http://localhost:8082/v1`)
- `LMSTUDIO_MODEL`: Model name to use (default: `current-model`)
  - Note: LMStudio serves whatever model is currently loaded, regardless of the model name
  - You can switch models in LMStudio without restarting anyclaude
- `LMSTUDIO_API_KEY`: API key for LMStudio (default: `lm-studio`)

**OpenRouter Configuration:**

- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `OPENROUTER_MODEL`: Model to use (e.g., `google/gemini-2.5-flash`)
- `OPENROUTER_BASE_URL`: Base URL (default: `https://openrouter.ai/api/v1`)

**Debug:**

- `ANYCLAUDE_DEBUG`: Enable debug logging (1=basic, 2=verbose, 3=trace with tool calls)
  - **Note**: When using `--mode=claude` or `--mode=openrouter`, trace logging (level 3) is **enabled by default**
  - This saves full prompts and responses to `~/.anyclaude/traces/` for analysis
  - To disable: `ANYCLAUDE_DEBUG=0 anyclaude --mode=claude`
- `PROXY_ONLY`: Run proxy server without spawning Claude Code
- `ANYCLAUDE_MODE`: claude | lmstudio | openrouter (default: lmstudio)

## Implementation Notes

**LMStudio Compatibility:**

The proxy uses the `@ai-sdk/openai-compatible` package, which is specifically designed for OpenAI-compatible servers like LMStudio. This package:

- Properly handles LMStudio's streaming format
- Automatically manages parameter compatibility
- Uses standard OpenAI Chat Completions format
- Supports Server-Sent Events (SSE) streaming

See `src/main.ts:264-345` for the LMStudio provider configuration.

**Message Format Conversion:**

The proxy converts between two formats:

1. **Anthropic Messages API** (Claude Code format):
   - System prompts as separate field
   - Content blocks with types
   - Tool use with specific format

2. **OpenAI Chat Completions** (LMStudio/OpenRouter format):
   - System as first message
   - Simple message format
   - Standard tool calling

See `src/convert-anthropic-messages.ts` for conversion logic.

**Streaming:**

The proxy handles Server-Sent Events (SSE) streaming:

- Converts AI SDK stream chunks to Anthropic SSE format
- Maps event types (`text-start` → `content_block_start`, etc.)
- Handles tool calls via streaming `input_json_delta` events
- Deduplicates redundant tool-call events from AI SDK

See `src/convert-to-anthropic-stream.ts` for stream conversion.

## Quick Start

```bash
# One command - does everything!
anyclaude
```

## Configuration & Usage

### Configuration File: `.anyclauderc.json`

Create this file in your project root to configure anyclaude:

```json
{
  "backend": "lmstudio",
  "backends": {
    "lmstudio": {
      "enabled": true,
      "baseUrl": "http://localhost:8082/v1",
      "apiKey": "lm-studio",
      "model": "current-model"
    },
    "claude": {
      "enabled": false
    },
    "openrouter": {
      "enabled": false,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-...",
      "model": "google/gemini-2.5-flash"
    }
  }
}
```

**See `.anyclauderc.example.json` for a complete configuration example with all backends.**

### OpenRouter Configuration (Cloud Models)

OpenRouter provides access to 400+ AI models through a single API, including:

- **Gemini 2.5 Flash** (1M context, $0.30/$2.50 per 1M tokens) - Default, best value
- **Qwen 2.5 72B** ($0.35/$0.70 per 1M tokens) - Cheapest option
- **GLM-4.6** (200K context, $0.60/$2 per 1M tokens) - Great for coding
- **Claude 3.5 Sonnet** via OpenRouter ($3/$15 per 1M tokens)
- **GPT-4** via OpenRouter ($10/$30 per 1M tokens)
- Many open models with **free tiers**!

**Quick Start:**

1. Get an API key from [openrouter.ai](https://openrouter.ai)
2. Copy `.anyclauderc.example.json` to `.anyclauderc.json`
3. Add your API key to the config
4. Run: `anyclaude --mode=openrouter`

**Example config:**

```json
{
  "backend": "openrouter",
  "backends": {
    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-YOUR_KEY_HERE",
      "model": "google/gemini-2.5-flash"
    }
  }
}
```

**Popular models:**

- `google/gemini-2.5-flash` - 1M context, thinking mode ($0.30/$2.50)
- `qwen/qwen-2.5-72b-instruct` - Cheaper alternative ($0.35/$0.70)
- `google/gemini-2.0-flash-001` - **Very cheap!** ($0.10/$0.40)
- `z-ai/glm-4.6` - Good for coding ($0.60/$2)
- `anthropic/claude-3.5-sonnet` - Via OpenRouter
- `openai/gpt-4` - Via OpenRouter

See [openrouter.ai/models](https://openrouter.ai/models) for full list.

**Features:**

- ✅ **Trace logging enabled by default** (analyze prompts in `~/.anyclaude/traces/openrouter/`)
- ✅ Tool calling support (Read, Write, Edit, Bash, etc.)
- ✅ Streaming responses
- ✅ 1M context window (Gemini models)
- ✅ Much cheaper than Claude API

**Environment variables:**

- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `OPENROUTER_MODEL`: Override model (e.g., `qwen/qwen-2.5-72b-instruct`)
- `OPENROUTER_BASE_URL`: Custom base URL (default: https://openrouter.ai/api/v1)

### Advanced Options

```bash
# Override backend mode
anyclaude --mode=claude          # Use real Claude API
anyclaude --mode=openrouter      # Use OpenRouter (cloud models)
anyclaude --mode=lmstudio        # Use local LMStudio

# Debug logging
ANYCLAUDE_DEBUG=1 anyclaude      # Basic debug
ANYCLAUDE_DEBUG=2 anyclaude      # Verbose
ANYCLAUDE_DEBUG=3 anyclaude      # Trace with tool calls

# Test proxy only (no Claude Code)
PROXY_ONLY=true anyclaude

# Check setup status
anyclaude --check-setup

# Test model compatibility
anyclaude --test-model
```

### Environment Variables

**LMStudio Configuration:**

- `LMSTUDIO_URL`: Server URL (default: `http://localhost:8082/v1`)
- `LMSTUDIO_MODEL`: Model name (default: `current-model`)
- `LMSTUDIO_API_KEY`: API key (default: `lm-studio`)

**Mode & Debug:**

- `ANYCLAUDE_MODE`: Backend to use (claude | lmstudio | openrouter)
- `ANYCLAUDE_DEBUG`: Debug level (0-3)
- `ANYCLAUDE_SKIP_SETUP_CHECK`: Skip dependency checks
- `PROXY_ONLY`: Run proxy without Claude Code

### Troubleshooting

**LMStudio not responding:**

```bash
# Make sure LMStudio is running with a model loaded
# Check server logs in LMStudio UI
```

**Responses are truncated mid-stream:**

- This was fixed in v3.0+ by implementing proper backpressure handling
- The fix includes:
  - Handling `res.write()` return value for backpressure
  - Adding `X-Accel-Buffering: no` header to prevent proxy buffering
  - Using `Transfer-Encoding: chunked` for proper SSE streaming
- If you see truncation, enable debug logging: `ANYCLAUDE_DEBUG=2 anyclaude`
- Look for `[Backpressure]` messages in logs to confirm fix is working

## 🔍 Analyzing Claude Code Prompts (Reverse Engineering)

When you run anyclaude in `--mode=claude` or `--mode=openrouter`, **trace logging is enabled by default**. This records every prompt, system instruction, and tool call to help you understand how Claude Code achieves good coding outcomes.

### What Gets Recorded

Full request/response traces saved to `~/.anyclaude/traces/{mode}/`:

- ✅ **Complete system prompts** - the exact instructions Claude Code uses
- ✅ **Tool definitions** - schemas for Read, Write, Edit, Bash, etc.
- ✅ **User messages** - your requests to Claude Code
- ✅ **Model responses** - how Claude responds, including tool calls
- ✅ **Tool parameters** - what arguments Claude uses when calling tools

### Viewing Traces

```bash
# Run Claude Code with tracing (enabled by default for claude/openrouter modes)
anyclaude --mode=claude

# List all trace files
ls -lht ~/.anyclaude/traces/claude/

# View latest trace (pretty-printed JSON)
cat ~/.anyclaude/traces/claude/trace-*.json | tail -1 | jq .

# Extract system prompt from latest trace
jq -r '.request.body.system' ~/.anyclaude/traces/claude/trace-*.json | tail -1

# Extract tool definitions
jq '.request.body.tools[]' ~/.anyclaude/traces/claude/trace-*.json | less

# See what tools Claude actually called
jq '.response.body.content[] | select(.type == "tool_use")' ~/.anyclaude/traces/claude/trace-*.json

# Find traces with specific tool usage
grep -l "tool_use" ~/.anyclaude/traces/claude/*.json
```

### Disable Trace Logging

If you don't want traces recorded:

```bash
# Disable for one session
ANYCLAUDE_DEBUG=0 anyclaude --mode=claude

# Or set in your shell config
export ANYCLAUDE_DEBUG=0
```

### Privacy Note

- ✅ API keys are automatically redacted from traces
- ✅ Traces are stored locally in `~/.anyclaude/traces/` (never uploaded)
- ⚠️ Your prompts and code are saved in plaintext - be mindful of sensitive data

## 🔄 Git Automation (Hooks)

Git hooks automate quality checks and prevent regressions from reaching the remote.

### Pre-commit Hook (Fast Checks)

Runs before allowing commits:

- Type checking (`npm run typecheck`)
- Format validation

**What it does**: Quick validation that you haven't introduced obvious errors

**When it runs**: `git commit` (local, before creating the commit)

### Pre-push Hook (Full Test Suite)

Runs before pushing to remote:

- Unit tests
- Integration tests
- **Regression tests** (catches streaming bugs, timeouts, etc.)

**What it does**: Comprehensive validation that code is production-ready

**When it runs**: `git push` (before uploading to GitHub)

### Enable Hooks

Hooks are configured in `.githooks/` and enabled via:

```bash
git config core.hooksPath .githooks
```

### Testing Before Push

To test without actually pushing:

```bash
# Run the full test suite manually
npm test
```
