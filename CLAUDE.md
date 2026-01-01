# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**anyclaude** is a translation layer for Claude Code that enables using local models (LMStudio, MLX Cluster) or cloud models (OpenRouter) through the Anthropic API format.

**Supported Backends**:

- **LMStudio** - Single local model server with manual server management (100% privacy)
- **MLX Cluster** - Distributed MLX nodes with intelligent load balancing and cache awareness
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
4. Routing to LMStudio, MLX Cluster, or OpenRouter (with intelligent load balancing for clusters)
5. Converting responses back to Anthropic format
6. Setting `ANTHROPIC_BASE_URL` to point Claude Code at the proxy

Key components:

**TypeScript Proxy (Node.js)**:
- `src/main.ts`: Entry point that configures backend provider and spawns Claude with proxy
- `src/anthropic-proxy.ts`: HTTP server that handles request/response translation
- `src/convert-anthropic-messages.ts`: Bidirectional message format conversion
- `src/convert-to-anthropic-stream.ts`: Stream response conversion

**MLX Cluster System**:
- `src/cluster/cluster-manager.ts`: MLX cluster orchestration and load balancing
- `src/cluster/cluster-types.ts`: Type definitions for cluster operations
- `src/cluster/cluster-config.ts`: Configuration parsing and validation
- `src/cluster/cluster-discovery.ts`: Automatic node discovery with lifecycle callbacks
- `src/cluster/cluster-health.ts`: Health monitoring and circuit breaker
- `src/cluster/cluster-router.ts`: Cache-aware request routing
- `src/cluster/cluster-cache.ts`: KV cache coordination across nodes

**MLX Worker Nodes (Python)**:
- `src/mlx_worker/server.py`: FastAPI HTTP server with OpenAI-compatible endpoints
- `src/mlx_worker/inference.py`: MLX model loading and token generation
- `src/mlx_worker/cache.py`: KV cache management with state tracking
- `src/mlx_worker/health.py`: Health monitoring and metrics tracking

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

**Prompt Optimization Configuration:**

- `ANYCLAUDE_SAFE_FILTER`: Enable/disable safe system filter (true | false)
  - Default: true for LMStudio (enabled by default), false for OpenRouter/Claude
  - Enables intelligent prompt optimization that preserves tool calling
- `ANYCLAUDE_FILTER_TIER`: Optimization tier for safe filter
  - `auto`: Automatically select based on prompt size (default)
  - `minimal`: Remove only optional sections (light optimization)
  - `moderate`: Remove verbose explanations (balanced)
  - `aggressive`: Remove non-critical guidelines (heavy optimization)
  - `extreme`: Maximum reduction while preserving core instructions
- `ANYCLAUDE_SMART_PROMPT`: Enable/disable smart context-aware prompt optimization (true | false)
  - Default: false (experimental, higher risk)
  - Takes priority over safe filter if both enabled
- `ANYCLAUDE_TRUNCATE_PROMPT`: Enable/disable simple truncation as fallback (true | false)
  - Default: false
  - Used when safe filter fails validation or as last resort

**MLX Cluster Configuration:**

- `MLX_CLUSTER_ENABLED`: Enable/disable MLX clustering (true | false)
  - Default: false (clustering disabled by default)
  - When enabled, anyclaude distributes requests across multiple MLX nodes for load balancing and redundancy
- `MLX_CLUSTER_NODES`: JSON array of cluster node objects (overrides config file)
  - Format: `'[{"id":"node1","url":"http://localhost:8082/v1"},{"id":"node2","url":"http://localhost:8083/v1"}]'`
  - Each node must have `id` (string) and `url` (http/https URL) properties
  - Example: `MLX_CLUSTER_NODES='[{"id":"primary","url":"http://gpu1:8082/v1"}]'`
- `MLX_CLUSTER_STRATEGY`: Load balancing strategy (round-robin | least-loaded | cache-aware | latency-based)
  - `round-robin`: Simple rotation through healthy nodes (default)
  - `least-loaded`: Route to node with fewest active requests
  - `cache-aware`: Prefer nodes with matching system prompt cache (maximizes hit rate)
  - `latency-based`: Route to node with lowest average response time
  - Example: `MLX_CLUSTER_STRATEGY=cache-aware`
- `MLX_CLUSTER_HEALTH_INTERVAL`: Health check interval in milliseconds
  - Default: 30000 (30 seconds)
  - Must be positive integer
  - Lower values detect node failures faster but increase overhead
  - Example: `MLX_CLUSTER_HEALTH_INTERVAL=15000` (15 second checks)

**Debug:**

