# MLX Official Server Incompatibility

**Date**: 2025-11-20
**Issue**: Official `mlx_lm.server` does not support local model paths

## Problem

The official `mlx_lm.server` from `pipx install mlx-lm` has a critical limitation:

- ❌ **Does not accept local file paths** (e.g., `/path/to/model`)
- ✅ **Only accepts HuggingFace repo IDs** (e.g., `mlx-community/Llama-3.2-3B-Instruct-4bit`)

### Error Example

```bash
~/.local/bin/mlx_lm.server \
  --model "/Users/me/models/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081

# Error:
huggingface_hub.errors.HFValidationError: Repo id must be in the form 'repo_name'
or 'namespace/repo_name': '/Users/me/models/...'. Use `repo_type` argument if needed.
```

### Root Cause

The official server uses `huggingface_hub.snapshot_download()` which validates repo IDs and rejects file paths.

See: `mlx_lm/utils.py:101` in the official library.

## Impact

1. **Cannot use locally downloaded models** - must have internet connection
2. **Must re-download models** even if already on disk
3. **No control over model location** - downloads to cache directory
4. **Incompatible with our use case** - we want offline local model support

## Custom Server Advantages

Our custom MLX server (`scripts/mlx-server.py`):

- ✅ **Accepts local file paths**
- ✅ **No internet required** after initial model download
- ✅ **100-200x faster** with RAM-based KV caching
- ✅ **Tool calling works** perfectly
- ✅ **vLLM-inspired features** (cache warmup, request queuing, etc.)

## Decision

**Stay with custom server** for the following reasons:

1. Local model support is essential
2. RAM cache provides massive speedup (100-200x on follow-up requests)
3. Custom implementation is stable and well-tested
4. Tool calling fully functional

## Action Items

1. ❌ Cancel migration to official `mlx_lm.server`
2. ✅ Keep using `scripts/mlx-server.py` as default
3. ✅ Update documentation to clarify why we use custom server
4. ✅ Revert any changes made during attempted migration

## References

- Official server code: `mlx_lm/utils.py` (uses HuggingFace Hub exclusively)
- Our custom server: `scripts/mlx-server.py`
- Previous attempt: `docs/debugging/mlx-official-server-migration.md`
