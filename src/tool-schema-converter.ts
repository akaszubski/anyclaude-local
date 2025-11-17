/**
 * Tool Schema Converter: Anthropic → OpenAI
 *
 * Converts Anthropic tool definitions (with input_schema) to OpenAI function calling format.
 * This enables local MLX models to receive tool definitions in the OpenAI format they expect.
 *
 * Anthropic format:
 * {
 *   name: "Read",
 *   description: "Read a file",
 *   input_schema: { type: "object", properties: {...}, required: [...] }
 * }
 *
 * OpenAI format:
 * {
 *   type: "function",
 *   function: {
 *     name: "Read",
 *     description: "Read a file",
 *     parameters: { type: "object", properties: {...}, required: [...] }
 *   }
 * }
 */

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
      [key: string]: unknown;
    };
  };
}

/**
 * Convert a single Anthropic tool definition to OpenAI format
 *
 * @param anthropicTool - Anthropic tool with input_schema
 * @returns OpenAI tool with function.parameters
 * @throws Error if tool is missing required fields
 */
export function convertAnthropicToolToOpenAI(
  anthropicTool: AnthropicTool
): OpenAITool {
  // Validate required fields
  if (!anthropicTool) {
    throw new Error("Tool definition is required");
  }

  if (!anthropicTool.name || typeof anthropicTool.name !== "string") {
    throw new Error("Tool definition must have a 'name' field (string)");
  }

  if (anthropicTool.name.trim() === "") {
    throw new Error("Tool name cannot be empty");
  }

  if (!anthropicTool.input_schema) {
    throw new Error(`Tool '${anthropicTool.name}' is missing 'input_schema'`);
  }

  // Convert to OpenAI format
  // The input_schema becomes parameters, everything else is preserved
  return {
    type: "function",
    function: {
      name: anthropicTool.name,
      ...(anthropicTool.description && {
        description: anthropicTool.description,
      }),
      parameters: anthropicTool.input_schema,
    },
  };
}

/**
 * Convert an array of Anthropic tools to OpenAI format
 *
 * @param anthropicTools - Array of Anthropic tools
 * @returns Array of OpenAI tools
 */
export function convertAnthropicToolsToOpenAI(
  anthropicTools: AnthropicTool[]
): OpenAITool[] {
  if (!Array.isArray(anthropicTools)) {
    throw new Error("Tools must be an array");
  }

  return anthropicTools.map((tool, index) => {
    try {
      return convertAnthropicToolToOpenAI(tool);
    } catch (err) {
      throw new Error(
        `Failed to convert tool at index ${index}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}
