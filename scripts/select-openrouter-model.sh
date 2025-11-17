#!/bin/bash

#
# Interactive OpenRouter Model Selector
#
# Usage:
#   ./scripts/select-openrouter-model.sh
#
# Features:
# - Browse curated list of coding-optimized models
# - See pricing, context limits, and performance
# - One-command model switching (updates .anyclauderc.json)
# - Benchmark comparison from previous runs
#

set -e

CONFIG_FILE=".anyclauderc.json"
BENCHMARKS_DIR="$HOME/.anyclaude/benchmarks"

# Color codes for better UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Model catalog - curated for coding tasks
# Format: "model_id|display_name|input_price|output_price|context|speed_rating|description"
MODELS=(
  "google/gemini-2.5-flash-lite|Gemini 2.5 Flash Lite|0.10|0.40|1M|⚡⚡⚡ Fastest|🏆 NEW WINNER! Fastest + cheapest + 1M context"
  "qwen/qwen3-coder|Qwen3 Coder 480B|0.22|0.95|262K|⚡⚡ Fast|Great balance - Large context, fast, affordable"
  "deepseek/deepseek-chat-v3.1|DeepSeek V3.1|0.20|0.80|160K|⚡ Moderate|Cheapest option, good for simple tasks"
  "google/gemini-2.5-flash|Gemini 2.5 Flash|0.30|2.50|1M|⚡⚡ Fast|Premium Gemini, 1M context window"
  "openai/gpt-4o|GPT-4o|5.00|15.00|128K|⚡⚡⚡ Fastest|Premium speed, highest cost"
  "openai/gpt-4o-mini|GPT-4o Mini|0.15|0.60|128K|⚡⚡ Fast|Budget GPT-4o, fast and cheap"
  "anthropic/claude-3.5-sonnet|Claude 3.5 Sonnet|3.00|15.00|200K|⚡⚡ Fast|Real Claude via OpenRouter"
  "meta-llama/llama-3.3-70b-instruct|Llama 3.3 70B|0.35|0.40|128K|⚡⚡ Fast|Good balance of speed and cost"
  "qwen/qwen-2.5-72b-instruct|Qwen 2.5 72B|0.35|0.70|128K|⚡⚡ Fast|Alternative to Qwen3, slightly cheaper"
  "z-ai/glm-4.6|GLM-4.6|0.60|2.00|200K|🐌 Slow|Avoid - Very slow (64s+ response time)"
)

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}    OpenRouter Model Selector for anyclaude${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get current model
CURRENT_MODEL=$(jq -r '.backends.openrouter.model // "none"' "$CONFIG_FILE" 2>/dev/null)
echo -e "${CYAN}Current model:${NC} ${BOLD}${CURRENT_MODEL}${NC}"
echo ""

# Check for benchmark data
LATEST_BENCHMARK=$(ls -t "$BENCHMARKS_DIR"/api-benchmark-*.txt 2>/dev/null | head -1)
if [ -f "$LATEST_BENCHMARK" ]; then
  BENCHMARK_DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$LATEST_BENCHMARK" 2>/dev/null || stat -c "%y" "$LATEST_BENCHMARK" 2>/dev/null | cut -d' ' -f1-2)
  echo -e "${GRAY}Benchmark data available from: $BENCHMARK_DATE${NC}"
  echo ""
fi

echo -e "${BOLD}Available Models:${NC}"
echo ""

# Display models with numbering
i=1
for model_entry in "${MODELS[@]}"; do
  IFS='|' read -r model_id display_name input_price output_price context speed description <<< "$model_entry"

  # Highlight current model
  if [ "$model_id" = "$CURRENT_MODEL" ]; then
    PREFIX="${GREEN}▶${NC}"
    CURRENT_MARKER="${GREEN} (current)${NC}"
  else
    PREFIX=" "
    CURRENT_MARKER=""
  fi

  # Get benchmark time if available
  BENCH_TIME=""
  if [ -f "$LATEST_BENCHMARK" ]; then
    BENCH_TIME=$(grep -A 3 "^Model: $model_id" "$LATEST_BENCHMARK" 2>/dev/null | grep "API Time:" | cut -d' ' -f3 || echo "")
    if [ -n "$BENCH_TIME" ]; then
      BENCH_TIME="${GRAY} | Bench: ${BENCH_TIME}${NC}"
    fi
  fi

  echo -e "${PREFIX} ${BOLD}${i}.${NC} ${BOLD}${display_name}${NC}${CURRENT_MARKER}"
  echo -e "    ${GRAY}Model:${NC} ${model_id}"
  echo -e "    ${GRAY}Price:${NC} \$${input_price}/\$${output_price} per 1M tokens | ${GRAY}Context:${NC} ${context} | ${GRAY}Speed:${NC} ${speed}${BENCH_TIME}"
  echo -e "    ${GRAY}${description}${NC}"
  echo ""

  i=$((i + 1))
done

echo -e "${BOLD}Options:${NC}"
echo -e "  ${BOLD}1-${#MODELS[@]}${NC}  Select a model"
echo -e "  ${BOLD}b${NC}      Run benchmark on all models (~2 min)"
echo -e "  ${BOLD}s${NC}      Show full benchmark results"
echo -e "  ${BOLD}q${NC}      Quit without changes"
echo ""

# Prompt for selection
read -p "$(echo -e ${BOLD}Select option:${NC} )" choice

case "$choice" in
  q|Q)
    echo ""
    echo "No changes made."
    exit 0
    ;;
  b|B)
    echo ""
    echo -e "${YELLOW}Running benchmark on all models...${NC}"
    echo -e "${GRAY}This will take about 2 minutes${NC}"
    echo ""

    # Check if benchmark script exists
    if [ ! -f "/tmp/quick-benchmark.sh" ]; then
      echo -e "${RED}Error: Benchmark script not found${NC}"
      echo "Run this command first:"
      echo "  ./scripts/create-benchmark-script.sh"
      exit 1
    fi

    /tmp/quick-benchmark.sh
    echo ""
    echo -e "${GREEN}Benchmark complete!${NC}"
    echo ""
    echo "Run this script again to see updated benchmark times."
    exit 0
    ;;
  s|S)
    echo ""
    if [ -f "$LATEST_BENCHMARK" ]; then
      echo -e "${BOLD}Benchmark Results:${NC}"
      echo ""
      cat "$LATEST_BENCHMARK"
    else
      echo -e "${RED}No benchmark data available${NC}"
      echo "Run option 'b' to benchmark all models"
    fi
    exit 0
    ;;
  [1-9])
    # Validate choice
    if [ "$choice" -lt 1 ] || [ "$choice" -gt "${#MODELS[@]}" ]; then
      echo ""
      echo -e "${RED}Invalid selection: $choice${NC}"
      exit 1
    fi

    # Get selected model
    selected_index=$((choice - 1))
    selected_entry="${MODELS[$selected_index]}"
    IFS='|' read -r new_model display_name input_price output_price context speed description <<< "$selected_entry"

    echo ""
    echo -e "${BOLD}Selected:${NC} ${display_name}"
    echo -e "${GRAY}Model ID:${NC} ${new_model}"
    echo ""

    # Backup config
    cp "$CONFIG_FILE" "${CONFIG_FILE}.backup"

    # Update config
    jq --arg model "$new_model" '.backends.openrouter.model = $model' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
    mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

    echo -e "${GREEN}✓ Updated .anyclauderc.json${NC}"
    echo -e "${GRAY}  Backup saved to: ${CONFIG_FILE}.backup${NC}"
    echo ""
    echo -e "${BOLD}Ready to use!${NC}"
    echo ""
    echo "Start anyclaude with:"
    echo -e "  ${CYAN}anyclaude --mode=openrouter${NC}"
    echo ""

    # Show cost estimate
    echo -e "${BOLD}Cost estimate (per 1M tokens):${NC}"
    echo -e "  Input:  \$${input_price}"
    echo -e "  Output: \$${output_price}"
    echo -e "  ${GRAY}Context window: ${context}${NC}"
    echo ""
    ;;
  *)
    echo ""
    echo -e "${RED}Invalid option: $choice${NC}"
    exit 1
    ;;
esac
