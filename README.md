# anyclaude-local

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/akaszubski/anyclaude-local?style=social)](https://github.com/akaszubski/anyclaude-local)

> **Fork of [anyclaude](https://github.com/coder/anyclaude) by Coder Technologies Inc.** Enhanced for Claude Code 2.0 with local MLX support, OpenRouter integration, and prompt optimization. See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for full attribution.

**Run Claude Code with local MLX models OR cheap cloud models — 100% privacy or 84% cost savings.**

## How It Works

```
Claude Code  →  anyclaude proxy  →  Backend
(Anthropic API)  (translates)       (OpenAI-compatible or passthrough)
```

anyclaude intercepts Claude Code's Anthropic API calls, translates them to OpenAI format for local models (or passes through to cloud APIs), and converts responses back. Claude Code doesn't know the difference.

## Four Backend Modes

| Mode            | Cost                   | Privacy    | Best For                      |
|-----------------|------------------------|------------|-------------------------------|
| **local** ⭐    | Free                   | 100% local | Apple Silicon / any local LLM |
| **openrouter**  | $0.60–$2/1M (84% less) | Cloud      | Cost savings, 400+ models     |
| **claude**      | $3–$15/1M              | Cloud      | Premium quality + trace logs  |
| **mlx-cluster** | Free                   | 100% local | Distributed Apple Silicon     |

```bash
anyclaude                      # local mode (default)
anyclaude --mode=openrouter    # cloud, 84% cheaper
anyclaude --mode=claude        # official Anthropic API
anyclaude --mode=mlx-cluster   # distributed inference
```

## Quick Start

### Prerequisites

- **Bun** ([bun.sh](https://bun.sh)) for building
- **Node.js** 18+ for runtime
- **Claude Code** 2.0+

### Install

```bash
git clone https://github.com/akaszubski/anyclaude-local.git
cd anyclaude-local
bun install && bun run build
bun install -g $(pwd)    # makes 'anyclaude' available globally
```

### Local Backend (Recommended for Apple Silicon)

1. **Install MLX dependencies** (one-time):
   ```bash
   python3 -m venv ~/.venv-mlx
   source ~/.venv-mlx/bin/activate
   pip install mlx-lm fastapi uvicorn pydantic
   ```

2. **Configure** `.anyclauderc.json`:
   ```json
   {
     "backend": "local",
     "backends": {
       "local": {
         "enabled": true,
         "modelPath": "/path/to/mlx-model",
         "autoStartServer": true
       }
     }
   }
   ```

3. **Run**: `anyclaude` — server auto-launches, auto-cleans up on exit.

### OpenRouter Backend

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
anyclaude --mode=openrouter
```

### Claude API Backend

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
anyclaude --mode=claude
```

---

## Key Features

### Prompt Optimization
- **Safe system filter** with configurable tiers (minimal → extreme) — reduces Claude Code's ~18K token system prompt for local model context windows
- **Billing header stripping** — enables KV cache hits (5.6× speedup: 6.5s → 1.15s)
- **Tool description stubbing** — 42K chars → ~1K (86% reduction)

### Reliability
- **Circuit breaker** — failure tracking with automatic recovery (CLOSED/OPEN/HALF_OPEN states)
- **Streaming safeguards** — message_stop guarantee prevents hung responses
- **Context window management** — automatic truncation with warnings

### Observability
- **3-level debug logging** (`ANYCLAUDE_DEBUG=1|2|3`)
- **Trace logging** — auto-captures cloud mode requests (API keys redacted)
- **Cache metrics** — hit rate tracking and monitoring dashboard
- **Prometheus metrics** — `/v1/metrics` endpoint (JSON + Prometheus format)

### Model Adapters
- **Per-model prompt formatting** — Qwen (bullet points + tool hints), Mistral (imperative/concise), Llama (numbered steps + flat schemas)
- **Adaptive capability detection** — probes backend at startup for tool calling and streaming support
- **Base adapter pattern** — shared validation and error handling, models add only their specific transforms

### MLX Cluster
- Distributed inference across multiple Apple Silicon Macs
- Intelligent load balancing (round-robin, least-loaded, cache-aware, latency-based)
- Automatic health monitoring and failover

---

## Configuration

**Priority**: CLI flags > environment variables > `.anyclauderc.json` > defaults

### Environment Variables

```bash
ANYCLAUDE_MODE=local          # Backend mode
LOCAL_URL=http://localhost:8081/v1
LOCAL_CONTEXT_LENGTH=32768
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=z-ai/glm-4.6
ANYCLAUDE_DEBUG=1             # Debug level (1=basic, 2=verbose, 3=trace)
PROXY_ONLY=true               # Test proxy without launching Claude Code
```

### Config File (.anyclauderc.json)

```json
{
  "backend": "local",
  "backends": {
    "local": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "modelPath": "/path/to/mlx-model",
      "autoStartServer": true,
      "safeSystemFilter": true,
      "filterTier": "aggressive",
      "stubToolDescriptions": true
    },
    "openrouter": {
      "enabled": false,
      "apiKey": "sk-or-v1-YOUR_KEY",
      "model": "z-ai/glm-4.6"
    }
  }
}
```

**Note**: Old LMStudio config keys (`lmstudio` backend, `LMSTUDIO_*` env vars) still work with deprecation warnings.

---

## Testing

```bash
npm test              # Full suite (build + unit + regression + integration)
npm run test:unit     # Unit tests only
npm run test:regression  # Regression tests only
```

Tests run automatically via git hooks: pre-commit (type check) and pre-push (full suite).

## Debugging

```bash
ANYCLAUDE_DEBUG=1 anyclaude    # Request timing, errors
ANYCLAUDE_DEBUG=2 anyclaude    # Full request/response bodies
ANYCLAUDE_DEBUG=3 anyclaude    # Tool schemas, stream conversion details

# Test proxy without Claude Code
PROXY_ONLY=true anyclaude
curl -X POST http://localhost:PORT/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

Debug trace tools are available in `scripts/debug/` (trace-analyzer.ts, trace-replayer.ts).

---

## Performance

### Why MLX Over LMStudio?

Claude Code sends ~18K tokens per request (system prompt + 16 tool schemas). Without caching, this is reprocessed every time.

| Metric | LMStudio | MLX (with KV cache) |
|--------|----------|---------------------|
| First request | ~50s | ~20–30s |
| Follow-ups | ~40s (no cache) | ~5–10s (cached) |
| Improvement | — | **4–9× faster** |

### Recommended Models (Apple Silicon)

- **Daily use**: `mlx-community/Qwen2.5-7B-Instruct-4bit` (10–15GB)
- **Best quality**: Qwen3-30B-A3B (requires 64GB+ RAM)
- **Speed**: `mlx-community/Qwen2.5-3B-Instruct-4bit` (2–4GB)

---

## Documentation

- **[PROJECT.md](PROJECT.md)** — Architecture, translation layer design, file structure
- **[CHANGELOG.md](CHANGELOG.md)** — Version history
- **[docs/](docs/)** — Guides, debugging, architecture docs
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — How to contribute

---

## Credits

Enhanced fork of [anyclaude](https://github.com/coder/anyclaude) by **Coder Technologies Inc.** (MIT License).

**This fork adds**: MLX auto-launch, OpenRouter integration, prompt optimization (safe filter, tool stubbing, billing header stripping), adaptive capability detection, model-specific adapters, circuit breaker, comprehensive test suite.

**Core proxy architecture** (API translation, SSE streaming, tool calling) from the original project.

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for complete attribution.

## License

MIT License — see [LICENSE](LICENSE)

Copyright (c) 2024 Coder Technologies Inc. (original) | Copyright (c) 2025 akaszubski (fork)
