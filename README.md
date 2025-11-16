# anyclaude-local

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/akaszubski/anyclaude-local?style=social)](https://github.com/akaszubski/anyclaude-local)

**Run Claude Code with local MLX models OR cheap cloud models - your choice of 100% privacy or 84% cost savings**

An enhanced port of [anyclaude](https://github.com/coder/anyclaude) for Claude Code 2.0, enabling seamless use of:

- **Local models** (vLLM-MLX auto-launch, LMStudio) for 100% privacy
- **OpenRouter** for access to 400+ cloud models at 84% lower cost than Claude API
- **Fast inference on Apple Silicon** with vLLM-MLX's automatic prompt caching

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
- 🧪 **Automated Testing** - 1,400+ tests across 60 files with regression detection via git hooks

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
  - Used for: Communicating with LMStudio and vLLM-MLX servers
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

**vLLM-MLX (manual start, if not using auto-launch):**

1. Run: `source ~/.venv-mlx/bin/activate && python3 scripts/vllm-mlx-server.py --model /path/to/model --port 8081`
2. In another terminal: `anyclaude --mode=vllm-mlx`

**Real Claude API:**

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxx
anyclaude --mode=claude
```

---

## ⚡ Four Backend Modes: Choose Your Workflow

AnyClaude supports **4 modes** to fit your workflow - from free local privacy to cheap cloud models:

### Quick Start (4 modes available)

```bash
# MODE 1: vLLM-MLX (default, recommended for Apple Silicon)
# Auto-launches server with prompt caching
anyclaude  # Uses .anyclauderc.json config

# MODE 2: LMStudio (cross-platform local)
# Start LMStudio first, then:
anyclaude --mode=lmstudio

# MODE 3: OpenRouter (cheap cloud, 400+ models)
# 84% cheaper than Claude API
export OPENROUTER_API_KEY="sk-or-v1-..."
anyclaude --mode=openrouter

# MODE 4: Claude API (official, with trace logging)
# Uses your Claude Max subscription or API key
anyclaude --mode=claude
```

### Mode Comparison

| Mode            | Cost                   | Privacy    | Tools  | Cache   | Best For                |
| --------------- | ---------------------- | ---------- | ------ | ------- | ----------------------- |
| **vLLM-MLX** ⭐ | Free                   | 100% local | ✅ Yes | ✅ Yes  | **Apple Silicon users** |
| **LMStudio**    | Free                   | 100% local | ✅ Yes | Limited | **Cross-platform**      |
| **OpenRouter**  | $0.60-$2/1M (84% less) | Cloud      | ✅ Yes | ✅ Yes  | **Cost savings**        |
| **Claude API**  | $3-$15/1M              | Cloud      | ✅ Yes | ✅ Yes  | **Premium quality**     |

### Cost Example (50K input + 10K output tokens)

- **vLLM-MLX**: $0 (free, local)
- **LMStudio**: $0 (free, local)
- **OpenRouter (GLM-4.6)**: $0.05 (84% cheaper!)
- **Claude API**: $0.30 (premium)

### When to Use Each Mode

**vLLM-MLX (Default)**

- Privacy-first development (100% local)
- Apple Silicon users (M1/M2/M3)
- Fast iteration with prompt caching
- Auto-launch convenience

**LMStudio**

- Windows/Linux users
- GUI model management
- Testing different models
- Privacy-focused development

**OpenRouter**

- Cost-conscious cloud development
- Model experimentation (GLM-4.6, Qwen, etc.)
- When you need cloud but want to save 84%
- Reverse-engineering Claude prompts (auto trace logging)

**Claude API**

- Highest quality responses
- Debugging local model behavior
- Learning Claude Code's patterns
- When cost isn't a concern

### Switching Modes

```bash
# Via CLI flag (overrides config)
anyclaude --mode=openrouter

# Via environment variable
export ANYCLAUDE_MODE=claude
anyclaude

# Via config file (.anyclauderc.json)
{
  "backend": "vllm-mlx",  // Change this
  "backends": { ... }
}
```

### Full Documentation

- **[Mode Switching Guide](docs/guides/mode-switching.md)** - Complete guide to all 4 modes
- **[OpenRouter Setup](docs/guides/openrouter-setup.md)** - Access 400+ models cheaply
- **[Authentication Guide](docs/guides/authentication.md)** - API keys for cloud modes
- **[Trace Analysis](docs/guides/trace-analysis.md)** - Analyze Claude Code prompts

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
  - Supports multiple backends (vllm-mlx, lmstudio, openrouter, claude)

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

Create `.anyclauderc.json` in your project root to configure backends:

```json
{
  "backend": "vllm-mlx",
  "debug": {
    "level": 0,
    "enableTraces": false,
    "enableStreamLogging": false
  },
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/vllm-mlx-server.py",
      "description": "vLLM-MLX with auto-launch and prompt caching"
    },
    "lmstudio": {
      "enabled": false,
      "port": 1234,
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "current-model",
      "compatibility": "legacy",
      "description": "LMStudio local model server"
    },
    "openrouter": {
      "enabled": false,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-YOUR_API_KEY_HERE",
      "model": "z-ai/glm-4.6",
      "description": "OpenRouter - 400+ cloud models"
    }
  }
}
```

**Configuration Priority:**

1. CLI flags (`--mode=vllm-mlx`) - Highest priority
2. Environment variables (`ANYCLAUDE_MODE=vllm-mlx`)
3. Config file (`backend: "vllm-mlx"` in `.anyclauderc.json`)
4. Defaults - Lowest priority (vllm-mlx)

### Environment Variables

Override specific settings via environment variables:

```bash
# Mode selection (overrides config file)
export ANYCLAUDE_MODE=vllm-mlx  # or lmstudio, openrouter, or claude

