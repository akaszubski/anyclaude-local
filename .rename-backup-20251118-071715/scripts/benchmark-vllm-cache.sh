#!/bin/bash
# Benchmark vLLM-MLX cache effectiveness with real measurements

set -e

BASE_URL="${1:-http://localhost:8081}"
SAMPLES="${2:-5}"

echo "=================================================="
echo "vLLM-MLX CACHE PERFORMANCE BENCHMARK"
echo "=================================================="
echo "Server: $BASE_URL"
echo "Samples: $SAMPLES per test"
echo ""

# Check server is running
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "❌ Server not responding at $BASE_URL"
    echo "Start with: PROXY_ONLY=true anyclaude --mode=vllm-mlx"
    exit 1
fi

echo "✓ Server responding"
echo ""

# Function to measure request latency
measure_request() {
    local query="$1"
    local description="$2"

    # Warm up
    curl -s -X POST "$BASE_URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "{\"messages\": [{\"role\": \"user\", \"content\": \"$query\"}], \"stream\": false}" \
        > /dev/null 2>&1

    # Measure
    local total_ms=0
    local latencies=()

    for i in $(seq 1 $SAMPLES); do
        local start_ms=$(date +%s%N | cut -b1-13)

        curl -s -X POST "$BASE_URL/v1/chat/completions" \
            -H "Content-Type: application/json" \
            -d "{\"messages\": [{\"role\": \"user\", \"content\": \"$query\"}], \"stream\": false}" \
            > /dev/null 2>&1

        local end_ms=$(date +%s%N | cut -b1-13)
        local latency=$((end_ms - start_ms))

        latencies+=($latency)
        total_ms=$((total_ms + latency))
    done

    # Calculate stats
    local avg=$((total_ms / SAMPLES))
    local min=${latencies[0]}
    local max=${latencies[0]}

    for lat in "${latencies[@]}"; do
        [ $lat -lt $min ] && min=$lat
        [ $lat -gt $max ] && max=$lat
    done

    echo "Test: $description"
    echo "  Samples: $SAMPLES"
    echo "  Min: ${min}ms"
    echo "  Max: ${max}ms"
    echo "  Avg: ${avg}ms"
    echo "  Latencies: ${latencies[@]}"
    echo ""
}

echo "=================================================="
echo "TEST 1: First Request (UNCACHED)"
echo "=================================================="
measure_request "What is 2+2?" "First request - should be slow (full inference)"

echo "=================================================="
echo "TEST 2: Identical Second Request (SHOULD BE CACHED)"
echo "=================================================="
measure_request "What is 2+2?" "Second identical request - should be much faster if cache works"

echo "=================================================="
echo "TEST 3: Different Query (UNCACHED)"
echo "=================================================="
measure_request "What is 3+3?" "Different query - should be slow again (cache miss)"

echo "=================================================="
echo "TEST 4: Back to First Query (SHOULD BE CACHED)"
echo "=================================================="
measure_request "What is 2+2?" "Repeat of first query - should be fast (cache hit)"

echo "=================================================="
echo "CACHE EFFECTIVENESS ANALYSIS"
echo "=================================================="
echo ""
echo "Interpretation:"
echo "  If Test 1 ≈ Test 2: Cache is NOT working ❌"
echo "  If Test 2 << Test 1 (10x+ faster): Cache IS working ✅"
echo "  If Test 4 << Test 3 (10x+ faster): Cache is working ✅"
echo ""

# Get cache stats from server
echo "Current cache stats from server:"
curl -s "$BASE_URL/health" | jq '.cache' 2>/dev/null || echo "  (Health endpoint not available)"
echo ""

echo "Done!"
