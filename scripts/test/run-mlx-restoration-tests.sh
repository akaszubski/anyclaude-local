#!/bin/bash
# Test Suite Runner: MLX Server Restoration (Phase 1.1)
#
# Runs all test suites for the MLX server restoration:
# 1. Bash structural tests
# 2. Node.js integration tests
# 3. Python security tests
#
# Usage:
#   ./run-mlx-restoration-tests.sh          # Run all tests
#   ./run-mlx-restoration-tests.sh --quick  # Run only bash tests
#   ./run-mlx-restoration-tests.sh --help   # Show help

set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REPO_ROOT="/Users/andrewkaszubski/Documents/GitHub/anyclaude"
QUICK_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --help)
            echo "MLX Server Restoration - Test Suite Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --quick    Run only bash structural tests (fast)"
            echo "  --help     Show this help message"
            echo ""
            echo "Test Suites:"
            echo "  1. Bash Structural Tests    (scripts/test/test-mlx-server-restoration.sh)"
            echo "  2. Node.js Integration Tests (tests/integration/test_mlx_server_restoration.js)"
            echo "  3. Python Security Tests     (tests/unit/test_mlx_server_security.py)"
            echo ""
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "MLX Server Restoration - Test Suite"
echo "=========================================="
echo ""

# Track overall results
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

# ============================================================================
# Test Suite 1: Bash Structural Tests
# ============================================================================

echo -e "${BLUE}Test Suite 1: Bash Structural Tests${NC}"
echo "--------------------------------------"
((TOTAL_SUITES++))

if "$REPO_ROOT/scripts/test/test-mlx-server-restoration.sh"; then
    echo -e "${GREEN}✓ Bash structural tests passed${NC}"
    ((PASSED_SUITES++))
else
    echo -e "${RED}✗ Bash structural tests failed${NC}"
    ((FAILED_SUITES++))
fi

echo ""

if [ "$QUICK_MODE" = true ]; then
    echo -e "${YELLOW}Quick mode enabled - skipping remaining test suites${NC}"
    echo ""

    if [ $FAILED_SUITES -eq 0 ]; then
        echo -e "${GREEN}✓ Quick test passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Quick test failed!${NC}"
        exit 1
    fi
fi

# ============================================================================
# Test Suite 2: Node.js Integration Tests
# ============================================================================

echo -e "${BLUE}Test Suite 2: Node.js Integration Tests${NC}"
echo "----------------------------------------"
((TOTAL_SUITES++))

if node "$REPO_ROOT/tests/integration/test_mlx_server_restoration.js"; then
    echo -e "${GREEN}✓ Node.js integration tests passed${NC}"
    ((PASSED_SUITES++))
else
    echo -e "${RED}✗ Node.js integration tests failed${NC}"
    ((FAILED_SUITES++))
fi

echo ""

# ============================================================================
# Test Suite 3: Python Security Tests
# ============================================================================

echo -e "${BLUE}Test Suite 3: Python Security Tests${NC}"
echo "------------------------------------"
((TOTAL_SUITES++))

if python3 "$REPO_ROOT/tests/unit/test_mlx_server_security.py"; then
    echo -e "${GREEN}✓ Python security tests passed${NC}"
    ((PASSED_SUITES++))
else
    echo -e "${RED}✗ Python security tests failed${NC}"
    ((FAILED_SUITES++))
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo "=========================================="
echo "Overall Test Summary"
echo "=========================================="
echo "Total test suites: $TOTAL_SUITES"
echo -e "${GREEN}Passed: $PASSED_SUITES${NC}"
echo -e "${RED}Failed: $FAILED_SUITES${NC}"
echo ""

if [ $FAILED_SUITES -eq 0 ]; then
    echo -e "${GREEN}✓ All test suites passed!${NC}"
    echo ""
    echo "The MLX server restoration is complete and verified."
    echo ""
    echo "Next steps:"
    echo "1. Review the restored file: scripts/mlx-server.py"
    echo "2. Test the server manually: python3 scripts/mlx-server.py --help"
    echo "3. Update documentation if needed"
    echo "4. Commit changes"
    exit 0
else
    echo -e "${RED}✗ Test suites failed!${NC}"
    echo ""

    if [ $PASSED_SUITES -gt 0 ]; then
        echo "Some tests passed, indicating partial progress."
        echo ""
    fi

    echo "This is expected in TDD Red phase (before implementation)."
    echo ""
    echo "Next steps:"
    echo "1. Implement the restoration (copy and update file)"
    echo "2. Create migration documentation"
    echo "3. Update example configuration"
    echo "4. Update CHANGELOG"
    echo "5. Re-run this test suite"
    echo ""
    echo "To run a quick check: $0 --quick"
    exit 1
fi
