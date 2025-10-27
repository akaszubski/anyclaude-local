/**
 * Tool call parsing for mlx-lm-server responses
 *
 * Extracts tool calls from model outputs in various formats:
 * - Hermes-style XML tags: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 * - Llama JSON format: {"name": "...", "arguments": {...}}
 * - Mistral format: [TOOL_CALLS] [{"name": "...", "arguments": {...}}]
 */

import { v4 as uuidv4 } from 'uuid';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string of arguments
  };
}

export interface ParsedToolOutput {
  toolCalls: ToolCall[];
  remainingText: string;
  hasToolCalls: boolean;
}

/**
 * Hermes-style tool parser (used by Qwen 2.5+)
 * Format: <tool_call>{"name": "function_name", "arguments": {...}}</tool_call>
 */
export class HermesToolParser {
  private toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;

  parse(text: string): ParsedToolOutput {
    const toolCalls: ToolCall[] = [];
    let remainingText = text;
    let match;

    while ((match = this.toolCallRegex.exec(text)) !== null) {
      try {
        const jsonStr = match[1].trim();
        const toolDef = JSON.parse(jsonStr);

        toolCalls.push({
          id: uuidv4(),
          type: 'function',
          function: {
            name: toolDef.name,
            arguments: JSON.stringify(toolDef.arguments || {}),
          },
        });
      } catch (e) {
        console.error('[ToolParser] Failed to parse Hermes tool call:', match[1], e);
      }
    }

    // Remove tool_call tags from remaining text
    remainingText = text.replace(this.toolCallRegex, '').trim();

    return {
      toolCalls,
      remainingText,
      hasToolCalls: toolCalls.length > 0,
    };
  }
}

/**
 * Llama 3.1/3.2 JSON tool parser
 * Handles both single JSON objects and arrays
 */
export class LlamaToolParser {
  private jsonRegex = /\{[\s\S]*?"name"[\s\S]*?\}/;
  private arrayRegex = /\[[\s\S]*?\{[\s\S]*?"name"[\s\S]*?\}[\s\S]*?\]/;

  parse(text: string): ParsedToolOutput {
    const toolCalls: ToolCall[] = [];
    let workingText = text;

    // Try array format first (Llama 3.2 pythonic)
    const arrayMatch = workingText.match(this.arrayRegex);
    if (arrayMatch) {
      try {
        const toolsArray = JSON.parse(arrayMatch[0]);
        if (Array.isArray(toolsArray)) {
          toolsArray.forEach((tool) => {
            if (tool.name) {
              toolCalls.push({
                id: uuidv4(),
                type: 'function',
                function: {
                  name: tool.name,
                  arguments: JSON.stringify(tool.arguments || {}),
                },
              });
            }
          });
          workingText = workingText.replace(arrayMatch[0], '').trim();
        }
      } catch (e) {
        console.error('[ToolParser] Failed to parse Llama array format:', e);
      }
    }

    // Try single object format (Llama 3.1)
    if (toolCalls.length === 0) {
      const objectMatch = workingText.match(this.jsonRegex);
      if (objectMatch) {
        try {
          const toolDef = JSON.parse(objectMatch[0]);
          toolCalls.push({
            id: uuidv4(),
            type: 'function',
            function: {
              name: toolDef.name,
              arguments: JSON.stringify(toolDef.arguments || {}),
            },
          });
          workingText = workingText.replace(objectMatch[0], '').trim();
        } catch (e) {
          console.error('[ToolParser] Failed to parse Llama object format:', e);
        }
      }
    }

    return {
      toolCalls,
      remainingText: workingText,
      hasToolCalls: toolCalls.length > 0,
    };
  }
}

/**
 * Mistral tool parser
 * Format: [TOOL_CALLS] [{"name": "func1", "arguments": {...}}, ...]
 */
export class MistralToolParser {
  private tokenRegex = /\[TOOL_CALLS\]\s*(\[[\s\S]*?\])/;

  parse(text: string): ParsedToolOutput {
    const toolCalls: ToolCall[] = [];
    let remainingText = text;

    const match = text.match(this.tokenRegex);
    if (match) {
      try {
        const toolsArray = JSON.parse(match[1]);
        if (Array.isArray(toolsArray)) {
          toolsArray.forEach((tool) => {
            if (tool.name) {
              // Mistral requires 9-char alphanumeric IDs
              const id = this.generateMistralToolId();
              toolCalls.push({
                id,
                type: 'function',
                function: {
                  name: tool.name,
                  arguments: JSON.stringify(tool.arguments || {}),
                },
              });
            }
          });
          remainingText = text.replace(match[0], '').trim();
        }
      } catch (e) {
        console.error('[ToolParser] Failed to parse Mistral tool calls:', match[1], e);
      }
    }

    return {
      toolCalls,
      remainingText,
      hasToolCalls: toolCalls.length > 0,
    };
  }

  private generateMistralToolId(): string {
    // Mistral requires exactly 9 alphanumeric characters
    return Math.random().toString(36).substring(2, 11);
  }
}

/**
 * Multi-model tool parser - detects model type and uses appropriate parser
 */
export class MultiModelToolParser {
  private hermesParser = new HermesToolParser();
  private llamaParser = new LlamaToolParser();
  private mistralParser = new MistralToolParser();

  /**
   * Parse tool calls from model output, auto-detecting format
   * Returns tool calls found + remaining text
   */
  parse(text: string, modelId?: string): ParsedToolOutput {
    if (!text || typeof text !== 'string') {
      return {
        toolCalls: [],
        remainingText: text,
        hasToolCalls: false,
      };
    }

    // Try Hermes format first (most common for Qwen/current models)
    if (text.includes('<tool_call>')) {
      return this.hermesParser.parse(text);
    }

    // Try Mistral format
    if (text.includes('[TOOL_CALLS]')) {
      return this.mistralParser.parse(text);
    }

    // Try Llama format (fallback)
    if (text.includes('"name"') && text.includes('"arguments"')) {
      return this.llamaParser.parse(text);
    }

    // No tool calls detected
    return {
      toolCalls: [],
      remainingText: text,
      hasToolCalls: false,
    };
  }
}

/**
 * Create a default multi-model parser instance
 */
export function createToolParser(): MultiModelToolParser {
  return new MultiModelToolParser();
}
