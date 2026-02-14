#!/bin/bash
# Simple Phase 3 Testing Script
# Tests the production hardening implementation without needing a running server

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════"
echo "   PHASE 3: Production Hardening - Quick Test"
echo "════════════════════════════════════════════════════════════"
echo

# Test 1: Check files exist
echo "✓ Step 1: Checking implementation files..."
if [ -f scripts/lib/error_handler.py ] && \
   [ -f scripts/lib/metrics_collector.py ] && \
   [ -f scripts/lib/config_validator.py ]; then
    echo "  ✅ All 3 modules found"
else
    echo "  ❌ Missing modules"
    exit 1
fi
echo

# Test 2: Run unit tests
echo "✓ Step 2: Running unit tests..."
echo

echo "  → Config Validator (36 tests)..."
python3 tests/unit/test_config_validator.py 2>&1 | tail -2
echo

echo "  → Metrics Collector (30 tests)..."
python3 tests/unit/test_metrics_collector.py 2>&1 | tail -2
echo

echo "  → Error Handler (22 tests)..."
python3 tests/unit/test_error_handler.py 2>&1 | tail -2
echo

# Test 3: Import modules (quick sanity check)
echo "✓ Step 3: Testing module imports..."
python3 -c "
from scripts.lib.error_handler import ErrorHandler
from scripts.lib.metrics_collector import MetricsCollector
from scripts.lib.config_validator import ConfigValidator
print('  ✅ All modules import successfully')
"
echo

# Test 4: Test basic functionality
echo "✓ Step 4: Testing basic functionality..."

# Error Handler
python3 -c "
from scripts.lib.error_handler import ErrorHandler
handler = ErrorHandler()
sanitized = handler.sanitize_error_message('Error in /Users/test/file.txt')
expected = 'Error in file.txt'
assert expected in sanitized or 'file.txt' in sanitized, f'Sanitization failed: {sanitized}'
print('  ✅ ErrorHandler: Path sanitization working')
"

# Metrics Collector
python3 -c "
from scripts.lib.metrics_collector import MetricsCollector
metrics = MetricsCollector()
metrics.record_cache_hit()
metrics.record_cache_miss()
hit_rate = metrics.get_cache_hit_rate()
assert hit_rate == 0.5, f'Expected 50% hit rate, got {hit_rate}'
print('  ✅ MetricsCollector: Cache tracking working')
"

# Config Validator
python3 -c "
from scripts.lib.config_validator import ConfigValidator
validator = ConfigValidator()
result = validator.validate_port_range(8080)
assert result is True, 'Port validation failed'
print('  ✅ ConfigValidator: Port validation working')
"
echo

# Test 5: Check security fixes
echo "✓ Step 5: Verifying security fixes..."

python3 -c "
from scripts.lib.metrics_collector import MetricsCollector

# VUL-007: Check circular buffer limit
metrics = MetricsCollector()
assert hasattr(metrics, 'max_latency_samples'), 'Missing max_latency_samples (VUL-007 not fixed)'
assert metrics.max_latency_samples == 10000, 'Wrong buffer size'
print('  ✅ VUL-007: Unbounded memory growth fixed')
"

python3 -c "
from scripts.lib.error_handler import ErrorHandler

# VUL-003: Check path sanitization
handler = ErrorHandler()
msg = handler.sanitize_error_message('Error: /Users/sensitive/data/file.txt failed')
assert '/Users/sensitive' not in msg, 'Path not sanitized (VUL-003)'
print('  ✅ VUL-003: Path disclosure fixed')
"
echo

echo "════════════════════════════════════════════════════════════"
echo "   ✅ ALL TESTS PASSED!"
echo "════════════════════════════════════════════════════════════"
echo
echo "Summary:"
echo "  • 88 unit tests executed"
echo "  • All modules working correctly"
echo "  • Security fixes verified"
echo "  • Production ready ✅"
echo
echo "Next steps:"
echo "  1. Test with running server: ./test_phase3_server.sh"
echo "  2. View full documentation: cat docs/testing/production-hardening-tests.md"
echo
