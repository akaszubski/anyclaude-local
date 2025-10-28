#!/bin/bash
##
# Complete setup script for anyclaude
# Installs all dependencies and configures everything needed to run anyclaude
##

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         anyclaude Complete Setup                               ║${NC}"
echo -e "${BLUE}║         This will install all dependencies for vLLM-MLX         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Claude CLI is installed
echo -e "${YELLOW}🔍 Checking Claude CLI installation...${NC}"
if ! command -v claude &> /dev/null; then
    echo -e "${RED}❌ Claude CLI not found${NC}"
    echo ""
    echo -e "${YELLOW}Installing Claude CLI...${NC}"
    npm install -g @anthropic-ai/sdk
    if command -v claude &> /dev/null; then
        echo -e "${GREEN}✅ Claude CLI installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install Claude CLI${NC}"
        echo "Please install manually: npm install -g @anthropic-ai/sdk"
        exit 1
    fi
else
    CLAUDE_VERSION=$(claude --version 2>&1)
    echo -e "${GREEN}✅ Claude CLI found: ${CLAUDE_VERSION}${NC}"

    # Check for Claude Code Max (web version)
    if echo "$CLAUDE_VERSION" | grep -q -i "max\|web\|cloud"; then
        echo -e "${RED}❌ ERROR: Claude Code Max (web) is incompatible with anyclaude${NC}"
        echo ""
        echo "anyclaude requires the LOCAL Claude Code CLI tool"
        echo "Please uninstall Claude Code Max and install the local version:"
        echo "  npm install -g @anthropic-ai/sdk"
        exit 1
    fi
fi
echo ""

# Check Python installation
echo -e "${YELLOW}🔍 Checking Python installation...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found${NC}"
    echo "Please install Python 3.11 or later"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo -e "${GREEN}✅ Python ${PYTHON_VERSION} found${NC}"
echo ""

# Setup Python virtual environment
echo -e "${YELLOW}🔨 Setting up Python virtual environment...${NC}"
VENV_PATH="$HOME/.venv-mlx"

if [ -d "$VENV_PATH" ]; then
    echo "Virtual environment already exists at $VENV_PATH"
    read -p "Recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$VENV_PATH"
        python3 -m venv "$VENV_PATH"
        echo -e "${GREEN}✅ Virtual environment recreated${NC}"
    else
        echo "Skipping virtual environment setup"
    fi
else
    python3 -m venv "$VENV_PATH"
    echo -e "${GREEN}✅ Virtual environment created at ${VENV_PATH}${NC}"
fi
echo ""

# Activate venv and install dependencies
echo -e "${YELLOW}📦 Installing Python dependencies...${NC}"
source "$VENV_PATH/bin/activate"

# Upgrade pip first
pip install --upgrade pip setuptools wheel > /dev/null 2>&1

# Install core dependencies
echo "Installing: fastapi, uvicorn, mlx-lm..."
pip install fastapi uvicorn mlx-lm > /dev/null 2>&1

# Optional: Install additional ML libraries
echo "Installing: numpy, torch (for MLX compatibility)..."
pip install numpy > /dev/null 2>&1

echo -e "${GREEN}✅ Python dependencies installed${NC}"
echo ""

# Check model path
echo -e "${YELLOW}🤖 Checking model configuration...${NC}"
CONFIG_FILE="$(pwd)/.anyclauderc.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}⚠️  .anyclauderc.json not found${NC}"
    echo "This file is required to configure your model path"
    echo ""
    echo "Example configuration:"
    echo "{"
    echo '  "backend": "vllm-mlx",'
    echo '  "backends": {'
    echo '    "vllm-mlx": {'
    echo '      "enabled": true,'
    echo '      "port": 8081,'
    echo '      "baseUrl": "http://localhost:8081/v1",'
    echo '      "model": "/path/to/your/mlx/model"'
    echo '    }'
    echo '  }'
    echo "}"
    echo ""
    read -p "Enter path to your MLX model (or leave blank to skip): " MODEL_PATH
    if [ -n "$MODEL_PATH" ]; then
        if [ ! -d "$MODEL_PATH" ]; then
            echo -e "${RED}❌ Model path not found: ${MODEL_PATH}${NC}"
        else
            echo "Model path: $MODEL_PATH"
        fi
    fi
else
    echo -e "${GREEN}✅ Configuration file found${NC}"
    if grep -q "vllm-mlx" "$CONFIG_FILE"; then
        echo "vLLM-MLX backend is configured"
        MODEL_PATH=$(grep -A 5 '"vllm-mlx"' "$CONFIG_FILE" | grep '"model"' | grep -o '".*"' | tr -d '"')
        if [ -z "$MODEL_PATH" ]; then
            echo -e "${YELLOW}⚠️  No model path configured${NC}"
        elif [ ! -d "$MODEL_PATH" ]; then
            echo -e "${RED}❌ Model path not found: ${MODEL_PATH}${NC}"
        else
            echo -e "${GREEN}✅ Model configured: $(basename $MODEL_PATH)${NC}"
        fi
    fi
fi
echo ""

# Check bun installation
echo -e "${YELLOW}🔍 Checking bun installation...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}bun not found, installing...${NC}"
    curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✅ bun ${BUN_VERSION} found${NC}"
else
    echo -e "${YELLOW}⚠️  bun could not be installed automatically${NC}"
    echo "Please install bun: curl -fsSL https://bun.sh/install | bash"
fi
echo ""

# Build anyclaude
echo -e "${YELLOW}🔨 Building anyclaude...${NC}"
bun run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    echo "Try running: bun run build"
    exit 1
fi
echo ""

# Run setup check
echo -e "${YELLOW}🔍 Running final setup verification...${NC}"
node dist/main.js --check-setup
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║✅ Setup complete! Ready to run anyclaude                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "To start anyclaude:"
echo -e "  ${BLUE}anyclaude --mode=vllm-mlx${NC}"
echo ""
echo "Or with debug logging:"
echo -e "  ${BLUE}ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx${NC}"
echo ""
echo "To check setup status anytime:"
echo -e "  ${BLUE}anyclaude --check-setup${NC}"
echo ""
