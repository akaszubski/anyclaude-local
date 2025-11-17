/**
 * Regression Tests: Tool Calling Format Validation
 *
 * These tests prevent regression of tool calling format issues discovered
 * during OpenRouter integration testing (2025-11-17).
 *
 * Issue covered:
 * - Gemini 2.5 Flash Lite placing parameters at wrong level in JSON structure
 * - Models putting required nested parameters at root level
 * - Schema validation with additionalProperties: false
 *
 * Expected behavior:
 * - Parameters must be placed at correct nesting level
 * - Root-level unexpected parameters should be rejected
 * - Tools with complex nested schemas should validate correctly
 */

console.log("\n" + "=".repeat(80));
console.log("TOOL CALLING FORMAT VALIDATION REGRESSION TESTS");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

/**
 * Simulate tool schema validation
 * This mimics what happens when a model calls a tool with incorrect parameters
 */
function validateToolCall(schema, input) {
  try {
    // Check for unexpected root-level properties
    if (schema.additionalProperties === false) {
      const allowedProps = Object.keys(schema.properties);
      const providedProps = Object.keys(input);
      const unexpectedProps = providedProps.filter(p => !allowedProps.includes(p));

      if (unexpectedProps.length > 0) {
        return {
          valid: false,
          error: `An unexpected parameter \`${unexpectedProps[0]}\` was provided`
        };
      }
    }

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in input)) {
          return {
            valid: false,
            error: `Required parameter \`${requiredProp}\` is missing`
          };
        }
      }
    }

    // Validate nested schemas (simplified)
    for (const [key, value] of Object.entries(input)) {
      const propSchema = schema.properties[key];

      if (propSchema && propSchema.type === 'array' && propSchema.items) {
        if (!Array.isArray(value)) {
          return {
            valid: false,
            error: `Parameter \`${key}\` must be an array`
          };
        }

        // Validate array items if they're objects
        if (propSchema.items.type === 'object') {
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            const itemProps = Object.keys(item);

            // Check for required properties in array items
            if (propSchema.items.required) {
              for (const requiredProp of propSchema.items.required) {
                if (!(requiredProp in item)) {
                  return {
                    valid: false,
                    error: `Required parameter \`${requiredProp}\` is missing in ${key}[${i}]`
                  };
                }
              }
            }

            // Check for unexpected properties if additionalProperties: false
            if (propSchema.items.additionalProperties === false) {
              const itemAllowedProps = Object.keys(propSchema.items.properties);
              const unexpectedItemProps = itemProps.filter(p => !itemAllowedProps.includes(p));

              if (unexpectedItemProps.length > 0) {
                return {
                  valid: false,
                  error: `Unexpected property \`${unexpectedItemProps[0]}\` in ${key}[${i}]`
                };
              }
            }
          }
        }
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

function test(description, schema, input, shouldPass) {
  const result = validateToolCall(schema, input);
  const actualPass = result.valid;

  if (actualPass === shouldPass) {
    console.log(`✓ ${description}`);
    if (!result.valid) {
      console.log(`  Error (expected): ${result.error}`);
    }
    passed++;
  } else {
    console.log(`✗ ${description}`);
    console.log(`  Expected: ${shouldPass ? 'pass' : 'fail'}, Got: ${actualPass ? 'pass' : 'fail'}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    failed++;
  }
}

// AskUserQuestion Schema (simplified version of actual schema)
const askUserQuestionSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          header: { type: "string" },
          options: { type: "array" },
          multiSelect: { type: "boolean" }
        },
        required: ["question", "header", "options", "multiSelect"],
        additionalProperties: false
      }
    }
  },
  required: ["questions"],
  additionalProperties: false
};

// Test Cases
console.log("\n--- Correct Tool Call Format ---");

test(
  'Valid AskUserQuestion call with correct nesting',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "Should we rename vLLM to MLX?",
        header: "Rename Option",
        multiSelect: false,
        options: [
          { label: "Yes", description: "Rename it" },
          { label: "No", description: "Keep it" }
        ]
      }
    ]
  },
  true
);

console.log("\n--- Gemini 2.5 Flash Lite Bug (Issue #5) ---");

test(
  'Gemini bug: parameter at wrong level (root instead of nested)',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "Should we rename vLLM to MLX?",
        header: "Rename Option",
        multiSelect: false,
        options: [
          { label: "Yes", description: "Rename it" },
          { label: "No", description: "Keep it" }
        ]
      }
    ],
    header: "Rename Option"  // ❌ Wrong - at root level
  },
  false
);

test(
  'Gemini bug: duplicate parameter at both levels',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "Test?",
        header: "Test Header",
        multiSelect: false,
        options: [{ label: "A", description: "Option A" }]
      }
    ],
    multiSelect: false  // ❌ Wrong - at root level
  },
  false
);

console.log("\n--- Missing Required Parameters ---");

test(
  'Missing required root parameter',
  askUserQuestionSchema,
  {
    // Missing 'questions' parameter
  },
  false
);

test(
  'Missing required nested parameter',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "Test?",
        // Missing 'header' parameter
        multiSelect: false,
        options: [{ label: "A", description: "Option A" }]
      }
    ]
  },
  false
);

console.log("\n--- Extra Parameters at Different Levels ---");

test(
  'Extra parameter at root level',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "Test?",
        header: "Test",
        multiSelect: false,
        options: [{ label: "A", description: "Option A" }]
      }
    ],
    extraParam: "should not be here"
  },
  false
);

test(
  'Extra parameter in nested object',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "Test?",
        header: "Test",
        multiSelect: false,
        options: [{ label: "A", description: "Option A" }],
        extraNestedParam: "should not be here"
      }
    ]
  },
  false
);

console.log("\n--- Valid Edge Cases ---");

test(
  'Multiple questions array',
  askUserQuestionSchema,
  {
    questions: [
      {
        question: "First question?",
        header: "Q1",
        multiSelect: false,
        options: [{ label: "A", description: "Option A" }]
      },
      {
        question: "Second question?",
        header: "Q2",
        multiSelect: true,
        options: [
          { label: "B", description: "Option B" },
          { label: "C", description: "Option C" }
        ]
      }
    ]
  },
  true
);

test(
  'Empty questions array (edge case)',
  askUserQuestionSchema,
  {
    questions: []
  },
  true  // Schema doesn't enforce minItems, so this passes
);

// Summary
console.log("\n" + "=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(80) + "\n");

if (failed > 0) {
  process.exit(1);
}
