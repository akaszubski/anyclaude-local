#!/bin/bash
# MLX-Textgen Server Launcher for anyclaude
# Replaces vllm-mlx-server.py with production-grade server

set -e

# Parse arguments
MODEL_PATH="${1:-}"
PORT="${2:-8081}"
LOG_FILE="${3:-$HOME/.anyclaude/logs/mlx-textgen-server.log}"

# Validate model path
if [ -z "$MODEL_PATH" ]; then
  echo "Error: MODEL_PATH required" >&2
  echo "Usage: $0 <model_path> [port] [log_file]" >&2
  exit 1
fi

if [ ! -d "$MODEL_PATH" ]; then
  echo "Error: Model not found at $MODEL_PATH" >&2
  exit 1
fi

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Activate virtual environment
VENV_PATH="$HOME/.venv-mlx"
if [ ! -d "$VENV_PATH" ]; then
  echo "Error: Virtual environment not found at $VENV_PATH" >&2
  echo "Run: python3.12 -m venv $VENV_PATH && source $VENV_PATH/bin/activate && pip install mlx-textgen" >&2
  exit 1
fi

source "$VENV_PATH/bin/activate"

# Launch MLX-Textgen
echo "[$(date)] Starting MLX-Textgen server..." >&2
echo "[$(date)] Model: $MODEL_PATH" >&2
echo "[$(date)] Port: $PORT" >&2
echo "[$(date)] Log: $LOG_FILE" >&2

# Start server with KV caching enabled
exec mlx_textgen serve \
  -m "$MODEL_PATH" \
  -p "$PORT" \
  --host 127.0.0.1 \
  --max-capacity 10 \
  >> "$LOG_FILE" 2>&1
