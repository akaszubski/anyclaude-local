#!/bin/bash
# Compare performance between fast and slow models in LMStudio
# This script captures timing, prompt size, and identifies bottlenecks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TRACE_DIR="$HOME/.anyclaude/traces/performance-comparison"

mkdir -p "$TRACE_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Model Performance Comparison Tool"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script will help identify bottlenecks by comparing:"
echo "  1. Prompt sizes sent to each model"
echo "  2. Time to first token (TTFT)"
echo "  3. Tokens per second during generation"
echo "  4. Total request time"
echo ""
echo "Traces will be saved to: $TRACE_DIR"
echo ""

# Function to extract timing from anyclaude debug logs
measure_request() {
    local model_name="$1"
    local test_prompt="$2"
    local output_file="$3"

    echo ""
    echo "Testing model: $model_name"
    echo "─────────────────────────────────────────────────────"

    # Start timestamp
    local start_time=$(date +%s%N)

    # Run a simple test request with full debug logging
    # We'll capture the output to analyze timing
    echo "$test_prompt" | ANYCLAUDE_DEBUG=3 anyclaude 2>&1 | tee "$output_file"

    # End timestamp
    local end_time=$(date +%s%N)

    # Calculate duration in milliseconds
    local duration_ms=$(( (end_time - start_time) / 1000000 ))

    echo ""
    echo "Total request time: ${duration_ms}ms"
    echo ""

    return 0
}

# Test prompt - simple enough to complete quickly but triggers the full system
TEST_PROMPT="Write a simple hello world function in Python. Keep it short."

echo "Step 1: Testing FAST model (gpt-oss-20b)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Instructions:"
echo "1. Load 'gpt-oss-20b' in LMStudio"
echo "2. Press Enter when ready"
read -p "Ready? " _

measure_request "gpt-oss-20b" "$TEST_PROMPT" "$TRACE_DIR/fast-model-debug.log"

echo ""
echo "Step 2: Testing SLOW model (qwen3-42b)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Instructions:"
echo "1. Load your 42B thinking model in LMStudio"
echo "2. Press Enter when ready"
read -p "Ready? " _

measure_request "qwen3-42b-thinking" "$TEST_PROMPT" "$TRACE_DIR/slow-model-debug.log"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Analysis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Analyze the debug logs
echo "Analyzing debug logs..."
echo ""

# Extract key metrics from fast model
echo "FAST MODEL (gpt-oss-20b):"
echo "─────────────────────────────────────────────────────"

if [ -f "$TRACE_DIR/fast-model-debug.log" ]; then
    # Extract request start time
    fast_request_start=$(grep "\[Request Start\]" "$TRACE_DIR/fast-model-debug.log" | head -1)
    echo "Request start: $fast_request_start"

    # Extract prompt details
    fast_prompt_info=$(grep "\[Request Details\]" "$TRACE_DIR/fast-model-debug.log" | head -1)
    echo "$fast_prompt_info"

    # Count chunks streamed
    fast_chunk_count=$(grep -c "\[Stream Conversion\] Received chunk" "$TRACE_DIR/fast-model-debug.log" || echo "0")
    echo "Chunks streamed: $fast_chunk_count"

    # Extract completion time
    fast_completion=$(grep "\[Request Complete\]" "$TRACE_DIR/fast-model-debug.log" | head -1)
    echo "Completion: $fast_completion"
fi

echo ""
echo "SLOW MODEL (qwen3-42b-thinking):"
echo "─────────────────────────────────────────────────────"

if [ -f "$TRACE_DIR/slow-model-debug.log" ]; then
    # Extract request start time
    slow_request_start=$(grep "\[Request Start\]" "$TRACE_DIR/slow-model-debug.log" | head -1)
    echo "Request start: $slow_request_start"

    # Extract prompt details
    slow_prompt_info=$(grep "\[Request Details\]" "$TRACE_DIR/slow-model-debug.log" | head -1)
    echo "$slow_prompt_info"

    # Count chunks streamed
    slow_chunk_count=$(grep -c "\[Stream Conversion\] Received chunk" "$TRACE_DIR/slow-model-debug.log" || echo "0")
    echo "Chunks streamed: $slow_chunk_count"

    # Extract completion time
    slow_completion=$(grep "\[Request Complete\]" "$TRACE_DIR/slow-model-debug.log" | head -1)
    echo "Completion: $slow_completion"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Trace Files Saved"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Check these files for detailed analysis:"
echo "  Fast model: $TRACE_DIR/fast-model-debug.log"
echo "  Slow model: $TRACE_DIR/slow-model-debug.log"
echo ""
echo "Look for:"
echo "  - Prompt size differences (toolCount, messageCount, system prompt length)"
echo "  - Time to first chunk (Keepalive messages = slow prompt processing)"
echo "  - Chunk count differences (thinking models generate more tokens)"
echo ""

# Check for keepalive messages (indicates slow prompt processing)
echo "Checking for slow prompt processing..."
fast_keepalives=$(grep -c "\[Keepalive\]" "$TRACE_DIR/fast-model-debug.log" 2>/dev/null || echo "0")
slow_keepalives=$(grep -c "\[Keepalive\]" "$TRACE_DIR/slow-model-debug.log" 2>/dev/null || echo "0")

echo "  Fast model keepalives: $fast_keepalives (fewer = faster prompt processing)"
echo "  Slow model keepalives: $slow_keepalives (more = slower prompt processing)"

if [ "$slow_keepalives" -gt "$fast_keepalives" ]; then
    echo ""
    echo "⚠️  FINDING: Slow model took longer to process the prompt!"
    echo "    This suggests LMStudio is slow, not anyclaude proxy."
    echo "    Large models need more time to process the system prompt."
fi

# Check chunk counts
if [ "$slow_chunk_count" -gt "$((fast_chunk_count * 2))" ]; then
    echo ""
    echo "⚠️  FINDING: Slow model generated ${slow_chunk_count} chunks"
    echo "    vs fast model's ${fast_chunk_count} chunks."
    echo "    Thinking models generate reasoning tokens + answer tokens."
    echo "    More chunks = more proxy overhead."
fi

echo ""
echo "Next steps:"
echo "  1. Check if prompt sizes are similar"
echo "  2. If slow model has more keepalives → LMStudio is bottleneck"
echo "  3. If similar keepalives but slow chunks → proxy overhead"
echo "  4. Consider switching to vLLM-MLX for better large model performance"
echo ""