- `ANYCLAUDE_DEBUG`: Enable debug logging (1=basic, 2=verbose, 3=trace with tool calls)
  - **Note**: When using `--mode=claude` or `--mode=openrouter`, trace logging (level 3) is **enabled by default**
  - This saves full prompts and responses to `~/.anyclaude/traces/` for analysis
  - To disable: `ANYCLAUDE_DEBUG=0 anyclaude --mode=claude`
  - For safe filter debugging: `ANYCLAUDE_DEBUG=2 anyclaude` shows filter stats and validation results
  - For detailed trace: `ANYCLAUDE_DEBUG=3 anyclaude` shows full prompt sections and preserved/removed sections
- `PROXY_ONLY`: Run proxy server without spawning Claude Code
- `ANYCLAUDE_MODE`: claude | lmstudio | openrouter | mlx-cluster (default: lmstudio)

## Implementation Notes

**LMStudio Compatibility:**

The proxy uses the `@ai-sdk/openai-compatible` package, which is specifically designed for OpenAI-compatible servers like LMStudio. This package:

- Properly handles LMStudio's streaming format
- Automatically manages parameter compatibility
- Uses standard OpenAI Chat Completions format
- Supports Server-Sent Events (SSE) streaming
- **Enables llama.cpp's `cache_prompt` parameter** for automatic prompt caching

**Native Prompt Caching (llama.cpp):**

Instead of building complex optimization systems, anyclaude now uses **llama.cpp's built-in `cache_prompt` parameter** (`src/main.ts:282-285`):

```typescript
// Automatically enabled for all LMStudio requests
body.cache_prompt = true;
```

This tells LMStudio to:
- ✅ Cache the system prompt + conversation history
- ✅ Reuse cached prefixes across requests
- ✅ Only process new user messages
- ✅ Dramatically reduce processing time for long conversations

**Result:** No manual optimization needed - LMStudio handles caching automatically!

See `src/main.ts:264-345` for the LMStudio provider configuration.

**~~Adaptive Prompt Optimization~~ (DEPRECATED - Use Native Caching Instead):**

**⚠️ DEPRECATED**: The custom prompt optimization system has been replaced with **native llama.cpp caching** via the `cache_prompt` parameter.

**Why deprecated:**
- Custom optimization broke tool calling by removing critical instructions
- Adds complexity and maintenance burden
- llama.cpp's native caching is simpler and more reliable
- No need to reduce prompt size when caching works properly

**Use llama.cpp's `cache_prompt` instead** (automatically enabled in anyclaude).

