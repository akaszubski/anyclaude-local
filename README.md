# anyclaude-local

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/akaszubski/anyclaude-local?style=social)](https://github.com/akaszubski/anyclaude-local)

**Run Claude Code with local models (mlx-lm, LMStudio) OR cheap cloud models (OpenRouter) - flexible, private, affordable**

An intelligent translation layer ported from [anyclaude](https://github.com/coder/anyclaude) for Claude Code 2.0, enabling seamless use of:

- **Local models** (vLLM-MLX, LMStudio) for 100% privacy
- **OpenRouter** for access to 400+ cloud models at fraction of Claude API cost
- **9x faster on Apple Silicon** with mlx-lm's native KV cache!

## ✨ Features

### Local Models (Privacy First)

- 🏠 **100% Local** - No cloud API keys required
- 🔒 **Privacy First** - Your code never leaves your machine
- ⚡ **vLLM-MLX Support** - Auto-launches server, prompt caching (40-50% faster), tool calling
- 🧩 **LMStudio Support** - Works with Qwen Coder, Mistral, Llama, DeepSeek

### Cloud Models (Cost Effective)

- 💰 **OpenRouter Integration** - Access 400+ models at fraction of Claude API cost
- 🌟 **GLM-4.6** - 200K context, $0.60/$2 per 1M tokens (vs Claude's $3/$15)
- 🎁 **Free Models** - Many models with free tiers available
- 📊 **Trace Logging** - Analyze Claude Code prompts to learn effective patterns

### General

- 🚀 **Simple Setup** - Running in under 5 minutes
- 🎯 **Multi-Mode** - Switch between vLLM-MLX, LMStudio, OpenRouter, and real Claude API
- 🛑 **Auto-Cleanup** - Server processes terminate cleanly when you exit
- 🐛 **Debug Friendly** - Comprehensive logging for troubleshooting
- 💻 **Global Command** - Install once, run `anyclaude` from anywhere
- 🧪 **Automated Testing** - 170+ tests with regression detection via git hooks

---

## 🆕 Latest Improvements (v2.1.0)

### ✅ Streaming Response Fixes

- **Fixed**: Message_stop safeguard now ensures responses always complete (never hang)
- **Added**: Fallback message_stop in flush() callback for edge cases
- **Impact**: Prevents Claude Code from waiting forever if AI SDK doesn't send finish event

### ✅ Regression Test Integration

- **Added**: Streaming regression tests to automated test suite
- **Improved**: `npm test` now runs both unit and regression tests
- **Impact**: Streaming bugs caught before reaching remote (via pre-push hook)

### ✅ Git Hooks Automation

- **Added**: Pre-commit hook for fast checks (type checking, formatting)
- **Added**: Pre-push hook for comprehensive testing (unit + regression + integration)
- **Configured**: `git config core.hooksPath .githooks`
- **Impact**: Developers can commit frequently, regressions caught before push

### ✅ Cache Performance Tuning

- **Increased**: vLLM-MLX cache from 32 to 256 entries (default)
- **Added**: Cache metrics tracking and monitoring
- **Added**: Deterministic tool ordering for consistent cache hits
- **Result**: 60-85% cache hit rate (vs 20-30% before), 30-50% token cost reduction

---

## 🧪 Tested Configuration

**This project was developed and tested with:**

**Hardware:**

- MacBook Pro M4 Max (Apple Silicon)
- 40 GPU cores, 16 CPU cores
- 128GB unified memory

**Models Verified Working:**

- ✅ Qwen3 Coder 30B (excellent for coding tasks)
- ✅ GPT-OSS 20B (good general purpose)
- ✅ DeepSeek Coder (various sizes)
- ✅ Mistral variants (with tool calling support)

**LMStudio:**

- Version 0.2.x+ (latest recommended)
- Models must support tool/function calling
- OpenAI Chat Completions API compatibility required

**Your Mileage May Vary:** Performance depends heavily on your specific hardware. Models requiring more VRAM than available will need quantization or won't run at all.

---

## 📦 Quick Start

### Prerequisites

- **Git** - For cloning the repository
- **Bun** ([download here](https://bun.sh)) - Required for building (faster alternative to npm)
- **Node.js** 18+ - Runtime environment (for running the built CLI)
- **LMStudio** ([download here](https://lmstudio.ai)) - Local model server
- **Claude Code** 2.0+ ([download here](https://claude.com/claude-code)) - AI coding assistant

> **Note**: Bun is required for building, but the built CLI runs on standard Node.js

### Dependencies

**Runtime dependencies** (automatically installed when you run `npm install` or `bun install`):

- **[@ai-sdk/anthropic](https://github.com/vercel-labs/ai/tree/main/packages/anthropic)** - AI SDK for Anthropic Claude API
  - Used for: Parsing real Claude API responses (in claude mode for tracing)
  - Package: `@ai-sdk/anthropic@^1.2.12`

- **[@ai-sdk/openai](https://github.com/vercel-labs/ai/tree/main/packages/openai)** - AI SDK for OpenAI-compatible servers
  - Used for: Communicating with LMStudio and mlx-lm servers
  - Package: `@ai-sdk/openai@^2.0.6`

- **[ai](https://github.com/vercel-labs/ai)** - Vercel AI SDK core library
  - Used for: Base AI model interfaces, streaming, and tool calling
  - Package: `ai@^5.0.8`

- **[json-schema](https://github.com/kriszyp/json-schema)** - JSON Schema validation
  - Used for: Validating tool input schemas
  - Package: `json-schema@^0.4.0`

- **[tiktoken](https://github.com/openai/js-tiktoken)** - Token counter for OpenAI models
  - Used for: Counting tokens in prompts for context window management
  - Package: `tiktoken@^1.0.22`

- **[uuid](https://github.com/uuidjs/uuid)** - UUID generation
  - Used for: Generating unique request/trace IDs
  - Package: `uuid@^9.0.1`

**Development dependencies** (not included in production builds):

- **@types/\*** - TypeScript type definitions for Node.js and JSON Schema
- **prettier** - Code formatter
- **zod** - Runtime type validation (for config parsing)

**Peer dependencies:**

- **[typescript](https://www.typescriptlang.org/)** `^5` - Required for building from source
  - Used for: Type checking and compilation
  - Install with: `npm install --save-peer typescript`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/akaszubski/anyclaude-local.git
cd anyclaude-local

# 2. Install dependencies
bun install

# 3. Build the project
bun run build

# 4. Install globally (makes 'anyclaude' command available everywhere)
bun install -g $(pwd)

# 5. Verify installation
which anyclaude
```

### Quick Setup (vLLM-MLX Recommended)

1. **Install vLLM-MLX dependencies** (one-time)

   ```bash
   python3 -m venv ~/.venv-mlx
   source ~/.venv-mlx/bin/activate
   pip install mlx-lm fastapi uvicorn pydantic
   ```

2. **Create `.anyclauderc.json` in your project directory:**

   ```json
   {
     "backend": "vllm-mlx",
     "backends": {
       "vllm-mlx": {
         "enabled": true,
         "port": 8081,
         "model": "/path/to/mlx-model"
       }
     }
   }
   ```

3. **Run anyclaude** (server auto-launches!)
   ```bash
   anyclaude
   ```

That's it! Server launches automatically, model loads, Claude Code starts. When you exit, everything cleans up. 🎉

### Alternative Backends

**LMStudio:**

1. Open LMStudio, download a model, click "Start Server"
2. Run: `anyclaude --mode=lmstudio`

**MLX-LM (manual start):**

1. Run: `source ~/.venv-mlx/bin/activate && python3 -m mlx_lm server --port 8081`
2. In another terminal: `anyclaude --mode=mlx-lm`

**Real Claude API:**

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxx
anyclaude --mode=claude
```

---

## ⚡ Hybrid Mode: Fast Analysis + Full Features

AnyClaude now supports 3 modes for optimal performance and features:

### Quick Start (3 modes available)

```bash
# Terminal 1: Start MLX-Omni (RECOMMENDED - has both KV cache + tools!)
export MLX_MODEL="/path/to/Qwen3-Coder-30B"
mlx-omni-server --port 8080

# Terminal 2: Run AnyClaude with MLX-Omni
ANYCLAUDE_MODE=mlx-omni ./dist/main-cli.js

# Alternative: Use MLX-LM (fast analysis only, no tools)
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081 &
MLX_LM_URL="http://localhost:8081/v1" ANYCLAUDE_MODE=mlx-lm anyclaude

# Alternative: Use LMStudio (full features, slower)
# LMStudio should be running (start in app)
LMSTUDIO_URL="http://localhost:1234/v1" ANYCLAUDE_MODE=lmstudio anyclaude
```

### Performance Comparison

| Mode            | Speed            | Tools  | KV Cache | Best For             |
| --------------- | ---------------- | ------ | -------- | -------------------- |
| **MLX-Omni** ⭐ | <1s follow-ups   | ✅ Yes | ✅ Yes   | **Analysis + Tools** |
| **MLX-LM**      | <1s follow-ups\* | ❌ No  | ✅ Yes   | Analysis only        |
| **LMStudio**    | 30s all requests | ✅ Yes | ❌ No    | Editing, git         |

_0.3-1s after first 30s request (100x faster due to KV cache)_

### Real-World Example

```
Scenario: Code review → bug fix → verification

1. "Review my code"          → MLX-LM (fast, 0.3s follow-ups)
2. "What are the bugs?"      → MLX-LM (0.3s, cached!)
3. "Fix the bugs now"        → Switch to LMStudio (has tools)
   - Edit files              → LMStudio (30s)
   - Git commit              → LMStudio (30s)
4. "Is the fix correct?"     → Switch back to MLX-LM (0.3s)

Total time: ~95 seconds with optimal modes
(vs 300+ seconds using one mode)
```

### Key Benefits

✅ **100x faster follow-ups** - KV cache (MLX-LM mode)
✅ **Full tool support** - Read, write, git, search (LMStudio mode)
✅ **Easy switching** - Just change env var, no restarts
✅ **Best of both** - Choose right tool for each task
✅ **Production-ready** - Proven in real use

### When to Use Each Mode

**MLX-LM Mode (Recommended Default)**

- Code analysis and review
- Questions about existing code
- Documentation generation
- Brainstorming and planning
- **Performance**: 0.3 seconds per follow-up! ⚡

**LMStudio Mode (When Needed)**

- File creation and editing
- Git operations
- Web search
- Test execution
- **Trade-off**: 30s per request but has all tools

### Full Documentation

See `PRODUCTION-HYBRID-SETUP.md` for complete setup guide including:

- Detailed troubleshooting
- Performance monitoring
- Environment variable reference
- Quick-start scripts
- Production checklist

---

## 🎯 How It Works

```
┌─────────────────┐
│   Claude Code   │  (Thinks it's talking to Anthropic)
└────────┬────────┘
         │ ANTHROPIC_BASE_URL → http://localhost:PORT
         ↓
┌─────────────────────────────┐
│  anyclaude-lmstudio Proxy   │
│                             │
│  1. Receive Anthropic API   │
│  2. Convert to OpenAI fmt   │
│  3. Send to LMStudio        │
│  4. Convert response back   │
│  5. Stream to Claude Code   │
└────────┬────────────────────┘
         ↓
┌─────────────────┐
│    LMStudio     │  (Local OpenAI-compatible server)
└────────┬────────┘
         ↓
┌─────────────────┐
│  Local Model    │  (Mistral, Llama, DeepSeek, etc.)
└─────────────────┘
```

**Key Innovation**: Claude Code uses the Anthropic API format, but anyclaude-lmstudio translates it to OpenAI format for LMStudio, allowing seamless local model usage.

### Source Code Structure

**Key components** (detailed in [PROJECT.md](PROJECT.md)):

- **[src/main.ts](src/main.ts)** - Entry point and mode selection
  - Spawns proxy server and optionally launches Claude Code
  - Handles configuration loading from `.anyclauderc.json`
  - Supports multiple backends (lmstudio, mlx-lm, claude)

- **[src/anthropic-proxy.ts](src/anthropic-proxy.ts)** - HTTP proxy server
  - Mimics Anthropic API on local port
  - Routes requests through appropriate converter
  - Handles streaming and keep-alive

- **[src/convert-anthropic-messages.ts](src/convert-anthropic-messages.ts)** - Format converter
  - Bidirectional: Anthropic format ↔ OpenAI format
  - Handles system prompts, messages, tool definitions, and responses

- **[src/convert-to-anthropic-stream.ts](src/convert-to-anthropic-stream.ts)** - Stream converter
  - Converts LMStudio streaming responses to Anthropic SSE format
  - Handles tool call streaming and event deduplication

- **[src/json-schema.ts](src/json-schema.ts)** - Schema adapter
  - Adapts Anthropic tool schemas to OpenAI format
  - Handles type conversions and field mappings

- **[src/debug.ts](src/debug.ts)** - Debug logging
  - Structured logging with multiple verbosity levels
  - Request/response tracing and timing

- **[src/trace-logger.ts](src/trace-logger.ts)** - Trace file management
  - Records requests/responses for analysis and replay
  - Automatic file organization and security

See [PROJECT.md](PROJECT.md) for complete architectural deep-dive and implementation details.

---

## ⚡ Performance & Model Selection

### Performance Expectations

Local models take time to process and generate responses. This is **normal behavior**, not a bug.

**What affects performance:**

- **Hardware**: GPU type, VRAM, CPU cores, RAM
- **Model size**: 7B vs 13B vs 30B+ parameters
- **Quantization**: Q4 (fastest) vs Q8 vs FP16 (slowest)
- **Context length**: Empty conversation vs 10K+ tokens already loaded
- **Prompt complexity**: Simple questions vs complex tool-calling requests

**Why can it feel slow?**

- Claude Code sends **large system prompts** (10,000+ tokens) with all tool descriptions
- Local models process tokens sequentially (not parallel like cloud APIs)
- Larger models are more capable but slower
- First response includes processing the entire system prompt

**Enable debug mode to see actual timings:**

```bash
ANYCLAUDE_DEBUG=1 anyclaude
```

This will show you real measurements like:

- `[Request Complete] lmstudio/model: 3542ms`
- `[First Chunk] after 150ms`
- Token generation speed

### Visual Indicators

When you see these in Claude Code, **everything is working correctly**:

```
⏺ Thinking...      ← Model is generating response
· Ionizing...      ← Processing large prompt (30-60s is normal)
✢ Synthesizing...  ← Streaming tokens back to you
```

**Don't panic if it takes 30-60 seconds!** The proxy sends keep-alive events to prevent timeout while LMStudio processes.

### Recommended Models for Claude Code

Based on testing with Claude Code's complex prompts and tool usage:

#### 🍎 Best for Apple Silicon (M2/M3/M4 Max/Ultra with 64GB+ RAM)

```
Model: gpt-oss-20b-MLX-8bit
Size: ~12GB
Speed: Fast with MLX optimization (10-20s prompt, 3-5 tokens/sec)
Quality: Excellent code understanding, very good with tools
Hardware: M2/M3/M4 Max with 32GB+ RAM recommended
Use: Daily development on high-end Apple Silicon

Alternative: DeepSeek-Coder-33B-Instruct-Q4
Size: ~20GB
Speed: Good (15-30s prompt, 2-4 tokens/sec)
Quality: Superior code understanding, best tool usage
Hardware: M3/M4 Max with 64GB+ RAM, or M4 Ultra
Use: Complex refactoring, architecture design, production code
```

**Why MLX models for Apple Silicon?**

- MLX is Apple's ML framework optimized for Metal GPU
- 8-bit quantization maintains quality while being GPU-friendly
- Up to 2-3x faster than GGUF on M-series chips
- Better memory efficiency with unified RAM architecture

#### Best for Speed (Recommended Starting Point)

```
Model: Qwen2.5-Coder-7B-Instruct (Quantized Q4 or Q5)
Size: ~4GB
Speed: Fast prompt processing (10-20s), decent generation
Quality: Good for coding tasks, handles tools well
Hardware: Any modern GPU with 8GB+ VRAM
Use: Daily development, quick iterations
```

#### Best for Quality (High-VRAM GPUs)

```
Model: DeepSeek-Coder-33B-Instruct (Quantized Q4)
Size: ~20GB
Speed: Slower prompt processing (30-60s), slower generation
Quality: Excellent code understanding, better tool usage
Hardware: NVIDIA RTX 3090/4090 with 24GB+ VRAM
Use: Complex refactoring, architecture design
```

#### Best Balance (General Use)

```
Model: Mistral-7B-Instruct-v0.3 (Quantized Q4)
Size: ~4GB
Speed: Good prompt processing (15-30s), good generation
Quality: Solid general-purpose, decent with tools
Hardware: Any modern GPU with 8GB+ VRAM
Use: General coding assistance
```

### 🚀 For Power Users (M4 Max/Ultra with 128GB+ RAM)

With your hardware specs (M4 Max, 40 GPU cores, 128GB RAM), you can run **much larger models** for superior quality:

```
🏆 BEST OPTION - DeepSeek-Coder-V2-Lite-Instruct-MLX-6bit
Size: ~11GB
Speed: Very fast (MLX optimized, 5-10s prompt, 5-8 tokens/sec)
Quality: State-of-the-art code understanding, excellent tool usage
Hardware: M3/M4 Max/Ultra with 64GB+ RAM
Use: Professional development, production code, complex projects

💪 MAXIMUM QUALITY - Qwen2.5-Coder-32B-Instruct-MLX-4bit
Size: ~20GB
Speed: Fast for size (15-25s prompt, 3-5 tokens/sec)
Quality: Exceptional reasoning, best-in-class for coding
Hardware: M4 Max/Ultra with 96GB+ RAM
Use: Critical production code, system architecture, security reviews

⚡ SPEED DEMON - gpt-oss-20b-MLX-8bit (Your current choice!)
Size: ~12GB
Speed: Very fast (10-20s prompt, 3-5 tokens/sec)
Quality: Excellent, well-balanced
Hardware: M2/M3/M4 Max with 32GB+ RAM
Use: Daily development, fast iterations
```

**Your M4 Max setup can handle all of these simultaneously!**

- With 96GB available for GPU, you could even run two models at once
- Switch between them for different tasks without closing LMStudio
- The 40 GPU cores will keep inference fast even with 32B models

**Where to find MLX models:**

- LMStudio → Search for models with "MLX" in the name
- HuggingFace → Look for repos with `mlx-community/` prefix
- Example: `mlx-community/Qwen2.5-Coder-32B-Instruct-4bit`

### Performance Tips

**1. Use Quantized Models (Especially MLX on Apple Silicon)**

- **Apple Silicon**: Use MLX models (4-bit, 6-bit, 8-bit) for 2-3x better performance
  - Example: `gpt-oss-20b-MLX-8bit` instead of GGUF versions
  - MLX uses Metal GPU natively, GGUF requires translation layer
  - Download from LMStudio or HuggingFace `mlx-community/` repos
- **NVIDIA/AMD**: Use GGUF Q4/Q5 quantization
  - Example: `Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf`
  - Reduces size by 4-8x with minimal quality loss
  - Download from HuggingFace models with `-GGUF` in the name

**2. Enable GPU Acceleration**

- **Apple Silicon**: Models automatically use Metal GPU, verify in Activity Monitor
  - Check "GPU" column shows usage during inference
  - No special configuration needed with MLX models
- **NVIDIA/AMD**: LMStudio Settings → GPU Offload → Set to maximum layers
  - Check GPU usage (Task Manager on Windows, nvidia-smi on Linux)
  - If GPU not detected, reinstall LMStudio or check drivers

**3. Adjust Context Length**

- Claude Code sends large prompts (10K+ tokens)
- Set LMStudio context to **16,384** or **32,768** tokens minimum
- Found in: LMStudio Server tab → Advanced → Context Length

**4. Optimize LMStudio Settings**

```
Server Settings (LMStudio → Server → Advanced):
- Context Length: 32768
- GPU Layers: Maximum (offload all to GPU)
- Threads: Match your CPU cores
- Batch Size: 512 (higher = faster prompt processing)
- Flash Attention: ON (if supported by model)
```

**5. Test Model Performance**

```bash
# Start proxy with debug to see timing
ANYCLAUDE_DEBUG=1 anyclaude

# In Claude Code, ask simple question:
"hi"

# Check debug output for timing:
[ANYCLAUDE DEBUG] [Request Complete] lmstudio/current-model: 2500ms
                                                              ^^^^^
                                                              This should be < 5s for simple prompts
```

### Model Switching for Different Tasks

You can **hot-swap models** without restarting anyclaude:

```bash
# Terminal 1: Keep anyclaude running
anyclaude

# Switch models in LMStudio for different tasks:

# Fast iterations → Qwen2.5-Coder-7B-Q4
# Stop current model, load Qwen2.5-Coder-7B-Q4, Start server

# Complex refactoring → DeepSeek-Coder-33B-Q4
# Stop current model, load DeepSeek-33B, Start server

# General coding → Mistral-7B-Instruct-Q4
# Stop current model, load Mistral-7B, Start server
```

### Troubleshooting Slow Performance

**Symptom**: "It's been 2+ minutes and still 'Ionizing...'"

**Possible Causes**:

1. **Model too large for GPU** → Check GPU memory usage
2. **CPU-only mode** → Enable GPU offload in LMStudio
3. **Low batch size** → Increase to 512 in LMStudio settings
4. **Context overflow** → Model can't handle prompt size, increase context length

**Quick Fix**:

```bash
# 1. Stop LMStudio server
# 2. Load a smaller quantized model (Q4)
# 3. Enable GPU offload (max layers)
# 4. Set context length to 32768
# 5. Restart LMStudio server
# 6. Try again in Claude Code
```

**Still slow?** Try:

- Close other GPU-intensive apps
- Use smaller model (7B instead of 13B+)
- Check LMStudio console for errors
- Verify GPU is being used (check Activity Monitor/Task Manager)

---

## ⚙️ Configuration

AnyClaude supports configuration via:

1. **Configuration file** (`.anyclauderc.json`) - Recommended for persistent settings
2. **Environment variables** - For overrides and runtime configuration
3. **CLI flags** - For one-time command-line configuration

### Configuration File (.anyclauderc.json)

Create `.anyclauderc.json` in your project root to configure both backends:

```json
{
  "backend": "mlx-lm",
  "debug": {
    "level": 0,
    "enableTraces": false,
    "enableStreamLogging": false
  },
  "backends": {
    "lmstudio": {
      "enabled": true,
      "port": 1234,
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "current-model",
      "compatibility": "legacy",
      "description": "LMStudio local model server"
    },
    "mlx-lm": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-lm",
      "model": "current-model",
      "description": "MLX Language Model with native KV cache"
    }
  }
}
```

**Configuration Priority:**

1. CLI flags (`--mode=mlx-lm`) - Highest priority
2. Environment variables (`ANYCLAUDE_MODE=lmstudio`)
3. Config file (`backend: "mlx-lm"` in `.anyclauderc.json`)
4. Defaults - Lowest priority (lmstudio)

### Environment Variables

Override specific settings via environment variables:

```bash
# Mode selection (overrides config file)
export ANYCLAUDE_MODE=mlx-lm  # or lmstudio, or claude

# LMStudio configuration
export LMSTUDIO_URL=http://localhost:1234/v1
export LMSTUDIO_MODEL=current-model
export LMSTUDIO_API_KEY=lm-studio

# MLX-LM configuration
export MLX_LM_URL=http://localhost:8081/v1
export MLX_LM_MODEL=current-model
export MLX_LM_API_KEY=mlx-lm

# Debug logging
export ANYCLAUDE_DEBUG=1  # Basic debug info
export ANYCLAUDE_DEBUG=2  # Verbose debug info

# Context window management
export LMSTUDIO_CONTEXT_LENGTH=32768

# Proxy-only mode (for testing)
export PROXY_ONLY=true
```

### CLI Flags

```bash
# Select mode via CLI (highest priority)
anyclaude --mode=mlx-lm
anyclaude --mode=lmstudio
anyclaude --mode=claude

# Test model compatibility
anyclaude --test-model
```

### Mode Switching

**NEW**: anyclaude now supports three modes for different use cases!

**Modes:**

- **`lmstudio` mode** (default): Use local LMStudio models (privacy-first, zero cloud dependency)
- **`mlx-lm` mode**: Use mlx-lm server with native KV cache (4.4x faster on Apple Silicon)
- **`claude` mode**: Use real Anthropic API with trace logging for reverse engineering

**Why use Claude mode?**

- **Reverse engineer tool schemas**: See exactly how Claude Code formats tool calls
- **Compare responses**: Understand differences between Claude API and local models
- **Improve LMStudio adapter**: Use traces to fix conversion bugs
- **Learn API format**: Study real Anthropic API requests/responses

**How to switch modes:**

```bash
# Method 1: Environment variable
export ANYCLAUDE_MODE=mlx-lm  # or lmstudio, or claude
anyclaude

# Method 2: CLI flag (takes priority over env var)
anyclaude --mode=mlx-lm

# Method 3: Default (no configuration)
anyclaude  # Uses lmstudio mode
```

### MLX-LM Mode (Apple Silicon Only)

**Why use mlx-lm mode?**

- **4.4x faster performance** with native KV cache (21s → 4.9s on subsequent requests)
- **Native Apple Silicon optimization** via MLX framework
- **Better memory efficiency** on M-series chips
- **Automatic prompt caching** without custom implementation

**Performance Comparison:**

| Backend  | First Request | Second Request | Speedup |
| -------- | ------------- | -------------- | ------- |
| LMStudio | 50s           | 44s            | 1.1x    |
| mlx-lm   | 21.6s         | 4.9s           | 4.4x    |

**Setup mlx-lm server:**

```bash
# Install via Homebrew (macOS only)
brew install mlx-lm

# Start server with KV cache enabled (--use-cache is default)
mlx_lm.server \
  --model /path/to/your/mlx-model \
  --host 0.0.0.0 \
  --port 8080 \
  --max-tokens 4096

# Example with Qwen3-Coder-30B
mlx_lm.server \
  --model /Users/you/models/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
  --port 8080
```

**Configure anyclaude for mlx-lm:**

```bash
# Set mode to mlx-lm
export ANYCLAUDE_MODE=mlx-lm

# Configure mlx-lm endpoint (optional, defaults shown)
export MLX_LM_URL=http://localhost:8080/v1
export MLX_LM_API_KEY=mlx-lm

# Set model name (use full path or model ID from server)
export MLX_LM_MODEL="mlx-community/Qwen2.5-3B-Instruct-4bit"
# or
export MLX_LM_MODEL="/Users/you/models/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"

# Run anyclaude
anyclaude --mode=mlx-lm
```

**Recommended MLX models:**

```bash
# Fast & Small (2-4GB, good for testing)
mlx-community/Qwen2.5-3B-Instruct-4bit

# Balanced (10-15GB, daily development)
mlx-community/Qwen2.5-7B-Instruct-4bit

# Best Quality (20-30GB, requires M3/M4 Max with 64GB+ RAM)
/path/to/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
```

**Where to get MLX models:**

- **HuggingFace**: Search for `mlx-community/` prefix
- **LMStudio**: Filter by "MLX" in model search
- **Convert GGUF to MLX**: Use `mlx-lm.convert` tool

**Note**: mlx-lm only works on Apple Silicon (M1/M2/M3/M4). For Intel/AMD, use `lmstudio` mode.

---

### Why mlx-lm Over LMStudio?

**The Problem with LMStudio:**

Claude Code sends **massive system prompts** on every request:

- System Prompt: ~2,300 tokens (Claude Code instructions)
- Tool Definitions: ~12,600 tokens (16 tools with full schemas)
- User Messages: ~3,500 tokens (your actual request + context)
- **Total: ~18,500 tokens per request**

**LMStudio has no native prompt caching**, so it must reprocess all 18,500 tokens every single time:

```
Request 1: Process 18,500 tokens → 50 seconds
Request 2: Process 18,500 tokens → 44 seconds
Request 3: Process 18,500 tokens → 40 seconds
...still slow even after "warmup"
```

**The mlx-lm Solution:**

mlx-lm has **native KV (Key-Value) cache** built into the server:

```
Request 1: Process 18,500 tokens → 21.6 seconds (initial cache build)
Request 2: Reuse cached 14,900 tokens → 4.9 seconds (9x faster!)
Request 3+: Reuse cache → ~4-5 seconds consistently
```

**Performance Comparison (Same Model, Same Hardware):**

| Metric              | LMStudio      | mlx-lm        | Improvement      |
| ------------------- | ------------- | ------------- | ---------------- |
| First Request       | 50s           | 21.6s         | 2.3x faster      |
| Second Request      | 44s           | 4.9s          | **9x faster**    |
| Subsequent Requests | 40s+ (varies) | 4-5s (stable) | **8-10x faster** |
| Cache Reuse         | ❌ None       | ✅ Automatic  | Critical         |

**Why This Matters:**

1. **Claude Code's design assumes prompt caching** - Real Claude API caches system prompts automatically
2. **LMStudio wasn't built for this use case** - It's designed for single-turn completions, not multi-turn agent workflows
3. **Every Claude Code request includes 12,622 tokens of tool definitions** - Without caching, this is reprocessed 100+ times per session
4. **mlx-lm makes Claude Code feel responsive** - 4-5 second responses vs 40-50 second waits

**When to Use LMStudio:**

- ✅ You're on Intel/AMD (mlx-lm requires Apple Silicon)
- ✅ You're doing single-turn completions (not agent workflows)
- ✅ You need a GUI for model management
- ⚠️ You have patience for 40-50 second responses

**When to Use mlx-lm:**

- ✅ You're on Apple Silicon (M1/M2/M3/M4)
- ✅ You want Claude Code to feel fast and responsive
- ✅ You're doing multi-turn agent workflows
- ✅ You value performance over GUI convenience

**The Technical Details:**

Claude Code sends this on **every single request**:

```json
{
  "system": "You are Claude Code... [2,300 tokens]",
  "tools": [
    {"name": "Bash", "description": "...", "input_schema": {...}},      // 2,571 tokens
    {"name": "TodoWrite", "description": "...", "input_schema": {...}}, // 2,242 tokens
    {"name": "SlashCommand", "description": "...", ...},                // 2,126 tokens
    {"name": "Task", ...},                                              // 1,237 tokens
    {"name": "Grep", ...},                                              //   729 tokens
    // ... 11 more tools
  ],
  "messages": [...]  // Your actual conversation
}
```

**Without KV cache** (LMStudio): All 18,490 tokens reprocessed every time
**With KV cache** (mlx-lm): System + tools cached, only new messages processed

This is why mlx-lm is **9x faster** - it's not magic, it's just proper caching.

---

**Claude mode requirements:**

- Set `ANTHROPIC_API_KEY` environment variable with your Anthropic API key
- Requests will be sent to real Anthropic API (costs apply!)
- All requests/responses are logged to `~/.anyclaude/traces/claude/`

**Trace logging in Claude mode:**

```bash
# Enable trace logging (automatic in Claude mode)
ANYCLAUDE_MODE=claude ANTHROPIC_API_KEY=sk-ant-... anyclaude

# View trace directory
ls ~/.anyclaude/traces/claude/

# Example trace file: 2025-10-26T14-30-45-123Z.json
{
  "timestamp": "2025-10-26T14:30:45.123Z",
  "mode": "claude",
  "request": {
    "method": "POST",
    "url": "/v1/messages",
    "headers": { ... },  // API keys redacted
    "body": { ... }      // Full Anthropic request
  },
  "response": {
    "statusCode": 200,
    "headers": { ... },
    "body": { ... }      // Full Anthropic response
  }
}
```

**Security:**

- API keys are automatically redacted from trace files
- Trace files have restrictive permissions (0600 - read/write by owner only)
- Trace directory has restrictive permissions (0700 - full access by owner only)
- Never commit trace files to version control

**Example workflow:**

```bash
# 1. Run in Claude mode to capture tool schemas
ANYCLAUDE_MODE=claude ANTHROPIC_API_KEY=sk-ant-... anyclaude

# 2. In Claude Code, ask to use a specific tool
# Example: "List all files in the current directory"

# 3. Check the trace file
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1)

# 4. Compare with LMStudio mode behavior
ANYCLAUDE_MODE=lmstudio anyclaude

# 5. Use differences to improve the LMStudio adapter
```

### Context Window Management

**NEW**: anyclaude now automatically manages context windows for local models!

**What it does:**

- **Auto-detects** model context limits (8K-128K depending on model)
- **Counts tokens** in real-time using tiktoken
- **Warns you** when approaching 75% capacity
- **Truncates automatically** when exceeding limit (keeps recent messages + system prompt + tools)
- **Logs clearly** when truncation happens

**Example output when context fills up:**

```
⚠️  Context limit exceeded! Truncated 15 older messages.
   Original: 25 messages (35,420 tokens)
   Truncated: 10 messages
   Model limit: 26,214 tokens
   Tip: Start a new conversation or set LMSTUDIO_CONTEXT_LENGTH higher
```

**Supported models** (auto-detected):

- gpt-oss-20b/120b: 131K tokens (128K native via RoPE + YaRN)
- deepseek-coder-v2-lite: 16K tokens
- deepseek-coder-33b: 16K tokens
- qwen2.5-coder-7b/32b: 32K tokens
- mistral-7b: 32K tokens
- Default (unknown models): 32K tokens (conservative)

**Note**: GPT-OSS models have a known bug with context overflow around 32K tokens
despite 128K native support. Monitor for mid-generation failures.

**Override detection:**

```bash
# Your model has 128K context but wasn't detected?
export LMSTUDIO_CONTEXT_LENGTH=131072
anyclaude
```

**How it compares to Claude Code 2:**

| Feature          | Claude Sonnet 4.5      | Local Models (anyclaude)            |
| ---------------- | ---------------------- | ----------------------------------- |
| Context Window   | 200K tokens            | 8K-128K tokens                      |
| Auto-compression | ✅ Extended thinking   | ❌ Not supported                    |
| Prompt Caching   | ✅ Cached prompts      | ❌ Not supported                    |
| Truncation       | ✅ Smart summarization | ✅ Sliding window (recent messages) |
| Warning System   | ❌ None needed         | ✅ Warns at 75%, 90%                |

**Best Practices:**

1. **Start new conversations** when you see the 90% warning
2. **Use models with larger context** for long coding sessions (32K+ recommended)
3. **Set LMSTUDIO_CONTEXT_LENGTH** if you know your model's limit
4. **Monitor warnings** - truncation loses older context

````

---

## 🔄 Hot Model Switching

**You can change models in LMStudio without restarting anyclaude!**

### How to Switch Models

1. Keep `anyclaude` running in one terminal
2. In LMStudio:
   - Stop the current model
   - Load a different model (e.g., switch from Mistral to DeepSeek)
   - Start the server again
3. Next request to Claude Code automatically uses the new model

### Why This Works

LMStudio serves whichever model is currently loaded, regardless of the model name in API requests. anyclaude uses a generic `"current-model"` name, making switching seamless.

### Testing Model Switching

```bash
# Terminal 1: Start anyclaude
anyclaude

# In Claude Code: Ask "What model are you?"
# Response: Identifies as Mistral (or whatever is loaded)

# Switch to DeepSeek in LMStudio

# In Claude Code: Ask "What model are you?" again
# Response: Identifies as DeepSeek (new model)
````

---

## 🧪 Testing & Debugging

### Automated Testing (Git Hooks)

Tests run automatically via git hooks to prevent regressions:

**Pre-commit hook** (fast, ~2 seconds):

- Type checking with TypeScript
- Code formatting validation
- Runs on `git commit` (blocks commits if issues found)

**Pre-push hook** (comprehensive, ~30-60 seconds):

- All unit tests (22 tests)
- All integration tests (50+ tests)
- **All regression tests** (streaming, timeouts, error handling)
- Runs on `git push` (blocks push if tests fail)

This ensures regressions like the streaming bug don't reach the remote.

**Test Coverage:**

- ✅ **Unit Tests** (22/22): Error handling, conversions, validation
- ✅ **Regression Tests** (5/5): Streaming, timeouts, structure validation
- ✅ **Integration Tests** (50+): Message pipeline, tool workflow, proxy cycle
- ✅ **E2E Tests** (100+): Full conversations, tool use, context management
- ✅ **Performance Tests**: Large contexts, concurrent requests, stress tests

### Run Tests Manually

```bash
# Run full test suite (what pre-push hook runs)
npm test

# Output:
# ✅ Unit tests: 22/22 passed
# ✅ Integration tests: 50+/50+ passed
# ✅ Regression (structure): 5/5 passed
# ✅ Regression (streaming): 5/5 passed
```

### Test Proxy Directly

```bash
# Start proxy without Claude Code
PROXY_ONLY=true anyclaude
# Output: Proxy only mode: http://localhost:54321

# Test with curl
curl -X POST http://localhost:54321/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Enable Debug Logging

```bash
# Basic debug info (requests, responses, timing)
ANYCLAUDE_DEBUG=1 anyclaude

# Verbose debug info (includes full request/response bodies)
ANYCLAUDE_DEBUG=2 anyclaude

# Trace debug info (tool calls and detailed streaming)
ANYCLAUDE_DEBUG=3 anyclaude
```

Debug logs include:

- Request start/completion timing
- Message conversion details
- Stream chunk processing (with message_stop guarantee)
- Cache statistics and performance metrics
- Error details with temp file dumps

---

## 🔧 Troubleshooting

### "Connection refused" or "ECONNREFUSED"

**Cause**: LMStudio server isn't running

**Fix**:

1. Open LMStudio
2. Go to "Server" tab
3. Load a model
4. Click "Start Server"
5. Verify it shows "Server running on http://localhost:1234"

### Models respond slowly or take 30-60 seconds

**This is normal!** See the [Performance & Model Selection](#-performance--model-selection) section for:

- Expected response times (30-60s for large prompts is normal)
- Recommended models for different use cases
- Performance optimization tips
- Troubleshooting slow performance

**Quick tips**:

- Use quantized models (Q4, Q5 versions)
- Enable GPU offload in LMStudio (max layers)
- Try smaller models (7B instead of 13B+)
- Increase batch size to 512 in LMStudio settings

### "Port already in use"

**Cause**: Another anyclaude instance is running

**Fix**:

```bash
# Find and kill the process
ps aux | grep anyclaude
kill <PID>

# Or restart
pkill -f anyclaude
anyclaude
```

### Debug mode not showing logs

**Cause**: Environment variable not set

**Fix**:

```bash
# Make sure to export before running
export ANYCLAUDE_DEBUG=1
anyclaude

# Or inline
ANYCLAUDE_DEBUG=1 anyclaude
```

---

## 📊 Trace Analysis & Model Benchmarking

**NEW**: Understand what Claude Code sends and benchmark different models scientifically!

anyclaude includes powerful tools for analyzing request overhead and comparing model performance:

### Quick Example

```bash
# 1. Capture a trace (with debug mode)
ANYCLAUDE_DEBUG=1 anyclaude
You: Read README.md and summarize it
# Exit after completion

# 2. Analyze what was sent
trace-analyzer analyze ~/.anyclaude/traces/lmstudio/latest.json

# Output shows:
# System Prompt:     15,432 tokens  (54%)
# Tool Definitions:  12,821 tokens  (45%)
# Messages:           1,200 tokens   (4%)
# Total Input:       28,453 tokens

# 3. Benchmark different models with the SAME request
trace-replayer replay ~/.anyclaude/traces/lmstudio/latest.json
# Switch model in LMStudio, replay again
trace-replayer replay ~/.anyclaude/traces/lmstudio/latest.json

# 4. Compare results
trace-replayer compare ./trace-replays/

# Output:
# Model                   Prompt Proc  Generation  Total    Tok/sec
# qwen3-30b@4bit             60.23s      25.18s    85.41s     5.00
# llama-3.1-8b                2.41s       6.71s     8.12s    54.06  ← 10x faster!
```

### Why Use These Tools?

- **Understand overhead**: Claude Code sends ~28K tokens per tool call (system prompt + 16 tool schemas)!
- **Find bottlenecks**: Is slowness from prompt processing (30-60s) or generation (5-50 tok/sec)?
- **Choose optimal model**: Compare models with real workloads, not synthetic benchmarks
- **Debug issues**: See exactly what's being sent when things break

### Available Commands

```bash
# List captured traces
trace-analyzer list

# Analyze a trace (shows token breakdown)
trace-analyzer analyze <trace-file>

# Analyze with full details (shows system prompt, all tools)
trace-analyzer analyze <trace-file> -v

# Compare multiple traces
trace-analyzer compare <directory>

# Replay trace to current LMStudio model
trace-replayer replay <trace-file>

# Compare replay results across models
trace-replayer compare ./trace-replays/
```

### Complete Guide

**📖 [Trace Analysis & Benchmarking Guide](docs/guides/trace-analysis-guide.md)**

Complete workflow for:

- Capturing representative traces
- Understanding token overhead
- Benchmarking models scientifically
- Interpreting performance metrics
- Choosing the optimal model for your hardware

---

## 📚 Advanced Usage

### Custom LMStudio Port

If LMStudio is running on a different port:

```bash
export LMSTUDIO_URL=http://localhost:8080/v1
anyclaude
```

### Remote LMStudio Server

Run LMStudio on a different machine:

```bash
export LMSTUDIO_URL=http://192.168.1.100:1234/v1
anyclaude
```

### Integration with Docker

```dockerfile
FROM node:18-alpine

RUN npm install -g anyclaude-lmstudio

ENV LMSTUDIO_URL=http://host.docker.internal:1234/v1

CMD ["anyclaude"]
```

---

## 🆚 Comparison with Original anyclaude

This is a **simplified fork** of the original anyclaude project.

| Feature              | Original anyclaude                       | anyclaude-local           |
| -------------------- | ---------------------------------------- | ------------------------- |
| **Cloud Providers**  | ✅ OpenAI, Google, xAI, Azure, Anthropic | ❌ None (local only)      |
| **Local Backends**   | ✅ LMStudio via failover                 | ✅ LMStudio + mlx-lm      |
| **MLX Support**      | ❌ Not supported                         | ✅ Native (9x faster)     |
| **Failover Systems** | ✅ Circuit breaker, health checks        | ❌ Removed for simplicity |
| **GPT-5 Features**   | ✅ Reasoning controls, service tiers     | ❌ Not applicable         |
| **Codebase Size**    | ~2,500 lines                             | ~1,000 lines              |
| **Setup Complexity** | Moderate (multiple providers)            | Simple (local-only)       |
| **Use Case**         | Multi-provider flexibility               | Local-first privacy       |

**Choose Original anyclaude if**: You need cloud providers, failover, or GPT-5 features

**Choose anyclaude-local if**: You want local-only, simple setup, privacy-focused usage with optimal Apple Silicon performance

---

## 🤝 Credits & Attribution

This project is a simplified fork of [anyclaude](https://github.com/coder/anyclaude) by [Coder](https://coder.com).

### Original anyclaude Features

- Multi-provider support (OpenAI, Google, xAI, Azure, Anthropic)
- Advanced failover and circuit breaker patterns
- GPT-5 reasoning effort controls
- OpenRouter integration

### This Fork (anyclaude-local)

- **Focused on**: Local models only (LMStudio, mlx-lm)
- **Removed**: Cloud provider dependencies (~1,500 lines)
- **Added**: mlx-lm support with native KV cache (9x faster on Apple Silicon)
- **Added**: Dynamic model switching without restart
- **Simplified**: Easier to maintain and understand

**All credit for the original concept and implementation goes to the anyclaude team at Coder.**

### Why Fork?

The original anyclaude is excellent for multi-provider usage, but many users wanted a **simpler, local-only solution** without cloud dependencies. This fork strips away complexity to focus on local models with optimal performance - especially on Apple Silicon via mlx-lm's native KV cache.

---

## 📖 Documentation

### Core Documentation

- **[PROJECT.md](PROJECT.md)** - Complete architectural deep-dive and translation layer design
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute
- **[CLAUDE.md](CLAUDE.md)** - Claude Code-specific instructions

### Documentation & Testing

**Testing** - Comprehensive 170+ test suite:

- [Testing Guide](docs/development/TESTING_COMPREHENSIVE.md) - Complete testing documentation
  - 100 unit tests (error handling)
  - 30 integration tests (component interaction)
  - 20 end-to-end tests (complete workflows)
  - 20 performance tests (stress & scale)
- Run with: `npm test` (auto-runs on every commit)

### Organized Guides

- **[docs/](docs/)** - Complete documentation index
  - **[Guides](docs/guides/)** - Installation, authentication, mode switching, debugging
  - **[Development](docs/development/)** - Testing, contributing, model testing
  - **[Debugging](docs/debugging/)** - Tool calling fix, trace analysis, troubleshooting
  - **[Architecture](docs/architecture/)** - Model adapters, tool enhancements, cache tuning
  - **[Reference](docs/reference/)** - Technical references, GitHub issues

### Performance Documentation

- **[Cache Performance Tuning](docs/caching/cache-performance-tuning.md)** - NEW!
  - Configure cache size for your workload
  - Monitor cache hit rates and cost savings
  - Understand cache metrics and optimization

---

## 🐛 Support & Issues

- **Issues**: [GitHub Issues](https://github.com/akaszubski/anyclaude-local/issues)
- **Discussions**: [GitHub Discussions](https://github.com/akaszubski/anyclaude-local/discussions)
- **Original Project**: [anyclaude](https://github.com/coder/anyclaude)

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

**Copyright (c) 2025 Coder Technologies Inc.** (Original anyclaude project)
**Copyright (c) 2025 akaszubski** (anyclaude-local fork)

---

## 🌟 Show Your Support

If anyclaude-local helps you build with local AI models, please:

- ⭐ Star this repo on GitHub
- ⭐ Star the [original anyclaude](https://github.com/coder/anyclaude) repo
- 🐛 Report bugs or suggest features via Issues
- 🤝 Contribute improvements via Pull Requests

---

## 🚀 What's Next?

### Completed Milestones ✅

- [x] **Automated testing** (170+ tests: unit, integration, E2E, performance) ✅ **COMPLETE**
- [x] **Git hooks automation** (pre-commit, pre-push with regression detection) ✅ **COMPLETE**
- [x] **Streaming response safeguards** (message_stop guarantee) ✅ **COMPLETE**
- [x] **Cache performance tuning** (256-entry cache, 60-85% hit rate) ✅ **COMPLETE**

### Upcoming Roadmap

- [ ] GitHub Actions CI/CD (server-side validation)
- [ ] Support for additional local model servers (Ollama, LocalAI)
- [ ] Enhanced error messages with recovery suggestions
- [ ] npm package publication (when ready for wider distribution)
- [ ] Performance benchmarking suite

### Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Code standards
- Pull request process
- Testing guidelines

---

**Built with ❤️ for the local AI community**

_Making Claude Code work with your privacy-focused, local LLMs_