# vLLM-MLX configuration
export VLLM_MLX_URL=http://localhost:8081/v1
export VLLM_MLX_MODEL=/path/to/your/mlx/model
export VLLM_MLX_API_KEY=vllm-mlx

# LMStudio configuration
export LMSTUDIO_URL=http://localhost:1234/v1
export LMSTUDIO_MODEL=current-model
export LMSTUDIO_API_KEY=lm-studio

# OpenRouter configuration
export OPENROUTER_API_KEY=sk-or-v1-...
export OPENROUTER_MODEL=z-ai/glm-4.6
export OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Debug logging
export ANYCLAUDE_DEBUG=1  # Basic debug info
export ANYCLAUDE_DEBUG=2  # Verbose debug info
export ANYCLAUDE_DEBUG=3  # Trace with full prompts

# Context window management
export LMSTUDIO_CONTEXT_LENGTH=32768

# Proxy-only mode (for testing)
export PROXY_ONLY=true
```

### CLI Flags

```bash
# Select mode via CLI (highest priority)
anyclaude --mode=vllm-mlx
anyclaude --mode=lmstudio
anyclaude --mode=openrouter
anyclaude --mode=claude

# Test model compatibility
anyclaude --test-model
```

### Mode Switching

**NEW**: anyclaude now supports four modes for different use cases!

**Modes:**

- **`vllm-mlx` mode** (default): Auto-launch vLLM-MLX server with prompt caching (Apple Silicon optimized)
- **`lmstudio` mode**: Use local LMStudio models (privacy-first, zero cloud dependency, cross-platform)
- **`openrouter` mode**: Use cloud models via OpenRouter (400+ models, 84% cheaper than Claude API)
- **`claude` mode**: Use real Anthropic API with trace logging for reverse engineering

**Why use Claude mode?**

- **Reverse engineer tool schemas**: See exactly how Claude Code formats tool calls
- **Compare responses**: Understand differences between Claude API and local models
- **Improve LMStudio adapter**: Use traces to fix conversion bugs
- **Learn API format**: Study real Anthropic API requests/responses

**How to switch modes:**

```bash
# Method 1: Environment variable
export ANYCLAUDE_MODE=vllm-mlx  # or lmstudio, openrouter, or claude
anyclaude

# Method 2: CLI flag (takes priority over env var)
anyclaude --mode=vllm-mlx

# Method 3: Config file (.anyclauderc.json)
# Set "backend": "vllm-mlx" in .anyclauderc.json

# Method 4: Default (no configuration)
anyclaude  # Uses vllm-mlx mode
```

### vLLM-MLX Mode (Apple Silicon Optimized)

**Why use vllm-mlx mode (default)?**

- **Auto-launch**: Server starts automatically when you run `anyclaude`
- **Prompt caching**: Built-in KV cache for 10-100x speedup on follow-up requests
- **Native Apple Silicon optimization** via MLX framework
- **200K context window** (model-dependent)
- **Auto-cleanup**: Server terminates when you exit Claude Code

**Performance Benefits:**

- First request: ~20-30s (includes prompt processing)
- Subsequent requests: ~5-10s (cached system prompts and tools)
- No manual server management required
- Automatic model loading from configured path

**Setup (one-time):**

```bash
# 1. Install Python dependencies
python3 -m venv ~/.venv-mlx
source ~/.venv-mlx/bin/activate
pip install mlx-lm fastapi uvicorn pydantic

# 2. Configure .anyclauderc.json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "model": "/path/to/your/mlx/model"
    }
  }
}

# 3. Run anyclaude (server auto-launches!)
anyclaude
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
- Download pre-quantized 4-bit models for best performance

**Manual server control (optional):**

```bash
# Start server manually (if ANYCLAUDE_NO_AUTO_LAUNCH=true)
source ~/.venv-mlx/bin/activate
python3 scripts/vllm-mlx-server.py --model /path/to/model --port 8081

# In another terminal
anyclaude --mode=vllm-mlx
```

