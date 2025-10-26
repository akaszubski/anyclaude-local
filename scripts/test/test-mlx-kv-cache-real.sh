#!/bin/bash

##############################################################################
# MLX-LM KV Cache Performance Test
#
# Purpose: Validate KV cache hypothesis with real MLX-LM server
# Measures: First request vs follow-up latency
# Expected: 100x speedup on follow-ups due to KV cache
##############################################################################

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         MLX-LM KV CACHE PERFORMANCE VALIDATION                 ║"
echo "║     Measuring Real vs Theoretical Speedup                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
MLX_LM_URL="http://localhost:8081/v1"
OUTPUT_DIR="/tmp/mlx-kv-cache-test"
mkdir -p "$OUTPUT_DIR"

# Check MLX-LM is running
echo "1. Checking MLX-LM connection..."
if ! curl -s "$MLX_LM_URL/models" > /dev/null 2>&1; then
    echo "   ✗ MLX-LM not accessible at $MLX_LM_URL"
    echo "   Make sure MLX-LM server is running:"
    echo "   source ~/.venv-mlx/bin/activate"
    echo "   python3 -m mlx_lm server --port 8081"
    exit 1
fi
echo "   ✓ MLX-LM is running"

# Get model name
echo ""
echo "2. Detecting loaded model..."
MODELS=$(curl -s "$MLX_LM_URL/models")
MODEL_NAME=$(echo "$MODELS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$MODEL_NAME" ]; then
    MODEL_NAME="unknown-model"
fi
echo "   Model: $MODEL_NAME"
echo "   Full response: $MODELS" > "$OUTPUT_DIR/models-response.json"

# System prompt (realistic for Claude Code, ~550 tokens)
SYSTEM_PROMPT="You are Claude Code, an expert AI assistant integrated into the Claude IDE.

Your role is to help developers with code analysis, writing and refactoring code, debugging, architecture decisions, testing and validation.

You have access to tools for reading files, writing code, running bash commands, performing git operations, web search, and validation.

Always provide clear, practical solutions with code examples. Format code blocks properly. Explain your reasoning and assumptions. Ask for clarification when needed. Consider edge cases and error handling.

Keep responses concise but complete. Use markdown formatting effectively. When writing code, include comments for complex sections. Be mindful of performance and efficiency. Consider security implications in code suggestions.

Current context: You are helping a developer on the 'anyclaude' project, investigating KV cache performance optimizations."

# Test queries
QUERY_FOLLOWUP_1="What is KV cache?"
QUERY_FOLLOWUP_2="How does it improve LLM performance?"
QUERY_FOLLOWUP_3="Calculate the theoretical speedup for 18,490 token system prompts."

echo ""
echo "3. Benchmark Configuration"
echo "   System prompt: ~550 tokens (Claude Code typical)"
echo "   Test method: Same system prompt, different queries"
echo "   Expected: First request slow, follow-ups fast (KV cache)"
echo ""

# Warm up the model
echo "4. Warming up model..."
curl -s -X POST "$MLX_LM_URL/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{
        "model": "current-model",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 10,
        "temperature": 0.7
    }' > /dev/null 2>&1
echo "   ✓ Warm-up complete"

# Test 1: First request with system prompt (cold start)
echo ""
echo "5. TEST 1: Cold Start (First Request with System Prompt)"
echo "   This should take ~20-40 seconds (system prompt computed from scratch)"
echo ""

start_ms=$(date +%s%3N)

