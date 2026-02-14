# AnyClaude — Project Documentation

## Vision

A local-first replacement for Claude Code's cloud dependency. Use Claude Code with local LLMs (MLX on Apple Silicon) or cheap cloud models (OpenRouter) while retaining all capabilities: tool calling, web search, file operations, automations.

### Core Principles

1. **Local-First** — Zero cloud dependency when desired
2. **Feature Parity** — Every Claude Code capability must work
3. **Speed** — Response latency must match or exceed cloud
4. **Reliable by Default** — No manual configuration for core features

## Architecture

### Translation Flow

```
Claude Code → anyclaude proxy → Backend (local MLX / OpenRouter / Claude API / MLX Cluster)
```

anyclaude performs bidirectional format translation (Anthropic ↔ OpenAI), streaming protocol adaptation (AI SDK → Anthropic SSE), tool call consolidation, context window management, and prompt optimization.

### Four Backend Modes

| Mode | Purpose | Translation |
|------|---------|-------------|
| **local** (default) | MLX/LMStudio/any OpenAI server | Full Anthropic → OpenAI translation |
| **openrouter** | 400+ cloud models, 84% cheaper | Minimal translation (Anthropic-compatible) |
| **claude** | Official API + trace logging | Passthrough with trace capture |
| **mlx-cluster** | Distributed Apple Silicon | Full translation + load balancing |

### Key Translation Challenges (Solved)

1. **Streaming tool parameters** — AI SDK sends tool calls in both streaming and atomic format simultaneously. We deduplicate and convert to Anthropic's `input_json_delta` format.
2. **Context window limits** — Local models have 8K–128K vs Claude's 200K. Auto-truncation preserves recent messages + system prompt.
3. **Prompt size** — Claude Code sends ~18K tokens per request. Safe system filter reduces this with configurable tiers; tool stubbing cuts descriptions by 86%.
4. **Slow model timeouts** — SSE keepalive pings prevent client timeout during long inference.

## Source Files (58 TypeScript files, ~21K lines)

### Core Translation

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point, config loading, mode detection, server launch |
| `src/anthropic-proxy.ts` | HTTP proxy, request routing, prompt optimization chain |
| `src/convert-anthropic-messages.ts` | Bidirectional Anthropic ↔ OpenAI message translation |
| `src/convert-to-anthropic-stream.ts` | OpenAI streaming → Anthropic SSE with tool dedup |
| `src/json-schema.ts` | Tool schema conversion (Anthropic → OpenAI format) |
| `src/context-manager.ts` | Token counting, context truncation, overflow handling |

### Prompt Optimization

| File | Purpose |
|------|---------|
| `src/safe-system-filter.ts` | Rule-based system prompt reduction (5 tiers) |
| `src/prompt-templates.ts` | Prompt deduplication |
| `src/prompt-section-parser.ts` | System prompt section extraction |
| `src/critical-sections.ts` | Identifies must-keep prompt sections |
| `src/tool-context-manager.ts` | Tool description stubbing + skill-based expansion |

### Model Adapters

| File | Purpose |
|------|---------|
| `src/prompt-adapter.ts` | Adapter interface, validation, model detection |
| `src/adapters/base-adapter.ts` | Shared boilerplate (validation, metadata, error handling) |
| `src/adapters/qwen-adapter.ts` | Bullet points, tool hints, 200-char description limit |
| `src/adapters/mistral-adapter.ts` | Imperative style, verbose removal, 100-char descriptions |
| `src/adapters/llama-adapter.ts` | Numbered steps, schema flattening (depth ≤ 2) |
| `src/adapters/generic-adapter.ts` | Pass-through for unknown models |
| `src/capability-detector.ts` | Runtime probing: tool calling, streaming support |

### Reliability & Observability

| File | Purpose |
|------|---------|
| `src/circuit-breaker.ts` | CLOSED/OPEN/HALF_OPEN failure state machine |
| `src/health-check.ts` | Server health monitoring |
| `src/debug.ts` | 3-level debug logging |
| `src/trace-logger.ts` | Request/response capture (API keys redacted) |
| `src/cache-metrics.ts` | Cache hit/miss tracking |
| `src/cache-monitor-dashboard.ts` | Cache performance monitoring |
| `src/prometheus-metrics.ts` | `/v1/metrics` endpoint (JSON + Prometheus) |
| `src/request-logger.ts` | Request logging |
| `src/structured-logger.ts` | Structured log output |

