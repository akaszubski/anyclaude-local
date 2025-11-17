#!/bin/bash

# Compare OpenRouter Models
#
# Tests multiple models using real Claude Code tool call scenarios
# Measures speed, accuracy, and functionality

set -e

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RESET='\033[0m'

# Default models to test
MODELS=(
  "qwen/qwen3-coder"
  "google/gemini-2.5-flash-lite"
  "openai/gpt-4o"
  "deepseek/deepseek-chat-v3.1"
)

# Check for API key
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo -e "${RED}Error: OPENROUTER_API_KEY not found${RESET}"
  echo ""
  echo "Option 1: Add to .env file (recommended):"
  echo "  echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> .env"
  echo ""
  echo "Option 2: Export as environment variable:"
  echo "  export OPENROUTER_API_KEY='sk-or-v1-...'"
  echo ""
  echo "Get your API key from: https://openrouter.ai/keys"
  exit 1
fi

# Parse arguments
if [ "$1" == "--models" ]; then
  shift
  MODELS=("$@")
fi

if [ ${#MODELS[@]} -eq 0 ]; then
  echo -e "${RED}Error: No models specified${RESET}"
  echo "Usage: $0 [--models model1 model2 ...]"
  exit 1
fi

echo "================================================================================"
echo "OPENROUTER MODEL COMPARISON"
echo "================================================================================"
echo ""
echo "Testing ${#MODELS[@]} models:"
for model in "${MODELS[@]}"; do
  echo "  - $model"
done
echo ""
echo "Tests:"
echo "  1. Simple Read Tool Call"
echo "  2. Complex Question Tool Call (AskUserQuestion)"
echo "  3. Bash Command Tool Call"
echo ""
echo "================================================================================"

# Results storage
RESULTS_DIR="$HOME/.anyclaude/model-comparison"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="$RESULTS_DIR/comparison-$TIMESTAMP.txt"

echo "Results will be saved to: $RESULTS_FILE"
echo ""

# Run tests for each model
for model in "${MODELS[@]}"; do
  echo ""
  echo "================================================================================"
  echo "Testing: $model"
  echo "================================================================================"

  # Run test and capture output
  if node tests/integration/test-model-validation.js "$model" | tee -a "$RESULTS_FILE"; then
    echo -e "${GREEN}✓ $model passed all tests${RESET}" | tee -a "$RESULTS_FILE"
  else
    echo -e "${RED}✗ $model failed some tests${RESET}" | tee -a "$RESULTS_FILE"
  fi

  echo "" | tee -a "$RESULTS_FILE"
done

# Generate comparison summary
echo ""
echo "================================================================================"
echo "COMPARISON SUMMARY"
echo "================================================================================"
echo ""

# Extract timing data from results
echo "Response Times (average across all tests):"
echo ""

for model in "${MODELS[@]}"; do
  # Extract average time from results file
  avg_time=$(grep -A 20 "MODEL VALIDATION TEST: $model" "$RESULTS_FILE" | grep "Average response time:" | awk '{print $4}')

  if [ -n "$avg_time" ]; then
    echo "  $model: $avg_time"
  else
    echo "  $model: N/A (tests failed)"
  fi
done

echo ""
echo "Test Success Rates:"
echo ""

for model in "${MODELS[@]}"; do
  # Extract pass/fail counts
  results=$(grep -A 20 "MODEL VALIDATION TEST: $model" "$RESULTS_FILE" | grep "Tests:" | head -1)

  if [ -n "$results" ]; then
    echo "  $model: $results"
  else
    echo "  $model: N/A (tests failed to run)"
  fi
done

echo ""
echo "================================================================================"
echo "Full results saved to: $RESULTS_FILE"
echo "================================================================================"
