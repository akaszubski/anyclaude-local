# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

**anyclaude** is a translation proxy that lets Claude Code use local models (MLX Worker, LMStudio, any OpenAI-compatible server) or cloud models (OpenRouter) through the Anthropic API format.

58 TypeScript source files, ~21K lines. 4 backends: local, openrouter, claude, mlx-cluster.

## Development Commands

```bash
bun install          # Install dependencies
bun run build        # Build (creates dist/main.js)
bun run ./dist/main.js  # Run the built binary (auto-creates .anyclauderc.json on first run)
npm test             # Run all tests
```

## Architecture at a Glance

```
Claude Code → anyclaude proxy → [local MLX | LMStudio | OpenRouter | Claude API]
(Anthropic API)  (translate)     (OpenAI-compatible or passthrough)
```

Key source files:
- `src/main.ts` — Entry point, config loading, mode detection
- `src/anthropic-proxy.ts` — HTTP proxy, request routing, prompt optimization
- `src/convert-anthropic-messages.ts` — Anthropic ↔ OpenAI message translation
- `src/convert-to-anthropic-stream.ts` — OpenAI SSE → Anthropic SSE stream translation
- `src/safe-system-filter.ts` — System prompt optimization (filtering tiers)
- `src/capability-detector.ts` — Runtime backend capability probing
- `src/adapters/` — Model-specific prompt formatting (Qwen, Mistral, Llama, generic)
- `src/cluster/` — MLX distributed cluster support

## File Organization

**Root directory** — only: README.md, CHANGELOG.md, LICENSE, CLAUDE.md, PROJECT.md, package.json, tsconfig.json, .gitignore

**Subdirectories:**
- `src/` — TypeScript source code
- `tests/` — Unit, integration, regression tests
- `scripts/` — Debug tools and test scripts
- `docs/` — All documentation

## Key Environment Variables

```bash
ANYCLAUDE_MODE=local|openrouter|claude|mlx-cluster
ANYCLAUDE_PORT=49152              # Proxy listening port (default: 49152)
ANYCLAUDE_DEBUG=1                 # Basic  |  2 = Verbose  |  3 = Trace
PROXY_ONLY=true                   # Test proxy without Claude Code
```

## Quick Reference

| Backend     | Config File         | Key Env Vars                             |
|-------------|---------------------|------------------------------------------|
| Local       | `.anyclauderc.json` | `LOCAL_URL`, `LOCAL_CONTEXT_LENGTH`      |
| OpenRouter  | `.anyclauderc.json` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| MLX Cluster | `mlx-cluster.json`  | `MLX_CLUSTER_ENABLED`, `MLX_MODEL_PATH`  |

**Note**: Old LMStudio names (`lmstudio` mode, `LMSTUDIO_*` env vars) still work with deprecation warnings.

## Further Documentation

- **Architecture**: [PROJECT.md](PROJECT.md)
- **Configuration**: [docs/guides/configuration.md](docs/guides/configuration.md)
- **OpenRouter Setup**: [docs/guides/openrouter-setup.md](docs/guides/openrouter-setup.md)
- **MLX Setup**: [docs/guides/mlx-lm-setup.md](docs/guides/mlx-lm-setup.md)
- **Troubleshooting**: [docs/debugging/](docs/debugging/)

---

## Workflow Discipline

**Use /implement for code changes** (functions, classes, methods, bug fixes).

**Exceptions** (direct edits OK): documentation (.md), config (.json), typos (1-2 lines).

| Command            | Use For                                |
|--------------------|----------------------------------------|
| `/auto-implement`  | Features, bug fixes, refactors         |
| `/create-issue`    | Track new tasks/bugs as GitHub issues  |
| `/advise`          | Critical analysis before decisions     |
| `/audit-tests`     | Test coverage analysis                 |
| `/batch-implement` | Process multiple features sequentially |

After 3-4 features, run `/clear` to manage context.
