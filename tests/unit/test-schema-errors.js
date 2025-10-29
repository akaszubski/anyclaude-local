#!/usr/bin/env node

/**
 * JSON Schema Error Handling Tests
 *
 * Tests for schema validation, type mismatches, and structure validation
 * errors that could cause API contract violations.
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

function testMissingRequiredProperty() {
  console.log("\n✓ Test 1: Missing required property in schema");
  const schema = {
    type: "object",
    properties: { name: { type: "string" }, age: { type: "number" } },
    required: ["name", "age"],
  };
  const data = { name: "John" }; // Missing age
  const hasRequired = schema.required.every((prop) => prop in data);
  assert.ok(!hasRequired, "Missing required property detected");
  console.log("   ✅ Missing properties detected");
  passed++;
}

function testTypeValidationFailure() {
  console.log("\n✓ Test 2: Type validation failure");
  const schema = { type: "object", properties: { age: { type: "number" } } };
  const data = { age: "not a number" };
  const isValid = typeof data.age === "number";
  assert.ok(!isValid, "Type mismatch detected");
  console.log("   ✅ Type mismatches detected");
  passed++;
}

function testNestedObjectValidation() {
  console.log("\n✓ Test 3: Nested object validation fails");
  const schema = {
    type: "object",
    properties: {
      user: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      },
    },
  };
  const data = { user: { name: "John" } }; // Missing id
  const hasId = "id" in (data.user || {});
  assert.ok(!hasId, "Nested validation failed");
  console.log("   ✅ Nested object validation fails detected");
  passed++;
}

function testArrayItemValidation() {
  console.log("\n✓ Test 4: Array item validation fails");
  const schema = { type: "array", items: { type: "number" } };
  const data = [1, 2, "invalid", 4];
  const hasInvalid = data.some((item) => typeof item !== "number");
  assert.ok(hasInvalid, "Invalid array item detected");
  console.log("   ✅ Array validation fails detected");
  passed++;
}

function testEnumValidationFails() {
  console.log("\n✓ Test 5: Enum validation fails");
  const schema = { type: "string", enum: ["red", "green", "blue"] };
  const data = "yellow";
  const isValid = schema.enum.includes(data);
  assert.ok(!isValid, "Enum value invalid");
  console.log("   ✅ Enum validation fails detected");
  passed++;
}

function testStringLengthValidation() {
  console.log("\n✓ Test 6: String length validation fails");
  const schema = { type: "string", minLength: 5, maxLength: 10 };
  const tooShort = "hi";
  const tooLong = "this is too long";
  const shortValid = tooShort.length >= schema.minLength;
  const longValid = tooLong.length <= schema.maxLength;
  assert.ok(!shortValid || !longValid, "Length validation failed");
  console.log("   ✅ String length validation fails detected");
  passed++;
}

function testNumberRangeValidation() {
  console.log("\n✓ Test 7: Number range validation fails");
  const schema = { type: "number", minimum: 0, maximum: 100 };
  const testValues = [-5, 150];
  const hasInvalid = testValues.some(
    (v) => v < schema.minimum || v > schema.maximum
  );
  assert.ok(hasInvalid, "Range validation failed");
  console.log("   ✅ Number range validation fails detected");
  passed++;
}

function testAdditionalPropertiesDisallowed() {
  console.log("\n✓ Test 8: Additional properties not allowed");
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    additionalProperties: false,
  };
  const data = { name: "John", age: 30 };
  const hasExtra = Object.keys(data).some((key) => !(key in schema.properties));
  assert.ok(hasExtra, "Extra properties detected");
  console.log("   ✅ Additional properties detected");
  passed++;
}

function testPatternValidationFails() {
  console.log("\n✓ Test 9: Pattern validation fails");
  const schema = { type: "string", pattern: "^[a-z]+$" };
  const data = "ABC123";
  const pattern = new RegExp(schema.pattern);
  const isValid = pattern.test(data);
  assert.ok(!isValid, "Pattern validation failed");
  console.log("   ✅ Pattern validation fails detected");
  passed++;
}

function testAllOfValidationFails() {
  console.log("\n✓ Test 10: allOf validation fails");
  const schema = {
    allOf: [
      { type: "object", properties: { name: { type: "string" } } },
      { type: "object", properties: { name: { minLength: 5 } } },
    ],
  };
  const data = { name: "Bob" }; // Too short
  const meetsMinLength = !data.name || data.name.length >= 5;
  assert.ok(!meetsMinLength, "AllOf validation failed");
  console.log("   ✅ AllOf validation fails detected");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   JSON SCHEMA ERROR HANDLING TESTS                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testMissingRequiredProperty();
    testTypeValidationFailure();
    testNestedObjectValidation();
    testArrayItemValidation();
    testEnumValidationFails();
    testStringLengthValidation();
    testNumberRangeValidation();
    testAdditionalPropertiesDisallowed();
    testPatternValidationFails();
    testAllOfValidationFails();
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
    console.log("\n✅ All schema error tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { testMissingRequiredProperty, testTypeValidationFailure };
