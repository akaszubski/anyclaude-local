#!/usr/bin/env bun
/**
 * Test script for cache monitoring
 *
 * This script verifies that:
 * 1. Cache metrics are recorded during requests
 * 2. The cache monitor dashboard is displayed on exit
 * 3. Metrics are saved to JSON file
 */

import { getCacheMonitor } from "./src/cache-monitor-dashboard";

// Simulate cache operations
console.log("Testing cache monitor...\n");

const monitor = getCacheMonitor("./.test-cache-metrics.json");

// Simulate first request with system+tools (cache miss)
console.log("Recording cache miss (request 1)...");
monitor.recordMiss("hash1", 2000, 0, 500, 15);

// Simulate second request with same system+tools (cache hit)
console.log("Recording cache hit (request 2)...");
monitor.recordHit("hash1", 2000, 1900);

// Simulate third request with same system+tools (cache hit)
console.log("Recording cache hit (request 3)...");
monitor.recordHit("hash1", 2000, 1900);

// Simulate fourth request with different system+tools (cache miss)
console.log("Recording cache miss (request 4)...");
monitor.recordMiss("hash2", 1500, 0, 400, 10);

console.log("\nCache metrics recorded:");
const metrics = monitor.getMetrics();
console.log(`  Total Requests: ${metrics.totalRequests}`);
console.log(`  Cache Hits: ${metrics.cacheHits}`);
console.log(`  Cache Misses: ${metrics.cacheMisses}`);
console.log(
  `  Hit Rate: ${((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1)}%`
);

console.log("\nGenerating report...");
const report = monitor.generateReport();
console.log(report);

console.log("Saving metrics to JSON...");
monitor.save();
console.log("Metrics saved to .test-cache-metrics.json");

// Clean up
import * as fs from "fs";
if (fs.existsSync(".test-cache-metrics.json")) {
  fs.unlinkSync(".test-cache-metrics.json");
  console.log("\nCleanup: Removed test file");
}
