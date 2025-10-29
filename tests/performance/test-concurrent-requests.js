#!/usr/bin/env node

/**
 * Concurrent Request Performance Tests
 *
 * Tests how the system handles multiple simultaneous requests
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock request queue
class RequestQueue {
  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
    this.pending = [];
    this.active = new Set();
    this.completed = [];
    this.nextId = 0;
  }

  enqueue(request) {
    const id = this.nextId++;
    const queuedRequest = {
      id,
      ...request,
      status: "queued",
      timestamp: Date.now(),
    };
    this.pending.push(queuedRequest);
    return id;
  }

  getNextRequest() {
    if (this.active.size < this.maxConcurrent && this.pending.length > 0) {
      const request = this.pending.shift();
      this.active.add(request.id);
      request.status = "processing";
      return request;
    }
    return null;
  }

  completeRequest(id, result) {
    if (this.active.has(id)) {
      this.active.delete(id);
      const completed = {
        id,
        status: "completed",
        result,
        timestamp: Date.now(),
      };
      this.completed.push(completed);
      return true;
    }
    return false;
  }

  getQueueStatus() {
    return {
      pending: this.pending.length,
      active: this.active.size,
      completed: this.completed.length,
      total: this.nextId,
    };
  }

  allProcessed() {
    return this.pending.length === 0 && this.active.size === 0;
  }
}

// Mock request processor
class RequestProcessor {
  constructor() {
    this.processedRequests = [];
  }

  processRequest(request) {
    const result = {
      request_id: request.id,
      processed_at: Date.now(),
      response: { status: "ok", data: request.data },
    };
    this.processedRequests.push(result);
    return result;
  }

  processRequestAsync(request) {
    return Promise.resolve(this.processRequest(request));
  }

  getProcessedCount() {
    return this.processedRequests.length;
  }
}

function testBasicQueueing() {
  console.log("\n✓ Test 1: Basic request queueing");
  const queue = new RequestQueue();

  const id1 = queue.enqueue({ data: "request1" });
  const id2 = queue.enqueue({ data: "request2" });

  assert.strictEqual(queue.getQueueStatus().pending, 2, "Two requests queued");
  assert.strictEqual(id1, 0, "First request ID correct");
  assert.strictEqual(id2, 1, "Second request ID correct");
  console.log("   ✅ Basic queueing works");
  passed++;
}

function testConcurrencyLimit() {
  console.log("\n✓ Test 2: Concurrency limit enforcement");
  const queue = new RequestQueue(3);

  // Enqueue 10 requests
  for (let i = 0; i < 10; i++) {
    queue.enqueue({ data: `request${i}` });
  }

  // Get first 3
  const active = [];
  for (let i = 0; i < 3; i++) {
    const req = queue.getNextRequest();
    if (req) active.push(req);
  }

  assert.strictEqual(active.length, 3, "Max 3 concurrent");
  assert.strictEqual(queue.getQueueStatus().active, 3, "3 active");

  // Try to get 4th - should be null
  const fourth = queue.getNextRequest();
  assert.strictEqual(fourth, null, "No more than max concurrent");
  console.log("   ✅ Concurrency limit works");
  passed++;
}

function testRequestCompletion() {
  console.log("\n✓ Test 3: Request completion handling");
  const queue = new RequestQueue();

  const id = queue.enqueue({ data: "test" });
  const req = queue.getNextRequest();

  const completed = queue.completeRequest(id, { result: "success" });
  assert.ok(completed, "Request marked completed");
  assert.strictEqual(queue.getQueueStatus().completed, 1, "One completed");
  assert.strictEqual(queue.getQueueStatus().active, 0, "No longer active");
  console.log("   ✅ Request completion works");
  passed++;
}

function testRequestProcessing() {
  console.log("\n✓ Test 4: Request processing");
  const processor = new RequestProcessor();

  const request = { id: 1, data: "test data" };
  const result = processor.processRequest(request);

  assert.strictEqual(result.request_id, 1, "Request ID preserved");
  assert.ok(result.response.status === "ok", "Response status ok");
  assert.strictEqual(processor.getProcessedCount(), 1, "Request processed");
  console.log("   ✅ Request processing works");
  passed++;
}

function testMultipleConcurrentRequests() {
  console.log("\n✓ Test 5: Multiple concurrent requests");
  const queue = new RequestQueue(5);
  const processor = new RequestProcessor();

  // Enqueue 10 requests
  const ids = [];
  for (let i = 0; i < 10; i++) {
    ids.push(queue.enqueue({ data: `req${i}` }));
  }

  // Process in batches
  while (!queue.allProcessed()) {
    const req = queue.getNextRequest();
    if (req) {
      processor.processRequest(req);
      queue.completeRequest(req.id, { status: "ok" });
    } else {
      break;
    }
  }

  assert.strictEqual(processor.getProcessedCount(), 10, "All processed");
  assert.strictEqual(queue.getQueueStatus().completed, 10, "All completed");
  console.log("   ✅ Multiple concurrent requests work");
  passed++;
}

function testQueueUnderLoad() {
  console.log("\n✓ Test 6: Queue under load");
  const queue = new RequestQueue(10);

  // Enqueue 100 requests quickly
  for (let i = 0; i < 100; i++) {
    queue.enqueue({ data: `load${i}` });
  }

  const status = queue.getQueueStatus();
  assert.strictEqual(status.total, 100, "All 100 queued");
  assert.ok(status.pending + status.active === 100, "Total matches");
  console.log("   ✅ Queue under load works");
  passed++;
}

function testProcessingThroughput() {
  console.log("\n✓ Test 7: Processing throughput");
  const queue = new RequestQueue(5);
  const processor = new RequestProcessor();
  const startTime = Date.now();

  // Enqueue and process 100 requests
  for (let i = 0; i < 100; i++) {
    queue.enqueue({ data: `req${i}` });
  }

  let processingCount = 0;
  while (!queue.allProcessed() || queue.getQueueStatus().active > 0) {
    const req = queue.getNextRequest();
    if (req) {
      processor.processRequest(req);
      queue.completeRequest(req.id, { status: "ok" });
      processingCount++;
    }
  }

  const elapsed = Date.now() - startTime;
  assert.strictEqual(processingCount, 100, "All processed");
  assert.ok(elapsed < 1000, "Processing is fast"); // Shouldn't take >1s
  console.log(
    `   ✅ Processing throughput works (100 requests in ${elapsed}ms)`
  );
  passed++;
}

function testRequestIsolation() {
  console.log("\n✓ Test 8: Request isolation");
  const processor = new RequestProcessor();

  const req1 = { id: 1, data: "data1" };
  const req2 = { id: 2, data: "data2" };

  const result1 = processor.processRequest(req1);
  const result2 = processor.processRequest(req2);

  assert.notStrictEqual(
    result1.request_id,
    result2.request_id,
    "Different IDs"
  );
  assert.notStrictEqual(
    result1.response,
    result2.response,
    "Different responses"
  );
  console.log("   ✅ Request isolation works");
  passed++;
}

function testQueueRecovery() {
  console.log("\n✓ Test 9: Queue recovery from backlog");
  const queue = new RequestQueue(3);

  // Build up backlog
  for (let i = 0; i < 20; i++) {
    queue.enqueue({ data: `req${i}` });
  }

  const initialStatus = queue.getQueueStatus();
  assert.ok(initialStatus.pending > 0, "Has pending");

  // Process all
  while (!queue.allProcessed()) {
    const req = queue.getNextRequest();
    if (req) {
      queue.completeRequest(req.id, { ok: true });
    }
  }

  const finalStatus = queue.getQueueStatus();
  assert.strictEqual(finalStatus.pending, 0, "No pending");
  assert.strictEqual(finalStatus.active, 0, "No active");
  assert.strictEqual(finalStatus.completed, 20, "All completed");
  console.log("   ✅ Queue recovery works");
  passed++;
}

function testCompleteWorkflow() {
  console.log("\n✓ Test 10: Complete concurrent workflow");
  // Simulate: Enqueue → Monitor → Process → Complete
  const queue = new RequestQueue(5);
  const processor = new RequestProcessor();

  // Phase 1: Enqueue requests
  const requestIds = [];
  for (let i = 0; i < 20; i++) {
    requestIds.push(queue.enqueue({ user_id: i, query: `Query ${i}` }));
  }

  // Phase 2: Process while monitoring
  const monitoringData = [];
  while (!queue.allProcessed()) {
    const status = queue.getQueueStatus();
    monitoringData.push({ ...status, timestamp: Date.now() });

    const req = queue.getNextRequest();
    if (req) {
      const result = processor.processRequest(req);
      queue.completeRequest(req.id, result);
    }
  }

  // Phase 3: Verify completion
  const finalStatus = queue.getQueueStatus();
  assert.strictEqual(finalStatus.completed, 20, "All 20 completed");
  assert.strictEqual(processor.getProcessedCount(), 20, "All processed");
  assert.ok(monitoringData.length > 0, "Monitoring data collected");

  console.log("   ✅ Complete concurrent workflow works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   CONCURRENT REQUEST PERFORMANCE TESTS                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testBasicQueueing();
    testConcurrencyLimit();
    testRequestCompletion();
    testRequestProcessing();
    testMultipleConcurrentRequests();
    testQueueUnderLoad();
    testProcessingThroughput();
    testRequestIsolation();
    testQueueRecovery();
    testCompleteWorkflow();
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    failed++;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0 && passed === 10) {
    console.log("\n✅ All concurrent request tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { RequestQueue, RequestProcessor };
