/**
 * Adaptive Capability Detection
 *
 * Probes backend capabilities at startup instead of hardcoding model quirks.
 * Caches results in memory with TTL.
 *
 * Pattern from nielspeter/claude-code-proxy: instead of assuming what a model
 * supports, test at runtime and remember the results.
 */

import { debug } from "./debug";

export interface ModelCapabilities {
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
  maxContextLength?: number;
  detectedAt: number;
}

interface CacheEntry {
  capabilities: ModelCapabilities;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PROBE_TIMEOUT_MS = 5000;
const capabilityCache = new Map<string, CacheEntry>();

/**
 * Get cached capabilities for a model/URL combination
 */
export function getCachedCapabilities(
  cacheKey: string
): ModelCapabilities | null {
  const entry = capabilityCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    capabilityCache.delete(cacheKey);
    return null;
  }
  return entry.capabilities;
}

/**
 * Cache capabilities for a model/URL combination
 */
function cacheCapabilities(
  cacheKey: string,
  capabilities: ModelCapabilities
): void {
  capabilityCache.set(cacheKey, {
    capabilities,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Probe whether the backend supports tool calling
 */
export async function probeToolCalling(
  url: string,
  model: string
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say hi" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test_probe",
              description: "Test probe",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        max_tokens: 1,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // 400/422 often means tools aren't supported
      const text = await response.text();
      if (
        text.includes("tool") ||
        text.includes("function") ||
        response.status === 400
      ) {
        debug(1, `[CapabilityDetector] Tool calling not supported: ${text.slice(0, 100)}`);
        return false;
      }
    }

    return true;
  } catch (error: any) {
    debug(1, `[CapabilityDetector] Tool probe failed: ${error.message}`);
    return false;
  }
}

/**
 * Probe whether the backend supports SSE streaming
 */
export async function probeStreaming(
  url: string,
  model: string
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say hi" }],
        stream: true,
        max_tokens: 1,
      }),
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    const isStream =
      contentType.includes("text/event-stream") ||
      contentType.includes("text/plain"); // some servers use text/plain for SSE

    if (!isStream) {
      debug(1, `[CapabilityDetector] Streaming not supported, got: ${contentType}`);
    }

    // Consume and discard the response body
    await response.text();
    return isStream;
  } catch (error: any) {
    debug(1, `[CapabilityDetector] Stream probe failed: ${error.message}`);
    return false;
  }
}

/**
 * Detect all capabilities for a backend, with caching
 */
export async function detectCapabilities(
  url: string,
  model: string
): Promise<ModelCapabilities> {
  const cacheKey = `${url}:${model}`;
  const cached = getCachedCapabilities(cacheKey);
  if (cached) {
    debug(2, `[CapabilityDetector] Using cached capabilities for ${cacheKey}`);
    return cached;
  }

  debug(1, `[CapabilityDetector] Probing capabilities for ${model} at ${url}`);

  const [supportsToolCalling, supportsStreaming] = await Promise.all([
    probeToolCalling(url, model),
    probeStreaming(url, model),
  ]);

  const capabilities: ModelCapabilities = {
    supportsToolCalling,
    supportsStreaming,
    supportsSystemPrompt: true, // All modern models support this
    detectedAt: Date.now(),
  };

  cacheCapabilities(cacheKey, capabilities);

  debug(
    1,
    `[CapabilityDetector] ${model}: tools=${supportsToolCalling}, stream=${supportsStreaming}`
  );

  return capabilities;
}

/**
 * Clear the capability cache (for testing or after config changes)
 */
export function clearCapabilityCache(): void {
  capabilityCache.clear();
}
