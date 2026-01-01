#!/bin/bash
# Run MLX Worker Node Tests
#
# Usage:
#   ./run-mlx-worker-tests.sh              # Run all tests
#   ./run-mlx-worker-tests.sh unit         # Run only unit tests
#   ./run-mlx-worker-tests.sh integration  # Run only integration tests
#   ./run-mlx-worker-tests.sh coverage     # Run with coverage report

set -e

cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}MLX Worker Node Tests${NC}"
echo "======================================"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 not found${NC}"
    exit 1
fi

# Parse arguments
TEST_TYPE="${1:-all}"

case "$TEST_TYPE" in
    unit)
        echo -e "${GREEN}Running unit tests...${NC}"
        python3 -m pytest \
            unit/test_mlx_worker_inference.py \
            unit/test_mlx_worker_cache.py \
            unit/test_mlx_worker_health.py \
            --tb=line -q
        ;;

    integration)
        echo -e "${GREEN}Running integration tests...${NC}"
        python3 -m pytest \
            integration/test_mlx_worker_server.py \
            --tb=line -q
        ;;

    coverage)
        echo -e "${GREEN}Running tests with coverage...${NC}"
        python3 -m pytest \
            unit/test_mlx_worker_*.py \
            integration/test_mlx_worker_server.py \
            --cov=../src/mlx_worker \
            --cov-report=html \
            --cov-report=term-missing \
            --tb=line -q
        echo -e "${GREEN}Coverage report: htmlcov/index.html${NC}"
        ;;

    all)
        echo -e "${GREEN}Running all MLX worker tests...${NC}"
        python3 -m pytest \
            unit/test_mlx_worker_*.py \
            integration/test_mlx_worker_server.py \
            --tb=line -q
        ;;

    *)
        echo -e "${RED}Unknown test type: $TEST_TYPE${NC}"
        echo "Usage: $0 [unit|integration|coverage|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Test run complete!${NC}"
