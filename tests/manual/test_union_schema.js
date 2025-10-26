#!/usr/bin/env node

/**
 * Test script to reproduce the "invalid_union" error with tongyi-deepresearch and gpt-oss models
 *
 * This test creates various tool schemas with union types (oneOf, anyOf, allOf) to identify
 * which patterns cause LMStudio to reject the schema with:
 * API Error: 400 {"type":"error","error":"Invalid type for 'input'."}
 *
 * Usage:
 *   ANYCLAUDE_DEBUG=3 node tests/manual/test_union_schema.js
 */

const { providerizeSchema } = require("../../dist/json-schema.js");

// Test schemas with various union type patterns
const testSchemas = [
  {
    name: "Simple Object (baseline)",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
  {
    name: "Union with oneOf",
    schema: {
      type: "object",
      properties: {
        value: {
          oneOf: [{ type: "string" }, { type: "number" }],
        },
      },
    },
  },
  {
    name: "Union with anyOf",
    schema: {
      type: "object",
      properties: {
        value: {
          anyOf: [{ type: "string" }, { type: "number" }],
        },
      },
    },
  },
  {
    name: "Union with allOf",
    schema: {
      type: "object",
      properties: {
        value: {
          allOf: [
            { type: "object", properties: { id: { type: "string" } } },
            { type: "object", properties: { name: { type: "string" } } },
          ],
        },
      },
    },
  },
  {
    name: "Property with multiple types (array form)",
    schema: {
      type: "object",
      properties: {
        value: {
          type: ["string", "number"],
        },
      },
    },
  },
  {
    name: "Nested object with oneOf",
    schema: {
      type: "object",
      properties: {
        config: {
          type: "object",
          properties: {
            setting: {
              oneOf: [{ type: "string" }, { type: "boolean" }],
            },
          },
        },
      },
    },
  },
  {
    name: "Array with oneOf items",
    schema: {
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
    },
  },
];

console.log("Testing schema transformation for union types\n");
console.log("=".repeat(80));

testSchemas.forEach((test, idx) => {
  console.log(`\nTest ${idx + 1}: ${test.name}`);
  console.log("-".repeat(80));

  const original = test.schema;
  const providerized = providerizeSchema("openai", original);

  console.log("\nOriginal Schema:");
  console.log(JSON.stringify(original, null, 2));

  console.log("\nProviderized Schema:");
  console.log(JSON.stringify(providerized, null, 2));

  const hasChanged = JSON.stringify(original) !== JSON.stringify(providerized);
  console.log(`\nTransformation: ${hasChanged ? "CHANGED" : "NO CHANGE"}`);

  // Check for union types
  const schemaStr = JSON.stringify(original);
  const hasUnion =
    schemaStr.includes('"oneOf"') ||
    schemaStr.includes('"anyOf"') ||
    schemaStr.includes('"allOf"');

  if (hasUnion) {
    console.log("⚠️  CONTAINS UNION TYPE - May cause 'invalid_union' error");
  }

  console.log("=".repeat(80));
});

console.log("\n\nSummary:");
console.log("-".repeat(80));
console.log("Current providerizeSchema() only handles:");
console.log("  ✅ Removing 'uri' format");
console.log("  ✅ Adding 'additionalProperties: false'");
console.log("  ✅ Preserving 'required' fields");
console.log("\nDoes NOT handle:");
console.log("  ❌ oneOf/anyOf/allOf union types");
console.log("  ❌ Multi-type arrays (type: ['string', 'number'])");
console.log("\nThese union patterns may cause LMStudio to reject schemas.");
console.log("-".repeat(80));