**Safe System Filter (Issue #21):**

The safe system filter provides intelligent prompt optimization that preserves critical sections like tool calling:

- **Located in**: `src/safe-system-filter.ts` with proxy integration in `src/anthropic-proxy.ts:54-131`
- **Optimization Tiers**:
  - `MINIMAL`: Removes only optional sections (comments, examples)
  - `MODERATE`: Also removes verbose explanations
  - `AGGRESSIVE`: Removes non-critical guidelines and formatting
  - `EXTREME`: Aggressive reduction while preserving core identity and tool instructions
- **Safety**: Validates that critical sections (tool calling, function definitions) are preserved
- **Auto-tier selection**: Based on prompt size (configurable)
- **Fallback behavior**: Falls back to truncation if validation fails
- **Debug logging**: Three levels of detail (basic stats, validation details, full trace)

**When to use Safe Filter vs Other Methods**:
- **Native Caching** (`cache_prompt`): Use when prompt is stable (default for LMStudio)
- **Safe Filter** (`safeSystemFilter`): Use for long prompts that need reduction while preserving tool calling
- **Truncation** (`truncateSystemPrompt`): Use as fallback or simple size reduction
- **Smart Prompt** (`smartSystemPrompt`): Use for context-aware optimization (experimental, higher risk)

See `src/safe-system-filter.ts` and tests/integration/anthropic-proxy-safe-filter-integration.test.js for details.

**Optimization Chain Priority** (in anthropic-proxy.ts):
1. **Smart Prompt** (highest priority, experimental): Full rewrite based on context
2. **Safe Filter**: Intelligent section removal with validation
3. **Truncation**: Simple size-based reduction
4. **Passthrough** (default): No optimization

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
anyclaude --mode=mlx-cluster     # Use MLX cluster (distributed local models)

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

- `ANYCLAUDE_MODE`: Backend to use (claude | lmstudio | openrouter | mlx-cluster)
- `ANYCLAUDE_DEBUG`: Debug level (0-3)
- `ANYCLAUDE_SKIP_SETUP_CHECK`: Skip dependency checks
- `PROXY_ONLY`: Run proxy without Claude Code

### Troubleshooting

**LMStudio not responding:**

```bash
# Make sure LMStudio is running with a model loaded
# Check server logs in LMStudio UI
```

**Tool calling broken (model outputs weird syntax like `<|channel|>`):**

If you see output like:
```
<|channel|>commentary to=functions/Glob <|constrain|>json<|message|>{"pattern":"README.md"}
```

**Most common cause:** You have `smartSystemPrompt: true` enabled, which is experimental and can break tool calling.

**Quick fix:**
```bash
# Disable optimization in .anyclauderc.json
"smartSystemPrompt": false
```

**Other possible causes:**
1. **Model doesn't support OpenAI function calling:**
   - ✅ **Qwen2.5-Coder** (7B, 14B, 32B) - Excellent tool calling support
   - ✅ **DeepSeek-R1** - Good function calling
   - ✅ **Llama-3.3** (70B) - Solid tool calling
   - ❌ Avoid generic `-instruct` models without function calling training

2. **Switch to OpenRouter for guaranteed compatibility:**
   ```bash
   anyclaude --mode=openrouter  # Uses Gemini/Qwen with native tool calling
   ```

**Debug tool calling:**
```bash
# Check if optimization is enabled
grep "smartSystemPrompt" .anyclauderc.json

# Run with debug logging
ANYCLAUDE_DEBUG=2 anyclaude

# Check what tools are being sent
grep "Tool Calling" ~/.anyclaude/logs/debug-*.log
```

**Debugging client-server communication:**

LMStudio server logs are stored in `~/.lmstudio/server-logs/`. This is invaluable for debugging:

```bash
# View latest LMStudio server log
tail -f ~/.lmstudio/server-logs/server-*.log

# Compare what anyclaude sends vs what LMStudio receives
ANYCLAUDE_DEBUG=3 anyclaude  # Client-side traces in ~/.anyclaude/traces/
tail -f ~/.lmstudio/server-logs/server-*.log  # Server-side logs

# Example: Debug prompt optimization
# 1. Run with trace logging: ANYCLAUDE_DEBUG=3 anyclaude
# 2. Check client request: cat ~/.anyclaude/traces/lmstudio/*.json | jq '.request.body.system'
# 3. Check server received: grep -A 50 "system" ~/.lmstudio/server-logs/server-*.log
```

**Responses are truncated mid-stream:**

- This was fixed in v3.0+ by implementing proper backpressure handling
- The fix includes:
  - Handling `res.write()` return value for backpressure
  - Adding `X-Accel-Buffering: no` header to prevent proxy buffering
  - Using `Transfer-Encoding: chunked` for proper SSE streaming
- If you see truncation, enable debug logging: `ANYCLAUDE_DEBUG=2 anyclaude`
- Look for `[Backpressure]` messages in logs to confirm fix is working

**LMStudio cache warnings ("Cache is not trimmable"):**

LMStudio's MLX backend doesn't support partial cache trimming - it can only clear the entire cache. This causes warnings like:

```
[cache_wrapper][WARNING]: Tried to trim 'XXXX' tokens from the prompt cache,
but could not: Cache is not trimmable. Clearing the cache instead.
```

**What this means:**
- Claude Code's system prompt (~12-20k tokens) is too large for MLX's cache
- On each turn, MLX must clear and rebuild the entire cache
- This slows down prompt processing and wastes memory

**Solution: System Prompt Truncation (LMStudio only)**

anyclaude automatically truncates the Claude Code system prompt **only for LMStudio** to reduce cache pressure.

**Why only LMStudio?**
- ✅ **OpenRouter/Claude**: Have production-grade prompt caching that handles 12-20k token prompts efficiently
- ❌ **LMStudio (MLX)**: Has non-trimmable cache that must be fully cleared, causing performance issues

Truncation is automatically applied:

```json
{
  "backends": {
    "lmstudio": {
      "truncateSystemPrompt": true,    // Default: true
      "systemPromptMaxTokens": 2000    // Default: 2000 (~8000 chars)
    }
  }
}
```

**What gets truncated:**
- ✅ Keeps core identity and critical instructions (first 50 lines)
- ✅ Preserves important sections: "Tool usage policy", "Doing tasks", etc.
- ✅ Reduces ~12-20k tokens → ~2k tokens
- ✅ Adds note explaining truncation

**Results:**
- Faster prompt processing (10-20x less to reprocess)
- Lower memory usage
- Better cache utilization
- Cache warnings still appear (MLX limitation), but with much smaller prompts

**To disable truncation:**
```json
{
  "backends": {
    "lmstudio": {
      "truncateSystemPrompt": false
    }
  }
}
```

**To see truncation in action:**
```bash
ANYCLAUDE_DEBUG=1 anyclaude
# Look for: [System Prompt] Truncated from X to Y characters
```

**Note:** The cache warning itself cannot be eliminated - it's a fundamental limitation of MLX's architecture. The truncation just makes the cache clears much less expensive.

**Safe System Filter (Issue #21) - Validation Failed or Unexpected Behavior:**

If you see messages like "Safe filter validation failed, falling back to truncate":

**What this means:**
- The filter detected that removing certain sections might break tool calling or critical instructions
- This is a safety measure - the filter preserved the full prompt rather than risk breaking functionality
- The system fell back to truncation instead

**Debug the filter:**

```bash
# View filter statistics and validation results
ANYCLAUDE_DEBUG=2 anyclaude

# View detailed filter behavior with section analysis
ANYCLAUDE_DEBUG=3 anyclaude

# Look for these messages:
# [Safe Filter] Applied tier MODERATE | 10000 → 5000 tokens (50.0% reduction)
# [Safe Filter] Validation: isValid=true, presentPatterns=8, missingPatterns=0
```

**Adjust optimization tier:**

```json
{
  "backends": {
    "lmstudio": {
      "safeSystemFilter": true,
      "filterTier": "minimal"  // Try lighter tier first
    }
  }
}
```

**If safe filter breaks tool calling:**

```bash
# Disable safe filter and use truncation instead
# In .anyclauderc.json:
{
  "backends": {
    "lmstudio": {
      "safeSystemFilter": false,
      "truncateSystemPrompt": true
    }
  }
}

# Or via environment variable:
ANYCLAUDE_SAFE_FILTER=false anyclaude
```

**Compare optimization strategies:**

```bash
# Test with safe filter (default for LMStudio)
ANYCLAUDE_DEBUG=2 anyclaude

# Test with truncation only
ANYCLAUDE_SAFE_FILTER=false ANYCLAUDE_DEBUG=2 anyclaude

# Test with no optimization
ANYCLAUDE_SAFE_FILTER=false ANYCLAUDE_TRUNCATE_PROMPT=false ANYCLAUDE_DEBUG=2 anyclaude
```

### Backend Comparison: Prompt Caching Capabilities

| Backend | Prompt Caching | Max System Prompt | Truncation Needed? |
|---------|---------------|-------------------|-------------------|
| **LMStudio (MLX)** | ❌ Non-trimmable cache | ~2-4k tokens practical | ✅ **YES** (enabled by default) |
| **MLX Cluster** | ✅ Cache-aware routing | ~4-8k tokens practical | ⚠️ Optional (per-node truncation) |
| **OpenRouter (Gemini)** | ✅ Automatic caching | 1M+ tokens | ❌ NO (full prompt sent) |
| **OpenRouter (Claude)** | ✅ Prompt caching API | 200k+ tokens | ❌ NO (full prompt sent) |
| **OpenRouter (GPT-4)** | ✅ Smart caching | 128k+ tokens | ❌ NO (full prompt sent) |
| **Claude API** | ✅ Prompt caching API | 200k+ tokens | ❌ NO (full prompt sent) |

**Recommendation**: Use OpenRouter for best experience with Claude Code's long system prompts. MLX Cluster is ideal for distributed local models with intelligent cache routing. LMStudio is suitable for single-node setups but requires truncation.

## MLX Worker Nodes for Distributed Inference

The MLX worker nodes (Python/FastAPI) enable distributed inference across multiple machines with intelligent load balancing, cache coordination, and health monitoring.

### MLX Worker Architecture

**Worker Nodes** are production Python servers that:
- Run on any machine with Python 3.8+ and MLX support
- Provide OpenAI-compatible `/v1/chat/completions` endpoint
- Track health metrics and cache state for cluster routing decisions
- Enable warm cache coordination with other nodes

**Key Features**:
- OpenAI-compatible API (drop-in replacement for LMStudio)
- Health monitoring with circuit breaker (GET /health)
- KV cache state tracking and warming (GET /cache, POST /cache/warm)
- Session ID support for sticky session routing
- Thread-safe singleton cache manager and health monitor
- Comprehensive metrics (latency, error rate, cache hit rate, in-flight requests)

### Setting Up MLX Worker Nodes

**Requirements**:
- Python 3.8+
- MLX (Apple Silicon recommended, but works on other platforms)
- FastAPI and uvicorn
- See `src/mlx_worker/requirements.txt` for complete dependencies

**1. Create Virtual Environment**:

```bash
# Create Python virtual environment
python3 -m venv mlx-worker-env
source mlx-worker-env/bin/activate  # or mlx-worker-env\Scripts\activate on Windows

# Install dependencies
pip install -r src/mlx_worker/requirements.txt

# Optionally, download a model for testing
python -m mlx_lm.convert qwen/qwen2.5-0.5b  # Small model for testing
```

**2. Start Worker Node**:

```bash
# Start on default port 8081
python -m uvicorn src.mlx_worker.server:app --host 0.0.0.0 --port 8081

# Or with multiple workers
python -m uvicorn src.mlx_worker.server:app --host 0.0.0.0 --port 8081 --workers 4

# Or use the module directly
cd src && python -m mlx_worker.server
```

**3. Test Worker Node**:

```bash
# Health check
curl http://localhost:8081/health

# List available models
curl http://localhost:8081/v1/models

# Chat completion
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "max_tokens": 100
  }'

# Warm cache with system prompt
curl -X POST http://localhost:8081/cache/warm \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "You are a helpful assistant."}'
```

### MLX Worker Configuration

**Worker Environment Variables** (optional):

```bash
# Server configuration
MLX_PORT=8081                    # Server port (default: 8081)
MLX_HOST=0.0.0.0                # Server host (default: 0.0.0.0)

# Model configuration
MLX_MODEL_PATH="./models/qwen"   # Path to MLX model directory
MLX_CACHE_SIZE=256               # KV cache size in entries (default: 256)

# Debug
ANYCLAUDE_DEBUG=1                # Enable debug logging (1-3 for levels)
```

### MLX Worker Endpoints

**1. POST /v1/chat/completions** - OpenAI-compatible completions

```bash
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: user-session-123" \
  -d '{
    "model": "current-model",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain quantum computing."}
    ],
    "max_tokens": 500,
    "temperature": 0.7,
    "top_p": 0.9,
    "stream": false
  }'
```

**Response** (non-streaming):
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1735334400,
  "model": "current-model",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "...response..."},
    "finish_reason": "stop"
  }]
}
```

**Streaming Response** (stream=true):
- Yields SSE events (text/event-stream)
- Each chunk: `data: {json}\n\n`
- Final chunk: `data: [DONE]\n\n`

**2. GET /health** - Health check and metrics

```bash
curl http://localhost:8081/health
```

**Response**:
```json
{
  "status": "healthy",  // "healthy" | "degraded" | "unhealthy"
  "health": {
    "lastCheck": 1735334400000,
    "consecutiveFailures": 0,
    "avgResponseTime": 250.5,
    "errorRate": 0.0
  },
  "cache": {
    "tokens": 2048,
    "systemPromptHash": "abc123...",
    "lastUpdated": 1735334400000
  },
  "metrics": {
    "requestsInFlight": 0,
    "totalRequests": 150,
    "cacheHitRate": 0.72,
    "avgLatency": 250.5
  }
}
```

**3. GET /cache** - Get current cache state

```bash
curl http://localhost:8081/cache
```

**4. POST /cache/warm** - Warm cache with system prompt

```bash
curl -X POST http://localhost:8081/cache/warm \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "You are a coding assistant..."}'
```

### Cluster Integration

Worker nodes integrate with MLX Cluster via:

1. **Discovery**: Nodes register via discovery system (IP/port) or manual config
2. **Health Checks**: Cluster checks GET /health endpoint periodically
3. **Cache Coordination**: Cluster tracks cache state from GET /cache
4. **Load Balancing**: Cluster routes requests based on:
   - Cache hit likelihood (system prompt hash matching)
   - Node health (error rate, latency, failures)
   - In-flight request count (least-loaded strategy)
   - Response latency (latency-based strategy)

**Configuration Example** (`mlx-cluster.json`):

```json
{
  "discovery": {
    "mode": "static",
    "nodes": [
      {"id": "worker-1", "url": "http://gpu1:8081"},
      {"id": "worker-2", "url": "http://gpu2:8081"},
      {"id": "worker-3", "url": "http://gpu3:8081"}
    ]
  },
  "routing": {
    "strategy": "cache-aware",
    "maxRetries": 2,
    "retryDelayMs": 100
  },
  "health": {
    "checkIntervalMs": 30000,
    "timeoutMs": 5000,
    "maxConsecutiveFailures": 3,
    "unhealthyThreshold": 0.5
  },
  "cache": {
    "maxCacheAgeSec": 3600,
    "maxCacheSizeTokens": 1000000,
    "minCacheHitRate": 0.7
  }
}
```

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
