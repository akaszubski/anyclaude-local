/**
 * Unit tests for the simplified tool-context-manager (Issue #88)
 *
 * Tests the two standalone exported functions:
 *   - simplifySchema: strips non-structural JSON schema metadata
 *   - stubTools: replaces verbose descriptions with stubs and simplifies schemas
 *
 * Tests:
 * - simplifySchema: returns primitives unchanged
 * - simplifySchema: strips non-structural keys (description, examples, title)
 * - simplifySchema: keeps structural keys (type, properties, required, items, enum)
 * - simplifySchema: recurses into properties
 * - simplifySchema: recurses into items
 * - simplifySchema: recurses into anyOf / oneOf / allOf
 * - simplifySchema: handles arrays at root level
 * - simplifySchema: handles null / undefined gracefully
 * - stubTools: replaces description with stub for known tools
 * - stubTools: does not shorten description if stub is longer
 * - stubTools: simplifies input_schema
 * - stubTools: leaves unknown tools unchanged
 * - stubTools: handles empty array
 * - stubTools: does not mutate the original tool object
 * - STUBS: exported and contains expected tool names
 */

const assert = require("assert");
const path = require("path");

// ---------------------------------------------------------------------------
// Load the compiled module from dist/
// ---------------------------------------------------------------------------

const { stubTools, simplifySchema, STUBS } = require(
  path.join(__dirname, "../../dist/tool-context-manager.js")
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

function makeTool(name, description, inputSchema) {
  return {
    name,
    description: description || `Long description for ${name} `.repeat(20),
    input_schema: inputSchema || {
      type: "object",
      description: "Input schema description that should be stripped",
      properties: {
        path: {
          type: "string",
          description: "A file path",
          examples: ["/tmp/foo.txt"],
        },
      },
      required: ["path"],
    },
  };
}

// ---------------------------------------------------------------------------
// simplifySchema tests
// ---------------------------------------------------------------------------

console.log("\n=== simplifySchema Tests ===\n");

test("returns null unchanged", () => {
  assert.strictEqual(simplifySchema(null), null);
});

test("returns undefined unchanged", () => {
  assert.strictEqual(simplifySchema(undefined), undefined);
});

test("returns a string unchanged", () => {
  assert.strictEqual(simplifySchema("hello"), "hello");
});

test("returns a number unchanged", () => {
  assert.strictEqual(simplifySchema(42), 42);
});

test("strips description key from schema", () => {
  const schema = { type: "string", description: "A helpful description" };
  const result = simplifySchema(schema);
  assert.ok(!("description" in result), "description should be stripped");
  assert.strictEqual(result.type, "string");
});

test("strips title key from schema", () => {
  const schema = { type: "object", title: "MyObject" };
  const result = simplifySchema(schema);
  assert.ok(!("title" in result), "title should be stripped");
});

test("strips examples key from schema", () => {
  const schema = { type: "string", examples: ["foo", "bar"] };
  const result = simplifySchema(schema);
  assert.ok(!("examples" in result), "examples should be stripped");
});

test("keeps structural keys: type, required, enum", () => {
  const schema = {
    type: "string",
    enum: ["a", "b", "c"],
    description: "remove me",
  };
  const result = simplifySchema(schema);
  assert.strictEqual(result.type, "string");
  assert.deepStrictEqual(result.enum, ["a", "b", "c"]);
  assert.ok(!("description" in result));
});

test("keeps format key", () => {
  const schema = { type: "string", format: "uri", description: "url" };
  const result = simplifySchema(schema);
  assert.strictEqual(result.format, "uri");
});

test("recurses into properties and strips nested descriptions", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string", description: "User name", minLength: 1 },
      age: { type: "integer", description: "User age" },
    },
    required: ["name"],
  };
  const result = simplifySchema(schema);
  assert.ok(!("description" in result.properties.name));
  assert.strictEqual(result.properties.name.type, "string");
  assert.strictEqual(result.properties.name.minLength, 1);
  assert.ok(!("description" in result.properties.age));
  assert.deepStrictEqual(result.required, ["name"]);
});

test("recurses into items schema", () => {
  const schema = {
    type: "array",
    items: { type: "string", description: "An item" },
  };
  const result = simplifySchema(schema);
  assert.strictEqual(result.items.type, "string");
  assert.ok(!("description" in result.items));
});

