/**
 * Generic Backend Client
 * Works with any OpenAI-compatible API (LMStudio, MLX, etc.)
 */

export interface BackendModelInfo {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  context_length?: number; // MLX support
  loaded_context_length?: number; // LMStudio support
  max_context_length?: number; // Fallback
}

export interface BackendModelsResponse {
  data: BackendModelInfo[];
  object: "list";
}

export class BackendClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Ensure baseUrl doesn't end with /v1 since we'll add specific paths
    this.baseUrl = baseUrl.replace(/\/v1$/, "");
  }

  /**
   * Get all models from the backend
   * Uses OpenAI-compatible /v1/models endpoint
   */
  async getModels(): Promise<BackendModelsResponse> {
    const url = `${this.baseUrl}/v1/models`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const hint = response.status === 404
          ? " Check model name and endpoint path."
          : response.status === 503
          ? " Backend may be overloaded or model still loading."
          : "";
        throw new Error(
          `Backend API error (${response.status} ${response.statusText}): ${url}.${hint}`
        );
      }
      return (await response.json()) as BackendModelsResponse;
    } catch (error: any) {
      // Connection errors (ECONNREFUSED, timeout, network issues)
      if (error.cause?.code === "ECONNREFUSED" || error.message?.includes("ECONNREFUSED")) {
        throw new Error(
          `Backend connection failed: Cannot connect to ${url}. Is the server running? Check LOCAL_URL in .anyclauderc.json`
        );
      }
      if (error.name === "AbortError" || error.message?.includes("timeout")) {
        throw new Error(
          `Backend request timeout: No response from ${url}. For large models, increase timeout in .anyclauderc.json`
        );
      }
      // Re-throw if it's already our formatted error
      throw error;
    }
  }

  /**
   * Get the first available model
   * (MLX typically only serves one model at a time)
   */
  async getFirstModel(): Promise<BackendModelInfo | null> {
    try {
      const models = await this.getModels();
      return models.data[0] || null;
    } catch (error) {
      // Backend may not support /v1/models endpoint
      return null;
    }
  }

  /**
   * Get model name and context length
   * Extracts context from MLX (context_length), LMStudio (loaded_context_length),
   * or fallback (max_context_length) fields.
   *
   * Priority order: loaded_context_length > context_length > max_context_length
   */
  async getModelInfo(): Promise<{
    name: string;
    context: number | null;
  } | null> {
    const model = await this.getFirstModel();
    if (!model) return null;

    // Extract context with priority order
    let context: number | null = null;

    // Priority 1: loaded_context_length (LMStudio)
    if (this.isValidContext(model.loaded_context_length)) {
      context = model.loaded_context_length!;
    }
    // Priority 2: context_length (MLX)
    else if (this.isValidContext(model.context_length)) {
      context = model.context_length!;
    }
    // Priority 3: max_context_length (fallback)
    else if (this.isValidContext(model.max_context_length)) {
      context = model.max_context_length!;
    }

    return {
      name: model.id,
      context,
    };
  }

  /**
   * Validate context length value
   * Must be: positive number, finite, not NaN
   */
  private isValidContext(value: number | undefined | null): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value !== "number") return false;
    if (isNaN(value)) return false;
    if (!isFinite(value)) return false;
    if (value <= 0) return false;
    return true;
  }
}
