/**
 * Tool Response Parser: OpenAI → Anthropic
 *
 * Converts OpenAI tool_calls responses back to Anthropic tool_use format.
 * Handles both complete responses and streaming deltas.
 *
 * OpenAI tool_call format:
 * {
 *   id: "call_abc123",
 *   type: "function",
 *   function: {
 *     name: "Read",
 *     arguments: '{"file_path":"/test.txt"}'  // JSON string
 *   }
 * }
 *
 * Anthropic tool_use format:
 * {
 *   type: "tool_use",
 *   id: "call_abc123",
 *   name: "Read",
 *   input: { file_path: "/test.txt" }  // Parsed object
 * }
 */

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface AnthropicToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface StreamingToolCallDelta {
  type:
    | "tool_call_start"
    | "tool_call_delta"
    | "tool_call_end"
    | "tool_call_complete";
  id: string;
  name?: string;
  delta?: string;
  arguments?: string;
}

/**
 * Parse a complete OpenAI tool call to Anthropic format
 *
 * @param toolCall - OpenAI tool_call object
 * @returns Anthropic tool_use object
 * @throws Error if tool call is malformed or has invalid JSON
 */
export function parseOpenAIToolCall(
  toolCall: OpenAIToolCall
): AnthropicToolUse {
  // Validate required fields
  if (!toolCall) {
    throw new Error("Tool call is required");
  }

  if (!toolCall.id || typeof toolCall.id !== "string") {
    throw new Error("Tool call must have an 'id' field (string)");
  }

  if (toolCall.id.trim() === "") {
    throw new Error("Tool call ID cannot be empty");
  }

  if (!toolCall.function) {
    throw new Error(`Tool call '${toolCall.id}' is missing 'function' field`);
  }

  if (!toolCall.function.name || typeof toolCall.function.name !== "string") {
    throw new Error(
      `Tool call '${toolCall.id}' is missing 'function.name' field`
    );
  }

  if (
    toolCall.function.arguments === undefined ||
    toolCall.function.arguments === null
  ) {
    throw new Error(
      `Tool call '${toolCall.id}' is missing 'function.arguments' field`
    );
  }

  // Parse arguments JSON
  let parsedInput: Record<string, unknown>;
  try {
    parsedInput = JSON.parse(toolCall.function.arguments);
  } catch (err) {
    throw new Error(
      `Tool call '${toolCall.id}' has invalid JSON in arguments: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Ensure parsed input is an object
  if (typeof parsedInput !== "object" || parsedInput === null) {
    throw new Error(
      `Tool call '${toolCall.id}' arguments must be a JSON object, got: ${typeof parsedInput}`
    );
  }

  return {
    type: "tool_use",
    id: toolCall.id,
    name: toolCall.function.name,
    input: parsedInput,
  };
}

/**
 * Assemble a complete tool call from streaming deltas
 *
 * This handles various streaming patterns:
 * 1. Normal streaming: start → delta+ → end
 * 2. Incomplete streaming (qwen3-coder): start → end → complete
 * 3. Out-of-order chunks: delta before start (defensive handling)
 *
 * @param deltas - Array of streaming delta chunks
 * @returns Assembled Anthropic tool_use object
 * @throws Error if deltas are malformed or incomplete
 */
export function assembleStreamingToolCall(
  deltas: StreamingToolCallDelta[]
): AnthropicToolUse {
  if (!Array.isArray(deltas) || deltas.length === 0) {
    throw new Error("Deltas array is required and must not be empty");
  }

  // Extract tool metadata
  let toolId: string | undefined;
  let toolName: string | undefined;
  let accumulatedArguments = "";
  let hasStart = false;
  let hasEnd = false;
  let completeArguments: string | undefined;

  // Process deltas in order
  for (const delta of deltas) {
    if (!delta || typeof delta !== "object") {
      throw new Error("Each delta must be an object");
    }

    // Track tool ID (should be consistent across all deltas)
    if (delta.id) {
      if (!toolId) {
        toolId = delta.id;
      } else if (toolId !== delta.id) {
        throw new Error(
          `Inconsistent tool IDs in deltas: ${toolId} vs ${delta.id}`
        );
      }
    }

    switch (delta.type) {
      case "tool_call_start":
        hasStart = true;
        if (delta.name) {
          toolName = delta.name;
        }
        break;

      case "tool_call_delta":
        if (delta.delta) {
          accumulatedArguments += delta.delta;
        }
        break;

      case "tool_call_end":
        hasEnd = true;
        break;

      case "tool_call_complete":
        // qwen3-coder pattern: complete chunk with full arguments
        if (delta.name) {
          toolName = delta.name;
        }
        if (delta.arguments) {
          completeArguments = delta.arguments;
        }
        break;

      default:
        throw new Error(`Unknown delta type: ${delta.type}`);
    }
  }

  // Validate we have required data
  if (!toolId) {
    throw new Error("No tool ID found in deltas");
  }

  if (!toolName) {
    throw new Error(`No tool name found in deltas for tool ID: ${toolId}`);
  }

  // Determine final arguments (prefer complete over accumulated)
  const finalArguments = completeArguments || accumulatedArguments;

  if (!finalArguments || finalArguments.trim() === "") {
    // Allow empty arguments for tools with no parameters
    return {
      type: "tool_use",
      id: toolId,
      name: toolName,
      input: {},
    };
  }

  // Parse arguments
  let parsedInput: Record<string, unknown>;
  try {
    parsedInput = JSON.parse(finalArguments);
  } catch (err) {
    throw new Error(
      `Tool call '${toolId}' has invalid JSON in accumulated arguments: ${err instanceof Error ? err.message : String(err)}\nArguments: ${finalArguments}`
    );
  }

  // Ensure parsed input is an object
  if (typeof parsedInput !== "object" || parsedInput === null) {
    throw new Error(
      `Tool call '${toolId}' arguments must be a JSON object, got: ${typeof parsedInput}`
    );
  }

  return {
    type: "tool_use",
    id: toolId,
    name: toolName,
    input: parsedInput,
  };
}

/**
 * Parse multiple OpenAI tool calls to Anthropic format
 *
 * @param toolCalls - Array of OpenAI tool_call objects
 * @returns Array of Anthropic tool_use objects
 */
export function parseOpenAIToolCalls(
  toolCalls: OpenAIToolCall[]
): AnthropicToolUse[] {
  if (!Array.isArray(toolCalls)) {
    throw new Error("Tool calls must be an array");
  }

  return toolCalls.map((toolCall, index) => {
    try {
      return parseOpenAIToolCall(toolCall);
    } catch (err) {
      throw new Error(
        `Failed to parse tool call at index ${index}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}
