/**
 * LMStudio API Client
 * Centralized interface for all LMStudio API operations
 */

export interface ModelInfo {
  id: string;
  state: "loaded" | "not-loaded";
  max_context_length?: number;
  loaded_context_length?: number;
  capabilities?: string[];
  arch?: string;
  quantization?: string;
}

export interface ModelsResponse {
  data: ModelInfo[];
  object: "list";
}

export class LMStudioClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.LMSTUDIO_URL || "http://localhost:1234";
  }

  /**
   * Get all models from LMStudio
   */
  async getModels(): Promise<ModelsResponse> {
    const response = await fetch(`${this.baseUrl}/api/v0/models`);
    if (!response.ok) {
      throw new Error(`LMStudio API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ModelsResponse;
  }

  /**
   * Get the currently loaded model
   */
  async getLoadedModel(): Promise<ModelInfo | null> {
    const models = await this.getModels();
    return models.data.find((m) => m.state === "loaded") || null;
  }

  /**
   * Get the context length of the currently loaded model
   */
  async getContextLength(): Promise<number | null> {
    const model = await this.getLoadedModel();
    if (!model) return null;

    // Prefer loaded_context_length (actual configured context)
    // Fall back to max_context_length (model's maximum capability)
    return model.loaded_context_length || model.max_context_length || null;
  }

  /**
   * Check if a model is currently loaded
   */
  async hasModelLoaded(): Promise<boolean> {
    const model = await this.getLoadedModel();
    return model !== null;
  }

  /**
   * Get model info including name and context
   */
  async getModelInfo(): Promise<{
    name: string;
    context: number;
    arch?: string;
    quantization?: string;
  } | null> {
    const model = await this.getLoadedModel();
    if (!model) return null;

    return {
      name: model.id,
      context: model.loaded_context_length || model.max_context_length || 32768,
      arch: model.arch,
      quantization: model.quantization,
    };
  }
}
