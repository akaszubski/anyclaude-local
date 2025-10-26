#!/bin/bash

# anyclaude Local Mode - Forces all requests to LMStudio
# Usage: ./start-local.sh [claude code arguments]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  anyclaude - LMStudio Local Mode${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Check if LMStudio is running
echo -e "${YELLOW}[1/4]${NC} Checking LMStudio server..."
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} LMStudio server is running on http://localhost:1234"

    # Get available models
    MODELS_JSON=$(curl -s http://localhost:1234/v1/models)
    AVAILABLE_MODELS=($(echo "$MODELS_JSON" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"id"[[:space:]]*:[[:space:]]*"//g' | sed 's/"//g'))

    # Show available models
    echo ""
    echo -e "${YELLOW}Available models:${NC}"
    for model in "${AVAILABLE_MODELS[@]}"; do
        echo -e "  - $model"
    done
    echo ""
else
    echo -e "${RED}✗${NC} LMStudio server is NOT running!"
    echo -e "${YELLOW}Please start LMStudio and enable the server before running this script.${NC}"
    exit 1
fi

# Load configuration
echo -e "${YELLOW}[2/4]${NC} Auto-detecting LMStudio model..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load existing config if available
if [ -f "$SCRIPT_DIR/.env.lmstudio" ]; then
    source "$SCRIPT_DIR/.env.lmstudio"
fi

# Auto-detect model from LMStudio
if [ ${#AVAILABLE_MODELS[@]} -eq 0 ]; then
    echo -e "${RED}✗${NC} No models loaded in LMStudio!"
    echo -e "${YELLOW}Please load a model in LMStudio first.${NC}"
    exit 1
elif [ ${#AVAILABLE_MODELS[@]} -eq 1 ]; then
    # Only one model loaded - use it automatically
    AUTO_DETECTED_MODEL="${AVAILABLE_MODELS[0]}"
    export LMSTUDIO_MODEL="$AUTO_DETECTED_MODEL"
    echo -e "${GREEN}✓${NC} Auto-detected model: ${GREEN}${AUTO_DETECTED_MODEL}${NC}"
else
    # Multiple models loaded - use first one or configured one if valid
    if [ -n "$LMSTUDIO_MODEL" ] && echo "$MODELS_JSON" | grep -q "\"$LMSTUDIO_MODEL\""; then
        echo -e "${GREEN}✓${NC} Using configured model: ${GREEN}${LMSTUDIO_MODEL}${NC}"
    else
        AUTO_DETECTED_MODEL="${AVAILABLE_MODELS[0]}"
        export LMSTUDIO_MODEL="$AUTO_DETECTED_MODEL"
        echo -e "${GREEN}✓${NC} Auto-selected first model: ${GREEN}${AUTO_DETECTED_MODEL}${NC}"
        echo -e "${YELLOW}   (Set LMSTUDIO_MODEL in .env.lmstudio to choose a different one)${NC}"
    fi
fi

# Ensure other required vars are set
if [ -z "$LMSTUDIO_URL" ]; then
    export LMSTUDIO_URL=http://localhost:1234/v1
fi
if [ -z "$FORCE_LMSTUDIO" ]; then
    export FORCE_LMSTUDIO=true
fi

# Skip the manual verification step since we already confirmed the model exists
echo ""
echo -e "${YELLOW}[3/4]${NC} Model verified and ready"

# Start anyclaude
echo ""
echo -e "${YELLOW}[4/4]${NC} Starting Claude Code with LMStudio backend..."
echo -e "${GREEN}=====================================${NC}"
echo ""

cd "$SCRIPT_DIR"

# Check if bun is available
if command -v bun &> /dev/null; then
    exec bun run src/main.ts "$@"
elif [ -f "$SCRIPT_DIR/dist/main.js" ]; then
    exec node "$SCRIPT_DIR/dist/main.js" "$@"
else
    echo -e "${RED}✗${NC} Error: Neither bun nor built dist/main.js found"
    echo -e "${YELLOW}Please run: bun run build${NC}"
    exit 1
fi
