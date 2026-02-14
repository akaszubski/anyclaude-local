# Documentation

## Guides

- **[Configuration](guides/configuration.md)** — All config options (env vars, `.anyclauderc.json`, CLI flags)
- **[Installation](guides/installation.md)** — Setup for each backend
- **[Authentication](guides/authentication.md)** — API keys and session tokens
- **[MLX-LM Setup](guides/mlx-lm-setup.md)** — Local MLX backend setup
- **[MLX-LM Technical Details](guides/mlx-lm-technical-details.md)** — JSON parsing workarounds
- **[OpenRouter Setup](guides/openrouter-setup.md)** — OpenRouter backend setup
- **[OpenRouter Model Selection](guides/openrouter-model-selection.md)** — Model picker script
- **[Circuit Breaker Configuration](guides/circuit-breaker-configuration.md)** — Failure handling tuning
- **[Web Search (Local)](guides/web-search-local.md)** — SearxNG for local web search
- **[Trace Analysis](guides/trace-analysis.md)** — Analyzing Claude Code request traces
- **[mistral.rs Setup](guides/mistralrs-setup-guide.md)** — PagedAttention backend
- **[Qwen3 MoE in mistral.rs](guides/add-switch-mlp-to-mistralrs.md)** — SwitchMLP support

## Architecture

- **[Cache Control Headers](architecture/cache-control-headers.md)** — Anthropic cache_control marker extraction
- **[MLX Cluster System](architecture/mlx-cluster-system.md)** — Distributed inference design
- **[Streaming JSON Parser](architecture/streaming-json-parser.md)** — Incremental JSON tokenization
- **[Tool Parsing Resilience](architecture/issue-13-tool-parsing-resilience.md)** — Parser registry and fallback chains

## Caching & Performance

- **[Cache Strategy](caching/CACHE_STRATEGY.md)** — Multi-level caching approach
- **[Cache Performance Tuning](caching/cache-performance-tuning.md)** — Hit rate optimization
- **[Prompt Cache Explanation](caching/PROMPT_CACHE_EXPLANATION.md)** — Why system prompt caching matters

## Debugging

- **[Debug Guide](debugging/DEBUG-GUIDE.md)** — Request/response logging
- **[Debug Workflow](debugging/DEBUG-WORKFLOW.md)** — Debug levels 0-3
- **[Tool Calling Fix](debugging/tool-calling-fix.md)** — Streaming vs complete tool calls
- **[Tool Call Debug](debugging/tool-call-debug.md)** — Tool execution debugging
- **[Qwen Parser Fix](debugging/mlx-worker-qwen-parser-fix.md)** — Multi-format XML parsing
- **[System Prompt Regression](debugging/system-prompt-regression-prevention.md)** — Newline handling

## Development

- **[Anthropic Cache Analysis](development/anthropic-cache-analysis.md)** — Reverse-engineered cache behavior
- **[Production Hardening](development/production-hardening-implementation.md)** — ErrorHandler, MetricsCollector, ConfigValidator
- **[Security Fixes](development/security-fixes-cache-warmup.md)** — Path traversal and env injection fixes
- **[Test Suite](development/TESTING_COMPREHENSIVE.md)** — 170+ tests breakdown

## Reference

- **[Production Hardening API](reference/production-hardening-api.md)** — `/v1/metrics` endpoint formats
- **[Cluster Config API](reference/cluster-config-api.md)** — Cluster configuration parsing
- **[Cluster Health API](reference/cluster-health-api.md)** — Health monitoring and circuit breaker
- **[Critical Sections API](reference/critical-sections-api.md)** — Prompt section preservation
- **[Claude Code Auth](reference/claude-code-auth.md)** — Authentication mechanisms

## Research

- **[Claude API Performance](research/claude-api-performance-analysis.md)** — Cloud vs local latency analysis
- **[Claude Code Proxies](research/claude-code-proxies-and-web-search.md)** — Proxy landscape survey
- **[Local LLM Proxy Patterns](research/local-llm-proxy-patterns.md)** — Caching patterns from LiteLLM
- **[M3 Ultra Performance](research/m3-ultra-performance-potential.md)** — Hardware analysis
- **[Streaming Best Practices](research/STREAMING_BEST_PRACTICES.md)** — SSE backpressure and recovery
