# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

anyclaude is a translation layer for Claude Code that enables using local MLX models through the Anthropic API format. It intercepts Anthropic API calls and translates them to/from the OpenAI Chat Completions format for MLX-Textgen.

**Primary Backend**: MLX-Textgen (KV caching works, but **tool calling FAILS** - unusable for Claude Code)

**⚠️ KNOWN LIMITATION**: Tool calling does not work with any local MLX models (Qwen3, OpenAI GPT OSS, Hermes-3 all fail). Use `--mode=claude` or `--mode=openrouter` for actual Claude Code work.

**Legacy Support**: LMStudio (manual connection only, no auto-launch)

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
│   ├── authentication.md
│   ├── installation-local.md
│   ├── mode-switching.md
│   └── debug-quick-start.md
├── development/                 # Development guides
│   ├── DEVELOPMENT.md
│   ├── testing-guide.md
│   ├── automated-testing.md
│   └── model-testing.md
├── debugging/                   # Debugging resources
│   ├── tool-calling-fix.md
│   ├── tool-call-debug.md
│   ├── trace-analysis.md
│   └── ...
├── architecture/                # Architecture docs
│   ├── model-adapters.md
│   └── tool-calling-enhancement.md
└── reference/                   # Technical references
    ├── claude-code-auth.md
    └── github-issues-summary.md
```

### Scripts: `scripts/`

```
scripts/
├── debug/                       # Debugging scripts
│   ├── analyze-tool-calls.sh
│   ├── capture-tool-call-debug.sh
│   ├── compare-modes.sh
│   ├── monitor-tool-calls.sh
│   ├── test-claude-mode.sh
│   ├── test-tool-capture.sh
│   └── test-tool-comparison.sh
├── test/                        # Test scripts
│   ├── run-tests.sh
│   └── test-model-compatibility.sh
└── shell-aliases.sh             # Useful aliases
```

### Source Code: `src/`

```
src/
├── main.ts                      # Entry point
├── anthropic-proxy.ts           # HTTP proxy server
├── convert-anthropic-messages.ts # Message format conversion
├── convert-to-anthropic-stream.ts # Stream conversion
├── json-schema.ts               # Schema adaptation
├── debug.ts                     # Debug logging
├── trace-logger.ts              # Trace file management
└── ...
```

### Tests: `tests/`

```
tests/
├── unit/                        # Unit tests
├── integration/                 # Integration tests
├── regression/                  # Regression tests
└── manual/                      # Manual test scripts
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

### Internal References

When linking between docs, use **relative paths**:

```markdown
<!-- From docs/guides/mode-switching.md → PROJECT.md -->

See [PROJECT.md](../../PROJECT.md) for architecture

<!-- From README.md → docs/guides/mode-switching.md -->

See [Mode Switching Guide](docs/guides/mode-switching.md)

<!-- From docs/debugging/tool-calling-fix.md → docs/architecture/tool-calling-implementation.md -->

See [Tool Calling Implementation](../architecture/tool-calling-implementation.md)
```

## 🔄 Keeping It Clean

If you notice files out of place:

1. Move to correct subdirectory
2. Update all internal references
3. Commit with message: `chore: organize files per standards`
4. Update this guide if standards evolve

## Architecture

The proxy works by:

1. Auto-launching MLX-Textgen server (production-grade MLX inference with KV caching)
2. Spawning a local HTTP server that mimics the Anthropic API
3. Intercepting `/v1/messages` requests
4. Converting Anthropic message format to OpenAI Chat Completions format
5. Routing to MLX-Textgen (or other backends like LMStudio, OpenRouter)
6. Converting responses back to Anthropic format
7. Setting `ANTHROPIC_BASE_URL` to point Claude Code at the proxy

**Performance:** MLX-Textgen provides 10-90x speedup on follow-up requests via disk-based KV caching.

Key components:

