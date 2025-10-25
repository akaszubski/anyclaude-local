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

# Proxy-only mode (for testing)
export PROXY_ONLY=true
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

### Models respond slowly or timeout

**Cause**: Model is too large for your hardware

**Fix**:
- Use a smaller model (e.g., 7B instead of 70B)
- Use quantized models (Q4, Q5 versions)
- Ensure LMStudio is using GPU acceleration

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
