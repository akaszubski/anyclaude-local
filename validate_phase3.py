#!/usr/bin/env python3
"""
Phase 3 Validation Script

Demonstrates that all three production hardening modules are working correctly.
"""

import sys
import json
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent / 'scripts'))

from lib.error_handler import ErrorHandler, CacheError, OOMError, NetworkError
from lib.metrics_collector import MetricsCollector, MetricType
from lib.config_validator import ConfigValidator, ValidationError, DependencyError

def validate_error_handler():
    """Validate ErrorHandler module"""
    print("\n" + "="*60)
    print("Testing ErrorHandler Module")
    print("="*60)

    handler = ErrorHandler(
        enable_graceful_degradation=True,
        max_retries=3,
        retry_backoff_ms=100
    )

    # Test 1: Error message sanitization
    msg = "Failed to load /Users/test/.anyclaude/cache/data.json"
    sanitized = handler.sanitize_error_message(msg)
    assert '/Users/test' not in sanitized, "Path sanitization failed"
    print(f"✓ Path sanitization: '{sanitized}'")

    # Test 2: Cache corruption detection
    corrupted_json = '{"key": "value", "data": ['
    result = handler.detect_cache_corruption(corrupted_json.encode())
    assert result['corrupted'], "Corrupted JSON not detected"
    print(f"✓ Corruption detection: {result['reason']}")

    # Test 3: Valid JSON passes
    valid_json = json.dumps({"key": "value", "data": [1,2,3]})
    result = handler.detect_cache_corruption(valid_json.encode())
    assert not result['corrupted'], "Valid JSON flagged as corrupted"
    print(f"✓ Valid JSON accepted")

    # Test 4: Graceful degradation
    for _ in range(5):
        handler.record_cache_error(CacheError("Test error"))
    status = handler.check_degradation_status()
    assert not status['cache_enabled'], "Graceful degradation not working"
    print(f"✓ Graceful degradation: mode={status['mode']}")

    # Test 5: Auto-recovery
    for _ in range(10):
        handler.record_cache_success()
    status = handler.check_degradation_status()
    assert status['cache_enabled'], "Auto-recovery not working"
    print(f"✓ Auto-recovery: mode={status['mode']}")

    print("\nErrorHandler: ALL TESTS PASSED ✓")


def validate_metrics_collector():
    """Validate MetricsCollector module"""
    print("\n" + "="*60)
    print("Testing MetricsCollector Module")
    print("="*60)

    collector = MetricsCollector(
        enable_memory_tracking=True,
        enable_latency_tracking=True
    )

    # Test 1: Cache metrics
    collector.record_cache_hit()
    collector.record_cache_hit()
    collector.record_cache_miss()
    stats = collector.get_cache_stats()
    assert stats['cache_hits'] == 2, "Cache hit tracking failed"
    assert stats['cache_misses'] == 1, "Cache miss tracking failed"
    assert abs(stats['hit_rate'] - 0.666) < 0.01, "Hit rate calculation failed"
    print(f"✓ Cache metrics: hit_rate={stats['hit_rate']:.2%}")

    # Test 2: Latency tracking
    for i in range(1, 101):
        collector.record_latency(float(i))
    latency_stats = collector.get_latency_stats()
    assert len(latency_stats['latencies']) == 100, "Latency tracking failed"
    assert 45 <= latency_stats['p50'] <= 55, "P50 calculation failed"
    assert 90 <= latency_stats['p95'] <= 100, "P95 calculation failed"
    print(f"✓ Latency percentiles: P50={latency_stats['p50']:.1f}ms, P95={latency_stats['p95']:.1f}ms, P99={latency_stats['p99']:.1f}ms")

    # Test 3: Throughput
    for _ in range(10):
        collector.record_request()
    throughput_stats = collector.get_throughput_stats()
    assert throughput_stats['total_requests'] == 10, "Request counting failed"
    print(f"✓ Throughput: {throughput_stats['total_requests']} requests")

    # Test 4: JSON export
    metrics_json = collector.export_metrics_json()
    assert 'cache' in metrics_json, "JSON export missing cache"
    assert 'latency' in metrics_json, "JSON export missing latency"
    assert 'memory' in metrics_json, "JSON export missing memory"
    assert 'throughput' in metrics_json, "JSON export missing throughput"
    assert 'timestamp' in metrics_json, "JSON export missing timestamp"
    print(f"✓ JSON export: {len(metrics_json)} categories")

    # Test 5: Prometheus export
    prometheus = collector.export_metrics_prometheus()
    assert 'cache_hit_total' in prometheus, "Prometheus export incomplete"
    assert '# TYPE' in prometheus, "Prometheus format invalid"
    print(f"✓ Prometheus export: {len(prometheus)} characters")

    print("\nMetricsCollector: ALL TESTS PASSED ✓")


def validate_config_validator():
    """Validate ConfigValidator module"""
    print("\n" + "="*60)
    print("Testing ConfigValidator Module")
    print("="*60)

    validator = ConfigValidator()

    # Test 1: Port validation
    result = validator.validate_port(8080)
    assert result['valid'], "Valid port rejected"
    assert result['port'] == 8080, "Port conversion failed"
    print(f"✓ Port validation: {result['port']}")

    # Test 2: Invalid port
    try:
        validator.validate_port(99999)
        assert False, "Invalid port not rejected"
    except ValidationError:
        print(f"✓ Invalid port rejected")

    # Test 3: Privileged port warning
    result = validator.validate_port(80)
    assert result['valid'], "Valid privileged port rejected"
    assert 'warning' in result, "Privileged port warning missing"
    print(f"✓ Privileged port warning: {result['warning'][:40]}...")

    # Test 4: Port availability check
    result = validator.check_port_available(8080)
    assert 'available' in result, "Port check failed"
    print(f"✓ Port availability check: {result['available']}")

    # Test 5: Dependency check
    result = validator.check_dependency('sys')
    assert result['installed'], "Built-in module not detected"
    print(f"✓ Dependency check: sys installed")

    # Test 6: Missing dependency
    result = validator.check_dependency('nonexistent_module_xyz')
    assert not result['installed'], "Non-existent module detected"
    print(f"✓ Missing dependency detection works")

    print("\nConfigValidator: ALL TESTS PASSED ✓")


def main():
    """Run all validation tests"""
    print("\n" + "="*60)
    print("PHASE 3 PRODUCTION HARDENING - VALIDATION")
    print("="*60)

    try:
        validate_error_handler()
        validate_metrics_collector()
        validate_config_validator()

        print("\n" + "="*60)
        print("ALL PHASE 3 MODULES VALIDATED SUCCESSFULLY! ✓")
        print("="*60)
        print("\nImplementation Summary:")
        print("  - ErrorHandler: Graceful degradation, OOM detection, retry logic")
        print("  - MetricsCollector: Cache metrics, latency percentiles, throughput")
        print("  - ConfigValidator: Port/model validation, dependency checking")
        print("\nIntegration Points:")
        print("  - MLX server initialized with all 3 modules")
        print("  - /v1/metrics endpoint available")
        print("  - Metrics recorded in request handler")
        print("  - Config validated at startup")
        print("\nNext Steps:")
        print("  - Run unit tests: python3 tests/unit/test_*.py")
        print("  - Run integration tests: python3 tests/integration/test_*.py")
        print("  - Test /v1/metrics endpoint with live server")
        print("\n")

        return 0

    except AssertionError as e:
        print(f"\n✗ VALIDATION FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