**Note**: vLLM-MLX only works on Apple Silicon (M1/M2/M3/M4). For Intel/AMD, use `lmstudio` mode.

---

### Why vLLM-MLX Over LMStudio?

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

**The vLLM-MLX Solution:**

vLLM-MLX has **built-in KV (Key-Value) cache** that automatically caches prompts:

```
Request 1: Process 18,500 tokens → 20-30s (initial cache build)
Request 2: Reuse cached prompts → 5-10s (3-6x faster!)
Request 3+: Reuse cache → ~5-10s consistently
```

**Performance Comparison (Same Model, Same Hardware):**

| Metric              | LMStudio      | vLLM-MLX       | Improvement     |
| ------------------- | ------------- | -------------- | --------------- |
| First Request       | 50s           | 20-30s         | 2x faster       |
| Second Request      | 44s           | 5-10s          | **4-9x faster** |
| Subsequent Requests | 40s+ (varies) | 5-10s (stable) | **4-8x faster** |
| Cache Reuse         | ❌ None       | ✅ Automatic   | Critical        |
| Auto-launch         | ❌ Manual     | ✅ Yes         | Convenience     |

**Why This Matters:**

1. **Claude Code's design assumes prompt caching** - Real Claude API caches system prompts automatically
2. **LMStudio wasn't built for this use case** - It's designed for single-turn completions, not multi-turn agent workflows
3. **Every Claude Code request includes 12,622 tokens of tool definitions** - Without caching, this is reprocessed 100+ times per session
4. **vLLM-MLX makes Claude Code feel responsive** - 5-10 second responses vs 40-50 second waits
5. **Auto-launch eliminates manual server management** - Just run `anyclaude` and it handles everything

**When to Use LMStudio:**

- ✅ You're on Intel/AMD (vLLM-MLX requires Apple Silicon)
- ✅ You need a GUI for model management
- ✅ You want to hot-swap models frequently
- ⚠️ You have patience for 40-50 second responses

**When to Use vLLM-MLX:**

- ✅ You're on Apple Silicon (M1/M2/M3/M4)
- ✅ You want Claude Code to feel fast and responsive
- ✅ You prefer automatic server management
- ✅ You value performance and convenience

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
**With KV cache** (vLLM-MLX): System + tools cached, only new messages processed

This is why vLLM-MLX is **4-9x faster** - it's not magic, it's proper caching plus auto-launch.

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

This is an **enhanced port** of the original anyclaude project, adapted for Claude Code 2.0.

| Feature              | Original anyclaude                       | anyclaude-local (this fork)                            |
| -------------------- | ---------------------------------------- | ------------------------------------------------------ |
| **Cloud Providers**  | ✅ OpenAI, Google, xAI, Azure, Anthropic | ✅ OpenRouter (400+ models)                            |
| **Local Backends**   | ✅ LMStudio via failover                 | ✅ vLLM-MLX (auto-launch) + LMStudio                   |
| **MLX Support**      | ❌ Not supported                         | ✅ vLLM-MLX (auto-launch, KV cache)                    |
| **Auto-launch**      | ❌ Manual server setup                   | ✅ vLLM-MLX auto-starts/stops                          |
| **Trace Logging**    | ❌ Not supported                         | ✅ Auto-enabled for cloud modes                        |
| **Failover Systems** | ✅ Circuit breaker, health checks        | ❌ Removed (simpler, 4-mode system)                    |
| **GPT-5 Features**   | ✅ Reasoning controls, service tiers     | ❌ Not applicable                                      |
| **Test Coverage**    | Limited                                  | ✅ 1,400+ tests across 60 files (unit/integration/E2E) |
| **Setup Complexity** | Moderate (multiple providers)            | Simple (one config file)                               |
| **Use Case**         | Multi-cloud flexibility                  | Local privacy OR cheap cloud (84% ↓)                   |

**Choose Original anyclaude if**: You need OpenAI, Google, xAI, or GPT-5 specific features

**Choose anyclaude-local if**: You want local privacy (vLLM-MLX/LMStudio) OR cheap cloud (OpenRouter 84% cheaper) with auto-launch and trace logging

---

## 🤝 Credits & Attribution

