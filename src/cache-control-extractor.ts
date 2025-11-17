/**
 * Cache Control Extractor
 *
 * Extracts cache_control markers from Anthropic API requests and generates
 * cache keys for backend caching.
 *
 * Used by anthropic-proxy.ts to forward cache headers to MLX backend.
 */

import * as crypto from "crypto";

export interface CacheMarkers {
  hasSystemCache: boolean;
  systemCacheText: string;
  cacheableUserBlocks: number;
  estimatedCacheTokens: number;
  totalCacheableContent: string;
  cacheKey: string | null;
}

/**
 * Generate SHA256 hash for cache key
 *
 * @param content - Content to hash (can be string or object)
 * @returns 64-character lowercase hex SHA256 hash
 */
export function generateCacheHash(content: any): string {
  if (!content) {
    return "";
  }

  // If content is not a string, stringify it
  const textContent =
    typeof content === "string" ? content : JSON.stringify(content);

  if (textContent.length === 0) {
    return "";
  }

  return crypto
    .createHash("sha256")
    .update(textContent, "utf8")
    .digest("hex")
    .toLowerCase();
}

/**
 * Estimate token count from text
 *
 * Uses OpenAI standard: ~4 characters per token
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // OpenAI standard: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Extract cache_control markers from Anthropic request
 *
 * Identifies which blocks have cache_control: { type: "ephemeral" }
 * and extracts their text for caching.
 *
 * @param request - Anthropic API request body
 * @returns Cache markers with metadata
 */
export function extractMarkers(request: {
  system?: any;
  messages?: any[];
}): CacheMarkers {
  const markers: CacheMarkers = {
    hasSystemCache: false,
    systemCacheText: "",
    cacheableUserBlocks: 0,
    estimatedCacheTokens: 0,
    totalCacheableContent: "",
    cacheKey: null,
  };

  // Extract system cache markers
  if (request.system) {
    // System can be a string or array of blocks
    const systemBlocks = Array.isArray(request.system)
      ? request.system
      : [{ type: "text", text: request.system }];

    // Find blocks with cache_control
    const cacheableBlocks = systemBlocks.filter(
      (block: any) => block.cache_control?.type === "ephemeral"
    );

    if (cacheableBlocks.length > 0) {
      markers.hasSystemCache = true;
      markers.systemCacheText = cacheableBlocks
        .map((b: any) => b.text || "")
        .join("\n");
    }
  }

  // Count cacheable user message blocks
  if (request.messages && Array.isArray(request.messages)) {
    request.messages.forEach((msg: any) => {
      if (msg.content && Array.isArray(msg.content)) {
        msg.content.forEach((block: any) => {
          if (block.cache_control?.type === "ephemeral") {
            markers.cacheableUserBlocks++;
          }
        });
      }
    });
  }

  // Combine all cacheable content
  markers.totalCacheableContent = markers.systemCacheText;

  // Estimate tokens and generate cache key
  if (markers.totalCacheableContent.length > 0) {
    markers.estimatedCacheTokens = estimateTokens(
      markers.totalCacheableContent
    );
    markers.cacheKey = generateCacheHash(markers.totalCacheableContent);
  }

  return markers;
}