- `src/main.ts`: Entry point that configures backend provider and spawns Claude with proxy
- `src/anthropic-proxy.ts`: HTTP server that handles request/response translation
- `src/server-launcher.ts`: Auto-launch orchestration for MLX-Textgen
- `src/convert-anthropic-messages.ts`: Bidirectional message format conversion
- `src/convert-to-anthropic-stream.ts`: Stream response conversion
- `scripts/mlx-textgen-server.sh`: MLX-Textgen launcher script

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

**MLX Configuration:**

- `MLX_URL`: Server URL (default: `http://localhost:8081/v1`)
- `MLX_MODEL`: Model name/path (overrides config file)
- `MLX_API_KEY`: API key (default: `mlx`)

**Cache Warmup Configuration** (MLX only):

- `KV_CACHE_WARMUP`: Enable/disable cache warmup (default: "1" = enabled)
  - When enabled, pre-warms KV cache during server startup
  - Eliminates 30-50s cold-start penalty on first request
  - First request then runs at ~0.3-1s (same as subsequent requests)
- `WARMUP_TIMEOUT_SEC`: Timeout for cache warmup in seconds (default: 60)
  - Valid range: 1-300 seconds
  - If warmup takes longer, it will be cancelled and server will start normally
  - Graceful degradation: server starts even if warmup fails
- `WARMUP_SYSTEM_FILE`: Custom system prompt file for cache warmup (optional)
  - Must be a file in `~/.anyclaude/system-prompts/` directory
  - File size limit: 1MB maximum
  - If not specified, uses default system prompt
  - Security: All paths validated against whitelist (prevents path traversal attacks)

**LMStudio Configuration:**

- `LMSTUDIO_URL`: LMStudio server URL (default: `http://localhost:1234/v1`)
- `LMSTUDIO_MODEL`: Model name to use (default: `current-model`)
  - Note: LMStudio serves whatever model is currently loaded, regardless of the model name
  - You can switch models in LMStudio without restarting anyclaude
- `LMSTUDIO_API_KEY`: API key for LMStudio (default: `lm-studio`)

**Debug:**

- `ANYCLAUDE_DEBUG`: Enable debug logging (1=basic, 2=verbose, 3=trace with tool calls)
  - **Note**: When using `--mode=claude`, trace logging (level 3) is **enabled by default**
  - This saves full prompts and responses to `~/.anyclaude/traces/claude/` for analysis
  - To disable: `ANYCLAUDE_DEBUG=0 anyclaude --mode=claude`
- `PROXY_ONLY`: Run proxy server without spawning Claude Code
- `ANYCLAUDE_MODE`: claude | lmstudio | mlx (default: lmstudio)

## Debugging Tool Calling Issues

If a user reports tool calling problems with a local model:

1. **Ask for debug log**: `ANYCLAUDE_DEBUG=2 anyclaude` creates `~/.anyclaude/logs/debug-session-*.log`
2. **Follow the debugging guide**: `docs/debugging/gpt-oss-20b-tool-calling-issue.md`
3. **Check the log for**:
   - SESSION CONFIGURATION (model, backend, URLs)
   - Tool schemas sent to the model
   - Model's raw output (look for tool_calls vs other formats)
   - Stream conversion messages showing what format was detected

**Common issues**:

- Model outputs custom format instead of OpenAI tool calls (e.g., commentary format)
- Model not trained on tool calling
- mlx chat template not configured for tool calling
- Schema transformation issues with union types

**Known Model Limitations** (as of v2.1.1):

- **gpt-oss-20b-5bit**: ❌ Poor multi-turn tool calling
  - First tool call works fine
  - After receiving tool results, model gets confused
  - Generates invalid parameters like `{"file?":"?"}`
  - **Workaround**: Use simpler prompts (1-2 tool calls max) or switch models

- **Qwen3-Coder-30B**: ⚠️ Good for simple tools, struggles with complex schemas
  - Works well for Read, Write, Bash
  - Can fail with complex nested JSON

