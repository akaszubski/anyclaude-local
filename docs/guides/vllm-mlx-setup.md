# vLLM-MLX Setup Guide

This guide walks you through setting up and using vLLM-MLX with anyclaude for high-performance local model inference on Apple Silicon Macs.

## What is vLLM-MLX?

**vLLM-MLX** combines:

- **vLLM**: A production-grade inference engine with advanced features like prompt caching and continuous batching
- **MLX**: Apple's machine learning framework optimized for Apple Silicon (M1/M2/M3+)

This gives you:

- Fast inference on Apple hardware
- Support for larger models (up to 70B parameters)
- Prompt caching for better performance with repeated queries
- Better tool calling support than MLX-LM

## Prerequisites

- macOS with Apple Silicon (M1/M2/M3 or later)
- Python 3.9 or later (check with `python3 --version`)
- At least 16GB RAM (32GB+ recommended for larger models)
- A model already downloaded (see [Model Setup](#model-setup) below)

## Quick Start

### 1. Setup the Virtual Environment

```bash
cd /path/to/anyclaude
scripts/setup-vllm-mlx-venv.sh
```

This script will:

- Create a Python virtual environment at `~/.venv-mlx`
- Install all required dependencies (mlx, vllm-mlx, certifi, etc.)
- Verify the installation

The setup takes 5-10 minutes depending on your internet connection.

### 2. Configure Your Model

Edit `.anyclauderc.json` in your anyclaude directory:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/model",
      "description": "vLLM-MLX with your chosen model"
    }
  }
}
```

Replace `/path/to/your/model` with the actual path to your downloaded model.

### 3. Launch anyclaude

```bash
# Default (uses vllm-mlx backend from config)
anyclaude

# Or explicitly specify
anyclaude --mode=vllm-mlx

# With debug logging
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx
```

anyclaude will:

1. Check if the venv exists (if not, show setup instructions)
2. Activate the venv automatically
3. Start the vLLM-MLX server
4. Wait for the model to load (~20-30 seconds)
5. Launch Claude Code connected to the local server

## Model Setup

### Where to Get Models

vLLM-MLX works with quantized models optimized for MLX. Popular sources:

**Hugging Face** (recommended):

- [MLX Community Models](https://huggingface.co/mlx-community) - Official MLX models
- Look for models ending in `-MLX` or `-mlx-4bit`

**Example Models**:

| Model                  | Size | Use Case         | Link                                                                                                                              |
| ---------------------- | ---- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Qwen3-Coder-30B-MLX    | 30B  | Code generation  | [mlx-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit](https://huggingface.co/mlx-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit) |
| DeepSeek-Coder-33B-MLX | 33B  | Code + reasoning | [mlx-community/DeepSeek-Coder-33B-Instruct-MLX-4bit](https://huggingface.co/mlx-community/DeepSeek-Coder-33B-Instruct-MLX-4bit)   |
| Llama2-70B-Chat-MLX    | 70B  | General purpose  | [mlx-community/Llama2-70B-Chat-MLX](https://huggingface.co/mlx-community/Llama2-70B-Chat-MLX)                                     |

### Download a Model

Using `huggingface-hub`:

```bash
python3 -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit', local_dir='~/models/qwen3-coder-30b')"
```

Or manually clone:

```bash
git clone https://huggingface.co/mlx-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit ~/models/qwen3-coder-30b
```

### Model Storage Recommendations

Keep models in a consistent location:

```
~/ai-models/              # or ~/.cache/models/ or /Volumes/ExternalDrive/models/
├── qwen3-coder-30b/
├── deepseek-coder-33b/
└── llama2-70b-chat/
```

Then update `.anyclauderc.json`:

```json
"vllm-mlx": {
  "model": "/Users/yourname/ai-models/qwen3-coder-30b"
}
```

## Troubleshooting

### Virtual Environment Issues

**Error: "Python virtual environment not found"**

```bash
scripts/setup-vllm-mlx-venv.sh
```

**Error: "cannot import name 'where' from 'certifi'"**

This means certifi is corrupted. The setup script fixes this:

```bash
scripts/setup-vllm-mlx-venv.sh
```

If you need to manually fix it:

```bash
source ~/.venv-mlx/bin/activate
pip install --upgrade --force-reinstall certifi
```

### Model Loading Issues

**Error: "Model path not found"**

- Check the path in `.anyclauderc.json`
- Make sure the model is fully downloaded
- Use absolute paths, not relative paths

**Error: "Model failed to load" or timeout**

- First model load takes 20-30 seconds - be patient
- Check available disk space
- Check RAM usage (`top -stats memory`)
- Try a smaller model first (e.g., 13B instead of 70B)

### Performance Issues

**Server is slow:**

1. Check if other processes are consuming CPU/GPU
2. Reduce other app memory usage
3. Try a smaller/faster model
4. Check debug logs: `ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx`

**Out of memory errors:**

- Close other apps
- Try a smaller model quantization (e.g., 4-bit)
- Reduce max_tokens in prompts

## Advanced Configuration

### Custom Port

To use a different port:

```json
{
  "backends": {
    "vllm-mlx": {
      "port": 9000,
      "baseUrl": "http://localhost:9000/v1"
    }
  }
}
```

### Disable Auto-Launch

If you prefer to start the server manually:

```bash
ANYCLAUDE_NO_AUTO_LAUNCH=true anyclaude --mode=vllm-mlx
```

Then in another terminal:

```bash
source ~/.venv-mlx/bin/activate
python3 scripts/vllm-mlx-server.py --model /path/to/model --port 8081
```

### Environment Variables

```bash
# Control debug output
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx    # Basic debug
ANYCLAUDE_DEBUG=2 anyclaude --mode=vllm-mlx    # Verbose
ANYCLAUDE_DEBUG=3 anyclaude --mode=vllm-mlx    # Trace (includes tool calls)

