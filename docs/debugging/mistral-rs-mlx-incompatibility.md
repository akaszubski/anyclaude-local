# mistral.rs and MLX Model Incompatibility

**Date**: 2025-11-22
**Status**: ✅ Resolved - Solution documented

## Problem

Attempted to use mistral.rs with MLX-quantized models:

```bash
./mistralrs-server \
  --port 8082 \
  plain \
  -m "/Users/andrewkaszubski/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  -a qwen3
```

**Error:**

```
Error: cannot find tensor model.layers.0.mlp.gate_proj.weight
```

## Root Cause

**mistral.rs uses Candle framework**, which expects:

- GGUF format (from llama.cpp)
- Standard safetensors (unquantized or GPTQ/AWQ)

**MLX models use Apple's MLX framework**, which has its own quantization format:

- Incompatible tensor names/structure
- Different quantization metadata
- MLX-specific optimizations

**Frameworks are incompatible!**

## Solution

### Option 1: Use GGUF Models with mistral.rs (Recommended)

```bash
# Download a GGUF model
pip3 install huggingface_hub

python3 << 'EOF'
from huggingface_hub import hf_hub_download
import os

model_id = "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF"
filename = "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf"
dest_dir = os.path.expanduser("~/Models/Qwen2.5-Coder-7B-Instruct-GGUF")

path = hf_hub_download(
    repo_id=model_id,
    filename=filename,
    local_dir=dest_dir,
    local_dir_use_symlinks=False
)
print(f"Downloaded to: {path}")
EOF

# Use with mistral.rs
./mistralrs-server \
  --port 8082 \
  gguf \
  -m "$HOME/Models/Qwen2.5-Coder-7B-Instruct-GGUF/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf" \
  -a qwen2
```

### Option 2: Keep Using MLX Server for MLX Models

Your custom MLX server (`scripts/mlx-server.py`) works perfectly with MLX models:

```bash
# Keep using your existing setup
anyclaude  # Uses custom MLX server with your MLX models
```

## Framework Comparison

| Feature            | mistral.rs (Candle) | Custom MLX Server         |
| ------------------ | ------------------- | ------------------------- |
| **Language**       | Rust                | Python                    |
| **Framework**      | Candle + Metal      | MLX                       |
| **Model Formats**  | GGUF, safetensors   | MLX-quantized             |
| **Your Models**    | ❌ Incompatible     | ✅ Compatible             |
| **PagedAttention** | ✅ Yes              | ❌ No                     |
| **RAM KV Cache**   | ❌ No               | ✅ Yes (100-200x speedup) |
| **Memory Usage**   | Lower (Rust)        | Higher (Python)           |
| **Tool Calling**   | ✅ Yes              | ✅ Yes                    |

## Recommendation

**For now:** Stick with your custom MLX server

- ✅ Works with your existing models
- ✅ Has working RAM KV cache
- ✅ Tool calling works
- ✅ You've already invested time debugging it

**Future:** Try mistral.rs if you want to explore alternatives

- Download a GGUF model (~4GB for 7B Q4)
- Test performance with PagedAttention
- Compare against MLX server

## Files Updated

1. **Setup Guide**: `docs/guides/mistralrs-setup-guide.md`
   - Added ⚠️ Model Compatibility section
   - GGUF download instructions
   - Clear warning about MLX incompatibility

2. **Test Script**: `scripts/test-mistralrs-step-by-step.sh`
   - Added Step 2.5: GGUF model check/download
   - Updated server startup to use GGUF format
   - Fixed architecture flag (qwen2 instead of mlx)

3. **Benchmark Script**: `scripts/benchmark-mistralrs.sh`
   - Updated to use GGUF model path
   - Proper architecture flag
   - Auto-download prompts

## Quick Start (if you want to try mistral.rs)

```bash
# 1. Run the step-by-step setup script
./scripts/test-mistralrs-step-by-step.sh

# This will:
# - Check if mistralrs is built
# - Prompt to download GGUF model if needed
# - Start server and test it

# 2. If successful, run benchmark
./scripts/benchmark-mistralrs.sh
```

## References

- [mistral.rs GitHub](https://github.com/EricLBuehler/mistral.rs)
- [Candle Framework](https://github.com/huggingface/candle)
- [GGUF Format](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)
- [MLX Framework](https://github.com/ml-explore/mlx)
