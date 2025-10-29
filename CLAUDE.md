# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

anyclaude is a translation layer for Claude Code that enables using local MLX models through the Anthropic API format. It intercepts Anthropic API calls and translates them to/from the OpenAI Chat Completions format for vLLM-MLX.

**Primary Backend**: vLLM-MLX (fast, efficient, supports tool calling and prompt caching)

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
<!-- From docs/guides/authentication.md → PROJECT.md -->

See [PROJECT.md](../../PROJECT.md) for architecture

<!-- From README.md → docs/guides/authentication.md -->

See [Authentication Guide](docs/guides/authentication.md)

<!-- From docs/debugging/tool-calling-fix.md → docs/architecture/model-adapters.md -->

See [Model Adapters](../architecture/model-adapters.md)
```

## 🔄 Keeping It Clean

If you notice files out of place:

1. Move to correct subdirectory
2. Update all internal references
3. Commit with message: `chore: organize files per standards`
4. Update this guide if standards evolve

## Architecture

The proxy works by:

1. Spawning a local HTTP server that mimics the Anthropic API
2. Intercepting `/v1/messages` requests
3. Converting Anthropic message format to OpenAI Chat Completions format
4. Routing to LMStudio (via OpenAI SDK with `compatibility: 'legacy'`)
5. Converting responses back to Anthropic format
6. Setting `ANTHROPIC_BASE_URL` to point Claude Code at the proxy

Key components:

- `src/main.ts`: Entry point that configures LMStudio provider and spawns Claude with proxy
- `src/anthropic-proxy.ts`: HTTP server that handles request/response translation
- `src/convert-anthropic-messages.ts`: Bidirectional message format conversion
- `src/convert-to-anthropic-stream.ts`: Stream response conversion
- `src/json-schema.ts`: Schema adaptation for LMStudio

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

- `LMSTUDIO_URL`: LMStudio server URL (default: `http://localhost:1234/v1`)
- `LMSTUDIO_MODEL`: Model name to use (default: `current-model`)
  - Note: LMStudio serves whatever model is currently loaded, regardless of the model name
  - You can switch models in LMStudio without restarting anyclaude
- `LMSTUDIO_API_KEY`: API key for LMStudio (default: `lm-studio`)

**Debug:**

- `ANYCLAUDE_DEBUG`: Enable debug logging (1=basic, 2=verbose, 3=trace with tool calls)
- `PROXY_ONLY`: Run proxy server without spawning Claude Code
- `ANYCLAUDE_MODE`: claude | lmstudio (default: lmstudio)

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
2. **Launch vLLM-MLX server** automatically with your model
3. **Wait for server** to load the model (~30-50 seconds)
4. **Run Claude Code** pointing to your local server
5. **Auto-cleanup** when you exit Claude Code (type `/exit`)

## Configuration & Usage

### Auto-Launch Workflow (Default)

When you run `anyclaude` with a `.anyclauderc.json` that specifies vLLM-MLX with a model path:

```bash
# .anyclauderc.json configured with vllm-mlx backend
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
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/vllm-mlx-server.py"
    },
    "lmstudio": {
      "enabled": false,
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "current-model"
    },
    "claude": {
      "enabled": false
    }
  }
}
```

**Key fields for vllm-mlx auto-launch:**
- `backend`: Set to `"vllm-mlx"` to use this backend
- `model`: Full path to your MLX model (e.g., `/Users/you/.../Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`)
  - If model path is configured, anyclaude auto-launches the server
  - If missing or set to `"current-model"`, expects server to be running already
- `port`: Where to run the server (default: 8081)

### Auto-Launch Workflow

When you run `anyclaude` with vllm-mlx configured:

1. **Check**: Is a server already running on port 8081?
2. **If no**: Auto-launch the vLLM-MLX server with your configured model
3. **Wait**: Wait for server to load the model (30-50 seconds)
4. **Launch**: Spawn Claude Code with proxy pointing to your local server
5. **Run**: Use Claude Code normally
6. **Exit**: When you exit Claude Code (type `/exit`), server shuts down automatically

### Manual Server Mode

If you want to run the server separately:

```bash
# Terminal 1: Start server manually
python3 scripts/vllm-mlx-server.py \
  --model /path/to/model \
  --port 8081

# Terminal 2: Run anyclaude (uses running server)
anyclaude
```

Or set the model to `"current-model"` in `.anyclauderc.json` to prevent auto-launch.

### Advanced Options

```bash
# Override backend mode
anyclaude --mode=claude          # Use real Claude API instead
anyclaude --mode=lmstudio        # Force LMStudio

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

**vLLM-MLX Configuration:**
- `VLLM_MLX_URL`: Server URL (default: `http://localhost:8081/v1`)
- `VLLM_MLX_MODEL`: Model name/path (overrides config file)
- `VLLM_MLX_API_KEY`: API key (default: `vllm-mlx`)

**LMStudio Configuration:**
- `LMSTUDIO_URL`: Server URL (default: `http://localhost:1234/v1`)
- `LMSTUDIO_MODEL`: Model name (default: `current-model`)
- `LMSTUDIO_API_KEY`: API key (default: `lm-studio`)

**Mode & Debug:**
- `ANYCLAUDE_MODE`: Backend to use (claude | lmstudio | vllm-mlx)
- `ANYCLAUDE_DEBUG`: Debug level (0-3)
- `ANYCLAUDE_NO_AUTO_LAUNCH`: Disable server auto-launch
- `ANYCLAUDE_SKIP_SETUP_CHECK`: Skip dependency checks
- `PROXY_ONLY`: Run proxy without Claude Code

### Troubleshooting

**Server fails to start:**
```bash
# Check server logs
tail ~/.anyclaude/logs/vllm-mlx-server.log

# Try with more debug output
ANYCLAUDE_DEBUG=2 anyclaude
```

**Port already in use:**
```bash
# Check what's using port 8081
lsof -i :8081

# Kill it if needed
kill -9 <PID>

# Or configure different port in .anyclauderc.json
```

**Server takes too long to load:**
- This is normal for large models (30-50 seconds for 30B models)
- Anyclaude waits up to 2 minutes (120 seconds)
- Check `~/.anyclaude/logs/vllm-mlx-server.log` for progress

**Responses are truncated mid-stream:**
- This was fixed in v3.0+ by implementing proper backpressure handling
- The fix includes:
  - Handling `res.write()` return value for backpressure
  - Adding `X-Accel-Buffering: no` header to prevent proxy buffering
  - Using `Transfer-Encoding: chunked` for proper SSE streaming
- For details, see: `docs/debugging/stream-truncation-fix.md`
- If you see truncation, enable debug logging: `ANYCLAUDE_DEBUG=2 anyclaude`
- Look for `[Backpressure]` messages in logs to confirm fix is working

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