# Custom venv path
export VENV_PATH=/custom/path/.venv
anyclaude --mode=vllm-mlx

# Disable auto-launch
export ANYCLAUDE_NO_AUTO_LAUNCH=true
anyclaude --mode=vllm-mlx
```

## Performance Tips

### Model Selection

For Claude Code (code generation & tool use):

- **Best**: Qwen3-Coder-30B (balanced speed + quality)
- **Fast**: DeepSeek-Coder-6.7B (smaller, still good)
- **Powerful**: DeepSeek-Coder-33B or Llama2-70B (slower but better reasoning)

### Batch Size & Context

Edit `scripts/vllm-mlx-server.py` if needed:

```python
# Default batch size (good for 32GB+ RAM)
# Reduce for 16GB systems:
max_num_seqs = 4  # default: 8
```

### Prompt Optimization

- Keep system prompts concise
- Use shorter context windows
- Batch multiple queries together

## Comparing with Other Backends

| Feature        | vLLM-MLX    | MLX-LM         | LMStudio      |
| -------------- | ----------- | -------------- | ------------- |
| Speed          | ⚡⚡⚡ Fast | ⚡⚡ Moderate  | ⚡⚡ Moderate |
| Tool Calling   | ✓ Good      | ⚠️ Basic       | ✓ Good        |
| Prompt Caching | ✓ Yes       | ✗ No           | ⚠️ Limited    |
| Setup          | Script      | Manual         | GUI app       |
| Memory         | Efficient   | Very efficient | Medium        |
| Model size     | Up to 70B   | Up to 30B      | Unlimited     |

## See Also

- [MLX Documentation](https://ml-explore.github.io/mlx/build/html/index.html)
- [vLLM Documentation](https://docs.vllm.ai/)
- [anyclaude README](../../README.md)
- [Model Adapters Architecture](../architecture/model-adapters.md)
