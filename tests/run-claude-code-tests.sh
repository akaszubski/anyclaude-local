#!/bin/bash

# Claude Code Integration Test Runner
# This script runs all tests needed to validate Claude Code integration

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                    CLAUDE CODE INTEGRATION TEST RUNNER                          ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Parse arguments
TEST_TYPE="${1:-all}"
VERBOSE="${2:-normal}"

# Print help
show_help() {
    echo "Usage: $0 [test_type] [verbosity]"
    echo ""
    echo "Test Types:"
    echo "  all           Run all tests (default)"
    echo "  unit          Run unit tests only"
    echo "  regression    Run regression tests only"
    echo "  integration   Run integration tests only"
    echo "  format        Run format validation tests only"
    echo "  cache         Run cache validation UAT tests only"
    echo ""
    echo "Verbosity:"
    echo "  normal        Standard output (default)"
    echo "  verbose       Detailed output"
    echo "  quiet         Minimal output"
    echo ""
    echo "Examples:"
    echo "  ./tests/run-claude-code-tests.sh all"
    echo "  ./tests/run-claude-code-tests.sh integration verbose"
    echo "  ./tests/run-claude-code-tests.sh cache"
    echo ""
}

# Show help if requested
if [[ "$TEST_TYPE" == "help" ]] || [[ "$TEST_TYPE" == "-h" ]]; then
    show_help
    exit 0
fi

# Colors for output
print_section() {
    echo ""
    echo -e "${BLUE}╭─ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install Node.js and npm."
    exit 1
fi

# Build project first
print_section "Building TypeScript"
if npm run build > /dev/null 2>&1; then
    print_success "Build successful"
else
    print_error "Build failed"
    exit 1
fi

# Run tests based on type
run_unit_tests() {
    print_section "Running Unit Tests"
    npm run test:unit
}

run_regression_tests() {
    print_section "Running Regression Tests"
    npm run test:regression
}

run_format_tests() {
    print_section "Running Format Validation Tests"
    npm run test:integration:format
}

run_cache_tests() {
    print_section "Running Cache Validation Tests (UAT)"
    npm run test:integration:cache
}

# Execute based on test type
case "$TEST_TYPE" in
    all)
        print_section "Running Complete Test Suite"
        print_info "Unit + Regression + Integration"
        npm run test
        ;;
    unit)
        run_unit_tests
        ;;
    regression)
        run_regression_tests
        ;;
    integration)
        print_section "Running All Integration Tests"
        run_format_tests
        run_cache_tests
        ;;
    format)
        run_format_tests
        ;;
    cache)
        run_cache_tests
        ;;
    *)
        print_error "Unknown test type: $TEST_TYPE"
        show_help
        exit 1
        ;;
esac

# Print summary
echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                           TESTS COMPLETED                                       ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Print next steps
case "$TEST_TYPE" in
    format|integration)
        echo -e "${BLUE}Next Steps:${NC}"
        echo "  1. Start proxy:       ${YELLOW}PROXY_ONLY=true bun run src/main.ts${NC}"
        echo "  2. Start MLX:    ${YELLOW}python3 scripts/mlx-server.py --model <path>${NC}"
        echo "  3. Run Claude Code:   ${YELLOW}anyclaude${NC}"
        echo "  4. Monitor logs:      ${YELLOW}tail -f ~/.anyclaude/request-logs/*.jsonl | jq .${NC}"
        echo ""
        ;;
esac

echo -e "${GREEN}All tests passed!${NC}"
echo ""
