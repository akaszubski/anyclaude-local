#!/usr/bin/env node

/**
 * Unit Tests: Tool Schema Conversion (Anthropic → OpenAI)
 *
 * Tests the conversion of Anthropic input_schema to OpenAI parameters format.
 * These tests validate schema transformation WITHOUT requiring a running server.
 *
 * Part of: Phase 1.2 - Tool Calling Verification
 * Status: RED (tests should FAIL - no implementation exists yet)
 */

const assert = require("assert");

// Import the schema conversion function from built dist directory
let convertAnthropicToolToOpenAI;
try {
  const converter = require("../../dist/tool-schema-converter.js");
  convertAnthropicToolToOpenAI = converter.convertAnthropicToolToOpenAI;
} catch (err) {
  console.log(
    "⚠️  tool-schema-converter.js not found (expected in TDD red phase)"
  );
  console.log(`   Error: ${err.message}`);
  convertAnthropicToolToOpenAI = null;
}

let passed = 0;
let failed = 0;

/**
 * Test 1: Basic schema conversion (Read tool)
 */
function testBasicSchemaConversion() {
  console.log("\n✓ Test 1: Basic schema conversion (Read tool)");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTool = {
    name: "Read",
    description: "Read contents of a file",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to read",
        },
      },
      required: ["file_path"],
    },
  };

  const openaiTool = convertAnthropicToolToOpenAI(anthropicTool);

  // OpenAI format: { type: "function", function: { name, description, parameters } }
  assert.strictEqual(
    openaiTool.type,
    "function",
    "Tool type should be 'function'"
  );
  assert.strictEqual(
    openaiTool.function.name,
    "Read",
    "Name should be preserved"
  );
  assert.strictEqual(
    openaiTool.function.description,
    "Read contents of a file",
    "Description should be preserved"
  );

  // Parameters should match input_schema
  assert.deepStrictEqual(
    openaiTool.function.parameters,
    anthropicTool.input_schema,
    "Parameters should match input_schema"
  );

  console.log("   ✅ PASS: Basic schema converted correctly");
  passed++;
}

/**
 * Test 2: Complex schema with nested objects (Write tool)
 */
function testComplexSchemaConversion() {
  console.log("\n✓ Test 2: Complex schema with nested objects (Write tool)");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTool = {
    name: "Write",
    description: "Write content to a file",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        content: { type: "string" },
        mode: {
          type: "string",
          enum: ["overwrite", "append"],
          default: "overwrite",
        },
      },
      required: ["file_path", "content"],
    },
  };

  const openaiTool = convertAnthropicToolToOpenAI(anthropicTool);

  assert.strictEqual(openaiTool.function.name, "Write");
  assert.ok(
    openaiTool.function.parameters.properties.mode.enum,
    "Enum should be preserved"
  );
  assert.deepStrictEqual(
    openaiTool.function.parameters.required,
    ["file_path", "content"],
    "Required fields should be preserved"
  );

  console.log("   ✅ PASS: Complex schema converted correctly");
  passed++;
}

/**
 * Test 3: Schema with array type (Bash tool with arguments)
 */
function testSchemaWithArrays() {
  console.log("\n✓ Test 3: Schema with array type (Bash tool)");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTool = {
    name: "Bash",
    description: "Execute a bash command",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Command arguments",
        },
      },
      required: ["command"],
    },
  };

  const openaiTool = convertAnthropicToolToOpenAI(anthropicTool);

  assert.strictEqual(
    openaiTool.function.parameters.properties.args.type,
    "array"
  );
  assert.ok(openaiTool.function.parameters.properties.args.items);

  console.log("   ✅ PASS: Array schema converted correctly");
  passed++;
}

/**
 * Test 4: Schema with union types (should handle gracefully)
 */
