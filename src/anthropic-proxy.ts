import type { ProviderV2 } from "@ai-sdk/provider";
import { jsonSchema, streamText, type Tool } from "ai";
import * as http from "http";
import * as https from "https";
import type {
  AnthropicMessagesRequest,
  AnthropicStreamChunk,
} from "./anthropic-api-types";
import { mapAnthropicStopReason } from "./anthropic-api-types";
import {
  convertFromAnthropicMessages,
  convertToAnthropicMessagesPrompt,
} from "./convert-anthropic-messages";
import { convertToAnthropicStream } from "./convert-to-anthropic-stream";
import { convertToLanguageModelMessage } from "./convert-to-language-model-prompt";
import { providerizeSchema } from "./json-schema";
import { convertAnthropicToolsToOpenAI } from "./tool-schema-converter";
import {
  writeDebugToTempFile,
  logDebugError,
  displayDebugStartup,
  isDebugEnabled,
  isVerboseDebugEnabled,
  isTraceDebugEnabled,
  debug,
} from "./debug";
import {
  calculateContextStats,
  truncateMessages,
  logContextWarning,
} from "./context-manager";
import { getModelContextLength } from "./lmstudio-info";
import { BackendClient } from "./backend-client";
import { logTrace, type AnyclaudeMode } from "./trace-logger";
import { getBackendLogPrefix } from "./utils/backend-display";
import { logRequest } from "./request-logger";
import { generatePrometheusMetrics, recordRequest } from "./prometheus-metrics";
import {
  initializeCacheTracking,
  getCacheTracker,
  displayCacheMetricsOnExit,
} from "./cache-metrics";
import { getCachedPrompt, getCacheStats } from "./prompt-cache";
import { getCacheMonitor } from "./cache-monitor-dashboard";
import { extractMarkers } from "./cache-control-extractor";
import { getTimeoutConfig } from "./timeout-config";
import {
  getToolContextManager,
  extractLastToolCalls,
} from "./tool-context-manager";
import { createHash } from "crypto";
import {
  buildOptimizedSystemPrompt,
  shouldUseSmartPrompt,
} from "./smart-system-prompt";
import {
  optimizePromptAdaptive,
  type OptimizationResult,
} from "./adaptive-optimizer";
import {
  filterSystemPrompt,
  OptimizationTier,
  type FilterResult,
} from "./safe-system-filter";
import { getClusterManager } from "./cluster/cluster-manager";
import type { MLXNode } from "./cluster/cluster-types";
import {
  processMessages,
  type InjectionConfig,
  DEFAULT_INJECTION_CONFIG,
} from "./tool-instruction-injector";
import {
  filterServerSideTools,
  executeProactiveSearch,
  initializeSearchClassifier,
  getDefaultClassifierConfig,
  isInternalMessage,
} from "./server-side-tool-handler";
import { CircuitBreaker } from "./circuit-breaker";

// Security: Maximum request body size (10MB) to prevent DoS attacks
// Claude Code requests are typically 1-5MB, so 10MB provides headroom
const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB

// Circuit breaker for monitoring backend health and latency
const proxyCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  retryTimeout: 30000,
  requestTimeout: 10000,
  latencyThresholdMs: 30000, // 30s - high for LLM requests
  latencyConsecutiveChecks: 3,
  latencyWindowMs: 60000, // 1 minute window
  autoCheckLatency: true,
});

/**
 * Helper function to determine if safe system filter should be used
 *
 * Rules:
 * 1. Returns false if smartSystemPrompt is active (smart takes priority)
 * 2. Returns true if safeSystemFilter is explicitly true
 * 3. Returns true if mode is 'local' AND safeSystemFilter is not explicitly false
 * 4. Returns false for other modes (claude, openrouter) by default
 */
function shouldUseSafeFilter(options: CreateAnthropicProxyOptions): boolean {
  // Smart prompt takes priority over safe filter
  if (options.smartSystemPrompt === true) {
    return false;
  }

  // Explicitly enabled
  if (options.safeSystemFilter === true) {
    return true;
  }

  // Explicitly disabled
  if (options.safeSystemFilter === false) {
    return false;
  }

  // For local mode: enabled by default if not explicitly disabled
  if (options.mode === "local" && options.safeSystemFilter === undefined) {
    return true;
  }

  // For other modes: disabled by default
  return false;
}

/**
 * Map config tier to OptimizationTier enum
 *
 * In 'auto' mode, selects tier based on prompt size:
 * - < 5000 tokens: MINIMAL
 * - < 10000 tokens: MODERATE
 * - < 20000 tokens: AGGRESSIVE
 * - >= 20000 tokens: EXTREME
 *
 * @param tier - Optimization tier: explicit tier name or 'auto' for size-based selection
 * @param promptTokens - Estimated token count for prompt (used only in auto mode)
 * @returns OptimizationTier enum value
 */
function mapTierConfig(
  tier: "auto" | "minimal" | "moderate" | "aggressive" | "extreme" | undefined,
  promptTokens?: number
): OptimizationTier {
  // If tier is explicit, map to enum
  if (tier === "minimal") return OptimizationTier.MINIMAL;
  if (tier === "moderate") return OptimizationTier.MODERATE;
  if (tier === "aggressive") return OptimizationTier.AGGRESSIVE;
  if (tier === "extreme") return OptimizationTier.EXTREME;

  // Auto mode: select tier based on prompt size
  if (!promptTokens) {
    return OptimizationTier.MODERATE; // Safe default
  }

  if (promptTokens < 5000) return OptimizationTier.MINIMAL;
  if (promptTokens < 10000) return OptimizationTier.MODERATE;
  if (promptTokens < 20000) return OptimizationTier.AGGRESSIVE;
  return OptimizationTier.EXTREME;
}

/**
 * Get the optimization strategy being used
 *
 * Determines which prompt optimization strategy applies based on config options.
 * Priority order: smart > safe > truncate > passthrough
 *
 * @param options - Proxy configuration options
 * @returns Active strategy: 'smart' (context-aware), 'safe' (filtered), 'truncate' (size-limited), or 'passthrough' (no optimization)
 */
function getOptimizationStrategy(
  options: CreateAnthropicProxyOptions
): "smart" | "safe" | "truncate" | "passthrough" {
  if (options.smartSystemPrompt === true) {
    return "smart";
  }
  if (shouldUseSafeFilter(options)) {
    return "safe";
  }
  if (options.truncateSystemPrompt === true) {
    return "truncate";
  }
  return "passthrough";
}

/**
 * Apply safe system filter with error handling
 *
 * Removes optional sections from system prompt while preserving critical tool calling
 * instructions. Includes multi-level debug logging for troubleshooting.
 *
 * @param prompt - System prompt to filter
 * @param options - Configuration options (used to determine filter tier)
 * @returns FilterResult with filtered prompt, statistics, and validation info
 */
function applySafeSystemFilter(
  prompt: string,
  options: CreateAnthropicProxyOptions
): FilterResult {
  const estimateTokens = (text: string) => Math.floor(text.length / 4);
  const promptTokens = estimateTokens(prompt);
  const tier = mapTierConfig(options.filterTier, promptTokens);

  const result = filterSystemPrompt(prompt, { tier });

  // Debug logging (only when called standalone, not in optimization chain)
  if (isDebugEnabled()) {
    const msg = `[Safe System Filter] Applied tier ${result.appliedTier} | ${result.stats.originalTokens} → ${result.stats.filteredTokens} tokens (${result.stats.reductionPercent.toFixed(1)}% reduction)`;
    debug(1, msg);
    // Also log to console for testing
    console.log(msg);
  }

  if (isVerboseDebugEnabled()) {
    const statsData = {
      originalTokens: result.stats.originalTokens,
      filteredTokens: result.stats.filteredTokens,
      reductionPercent: result.stats.reductionPercent.toFixed(1) + "%",
      processingTimeMs: result.stats.processingTimeMs,
    };
    debug(2, `[Safe System Filter] Stats:`, statsData);
    // Also log to console for testing
    console.log(`[Safe System Filter] Stats: ${JSON.stringify(statsData)}`);
  }

  if (isTraceDebugEnabled()) {
    const traceData = {
      appliedTier: result.appliedTier,
      validation: result.validation,
      promptSnippet: result.filteredPrompt.substring(0, 200),
    };
    debug(3, `[Safe System Filter] Full prompt details:`, traceData);
    // Also log to console for testing
    console.log(
      `[Safe System Filter] Full prompt details: ${JSON.stringify(traceData)}`
    );
  }

  return result;
}

/**
 * Select optimization tier based on prompt size and config
 *
 * Estimates token count from prompt and selects appropriate optimization tier.
 * Returns tier as string (uppercase) for test compatibility.
 *
 * @param prompt - System prompt to analyze
 * @param tierConfig - Requested tier: explicit tier name or 'auto' for size-based selection
 * @returns Optimization tier as uppercase string: MINIMAL, MODERATE, AGGRESSIVE, or EXTREME
 */
function selectOptimizationTier(
  prompt: string,
  tierConfig:
    | "auto"
    | "minimal"
    | "moderate"
    | "aggressive"
    | "extreme"
    | undefined
): "MINIMAL" | "MODERATE" | "AGGRESSIVE" | "EXTREME" {
  const estimateTokens = (text: string) => Math.floor(text.length / 4);
  const promptTokens = estimateTokens(prompt);
  const tier = mapTierConfig(tierConfig, promptTokens);

  // Convert enum to string for test compatibility
  return tier as "MINIMAL" | "MODERATE" | "AGGRESSIVE" | "EXTREME";
}