This project is an **enhanced port** of [anyclaude](https://github.com/coder/anyclaude) by [Coder](https://coder.com), adapted for Claude Code 2.0.

### Original anyclaude Features

- Multi-provider support (OpenAI, Google, xAI, Azure, Anthropic)
- Advanced failover and circuit breaker patterns
- GPT-5 reasoning effort controls

### This Fork (anyclaude-local) - What Changed

**Removed:**

- ❌ Multi-cloud providers (OpenAI, Google, xAI, Azure)
- ❌ Complex failover systems (~1,500 lines)
- ❌ GPT-5 specific features

**Added:**

- ✅ **vLLM-MLX auto-launch** - Server starts/stops automatically
- ✅ **OpenRouter integration** - 400+ models at 84% lower cost than Claude API
- ✅ **Trace logging system** - Auto-capture Claude Code prompts for analysis
- ✅ **Cache monitoring** - Performance metrics, hit rate tracking
- ✅ **1,400+ test suite** - 60 test files covering unit, integration, regression, E2E tests
- ✅ **Setup validation** - Dependency checking before launch
- ✅ **4-mode architecture** - vllm-mlx (default), lmstudio, openrouter, claude

**Philosophy:**

- **Not simplified** - Enhanced with new features (auto-launch, OpenRouter, traces)
- **Local OR cloud** - Choose 100% privacy (local) or 84% cost savings (OpenRouter)
- **Optimized for Claude Code 2.0** - Designed for tool-heavy agent workflows

**All credit for the original concept and implementation goes to the anyclaude team at Coder.**

### Why Fork?

The original anyclaude is excellent for multi-cloud usage, but this fork takes a different approach:

1. **Optimized for Claude Code 2.0** - Built specifically for tool-heavy agent workflows
2. **Local-first with cloud option** - Privacy (vLLM-MLX/LMStudio) OR cost savings (OpenRouter 84% cheaper)
3. **Auto-launch convenience** - Server lifecycle management handled automatically
4. **Enhanced debugging** - Trace logging to reverse-engineer Claude Code's patterns
5. **Production-ready** - 1,400+ tests across 60 files, regression detection, git hooks

This fork doesn't just remove features - it adds new capabilities while simplifying the configuration.

---

## 📖 Documentation

### Core Documentation

- **[PROJECT.md](PROJECT.md)** - Complete architectural deep-dive and translation layer design
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute
- **[CLAUDE.md](CLAUDE.md)** - Claude Code-specific instructions

### Documentation & Testing

**Testing** - Comprehensive 1,400+ test suite across 60 files:

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

## 🙏 Credits & Attribution

This project is an **enhanced fork** of [anyclaude](https://github.com/coder/anyclaude) by **Coder Technologies Inc.**

### Original Project

**anyclaude** - created by Coder Technologies Inc.

- Repository: https://github.com/coder/anyclaude
- License: MIT License
- Copyright (c) 2024 Coder Technologies Inc.

The original anyclaude provided the foundational proxy architecture for translating between the Anthropic Messages API and OpenAI Chat Completions format, enabling Claude Code to work with alternative model providers.

### What We Enhanced in This Fork

**anyclaude-local** builds upon the original with significant enhancements:

- ✅ **vLLM-MLX Auto-Launch** - Automatic server startup with model loading and health checks
- ✅ **OpenRouter Integration** - Access to 400+ cloud models at 84% lower cost than Claude API
- ✅ **Comprehensive Testing** - 1,400+ automated tests (unit, integration, regression, E2E, performance)
- ✅ **Enhanced Tool Calling** - Improved reliability for complex multi-tool workflows
- ✅ **Trace Logging System** - Record and analyze Claude Code prompts for learning effective patterns
- ✅ **Multi-Mode Architecture** - Seamless switching between vllm-mlx, lmstudio, openrouter, and claude modes
- ✅ **Git Automation** - Pre-commit and pre-push hooks with regression detection
- ✅ **Improved Streaming** - Backpressure handling and message_stop safeguards

### What Stayed the Same

The core architecture from the original anyclaude remains:

- 🔄 Proxy server design for API translation
- 🔌 Anthropic Messages API compatibility
- 📡 Server-Sent Events (SSE) streaming support
- 🛠️ Tool calling framework
- 📋 MIT License for maximum freedom

### Acknowledgments

**Special thanks to:**

- **Coder Technologies Inc.** - For creating the original anyclaude project and making it open source
- **Anthropic Team** - For Claude Code 2.0 and the powerful AI assistant it provides
- **vLLM-MLX Team** - For fast, efficient Apple Silicon inference with prompt caching
- **LMStudio Team** - For accessible local model serving with a great UI
- **OpenRouter** - For democratizing access to diverse AI models at affordable prices
- **Open Source Contributors** - To all the dependency projects that make this possible

### Formal Attribution

For complete attribution details, see the [NOTICE](NOTICE) file.

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

**Copyright (c) 2024 Coder Technologies Inc.** (Original anyclaude project)
**Copyright (c) 2025 akaszubski and contributors** (anyclaude-local fork)

This fork maintains the same MIT License as the original project to ensure compatibility and ease of use. The MIT License permits commercial use, modification, distribution, and private use.

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

- [x] **Automated testing** (1,400+ tests across 60 files: unit, integration, E2E, performance) ✅ **COMPLETE**
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
