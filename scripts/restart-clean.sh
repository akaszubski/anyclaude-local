#!/bin/bash
# Clean restart script for anyclaude development
# Kills MLX worker, rebuilds, and prepares for fresh start

set -e

echo "🔄 Clean restart for anyclaude..."

# Kill any existing MLX worker
if pgrep -f "mlx_worker" > /dev/null; then
    echo "   Killing existing MLX worker..."
    pkill -f "mlx_worker" || true
    sleep 1
fi

# Rebuild TypeScript
echo "   Rebuilding TypeScript..."
cd "$(dirname "$0")/.."
bun run build

echo ""
echo "✅ Ready! Now run: anyclaude"
echo "   (MLX worker will start fresh with latest code)"
