import type { ProviderV2 } from "@ai-sdk/provider";
import { jsonSchema, streamText, type Tool } from "ai";
import * as http from "http";
import * as https from "https";
import type { AnthropicMessagesRequest } from "./anthropic-api-types";
import { mapAnthropicStopReason } from "./anthropic-api-types";
import {
  convertFromAnthropicMessages,
  convertToAnthropicMessagesPrompt,
} from "./convert-anthropic-messages";
import { convertToAnthropicStream } from "./convert-to-anthropic-stream";
import { convertToLanguageModelMessage } from "./convert-to-language-model-prompt";
import { providerizeSchema } from "./json-schema";
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
import { logTrace, type AnyclaudeMode } from "./trace-logger";
import {
  initializeCacheTracking,
  getCacheTracker,
  displayCacheMetricsOnExit,
} from "./cache-metrics";
import { getCachedPrompt, getCacheStats } from "./prompt-cache";
import { getCacheMonitor } from "./cache-monitor-dashboard";
import { getTimeoutConfig } from "./timeout-config";
import { createHash } from "crypto";

export type CreateAnthropicProxyOptions = {
  providers: Record<string, ProviderV2>;
  port?: number;
  defaultProvider: string;
  defaultModel: string;
  mode: AnyclaudeMode;
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
}: CreateAnthropicProxyOptions): string => {
  // Log debug status on startup
  displayDebugStartup();

  // Initialize cache metrics tracking
  initializeCacheTracking();
  displayCacheMetricsOnExit();

  // Cache for LMStudio context length (queried on first request)
  let cachedContextLength: number | null = null;
  let contextLengthQueried = false;

  // Request ID counter for tracking
  let requestCounter = 0;

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

                  // Record cache metrics for monitoring (Claude and vLLM-MLX)
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
                      // vLLM-MLX: infer cache hits from repeated request hashes
                      // Track this request for pattern detection
                      const currentEntry = monitor
                        .getMetrics()
                        .entries.get(hash);

                      if (currentEntry && currentEntry.misses > 0) {
                        // We've seen this hash before - vLLM-MLX likely cached it
                        monitor.recordHit(hash, inputTokens, 0);
                      } else {
                        // First time seeing this hash
                        monitor.recordMiss(
                          hash,
                          inputTokens,
                          0,
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
        const providerName = defaultProvider;
        const model = defaultModel;

        const provider = providers[providerName];
        if (!provider) {
          throw new Error(`Provider not configured: ${providerName}`);
        }

        // Check prompt cache to avoid re-sending 9000 tokens every request
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

        // Normalize system prompt for vLLM-MLX strict JSON validation
        // vLLM-MLX rejects newlines/excess whitespace in system prompt
        if (system && providerName === "vllm-mlx") {
          system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
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
        }

        // Sort tools by name for deterministic cache keys
        // This ensures the same tools in different orders still produce cache hits
        const sortedTools = body.tools
          ? [...body.tools].sort((a, b) => a.name.localeCompare(b.name))
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

        // Query LMStudio for context length on first request (await it!)
        if (!contextLengthQueried) {
          contextLengthQueried = true;
          const lmstudioUrl =
            process.env.LMSTUDIO_URL || "http://localhost:1234/v1";
          try {
            const contextLength = await getModelContextLength(lmstudioUrl);
            if (contextLength) {
              cachedContextLength = contextLength;
              debug(
                1,
                `[Context] Cached LMStudio context length: ${contextLength} tokens`
              );
            }
          } catch (error) {
            debug(
              1,
              `[Context] Failed to query LMStudio context length:`,
              error
            );
          }
        }

        // Check context window and truncate if needed
        const contextStats = calculateContextStats(
          body.messages,
          body.system,
          body.tools,
          model,
          cachedContextLength ?? undefined
        );

        // Log warning if approaching limit
        logContextWarning(contextStats);

        // Truncate messages if exceeding limit
        let messagesToSend = body.messages;
        if (contextStats.exceedsLimit) {
          const result = truncateMessages(
            body.messages,
            body.system,
            body.tools,
            model,
            cachedContextLength ?? undefined
          );
          messagesToSend = result.messages;

          if (result.truncated) {
            console.error(
              `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `⚠️  CONTEXT LIMIT EXCEEDED - MESSAGES TRUNCATED\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `\n` +
                `Removed ${result.removedCount} older messages to fit within model's context.\n` +
                `\n` +
                `  Before: ${body.messages.length} messages (${contextStats.totalTokens} tokens)\n` +
                `  After:  ${messagesToSend.length} messages\n` +
                `  Limit:  ${contextStats.contextLimit} tokens (80% of ${model})\n` +
                `\n` +
                `⚠️  IMPORTANT - LOCAL MODEL LIMITATION:\n` +
                `  Claude Sonnet 4.5 auto-compresses context while preserving\n` +
                `  key information. Local models cannot do this - old messages\n` +
                `  are simply discarded, which may affect response quality.\n` +
                `\n` +
                `RECOMMENDED: Start a new Claude Code conversation to avoid\n` +
                `           losing important context from earlier in the session.\n` +
                `\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
            );
          }
        }

        // Convert truncated messages for LMStudio
        const coreMessages = convertFromAnthropicMessages(messagesToSend);

        // Track timing for debugging
        const requestStartTime = Date.now();

        debug(
          1,
          `[Request Start] ${providerName}/${model} at ${new Date(requestStartTime).toISOString()}`
        );
        if (isDebugEnabled()) {
          debug(1, `[Request Details] ${providerName}/${model}`, {
            system: system ? `${system.substring(0, 100)}...` : "none",
            toolCount: Object.keys(tools || {}).length,
            messageCount: coreMessages.length,
            maxTokens: body.max_tokens,
            temperature: body.temperature,
          });
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
          // Log trace for lmstudio mode (before making request)
          if (isDebugEnabled()) {
            logTrace(mode, {
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: body,
            });
          }

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
            // Use .chat() for OpenAI providers (lmstudio, vllm-mlx) and .languageModel() for Anthropic
            const languageModel =
              providerName === "lmstudio" || providerName === "vllm-mlx"
                ? (provider as any).chat(model)
                : provider.languageModel(model);

            // No tool parser needed - vllm-mlx and lmstudio handle tool calling natively

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

                res
                  .writeHead(400, {
                    "Content-Type": "application/json",
                  })
                  .end(
                    JSON.stringify({
                      type: "error",
                      error:
                        error instanceof Error ? error.message : String(error),
                    })
                  );
              },
            });
          } catch (innerError) {
            // Clear timeout on inner error
            if (timeout) clearTimeout(timeout);
            throw innerError; // Re-throw to outer catch
          }
        } catch (error) {
          debug(1, `Connection error for ${providerName}/${model}:`, error);

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
              `[Keepalive] Sent keepalive #${keepaliveCount} (waiting for LMStudio)`
            );
          }
        }, 10000); // 10 second interval

        try {
          debug(
            1,
            `[Streaming] Starting stream conversion and pipe for ${providerName}/${model}`
          );

          // CRITICAL: Create a WritableStream that properly handles backpressure
          // This prevents truncation when res.write() returns false (buffer full)
          const convertedStream = convertToAnthropicStream(
            stream.fullStream,
            true
          );

          let totalChunksWritten = 0;
          let totalBytesWritten = 0;
          let finalUsageData: any = null;

          await convertedStream.pipeTo(
            new WritableStream({
              write(chunk) {
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
                  `[WritableStream] Chunk #${totalChunksWritten} of type: ${chunk.type} (${data.length} bytes, total: ${totalBytesWritten} bytes)`
                );
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

                // CRITICAL FIX: Handle backpressure properly
                // res.write() returns false when internal buffer is full
                // In this case, return a Promise that resolves when 'drain' is emitted
                const canContinue = res.write(data);

                debug(
                  2,
                  `[WritableStream] Written chunk type: ${chunk.type}, buffer ok: ${canContinue}`
                );

                if (!canContinue) {
                  debug(
                    2,
                    `[Backpressure] Buffer full, waiting for drain event`
                  );
                  // Return a Promise that resolves when the response is ready for more data
                  return new Promise<void>((resolve, reject) => {
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
                        `[Backpressure] Drain event received, resuming writes`
                      );
                      cleanup();
                      resolve();
                    };

                    const onError = (err: Error) => {
                      debug(
                        1,
                        `[Backpressure] Error while waiting for drain:`,
                        err
                      );
                      cleanup();
                      reject(err);
                    };

                    const onClose = () => {
                      debug(
                        1,
                        `[Backpressure] Response closed while waiting for drain`
                      );
                      cleanup();
                      reject(new Error("Response closed"));
                    };

                    // Set a timeout to prevent hanging forever if drain never comes
                    // This can happen if the client disconnects or the response gets stuck
                    drainTimeout = setTimeout(() => {
                      debug(
                        1,
                        `[Backpressure] Timeout waiting for drain (5s) - response may be stuck`
                      );
                      cleanup();
                      reject(new Error("Drain event timeout after 5 seconds"));
                    }, 5000);

                    res.once("drain", onDrain);
                    res.once("error", onError);
                    res.once("close", onClose);
                  });
                }

                // Return a resolved promise if no backpressure (for proper typing)
                return Promise.resolve();
              },
              close() {
                // CRITICAL: Delay calling res.end() until after all data has been flushed
                // The WritableStream is closing, which means all chunks have been queued for writing
                // but may not have been fully sent to the client yet. Calling res.end() immediately
                // can truncate the response if there's still buffered data.

                // Clear keepalive on completion
                if (keepaliveInterval) {
                  clearInterval(keepaliveInterval);
                }
                const totalDuration = Date.now() - requestStartTime;
                debug(
                  1,
                  `[Request Complete] ${providerName}/${model}: ${totalDuration}ms (${totalChunksWritten} chunks, ${totalBytesWritten} bytes)`
                );

                // Record cache metrics for streaming responses
                if (finalUsageData && body) {
                  try {
                    const inputTokens = finalUsageData.input_tokens || 0;
                    const outputTokens = finalUsageData.output_tokens || 0;
                    const cacheReadTokens =
                      finalUsageData.cache_read_input_tokens || 0;
                    const cacheCreationTokens =
                      finalUsageData.cache_creation_input_tokens || 0;

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

                    // In streaming mode, we're always using vLLM-MLX or LMStudio
                    // Infer cache hits from repeated request hashes
                    const currentEntry = monitor.getMetrics().entries.get(hash);

                    if (currentEntry && currentEntry.misses > 0) {
                      // We've seen this hash before - backend likely cached it
                      monitor.recordHit(hash, inputTokens, 0);
                    } else {
                      // First time seeing this hash
                      monitor.recordMiss(
                        hash,
                        inputTokens,
                        0,
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
                //
                // If res.write() had returned false (backpressure), some data may still be in the buffer.
                // We must check for buffered data and wait for the 'drain' event before calling res.end().
                // Calling res.end() too early truncates the response.

                const drainAndClose = () => {
                  if (!res.writableEnded) {
                    debug(2, `[Stream] Ending response stream after flush`);
                    res.end();
                  }
                };

                // Check if there's buffered data waiting to be written
                if (res.writableLength > 0) {
                  debug(2, `[Backpressure] ${res.writableLength} bytes buffered, waiting for drain`);

                  // Wait for drain event (buffer ready for more data) before closing
                  res.once("drain", () => {
                    debug(2, `[Backpressure] Drain event fired, closing stream`);
                    setImmediate(drainAndClose);
                  });

                  // Safety timeout: if drain event never fires, force close after 5 seconds
                  // This prevents hanging if there's an edge case we haven't considered
                  const drainTimeout = setTimeout(() => {
                    if (!res.writableEnded) {
                      debug(1, `[Backpressure] Drain timeout (5s), force closing stream`);
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
              },
              abort(reason) {
                // Handle stream abort
                debug(1, `[Stream Abort] Stream aborted:`, reason);
                if (keepaliveInterval) {
                  clearInterval(keepaliveInterval);
                }
                if (!res.writableEnded) {
                  res.end();
                }
              },
            })
          );
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
