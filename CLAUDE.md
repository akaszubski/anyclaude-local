# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

**anyclaude** is a translation layer for Claude Code that enables using local models (mistral.rs MLX, LMStudio) or cloud models (OpenRouter) through the Anthropic API format.

See [PROJECT.md](PROJECT.md) for complete architecture documentation.

## Development Commands

```bash
bun install          # Install dependencies
bun run build        # Build (creates dist/main.js)
bun run ./dist/main.js  # Run the built binary
npm test             # Run all tests
```

## File Organization

**Root directory - only these files:**

- README.md, CHANGELOG.md, LICENSE, CLAUDE.md, PROJECT.md
- package.json, tsconfig.json, .gitignore

**Everything else in subdirectories:**

- `src/` - TypeScript source code
- `tests/` - Unit, integration, regression tests
- `scripts/` - Debug and test scripts
- `docs/` - All documentation

**Before creating files:** Ask yourself if it belongs in root or a subdirectory.

## Key Environment Variables

```bash
# Backend mode
ANYCLAUDE_MODE=local|openrouter|claude|mlx-cluster

# Debug levels
ANYCLAUDE_DEBUG=1  # Basic
ANYCLAUDE_DEBUG=2  # Verbose
ANYCLAUDE_DEBUG=3  # Trace (full prompts)

# Test proxy without Claude Code
PROXY_ONLY=true
```

## Quick Reference

| Backend     | Config File         | Key Env Vars                          |
| ----------- | ------------------- | ------------------------------------- |
| Local       | `.anyclauderc.json` | `LOCAL_URL`, `LOCAL_CONTEXT_LENGTH`   |
| OpenRouter  | `.anyclauderc.json` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| MLX Cluster | `mlx-cluster.json`  | `MLX_CLUSTER_ENABLED`, `MLX_MODEL_PATH` |

**Note**: Old LMStudio names (`lmstudio` mode, `LMSTUDIO_*` env vars) still work with deprecation warnings for backward compatibility. See [CHANGELOG.md](CHANGELOG.md#issue-41-rename-lmstudio-backend-to-generic-local) for migration details.

## Further Documentation

- **Architecture**: [PROJECT.md](PROJECT.md)
- **Configuration**: [docs/guides/configuration.md](docs/guides/configuration.md)
- **OpenRouter Setup**: [docs/guides/openrouter-setup.md](docs/guides/openrouter-setup.md)
- **MLX Setup**: [docs/guides/mlx-lm-setup.md](docs/guides/mlx-lm-setup.md)
- **Troubleshooting**: [docs/debugging/](docs/debugging/)
- **Full Original**: [docs/reference/CLAUDE.md.original](docs/reference/CLAUDE.md.original)
