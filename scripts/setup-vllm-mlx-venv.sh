#!/bin/bash

# Setup script for MLX Python virtual environment
# This creates and configures a Python venv with all required dependencies

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
VENV_PATH="${HOME}/.venv-mlx"
PYTHON_VERSION="3.11"

echo -e "${BLUE}MLX Virtual Environment Setup${NC}"
echo "=================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    echo "Please install Python 3 first"
    exit 1
fi

PYTHON_V=$(python3 --version 2>&1 | awk '{print $2}')
echo -e "${GREEN}✓${NC} Found Python $PYTHON_V"

# Check if venv already exists
if [ -d "$VENV_PATH" ]; then
    echo -e "${GREEN}✓${NC} Virtual environment already exists at $VENV_PATH"
    read -p "Do you want to recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing existing venv..."
        rm -rf "$VENV_PATH"
    else
        echo "Skipping venv creation, proceeding to dependency check..."
        # Still ensure dependencies are up to date
        source "$VENV_PATH/bin/activate"
        echo "Updating dependencies..."
        pip install --upgrade pip setuptools wheel
        pip install --upgrade mlx mlx-lm certifi huggingface-hub fastapi uvicorn
        echo -e "${GREEN}✓${NC} Dependencies updated successfully"
        exit 0
    fi
fi

# Create virtual environment
echo ""
echo "Creating Python virtual environment..."
python3 -m venv "$VENV_PATH"
echo -e "${GREEN}✓${NC} Virtual environment created at $VENV_PATH"

# Activate venv
echo "Activating virtual environment..."
source "$VENV_PATH/bin/activate"
echo -e "${GREEN}✓${NC} Virtual environment activated"

# Upgrade pip
echo ""
echo "Upgrading pip, setuptools, and wheel..."
pip install --upgrade pip setuptools wheel
echo -e "${GREEN}✓${NC} Build tools upgraded"

# Install dependencies
echo ""
echo "Installing MLX dependencies..."
echo "This may take a few minutes depending on your internet connection..."
echo ""

# Install core packages
pip install \
    mlx \
    mlx-lm \
    certifi \
    huggingface-hub \
    fastapi \
    uvicorn

echo ""
echo -e "${GREEN}✓${NC} All dependencies installed successfully"

# Verify installation
echo ""
echo "Verifying installation..."
python3 -c "import mlx; import mlx_lm; import certifi; print('✓ All imports successful')" && \
    echo -e "${GREEN}✓${NC} Installation verified" || \
    (echo -e "${RED}✗${NC} Installation verification failed"; exit 1)

echo ""
echo "=================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=================================="
echo ""
echo "Virtual environment path: $VENV_PATH"
echo ""
echo "You can now use anyclaude with MLX:"
echo "  anyclaude --mode=mlx"
echo ""
echo "Or configure it in .anyclauderc.json:"
echo '  {"backend": "mlx", "backends": {"mlx": {"model": "/path/to/model"}}}'
echo ""
echo "Note: The setup script will activate the venv automatically when starting MLX"
echo ""
