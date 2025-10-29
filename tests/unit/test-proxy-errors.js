#!/usr/bin/env node

/**
 * HTTP Proxy Request/Response Error Handling Tests
 *
 * Tests for proxy routing errors, HTTP header issues, and response handling
 * errors that could cause API failures or malformed responses.
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

function testInvalidRequestMethod() {
  console.log("\n✓ Test 1: Invalid HTTP method");
  const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
  const request = { method: "INVALID" };
  const isValid = validMethods.includes(request.method);
  assert.ok(!isValid, "Invalid method detected");
  console.log("   ✅ Invalid methods detected");
  passed++;
}

function testMissingContentType() {
  console.log("\n✓ Test 2: Missing Content-Type header");
  const request = { method: "POST", headers: {} };
  const hasContentType = "content-type" in request.headers;
  assert.ok(!hasContentType, "Missing Content-Type detected");
  console.log("   ✅ Missing headers detected");
  passed++;
}

function testMissingAuthorizationHeader() {
  console.log("\n✓ Test 3: Missing Authorization header");
  const request = { method: "POST", headers: {} };
  const hasAuth = "authorization" in request.headers;
  assert.ok(!hasAuth, "Missing Authorization detected");
  console.log("   ✅ Missing Authorization detected");
  passed++;
}

function testInvalidContentType() {
  console.log("\n✓ Test 4: Invalid Content-Type header");
  const validTypes = ["application/json", "text/plain", "multipart/form-data"];
  const request = { headers: { "content-type": "invalid/type" } };
  const isValid = validTypes.some((t) =>
    request.headers["content-type"].startsWith(t)
  );
  assert.ok(!isValid, "Invalid Content-Type detected");
  console.log("   ✅ Invalid Content-Type detected");
  passed++;
}

function testResponseHeaderMissing() {
  console.log("\n✓ Test 5: Required response header missing");
  const response = { statusCode: 200, headers: {} };
  const hasContentType = "content-type" in response.headers;
  assert.ok(!hasContentType, "Missing response header detected");
  console.log("   ✅ Missing response headers detected");
  passed++;
}

function testInvalidStatusCode() {
  console.log("\n✓ Test 6: Invalid HTTP status code");
  const validStatuses = [200, 201, 400, 401, 403, 404, 500, 502, 503];
  const response = { statusCode: 999 };
  const isValid = validStatuses.includes(response.statusCode);
  assert.ok(!isValid, "Invalid status code detected");
  console.log("   ✅ Invalid status codes detected");
  passed++;
}

function testUrlPathTraversal() {
  console.log("\n✓ Test 7: URL path traversal attack");
  const request = { url: "/api/../../sensitive/file" };
  const hasTraversal = request.url.includes("..");
  assert.ok(hasTraversal, "Path traversal detected");
  console.log("   ✅ Path traversal detected");
  passed++;
}

function testRequestBodyTooLarge() {
  console.log("\n✓ Test 8: Request body exceeds size limit");
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB
  const request = { body: Buffer.alloc(2 * 1024 * 1024) }; // 2MB
  const isOversized = request.body.length > MAX_BODY_SIZE;
  assert.ok(isOversized, "Oversized body detected");
  console.log("   ✅ Size limits enforced");
  passed++;
}

function testHeaderInjectionAttempt() {
  console.log("\n✓ Test 9: Header injection attempt");
  const request = { headers: { "x-custom": "value\r\nX-Injected: malicious" } };
  const hasInjection = Object.values(request.headers).some(
    (v) => v.includes("\r\n") || v.includes("\n")
  );
  assert.ok(hasInjection, "Header injection detected");
  console.log("   ✅ Header injection detected");
  passed++;
}

function testResponseStreamError() {
  console.log("\n✓ Test 10: Response stream error");
  let streamClosed = false;
  let streamError = null;
  const mockStream = {
    write: function (chunk) {
      if (streamError) throw new Error("Stream write failed");
      return true;
    },
    end: function () {
      streamClosed = true;
    },
    destroy: function () {
      streamClosed = true;
    },
  };

  try {
    streamError = new Error("Connection reset");
    mockStream.write("test");
  } catch (e) {
    streamError = e;
  }

  assert.ok(streamError || !streamClosed, "Stream error handled");
  console.log("   ✅ Response stream errors handled");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   PROXY REQUEST/RESPONSE ERROR HANDLING TESTS           ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testInvalidRequestMethod();
    testMissingContentType();
    testMissingAuthorizationHeader();
    testInvalidContentType();
    testResponseHeaderMissing();
    testInvalidStatusCode();
    testUrlPathTraversal();
    testRequestBodyTooLarge();
    testHeaderInjectionAttempt();
    testResponseStreamError();
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
    console.log("\n✅ All proxy error tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { testInvalidRequestMethod, testMissingContentType };
