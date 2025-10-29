# Configuration Guide

AnyClaude can be configured via configuration files, environment variables, and CLI flags. This guide explains all available options and how they interact.

## Quick Start

### Minimal Configuration

The simplest setup requires just a configuration file:

```json
{
  "backend": "mlx-lm"
}
```

This will use mlx-lm with default settings (http://localhost:8081/v1).

### Full Configuration

For complete control, create `.anyclauderc.json` in your project root:

```json
{
  "backend": "mlx-lm",
  "debug": {
    "level": 1,
    "enableTraces": false,
    "enableStreamLogging": false
  },
  "backends": {
    "lmstudio": {
      "enabled": true,
      "port": 1234,
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "current-model",
      "compatibility": "legacy",
      "description": "LMStudio local model server"
    },
    "mlx-lm": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-lm",
      "model": "current-model",
      "description": "MLX Language Model with native KV cache"
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
  // Primary backend to use (required if no env var/CLI flag)
  backend?: "lmstudio" | "mlx-lm" | "claude";

  // Debug configuration (optional)
  debug?: {
    level?: 0 | 1 | 2 | 3;        // 0=off, 1=basic, 2=verbose, 3=trace
    enableTraces?: boolean;        // Save request/response traces
    enableStreamLogging?: boolean; // Log streaming events
  };

  // Backend configurations (optional if using defaults)
  backends?: {
    lmstudio?: {
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      compatibility?: string;
      description?: string;
    };
    "mlx-lm"?: {
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      description?: string;
    };
    claude?: {
      enabled?: boolean;
      description?: string;
    };
  };
}
```

### Backend-Specific Options

#### LMStudio Configuration

```json
{
  "backends": {
    "lmstudio": {
      "enabled": true,
      "port": 1234,
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "current-model",
      "compatibility": "legacy",
      "description": "LMStudio local model server - fast iteration, good compatibility"
    }
  }
}
```

**Options:**
- `enabled` - Whether this backend is available
- `port` - LMStudio server port (default: 1234)
- `baseUrl` - LMStudio API endpoint (default: `http://localhost:1234/v1`)
- `apiKey` - API key for LMStudio (default: `lm-studio`)
- `model` - Model identifier (default: `current-model` - uses whatever is loaded in LMStudio)
- `compatibility` - OpenAI compatibility mode (default: `legacy`)
- `description` - User-friendly description

#### MLX-LM Configuration

```json
{
  "backends": {
    "mlx-lm": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-lm",
      "model": "current-model",
      "description": "MLX Language Model with native KV cache - best performance for follow-up requests"
    }
  }
}
```

**Options:**
- `enabled` - Whether this backend is available
- `port` - MLX-LM server port (default: 8081)
- `baseUrl` - MLX-LM API endpoint (default: `http://localhost:8081/v1`)
- `apiKey` - API key for MLX-LM (default: `mlx-lm`)
- `model` - Model identifier (default: `current-model`)
- `description` - User-friendly description

#### Claude API Configuration

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

**Options:**
- `enabled` - Whether this backend is available
- `description` - User-friendly description

Note: Requires `ANTHROPIC_API_KEY` environment variable.

## Environment Variables

### Mode Selection

Override the configured backend at runtime:

```bash
# Use MLX-LM mode (overrides config file)
export ANYCLAUDE_MODE=mlx-lm

# Use LMStudio mode
export ANYCLAUDE_MODE=lmstudio

# Use Claude API mode
export ANYCLAUDE_MODE=claude
```

### LMStudio Configuration

```bash
# LMStudio endpoint
export LMSTUDIO_URL=http://localhost:1234/v1

# Model name (LMStudio uses whatever is loaded)
export LMSTUDIO_MODEL=current-model

# API key
export LMSTUDIO_API_KEY=lm-studio

# Context length (override auto-detection)
export LMSTUDIO_CONTEXT_LENGTH=32768
```

### MLX-LM Configuration

```bash
# MLX-LM endpoint
export MLX_LM_URL=http://localhost:8081/v1

# Model name
export MLX_LM_MODEL=current-model

# API key
export MLX_LM_API_KEY=mlx-lm
```

### Claude API Configuration

```bash
# Anthropic API key (required for Claude mode)
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# Enable trace logging (saves requests/responses)
export ANYCLAUDE_DEBUG=1
```

### Debug Options

```bash
# Disable debug logging (default)
export ANYCLAUDE_DEBUG=0

# Basic debug info (requests, responses, timing)
export ANYCLAUDE_DEBUG=1

# Verbose debug info (includes full request/response bodies)
export ANYCLAUDE_DEBUG=2

# Trace debug info (includes tool calls)
export ANYCLAUDE_DEBUG=3
```

### Other Options

```bash
# Proxy-only mode (for testing, doesn't spawn Claude Code)
export PROXY_ONLY=true

# Test model compatibility
anyclaude --test-model
```

## CLI Flags

CLI flags take the highest priority:

```bash
# Select mode via CLI
anyclaude --mode=mlx-lm
anyclaude --mode=lmstudio
anyclaude --mode=claude

# Test model compatibility
anyclaude --test-model
```

## Configuration Priority

AnyClaude checks settings in this order (highest to lowest priority):

1. **CLI flags** (`anyclaude --mode=mlx-lm`)
2. **Environment variables** (`export ANYCLAUDE_MODE=lmstudio`)
3. **Configuration file** (`.anyclauderc.json`)
4. **Defaults** (mode: `lmstudio`, endpoints use default ports)

**Example:**

```bash
# .anyclauderc.json says: backend = "lmstudio"
# Environment says: export ANYCLAUDE_MODE=mlx-lm
# CLI says: anyclaude --mode=claude

# Result: Claude mode is used (CLI has highest priority)
```

## Common Configurations

### Development (Fast Iterations)

Use MLX-LM for fast follow-ups:

```json
{
  "backend": "mlx-lm",
  "debug": {
    "level": 1
  },
  "backends": {
    "mlx-lm": {
      "baseUrl": "http://localhost:8081/v1"
    }
  }
}
```

### Testing (Full Features)

Use LMStudio for all tools:

```json
{
  "backend": "lmstudio",
  "debug": {
    "level": 1
  },
  "backends": {
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1"
    }
  }
}
```

### Debugging (Trace Tool Calls)

Capture everything for analysis:

```json
{
  "backend": "mlx-lm",
  "debug": {
    "level": 3,
    "enableTraces": true,
    "enableStreamLogging": true
  }
}
```

### Production (Real Claude API)

Use Anthropic's API with trace logging:

```json
{
  "backend": "claude",
  "debug": {
    "level": 0,
    "enableTraces": true
  }
}
```

And set environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxx
anyclaude
```

### Remote Server

Connect to LMStudio on another machine:

```json
{
  "backend": "lmstudio",
  "backends": {
    "lmstudio": {
      "baseUrl": "http://192.168.1.100:1234/v1"
    }
  }
}
```

## Debugging Configuration Issues

### Verify Configuration is Loaded

```bash
# Proxy-only mode shows active configuration
PROXY_ONLY=true anyclaude

# Output will show:
# [anyclaude] Mode: MLX-LM
# [anyclaude] Config: .anyclauderc.json
# [anyclaude] MLX-LM endpoint: http://localhost:8081/v1
```

### Test Backend Connection

```bash
# Test proxy without spawning Claude Code
PROXY_ONLY=true ANYCLAUDE_MODE=mlx-lm anyclaude

# If successful:
# [anyclaude] Proxy URL: http://localhost:3000
```

### Check Environment Variables

```bash
# See which variables are set
env | grep -E "ANYCLAUDE|LMSTUDIO|MLX_LM|ANTHROPIC"
```

### Enable Debug Logging

```bash
# See detailed configuration loading and request/response info
ANYCLAUDE_DEBUG=1 anyclaude
```

## File Organization

When using configuration files, keep your project clean:

```
your-project/
├── .anyclauderc.json      # AnyClaude configuration
├── src/
├── tests/
└── README.md
```

The `.anyclauderc.json` file is **not** gitignored by default, but you may want to gitignore it if it contains local-specific paths:

```bash
# .gitignore
.anyclauderc.json         # If using local paths
```

## Troubleshooting

### Configuration File Not Found

```bash
# Error: No configuration found
# Solution: Make sure .anyclauderc.json is in the right directory

ls -la .anyclauderc.json   # Should show the file
pwd                         # Should match where you run anyclaude from
```

### Wrong Backend Selected

```bash
# Error: Config says mlx-lm but trying to connect to lmstudio

# Check priority: CLI > env var > config file > default
env | grep ANYCLAUDE_MODE  # Check environment
anyclaude --mode=mlx-lm    # Use CLI flag to override
```

### Port Already in Use

```bash
# Error: EADDRINUSE localhost:8081

# Option 1: Configure different port in .anyclauderc.json
# Option 2: Stop process using port
lsof -i :8081              # Find process
kill <PID>                 # Kill it
```

### Invalid Configuration File

```bash
# Error: JSON parse error in .anyclauderc.json

# Validate JSON syntax
npx jsonlint .anyclauderc.json

# Or use an online validator: https://jsonlint.com
```

## See Also

- [README.md](README.md) - Quick start and overview
- [PROJECT.md](PROJECT.md) - Architecture and design
- [CLAUDE.md](CLAUDE.md) - Claude Code integration
