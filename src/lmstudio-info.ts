import { debug } from "./debug";

export interface LMStudioModelInfo {
  id: string;
  object: string;
  type: string;
  publisher: string;
  arch: string;
  compatibility_type: string;
  quantization?: string;
  state: "loaded" | "not-loaded";
  max_context_length: number;
  loaded_context_length?: number;
  capabilities?: string[];
}

export interface LMStudioModelsResponse {
  data: LMStudioModelInfo[];
}

/**
 * Get the currently loaded model from LMStudio
 */
export async function getLoadedModel(
  lmstudioUrl: string
): Promise<LMStudioModelInfo | null> {
  try {
    // LMStudio's API endpoint (not the OpenAI-compatible endpoint)
    const apiUrl = lmstudioUrl.replace("/v1", "/api/v0/models");

    debug(1, `[LMStudio] Querying model info from: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      debug(1, `[LMStudio] API request failed with status: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as LMStudioModelsResponse;

    // Find the loaded model
    const loadedModel = data.data.find((model) => model.state === "loaded");

    if (!loadedModel) {
      debug(1, `[LMStudio] No model currently loaded`);
      return null;
    }

    const contextLength = loadedModel.loaded_context_length || loadedModel.max_context_length;
    debug(
      1,
      `[LMStudio] Loaded model: ${loadedModel.id} | Context: ${contextLength.toLocaleString()} tokens`
    );

    return loadedModel;
  } catch (error) {
    debug(
      1,
      `[LMStudio] Failed to query model info:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Get the context length for the currently loaded model
 * Returns the loaded context length if available, otherwise max context length
 */
export async function getModelContextLength(
  lmstudioUrl: string
): Promise<number | null> {
  const model = await getLoadedModel(lmstudioUrl);
  if (!model) {
    return null;
  }

  // Prefer loaded_context_length (user's setting in LMStudio)
  // Fall back to max_context_length (model's maximum)
  return model.loaded_context_length ?? model.max_context_length;
}