/**
 * Optimize system prompt using selected strategy
 *
 * Applies the appropriate optimization strategy and falls back gracefully if it fails.
 * Safe filter validates filtered prompts and falls back to truncate if validation fails.
 *
 * @param prompt - System prompt to optimize
 * @param options - Configuration options determining which strategy to use
 * @returns Object with strategy name and optimized (or original) prompt
 */
function optimizeSystemPrompt(
  prompt: string,
  options: CreateAnthropicProxyOptions
): { strategy: string; prompt: string } {
  const strategy = getOptimizationStrategy(options);

  if (strategy === "safe") {
    try {
      const result = applySafeSystemFilter(prompt, options);

      if (result.validation.isValid) {
        return { strategy: "safe", prompt: result.filteredPrompt };
      }

      // Fallback to truncate if validation fails
      if (options.truncateSystemPrompt) {
        return { strategy: "truncate", prompt };
      }
    } catch (error) {
      // On error, fallback to truncate or passthrough
      if (options.truncateSystemPrompt) {
        return { strategy: "truncate", prompt };
      }
    }
  }

  return { strategy, prompt };
}

/**
 * Compute hashes for system prompt and tools for cache affinity routing.
 *
 * Used by MLX cluster routing to assign requests to nodes with warm caches.
 *
 * @param body - Anthropic API request body
 * @returns Object with systemHash and toolsHash
 */
function computePromptHash(body: any): {
  systemHash: string;
  toolsHash: string;
} {
  let systemPrompt = "";
  if (typeof body.system === "string") {
    systemPrompt = body.system;
  } else if (Array.isArray(body.system)) {
    systemPrompt = body.system
      .map((s: any) => (typeof s === "string" ? s : JSON.stringify(s)))
      .join("\n");
  }
  const systemInput = JSON.stringify({ system: systemPrompt });
  const toolsInput = JSON.stringify({ tools: body.tools || [] });
  return {
    systemHash: createHash("sha256").update(systemInput).digest("hex"),
    toolsHash: createHash("sha256").update(toolsInput).digest("hex"),
  };
}

export type CreateAnthropicProxyOptions = {
  providers: Record<string, ProviderV2>;
  port?: number;
  defaultProvider: string;
  defaultModel: string;
  mode: AnyclaudeMode;
  backendUrl?: string; // URL of the active backend for model queries
  truncateSystemPrompt?: boolean; // Truncate system prompt for LMStudio
  systemPromptMaxTokens?: number; // Max tokens for system prompt (default: 2000)
  smartSystemPrompt?: boolean; // Use dynamic context-aware prompt optimization
  smartPromptMode?: "simple" | "intelligent"; // Optimization strategy
  safeSystemFilter?: boolean; // Enable/disable safe filtering
  filterTier?: "auto" | "minimal" | "moderate" | "aggressive" | "extreme"; // Optimization tier
  injectToolInstructions?: boolean; // Enable/disable tool instruction injection
  toolInstructionStyle?: "explicit" | "subtle"; // Instruction style
  injectionThreshold?: number; // Confidence threshold (0-1)
  maxInjectionsPerConversation?: number; // Max injections per conversation
  stubToolDescriptions?: boolean; // Replace tool descriptions with stubs, expand as skills on demand
};

