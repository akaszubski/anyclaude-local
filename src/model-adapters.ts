/**
 * Model-specific adapters for tool calling
 *
 * This module provides model-specific customizations for tool schemas,
 * prompts, and response parsing to optimize tool calling across different models.
 */

export type ModelId = string;

export interface ModelConfig {
  /** Maximum number of parameters per tool (simplification) */
  maxParameters?: number;

  /** Maximum description length in characters */
  maxDescriptionLength?: number;

  /** Whether to remove all optional parameters */
  removeOptionalParams?: boolean;

  /** Additional system prompt hints for tool calling */
  toolCallingHint?: string;

  /** Custom tool call parser (if model uses different format) */
  parseToolCall?: (chunk: any) => any;
}

/**
 * Model-specific configurations
 *
 * Add entries here for models that need special handling.
 * If a model isn't listed, it uses the default (full schemas, no modifications).
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Example: Simplified config for smaller models
  // 'qwen3-coder-30b': {
  //   maxParameters: 3,
  //   maxDescriptionLength: 500,
  //   removeOptionalParams: true,
  //   toolCallingHint: '\n\nUse the provided tools to complete tasks.'
  // },
  // Add more models as needed:
  // 'llama-3-8b-instruct': { ... },
  // 'mistral-7b-instruct': { ... },
};

/**
 * Get configuration for a specific model
 *
 * @param modelId - The model identifier (from LMStudio)
 * @returns Model configuration, or empty object if no special handling needed
 */
export function getModelConfig(modelId: string): ModelConfig {
  // Exact match
  if (MODEL_CONFIGS[modelId]) {
    return MODEL_CONFIGS[modelId];
  }

  // Fuzzy match (e.g., "qwen3-coder-30b-mlx" matches "qwen3-coder-30b")
  const fuzzyMatch = Object.keys(MODEL_CONFIGS).find((key: string) =>
    modelId.toLowerCase().includes(key.toLowerCase())
  );

  if (fuzzyMatch) {
    return MODEL_CONFIGS[fuzzyMatch];
  }

  // No special handling needed
  return {};
}

/**
 * Simplify a tool schema for a specific model
 *
 * @param schema - The original Anthropic tool input schema
 * @param modelId - The model identifier
 * @returns Simplified schema (or original if no simplification needed)
 */
export function simplifySchemaForModel(schema: any, modelId: string): any {
  const config = getModelConfig(modelId);

  // No simplification needed
  if (!config.maxParameters && !config.removeOptionalParams) {
    return schema;
  }

  const properties = schema.properties || {};
  const required = schema.required || [];

  // Remove optional parameters if configured
  let filteredProperties = { ...properties };
  if (config.removeOptionalParams) {
    filteredProperties = Object.fromEntries(
      Object.entries(properties).filter(([key]) => required.includes(key))
    );
  }

  // Limit number of parameters if configured
  if (config.maxParameters) {
    const keys = Object.keys(filteredProperties);
    if (keys.length > config.maxParameters) {
      // Keep required params first, then first N optional params
      const requiredKeys = required.filter((key: string) => keys.includes(key));
      const optionalKeys = keys.filter(
        (key: string) => !required.includes(key)
      );
      const keepKeys = [
        ...requiredKeys,
        ...optionalKeys.slice(0, config.maxParameters - requiredKeys.length),
      ];

      filteredProperties = Object.fromEntries(
        Object.entries(filteredProperties).filter(([key]) =>
          keepKeys.includes(key)
        )
      );
    }
  }

  return {
    ...schema,
    properties: filteredProperties,
  };
}

/**
 * Simplify a tool description for a specific model
 *
 * @param description - The original tool description
 * @param modelId - The model identifier
 * @returns Simplified description (or original if no simplification needed)
 */
export function simplifyDescriptionForModel(
  description: string,
  modelId: string
): string {
  const config = getModelConfig(modelId);

  if (
    !config.maxDescriptionLength ||
    description.length <= config.maxDescriptionLength
  ) {
    return description;
  }

  // Extract first paragraph or first N characters
  const firstParagraph = description.split("\n\n")[0];

  if (firstParagraph.length <= config.maxDescriptionLength) {
    return firstParagraph;
  }

  // Truncate and add ellipsis
  return description.substring(0, config.maxDescriptionLength) + "...";
}

/**
 * Get additional system prompt for tool calling hints
 *
 * @param modelId - The model identifier
 * @returns Additional system prompt, or empty string if not needed
 */
export function getToolCallingHint(modelId: string): string {
  const config = getModelConfig(modelId);
  return config.toolCallingHint || "";
}

/**
 * Parse a tool call chunk from a model
 *
 * @param chunk - The raw chunk from the model
 * @param modelId - The model identifier
 * @returns Parsed tool call in standard format
 */
export function parseToolCallForModel(chunk: any, modelId: string): any {
  const config = getModelConfig(modelId);

  if (config.parseToolCall) {
    return config.parseToolCall(chunk);
  }

  // Use default parsing (already in correct format)
  return chunk;
}

/**
 * Detect the current model from LMStudio
 *
 * @param lmstudioUrl - The LMStudio server URL
 * @returns The model identifier, or 'unknown' if detection fails
 */
export async function detectCurrentModel(lmstudioUrl: string): Promise<string> {
  try {
    const response = await fetch(`${lmstudioUrl}/models`);
    const data: any = await response.json();

    if (data.data && data.data.length > 0) {
      return data.data[0].id;
    }
  } catch (error) {
    // Silently fail - will use default behavior
  }

  return "unknown";
}
