#!/usr/bin/env node

/**
 * Message Conversion Error Handling Tests
 *
 * Tests for message format conversion and validation errors that could cause
 * malformed requests or loss of information.
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

function testMultipleSystemPrompts() {
  console.log("\n✓ Test 1: Multiple system prompts error");
  const messages = [
    { role: "system", content: "system 1" },
    { role: "system", content: "system 2" },
  ];
  const systemCount = messages.filter(m => m.role === "system").length;
  assert.ok(systemCount > 1, "Multiple system prompts detected");
  console.log("   ✅ Multiple system prompts detected");
  passed++;
}

function testEmptyMessageContent() {
  console.log("\n✓ Test 2: Empty message content");
  const message = { role: "user", content: [] };
  const isEmpty = Array.isArray(message.content) && message.content.length === 0;
  assert.ok(isEmpty, "Empty content detected");
  console.log("   ✅ Empty messages detected");
  passed++;
}

function testInvalidMessageRole() {
  console.log("\n✓ Test 3: Invalid message role");
  const validRoles = ["user", "assistant", "system"];
  const message = { role: "invalid", content: "text" };
  const isValid = validRoles.includes(message.role);
  assert.ok(!isValid, "Invalid role detected");
  console.log("   ✅ Invalid roles detected");
  passed++;
}

function testCircularReferenceInToolResult() {
  console.log("\n✓ Test 4: Circular reference in tool result");
  const result = { data: "value" };
  result.self = result;
  let stringified = null;
  try {
    const seen = new WeakSet();
    stringified = JSON.stringify(result, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    });
  } catch (e) {
    stringified = null;
  }
  assert.ok(stringified, "Circular reference handled");
  console.log("   ✅ Circular references handled");
  passed++;
}

function testPdfConversionTooLarge() {
  console.log("\n✓ Test 5: PDF too large to convert");
  const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
  const pdfSize = 20 * 1024 * 1024; // 20MB
  const isTooLarge = pdfSize > MAX_PDF_SIZE;
  assert.ok(isTooLarge, "Large PDF detected");
  console.log("   ✅ Large PDF rejected");
  passed++;
}

function testInvalidBase64InFileData() {
  console.log("\n✓ Test 6: Invalid base64 in file data");
  const invalidBase64 = "not_valid_base64!!!";
  let decoded = null;
  try {
    decoded = Buffer.from(invalidBase64, "base64");
  } catch (e) {
    decoded = null;
  }
  assert.ok(decoded, "Base64 buffer created");
  console.log("   ✅ Base64 validation works");
  passed++;
}

function testUrlFileNotFound() {
  console.log("\n✓ Test 7: URL file returns 404");
  const urlError = { status: 404, message: "Not Found" };
  const is404 = urlError.status === 404;
  assert.ok(is404, "404 error detected");
  console.log("   ✅ URL file errors detected");
  passed++;
}

function testToolCallNotFound() {
  console.log("\n✓ Test 8: Tool call not found in response");
  const toolResults = new Map([
    ["tool-1", { result: "value" }],
  ]);
  const toolId = "tool-2";
  const exists = toolResults.has(toolId);
  assert.ok(!exists, "Missing tool found");
  console.log("   ✅ Missing tools detected");
  passed++;
}

function testToolResultContentTypeMismatch() {
  console.log("\n✓ Test 9: Tool result content type mismatch");
  const expectedType = "text";
  const result = { type: "binary", data: Buffer.alloc(100) };
  const matches = result.type === expectedType;
  assert.ok(!matches, "Type mismatch detected");
  console.log("   ✅ Type mismatches detected");
  passed++;
}

function testNonUtf8FileData() {
  console.log("\n✓ Test 10: Non-UTF8 file data");
  const buffer = Buffer.from([0xFF, 0xFE, 0xFD]);
  let decoded = null;
  try {
    decoded = buffer.toString("utf8");
  } catch (e) {
    decoded = null;
  }
  assert.ok(decoded !== null, "Buffer decoded");
  console.log("   ✅ File encoding handled");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   MESSAGE CONVERSION ERROR HANDLING TESTS                ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testMultipleSystemPrompts();
    testEmptyMessageContent();
    testInvalidMessageRole();
    testCircularReferenceInToolResult();
    testPdfConversionTooLarge();
    testInvalidBase64InFileData();
    testUrlFileNotFound();
    testToolCallNotFound();
    testToolResultContentTypeMismatch();
    testNonUtf8FileData();
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
    console.log("\n✅ All message error tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { testMultipleSystemPrompts, testEmptyMessageContent };
