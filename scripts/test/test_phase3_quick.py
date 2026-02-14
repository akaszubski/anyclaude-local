#!/usr/bin/env python3
"""Quick test to verify Phase 3 modules are working"""

import sys
from pathlib import Path

# Add scripts directory to path
scripts_path = Path(__file__).parent / 'scripts'
sys.path.insert(0, str(scripts_path))

from lib.error_handler import ErrorHandler, CacheError, OOMError, NetworkError
from lib.metrics_collector import MetricsCollector, MetricType
from lib.config_validator import ConfigValidator, ValidationError, DependencyError

print("Testing ErrorHandler...")
handler = ErrorHandler(max_retries=3)
assert handler.max_retries == 3
print("✓ ErrorHandler initialization works")

# Test sanitize
msg = "Failed to load /Users/test/.anyclaude/cache/data.json"
sanitized = handler.sanitize_error_message(msg)
assert '/Users/test' not in sanitized
print(f"✓ Sanitization works: '{sanitized}'")

# Test cache error
error = CacheError("Cache corruption")
result = handler.handle_cache_error(error)
assert result['status'] == 'degraded'
print("✓ handle_cache_error works")

print("\nTesting MetricsCollector...")
collector = MetricsCollector()
collector.record_cache_hit()
collector.record_cache_hit()
collector.record_cache_miss()
stats = collector.get_cache_stats()
assert stats['cache_hits'] == 2
assert stats['cache_misses'] == 1
assert abs(stats['hit_rate'] - 0.666) < 0.01
print(f"✓ Cache metrics work: hit_rate={stats['hit_rate']:.2f}")

# Test latency
collector.record_latency(100.0)
collector.record_latency(200.0)
latency_stats = collector.get_latency_stats()
assert len(latency_stats['latencies']) == 2
print("✓ Latency tracking works")

print("\nTesting ConfigValidator...")
validator = ConfigValidator()

# Test port validation
result = validator.validate_port(8080)
assert result['valid'] == True
assert result['port'] == 8080
print("✓ Port validation works")

# Test invalid port
try:
    validator.validate_port(99999)
    assert False, "Should have raised ValidationError"
except ValidationError:
    print("✓ Invalid port detection works")

print("\n" + "="*50)
print("ALL QUICK TESTS PASSED! ✓")
print("="*50)
