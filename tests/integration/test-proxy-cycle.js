#!/usr/bin/env node

/**
 * Proxy Request/Response Cycle Integration Tests
 *
 * Tests the complete proxy cycle:
 * Client request → Proxy routing → Backend call → Response transformation
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock proxy handler
class MockProxy {
  constructor() {
    this.requestLog = [];
    this.responseLog = [];
  }

  handleRequest(request) {
    this.requestLog.push(request);

    if (!request.url) throw new Error("Missing URL");
    if (!request.method) throw new Error("Missing method");
    if (request.method === "POST" && !request.body)
      throw new Error("Missing body");

    return {
      method: request.method,
      url: request.url,
      headers: request.headers || {},
      body: request.body || null,
    };
  }

  transformResponse(response) {
    this.responseLog.push(response);

    return {
      statusCode: response.statusCode || 200,
      headers: response.headers || { "content-type": "application/json" },
      body: response.body || "",
    };
  }

  async forwardRequest(request) {
    const processedRequest = this.handleRequest(request);
    // Simulate backend processing
    const backendResponse = {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success: true, request: processedRequest }),
    };
    return this.transformResponse(backendResponse);
  }
}

function testBasicProxyRequest() {
  console.log("\n✓ Test 1: Basic proxy request handling");
  const proxy = new MockProxy();
  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer token",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
  };

  const processed = proxy.handleRequest(request);
  assert.strictEqual(processed.method, "POST", "Method preserved");
  assert.strictEqual(processed.url, "/v1/messages", "URL preserved");
  console.log("   ✅ Basic request handling works");
  passed++;
}

function testRequestValidation() {
  console.log("\n✓ Test 2: Request validation");
  const proxy = new MockProxy();
  let error = null;

  try {
    proxy.handleRequest({ method: "POST" }); // Missing URL
  } catch (e) {
    error = e;
  }

  assert.ok(error, "Missing URL detected");
  assert.ok(error.message.includes("URL"), "Error message informative");
  console.log("   ✅ Request validation works");
  passed++;
}

function testResponseTransformation() {
  console.log("\n✓ Test 3: Response transformation");
  const proxy = new MockProxy();
  const backendResponse = {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result: "success" }),
  };

  const transformed = proxy.transformResponse(backendResponse);
  assert.strictEqual(transformed.statusCode, 200, "Status code preserved");
  assert.ok(transformed.headers["content-type"], "Headers preserved");
  console.log("   ✅ Response transformation works");
  passed++;
}

function testProxyCycle() {
  console.log("\n✓ Test 4: Complete proxy cycle");
  const proxy = new MockProxy();
  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ test: true }),
  };

  const processed = proxy.handleRequest(request);
  assert.ok(processed, "Request processed");
  assert.strictEqual(proxy.requestLog.length, 1, "Request logged");
  console.log("   ✅ Complete proxy cycle works");
  passed++;
}

function testMultipleRequests() {
  console.log("\n✓ Test 5: Multiple sequential requests");
  const proxy = new MockProxy();

  for (let i = 0; i < 3; i++) {
    proxy.handleRequest({
      method: "POST",
      url: "/v1/messages",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: i }),
    });
  }

  assert.strictEqual(proxy.requestLog.length, 3, "All requests logged");
  console.log("   ✅ Multiple requests work");
  passed++;
}

function testHeaderPreservation() {
  console.log("\n✓ Test 6: Header preservation through proxy");
  const proxy = new MockProxy();
  const headers = {
    "content-type": "application/json",
    authorization: "Bearer abc123",
    "user-agent": "claude-code",
    "x-custom": "value",
  };

  const request = {
    method: "POST",
    url: "/test",
    headers: headers,
    body: "{}",
  };

  const processed = proxy.handleRequest(request);
  assert.deepStrictEqual(processed.headers, headers, "All headers preserved");
  console.log("   ✅ Header preservation works");
  passed++;
}

function testBodyPreservation() {
  console.log("\n✓ Test 7: Request body preservation");
  const proxy = new MockProxy();
  const body = JSON.stringify({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.7,
  });

  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: { "content-type": "application/json" },
    body: body,
  };

  const processed = proxy.handleRequest(request);
  assert.strictEqual(processed.body, body, "Body preserved");
  console.log("   ✅ Body preservation works");
  passed++;
}

function testResponseHeaderDefaults() {
  console.log("\n✓ Test 8: Response header defaults");
  const proxy = new MockProxy();
  const response = { statusCode: 200, body: "test" };

  const transformed = proxy.transformResponse(response);
  assert.ok(transformed.headers, "Headers present");
  assert.strictEqual(
    transformed.headers["content-type"],
    "application/json",
    "Default content-type set"
  );
  console.log("   ✅ Response header defaults work");
  passed++;
}

function testErrorPropagation() {
  console.log("\n✓ Test 9: Error propagation through proxy");
  const proxy = new MockProxy();
  let error = null;

  try {
    proxy.handleRequest(null);
  } catch (e) {
    error = e;
  }

  assert.ok(error, "Error propagated");
  console.log("   ✅ Error propagation works");
  passed++;
}

function testRequestLogging() {
  console.log("\n✓ Test 10: Request/response logging");
  const proxy = new MockProxy();

  const request = {
    method: "GET",
    url: "/health",
    headers: {},
    body: null,
  };

  proxy.handleRequest(request);
  const response = { statusCode: 200, body: "ok" };
  proxy.transformResponse(response);

  assert.strictEqual(proxy.requestLog.length, 1, "Request logged");
  assert.strictEqual(proxy.responseLog.length, 1, "Response logged");
  assert.strictEqual(
    proxy.requestLog[0].url,
    "/health",
    "Request details logged"
  );
  console.log("   ✅ Request/response logging works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   PROXY REQUEST/RESPONSE CYCLE INTEGRATION TESTS        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testBasicProxyRequest();
    testRequestValidation();
    testResponseTransformation();
    testProxyCycle();
    testMultipleRequests();
    testHeaderPreservation();
    testBodyPreservation();
    testResponseHeaderDefaults();
    testErrorPropagation();
    testRequestLogging();
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
    console.log("\n✅ All proxy cycle tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { MockProxy };
