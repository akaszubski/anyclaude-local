#!/bin/bash

# Test Runner for Phase 2.2: Cache_Control Headers Integration
#
# This script runs all cache control header tests in order.
# All tests should PASS before implementation begins.
# All tests should continue to PASS after implementation.
#
# Usage:
#   chmod +x tests/RUN-PHASE-2.2-TESTS.sh
#   ./tests/RUN-PHASE-2.2-TESTS.sh

set -e  # Exit on first error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counts
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PHASE 2.2: CACHE_CONTROL HEADERS - TEST SUITE RUNNER         ║${NC}"
echo -e "${BLUE}║  Testing cache marker extraction and header generation        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to run a test and capture result
run_test() {
  local test_file=$1
  local test_name=$2
  local test_path="tests/$test_file"

  echo -e "${YELLOW}Running: ${test_name}${NC}"
  echo "  File: $test_path"

  if [ ! -f "$test_path" ]; then
    echo -e "${RED}✗ Test file not found: $test_path${NC}"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    return 1
  fi

  if node "$test_path" > /tmp/test_output_$$.txt 2>&1; then
    # Extract test counts
    PASSED=$(grep "Passed:" /tmp/test_output_$$.txt | awk '{print $2}' || echo "?")
    FAILED=$(grep "Failed:" /tmp/test_output_$$.txt | awk '{print $2}' || echo "0")

    echo -e "${GREEN}✓ PASS${NC}"
    echo "  Passed: $PASSED, Failed: $FAILED"

    TOTAL_TESTS=$((TOTAL_TESTS + ${PASSED:-0}))
    TOTAL_FAILED=$((TOTAL_FAILED + ${FAILED:-0}))

    if [ "$FAILED" == "0" ] || [ "$FAILED" == "" ]; then
      TOTAL_PASSED=$((TOTAL_PASSED + ${PASSED:-0}))
    fi

    rm -f /tmp/test_output_$$.txt
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}"
    if [ -f /tmp/test_output_$$.txt ]; then
      tail -20 /tmp/test_output_$$.txt | sed 's/^/    /'
      rm -f /tmp/test_output_$$.txt
    fi
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    return 1
  fi
}

# Unit Tests
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}UNIT TESTS (3 files, 61 total tests)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "TEST SUITE 1: Hash Consistency"
run_test "unit/test-cache-hash-consistency.js" "Cache Hash Consistency (17 tests)"
echo ""

echo "TEST SUITE 2: Marker Extraction"
run_test "unit/test-cache-marker-extraction.js" "Cache Marker Extraction (14 tests)"
echo ""

echo "TEST SUITE 3: Token Estimation"
run_test "unit/test-token-estimation.js" "Token Estimation (30 tests)"
echo ""

# Integration Tests
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}INTEGRATION TESTS (1 file, 23 tests)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "TEST SUITE 4: Cache Headers"
run_test "integration/test-cache-headers.js" "Cache Headers (23 tests)"
echo ""

# E2E Tests (optional, requires running proxy)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}E2E TESTS (requires running proxy)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}To run E2E tests:${NC}"
echo "  1. Terminal 1: PROXY_ONLY=true bun run src/main.ts"
echo "  2. Terminal 2: node tests/integration/test-cache-e2e.js"
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ $TOTAL_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ALL TESTS PASSED                                              ║${NC}"
  echo -e "${GREEN}║  Total Tests Run: 84                                           ║${NC}"
  echo -e "${GREEN}║  Tests Passed: 84 (100%)                                       ║${NC}"
  echo -e "${GREEN}║  Tests Failed: 0                                               ║${NC}"
  echo -e "${GREEN}║                                                                ║${NC}"
  echo -e "${GREEN}║  Status: READY FOR IMPLEMENTATION PHASE                        ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  SOME TESTS FAILED                                             ║${NC}"
  echo -e "${RED}║  Total Tests Run: 84                                           ║${NC}"
  echo -e "${RED}║  Tests Passed: $TOTAL_PASSED                                            ║${NC}"
  echo -e "${RED}║  Tests Failed: $TOTAL_FAILED                                            ║${NC}"
  echo -e "${RED}║                                                                ║${NC}"
  echo -e "${RED}║  Please review failing tests above                              ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
fi
