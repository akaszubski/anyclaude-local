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

const { providerizeSchema } = require("../../dist/json-schema.js");

describe("providerizeSchema - Union Type Handling", () => {
  describe("oneOf unions", () => {
    test("should convert oneOf to first type", () => {
      const schema = {
        type: "object",
        properties: {
          value: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
        },
      };

      const result = providerizeSchema("openai", schema);

      expect(result.properties.value).toEqual({ type: "string" });
      expect(result.properties.value).not.toHaveProperty("oneOf");
    });

    test("should handle oneOf with complex types", () => {
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

      expect(result.properties.config).toEqual({
        type: "object",
        properties: { id: { type: "string" } },
        additionalProperties: false,
      });
    });

    test("should handle nested oneOf in objects", () => {
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

      expect(result.properties.outer.properties.inner).toEqual({
        type: "string",
      });
    });
  });

  describe("anyOf unions", () => {
    test("should convert anyOf to first type", () => {
      const schema = {
        type: "object",
        properties: {
          value: {
            anyOf: [{ type: "string" }, { type: "number" }],
          },
        },
      };

      const result = providerizeSchema("openai", schema);

      expect(result.properties.value).toEqual({ type: "string" });
      expect(result.properties.value).not.toHaveProperty("anyOf");
    });
  });

  describe("allOf unions", () => {
    test("should merge allOf schemas", () => {
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

      expect(result.properties.value).toEqual({
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        additionalProperties: false,
      });
    });

    test("should handle allOf with required fields", () => {
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

      expect(result.properties.value.required).toEqual(["id", "name"]);
    });
  });

  describe("Multi-type arrays", () => {
    test("should convert type array to first type", () => {
      const schema = {
        type: "object",
        properties: {
          value: {
            type: ["string", "number"],
          },
        },
      };

      const result = providerizeSchema("openai", schema);

      expect(result.properties.value).toEqual({ type: "string" });
    });

    test("should handle type array with null", () => {
      const schema = {
        type: "object",
        properties: {
          value: {
            type: ["string", "null"],
          },
        },
      };

      const result = providerizeSchema("openai", schema);

      expect(result.properties.value).toEqual({ type: "string" });
    });
  });

  describe("Array items with unions", () => {
    test("should handle array items with oneOf", () => {
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

      expect(result.properties.items.items).toEqual({ type: "string" });
    });
  });

  describe("Existing functionality (regression tests)", () => {
    test("should remove uri format for OpenAI", () => {
      const schema = {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
        },
      };

      const result = providerizeSchema("openai", schema);

      expect(result.properties.url).toEqual({ type: "string" });
      expect(result.properties.url).not.toHaveProperty("format");
    });

    test("should add additionalProperties: false for OpenAI", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      const result = providerizeSchema("openai", schema);

      expect(result.additionalProperties).toBe(false);
    });

    test("should preserve required fields", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };

      const result = providerizeSchema("openai", schema);

      expect(result.required).toEqual(["name"]);
    });

    test("should recursively process nested objects", () => {
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

      expect(result.properties.config.properties.url).not.toHaveProperty(
        "format"
      );
      expect(result.properties.config.additionalProperties).toBe(false);
    });

    test("should handle non-object schemas", () => {
      const schema = { type: "string" };
      const result = providerizeSchema("openai", schema);
      expect(result).toEqual({ type: "string" });
    });

    test("should handle schemas without properties", () => {
      const schema = { type: "object" };
      const result = providerizeSchema("openai", schema);
      expect(result).toEqual({ type: "object" });
    });
  });

  describe("Provider-specific behavior", () => {
    test("should not modify for non-OpenAI providers", () => {
      const schema = {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
        },
      };

      const result = providerizeSchema("anthropic", schema);

      expect(result).toEqual(schema);
    });
  });
});
