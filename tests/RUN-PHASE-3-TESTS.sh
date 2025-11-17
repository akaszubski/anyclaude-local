#!/bin/bash
# Run Phase 3: Production Hardening Tests (Issue #8)
# Tests error handling, metrics collection, and config validation

set -e

echo "========================================="
echo "Phase 3: Production Hardening Tests"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test file
run_test() {
    local test_file=$1
    local test_name=$(basename $test_file)

    echo "Running: $test_name"

    if python3 "$test_file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $test_name PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗${NC} $test_name FAILED"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        # Run again to show errors
        python3 "$test_file" 2>&1 | tail -20
    fi

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
}

# Unit Tests
echo "=== Unit Tests ==="
run_test "tests/unit/test_error_handler.py"
run_test "tests/unit/test_metrics_collector.py"
run_test "tests/unit/test_config_validator.py"

# Integration Tests
echo "=== Integration Tests ==="
run_test "tests/integration/test_cache_corruption_recovery.py"
run_test "tests/integration/test_mlx_server_stress.py"
run_test "tests/integration/test_metrics_endpoint.py"

# Regression Tests
echo "=== Regression Tests ==="
if [ -f "tests/regression/test_error_recovery_regression.js" ]; then
    echo "Running: test_error_recovery_regression.js"
    if node "tests/regression/test_error_recovery_regression.js" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} test_error_recovery_regression.js PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗${NC} test_error_recovery_regression.js FAILED"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        node "tests/regression/test_error_recovery_regression.js" 2>&1 | tail -20
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
fi

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo "Total:  $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All tests PASSED! ✓${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Some tests FAILED ✗${NC}"
    exit 1
fi