response_1=$(curl -s -X POST "$MLX_LM_URL/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{
        \"model\": \"current-model\",
        \"messages\": [
            {\"role\": \"system\", \"content\": \"$SYSTEM_PROMPT\"},
            {\"role\": \"user\", \"content\": \"$QUERY_FOLLOWUP_1\"}
        ],
        \"max_tokens\": 100,
        \"temperature\": 0.7
    }")

end_ms=$(date +%s%3N)
time_request_1=$((end_ms - start_ms))

echo "$response_1" > "$OUTPUT_DIR/response_1.json"
content_1=$(echo "$response_1" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 100)

echo "   Time: ${time_request_1}ms"
echo "   Response: ${content_1:0:80}..."
echo ""

# Test 2: Follow-up with same system prompt (KV cache should hit)
echo "6. TEST 2: Follow-Up #1 (Same System Prompt, Different Query)"
echo "   With KV cache: Should be ~0.2-1 second (system prompt cached!)"
echo ""

start_ms=$(date +%s%3N)

response_2=$(curl -s -X POST "$MLX_LM_URL/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{
        \"model\": \"current-model\",
        \"messages\": [
            {\"role\": \"system\", \"content\": \"$SYSTEM_PROMPT\"},
            {\"role\": \"user\", \"content\": \"$QUERY_FOLLOWUP_1\"},
            {\"role\": \"assistant\", \"content\": \"$content_1\"},
            {\"role\": \"user\", \"content\": \"$QUERY_FOLLOWUP_2\"}
        ],
        \"max_tokens\": 100,
        \"temperature\": 0.7
    }")

end_ms=$(date +%s%3N)
time_request_2=$((end_ms - start_ms))

echo "$response_2" > "$OUTPUT_DIR/response_2.json"
content_2=$(echo "$response_2" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 100)

echo "   Time: ${time_request_2}ms"
echo "   Response: ${content_2:0:80}..."
echo ""

# Test 3: Another follow-up to confirm cache consistency
echo "7. TEST 3: Follow-Up #2 (Verify KV Cache Consistency)"
echo "   Should also be ~0.2-1 second (same KV cache)"
echo ""

start_ms=$(date +%s%3N)

response_3=$(curl -s -X POST "$MLX_LM_URL/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{
        \"model\": \"current-model\",
        \"messages\": [
            {\"role\": \"system\", \"content\": \"$SYSTEM_PROMPT\"},
            {\"role\": \"user\", \"content\": \"$QUERY_FOLLOWUP_1\"},
            {\"role\": \"assistant\", \"content\": \"$content_1\"},
            {\"role\": \"user\", \"content\": \"$QUERY_FOLLOWUP_2\"},
            {\"role\": \"assistant\", \"content\": \"$content_2\"},
            {\"role\": \"user\", \"content\": \"$QUERY_FOLLOWUP_3\"}
        ],
        \"max_tokens\": 150,
        \"temperature\": 0.7
    }")

end_ms=$(date +%s%3N)
time_request_3=$((end_ms - start_ms))

echo "$response_3" > "$OUTPUT_DIR/response_3.json"
content_3=$(echo "$response_3" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 100)

echo "   Time: ${time_request_3}ms"
echo "   Response: ${content_3:0:80}..."
echo ""

# Analysis
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   RESULTS ANALYSIS                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "Timing Results:"
echo "  Request 1 (cold start):        ${time_request_1}ms"
echo "  Request 2 (follow-up):         ${time_request_2}ms"
echo "  Request 3 (follow-up):         ${time_request_3}ms"
echo ""

# Calculate speedup
if [ $time_request_1 -gt 0 ] && [ $time_request_2 -gt 0 ]; then
    speedup_2=$(( (time_request_1 * 100) / time_request_2 ))
    speedup_2_int=$((speedup_2 / 100))
fi

if [ $time_request_1 -gt 0 ] && [ $time_request_3 -gt 0 ]; then
    speedup_3=$(( (time_request_1 * 100) / time_request_3 ))
    speedup_3_int=$((speedup_3 / 100))
fi

echo "KV Cache Speedup:"
if [ -n "$speedup_2_int" ]; then
    echo "  Request 2 speedup: ${speedup_2_int}x faster than Request 1"
fi
if [ -n "$speedup_3_int" ]; then
    echo "  Request 3 speedup: ${speedup_3_int}x faster than Request 1"
fi
echo ""

# Interpretation
echo "Interpretation:"
if [ $time_request_1 -gt 1000 ] && [ $time_request_2 -lt 1000 ]; then
    echo "  ✅ KV Cache is working!"
    echo "     • Request 1 (cold): ${time_request_1}ms → Full computation"
    echo "     • Request 2 (warm): ${time_request_2}ms → System prompt cached!"

    if [ -n "$speedup_2_int" ] && [ $speedup_2_int -gt 10 ]; then
        echo "     • Speedup: ${speedup_2_int}x (exceeds expectation!)"
    fi
else
    echo "  ⚠️  Unexpected timing pattern"
    echo "     Request 1: ${time_request_1}ms"
    echo "     Request 2: ${time_request_2}ms"
    echo "     Check if MLX-LM is fully loaded and responsive"
fi
echo ""

# Real-world impact calculation
echo "Real-World Impact (10 Queries in Claude Code Session):"
without_cache=$((time_request_1 * 10))
with_cache=$((time_request_1 + (time_request_2 * 9)))
improvement=$(( (without_cache - with_cache) * 100 / without_cache ))

echo "  Without KV cache (LMStudio): ${without_cache}ms (~${without_cache}s)"
echo "  With KV cache (MLX-LM):      ${with_cache}ms (~${with_cache}s)"
echo "  Improvement:                  ${improvement}%"
echo ""

# Save results to JSON
cat > "$OUTPUT_DIR/results.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model": "$MODEL_NAME",
  "tests": {
    "request_1": {
      "description": "Cold start with system prompt",
      "time_ms": $time_request_1
    },
    "request_2": {
      "description": "Follow-up with KV cache",
      "time_ms": $time_request_2,
      "speedup_vs_request_1": "${speedup_2_int}x"
    },
    "request_3": {
      "description": "Another follow-up with KV cache",
      "time_ms": $time_request_3,
      "speedup_vs_request_1": "${speedup_3_int}x"
    }
  },
  "kv_cache_validation": {
    "working": $([ $time_request_2 -lt $((time_request_1 / 2)) ] && echo "true" || echo "false"),
    "speedup_achieved": "${speedup_2_int}x",
    "system_prompt_caching": $([ $time_request_2 -lt 1000 ] && echo "verified" || echo "not_detected")
  }
}
EOF

echo "Results saved to: $OUTPUT_DIR/results.json"
echo ""
echo "Next: Compare with LMStudio benchmark to show the difference"
