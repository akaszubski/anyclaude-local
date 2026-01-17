#!/bin/bash
# Benchmark safe filter tiers

echo "=== Safe Filter Tier Benchmark ==="
echo "MLX Worker: http://localhost:8081/v1"
echo ""

# Test message - simple request that triggers the full system prompt
REQUEST='{"model":"claude-4-sonnet","max_tokens":50,"messages":[{"role":"user","content":"Say hello"}]}'

benchmark_tier() {
    local tier=$1
    local filter=$2

    echo "--- Testing: $tier ---"

    # Update config
    if [ "$filter" = "none" ]; then
        cat > .anyclauderc.json << 'CONF'
{
  "backend": "lmstudio",
  "backends": {
    "lmstudio": {
      "enabled": true,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-worker",
      "model": "current-model",
      "truncateSystemPrompt": false,
      "safeSystemFilter": false
    }
  }
}
CONF
    else
        cat > .anyclauderc.json << CONF
{
  "backend": "lmstudio",
  "backends": {
    "lmstudio": {
      "enabled": true,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-worker",
      "model": "current-model",
      "truncateSystemPrompt": false,
      "safeSystemFilter": true,
      "filterTier": "$filter"
    }
  }
}
CONF
    fi

    # Start proxy in background
    PROXY_ONLY=true bun run ./src/main.ts > /tmp/proxy.log 2>&1 &
    PROXY_PID=$!
    sleep 2

    # Get proxy URL from log
    PROXY_URL=$(grep "Proxy URL:" /tmp/proxy.log | awk '{print $NF}')

    if [ -z "$PROXY_URL" ]; then
        echo "  Failed to start proxy"
        kill $PROXY_PID 2>/dev/null
        return
    fi

    # Benchmark request (time to completion)
    START=$(python3 -c 'import time; print(time.time())')

    RESPONSE=$(curl -s -X POST "$PROXY_URL/v1/messages" \
        -H "Content-Type: application/json" \
        -H "x-api-key: test" \
        -H "anthropic-version: 2023-06-01" \
        -d "$REQUEST" 2>&1)

    END=$(python3 -c 'import time; print(time.time())')

    DURATION=$(python3 -c "print(f'{($END - $START):.2f}')")

    # Check if response was successful
    if echo "$RESPONSE" | grep -q "text"; then
        echo "  Time: ${DURATION}s"
    else
        echo "  Time: ${DURATION}s (may have errored)"
    fi

    # Cleanup
    kill $PROXY_PID 2>/dev/null
    wait $PROXY_PID 2>/dev/null
    sleep 1
}

# Verify MLX worker is running
if ! curl -s http://localhost:8081/health > /dev/null; then
    echo "ERROR: MLX worker not running on port 8081"
    exit 1
fi

echo "Running benchmarks (this will take a few minutes)..."
echo ""

benchmark_tier "No Filter (baseline)" "none"
benchmark_tier "Minimal" "minimal"
benchmark_tier "Moderate" "moderate"
benchmark_tier "Aggressive" "aggressive"
benchmark_tier "Extreme" "extreme"

echo ""
echo "=== Benchmark Complete ==="
