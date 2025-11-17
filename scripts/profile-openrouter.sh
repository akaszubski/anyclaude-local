#!/bin/bash
#
# OpenRouter Model Profiling Script
#
# Usage:
#   ./scripts/profile-openrouter.sh <model-id>
#
# Example:
#   ./scripts/profile-openrouter.sh "qwen/qwen3-coder"
#   ./scripts/profile-openrouter.sh "deepseek/deepseek-chat-v3.1"
#

MODEL="${1:-qwen/qwen3-coder}"
PROFILE_DIR="$HOME/.anyclaude/profiles"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PROFILE_FILE="$PROFILE_DIR/profile-${MODEL//\//-}-$TIMESTAMP.txt"

# Create profile directory
mkdir -p "$PROFILE_DIR"

echo "=========================================="
echo "OpenRouter Model Profiling"
echo "=========================================="
echo "Model: $MODEL"
echo "Timestamp: $TIMESTAMP"
echo "Profile will be saved to: $PROFILE_FILE"
echo ""

# Update .anyclauderc.json to use the specified model
echo "Updating .anyclauderc.json with model: $MODEL"
TEMP_CONFIG=$(mktemp)
jq --arg model "$MODEL" '.backends.openrouter.model = $model' .anyclauderc.json > "$TEMP_CONFIG"
mv "$TEMP_CONFIG" .anyclauderc.json

# Test prompts
PROMPTS=(
  "who are you?"
  "read README.md and give me a one-sentence summary"
  "list the main source files in src/"
)

# Start profiling
{
  echo "=========================================="
  echo "OpenRouter Model Profile"
  echo "=========================================="
  echo "Model: $MODEL"
  echo "Date: $(date)"
  echo "Config: .anyclauderc.json"
  echo ""

  # Test each prompt
  for i in "${!PROMPTS[@]}"; do
    PROMPT="${PROMPTS[$i]}"
    echo ""
    echo "----------------------------------------"
    echo "Test $((i+1)): $PROMPT"
    echo "----------------------------------------"

    # Record start time
    START_TIME=$(date +%s.%N)

    # Run the prompt (with timeout)
    # Use full path to anyclaude or fallback to PATH lookup
    ANYCLAUDE_CMD="${ANYCLAUDE_CMD:-$(which anyclaude 2>/dev/null || echo '/opt/homebrew/bin/anyclaude')}"
    echo "$PROMPT" | timeout 120s "$ANYCLAUDE_CMD" --mode=openrouter > /tmp/anyclaude-profile-output.txt 2>&1
    EXIT_CODE=$?

    # Record end time
    END_TIME=$(date +%s.%N)
    DURATION=$(echo "$END_TIME - $START_TIME" | bc)

    echo "Duration: ${DURATION}s"
    echo "Exit code: $EXIT_CODE"

    if [ $EXIT_CODE -eq 124 ]; then
      echo "Status: TIMEOUT (>120s)"
    elif [ $EXIT_CODE -eq 0 ]; then
      echo "Status: SUCCESS"
    else
      echo "Status: FAILED"
    fi

    # Check trace logs for token usage
    LATEST_TRACE=$(ls -t ~/.anyclaude/traces/openrouter/*.json 2>/dev/null | head -1)
    if [ -f "$LATEST_TRACE" ]; then
      echo ""
      echo "Trace analysis:"

      # Extract timing and token info
      jq -r '
        "  Request time: " + (.timestamp // "N/A") +
        "\n  Model: " + (.request.body.model // "N/A") +
        "\n  Tools called: " + ((.response.body.content // []) | map(select(.type == "tool_use") | .name) | join(", ") // "none")
      ' "$LATEST_TRACE" 2>/dev/null || echo "  (trace parse failed)"
    fi
  done

  echo ""
  echo "=========================================="
  echo "Summary"
  echo "=========================================="
  echo "Model: $MODEL"
  echo "Total tests: ${#PROMPTS[@]}"
  echo "Profile saved to: $PROFILE_FILE"
  echo ""

} | tee "$PROFILE_FILE"

echo ""
echo "Profile complete! View results:"
echo "  cat $PROFILE_FILE"
echo ""
echo "Compare with other profiles:"
echo "  ls -lht $PROFILE_DIR/"