function testSchemaWithUnionTypes() {
  console.log(
    "\n✓ Test 4: Schema with union types (known issue with some models)"
  );

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTool = {
    name: "Search",
    description: "Search for files",
    input_schema: {
      type: "object",
      properties: {
        query: {
          oneOf: [
            { type: "string" },
            { type: "object", properties: { pattern: { type: "string" } } },
          ],
        },
      },
      required: ["query"],
    },
  };

  const openaiTool = convertAnthropicToolToOpenAI(anthropicTool);

  // Should preserve oneOf/anyOf structures
  assert.ok(
    openaiTool.function.parameters.properties.query.oneOf,
    "Union types should be preserved"
  );

  console.log("   ✅ PASS: Union types handled correctly");
  passed++;
}

/**
 * Test 5: Empty schema (tool with no parameters)
 */
function testEmptySchema() {
  console.log("\n✓ Test 5: Empty schema (tool with no parameters)");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTool = {
    name: "GetCurrentTime",
    description: "Get the current time",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  };

  const openaiTool = convertAnthropicToolToOpenAI(anthropicTool);

  assert.strictEqual(openaiTool.function.parameters.type, "object");
  assert.deepStrictEqual(openaiTool.function.parameters.properties, {});

  console.log("   ✅ PASS: Empty schema handled correctly");
  passed++;
}

/**
 * Test 6: Batch conversion (multiple tools)
 */
function testBatchConversion() {
  console.log("\n✓ Test 6: Batch conversion (multiple tools)");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTools = [
    { name: "Read", input_schema: { type: "object", properties: {} } },
    { name: "Write", input_schema: { type: "object", properties: {} } },
    { name: "Bash", input_schema: { type: "object", properties: {} } },
  ];

  const openaiTools = anthropicTools.map(convertAnthropicToolToOpenAI);

  assert.strictEqual(openaiTools.length, 3, "All tools should be converted");
  assert.ok(
    openaiTools.every((t) => t.type === "function"),
    "All tools should have type 'function'"
  );

  console.log("   ✅ PASS: Batch conversion works");
  passed++;
}

/**
 * Test 7: Invalid schema (missing required fields)
 */
function testInvalidSchema() {
  console.log("\n✓ Test 7: Invalid schema (missing required fields)");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const invalidTool = {
    // Missing 'name' field
    description: "Invalid tool",
    input_schema: { type: "object" },
  };

  try {
    convertAnthropicToolToOpenAI(invalidTool);
    console.log("   ❌ FAIL: Should throw error for invalid schema");
    failed++;
  } catch (err) {
    assert.ok(
      err.message.includes("name"),
      "Error should mention missing 'name'"
    );
    console.log("   ✅ PASS: Invalid schema rejected correctly");
    passed++;
  }
}

/**
 * Test 8: Schema with additional metadata (should be preserved or ignored safely)
 */
function testSchemaWithMetadata() {
  console.log("\n✓ Test 8: Schema with additional metadata");

  if (!convertAnthropicToolToOpenAI) {
    console.log("   ❌ FAIL: convertAnthropicToolToOpenAI not implemented");
    failed++;
    return;
  }

  const anthropicTool = {
    name: "Read",
    description: "Read file",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
      },
      // Additional metadata
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  };

  const openaiTool = convertAnthropicToolToOpenAI(anthropicTool);

  // Should convert without errors
  assert.strictEqual(openaiTool.function.name, "Read");

  console.log("   ✅ PASS: Metadata handled gracefully");
  passed++;
}

function runTests() {
  console.log(
    "================================================================================"
  );
  console.log("UNIT TESTS: Tool Schema Conversion (Anthropic → OpenAI)");
  console.log("Phase 1.2 - TDD Red Phase");
  console.log(
    "================================================================================"
  );

  testBasicSchemaConversion();
  testComplexSchemaConversion();
  testSchemaWithArrays();
  testSchemaWithUnionTypes();
  testEmptySchema();
  testBatchConversion();
  testInvalidSchema();
  testSchemaWithMetadata();

  console.log(
    "\n================================================================================"
  );
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(
    "================================================================================"
  );

  if (!convertAnthropicToolToOpenAI) {
    console.log(
      "\n⚠️  EXPECTED FAILURE: tool-schema-converter.ts not implemented yet"
    );
    console.log("This is the TDD RED phase - implementation comes next!");
  }

  return failed === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(runTests());
}

module.exports = { runTests };
