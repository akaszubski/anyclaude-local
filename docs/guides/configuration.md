# Configuration Guide

AnyClaude can be configured via configuration files, environment variables, and CLI flags. This guide explains all available options and how they interact.

## Quick Start

### Minimal Configuration

The simplest setup requires just a configuration file:

```json
{
  "backend": "local"
}
```

This will use the local backend with default settings (http://localhost:8081/v1).

> **Note**: Old backend names (`lmstudio`, `mlx-lm`, `mlx`, `mlx-textgen`) still work but are deprecated. Use `local` for any OpenAI-compatible local server.

### Full Configuration

For complete control, create `.anyclauderc.json` in your project root:

```json
{
  "backend": "local",
  "debug": {
    "level": 1,
    "enableTraces": false,
    "enableStreamLogging": false
  },
  "backends": {
    "local": {
      "enabled": true,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "local",
      "model": "current-model",
      "modelPath": "/path/to/mlx/model",
      "autoStartServer": true,
      "description": "Local MLX Worker with auto-start"
    },
    "openrouter": {
      "enabled": false,
      "apiKey": "sk-or-v1-YOUR_API_KEY",
      "model": "google/gemini-2.5-flash"
    },
    "claude": {
      "enabled": false
    },
    "mlx-cluster": {
      "enabled": false
    }
  }
}
```

## Configuration File (.anyclauderc.json)

### File Location

Place `.anyclauderc.json` in your project root (same directory where you run `anyclaude`).

### Structure

```typescript
interface AnyclaudeConfig {
  // Primary backend to use
  backend?: "local" | "openrouter" | "claude" | "mlx-cluster";

  // Debug configuration
  debug?: {
    level?: 0 | 1 | 2 | 3; // 0=off, 1=basic, 2=verbose, 3=trace
    enableTraces?: boolean;
    enableStreamLogging?: boolean;
  };

  // Web search configuration
  webSearch?: {
    localSearxngUrl?: string;
    preferLocal?: boolean;
    enableFallback?: boolean;
  };

  // Backend configurations
  backends?: {
    local?: LocalBackendConfig;
    openrouter?: OpenRouterConfig;
    claude?: ClaudeConfig;
    "mlx-cluster"?: ClusterConfig;
  };
}
```

## Backend Configurations

### Local Backend (MLX Worker, LMStudio, etc.)

The `local` backend works with any OpenAI-compatible server:

```json
{
  "backends": {
    "local": {
      "enabled": true,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "local",
      "model": "current-model",
      "modelPath": "/path/to/mlx/model",
      "autoStartServer": true,
      "startupTimeout": 120000,
      "safeSystemFilter": true,
      "filterTier": "auto",
      "smartPromptMode": "simple",
      "truncateSystemPrompt": false,
      "systemPromptMaxTokens": 2000,
      "localSearch": true,
      "description": "Local MLX Worker with auto-start and web search"
    }
  }
}
```

**Options:**

| Option                  | Default                    | Description                                                                   |
| ----------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `enabled`               | `true`                     | Whether this backend is available                                             |
| `baseUrl`               | `http://localhost:8081/v1` | OpenAI-compatible API endpoint                                                |
| `apiKey`                | `local`                    | API key (most local servers ignore this)                                      |
| `model`                 | `current-model`            | Model identifier                                                              |
| `modelPath`             | -                          | Path to MLX model for auto-start                                              |
| `autoStartServer`       | `true`                     | Auto-start MLX Worker when using localhost                                    |
| `startupTimeout`        | `120000`                   | Server startup timeout in ms                                                  |
| `safeSystemFilter`      | `true`                     | Enable intelligent prompt optimization                                        |
| `filterTier`            | `auto`                     | Filter aggressiveness: `auto`, `minimal`, `moderate`, `aggressive`, `extreme` |
| `smartPromptMode`       | `simple`                   | Prompt mode: `simple`, `balanced`, `aggressive`                               |
| `truncateSystemPrompt`  | `false`                    | Simple size-based truncation (fallback)                                       |
| `systemPromptMaxTokens` | `2000`                     | Max tokens for truncation                                                     |
| `localSearch`           | `false`                    | Auto-start SearXNG Docker container                                           |

### OpenRouter Configuration

```json
{
  "backends": {
    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-YOUR_API_KEY_HERE",
      "model": "google/gemini-2.5-flash",
      "description": "OpenRouter - 400+ models, 88% cheaper than Claude"
    }
  }
}
```

**Popular Models:**

| Model                         | Cost (per 1M tokens) | Notes                                       |
| ----------------------------- | -------------------- | ------------------------------------------- |
| `google/gemini-2.5-flash`     | $0.30/$2.50          | **Recommended** - thinking mode, 1M context |
| `google/gemini-2.0-flash-001` | $0.10/$0.40          | Fastest, cheapest                           |
| `z-ai/glm-4.6`                | $0.60/$2.00          | 200K context, excellent for coding          |
| `qwen/qwen-2.5-72b-instruct`  | $0.35/$0.70          | Best value for basic coding                 |
| `anthropic/claude-3.5-sonnet` | $3/$15               | Highest quality                             |

### Claude API Configuration

```json
{
  "backends": {
    "claude": {
      "enabled": true,
      "description": "Real Anthropic API with trace logging"
    }
  }
}
```

Requires `ANTHROPIC_API_KEY` environment variable.

### MLX Cluster Configuration

```json
{
  "backends": {
    "mlx-cluster": {
      "enabled": true,
      "discovery": {
        "mode": "static",
        "nodes": [
          { "id": "mac-studio-1", "url": "http://192.168.1.100:8081" },
          { "id": "macbook-pro-1", "url": "http://192.168.1.101:8081" }
        ]
      },
      "routing": {
        "strategy": "cache-aware"
      }
    }
  }
}
```

See [docs/architecture/mlx-cluster-system.md](../architecture/mlx-cluster-system.md) for full cluster documentation.

## Environment Variables

### Mode Selection

```bash
# Use local backend (MLX Worker, LMStudio, etc.)
export ANYCLAUDE_MODE=local

# Use OpenRouter
export ANYCLAUDE_MODE=openrouter

# Use Claude API
export ANYCLAUDE_MODE=claude

# Use MLX Cluster
export ANYCLAUDE_MODE=mlx-cluster
```

### Local Backend Configuration

```bash
# Local endpoint (default: http://localhost:8081/v1)
export LOCAL_URL=http://localhost:8081/v1

# Context length (override auto-detection)
export LOCAL_CONTEXT_LENGTH=32768

# Model path for auto-start
export MLX_MODEL_PATH=/path/to/model
```

### OpenRouter Configuration

```bash
export OPENROUTER_API_KEY=sk-or-v1-xxxxx
export OPENROUTER_MODEL=google/gemini-2.5-flash
```

### Claude API Configuration

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Debug Options

```bash
export ANYCLAUDE_DEBUG=0  # Off (default)
export ANYCLAUDE_DEBUG=1  # Basic info
export ANYCLAUDE_DEBUG=2  # Verbose
export ANYCLAUDE_DEBUG=3  # Trace (full prompts)
```

### Web Search

```bash
# Enable local SearXNG
export SEARXNG_URL=http://localhost:8080
```

### KV Cache Persistence (MLX Worker)

Configure disk-based KV cache for faster MLX worker startup:

```bash
# Cache directory (default: ~/.cache/anyclaude/kv-cache)
export ANYCLAUDE_KV_CACHE_DIR=~/.cache/anyclaude/kv-cache

# Max cache size in GB before LRU eviction (default: 5.0)
export ANYCLAUDE_KV_CACHE_MAX_SIZE_GB=5.0

# Enable FP16 quantization for 2x smaller cache files (default: true)
export ANYCLAUDE_KV_CACHE_QUANTIZE=true

# Enable memory-mapped loading for zero-copy performance (default: true)
export ANYCLAUDE_KV_CACHE_MMAP=true

# Minimum tokens to cache (prompts shorter than this skip disk cache)
export ANYCLAUDE_KV_CACHE_MIN_TOKENS=1024
```

**Performance Impact:**

- First request (cold): 30-45s → <5s (loads from disk cache)
- Cache file size: ~26MB → ~13MB (with FP16 quantization)
- Memory on load: Full cache size → Near-zero (with mmap)

## CLI Flags

CLI flags have highest priority:

```bash
anyclaude --mode=local
anyclaude --mode=openrouter
anyclaude --mode=claude
anyclaude --mode=mlx-cluster

# Test model compatibility
anyclaude --test-model
```

## Configuration Priority

Settings are applied in this order (highest to lowest priority):

1. **CLI flags** (`anyclaude --mode=local`)
2. **Environment variables** (`ANYCLAUDE_MODE=local`)
3. **Configuration file** (`.anyclauderc.json`)
4. **Defaults** (mode: `local`)

## Common Configurations

### Development (Auto-Start MLX)

```json
{
  "backend": "local",
  "debug": { "level": 1 },
  "backends": {
    "local": {
      "modelPath": "/path/to/mlx/model",
      "autoStartServer": true,
      "localSearch": true
    }
  }
}
```

### Cloud (OpenRouter)

```json
{
  "backend": "openrouter",
  "backends": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxxxx",
      "model": "google/gemini-2.5-flash"
    }
  }
}
```

### Debugging (Trace Everything)

```json
{
  "backend": "local",
  "debug": {
    "level": 3,
    "enableTraces": true,
    "enableStreamLogging": true
  }
}
```

## Deprecated Backend Names

For backward compatibility, these old names still work but will show deprecation warnings:

| Old Name      | Maps To |
| ------------- | ------- |
| `lmstudio`    | `local` |
| `mlx-lm`      | `local` |
| `mlx`         | `local` |
| `mlx-textgen` | `local` |

**Migration:** Change `"backend": "lmstudio"` to `"backend": "local"` in your config.

## Troubleshooting

### Verify Configuration

```bash
PROXY_ONLY=true anyclaude
# Shows active configuration
```

### Check Environment Variables

```bash
env | grep -E "ANYCLAUDE|LOCAL|OPENROUTER|ANTHROPIC|SEARXNG"
```

### Enable Debug Logging

```bash
ANYCLAUDE_DEBUG=1 anyclaude
```

## See Also

- [README.md](../../README.md) - Quick start
- [PROJECT.md](../../PROJECT.md) - Architecture
- [web-search-local.md](web-search-local.md) - Local web search setup
