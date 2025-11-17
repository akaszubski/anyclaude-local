#!/bin/bash
# Real-world test of anyclaude with actual workload
# Generates traces and analyzes results

set -e

echo "════════════════════════════════════════════════════════════════"
echo "🧪 ANYCLAUDE REAL-WORLD TEST"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check vLLM server is running
if ! curl -s http://localhost:8081/v1/models > /dev/null 2>&1; then
    echo "❌ MLX server not running on port 8081"
    echo ""
    echo "Start it in another terminal:"
    echo "  source ~/.venv-mlx/bin/activate"
    echo "  python scripts/mlx-server.py --model /path/to/model --port 8081"
    exit 1
fi

echo "✅ MLX server running"
echo ""

# Check anyclaude is built
if [ ! -f "dist/main.js" ]; then
    echo "❌ anyclaude not built"
    echo "Building..."
    bun run build > /dev/null 2>&1
    echo "✅ Build complete"
    echo ""
fi

# Get timestamp for this test run
TEST_ID=$(date '+%Y%m%d-%H%M%S')
TEST_DIR="/tmp/anyclaude-test-$TEST_ID"
mkdir -p "$TEST_DIR"

echo "Test ID: $TEST_ID"
echo "Test dir: $TEST_DIR"
echo ""

# Clear old traces before test
echo "1️⃣  Clearing old traces..."
rm -rf ~/.anyclaude/traces/mlx/*
echo "✅ Cleared"
echo ""

# Test 1: Simple prompt (should create cache)
echo "2️⃣  Test 1: Initial prompt (CREATE CACHE)..."
echo "════════════════════════════════════════════════════════════════"

TEST_INPUT="Who are you?"

ANYCLAUDE_DEBUG=0 anyclaude << EOF
$TEST_INPUT
/exit
EOF

echo ""
sleep 2

# Test 2: Different prompt (should HIT cache - same system prompt)
echo "3️⃣  Test 2: Second prompt (CACHE HIT)..."
echo "════════════════════════════════════════════════════════════════"

TEST_INPUT2="Tell me a joke"

ANYCLAUDE_DEBUG=0 anyclaude << EOF
$TEST_INPUT2
/exit
EOF

echo ""
sleep 2

# Test 3: Another prompt (should HIT cache again)
echo "4️⃣  Test 3: Third prompt (CACHE HIT)..."
echo "════════════════════════════════════════════════════════════════"

TEST_INPUT3="What is 2+2?"

ANYCLAUDE_DEBUG=0 anyclaude << EOF
$TEST_INPUT3
/exit
EOF

echo ""
sleep 2

# Analyze results
echo "════════════════════════════════════════════════════════════════"
echo "📊 TEST RESULTS & ANALYSIS"
echo "════════════════════════════════════════════════════════════════"
echo ""

python scripts/analyze-traces.py > "$TEST_DIR/analysis.txt"
cat "$TEST_DIR/analysis.txt"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📈 INTERPRETATION"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Count cache hits
TRACE_FILES=$(ls ~/.anyclaude/traces/mlx/*.json 2>/dev/null | wc -l)

echo "Total Requests: $TRACE_FILES"
echo ""

if [ $TRACE_FILES -lt 3 ]; then
    echo "⚠️  Expected 3+ traces, got $TRACE_FILES"
    echo "   This might mean requests failed or weren't saved"
    exit 1
fi

# Get cache stats from newest traces
echo "Expected behavior:"
echo "  Request 1: Cache MISS (create cache)"
echo "  Request 2: Cache HIT (reuse cache)"
echo "  Request 3: Cache HIT (reuse cache)"
echo ""

# Check for cache hits in traces
echo "Actual behavior (from analysis above):"

FIRST_TRACE=$(ls -t ~/.anyclaude/traces/mlx/*.json 2>/dev/null | tail -1)
SECOND_TRACE=$(ls -t ~/.anyclaude/traces/mlx/*.json 2>/dev/null | tail -2 | head -1)

if [ ! -z "$FIRST_TRACE" ]; then
    python << EOF
import json

# Analyze first request
with open("$FIRST_TRACE") as f:
    data = json.load(f)
    usage = data.get("response", {}).get("body", {}).get("usage", {})
    cache_created = usage.get("cache_creation_input_tokens", 0)
    cache_read = usage.get("cache_read_input_tokens", 0)

    if cache_created > 0:
        print(f"  Request 1: ✅ Cache created ({cache_created} tokens)")
    elif cache_read > 0:
        print(f"  Request 1: Cache hit ({cache_read} tokens)")
    else:
        print(f"  Request 1: ⚠️  No cache activity")
EOF
fi

echo ""
echo "✅ Test complete!"
echo ""
echo "Files saved:"
echo "  Traces: ~/.anyclaude/traces/mlx/*.json"
echo "  Analysis: $TEST_DIR/analysis.txt"
echo ""
echo "Next steps:"
echo "  1. Review trace files: ls -lh ~/.anyclaude/traces/mlx/"
echo "  2. See detailed analysis: python scripts/analyze-traces.py"
echo "  3. View specific trace: python scripts/analyze-traces.py --detail 0"
echo ""
