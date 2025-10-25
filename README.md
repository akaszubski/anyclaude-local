# anyclaude-lmstudio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/akaszubski/anyclaude-lmstudio?style=social)](https://github.com/akaszubski/anyclaude-lmstudio)

**Run Claude Code with local LMStudio models - zero cloud dependency, full privacy**

A simplified fork of [anyclaude](https://github.com/coder/anyclaude) focused exclusively on LMStudio local models.

## ✨ Features

- 🏠 **100% Local** - No cloud API keys required
- 🔄 **Hot Model Switching** - Change models in LMStudio without restarting
- 🚀 **Simple Setup** - Running in under 5 minutes
- 🔒 **Privacy First** - Your code never leaves your machine
- 🧩 **Universal Compatibility** - Works with any LMStudio-compatible model (Mistral, Llama, DeepSeek, etc.)
- 🐛 **Debug Friendly** - Comprehensive logging for troubleshooting

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

### Expected Response Times

Local models take time to process and generate responses. This is **normal behavior**, not a bug:

| Operation | Typical Duration | What's Happening |
|-----------|-----------------|------------------|
| **Initial Startup** | 2-5 seconds | Loading proxy server |
| **Prompt Processing** | 5-60 seconds | LMStudio analyzing request (depends on prompt size) |
| **Token Generation** | 1-5 tokens/sec | Model generating response (depends on model size & GPU) |
| **Claude Code System Prompt** | 30-90 seconds | Processing 10K+ token system prompt with tool descriptions |

**Why So Slow?**
- Claude Code sends **large system prompts** (10,000+ tokens) with all tool descriptions
- Local models process tokens sequentially on your GPU
- Larger models (13B+) are slower but more capable
- Smaller models (7B) are faster but less capable

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
- gpt-oss-20b: 8K tokens
- deepseek-coder-v2-lite: 16K tokens
- deepseek-coder-33b: 16K tokens
- qwen2.5-coder-7b/32b: 32K tokens
- mistral-7b: 32K tokens
- Default (unknown models): 8K tokens (conservative)

**Override detection:**
```bash
# Your model has 128K context but wasn't detected?
export LMSTUDIO_CONTEXT_LENGTH=131072
anyclaude
```

**How it compares to Claude Code 2:**

| Feature | Claude Sonnet 4.5 | Local Models (anyclaude) |
|---------|------------------|--------------------------|
| Context Window | 200K tokens | 8K-128K tokens |
| Auto-compression | ✅ Extended thinking | ❌ Not supported |
| Prompt Caching | ✅ Cached prompts | ❌ Not supported |
| Truncation | ✅ Smart summarization | ✅ Sliding window (recent messages) |
| Warning System | ❌ None needed | ✅ Warns at 75%, 90% |

**Best Practices:**
1. **Start new conversations** when you see the 90% warning
2. **Use models with larger context** for long coding sessions (32K+ recommended)
3. **Set LMSTUDIO_CONTEXT_LENGTH** if you know your model's limit
4. **Monitor warnings** - truncation loses older context
```

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
```

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

| Feature | Original anyclaude | anyclaude-lmstudio |
|---------|-------------------|-------------------|
| **Cloud Providers** | ✅ OpenAI, Google, xAI, Azure, Anthropic | ❌ None (local only) |
| **LMStudio Support** | ✅ Via failover | ✅ Primary focus |
| **Failover Systems** | ✅ Circuit breaker, health checks | ❌ Removed for simplicity |
| **GPT-5 Features** | ✅ Reasoning controls, service tiers | ❌ Not applicable |
| **Codebase Size** | ~2,500 lines | ~1,000 lines |
| **Setup Complexity** | Moderate (multiple providers) | Simple (one provider) |
| **Use Case** | Multi-provider flexibility | Local-first privacy |

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

- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute
- **[CLAUDE.md](CLAUDE.md)** - Developer documentation
- **[.claude/PROJECT.md](.claude/PROJECT.md)** - Strategic direction and architecture
- **[LICENSE](LICENSE)** - MIT License
- **[docs/](docs/)** - Detailed guides (debugging, testing, failover patterns)

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

*Making Claude Code work with your privacy-focused, local LLMs*