**Recommended Models for Tool Calling**:

- ✅ Qwen 2.5 72B (via OpenRouter)
- ✅ GLM-4.6 (via OpenRouter)
- ✅ Claude 3.5 Sonnet (via `--mode=claude`)

See `docs/debugging/gpt-oss-20b-tool-calling-issue.md` for complete debugging workflow.

## Implementation Notes

**LMStudio Compatibility:**

The proxy uses the `@ai-sdk/openai-compatible` package, which is specifically designed for OpenAI-compatible servers like LMStudio. This package:

- Properly handles LMStudio's streaming format
- Automatically manages parameter compatibility
- Uses standard OpenAI Chat Completions format
- Supports Server-Sent Events (SSE) streaming

See `src/main.ts:12-17` for the LMStudio provider configuration.

**Message Format Conversion:**

The proxy converts between two formats:

1. **Anthropic Messages API** (Claude Code format):
   - System prompts as separate field
   - Content blocks with types
   - Tool use with specific format

2. **OpenAI Chat Completions** (LMStudio format):
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
See `docs/debugging/tool-calling-fix.md` for complete tool calling investigation.

## Quick Start

```bash
# One command - does everything!
anyclaude
```

**That's it!** anyclaude will:

1. **Read config** from `.anyclauderc.json` (if it exists)
2. **Launch MLX-Textgen server** automatically with your model
3. **Wait for server** to load the model (~3-50 seconds)
4. **Run Claude Code** pointing to your local server
5. **Auto-cleanup** when you exit Claude Code (type `/exit`)

## Configuration & Usage

### Auto-Launch Workflow (Default)

When you run `anyclaude` with a `.anyclauderc.json` that specifies MLX-Textgen with a model path:

```bash
# .anyclauderc.json configured with mlx-textgen backend
anyclaude
# → Server launches automatically
# → Waits for model to load
# → Claude Code starts with local backend
# → Type /exit to exit Claude Code and cleanup server
```

### Configuration File: `.anyclauderc.json`

Create this file in your project root to configure anyclaude:

```json
{
  "backend": "mlx-textgen",
  "backends": {
    "mlx-textgen": {
      "enabled": true,
      "port": 8080,
      "baseUrl": "http://localhost:8080/v1",
      "apiKey": "mlx-textgen",
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/mlx-textgen-server.sh"
    },
    "lmstudio": {
      "enabled": false,
      "baseUrl": "http://localhost:1234/v1",
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
      "model": "z-ai/glm-4.6"
    }
  }
}
```

**See `.anyclauderc.example.json` for a complete configuration example with all backends.**
**See `.anyclauderc.example-openrouter.json` for OpenRouter-specific quick start.**

**Key fields for mlx-textgen auto-launch:**

- `backend`: Set to `"mlx-textgen"` to use this backend (production default)
- `model`: Full path to your MLX model (e.g., `/Users/you/.../Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`)
  - If model path is configured, anyclaude auto-launches the server
  - If missing or set to `"current-model"`, expects server to be running already
- `port`: Where to run the server (default: 8080)

### Auto-Launch Workflow

When you run `anyclaude` with mlx-textgen configured:

1. **Check**: Is a server already running on port 8080?
2. **If no**: Auto-launch the MLX-Textgen server with your configured model
3. **Wait**: Wait for server to load the model (3-50 seconds)
4. **Launch**: Spawn Claude Code with proxy pointing to your local server
5. **Run**: Use Claude Code normally (note: tool calling will not work with MLX models)
6. **Exit**: When you exit Claude Code (type `/exit`), server shuts down automatically

### Manual Server Mode

If you want to run the server separately:

```bash
# Terminal 1: Start server manually
scripts/mlx-textgen-server.sh \
  --model /path/to/model \
  --port 8080

# Terminal 2: Run anyclaude (uses running server)
anyclaude
```

Or set the model to `"current-model"` in `.anyclauderc.json` to prevent auto-launch.