test("recurses into anyOf array", () => {
  const schema = {
    anyOf: [
      { type: "string", description: "string option" },
      { type: "null", description: "null option" },
    ],
  };
  const result = simplifySchema(schema);
  assert.strictEqual(result.anyOf.length, 2);
  assert.ok(!("description" in result.anyOf[0]));
  assert.ok(!("description" in result.anyOf[1]));
});

test("handles array at root level (maps over elements)", () => {
  const arr = [
    { type: "string", description: "a" },
    { type: "number", description: "b" },
  ];
  const result = simplifySchema(arr);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 2);
  assert.ok(!("description" in result[0]));
  assert.ok(!("description" in result[1]));
});

// ---------------------------------------------------------------------------
// stubTools tests
// ---------------------------------------------------------------------------

console.log("\n=== stubTools Tests ===\n");

test("returns empty array for empty input", () => {
  const result = stubTools([]);
  assert.deepStrictEqual(result, []);
});

test("replaces description with stub for a known tool (Bash)", () => {
  const tool = makeTool("Bash");
  const [result] = stubTools([tool]);
  assert.strictEqual(result.description, STUBS["Bash"]);
});

test("replaces description with stub for a known tool (Read)", () => {
  const tool = makeTool("Read");
  const [result] = stubTools([tool]);
  assert.strictEqual(result.description, STUBS["Read"]);
});

test("does not replace description when stub is longer than original", () => {
  // Artificially make a short description for Bash that is shorter than the stub
  const shortDesc = "x"; // shorter than any stub
  const tool = { name: "Bash", description: shortDesc, input_schema: {} };
  const [result] = stubTools([tool]);
  // Stub is "Executes bash commands with optional timeout." (>1 char), so
  // stub.length > shortDesc.length → no replacement should occur
  assert.strictEqual(result.description, shortDesc);
});

test("simplifies input_schema (removes description from properties)", () => {
  const tool = makeTool("Write");
  const [result] = stubTools([tool]);
  assert.ok(result.input_schema, "input_schema should be present");
  // Properties should not contain description
  if (result.input_schema.properties) {
    for (const val of Object.values(result.input_schema.properties)) {
      assert.ok(!("description" in val), "property description should be stripped");
    }
  }
});

test("does not modify tools with unknown names", () => {
  const tool = {
    name: "MyCustomTool",
    description: "My custom tool description that is quite long indeed",
    input_schema: { type: "object" },
  };
  const [result] = stubTools([tool]);
  assert.strictEqual(result.description, tool.description);
});

test("does not mutate the original tool object", () => {
  const originalDesc = STUBS["Bash"];
  const tool = makeTool("Bash");
  const originalToolDesc = tool.description;
  stubTools([tool]);
  // The original tool should be unchanged
  assert.strictEqual(tool.description, originalToolDesc);
  assert.notStrictEqual(tool.description, originalDesc);
});

test("handles tool with no input_schema", () => {
  const tool = { name: "Bash", description: "A very long bash description ".repeat(10) };
  const [result] = stubTools([tool]);
  assert.strictEqual(result.description, STUBS["Bash"]);
  assert.ok(!("input_schema" in result) || result.input_schema === undefined);
});

test("processes multiple tools in order", () => {
  const tools = [makeTool("Bash"), makeTool("Read"), makeTool("UnknownTool")];
  const results = stubTools(tools);
  assert.strictEqual(results.length, 3);
  assert.strictEqual(results[0].description, STUBS["Bash"]);
  assert.strictEqual(results[1].description, STUBS["Read"]);
  assert.strictEqual(results[2].description, tools[2].description);
});

// ---------------------------------------------------------------------------
// STUBS export tests
// ---------------------------------------------------------------------------

console.log("\n=== STUBS Tests ===\n");

test("STUBS is exported and is an object", () => {
  assert.ok(STUBS && typeof STUBS === "object");
});

test("STUBS contains Bash", () => {
  assert.ok(typeof STUBS["Bash"] === "string" && STUBS["Bash"].length > 0);
});

test("STUBS contains Read", () => {
  assert.ok(typeof STUBS["Read"] === "string" && STUBS["Read"].length > 0);
});

test("STUBS contains Write", () => {
  assert.ok(typeof STUBS["Write"] === "string" && STUBS["Write"].length > 0);
});

test("STUBS contains Edit", () => {
  assert.ok(typeof STUBS["Edit"] === "string" && STUBS["Edit"].length > 0);
});

test("STUBS contains WebSearch", () => {
  assert.ok(typeof STUBS["WebSearch"] === "string" && STUBS["WebSearch"].length > 0);
});

console.log("\n");
