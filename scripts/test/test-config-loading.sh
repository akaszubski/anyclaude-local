#!/bin/bash

# Test script for configuration file loading
# This script verifies that AnyClaude properly loads and uses configuration files

set -e

PROJECT_DIR="/Users/akaszubski/Documents/GitHub/anyclaude"
TEST_DIR="/tmp/anyclaude-config-test"
CONFIG_FILE="$TEST_DIR/.anyclauderc.json"

echo "========================================"
echo "AnyClaude Configuration Loading Tests"
echo "========================================"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up test directory..."
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Create test directory
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Test 1: Default behavior (no config file)
echo "Test 1: Default behavior (no config file)"
echo "Expected: Mode: LMSTUDIO (default)"
echo "Command: cd $TEST_DIR && PROXY_ONLY=true node $PROJECT_DIR/dist/main.js"
echo ""
PROXY_ONLY=true timeout 3 node "$PROJECT_DIR/dist/main.js" 2>&1 | grep "Mode:" || true
echo ""

# Test 2: Config file with lmstudio backend
echo "Test 2: Configuration file with LMStudio backend"
echo "Expected: Mode: LMSTUDIO (from config)"
cat > "$CONFIG_FILE" << 'EOF'
{
  "backend": "lmstudio",
  "backends": {
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1",
      "model": "custom-model"
    }
  }
}
EOF
echo "Config file created:"
cat "$CONFIG_FILE" | sed 's/^/  /'
echo ""
echo "Command: PROXY_ONLY=true node $PROJECT_DIR/dist/main.js"
echo ""
PROXY_ONLY=true timeout 3 node "$PROJECT_DIR/dist/main.js" 2>&1 | grep -E "Mode:|Config:|LMStudio endpoint:" || true
echo ""

# Test 3: Config file with mlx-lm backend
echo "Test 3: Configuration file with MLX-LM backend"
echo "Expected: Mode: MLX-LM (from config)"
cat > "$CONFIG_FILE" << 'EOF'
{
  "backend": "mlx-lm",
  "backends": {
    "mlx-lm": {
      "baseUrl": "http://localhost:8081/v1",
      "model": "qwen3-custom"
    }
  }
}
EOF
echo "Config file created:"
cat "$CONFIG_FILE" | sed 's/^/  /'
echo ""
echo "Command: PROXY_ONLY=true node $PROJECT_DIR/dist/main.js"
echo ""
PROXY_ONLY=true timeout 3 node "$PROJECT_DIR/dist/main.js" 2>&1 | grep -E "Mode:|Config:|MLX-LM endpoint:" || true
echo ""

# Test 4: Environment variable overrides config file
echo "Test 4: Environment variable overrides config file"
echo "Expected: Mode: LMSTUDIO (from env var, overriding config)"
cat > "$CONFIG_FILE" << 'EOF'
{
  "backend": "mlx-lm"
}
EOF
echo "Config file (mlx-lm):"
cat "$CONFIG_FILE" | sed 's/^/  /'
echo ""
echo "Command: ANYCLAUDE_MODE=lmstudio PROXY_ONLY=true node $PROJECT_DIR/dist/main.js"
echo ""
ANYCLAUDE_MODE=lmstudio PROXY_ONLY=true timeout 3 node "$PROJECT_DIR/dist/main.js" 2>&1 | grep "Mode:" || true
echo ""

# Test 5: Backend configuration from file
echo "Test 5: Backend configuration from file"
echo "Expected: Custom endpoint configuration"
cat > "$CONFIG_FILE" << 'EOF'
{
  "backend": "mlx-lm",
  "backends": {
    "mlx-lm": {
      "baseUrl": "http://custom-host:9999/v1",
      "apiKey": "custom-key",
      "model": "custom-model"
    }
  }
}
EOF
echo "Config file with custom settings:"
cat "$CONFIG_FILE" | sed 's/^/  /'
echo ""
echo "Command: PROXY_ONLY=true node $PROJECT_DIR/dist/main.js"
echo ""
PROXY_ONLY=true timeout 3 node "$PROJECT_DIR/dist/main.js" 2>&1 | grep -E "Mode:|Config:|MLX-LM endpoint:|Model:" || true
echo ""

# Test 6: Environment variable overrides backend URL
echo "Test 6: Environment variable overrides backend URL"
echo "Expected: Override endpoint from env var"
cat > "$CONFIG_FILE" << 'EOF'
{
  "backend": "mlx-lm",
  "backends": {
    "mlx-lm": {
      "baseUrl": "http://localhost:8081/v1"
    }
  }
}
EOF
echo "Config file (localhost):"
cat "$CONFIG_FILE" | sed 's/^/  /'
echo ""
echo "Command: MLX_LM_URL=http://override:9999/v1 PROXY_ONLY=true node $PROJECT_DIR/dist/main.js"
echo ""
MLX_LM_URL="http://override:9999/v1" PROXY_ONLY=true timeout 3 node "$PROJECT_DIR/dist/main.js" 2>&1 | grep "MLX-LM endpoint:" || true
echo ""

echo "========================================"
echo "All configuration tests completed!"
echo "========================================"