### OpenRouter Configuration (Cloud Models)

OpenRouter provides access to 400+ AI models through a single API, including:

- **GLM-4.6** (200K context, $0.60/$2 per 1M tokens) - Great for coding
- **Qwen 2.5 72B** ($0.35/$0.70 per 1M tokens) - Even cheaper!
- **Claude 3.5 Sonnet** via OpenRouter ($3/$15 per 1M tokens)
- **GPT-4** via OpenRouter ($10/$30 per 1M tokens)
- Many open models with **free tiers**!

**Quick Start:**

1. Get an API key from [openrouter.ai](https://openrouter.ai)
2. Copy `.anyclauderc.example-openrouter.json` to `.anyclauderc.json`
3. Add your API key to the config
4. Run: `anyclaude`

**Example config:**

```json
{
  "backend": "openrouter",
  "backends": {
    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-YOUR_KEY_HERE",
      "model": "z-ai/glm-4.6"
    }
  }
}
```

**Popular models:**

- `z-ai/glm-4.6` - 200K context, excellent coding ($0.60/$2)
- `qwen/qwen-2.5-72b-instruct` - Cheaper alternative ($0.35/$0.70)
- `google/gemini-2.0-flash-exp:free` - **Free!**
- `anthropic/claude-3.5-sonnet` - Via OpenRouter
- `openai/gpt-4` - Via OpenRouter

See [openrouter.ai/models](https://openrouter.ai/models) for full list.

**Features:**

- ✅ **Trace logging enabled by default** (analyze prompts in `~/.anyclaude/traces/openrouter/`)
- ✅ Tool calling support (Read, Write, Edit, Bash, etc.)
- ✅ Streaming responses
- ✅ 200K context window (GLM-4.6)
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
anyclaude --mode=mlx-textgen     # Use local MLX-Textgen (production)
anyclaude --mode=lmstudio        # Use local LMStudio

# Debug logging
ANYCLAUDE_DEBUG=1 anyclaude      # Basic debug
ANYCLAUDE_DEBUG=2 anyclaude      # Verbose
ANYCLAUDE_DEBUG=3 anyclaude      # Trace with tool calls

# Test proxy only (no Claude Code)
PROXY_ONLY=true anyclaude

# Disable auto-launch (server must be running)
ANYCLAUDE_NO_AUTO_LAUNCH=1 anyclaude

# Check setup status
anyclaude --check-setup

# Test model compatibility
anyclaude --test-model
```

### Environment Variables

**MLX-Textgen Configuration (Production):**

- `MLX_TEXTGEN_URL`: Server URL (default: `http://localhost:8080/v1`)
- `MLX_TEXTGEN_MODEL`: Model name/path (overrides config file)
- `MLX_TEXTGEN_API_KEY`: API key (default: `mlx-textgen`)

**LMStudio Configuration:**

- `LMSTUDIO_URL`: Server URL (default: `http://localhost:1234/v1`)
- `LMSTUDIO_MODEL`: Model name (default: `current-model`)
- `LMSTUDIO_API_KEY`: API key (default: `lm-studio`)

**Mode & Debug:**

- `ANYCLAUDE_MODE`: Backend to use (claude | lmstudio | mlx-textgen | openrouter)
- `ANYCLAUDE_DEBUG`: Debug level (0-3)
- `ANYCLAUDE_NO_AUTO_LAUNCH`: Disable server auto-launch
- `ANYCLAUDE_SKIP_SETUP_CHECK`: Skip dependency checks
- `PROXY_ONLY`: Run proxy without Claude Code

### Troubleshooting

**Server fails to start:**

```bash
# Check server logs
tail ~/.anyclaude/logs/mlx-textgen-server.log

# Try with more debug output
ANYCLAUDE_DEBUG=2 anyclaude
```

**Port already in use:**

```bash
# Check what's using port 8080
lsof -i :8080

# Kill it if needed
kill -9 <PID>

# Or configure different port in .anyclauderc.json
```

**Server takes too long to load:**

- This is normal for large models (30-50 seconds for 30B models)
- Anyclaude waits up to 2 minutes (120 seconds)
- Check `~/.anyclaude/logs/mlx-textgen-server.log` for progress

**Responses are truncated mid-stream:**

- This was fixed in v3.0+ by implementing proper backpressure handling
- The fix includes:
  - Handling `res.write()` return value for backpressure
  - Adding `X-Accel-Buffering: no` header to prevent proxy buffering
  - Using `Transfer-Encoding: chunked` for proper SSE streaming
- For details, see: `docs/debugging/stream-truncation-fix.md`
- If you see truncation, enable debug logging: `ANYCLAUDE_DEBUG=2 anyclaude`
- Look for `[Backpressure]` messages in logs to confirm fix is working

## 🔍 Analyzing Claude Code Prompts (Reverse Engineering)

When you run anyclaude in `--mode=claude`, **trace logging is enabled by default**. This records every prompt, system instruction, and tool call to help you understand how Claude Code achieves good coding outcomes.

### What Gets Recorded

Full request/response traces saved to `~/.anyclaude/traces/claude/`:

- ✅ **Complete system prompts** - the exact instructions Claude Code uses
- ✅ **Tool definitions** - schemas for Read, Write, Edit, Bash, etc.
- ✅ **User messages** - your requests to Claude Code
- ✅ **Model responses** - how Claude responds, including tool calls
- ✅ **Tool parameters** - what arguments Claude uses when calling tools

### Viewing Traces

```bash
# Run Claude Code with tracing (enabled by default)
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

### Analyzing Prompting Patterns

**Study effective system prompts:**

```bash
# Extract all system prompts into one file
for f in ~/.anyclaude/traces/claude/*.json; do
  echo "=== Trace: $(basename $f) ===" >> system-prompts.txt
  jq -r '.request.body.system' "$f" >> system-prompts.txt
  echo "" >> system-prompts.txt
done
```

**Analyze tool calling patterns:**

```bash
# Find successful tool calls and their parameters
jq -r '.response.body.content[] |
  select(.type == "tool_use") |
  "\(.name): \(.input)"' ~/.anyclaude/traces/claude/*.json
```

**Compare traces from different tasks:**

```bash
# Trace from simple question
anyclaude --mode=claude  # Ask: "What is 2+2?"

# Trace from coding task
anyclaude --mode=claude  # Ask: "Write a function to reverse a string"

# Compare the system prompts and tool usage
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

```bash
# Example
git commit -m "fix: improve performance"
# → Pre-commit hook runs (fast)
# → If passes → commit created
# → If fails → commit blocked, fix required
```

### Pre-push Hook (Full Test Suite)

Runs before pushing to remote:

- Unit tests
- Integration tests
- **Regression tests** (catches streaming bugs, timeouts, etc.)

**What it does**: Comprehensive validation that code is production-ready

**When it runs**: `git push` (before uploading to GitHub)

```bash
# Example
git push origin main
# → Pre-push hook runs (slower, ~30-60 seconds)
# → If all tests pass → push succeeds
# → If tests fail → push blocked, fix required
```

### Enable Hooks

Hooks are configured in `.githooks/` and enabled via:

```bash
git config core.hooksPath .githooks
```

This should already be set up. Verify with:

```bash
git config core.hooksPath
# Should output: .githooks
```

### Testing Before Push

To test without actually pushing:

```bash
# Run the full test suite manually
npm test

# This is what the pre-push hook will run
```

### Why This Matters for Regression Tests

The streaming bug that happened was caught because:

1. Regression tests exist in the codebase
2. Pre-push hook now runs `npm test` automatically
3. Future streaming changes won't slip through because tests will fail

**Key lesson**: Always integrate regression tests into CI/CD, not just write them and hope they run.