### Infrastructure

| File | Purpose |
|------|---------|
| `src/local-client.ts` | OpenAI-compatible backend client |
| `src/local-info.ts` | Backend model info queries (context length) |
| `src/server-launcher.ts` | MLX Worker auto-start/stop |
| `src/backend-client.ts` | Backend HTTP client |
| `src/server-side-tool-handler.ts` | WebSearch tool interception for local models |
| `src/claude-search-executor.ts` | Web search execution |
| `src/timeout-config.ts` | Per-mode timeout configuration |
| `src/setup-checker.ts` | Pre-startup dependency validation |

### Cluster (MLX Distributed)

| File | Purpose |
|------|---------|
| `src/cluster/cluster-manager.ts` | Node coordination and request distribution |
| `src/cluster/cluster-router.ts` | Load balancing strategies |
| `src/cluster/cluster-health.ts` | Node health monitoring |
| `src/cluster/cluster-cache.ts` | KV cache coordination across nodes |
| `src/cluster/cluster-discovery.ts` | Auto node discovery |
| `src/cluster/cluster-config.ts` | Cluster configuration |
| `src/cluster/cluster-types.ts` | Shared type definitions |

### Other

| File | Purpose |
|------|---------|
| `src/anthropic-api-types.ts` | Anthropic API type definitions |
| `src/cache-control-extractor.ts` | Anthropic cache_control marker extraction |
| `src/streaming-json-parser.ts` | Incremental JSON parsing for streaming |
| `src/tool-schema-converter.ts` | Tool schema format conversion |
| `src/tool-response-parser.ts` | Tool response parsing |
| `src/prompt-cache.ts` | Prompt caching |
| `src/data-content.ts` | Data content handling |
| `src/detect-mimetype.ts` | MIME type detection |
| `src/split-data-url.ts` | Data URL parsing |
| `src/invalid-data-content-error.ts` | Error type for invalid data content |
| `src/safe-stringify.ts` | Safe JSON.stringify (handles circular refs) |
| `src/convert-to-language-model-prompt.ts` | Language model prompt conversion |
| `src/utils/backend-migration.ts` | Deprecation warnings + config migration (lmstudio → local) |
| `src/utils/backend-display.ts` | Backend display formatting |

## Configuration

Hierarchical: CLI flags > env vars > `.anyclauderc.json` > defaults.

Key config options for local backend:
- `safeSystemFilter` / `filterTier` — prompt optimization tier
- `stubToolDescriptions` — tool description stubbing
- `autoStartServer` / `modelPath` — MLX Worker auto-launch
- `circuitBreaker` — failure handling configuration

See [CLAUDE.md](CLAUDE.md) for environment variables and config file format.

## Testing

Tests in `tests/` directory (~179 test files): unit, integration, regression, E2E. Run with `npm test`.

**Test frameworks**: Node.js (`.js` tests), TypeScript/Jest (`.test.ts`), pytest (Python `.py`).

## Design Principles

1. **Translation, not replacement** — We translate formats, not replicate Claude's intelligence
2. **Preserve semantics** — Conversions maintain meaning across formats
3. **Graceful degradation** — Unsupported features silently adapted, not errored
4. **Transparent debugging** — Every translation step observable at appropriate debug levels
5. **Privacy first** — Local mode never leaks data; no analytics or telemetry
6. **Zero config, but configurable** — Sensible defaults; power users can tune everything

## Constraints

- **Single backend per process** — switch modes by restarting with different `ANYCLAUDE_MODE`
- **Apple Silicon required for MLX** — Intel/AMD use LMStudio with `local` mode
- **Node.js 18+** required; Bun for building
- **Context windows** — local models often 8K–128K vs Claude's 200K; auto-truncation handles overflow
- **Model compatibility** — must support OpenAI Chat Completions format; tool calling requires function calling support
