# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

anyclaude is a translation layer for Claude Code 2.0 that enables using LMStudio local models through the Anthropic API format. It intercepts Anthropic API calls and translates them to/from the OpenAI Chat Completions format for LMStudio.

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

## Usage

```bash
# Basic usage (uses whatever model is loaded in LMStudio)
anyclaude

# With debug logging
ANYCLAUDE_DEBUG=1 anyclaude

# Test proxy only (doesn't spawn Claude Code)
PROXY_ONLY=true anyclaude

# Use real Claude API (for comparison/debugging)
ANYCLAUDE_MODE=claude anyclaude
```

**Model Switching**: You can freely switch models in LMStudio's server tab without restarting anyclaude. The proxy always routes to whichever model is currently loaded.
