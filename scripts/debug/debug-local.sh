#!/bin/bash

# Enhanced debug mode for anyclaude + LMStudio
# This script enables maximum debug verbosity to help diagnose streaming issues

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}  anyclaude - Enhanced Debug Mode${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Check if LMStudio is running
echo -e "${YELLOW}[1/5]${NC} Checking LMStudio server..."
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} LMStudio server is running on http://localhost:1234"

    # Get available models
    MODELS_JSON=$(curl -s http://localhost:1234/v1/models)
    AVAILABLE_MODELS=($(echo "$MODELS_JSON" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"id"[[:space:]]*:[[:space:]]*"//g' | sed 's/"//g'))

    echo ""
    echo -e "${YELLOW}Available models:${NC}"
    for model in "${AVAILABLE_MODELS[@]}"; do
        echo -e "  - $model"
    done
    echo ""
else
    echo -e "${RED}✗${NC} LMStudio server is NOT running!"
    echo -e "${YELLOW}Please start LMStudio and enable the server.${NC}"
    exit 1
fi

# Load configuration
echo -e "${YELLOW}[2/5]${NC} Loading configuration..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ -f "$SCRIPT_DIR/.env.lmstudio" ]; then
    source "$SCRIPT_DIR/.env.lmstudio"
fi

# Auto-detect model
if [ ${#AVAILABLE_MODELS[@]} -eq 0 ]; then
    echo -e "${RED}✗${NC} No models loaded in LMStudio!"
    exit 1
elif [ ${#AVAILABLE_MODELS[@]} -eq 1 ]; then
    AUTO_DETECTED_MODEL="${AVAILABLE_MODELS[0]}"
    export LMSTUDIO_MODEL="$AUTO_DETECTED_MODEL"
    echo -e "${GREEN}✓${NC} Auto-detected model: ${GREEN}${AUTO_DETECTED_MODEL}${NC}"
else
    if [ -n "$LMSTUDIO_MODEL" ] && echo "$MODELS_JSON" | grep -q "\"$LMSTUDIO_MODEL\""; then
        echo -e "${GREEN}✓${NC} Using configured model: ${GREEN}${LMSTUDIO_MODEL}${NC}"
    else
        AUTO_DETECTED_MODEL="${AVAILABLE_MODELS[0]}"
        export LMSTUDIO_MODEL="$AUTO_DETECTED_MODEL"
        echo -e "${GREEN}✓${NC} Auto-selected first model: ${GREEN}${AUTO_DETECTED_MODEL}${NC}"
    fi
fi

# Configure failover
if [ -z "$LMSTUDIO_URL" ]; then
    export LMSTUDIO_URL=http://localhost:1234/v1
fi
if [ -z "$FORCE_LMSTUDIO" ]; then
    export FORCE_LMSTUDIO=true
fi

echo ""
echo -e "${YELLOW}[3/5]${NC} Configuring debug settings..."

# Enable MAXIMUM debug verbosity
export ANYCLAUDE_DEBUG=2

echo -e "${GREEN}✓${NC} Debug level: ${BLUE}2 (VERBOSE)${NC}"
echo -e "${GREEN}✓${NC} Force LMStudio: ${BLUE}${FORCE_LMSTUDIO}${NC}"
echo -e "${GREEN}✓${NC} LMStudio URL: ${BLUE}${LMSTUDIO_URL}${NC}"
echo -e "${GREEN}✓${NC} LMStudio Model: ${BLUE}${LMSTUDIO_MODEL}${NC}"

echo ""
echo -e "${YELLOW}[4/5]${NC} Setting up debug output..."

# Create debug log directory
DEBUG_DIR="$SCRIPT_DIR/debug-logs"
mkdir -p "$DEBUG_DIR"

# Generate timestamp for this debug session
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
DEBUG_LOG="$DEBUG_DIR/debug-${TIMESTAMP}.log"

echo -e "${GREEN}✓${NC} Debug logs will be saved to: ${BLUE}${DEBUG_LOG}${NC}"
echo ""
echo -e "${BLUE}Debug output will show:${NC}"
echo -e "  - Every stream chunk received from LMStudio (first 10 at level 1, all at level 2)"
echo -e "  - Chunk processing details and timing"
echo -e "  - Any unhandled chunk types that cause errors"
echo -e "  - Full error details including empty pipeline errors"
echo ""

echo -e "${YELLOW}[5/5]${NC} Starting Claude Code with enhanced debugging..."
echo -e "${BLUE}=============================================${NC}"
echo ""
echo -e "${YELLOW}TIP: The debug output will be very verbose!${NC}"
echo -e "${YELLOW}     Look for these key messages:${NC}"
echo -e "  - ${GREEN}[Stream Conversion] Raw chunk N${NC} - Shows incoming chunks"
echo -e "  - ${RED}⚠️  Unhandled chunk type${NC} - Shows problematic chunks"
echo -e "  - ${RED}Pipeline aborted${NC} - Shows stream cancellation"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop anyclaude${NC}"
echo ""

cd "$SCRIPT_DIR"

# Check for bun
if command -v bun &> /dev/null; then
    BUN_CMD=bun
elif [ -f ~/.bun/bin/bun ]; then
    BUN_CMD=~/.bun/bin/bun
else
    echo -e "${RED}✗${NC} Bun not found"
    exit 1
fi

# Run with full output to terminal AND log file
"$BUN_CMD" run src/main.ts "$@" 2>&1 | tee "$DEBUG_LOG"
