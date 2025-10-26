# Using Local Models with AnyClaude

## The Key Discovery

**MLX-Omni-Server only accepts HuggingFace model IDs**, not local file paths.

Your Qwen3-Coder-30B model at `/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit` **requires MLX-LM**, which supports both local paths and HuggingFace IDs.

## Quick Start with Your Local Model

```bash
export MLX_MODEL="/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
./anyclaude mlx-lm
```

That's it! The launcher will:
1. Start MLX-LM server with your model on port 8081
2. Wait for the model to load (~2-5 minutes depending on model size)
3. Spawn Claude Code connected to it
4. Give you a unified Ctrl+C to stop everything

## How AnyClaude Handles Models

### MLX-Omni Mode (Default)
```bash
./anyclaude mlx-omni
# or just: ./anyclaude
```

**Accepts:**
- HuggingFace model IDs: `mlx-community/Qwen2.5-1.5B-Instruct-4bit`
- Set via: `MLX_MODEL="mlx-community/Qwen2.5-1.5B-Instruct-4bit" ./anyclaude`

**Does NOT accept:**
- Local file paths (will silently ignore them)
- `/path/to/local/model` format

**Why?** MLX-Omni-Server is specifically designed for HuggingFace models and implements native Anthropic API format.

### MLX-LM Mode
```bash
./anyclaude mlx-lm
```

**Accepts:**
- Local file paths: `/Users/akaszubski/ai-tools/.../Qwen3-Coder-30B...`
- HuggingFace model IDs: `mlx-community/Qwen2.5-1.5B-Instruct-4bit`
- Both work interchangeably

**Set the model:**
```bash
# Option 1: Environment variable
export MLX_MODEL="/path/to/your/model"
./anyclaude mlx-lm

# Option 2: Command line argument (if supported in launcher)
./anyclaude mlx-lm "/path/to/your/model"

# Option 3: Default (uses env var or HuggingFace ID)
./anyclaude mlx-lm
```

## Model Size vs Performance

| Model | Approx Size | Load Time | Speed | Quality | Use Case |
|-------|------------|-----------|-------|---------|----------|
| Qwen2.5-0.5B | ~350MB | ~10s | ⚡⚡⚡⚡⚡ | Testing, CI/CD |
| Qwen2.5-1.5B | ~1GB | ~20s | ⚡⚡⚡⚡ | Default, balanced |
| Qwen2.5-3B | ~2GB | ~30s | ⚡⚡⚡ | Better quality |
| **Qwen3-Coder-30B** | **~18GB** | **~2-5min** | ⚡ | Best quality, code gen |

The Qwen3-Coder-30B takes longer to load but provides significantly better code generation and reasoning.

## Troubleshooting

**"Server failed to start"**
- Check that the model path exists: `ls /Users/akaszubski/ai-tools/lmstudio/...`
- Check the logs: `tail -f /tmp/anyclaude-mlx-lm-logs/mlx-lm-server.log`
- Ensure you have 18GB+ free disk space for Qwen3-Coder-30B

**"Still waiting... (30/120)"**
- This is normal for large models (Qwen3-Coder-30B takes ~5 minutes)
- The launcher waits up to 120 seconds (2 minutes), increase if needed: `MLX_LM_TIMEOUT=300 ./anyclaude mlx-lm`
- Monitor model loading: `tail -f /tmp/anyclaude-mlx-lm-logs/mlx-lm-server.log`

**"Virtual environment not found"**
- Create it: `python3 -m venv ~/.venv-mlx`
- Install MLX-LM: `source ~/.venv-mlx/bin/activate && pip install mlx-lm`

**"ModuleNotFoundError: No module named 'mlx_lm'"**
- Install MLX-LM in your venv:
  ```bash
  source ~/.venv-mlx/bin/activate
  pip install mlx-lm
  ```

## Architecture Differences

### MLX-Omni
```
Claude Code ← AnyClaude Proxy ← MLX-Omni-Server ← HuggingFace Model
  (Anthropic)   (translates)    (Anthropic API)   (downloaded)
```

- Translates Anthropic API ↔ Anthropic API (native format)
- Downloads models from HuggingFace on first use
- Native tool calling support via Anthropic format

### MLX-LM
```
Claude Code ← AnyClaude Proxy ← MLX-LM Server ← Local Model OR HuggingFace
  (Anthropic)   (translates)    (OpenAI API)   (path or auto-download)
```

- Translates Anthropic API ↔ OpenAI Chat Completions
- Uses local file paths or downloads from HuggingFace
- Converts tool calling between formats

## Performance Notes

**First query:** ~30s (system prompt computed and cached)
**Follow-up queries:** <1s (using KV cache)

Large models like Qwen3-Coder-30B have the same cache benefits as smaller models once loaded.

## When to Use Each

**Use MLX-Omni (default):**
- You want the smallest, fastest setup
- You're using HuggingFace community models
- You want native Anthropic API format

**Use MLX-LM with your local model:**
- You have a large model like Qwen3-Coder-30B
- You want better code generation quality
- You need a local model path that doesn't exist on HuggingFace

## Next Steps

1. Set your model: `export MLX_MODEL="/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"`
2. Start AnyClaude: `./anyclaude mlx-lm`
3. Wait for model to load (2-5 minutes)
4. Use Claude Code as normal - it's just Claude, but local!

---

**Note:** This guide documents the architectural limitation discovered during MLX-Omni integration testing. MLX-Omni-Server is specifically designed for HuggingFace models, which is why MLX-LM is recommended for local model paths.
