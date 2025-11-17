#!/bin/bash
# Quick reference: How to run Phase 2.1 RAM Cache tests

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "================================"
echo "Phase 2.1: RAM Cache Tests"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_section() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 not found"
    exit 1
fi

python_version=$(python3 --version | cut -d' ' -f2)
print_info "Using Python $python_version"
echo ""

# Run unit tests
print_section "Unit Tests (36 tests)"
echo "Running: python3 -m unittest tests.unit.test_ram_cache -v"
echo ""

if python3 -m unittest tests.unit.test_ram_cache -v 2>&1; then
    print_success "Unit tests PASSED"
else
    # In red phase, tests should fail
    if python3 -m unittest tests.unit.test_ram_cache 2>&1 | grep -q "NotImplementedError"; then
        print_info "Unit tests FAIL (expected in red phase - InMemoryKVCacheManager not yet implemented)"
        UNIT_FAILED="true"
    else
        print_error "Unit tests failed with unexpected error"
        exit 1
    fi
fi

echo ""
echo "---"
echo ""

# Run integration tests
print_section "Integration Tests (17 tests)"
echo "Running: python3 -m unittest tests.integration.test_ram_cache_e2e -v"
echo ""

if python3 -m unittest tests.integration.test_ram_cache_e2e -v 2>&1; then
    print_success "Integration tests PASSED"
else
    # In red phase, tests should fail
    if python3 -m unittest tests.integration.test_ram_cache_e2e 2>&1 | grep -q "NotImplementedError"; then
        print_info "Integration tests FAIL (expected in red phase)"
        INTEG_FAILED="true"
    else
        print_error "Integration tests failed with unexpected error"
        exit 1
    fi
fi

echo ""
echo "---"
echo ""

# Run benchmarks
print_section "Performance Benchmarks (7 suites)"
echo "Running: python3 scripts/benchmark_ram_cache.py --verbose"
echo ""

if python3 scripts/benchmark_ram_cache.py --verbose 2>&1; then
    print_success "Benchmarks PASSED"
else
    # In red phase, benchmarks should fail
    if python3 scripts/benchmark_ram_cache.py 2>&1 | grep -q "InMemoryKVCacheManager not found"; then
        print_info "Benchmarks FAIL (expected in red phase - InMemoryKVCacheManager not yet implemented)"
        BENCH_FAILED="true"
    else
        print_error "Benchmarks failed with unexpected error"
        exit 1
    fi
fi

echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo ""

if [ "$UNIT_FAILED" = "true" ] || [ "$INTEG_FAILED" = "true" ] || [ "$BENCH_FAILED" = "true" ]; then
    print_info "TDD Red Phase: Tests FAIL as expected"
    print_info "InMemoryKVCacheManager not yet implemented"
    echo ""
    echo "To implement the cache manager:"
    echo "1. Add InMemoryKVCacheManager class to scripts/mlx-server.py"
    echo "2. Implement all methods: set, get, delete, clear, get_metadata, get_stats"
    echo "3. Add thread safety with threading.Lock"
    echo "4. Implement LRU eviction when memory exceeds max_memory_mb"
    echo "5. Re-run this script to verify tests pass"
    echo ""
    print_success "TDD Red Phase Complete"
else
    print_success "All tests PASSED!"
    print_success "InMemoryKVCacheManager successfully implemented"
fi

echo ""
echo "For more details, see:"
echo "  - tests/TEST-ARTIFACTS-PHASE-2.1-RAM-CACHE.md"
echo "  - TEST-MASTER-REPORT-PHASE-2.1.md"
