# MLX Backend Migration Guide

**Status**: Legacy backend available for reference, but **MLX-Textgen is production backend**

## Overview

anyclaude has two MLX-based backends available:

1. **MLX-Textgen** (Production) - Current default, recommended for all use
2. **vLLM-MLX** (Legacy) - Restored from archive for reference only

This guide explains the differences and migration path between these backends.

## Quick Comparison

| Feature          | MLX-Textgen (Production)                 | vLLM-MLX (Legacy)                |
| ---------------- | ---------------------------------------- | -------------------------------- |
| **Status**       | Active, supported                        | Archived, reference only         |
| **KV Caching**   | Disk-based, 10-90x speedup               | In-memory, limited               |
| **Tool Calling** | **FAILS** (known limitation)             | **FAILS** (known limitation)     |
| **Auto-launch**  | Yes, via `scripts/mlx-textgen-server.sh` | Yes, via `scripts/mlx-server.py` |
| **Port**         | 8080 (default)                           | 8082 (if enabled)                |
| **Dependencies** | `mlx-textgen` package                    | `mlx-lm`, `fastapi`, `uvicorn`   |
| **Performance**  | Production-grade caching                 | Basic performance                |
| **Use Case**     | **Recommended for all users**            | Reference implementation only    |

## Why MLX-Textgen is Production Backend

**MLX-Textgen advantages**:

1. **Better caching**: Disk-based KV cache survives server restarts
2. **Production-grade**: Battle-tested, maintained by external team
3. **Better performance**: 10-90x speedup on follow-up requests
4. **Simpler codebase**: Less maintenance burden

**vLLM-MLX limitations**:

1. In-memory cache only (lost on restart)
2. Custom implementation requires ongoing maintenance
3. No significant advantages over MLX-Textgen
4. Tool calling issues (same as MLX-Textgen)

## Migration Path

### If You're Using vLLM-MLX (Legacy)

**Recommendation**: Switch to MLX-Textgen immediately.

**Steps**:

1. **Update your `.anyclauderc.json`**:

```json
{
  "backend": "mlx-textgen",
  "backends": {
    "mlx-textgen": {
      "enabled": true,
      "port": 8080,
      "baseUrl": "http://localhost:8080/v1",
      "apiKey": "mlx-textgen",
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/mlx-textgen-server.sh"
    }
  }
}
```

2. **Verify MLX-Textgen is installed**:

```bash
pip install mlx-textgen
```

3. **Run anyclaude** (will auto-launch MLX-Textgen):

```bash
anyclaude
```

4. **Benefit from better caching** without any code changes!

### If You're New to anyclaude

**Use MLX-Textgen** from the start:

```bash
# Copy example config
cp .anyclauderc.example.json .anyclauderc.json

# Edit config to set your model path
# backend is already set to "mlx-textgen" by default

# Run anyclaude
anyclaude
```

## Configuration Reference

### MLX-Textgen (Production)

```json
{
  "backend": "mlx-textgen",
  "backends": {
    "mlx-textgen": {
      "enabled": true,
      "port": 8080,
      "baseUrl": "http://localhost:8080/v1",
      "apiKey": "mlx-textgen",
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/mlx-textgen-server.sh"
    }
  }
}
```

**Auto-launch**: Set `model` to full path → server launches automatically

**Manual mode**: Set `model` to `"current-model"` → expects server running

### vLLM-MLX (Legacy - For Reference Only)

```json
{
  "backend": "vllm-mlx-legacy",
  "backends": {
    "vllm-mlx-legacy": {
      "enabled": false,
      "port": 8082,
      "baseUrl": "http://localhost:8082/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/mlx/model",
      "serverScript": "scripts/mlx-server.py"
    }
  }
}
```

**Note**: This backend is disabled by default and **not recommended for production use**.

## Technical Differences

### Caching Implementation

**MLX-Textgen**:

- Disk-based KV cache (survives restarts)
- Automatic cache invalidation
- Cache version tracking
- ~10-90x speedup on cached prompts

**vLLM-MLX**:

- In-memory KV cache (lost on restart)
- Manual cache management
- Response-level caching
- Limited speedup

### Server Implementation

**MLX-Textgen**:

- External package (`mlx-textgen`)
- Shell script launcher (`scripts/mlx-textgen-server.sh`)
- Minimal configuration needed
- Battle-tested in production

**vLLM-MLX**:

- Custom Python server (`scripts/mlx-server.py`)
- ~1800 lines of custom code
- FastAPI + uvicorn stack
- Requires ongoing maintenance

### Tool Calling

**Both backends have the same limitation**:

- Tool calling **FAILS** with local MLX models
- This affects Qwen, GPT OSS, Hermes-3, etc.
- **Workaround**: Use `--mode=claude` or `--mode=openrouter` for tool calling

See `CLAUDE.md` for details on tool calling limitations.

## Why vLLM-MLX Was Archived

The vLLM-MLX backend was archived in v2.2.0 for these reasons:

1. **MLX-Textgen is superior**: Better caching, production-grade, less maintenance
2. **No unique advantages**: vLLM-MLX doesn't solve any problems MLX-Textgen doesn't
3. **Tool calling fails on both**: Both backends have the same tool calling limitation
4. **Maintenance burden**: Custom code requires ongoing updates and testing

The file was **restored in v2.2.1** as `scripts/mlx-server.py` for:

- **Reference implementation**: Shows how to build custom MLX server
- **Educational purposes**: Demonstrates KV caching implementation
- **Legacy support**: Users who need specific vLLM-MLX features

## Troubleshooting

### vLLM-MLX won't start

**Solution**: Use MLX-Textgen instead.

If you must use vLLM-MLX:

```bash
# Check logs
tail ~/.anyclaude/logs/vllm-mlx-server.log

# Verify dependencies
pip install mlx-lm fastapi uvicorn

# Try manual start
python3 scripts/mlx-server.py --model /path/to/model --port 8082
```

### MLX-Textgen won't start

```bash
# Check installation
pip install mlx-textgen

# Verify model path
ls /path/to/your/model

# Check logs
tail ~/.anyclaude/logs/mlx-textgen-server.log

# Enable debug mode
ANYCLAUDE_DEBUG=2 anyclaude
```

### Port conflicts

**Default ports**:

- MLX-Textgen: 8080
- vLLM-MLX: 8082

**To change port**:

```json
{
  "backends": {
    "mlx-textgen": {
      "port": 8090,
      "baseUrl": "http://localhost:8090/v1"
    }
  }
}
```

## Recommendations

**For all users**: Use **MLX-Textgen** (production backend)

**Reasons**:

1. Better performance (disk-based KV caching)
2. Production-grade reliability
3. Less maintenance burden
4. External support from mlx-textgen team
5. Same tool calling limitations as vLLM-MLX

**When to use vLLM-MLX**: Only for reference/educational purposes

## See Also

- [MLX-Textgen Setup Guide](./mlx-textgen-setup.md) - Production backend setup
- [Mode Switching Guide](./mode-switching.md) - Switch between backends
- [CLAUDE.md](../../CLAUDE.md) - Project overview and limitations
- [Architecture Migration](../architecture/mlx-textgen-migration.md) - Technical deep-dive

## Support

**MLX-Textgen** (production): Fully supported, recommended for all users

**vLLM-MLX** (legacy): Reference only, no active support

For tool calling, use `--mode=claude` or `--mode=openrouter` instead of local MLX backends.