// createAnthropicProxy creates a proxy server that accepts
// Anthropic Message API requests and proxies them through
// LMStudio (or real Anthropic API in Claude mode) - converting
// the results back to the Anthropic Message API format.
export const createAnthropicProxy = ({
  port,
  providers,
  defaultProvider,
  defaultModel,
  mode,
  backendUrl,
  truncateSystemPrompt = false,
  systemPromptMaxTokens = 2000,
  smartSystemPrompt = false,
  smartPromptMode = "simple",
  safeSystemFilter = false,
  filterTier = "auto",
  injectToolInstructions = false,
  toolInstructionStyle = "explicit",
  injectionThreshold = 0.7,
  maxInjectionsPerConversation = 10,
  stubToolDescriptions = false,
}: CreateAnthropicProxyOptions): string => {
  // Log debug status on startup
  displayDebugStartup();

  // Initialize cache metrics tracking
  initializeCacheTracking();
  displayCacheMetricsOnExit();

  // Initialize GenAI search intent classifier for local modes
  if (mode !== "claude" && mode !== "openrouter") {
    const classifierConfig = getDefaultClassifierConfig();
    console.log(
      `[anyclaude] Initializing GenAI search classifier for mode: ${mode}`
    );
    initializeSearchClassifier(classifierConfig, mode, backendUrl);
  }

  // Cache for backend model info (queried on first request)
  let cachedContextLength: number | null = null;
  let cachedModelName: string | null = null;
  let modelInfoQueried = false;

  // Request ID counter for tracking
  let requestCounter = 0;

  // Tools cache for Anthropic cache_control support
  // When Claude Code uses cache_control on tools, it doesn't re-send them
  // We cache them here and restore on subsequent requests
  let cachedTools: any[] | null = null;

  const proxy = http
    .createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400, {
          "Content-Type": "application/json",
        });
        res.end(
          JSON.stringify({
            error: "No URL provided",
          })
        );
        return;
      }

      // Security: Check Content-Length header for oversized requests (DoS prevention)
      const contentLength = parseInt(req.headers["content-length"] || "0", 10);
      if (contentLength > MAX_REQUEST_BODY_SIZE) {
        res.writeHead(413, {
          "Content-Type": "application/json",
        });
        res.end(
          JSON.stringify({
            error: `Request body too large. Maximum size is ${MAX_REQUEST_BODY_SIZE / (1024 * 1024)}MB`,
          })
        );
        debug(
          1,
          `[Security] Rejected oversized request: ${contentLength} bytes (max: ${MAX_REQUEST_BODY_SIZE})`
        );
        return;
      }

      // Circuit breaker metrics endpoint
      if (req.url === "/v1/circuit-breaker/metrics" && req.method === "GET") {
        CircuitBreaker.handleMetricsRequest(
          proxyCircuitBreaker,
          { method: req.method, url: req.url },
          res
        );
        return;
      }

      // Health probe endpoints (Kubernetes-compatible)
      if (req.url === "/health/live" && req.method === "GET") {
        // Liveness probe - is the process alive?
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "alive" }));
        return;
      }

      if (req.url === "/health/ready" && req.method === "GET") {
        // Readiness probe - can we handle traffic?
        const metrics = proxyCircuitBreaker.getMetrics();
        const circuitOpen = metrics.state === "OPEN";

        const response = {
          status: circuitOpen ? "not_ready" : "ready",
          checks: {
            circuit_breaker: {
              state: metrics.state,
              failure_count: metrics.failureCount,
            },
          },
        };

        if (circuitOpen) {
          res.writeHead(503, { "Content-Type": "application/json" });
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify(response));
        return;
      }

      // Prometheus metrics endpoint
      if (req.url === "/v1/metrics" && req.method === "GET") {
        const metricsOutput = generatePrometheusMetrics(proxyCircuitBreaker);
        res.writeHead(200, {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        });
        res.end(metricsOutput);
        return;
      }

      const proxyToAnthropic = (body?: AnthropicMessagesRequest) => {
        delete req.headers["host"];

        const requestBody = body ? JSON.stringify(body) : null;
        const chunks: Buffer[] = [];
        const responseChunks: Buffer[] = [];

        // Log trace for Claude mode
        if (mode === "claude" && body) {
          logTrace(mode, {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body,
          });
        }

        const proxy = https.request(
          {
            host: "api.anthropic.com",
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (proxiedRes) => {
            const statusCode = proxiedRes.statusCode ?? 500;

            // Collect response data for debugging
            proxiedRes.on("data", (chunk) => {
              responseChunks.push(chunk);

              // In Claude mode with TRACE debug, parse and log SSE events to see tool calls
              if (mode === "claude" && isTraceDebugEnabled()) {
                const chunkStr = chunk.toString();
                const lines = chunkStr.split("\n");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const data = JSON.parse(line.substring(6));

                      // Log tool_use events from Claude API
                      if (
                        data.type === "content_block_start" &&
                        data.content_block?.type === "tool_use"
                      ) {
                        debug(
                          3,
                          `[Claude API → Tool Call] Tool use from real Claude:`,
                          {
                            tool_name: data.content_block.name,
                            tool_id: data.content_block.id,
                            input: data.content_block.input,
                          }
                        );
                      }
                    } catch (e) {
                      // Ignore parse errors for non-JSON data lines
                    }
                  }
                }
              }
            });

            proxiedRes.on("end", () => {
              const responseBody = Buffer.concat(responseChunks).toString();
              const requestId = `req-${++requestCounter}`;

              // Record cache metrics
              if (body && statusCode >= 200 && statusCode < 400) {
                try {
                  const parsedResponse = JSON.parse(responseBody);
                  const tracker = getCacheTracker();
                  const responseHeaders = proxiedRes.headers as Record<
                    string,
                    any
                  >;

                  tracker.recordRequest(
                    requestId,
                    mode,
                    body,
                    responseHeaders,
                    parsedResponse
                  );

                  // Log cache metrics for verbose debugging
                  if (isVerboseDebugEnabled()) {
                    const usage = parsedResponse?.usage;
                    if (
                      usage?.cache_creation_input_tokens ||
                      usage?.cache_read_input_tokens
                    ) {
                      debug(2, `[Cache Metrics] ${requestId}`, {
                        cache_creation_tokens:
                          usage.cache_creation_input_tokens || 0,
                        cache_read_tokens: usage.cache_read_input_tokens || 0,
                        input_tokens: usage.input_tokens,
                        output_tokens: usage.output_tokens,
                      });
                    }
                  }

                  // Record cache metrics for monitoring (Claude and MLX)
                  if (parsedResponse?.usage && body) {
                    const usage = parsedResponse.usage;
                    const inputTokens = usage.input_tokens || 0;
                    const cacheReadTokens = usage.cache_read_input_tokens || 0;
                    const cacheCreationTokens =
                      usage.cache_creation_input_tokens || 0;

                    // Calculate hash from system prompt and tools for per-prompt tracking
                    let systemPrompt = "";
                    if (typeof body.system === "string") {
                      systemPrompt = body.system;
                    } else if (Array.isArray(body.system)) {
                      systemPrompt = JSON.stringify(body.system);
                    }
                    const systemPromptLength = systemPrompt.length;
                    const toolCount = body.tools ? body.tools.length : 0;
                    // Hash the full system prompt + tools to ensure identical prompts get same hash
                    const hashInput = JSON.stringify({
                      system: systemPrompt,
                      tools: body.tools || [],
                    });
                    const hash = createHash("sha256")
                      .update(hashInput)
                      .digest("hex");

                    const monitor = getCacheMonitor();

                    if (mode === "claude") {
                      // Claude returns explicit cache metrics
                      if (cacheReadTokens > 0) {
                        monitor.recordHit(hash, inputTokens, cacheReadTokens);
                      } else {
                        monitor.recordMiss(
                          hash,
                          inputTokens,
                          cacheCreationTokens,
                          systemPromptLength,
                          toolCount
                        );
                      }
                    } else {
                      // MLX: infer cache hits from repeated request hashes
                      // Track this request for pattern detection
                      const currentEntry = monitor
                        .getMetrics()
                        .entries.get(hash);

                      if (currentEntry && currentEntry.misses > 0) {
                        // We've seen this hash before - MLX likely cached it
                        // Estimate cache read tokens: assume system prompt + tools were cached (~70% of input)
                        const estimatedCacheReadTokens = Math.floor(
                          inputTokens * 0.7
                        );
                        monitor.recordHit(
                          hash,
                          inputTokens,
                          estimatedCacheReadTokens
                        );
                      } else {
                        // First time seeing this hash
                        // Estimate cache creation tokens: system prompt + tools created cache (~70% of input)
                        const estimatedCacheCreationTokens = Math.floor(
                          inputTokens * 0.7
                        );
                        monitor.recordMiss(
                          hash,
                          inputTokens,
                          estimatedCacheCreationTokens,
                          systemPromptLength,
                          toolCount
                        );
                      }
                    }
                  }
                } catch (error) {
                  debug(1, "[Cache Metrics] Failed to record metrics:", error);
                }
              }

              // Log trace for Claude mode (successful responses)
              if (
                mode === "claude" &&
                body &&
                statusCode >= 200 &&
                statusCode < 400
              ) {
                try {
                  logTrace(
                    mode,
                    {
                      method: req.method,
                      url: req.url,
                      headers: req.headers,
                      body: body,
                    },
                    {
                      statusCode,
                      headers: proxiedRes.headers,
                      body: JSON.parse(responseBody),
                    }
                  );
                } catch (error) {
                  // If response isn't JSON, log as string
                  logTrace(
                    mode,
                    {
                      method: req.method,
                      url: req.url,
                      headers: req.headers,
                      body: body,
                    },
                    {
                      statusCode,
                      headers: proxiedRes.headers,
                      body: responseBody,
                    }
                  );
                }
              }

              // Write debug info to temp file for 4xx errors (except 429)
              if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
                const requestBodyToLog = requestBody
                  ? JSON.parse(requestBody)
                  : chunks.length > 0
                    ? (() => {
                        try {
                          return JSON.parse(Buffer.concat(chunks).toString());
                        } catch {
                          return Buffer.concat(chunks).toString();
                        }
                      })()
                    : null;

                const debugFile = writeDebugToTempFile(
                  statusCode,
                  {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: requestBodyToLog,
                  },
                  {
                    statusCode,
                    headers: proxiedRes.headers,
                    body: responseBody,
                  }
                );

                if (debugFile) {
                  logDebugError("HTTP", statusCode, debugFile);
                }
              }
            });

            res.writeHead(statusCode, proxiedRes.headers);
            proxiedRes.pipe(res, {
              end: true,
            });
          }
        );

        if (requestBody) {
          proxy.end(requestBody);
        } else {
          req.on("data", (chunk) => {
            chunks.push(chunk);
            proxy.write(chunk);
          });
          req.on("end", () => {
            proxy.end();
          });
        }
      };

      // In Claude mode, passthrough all requests to api.anthropic.com
      if (mode === "claude") {
        if (!req.url.startsWith("/v1/messages")) {
          proxyToAnthropic();
          return;
        }

        // For /v1/messages in Claude mode, parse body and passthrough with trace
        (async () => {
          const body = await new Promise<AnthropicMessagesRequest>(
            (resolve, reject) => {
              let body = "";
              req.on("data", (chunk) => {
                body += chunk;
              });
              req.on("end", () => {
                resolve(JSON.parse(body));
              });
              req.on("error", (err) => {
                reject(err);
              });
            }
          );

          // Log tool schemas in Claude mode for comparison
          if (isTraceDebugEnabled() && body.tools) {
            debug(
              3,
              `[Claude Mode] Claude Code sent ${body.tools.length} tools in request`
            );
            body.tools.forEach((tool, idx) => {
              debug(
                3,
                `[Claude Mode Tool ${idx + 1}/${body.tools!.length}] ${tool.name}`,
                {
                  description_length: tool.description?.length ?? 0,
                  input_schema: tool.input_schema,
                }
              );
            });
          }

          proxyToAnthropic(body);
        })().catch((err) => {
          res.writeHead(500, {
            "Content-Type": "application/json",
          });
          res.end(
            JSON.stringify({
              error: "Internal server error: " + err.message,
            })
          );
        });

        return;
      }

      // For non-messages endpoints, passthrough to Anthropic
      if (!req.url.startsWith("/v1/messages")) {
        proxyToAnthropic();
        return;
      }

      // LMStudio mode: convert messages and route through LMStudio
      (async () => {
        // Declare timeout early so it's available to close handler
        let timeout: NodeJS.Timeout | null = null;
        // Track if we executed proactive search (to strip WebSearch tool calls from response)
        let proactiveSearchExecuted = false;

        const body = await new Promise<AnthropicMessagesRequest>(
          (resolve, reject) => {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => {
              resolve(JSON.parse(body));
            });
            req.on("error", (err) => {
              reject(err);
            });
          }
        );

        // Use default provider and model (LMStudio)
        let providerName = defaultProvider;
        let model = defaultModel;
        let selectedNode: MLXNode | null = null;

        // Cluster routing for MLX cluster mode
        if (mode === "mlx-cluster") {
          try {
            const clusterManager = getClusterManager();

            // Compute hashes for cache affinity (routes similar prompts to same node for warm cache)
            const { systemHash, toolsHash } = computePromptHash(body);

            // Extract session ID from request headers for session stickiness
            const sessionId = req.headers["x-session-id"] as string | undefined;

            // Select node using cache affinity (hash-based routing) and session stickiness
            // Requests with same system prompt/tools route to node with warm cache when possible
            selectedNode = clusterManager.selectNode(
              systemHash,
              toolsHash,
              sessionId
            );

            if (!selectedNode) {
              debug(1, "[Cluster Routing] No healthy nodes available");
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  type: "error",
                  error: {
                    type: "overloaded_error",
                    message: "No healthy cluster nodes available",
                  },
                })
              );
              return;
            }

            debug(
              2,
              `[Cluster Routing] Selected node ${selectedNode.id} at ${selectedNode.url}`
            );

            // Get provider from cluster manager instead of providers map
            const clusterProvider = clusterManager.getNodeProvider(
              selectedNode.id
            );
            if (!clusterProvider) {
              throw new Error(`Provider not found for node ${selectedNode.id}`);
            }

            // Override provider and model for cluster routing
            // Use 'mlx-cluster' as provider name and default model
            providerName = "mlx-cluster";
            // Keep the default model, as MLX nodes use whatever model is loaded
          } catch (error) {
            debug(1, "[Cluster Routing] Error during node selection:", error);
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                type: "error",
                error: {
                  type: "overloaded_error",
                  message:
                    "Cluster routing failed: " +
                    (error instanceof Error ? error.message : String(error)),
                },
              })
            );
            return;
          }
        }

        // FIX #3: Log the request for observability and debugging
        logRequest(body, providerName, model);

        // Extract cache_control markers for backend caching
        const cacheMarkers = extractMarkers(body);
        if (cacheMarkers.hasSystemCache && isVerboseDebugEnabled()) {
          debug(2, `[Cache Control] Detected cacheable content:`, {
            systemCache: cacheMarkers.hasSystemCache,
            userBlocks: cacheMarkers.cacheableUserBlocks,
            estimatedTokens: cacheMarkers.estimatedCacheTokens,
            cacheKey: cacheMarkers.cacheKey?.substring(0, 16) + "...",
          });
        }

        // Get provider - either from cluster or from providers map
        const provider =
          mode === "mlx-cluster" && selectedNode
            ? getClusterManager().getNodeProvider(selectedNode.id)
            : providers[providerName];

        if (!provider) {
          throw new Error(`Provider not configured: ${providerName}`);
        }

        // Check prompt cache for metrics tracking only (don't modify request)
        const cachedPrompt = getCachedPrompt(
          body.system || [],
          body.tools || []
        );
        if (cachedPrompt.cached && isVerboseDebugEnabled()) {
          debug(
            2,
            `[Prompt Cache] HIT - Skipping ${
              body.system && Array.isArray(body.system)
                ? body.system.reduce(
                    (sum: number, s: any) => sum + (s.text?.length || 0),
                    0
                  )
                : 0
            } characters of system prompt`
          );
        }

        let system: string | undefined;
        if (body.system) {
          // Handle both string and array formats for system prompt
          if (typeof body.system === "string") {
            system = body.system;
          } else if (Array.isArray(body.system) && body.system.length > 0) {
            system = body.system
              .map((s) => (typeof s === "string" ? s : s.text))
              .join("\n");
          }
        }

        // Optimization chain priority: smart → safe → truncate → passthrough
        // Each strategy is mutually exclusive (early return prevents fallthrough).
        // Safe filter includes fallback: if validation fails, falls back to truncate.

        // Priority 1: Adaptive multi-tier prompt optimization (smartSystemPrompt)
        // Context-aware: analyzes user request + conversation history to optimize
        if (smartSystemPrompt && system && shouldUseSmartPrompt(body, mode)) {
          // Get user message from request
          const lastMessage = body.messages[body.messages.length - 1];
          let userMessage = "";
          if (typeof lastMessage?.content === "string") {
            userMessage = lastMessage.content;
          } else if (
            Array.isArray(lastMessage?.content) &&
            lastMessage.content.length > 0
          ) {
            const firstContent = lastMessage.content[0];
            if (firstContent && "text" in firstContent) {
              userMessage = firstContent.text;
            }
          }

          // Apply adaptive optimization with automatic tier selection
          const result: OptimizationResult = optimizePromptAdaptive(
            system,
            userMessage,
            body.messages.slice(0, -1) // conversation history
          );

          system = result.optimizedPrompt;

          debug(
            1,
            `[Adaptive Optimizer] Tier: ${result.tier.toUpperCase()} | ${result.stats.originalTokens} → ${result.stats.optimizedTokens} tokens (${result.stats.reductionPercent.toFixed(1)}% reduction) | Complexity: ${(result.metrics.estimatedComplexity * 100).toFixed(0)}%`
          );
        }

        // Priority 2: Safe system filter (safeSystemFilter)
        // Rule-based: removes optional sections while preserving critical tool calling instructions
        // Validates filtered prompt matches expected patterns (has fallback to truncate)
        let safeFilterApplied = false;
        if (
          shouldUseSafeFilter({
            mode,
            smartSystemPrompt,
            safeSystemFilter,
            truncateSystemPrompt,
            filterTier,
            providers,
            defaultProvider,
            defaultModel,
            systemPromptMaxTokens,
            smartPromptMode,
          } as CreateAnthropicProxyOptions) &&
          system
        ) {
          try {
            const filterResult = applySafeSystemFilter(system, {
              mode,
              smartSystemPrompt,
              safeSystemFilter,
              truncateSystemPrompt,
              filterTier,
              providers,
              defaultProvider,
              defaultModel,
              systemPromptMaxTokens,
              smartPromptMode,
            } as CreateAnthropicProxyOptions);

            if (filterResult.validation.isValid) {
              system = filterResult.filteredPrompt;
              safeFilterApplied = true;

              // Debug level 1: Basic info
              debug(
                1,
                `[Safe Filter] Applied tier ${filterResult.appliedTier} | ${filterResult.stats.originalTokens} → ${filterResult.stats.filteredTokens} tokens (${filterResult.stats.reductionPercent.toFixed(1)}% reduction)`
              );

              // Debug level 2: Validation and fallback details
              if (isVerboseDebugEnabled()) {
                debug(2, `[Safe Filter] Validation:`, {
                  isValid: filterResult.validation.isValid,
                  presentPatterns:
                    filterResult.validation.presentPatterns.length,
                  missingPatterns:
                    filterResult.validation.missingPatterns.length,
                  fallbackOccurred: filterResult.fallbackOccurred,
                });
              }

              // Debug level 3: Full details with prompt snippets
              if (isTraceDebugEnabled()) {
                debug(3, `[Safe Filter] Full result:`, {
                  appliedTier: filterResult.appliedTier,
                  preservedSections: filterResult.preservedSections,
                  removedSections: filterResult.removedSections,
                  stats: filterResult.stats,
                  validation: filterResult.validation,
                  promptSnippet:
                    filterResult.filteredPrompt.substring(0, 200) + "...",
                });
              }
            } else {
              // Validation failed - fall through to truncate
              debug(
                2,
                `[Safe Filter] Validation failed, falling back to truncate. Missing patterns:`,
                filterResult.validation.missingPatterns
              );
            }
          } catch (error) {
            // Filter error - fall through to truncate
            debug(
              2,
              `[Safe Filter] Error applying filter, falling back:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }

        // Priority 3: Simple truncation (fallback when safe filter fails or is disabled)
        // Preserves important sections (first 100 lines, marked sections) up to token limit
        // Falls back to passthrough if truncation disabled
        if (
          truncateSystemPrompt &&
          system &&
          !smartSystemPrompt &&
          !safeFilterApplied
        ) {
          const originalLength = system.length;
          // Rough estimate: 1 token ≈ 4 characters
          const maxChars = systemPromptMaxTokens * 4;

          if (originalLength > maxChars) {
            // Smart truncation: Extract complete sections, not just headers
            const lines = system.split("\n");
            const truncatedLines: string[] = [];
            let charCount = 0;

            // Critical sections to preserve WITH their content
            const importantSections = [
              "You are Claude Code",
              "# Tone and style",
              "# Tool usage policy",
              "# Doing tasks",
              "# Task Management",
              "# Asking questions",
              "# Code References",
              "IMPORTANT:",
              "VERY IMPORTANT:",
              "Usage notes:",
              "Usage:",
            ];

            let inImportantSection = false;
            let sectionStartIdx = -1;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]!;

              // Check if this line starts an important section
              const startsSection = importantSections.some((sec) =>
                line.includes(sec)
              );

              if (startsSection) {
                inImportantSection = true;
                sectionStartIdx = i;
              }

              // Check if we're exiting a section (new # header or blank line after content)
              const isNewSection =
                line.startsWith("#") && sectionStartIdx !== i;
              if (
                inImportantSection &&
                isNewSection &&
                i > sectionStartIdx + 5
              ) {
                inImportantSection = false;
              }

              // Always include first 100 lines OR important section content
              const shouldInclude = i < 100 || inImportantSection;

              if (shouldInclude && charCount + line.length < maxChars) {
                truncatedLines.push(line);
                charCount += line.length;
              }

              // Stop if we exceed max chars
              if (charCount >= maxChars) break;
            }

            system = truncatedLines.join("\n");
            system +=
              "\n\n[System prompt truncated to reduce cache pressure. Core instructions preserved.]";

            debug(
              1,
              `[System Prompt] Truncated from ${originalLength} to ${system.length} characters (~${Math.floor(originalLength / 4)} → ~${Math.floor(system.length / 4)} tokens)`
            );
          }
        }

        // Note: Previously attempted to normalize system prompt by removing newlines,
        // but this mangled the carefully structured Claude Code instructions.
        // MLX actually handles newlines fine in the system prompt.
        // Disabling this normalization to preserve system prompt structure.
        // if (system && providerName === "mlx") {
        //   system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        // }

        // Inject expanded tool skills based on context
        if (stubToolDescriptions && system) {
          const toolCtx = getToolContextManager();
          const lastToolCalls = extractLastToolCalls(body.messages);

          // Extract user message for keyword matching
          let userMsg = "";
          const lastMsg = body.messages[body.messages.length - 1];
          if (typeof lastMsg?.content === "string") {
            userMsg = lastMsg.content;
          } else if (Array.isArray(lastMsg?.content)) {
            for (const block of lastMsg.content) {
              if (block && "text" in block && block.text) {
                userMsg = block.text;
                break;
              }
            }
          }

          const skillContext = toolCtx.getSkillsToInject(
            lastToolCalls,
            userMsg
          );
          if (skillContext) {
            system = system + "\n\n" + skillContext;
            if (isDebugEnabled()) {
              debug(
                1,
                `[Tool Context] Injected skill context (${skillContext.length} chars)`
              );
            }
          }
        }

        // Warn about tool calling compatibility (local backend only, first request)
        if (
          mode === "local" &&
          body.tools &&
          body.tools.length > 0 &&
          isDebugEnabled()
        ) {
          debug(
            1,
            `[Tool Calling] Sending ${body.tools.length} tools to local backend. If you see unusual output (like <|channel|> syntax), your model may not support OpenAI function calling. Try models like Qwen2.5-Coder, DeepSeek-R1, or Llama-3.3.`
          );
        }

        // Log Claude Code's original tool schemas (TRACE level)
        if (isTraceDebugEnabled() && body.tools) {
          debug(3, `[Tools] Claude Code sent ${body.tools.length} tool(s):`);
          body.tools.forEach((tool, idx) => {
            debug(3, `[Tool ${idx + 1}/${body.tools!.length}] ${tool.name}`, {
              description: tool.description,
              input_schema: tool.input_schema,
            });
          });

          // Log OpenAI conversion for verification (using integrated tool-schema-converter)
          try {
            const openAITools = convertAnthropicToolsToOpenAI(
              body.tools as any
            );
            debug(3, `[Tools] OpenAI format conversion:`, {
              count: openAITools.length,
              sample: openAITools[0], // Show first tool as example
            });
          } catch (err) {
            debug(3, `[Tools] OpenAI conversion failed:`, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Handle Anthropic cache_control: Claude Code may not re-send tools if cached
        // If no tools provided but we have cached tools, restore them
        let toolsToUse = body.tools;
        if (!toolsToUse && cachedTools) {
          if (isDebugEnabled()) {
            debug(
              1,
              `[Cache Control] Restoring ${cachedTools.length} cached tools`
            );
          }
          toolsToUse = cachedTools;
        } else if (toolsToUse && toolsToUse.length > 0) {
          // Cache tools for future requests
          cachedTools = toolsToUse;
          if (isDebugEnabled()) {
            debug(
              1,
              `[Cache Control] Caching ${toolsToUse.length} tools for future requests`
            );
          }
        }

        // Adaptive Tool Context: capture skills and stub descriptions
        // This reduces tool description tokens from ~15K to ~2-4K
        if (stubToolDescriptions && toolsToUse && toolsToUse.length > 0) {
          const toolCtx = getToolContextManager();
          toolCtx.captureAndUpdateSkills(toolsToUse);
          toolsToUse = toolCtx.stubTools(toolsToUse);

          if (isDebugEnabled()) {
            debug(
              1,
              `[Tool Context] Stubbed ${toolsToUse.length} tool descriptions`
            );
          }
        }

        // Filter out server-side tools (like web_search_20250305) that local models can't handle
        // These tools are executed by Anthropic's servers, not by the model
        let hasWebSearchTool = false;
        const isLocalModel =
          mode === "local" || mode === "lmstudio" || mode === "mlx-cluster";
        if (toolsToUse && toolsToUse.length > 0) {
          const { regularTools, hasWebSearch } =
            filterServerSideTools(toolsToUse);
          hasWebSearchTool = hasWebSearch;
          // Only use regular tools for local models
          if (isLocalModel) {
            toolsToUse = regularTools;
            if (isDebugEnabled() && hasWebSearch) {
              debug(
                1,
                `[Server Tools] WebSearch enabled - will execute proactive search if needed`
              );
            }
          }
        }

        // Execute proactive web search for local models
        // This detects search intent and injects results into the system prompt
        // Note: We always check for search intent, not just when web_search tool is present
        // because Claude Code may not send that tool when using a non-Anthropic backend
        if (isLocalModel) {
          // Extract the actual user query from messages
          // Claude Code sends multiple user messages - the actual query may be in an earlier one
          // while the last user message often contains tool_results or system-reminders
          const userMessages = body.messages.filter(
            (m: any) => m.role === "user"
          );
          let userMsgForSearch = "";

          // Search through ALL user messages (reverse order - most recent first)
          // to find the actual user query (not tool_results or internal messages)
          for (
            let msgIdx = userMessages.length - 1;
            msgIdx >= 0 && !userMsgForSearch;
            msgIdx--
          ) {
            const userMessage = userMessages[msgIdx];

            if (typeof userMessage?.content === "string") {
              const text = (userMessage.content as string).trim();
              // Skip internal messages
              if (!isInternalMessage(text)) {
                userMsgForSearch = text;
                debug(
                  2,
                  `[WebSearch] Found user query in message ${msgIdx}: "${text.substring(0, 60)}..."`
                );
              }
            } else if (Array.isArray(userMessage?.content)) {
              // Check text blocks in this message
              for (const block of userMessage.content) {
                if (block && "text" in block && block.text) {
                  const text = block.text.trim();
                  if (!isInternalMessage(text) && text.length > 10) {
                    // Prefer longer text blocks (actual queries) over short internal labels
                    if (
                      !userMsgForSearch ||
                      text.length > userMsgForSearch.length
                    ) {
                      userMsgForSearch = text;
                      debug(
                        2,
                        `[WebSearch] Found user query in message ${msgIdx} block: "${text.substring(0, 60)}..."`
                      );
                    }
                  }
                }
              }
            }
          }

          if (userMsgForSearch) {
            debug(
              1,
              `[WebSearch] Checking intent for: "${userMsgForSearch.substring(0, 80)}..."`
            );
            try {
              const searchResult = await executeProactiveSearch(
                userMsgForSearch,
                true, // Always treat as having web search capability
                mode
              );

              if (searchResult && searchResult.contextAddition) {
                // Append search results to system prompt
                system = (system || "") + searchResult.contextAddition;
                // Mark that we executed proactive search - will strip WebSearch tool calls from response
                proactiveSearchExecuted = true;
                debug(
                  1,
                  `[WebSearch] Injected ${searchResult.results.length} search results for query: "${searchResult.query}"`
                );
              } else {
                debug(
                  1,
                  `[WebSearch] No search results returned (SEARXNG_URL=${process.env.SEARXNG_URL || "not set"})`
                );
              }
            } catch (searchError) {
              debug(1, `[WebSearch] Proactive search failed: ${searchError}`);
              debug(
                2,
                `[WebSearch] SEARXNG_URL=${process.env.SEARXNG_URL || "not set"}`
              );
              // Non-fatal: continue without search results
            }
          }
        }

        // Sort tools by name for deterministic cache keys
        // This ensures the same tools in different orders still produce cache hits
        const sortedTools = toolsToUse
          ? [...toolsToUse].sort((a, b) => a.name.localeCompare(b.name))
          : undefined;

        const tools = sortedTools?.reduce(
          (acc, tool) => {
            const originalSchema = tool.input_schema;
            const providerizedSchema = providerizeSchema(
              providerName,
              originalSchema
            );

            // Log schema transformation (TRACE level)
            if (isTraceDebugEnabled()) {
              const schemasMatch =
                JSON.stringify(originalSchema) ===
                JSON.stringify(providerizedSchema);
              if (!schemasMatch) {
                debug(3, `[Tool Schema Transform] ${tool.name}`, {
                  original: originalSchema,
                  providerized: providerizedSchema,
                });
              } else {
                debug(3, `[Tool Schema] ${tool.name} - No changes needed`);
              }
            }

            acc[tool.name] = {
              description: tool.description || tool.name,
              inputSchema: jsonSchema(providerizedSchema),
            };
            return acc;
          },
          {} as Record<string, Tool>
        );

        // Query active backend for model info on first request (await it!)
        if (!modelInfoQueried) {
          modelInfoQueried = true;

          // Determine which backend URL to query based on mode and config
          const backendUrlToQuery =
            backendUrl ||
            (() => {
              // Fallback: try to determine from provider name
              if (providerName === "local") {
                return (
                  process.env.LOCAL_URL ||
                  process.env.LMSTUDIO_URL ||
                  "http://localhost:8082"
                );
              } else if (providerName === "mlx") {
                return process.env.MLX_URL || "http://localhost:8081";
              }
              return "http://localhost:8082"; // Conservative default
            })();

          try {
            debug(
              1,
              `[Backend Query] Querying ${backendUrlToQuery} for model info...`
            );

            // Try to query using OpenAI-compatible /v1/models endpoint first
            const backendClient = new BackendClient(backendUrlToQuery);
            const modelInfo = await backendClient.getModelInfo();

            if (modelInfo) {
              cachedModelName = modelInfo.name;
              debug(1, `[Backend Query] Detected model: ${modelInfo.name}`);

              // MLX and most OpenAI-compatible servers don't return context in /v1/models
              // Try local backend-specific API if available (has context length)
              if (providerName === "local") {
                try {
                  const contextLength =
                    await getModelContextLength(backendUrlToQuery);
                  if (contextLength) {
                    cachedContextLength = contextLength;
                    debug(
                      1,
                      `[Backend Query] ${getBackendLogPrefix(mode)} context length: ${contextLength} tokens`
                    );
                  }
                } catch (localBackendError) {
                  debug(
                    1,
                    `[Backend Query] Local backend API not available, will use model table lookup`
                  );
                }
              }
            }
          } catch (error) {
            debug(
              1,
              `[Backend Query] Failed to query backend:`,
              error instanceof Error ? error.message : String(error)
            );
            debug(
              1,
              `[Backend Query] Will use configured model name and context table lookup`
            );
          }
        }

        // Check context window and truncate if needed
        // Priority: Claude Code's requested model (body.model) > detected model (cachedModelName) > config model
        const modelNameForContext = body.model || cachedModelName || model;
        const contextStats = calculateContextStats(
          body.messages,
          body.system,
          body.tools,
          modelNameForContext,
          cachedContextLength ?? undefined
        );

        // Log warning if approaching limit
        logContextWarning(contextStats, mode);

        // Truncate messages if exceeding limit
        let messagesToSend = body.messages;
        if (contextStats.exceedsLimit) {
          const result = truncateMessages(
            body.messages,
            body.system,
            body.tools,
            modelNameForContext,
            cachedContextLength ?? undefined
          );
          messagesToSend = result.messages;

          if (result.truncated) {
            const isCloudModel =
              (mode as string) === "claude" || mode === "openrouter";
            const limitationWarning = !isCloudModel
              ? `⚠️  IMPORTANT - LOCAL MODEL LIMITATION:\n` +
                `  Claude Sonnet 4.5 auto-compresses context while preserving\n` +
                `  key information. Local models cannot do this - old messages\n` +
                `  are simply discarded, which may affect response quality.\n` +
                `\n` +
                `RECOMMENDED: Start a new Claude Code conversation to avoid\n` +
                `           losing important context from earlier in the session.\n`
              : `⚠️  IMPORTANT:\n` +
                `  Older messages have been removed to fit within the model's context limit.\n` +
                `  Consider starting a new conversation to preserve full context.\n`;

            console.error(
              `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `⚠️  CONTEXT LIMIT EXCEEDED - MESSAGES TRUNCATED\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `\n` +
                `Removed ${result.removedCount} older messages to fit within model's context.\n` +
                `\n` +
                `  Before: ${body.messages.length} messages (${contextStats.totalTokens} tokens)\n` +
                `  After:  ${messagesToSend.length} messages\n` +
                `  Limit:  ${contextStats.contextLimit} tokens (80% of ${modelNameForContext})\n` +
                `\n` +
                limitationWarning +
                `\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
            );
          }
        }

        // Inject tool instructions if enabled (Issue #35)
        if (injectToolInstructions && body.tools && body.tools.length > 0) {
          const injectionConfig: InjectionConfig = {
            enabled: injectToolInstructions,
            style: toolInstructionStyle,
            confidenceThreshold: injectionThreshold,
            maxInjectionsPerConversation,
            enableFalsePositiveFilter: true,
          };

          debug(2, `[Tool Injection] Config:`, injectionConfig);

          messagesToSend = processMessages(
            messagesToSend,
            body.tools,
            injectionConfig
          );
        }

        // Convert truncated messages for LMStudio
        const coreMessages = convertFromAnthropicMessages(messagesToSend);

        // Track timing for debugging
        const requestStartTime = Date.now();

        debug(
          1,
          `[Request Start] ${providerName}/${model} at ${new Date(requestStartTime).toISOString()}`
        );

        // Calculate and log prompt overhead (system + tools vs user message)
        const systemSize = system ? system.length : 0;
        const toolsSize = tools ? JSON.stringify(tools).length : 0;
        const userMsgSize = coreMessages
          .filter((m: any) => m.role === "user")
          .map((m: any) =>
            typeof m.content === "string"
              ? m.content.length
              : JSON.stringify(m.content).length
          )
          .reduce((a: number, b: number) => a + b, 0);
        const totalSize = systemSize + toolsSize + userMsgSize;
        const overheadSize = systemSize + toolsSize;
        const overheadPercent =
          totalSize > 0 ? Math.round((overheadSize / totalSize) * 100) : 0;

        // Estimate tokens (rough: 1 token ≈ 4 chars)
        const systemTokens = Math.ceil(systemSize / 4);
        const toolsTokens = Math.ceil(toolsSize / 4);
        const overheadTokens = systemTokens + toolsTokens;

        if (isDebugEnabled()) {
          debug(1, `[Request Details] ${providerName}/${model}`, {
            system: system ? `${system.substring(0, 100)}...` : "none",
            toolCount: Object.keys(tools || {}).length,
            messageCount: coreMessages.length,
            maxTokens: body.max_tokens,
            temperature: body.temperature,
          });

          // Log overhead analysis
          debug(1, `[Prompt Overhead] ${providerName}/${model}`, {
            systemPrompt: `${(systemSize / 1024).toFixed(1)}KB (~${systemTokens.toLocaleString()} tokens)`,
            tools: `${(toolsSize / 1024).toFixed(1)}KB (~${toolsTokens.toLocaleString()} tokens, ${Object.keys(tools || {}).length} tools)`,
            userMessage: `${(userMsgSize / 1024).toFixed(1)}KB`,
            totalOverhead: `${(overheadSize / 1024).toFixed(1)}KB (~${overheadTokens.toLocaleString()} tokens)`,
            overheadPercent: `${overheadPercent}%`,
            estimatedProcessingTime:
              overheadTokens > 1000
                ? `~${(overheadTokens / 60).toFixed(1)}s @ 60 tok/s`
                : "<1s",
          });

          // Warn if overhead is very high
          if (overheadPercent > 90 && overheadTokens > 5000) {
            debug(
              1,
              `[Prompt Overhead] ⚠️  WARNING: ${overheadPercent}% overhead (${overheadTokens.toLocaleString()} tokens) may cause slow first response`
            );
          }
        }
        if (isVerboseDebugEnabled()) {
          debug(2, `[Full Request Body to Provider]`, {
            model,
            system,
            messages: coreMessages,
            tools: tools ? Object.keys(tools) : [],
            maxOutputTokens: body.max_tokens,
            temperature: body.temperature,
          });
        }

        let stream;
        try {
          // Log trace for local mode (before making request)
          if (isDebugEnabled()) {
            logTrace(mode, {
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: body,
            });
          }

          // Track request start time for cluster latency recording
          const requestStartTime = Date.now();

          // Create AbortController for timeout protection
          const abortController = new AbortController();
          const timeoutConfig = getTimeoutConfig();
          timeout = setTimeout(() => {
            debug(
              1,
              `[Timeout] Request to ${providerName}/${model} exceeded ${timeoutConfig.timeout}ms`
            );
            abortController.abort();
          }, timeoutConfig.timeout); // Configurable timeout for request completion

          try {
            // Use .chat() for OpenAI providers (local, mlx, openrouter) and .languageModel() for Anthropic
            const languageModel =
              providerName === "local" ||
              providerName === "mlx" ||
              providerName === "openrouter"
                ? (provider as any).chat(model)
                : provider.languageModel(model);

            // No tool parser needed - OpenAI-compatible providers (mlx, local, openrouter) handle tool calling natively

            debug(
              1,
              `[streamText] About to call streamText for ${providerName}/${model}`
            );
            stream = await streamText({
              model: languageModel,
              system,
              tools,
              messages: coreMessages,
              maxOutputTokens: body.max_tokens,
              temperature: body.temperature,
              abortSignal: abortController.signal,

              onFinish: ({ response, usage, finishReason }) => {
                debug(
                  1,
                  `[streamText onFinish] Called, stop reason: ${finishReason}`
                );
                // Clear timeout on successful completion
                if (timeout) clearTimeout(timeout);

                // Record success for cluster routing
                if (mode === "mlx-cluster" && selectedNode) {
                  const latencyMs = Date.now() - requestStartTime;
                  getClusterManager().recordNodeSuccess(
                    selectedNode.id,
                    latencyMs
                  );
                  debug(
                    2,
                    `[Cluster Routing] Recorded success for node ${selectedNode.id} (${latencyMs}ms)`
                  );
                }

                // Record latency for circuit breaker monitoring
                const completionLatencyMs = Date.now() - requestStartTime;
                proxyCircuitBreaker.recordLatency(completionLatencyMs);
                debug(
                  2,
                  `[Circuit Breaker] Recorded latency: ${completionLatencyMs}ms`
                );

                // If the body is already being streamed,
                // we don't need to do any conversion here.
                if (body.stream) {
                  return;
                }

                // There should only be one message.
                const message = response.messages[0];
                if (!message) {
                  throw new Error("No message found");
                }

                const prompt = convertToAnthropicMessagesPrompt({
                  prompt: [convertToLanguageModelMessage(message, {})],
                  sendReasoning: true,
                  warnings: [],
                });
                const promptMessage = prompt.prompt.messages[0];
                if (!promptMessage) {
                  throw new Error("No prompt message found");
                }

                let contentToSend: typeof promptMessage.content =
                  promptMessage.content;
                let finalFinishReason = mapAnthropicStopReason(finishReason);

                res.writeHead(200, { "Content-Type": "application/json" }).end(
                  JSON.stringify({
                    id: "msg_" + Date.now(),
                    type: "message",
                    role: promptMessage.role,
                    content: contentToSend,
                    model: body.model,
                    stop_reason: finalFinishReason,
                    stop_sequence: null,
                    usage: {
                      input_tokens: usage.inputTokens,
                      output_tokens: usage.outputTokens,
                      cache_creation_input_tokens: 0,
                      cache_read_input_tokens: 0,
                    },
                  })
                );
              },
              onError: ({ error }) => {
                // Clear timeout on error
                if (timeout) clearTimeout(timeout);
                debug(1, `Error for ${providerName}/${model}:`, error);

                // Record failure for cluster routing
                if (mode === "mlx-cluster" && selectedNode) {
                  const err =
                    error instanceof Error ? error : new Error(String(error));
                  getClusterManager().recordNodeFailure(selectedNode.id, err);
                  debug(
                    2,
                    `[Cluster Routing] Recorded failure for node ${selectedNode.id}`
                  );
                }

                // Write comprehensive debug info to temp file
                const debugFile = writeDebugToTempFile(
                  400,
                  {
                    method: "POST",
                    url: req.url,
                    headers: req.headers,
                    body: body,
                  },
                  {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider: providerName,
                      model: model,
                      error:
                        error instanceof Error
                          ? {
                              message: error.message,
                              stack: error.stack,
                              name: error.name,
                            }
                          : error,
                    }),
                  }
                );

                if (debugFile) {
                  logDebugError("Provider", 400, debugFile, {
                    provider: providerName,
                    model,
                  });
                }

                // Only write error response if headers haven't been sent yet
                // (headers are already sent during streaming)
                if (!res.headersSent) {
                  res
                    .writeHead(400, {
                      "Content-Type": "application/json",
                    })
                    .end(
                      JSON.stringify({
                        type: "error",
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      })
                    );
                } else {
                  // Headers already sent (streaming), just end the response
                  debug(1, `[Proxy] Error during stream, ending response`);
                  res.end();
                }
              },
            });
          } catch (innerError) {
            // Clear timeout on inner error
            if (timeout) clearTimeout(timeout);
            throw innerError; // Re-throw to outer catch
          }
        } catch (error) {
          debug(1, `Connection error for ${providerName}/${model}:`, error);

          // Record failure for cluster routing
          if (mode === "mlx-cluster" && selectedNode) {
            const err =
              error instanceof Error ? error : new Error(String(error));
            getClusterManager().recordNodeFailure(selectedNode.id, err);
            debug(
              2,
              `[Cluster Routing] Recorded failure for node ${selectedNode.id}`
            );
          }

          // Return a 503 Service Unavailable
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              type: "error",
              error: {
                type: "overloaded_error",
                message: `Connection failed to ${providerName}. The service may be temporarily unavailable.`,
              },
            })
          );
          return;
        }

        if (!body.stream) {
          try {
            await stream.consumeStream();
          } catch (error) {
            debug(
              1,
              `Error consuming stream for ${providerName}/${model}:`,
              error
            );
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                type: "error",
                error: {
                  type: "overloaded_error",
                  message: `Failed to process response from ${providerName}.`,
                },
              })
            );
          }
          return;
        }

        res.on("error", () => {
          // In NodeJS, this needs to be handled.
        });

        // CRITICAL: Handle client disconnect early to prevent resource leaks
        // When client closes connection, we need to clean up resources immediately
        let isClosing = false;

        res.on("close", () => {
          debug(1, `[Client Disconnect] Connection closed by client`);
          if (isClosing) return; // Guard against double cleanup
          isClosing = true;

          // Clear keepalive interval if still running
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
            debug(2, `[Cleanup] Cleared keepalive interval on client close`);
          }

          // Clear request timeout if still pending
          if (timeout) {
            clearTimeout(timeout);
            debug(2, `[Cleanup] Cleared request timeout on client close`);
          }
        });

        // Set proper SSE headers for streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // Disable proxy buffering that causes truncation
          "Transfer-Encoding": "chunked", // Use chunked encoding for SSE
        });

        // Send immediate message_start event to prevent client timeout
        // LMStudio can take 30-60s to process large prompts before generating tokens
        // Claude Code will disconnect if it doesn't receive events within ~30s
        const messageId = "msg_" + Date.now();
        res.write(`event: message_start\n`);
        res.write(
          `data: ${JSON.stringify({
            type: "message_start",
            message: {
              id: messageId,
              type: "message",
              role: "assistant",
              content: [],
              model: body.model,
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            },
          })}\n\n`
        );

        // Start keepalive interval to prevent Claude Code timeout during slow prompt processing
        // Some models (glm-4.5-air-mlx, Qwen3-30B) can take 60+ seconds to process prompts
        // Send SSE comment every 10 seconds to keep connection alive
        let keepaliveCount = 0;
        const keepaliveInterval = setInterval(() => {
          if (!res.writableEnded) {
            keepaliveCount++;
            res.write(`: keepalive ${keepaliveCount}\n\n`);
            debug(
              2,
              `[Keepalive] Sent keepalive #${keepaliveCount} (waiting for ${getBackendLogPrefix(mode)})`
            );
          }
        }, 10000); // 10 second interval

        try {
          debug(
            1,
            `[Streaming] Starting stream conversion and pipe for ${providerName}/${model}`
          );

          // FIX #4: Proper Backpressure Propagation
          // Use Node.js pipe() instead of Web Streams API pipeTo() for proper backpressure.
          // This ensures backpressure propagates ALL the way back to the source stream,
          // preventing buffer overflow in the Transform stream.
          //
          // Flow:
          // AI SDK Stream --[respects backpressure]-->
          // convertToAnthropicStream Transform --[respects backpressure]-->
          // Writable to res.write() --[writes with backpressure handling]-->
          // HTTP Response
          const convertedStream = convertToAnthropicStream(stream.fullStream, {
            skipFirstMessageStart: true,
            // For local models, always strip WebSearch tool calls since:
            // 1. We execute proactive search and inject results into system prompt
            // 2. Local models can't actually execute server-side tools
            // 3. If the call reaches Claude Code, it may fail with "0 searches"
            stripWebSearchCalls: isLocalModel,
          });

          let totalChunksWritten = 0;
          let totalBytesWritten = 0;
          let finalUsageData: any = null;
          let firstTokenTime: number | null = null;
          let lastTokenTime: number | null = null;

          // Convert Web Streams to Node.js streams for proper backpressure handling
          // Readable.fromWeb() converts the readable side
          // CRITICAL: Must use objectMode because convertedStream carries AnthropicStreamChunk objects, not strings/buffers
          const { Readable, Writable } = require("stream");
          const nodeReadable = Readable.fromWeb(convertedStream, {
            objectMode: true,
          });

          // Create a writable that handles backpressure to res
          const nodeWritable = new Writable({
            objectMode: true, // CRITICAL: Handle AnthropicStreamChunk objects, not strings/buffers
            highWaterMark: 16 * 1024, // 16KB default buffer
            write(
              chunk: AnthropicStreamChunk,
              encoding: string,
              callback: (error?: Error | null) => void
            ) {
              totalChunksWritten++;
              const data = `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`;
              totalBytesWritten += data.length;

              // Capture usage data from message_delta events for cache metrics
              if (chunk.type === "message_delta" && chunk.usage) {
                finalUsageData = chunk.usage;
                debug(
                  2,
                  `[Cache Metrics] Captured usage from message_delta:`,
                  finalUsageData
                );
              }

              debug(
                2,
                `[NodeWritable] Chunk #${totalChunksWritten} of type: ${chunk.type} (${data.length} bytes, total: ${totalBytesWritten} bytes)`
              );

              // Track first token time (when we get first content)
              if (
                !firstTokenTime &&
                (chunk.type === "content_block_delta" ||
                  chunk.type === "content_block_start")
              ) {
                firstTokenTime = Date.now();
                debug(
                  2,
                  `[Timing] First token received at ${Date.now() - requestStartTime}ms`
                );
              }

              // Track last token time
              if (
                chunk.type === "content_block_delta" ||
                chunk.type === "content_block_stop"
              ) {
                lastTokenTime = Date.now();
              }

              // Clear keepalive on first chunk (stream has started)
              if (keepaliveInterval) {
                clearInterval(keepaliveInterval);
                debug(
                  2,
                  `[Keepalive] Cleared (stream started after ${keepaliveCount} keepalives)`
                );
              }

              if (isVerboseDebugEnabled()) {
                debug(2, `[Stream Chunk]`, chunk);
              }

              // Log tool_use events at trace level
              if (
                isTraceDebugEnabled() &&
                chunk.type === "content_block_start" &&
                (chunk as any).content_block?.type === "tool_use"
              ) {
                debug(3, `[SSE → Claude Code] Writing tool_use event:`, {
                  event: chunk.type,
                  index: (chunk as any).index,
                  tool_name: (chunk as any).content_block.name,
                  tool_id: (chunk as any).content_block.id,
                  input: (chunk as any).content_block.input,
                });
              }

              // CRITICAL FIX #4: Handle backpressure properly
              // res.write() returns false when internal buffer is full
              // When this happens, we must signal backpressure back by not calling callback
              // until the drain event fires. This prevents the node stream from buffering
              // more data, which propagates backpressure to the Transform, which propagates
              // it to the source (AI SDK stream).
              const canContinue = res.write(data);

              debug(
                2,
                `[NodeWritable] Written chunk type: ${chunk.type}, buffer ok: ${canContinue}`
              );

              if (!canContinue) {
                debug(
                  2,
                  `[Backpressure] res buffer full, waiting for drain event before continuing`
                );
                // Don't call callback yet - this signals backpressure up the pipe
                // Once res drains, we'll call callback to resume
                let drainTimeout: NodeJS.Timeout | null = null;
                let cleaned = false;

                const cleanup = () => {
                  if (cleaned) return;
                  cleaned = true;
                  if (drainTimeout) clearTimeout(drainTimeout);
                  res.removeListener("drain", onDrain);
                  res.removeListener("error", onError);
                  res.removeListener("close", onClose);
                };

                const onDrain = () => {
                  debug(
                    2,
                    `[Backpressure] res drain event received, resuming writes`
                  );
                  cleanup();
                  callback(); // Resume writing
                };

                const onError = (err: Error) => {
                  debug(
                    1,
                    `[Backpressure] Error while waiting for drain:`,
                    err
                  );
                  cleanup();
                  callback(err);
                };

                const onClose = () => {
                  debug(
                    1,
                    `[Backpressure] Response closed while waiting for drain`
                  );
                  cleanup();
                  callback(new Error("Response closed"));
                };

                // Set a timeout to prevent hanging forever if drain never comes
                drainTimeout = setTimeout(() => {
                  debug(
                    1,
                    `[Backpressure] Timeout waiting for drain (5s) - response may be stuck`
                  );
                  cleanup();
                  callback(new Error("Drain timeout after 5 seconds"));
                }, 5000);

                res.once("drain", onDrain);
                res.once("error", onError);
                res.once("close", onClose);
              } else {
                // No backpressure, continue immediately
                callback();
              }
            },
          });

          // Pipe the converted stream through to res
          // Node.js pipe() automatically handles backpressure propagation
          nodeReadable.pipe(nodeWritable);

          // Handle stream errors
          nodeReadable.on("error", (error: any) => {
            debug(1, `[Stream Error] Source stream error:`, error);

            // Clear keepalive on error
            if (keepaliveInterval) {
              clearInterval(keepaliveInterval);
            }

            if (!res.headersSent) {
              // Haven't started streaming yet - send error as JSON
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  type: "error",
                  error: {
                    type: "stream_error",
                    message: "Stream processing error",
                  },
                })
              );
            } else {
              // Already streaming - send error as SSE event and close stream properly
              const errorMessage =
                error?.message || "Backend server connection lost";
              debug(
                1,
                `[Stream Error] ⚠️  Sending error event to Claude Code: ${errorMessage}`
              );

              try {
                // Send error event
                res.write(
                  `event: error\ndata: ${JSON.stringify({
                    type: "error",
                    error: {
                      type: "overloaded_error",
                      message: errorMessage,
                    },
                  })}\n\n`
                );
                // Send message_stop to properly close the stream
                res.write(
                  `event: message_stop\ndata: ${JSON.stringify({
                    type: "message_stop",
                  })}\n\n`
                );
                res.end();
              } catch (writeError) {
                debug(
                  1,
                  `[Stream Error] Failed to write error event:`,
                  writeError
                );
                nodeWritable.destroy(error);
              }
            }
          });

          nodeWritable.on("error", (error: any) => {
            debug(1, `[Write Error] Writable stream error:`, error);

            // Clear keepalive on error
            if (keepaliveInterval) {
              clearInterval(keepaliveInterval);
            }

            if (!res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  type: "error",
                  error: {
                    type: "write_error",
                    message: "Write error",
                  },
                })
              );
            } else {
              // Already streaming - try to send error event
              debug(1, `[Write Error] ⚠️  Sending error event to Claude Code`);
              try {
                // Send error event
                res.write(
                  `event: error\ndata: ${JSON.stringify({
                    type: "error",
                    error: {
                      type: "overloaded_error",
                      message: "Failed to write response data",
                    },
                  })}\n\n`
                );
                // Send message_stop to properly close the stream
                res.write(
                  `event: message_stop\ndata: ${JSON.stringify({
                    type: "message_stop",
                  })}\n\n`
                );
                res.end();
              } catch (writeError) {
                debug(
                  1,
                  `[Write Error] Failed to write error event:`,
                  writeError
                );
              }
            }
          });

          // Handle pipe completion
          nodeWritable.on("finish", () => {
            // Clear keepalive on completion
            if (keepaliveInterval) {
              clearInterval(keepaliveInterval);
            }
            const totalDuration = Date.now() - requestStartTime;

            // Record latency for circuit breaker monitoring
            proxyCircuitBreaker.recordLatency(totalDuration);
            debug(
              2,
              `[Circuit Breaker] Recorded streaming latency: ${totalDuration}ms`
            );

            // Calculate tok/s if we have timing data
            let tokensPerSecond: number | null = null;
            if (
              firstTokenTime &&
              lastTokenTime &&
              finalUsageData?.output_tokens
            ) {
              const generationDuration =
                (lastTokenTime - firstTokenTime) / 1000; // Convert to seconds
              if (generationDuration > 0) {
                tokensPerSecond =
                  finalUsageData.output_tokens / generationDuration;
              }
            }

            debug(
              1,
              `[Request Complete] ${providerName}/${model}: ${totalDuration}ms (${totalChunksWritten} chunks, ${totalBytesWritten} bytes)` +
                (tokensPerSecond
                  ? ` | ⚡ ${tokensPerSecond.toFixed(1)} tok/s`
                  : "")
            );

            // Record success for cluster routing (streaming requests)
            if (mode === "mlx-cluster" && selectedNode) {
              const latencyMs = totalDuration;
              getClusterManager().recordNodeSuccess(selectedNode.id, latencyMs);
              debug(
                2,
                `[Cluster Routing] Recorded streaming success for node ${selectedNode.id} (${latencyMs}ms)`
              );
            }

            // Record cache metrics for streaming responses
            if (finalUsageData && body) {
              try {
                let inputTokens = finalUsageData.input_tokens || 0;
                let outputTokens = finalUsageData.output_tokens || 0;
                const cacheReadTokens =
                  finalUsageData.cache_read_input_tokens || 0;
                const cacheCreationTokens =
                  finalUsageData.cache_creation_input_tokens || 0;

                // If MLX didn't provide usage data, estimate it
                if (inputTokens === 0 && body) {
                  // Estimate input tokens from request body
                  let estimatedInput = 0;
                  const bodyAny = body as any;
                  if (typeof bodyAny.system === "string") {
                    estimatedInput += Math.floor(bodyAny.system.length / 4);
                  } else if (Array.isArray(bodyAny.system)) {
                    estimatedInput += Math.floor(
                      JSON.stringify(bodyAny.system).length / 4
                    );
                  }
                  if (bodyAny.messages) {
                    for (const msg of bodyAny.messages) {
                      if (typeof msg.content === "string") {
                        estimatedInput += Math.floor(msg.content.length / 4);
                      }
                    }
                  }
                  if (bodyAny.tools) {
                    estimatedInput += Math.floor(
                      JSON.stringify(bodyAny.tools).length / 4
                    );
                  }
                  inputTokens = estimatedInput;
                  debug(
                    1,
                    `[Token Estimation] Estimated ${inputTokens} input tokens (MLX didn't provide usage)`
                  );
                }

                // Calculate hash from system prompt and tools for per-prompt tracking
                let systemPrompt = "";
                if (typeof body.system === "string") {
                  systemPrompt = body.system;
                } else if (Array.isArray(body.system)) {
                  systemPrompt = JSON.stringify(body.system);
                }
                const systemPromptLength = systemPrompt.length;
                const toolCount = body.tools ? body.tools.length : 0;
                // Hash the full system prompt + tools to ensure identical prompts get same hash
                const hashInput = JSON.stringify({
                  system: systemPrompt,
                  tools: body.tools || [],
                });
                const hash = createHash("sha256")
                  .update(hashInput)
                  .digest("hex");

                const monitor = getCacheMonitor();

                // In streaming mode, we're always using MLX or LMStudio
                // Infer cache hits from repeated request hashes
                const currentEntry = monitor.getMetrics().entries.get(hash);

                if (currentEntry && currentEntry.misses > 0) {
                  // We've seen this hash before - backend likely cached it
                  // Estimate cache read tokens: assume system prompt + tools were cached (~70% of input)
                  const estimatedCacheReadTokens = Math.floor(
                    inputTokens * 0.7
                  );
                  monitor.recordHit(
                    hash,
                    inputTokens,
                    estimatedCacheReadTokens
                  );
                } else {
                  // First time seeing this hash
                  // Estimate cache creation tokens: system prompt + tools created cache (~70% of input)
                  const estimatedCacheCreationTokens = Math.floor(
                    inputTokens * 0.7
                  );
                  monitor.recordMiss(
                    hash,
                    inputTokens,
                    estimatedCacheCreationTokens,
                    systemPromptLength,
                    toolCount
                  );
                }

                debug(
                  1,
                  `[Cache Metrics] Recorded streaming response metrics`,
                  {
                    hash: hash.substring(0, 8),
                    inputTokens,
                    outputTokens,
                    cacheReadTokens,
                    cacheCreationTokens,
                  }
                );
              } catch (error) {
                debug(
                  1,
                  "[Cache Metrics] Failed to record streaming metrics:",
                  error
                );
              }
            } else if (!finalUsageData) {
              debug(
                1,
                `[Cache Metrics] No usage data captured (stream may have failed)`
              );
            }

            // FIX #1: Enhanced Stream Draining
            // Ensure all buffered data is written before closing the response.
            // This prevents truncation when backpressure causes data to buffer.
            const drainAndClose = () => {
              if (!res.writableEnded) {
                debug(2, `[Stream] Ending response stream after flush`);
                res.end();
              }
            };

            // Check if there's buffered data waiting to be written
            if (res.writableLength > 0) {
              debug(
                2,
                `[Backpressure] ${res.writableLength} bytes buffered, waiting for drain`
              );

              // Wait for drain event (buffer ready for more data) before closing
              res.once("drain", () => {
                debug(2, `[Backpressure] Drain event fired, closing stream`);
                setImmediate(drainAndClose);
              });

              // Safety timeout: if drain event never fires, force close after 5 seconds
              const drainTimeout = setTimeout(() => {
                if (!res.writableEnded) {
                  debug(
                    1,
                    `[Backpressure] Drain timeout (5s), force closing stream`
                  );
                  drainAndClose();
                }
              }, 5000);

              // If stream ends normally, clear the timeout
              res.once("finish", () => {
                clearTimeout(drainTimeout);
              });
            } else {
              // No buffered data, safe to close immediately with setImmediate delay
              setImmediate(drainAndClose);
            }
          });
        } catch (error) {
          // Clear keepalive on error
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
          }
          debug(
            1,
            `Error in stream processing for ${providerName}/${model}:`,
            error
          );

          // Record failure for cluster routing
          if (mode === "mlx-cluster" && selectedNode) {
            const err =
              error instanceof Error ? error : new Error(String(error));
            getClusterManager().recordNodeFailure(selectedNode.id, err);
            debug(
              2,
              `[Cluster Routing] Recorded streaming failure for node ${selectedNode.id}`
            );
          }

          // If we haven't started writing the response yet, send a proper error
          if (!res.headersSent) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                type: "error",
                error: {
                  type: "overloaded_error",
                  message: `Stream processing failed for ${providerName}.`,
                },
              })
            );
          } else {
            // If we've already started streaming, send an error event
            res.write(
              `event: error\ndata: ${JSON.stringify({
                type: "error",
                error: {
                  type: "overloaded_error",
                  message: `Stream interrupted.`,
                },
              })}\n\n`
            );
            res.end();
          }
        }
      })().catch((err) => {
        res.writeHead(500, {
          "Content-Type": "application/json",
        });
        res.end(
          JSON.stringify({
            error: "Internal server error: " + err.message,
          })
        );
      });
    })
    .listen(port ?? 0);

  // Display cache stats on exit
  process.on("exit", () => {
    const cacheStats = getCacheStats();
    if (cacheStats.size > 0 && isDebugEnabled()) {
      debug(1, `[Prompt Cache] Final stats: ${cacheStats.size} cached prompts`);
      if (isVerboseDebugEnabled()) {
        debug(2, `[Prompt Cache] Cached entries:`, cacheStats.entries);
      }
    }

    // Display cache monitoring dashboard
    const monitor = getCacheMonitor();
    monitor.save();
    monitor.displayReport();
  });

  const address = proxy.address();
  if (!address) {
    throw new Error("Failed to get proxy address");
  }
  if (typeof address === "string") {
    return address;
  }
  return `http://localhost:${address.port}`;
};

// Export helper functions for testing
export {
  shouldUseSafeFilter,
  getOptimizationStrategy,
  applySafeSystemFilter,
  selectOptimizationTier,
  optimizeSystemPrompt,
};
