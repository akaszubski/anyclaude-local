/**
 * Generic Backend Client
 * Works with any OpenAI-compatible API (LMStudio, vLLM-MLX, etc.)
 */

export interface BackendModelInfo {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Backend API error: ${response.status} ${response.statusText} (${url})`
      );
    }
    return (await response.json()) as BackendModelsResponse;
  }

  /**
   * Get the first available model
   * (vLLM-MLX typically only serves one model at a time)
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
   * Get model name and estimated context length
   * Note: OpenAI-compatible /v1/models doesn't always include context length,
   * so this may return null for context and we'll fall back to config/lookup
   */
  async getModelInfo(): Promise<{
    name: string;
    context: number | null;
  } | null> {
    const model = await this.getFirstModel();
    if (!model) return null;

    return {
      name: model.id,
      context: null, // OpenAI /v1/models doesn't include context length
    };
  }
}
