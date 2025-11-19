# Archived: mlx-server.py

**Date Archived:** 2025-11-16
**Reason:** Replaced with MLX-Textgen (production-grade solution)

## Why Archived

The custom `mlx-server.py` (1400 lines) was replaced with MLX-Textgen because:

1. **MLX KV caching Python API doesn't exist** - Our implementation was broken
2. **MLX-Textgen provides production-ready alternative** with working KV caching
3. **10-90x performance improvement** - Follow-up requests now take 0.5-3s instead of 45-50s
4. **Less maintenance burden** - 1400 lines of custom code → `pip install mlx-textgen`
5. **Better caching** - Multi-slot disk cache vs broken single cache

## Performance Comparison

| Metric             | mlx-server.py | MLX-Textgen       | Improvement    |
| ------------------ | ------------- | ----------------- | -------------- |
| First request      | ~50 seconds   | ~3 seconds        | **15x faster** |
| Follow-up requests | ~50 seconds   | **~0.55 seconds** | **90x faster** |
| KV Cache           | ❌ Broken     | ✅ Working        | N/A            |
| Cache files        | None created  | 26MB safetensors  | ✅             |
| Code complexity    | 1400 lines    | pip package       | Simplified     |

## What Was Replaced

**Old:** `scripts/mlx-server.py`

- Custom FastAPI server
- Manual tool calling parsing (Harmony, Qwen XML formats)
- Broken KV caching implementation
- Single-slot response cache
- 1400 lines of Python code

**New:** `scripts/mlx-textgen-server.sh`

- Wrapper script for MLX-Textgen pip package
- Native tool calling support
- Working disk-based KV caching
- Multi-slot automatic cache management
- ~40 lines of shell script

## Rollback Procedure

If needed, restore the old server:

```bash
# 1. Copy old server back
cp scripts/archive/mlx-server.py scripts/

# 2. Update .anyclauderc.json
# Change: "serverScript": "scripts/mlx-textgen-server.sh"
# To:     "serverScript": "scripts/mlx-server.py"

# 3. Restart anyclaude
pkill -f mlx_textgen
anyclaude --mode=mlx
```

## Files in Archive

- `mlx-server.py` - Original custom server (working state before migration)
- `mlx-server.py.backup` - Backup copy created during migration
- `README.md` - This file

## Migration Documentation

For full migration details, see:

- `docs/architecture/mlx-textgen-migration.md` - Design document
- `docs/architecture/mlx-textgen-implementation-plan.md` - Step-by-step plan
- Git commit message for this migration

---

## Restoration (v2.2.1)

**Date Restored:** 2025-11-17
**Restored As:** `scripts/mlx-server.py`

The MLX server was restored as a **legacy reference backend** for:

1. **Educational purposes** - Shows how to implement custom MLX server
2. **Reference implementation** - Demonstrates KV caching patterns
3. **Legacy support** - Users who need specific MLX features

**Important Notes:**

- **MLX-Textgen remains production backend** (recommended for all users)
- Restored file is located at `scripts/mlx-server.py` (not in archive)
- Disabled by default in `.anyclauderc.example.json`
- Both MLX backends have same tool calling limitations
- See `docs/guides/mlx-migration.md` for migration guide

**Configuration:**

```json
{
  "backend": "mlx-legacy",
  "backends": {
    "mlx-legacy": {
      "enabled": false,
      "port": 8082,
      "serverScript": "scripts/mlx-server.py"
    }
  }
}
```

**Restoration validates:**

- File integrity (1803 lines, ~80KB)
- Executable permissions
- Python syntax validity
- Security patterns (no hardcoded secrets, safe path handling)
- Integration with config and documentation

---

**Note:** These files are kept for historical reference and potential rollback. They may be deleted in a future release (v3.0+) once MLX-Textgen integration is proven stable.
