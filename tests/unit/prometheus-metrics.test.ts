/**
 * Unit tests for Prometheus metrics (Issue #62)
 */

import {
  generatePrometheusMetrics,
  recordRequest,
  recordCacheHit,
  recordCacheMiss,
  resetMetrics,
} from "../../src/prometheus-metrics";
import { CircuitBreaker } from "../../src/circuit-breaker";

describe("Prometheus Metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe("generatePrometheusMetrics", () => {
    test("should return valid Prometheus text format", () => {
      const output = generatePrometheusMetrics();

      // Check format - each metric should have HELP and TYPE
      expect(output).toContain("# HELP anyclaude_requests_total");
      expect(output).toContain("# TYPE anyclaude_requests_total counter");
      expect(output).toContain("# HELP anyclaude_request_duration_seconds");
      expect(output).toContain(
        "# TYPE anyclaude_request_duration_seconds histogram"
      );
    });

    test("should include request counter with labels", () => {
      recordRequest("/v1/messages", "success", 100);
      recordRequest("/v1/messages", "success", 200);
      recordRequest("/v1/messages", "error", 50);

      const output = generatePrometheusMetrics();

      expect(output).toContain(
        'anyclaude_requests_total{endpoint="/v1/messages",status="success"} 2'
      );
      expect(output).toContain(
        'anyclaude_requests_total{endpoint="/v1/messages",status="error"} 1'
      );
    });

    test("should include histogram buckets", () => {
      recordRequest("/v1/messages", "success", 50); // 0.05s
      recordRequest("/v1/messages", "success", 500); // 0.5s
      recordRequest("/v1/messages", "success", 2000); // 2s

      const output = generatePrometheusMetrics();

      expect(output).toContain(
        'anyclaude_request_duration_seconds_bucket{le="0.1"}'
      );
      expect(output).toContain(
        'anyclaude_request_duration_seconds_bucket{le="1"}'
      );
      expect(output).toContain(
        'anyclaude_request_duration_seconds_bucket{le="+Inf"}'
      );
      expect(output).toContain("anyclaude_request_duration_seconds_sum");
      expect(output).toContain("anyclaude_request_duration_seconds_count 3");
    });

    test("should include circuit breaker metrics when provided", () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        retryTimeout: 5000,
      });

      const output = generatePrometheusMetrics(breaker);

      expect(output).toContain("# HELP anyclaude_circuit_breaker_state");
      expect(output).toContain("# TYPE anyclaude_circuit_breaker_state gauge");
      expect(output).toContain("anyclaude_circuit_breaker_state 0"); // CLOSED = 0
      expect(output).toContain("anyclaude_circuit_breaker_failures_total");
      expect(output).toContain("anyclaude_circuit_breaker_successes_total");
    });

    test("should reflect circuit breaker OPEN state", () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        retryTimeout: 5000,
      });

      // Trigger OPEN state
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      const output = generatePrometheusMetrics(breaker);

      expect(output).toContain("anyclaude_circuit_breaker_state 1"); // OPEN = 1
    });

    test("should include cache metrics", () => {
      recordCacheHit();
      recordCacheHit();
      recordCacheMiss();

      const output = generatePrometheusMetrics();

      expect(output).toContain("anyclaude_cache_hits_total 2");
      expect(output).toContain("anyclaude_cache_misses_total 1");
      expect(output).toMatch(/anyclaude_cache_hit_rate 0\.666/);
    });

    test("should include process metrics", () => {
      const output = generatePrometheusMetrics();

      expect(output).toContain("# HELP anyclaude_process_cpu_seconds_total");
      expect(output).toContain(
        "# TYPE anyclaude_process_cpu_seconds_total counter"
      );
      expect(output).toContain("# HELP anyclaude_process_memory_bytes");
      expect(output).toContain("# TYPE anyclaude_process_memory_bytes gauge");
      // Values should be present (actual numbers vary)
      expect(output).toMatch(/anyclaude_process_cpu_seconds_total \d+/);
      expect(output).toMatch(/anyclaude_process_memory_bytes \d+/);
    });

    test("should return default values when no requests recorded", () => {
      const output = generatePrometheusMetrics();

      expect(output).toContain(
        'anyclaude_requests_total{endpoint="/v1/messages",status="success"} 0'
      );
      expect(output).toContain("anyclaude_request_duration_seconds_count 0");
      expect(output).toContain("anyclaude_cache_hit_rate 0.0000");
    });
  });

  describe("recordRequest", () => {
    test("should increment counter for same endpoint/status", () => {
      recordRequest("/v1/messages", "success", 100);
      recordRequest("/v1/messages", "success", 200);

      const output = generatePrometheusMetrics();
      expect(output).toContain(
        'anyclaude_requests_total{endpoint="/v1/messages",status="success"} 2'
      );
    });

    test("should track different endpoints separately", () => {
      recordRequest("/v1/messages", "success", 100);
      recordRequest("/v1/models", "success", 50);

      const output = generatePrometheusMetrics();
      expect(output).toContain(
        'anyclaude_requests_total{endpoint="/v1/messages",status="success"} 1'
      );
      expect(output).toContain(
        'anyclaude_requests_total{endpoint="/v1/models",status="success"} 1'
      );
    });

    test("should convert milliseconds to seconds for duration", () => {
      recordRequest("/v1/messages", "success", 1500); // 1.5 seconds

      const output = generatePrometheusMetrics();
      expect(output).toContain("anyclaude_request_duration_seconds_sum 1.5");
    });
  });

  describe("resetMetrics", () => {
    test("should clear all metrics", () => {
      recordRequest("/v1/messages", "success", 100);
      recordCacheHit();

      resetMetrics();

      const output = generatePrometheusMetrics();
      expect(output).toContain("anyclaude_request_duration_seconds_count 0");
      expect(output).toContain("anyclaude_cache_hits_total 0");
    });
  });

  describe("No high-cardinality labels", () => {
    test("should not include user IDs in metrics", () => {
      const output = generatePrometheusMetrics();
      expect(output).not.toContain("user_id");
      expect(output).not.toContain("user=");
    });

    test("should not include file paths in metrics", () => {
      const output = generatePrometheusMetrics();
      expect(output).not.toContain("file_path");
      expect(output).not.toContain("/Users/");
      expect(output).not.toContain("/home/");
    });
  });
});
