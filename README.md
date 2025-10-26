# anyclaude-lmstudio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/akaszubski/anyclaude-lmstudio?style=social)](https://github.com/akaszubski/anyclaude-lmstudio)

**Run Claude Code with local LMStudio models - zero cloud dependency, full privacy**

An intelligent translation layer ported from [anyclaude](https://github.com/coder/anyclaude) for Claude Code 2.0, enabling seamless use of local LMStudio models as if they were the real Claude API.

## ✨ Features

- 🏠 **100% Local** - No cloud API keys required
- 🚀 **Simple Setup** - Running in under 5 minutes
- 🔒 **Privacy First** - Your code never leaves your machine
- 🧩 **Works with LMStudio Models** - Tested with Qwen Coder, Mistral, Llama, DeepSeek (performance depends on your hardware: GPU, VRAM, RAM)
- ⚡ **MLX Support (Apple Silicon)** - 4.4x faster with native KV cache on M-series chips
- 🐛 **Debug Friendly** - Comprehensive logging for troubleshooting
- 🎯 **Triple Mode** - Switch between local LMStudio, mlx-lm, and real Claude API

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

Runtime dependencies (automatically installed):

- `@ai-sdk/openai-compatible` - AI SDK for OpenAI-compatible servers (LMStudio)
- `ai` - Vercel AI SDK core

Development dependencies:

- TypeScript types and tooling

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/akaszubski/anyclaude-lmstudio.git
cd anyclaude-lmstudio

# 2. Install dependencies
bun install

# 3. Build the project
bun run build

# 4. Install globally (makes 'anyclaude' command available)
bun run install:global
```

### Setup & Run

1. **Start LMStudio**
   - Open LMStudio
   - Download a model (e.g., Mistral 7B, Llama 3, DeepSeek Coder)
   - Go to "Server" tab
   - Load the model
   - Click "Start Server" (default: http://localhost:1234)

2. **Run anyclaude**

   ```bash
   anyclaude
   ```

3. **Start using Claude Code with your local model!** 🎉

### Alternative: Run Without Installing Globally

```bash
# After building, run directly
node dist/main.js

# Or with debug logging
ANYCLAUDE_DEBUG=1 node dist/main.js
```

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

Configure via environment variables (all optional):

```bash
# LMStudio endpoint (default: http://localhost:1234/v1)
export LMSTUDIO_URL=http://localhost:1234/v1

# Model name (default: current-model)
# Note: LMStudio serves whatever model is currently loaded
export LMSTUDIO_MODEL=current-model

# API key for LMStudio (default: lm-studio)
export LMSTUDIO_API_KEY=lm-studio

# Debug logging (default: disabled)
export ANYCLAUDE_DEBUG=1  # Basic debug info
# or
export ANYCLAUDE_DEBUG=2  # Verbose debug info

# Context window management (NEW!)
export LMSTUDIO_CONTEXT_LENGTH=32768  # Override auto-detected context limit
# Useful if your model supports larger context than the default

# Proxy-only mode (for testing)
export PROXY_ONLY=true
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
|----------|--------------|----------------|---------|
| LMStudio | 50s          | 44s            | 1.1x    |
| mlx-lm   | 21.6s        | 4.9s           | 4.4x    |

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
```

Debug logs include:

- Request start/completion timing
- Message conversion details
- Stream chunk processing
- Error details with temp file dumps

### Run Regression Tests

```bash
# Run timeout regression tests
npm test

# Tests verify:
# - Model detection has 5s timeout
# - Fallback endpoints have 5s timeout
# - LMStudio requests have 120s timeout
# - All timeouts properly cleaned up

# Output:
# ✓ main.ts should have timeout on detectLoadedModel
# ✓ main.ts should have timeout on getModelName fallback
# ✓ main.ts LMStudio fetch wrapper should have timeout
# ✓ all AbortControllers should have clearTimeout cleanup
#
# 4 passed, 0 failed (< 1 second)
```

**Pre-commit Hook**: Tests run automatically before every commit to prevent timeout bugs from recurring.

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

| Feature              | Original anyclaude                       | anyclaude-lmstudio        |
| -------------------- | ---------------------------------------- | ------------------------- |
| **Cloud Providers**  | ✅ OpenAI, Google, xAI, Azure, Anthropic | ❌ None (local only)      |
| **LMStudio Support** | ✅ Via failover                          | ✅ Primary focus          |
| **Failover Systems** | ✅ Circuit breaker, health checks        | ❌ Removed for simplicity |
| **GPT-5 Features**   | ✅ Reasoning controls, service tiers     | ❌ Not applicable         |
| **Codebase Size**    | ~2,500 lines                             | ~1,000 lines              |
| **Setup Complexity** | Moderate (multiple providers)            | Simple (one provider)     |
| **Use Case**         | Multi-provider flexibility               | Local-first privacy       |

**Choose Original anyclaude if**: You need cloud providers, failover, or GPT-5 features

**Choose anyclaude-lmstudio if**: You want local-only, simple setup, privacy-focused usage

---

## 🤝 Credits & Attribution

This project is a simplified fork of [anyclaude](https://github.com/coder/anyclaude) by [Coder](https://coder.com).

### Original anyclaude Features

- Multi-provider support (OpenAI, Google, xAI, Azure, Anthropic)
- Advanced failover and circuit breaker patterns
- GPT-5 reasoning effort controls
- OpenRouter integration

### This Fork (anyclaude-lmstudio)

- **Focused on**: LMStudio local models only
- **Removed**: Cloud provider dependencies (~1,500 lines)
- **Added**: Dynamic model switching without restart
- **Simplified**: Easier to maintain and understand

**All credit for the original concept and implementation goes to the anyclaude team at Coder.**

### Why Fork?

The original anyclaude is excellent for multi-provider usage, but many users wanted a **simpler, local-only solution** without cloud dependencies. This fork strips away complexity to focus on one thing: seamless LMStudio integration.

---

## 📖 Documentation

### Core Documentation

- **[PROJECT.md](PROJECT.md)** - Complete architectural deep-dive and translation layer design
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute
- **[CLAUDE.md](CLAUDE.md)** - Claude Code-specific instructions

### Organized Guides

- **[docs/](docs/)** - Complete documentation index
  - **[Guides](docs/guides/)** - Installation, authentication, mode switching, debugging
  - **[Development](docs/development/)** - Testing, contributing, model testing
  - **[Debugging](docs/debugging/)** - Tool calling fix, trace analysis, troubleshooting
  - **[Architecture](docs/architecture/)** - Model adapters, tool enhancements
  - **[Reference](docs/reference/)** - Technical references, GitHub issues

---

## 🐛 Support & Issues

- **Issues**: [GitHub Issues](https://github.com/akaszubski/anyclaude-lmstudio/issues)
- **Discussions**: [GitHub Discussions](https://github.com/akaszubski/anyclaude-lmstudio/discussions)
- **Original Project**: [anyclaude](https://github.com/coder/anyclaude)

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

**Copyright (c) 2025 Coder Technologies Inc.** (Original anyclaude project)
**Copyright (c) 2025 akaszubski** (anyclaude-lmstudio fork)

---

## 🌟 Show Your Support

If anyclaude-lmstudio helps you build with local AI models, please:

- ⭐ Star this repo on GitHub
- ⭐ Star the [original anyclaude](https://github.com/coder/anyclaude) repo
- 🐛 Report bugs or suggest features via Issues
- 🤝 Contribute improvements via Pull Requests

---

## 🚀 What's Next?

### Roadmap

- [ ] Automated testing (unit tests for converters)
- [ ] GitHub Actions CI/CD
- [ ] Support for additional local model servers (Ollama, LocalAI)
- [ ] Performance optimizations
- [ ] Enhanced error messages
- [ ] npm package publication (when ready for wider distribution)

### Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Code standards
- Pull request process
- Testing guidelines

---

**Built with ❤️ for the local AI community**

_Making Claude Code work with your privacy-focused, local LLMs_
