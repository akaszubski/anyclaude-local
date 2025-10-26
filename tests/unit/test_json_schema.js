/**
 * Unit tests for json-schema.ts - Schema transformation for LMStudio compatibility
 *
 * Tests the providerizeSchema function to ensure it properly handles:
 * 1. Union types (oneOf, anyOf, allOf)
 * 2. Multi-type arrays (type: ['string', 'number'])
 * 3. Nested objects and arrays
 * 4. URI format removal
 * 5. additionalProperties handling
 */

const assert = require("assert");

// Import the json-schema module
let jsonSchema;
try {
  jsonSchema = require("../../dist/json-schema.js");
} catch (e) {
  try {
    require("ts-node/register");
    jsonSchema = require("../../src/json-schema.ts");
  } catch (e2) {
    console.error(
      "Failed to load json-schema. Make sure to build the project first or install ts-node."
    );
    process.exit(1);
  }
}

const { providerizeSchema } = jsonSchema;

// ========== Test: oneOf unions ==========

function test_oneOf_simple() {
  console.log("Testing: oneOf with simple types...");

  const schema = {
    type: "object",
    properties: {
      value: {
        oneOf: [{ type: "string" }, { type: "number" }],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.value.type, "string");
  assert(!result.properties.value.oneOf, "oneOf should be removed");

  console.log("✓ oneOf simple types converted correctly");
}

function test_oneOf_complex() {
  console.log("Testing: oneOf with complex types...");

  const schema = {
    type: "object",
    properties: {
      config: {
        oneOf: [
          { type: "object", properties: { id: { type: "string" } } },
          { type: "null" },
        ],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.config.type, "object");
  assert.deepStrictEqual(result.properties.config.properties, {
    id: { type: "string" },
  });
  assert(!result.properties.config.oneOf, "oneOf should be removed");

  console.log("✓ oneOf complex types converted correctly");
}

function test_oneOf_nested() {
  console.log("Testing: Nested oneOf in objects...");

  const schema = {
    type: "object",
    properties: {
      outer: {
        type: "object",
        properties: {
          inner: {
            oneOf: [{ type: "string" }, { type: "boolean" }],
          },
        },
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.outer.properties.inner.type, "string");
  assert(
    !result.properties.outer.properties.inner.oneOf,
    "Nested oneOf should be removed"
  );

  console.log("✓ Nested oneOf converted correctly");
}

// ========== Test: anyOf unions ==========

function test_anyOf_simple() {
  console.log("Testing: anyOf with simple types...");

  const schema = {
    type: "object",
    properties: {
      value: {
        anyOf: [{ type: "string" }, { type: "number" }],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.value.type, "string");
  assert(!result.properties.value.anyOf, "anyOf should be removed");

  console.log("✓ anyOf simple types converted correctly");
}

// ========== Test: allOf unions ==========

function test_allOf_merge() {
  console.log("Testing: allOf schema merging...");

  const schema = {
    type: "object",
    properties: {
      value: {
        allOf: [
          { type: "object", properties: { id: { type: "string" } } },
          { type: "object", properties: { name: { type: "string" } } },
        ],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.value.type, "object");
  assert.deepStrictEqual(result.properties.value.properties, {
    id: { type: "string" },
    name: { type: "string" },
  });
  assert(!result.properties.value.allOf, "allOf should be removed");

  console.log("✓ allOf schemas merged correctly");
}

function test_allOf_required() {
  console.log("Testing: allOf with required fields...");

  const schema = {
    type: "object",
    properties: {
      value: {
        allOf: [
          {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
          {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        ],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.deepStrictEqual(result.properties.value.required, ["id", "name"]);
  assert(!result.properties.value.allOf, "allOf should be removed");

  console.log("✓ allOf required fields merged correctly");
}

// ========== Test: Multi-type arrays ==========

function test_type_array_simple() {
  console.log("Testing: Type array with simple types...");

  const schema = {
    type: "object",
    properties: {
      value: {
        type: ["string", "number"],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.value.type, "string");

  console.log("✓ Type array converted to first type");
}

function test_type_array_with_null() {
  console.log("Testing: Type array with null...");

  const schema = {
    type: "object",
    properties: {
      value: {
        type: ["string", "null"],
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.value.type, "string");

  console.log("✓ Type array with null handled correctly");
}

// ========== Test: Arrays with union items ==========

function test_array_items_oneOf() {
  console.log("Testing: Array items with oneOf...");

  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          oneOf: [
            { type: "string" },
            { type: "object", properties: { id: { type: "string" } } },
          ],
        },
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.items.items.type, "string");
  assert(
    !result.properties.items.items.oneOf,
    "Array items oneOf should be removed"
  );

  console.log("✓ Array items with oneOf converted correctly");
}

// ========== Test: Existing functionality (regression) ==========

function test_uri_format_removal() {
  console.log("Testing: URI format removal for OpenAI...");

  const schema = {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.properties.url.type, "string");
  assert(!result.properties.url.format, "URI format should be removed");

  console.log("✓ URI format removed correctly");
}

function test_additionalProperties() {
  console.log("Testing: additionalProperties for OpenAI...");

  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert.strictEqual(result.additionalProperties, false);

  console.log("✓ additionalProperties added correctly");
}

function test_required_preservation() {
  console.log("Testing: Required fields preservation...");

  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  };

  const result = providerizeSchema("openai", schema);

  assert.deepStrictEqual(result.required, ["name"]);

  console.log("✓ Required fields preserved correctly");
}

function test_nested_objects() {
  console.log("Testing: Recursive nested object processing...");

  const schema = {
    type: "object",
    properties: {
      config: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
        },
      },
    },
  };

  const result = providerizeSchema("openai", schema);

  assert(
    !result.properties.config.properties.url.format,
    "Nested URI format should be removed"
  );
  assert.strictEqual(result.properties.config.additionalProperties, false);

  console.log("✓ Nested objects processed correctly");
}

function test_non_object_schema() {
  console.log("Testing: Non-object schema handling...");

  const schema = { type: "string" };
  const result = providerizeSchema("openai", schema);

  assert.deepStrictEqual(result, { type: "string" });

  console.log("✓ Non-object schemas passed through correctly");
}

function test_schema_without_properties() {
  console.log("Testing: Schema without properties...");

  const schema = { type: "object" };
  const result = providerizeSchema("openai", schema);

  assert.deepStrictEqual(result, { type: "object" });

  console.log("✓ Schema without properties handled correctly");
}

// ========== Test: Provider-specific behavior ==========

function test_non_openai_provider() {
  console.log("Testing: Non-OpenAI provider (no transformation)...");

  const schema = {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" },
      value: {
        oneOf: [{ type: "string" }, { type: "number" }],
      },
    },
  };

  const result = providerizeSchema("anthropic", schema);

  assert.deepStrictEqual(
    result,
    schema,
    "Non-OpenAI schemas should not be modified"
  );

  console.log("✓ Non-OpenAI provider handled correctly");
}

// ========== Run all tests ==========

function runTests() {
  console.log("\n=== JSON Schema Transformation Tests ===\n");

  try {
    // oneOf tests
    test_oneOf_simple();
    test_oneOf_complex();
    test_oneOf_nested();

    // anyOf tests
    test_anyOf_simple();

    // allOf tests
    test_allOf_merge();
    test_allOf_required();

    // Multi-type array tests
    test_type_array_simple();
    test_type_array_with_null();

    // Array items tests
    test_array_items_oneOf();

    // Regression tests
    test_uri_format_removal();
    test_additionalProperties();
    test_required_preservation();
    test_nested_objects();
    test_non_object_schema();
    test_schema_without_properties();

    // Provider-specific tests
    test_non_openai_provider();

    console.log("\n✅ All JSON schema tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
