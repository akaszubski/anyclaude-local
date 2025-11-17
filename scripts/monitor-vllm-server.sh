#!/bin/bash
# Monitor MLX server and auto-restart if it dies
# Run this in a separate terminal: ./scripts/monitor-vllm-server.sh

set -e

MODEL_PATH="${1:-/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit}"
PORT="${2:-8081}"

echo "════════════════════════════════════════════════════════════════"
echo "🔄 MLX Server Monitor"
echo "════════════════════════════════════════════════════════════════"
echo "Model: $MODEL_PATH"
echo "Port:  $PORT"
echo ""

RESTART_COUNT=0
MAX_RESTARTS=5

while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting MLX server..."

    # Start the server
    source ~/.venv-mlx/bin/activate
    python scripts/mlx-server.py --model "$MODEL_PATH" --port "$PORT" &
    SERVER_PID=$!

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Server PID: $SERVER_PID"

    # Wait for server to start
    sleep 5

    # Check if server started successfully
    if ! curl -s http://localhost:$PORT/v1/models > /dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Server failed to start"
        RESTART_COUNT=$((RESTART_COUNT + 1))
        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Max restart attempts reached ($MAX_RESTARTS). Giving up."
            exit 1
        fi
        sleep 5
        continue
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Server started successfully"
    RESTART_COUNT=0

    # Monitor the process
    while kill -0 $SERVER_PID 2>/dev/null; do
        # Check if server is responsive every 30 seconds
        if ! curl -s http://localhost:$PORT/v1/models > /dev/null 2>&1; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  Server not responding - will restart"
            break
        fi
        sleep 30
    done

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔴 Server died or became unresponsive"
    RESTART_COUNT=$((RESTART_COUNT + 1))

    if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Max restart attempts reached ($MAX_RESTARTS). Giving up."
        exit 1
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting 5 seconds before restart (attempt $RESTART_COUNT/$MAX_RESTARTS)..."
    sleep 5
done
