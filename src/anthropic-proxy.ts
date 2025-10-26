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

  // Cache for LMStudio context length (queried on first request)
  let cachedContextLength: number | null = null;
  let contextLengthQueried = false;

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
                const lines = chunkStr.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.substring(6));

                      // Log tool_use events from Claude API
                      if (data.type === "content_block_start" && data.content_block?.type === "tool_use") {
                        debug(3, `[Claude API → Tool Call] Tool use from real Claude:`, {
                          tool_name: data.content_block.name,
                          tool_id: data.content_block.id,
                          input: data.content_block.input,
                        });
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

              // Log trace for Claude mode (successful responses)
              if (mode === "claude" && body && statusCode >= 200 && statusCode < 400) {
                try {
                  logTrace(mode, {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: body,
                  }, {
                    statusCode,
                    headers: proxiedRes.headers,
                    body: JSON.parse(responseBody),
                  });
                } catch (error) {
                  // If response isn't JSON, log as string
                  logTrace(mode, {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: body,
                  }, {
                    statusCode,
                    headers: proxiedRes.headers,
                    body: responseBody,
                  });
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
            debug(3, `[Claude Mode] Claude Code sent ${body.tools.length} tools in request`);
            body.tools.forEach((tool, idx) => {
              debug(3, `[Claude Mode Tool ${idx + 1}/${body.tools!.length}] ${tool.name}`, {
                description_length: tool.description?.length ?? 0,
                input_schema: tool.input_schema,
              });
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

      // LMStudio mode: non-messages endpoints go to Anthropic
      if (!req.url.startsWith("/v1/messages")) {
        proxyToAnthropic();
        return;
      }

      // LMStudio mode: convert messages and route through LMStudio
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

        // Use default provider and model (LMStudio)
        const providerName = defaultProvider;
        const model = defaultModel;

        const provider = providers[providerName];
        if (!provider) {
          throw new Error(`Provider not configured: ${providerName}`);
        }

        let system: string | undefined;
        if (body.system && body.system.length > 0) {
          system = body.system.map((s) => s.text).join("\n");
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

        const tools = body.tools?.reduce(
          (acc, tool) => {
            const originalSchema = tool.input_schema;
            const providerizedSchema = providerizeSchema(providerName, originalSchema);

            // Log schema transformation (TRACE level)
            if (isTraceDebugEnabled()) {
              const schemasMatch = JSON.stringify(originalSchema) === JSON.stringify(providerizedSchema);
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
          const lmstudioUrl = process.env.LMSTUDIO_URL || "http://localhost:1234/v1";
          try {
            const contextLength = await getModelContextLength(lmstudioUrl);
            if (contextLength) {
              cachedContextLength = contextLength;
              debug(1, `[Context] Cached LMStudio context length: ${contextLength} tokens`);
            }
          } catch (error) {
            debug(1, `[Context] Failed to query LMStudio context length:`, error);
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
          // Create AbortController for timeout protection
          const abortController = new AbortController();
          const timeout = setTimeout(() => {
            debug(1, `[Timeout] Request to ${providerName}/${model} exceeded 120 seconds`);
            abortController.abort();
          }, 120000); // 120 second timeout

          try {
            stream = await streamText({
              model: provider.languageModel(model),
              system,
              tools,
              messages: coreMessages,
              maxOutputTokens: body.max_tokens,
              temperature: body.temperature,
              abortSignal: abortController.signal,

              onFinish: ({ response, usage, finishReason }) => {
                // Clear timeout on successful completion
                clearTimeout(timeout);
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

              res.writeHead(200, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                  id: "msg_" + Date.now(),
                  type: "message",
                  role: promptMessage.role,
                  content: promptMessage.content,
                  model: body.model,
                  stop_reason: mapAnthropicStopReason(finishReason),
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
              clearTimeout(timeout);
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
            clearTimeout(timeout);
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
            debug(1, `Error consuming stream for ${providerName}/${model}:`, error);
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

        // Set proper SSE headers for streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        // Send immediate message_start event to prevent client timeout
        // LMStudio can take 30-60s to process large prompts before generating tokens
        // Claude Code will disconnect if it doesn't receive events within ~30s
        const messageId = "msg_" + Date.now();
        res.write(`event: message_start\n`);
        res.write(`data: ${JSON.stringify({
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
        })}\n\n`);

        // Start keepalive interval to prevent Claude Code timeout during slow prompt processing
        // Some models (glm-4.5-air-mlx, Qwen3-30B) can take 60+ seconds to process prompts
        // Send SSE comment every 10 seconds to keep connection alive
        let keepaliveCount = 0;
        const keepaliveInterval = setInterval(() => {
          if (!res.writableEnded) {
            keepaliveCount++;
            res.write(`: keepalive ${keepaliveCount}\n\n`);
            debug(2, `[Keepalive] Sent keepalive #${keepaliveCount} (waiting for LMStudio)`);
          }
        }, 10000); // 10 second interval

        try {
          await convertToAnthropicStream(stream.fullStream, true).pipeTo(
            new WritableStream({
              write(chunk) {
                // Clear keepalive on first chunk (stream has started)
                if (keepaliveInterval) {
                  clearInterval(keepaliveInterval);
                  debug(2, `[Keepalive] Cleared (stream started after ${keepaliveCount} keepalives)`);
                }

                if (isVerboseDebugEnabled()) {
                  debug(2, `[Stream Chunk]`, chunk);
                }

                // Log tool_use events at trace level
                if (isTraceDebugEnabled() && chunk.type === "content_block_start" && (chunk as any).content_block?.type === "tool_use") {
                  debug(3, `[SSE → Claude Code] Writing tool_use event:`, {
                    event: chunk.type,
                    index: (chunk as any).index,
                    tool_name: (chunk as any).content_block.name,
                    tool_id: (chunk as any).content_block.id,
                    input: (chunk as any).content_block.input,
                  });
                }

                // Write chunk to stream
                res.write(
                  `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`
                );
              },
              close() {
                // Clear keepalive on completion
                if (keepaliveInterval) {
                  clearInterval(keepaliveInterval);
                }
                const totalDuration = Date.now() - requestStartTime;
                debug(
                  1,
                  `[Request Complete] ${providerName}/${model}: ${totalDuration}ms`
                );
                res.end();
              },
            })
          );
        } catch (error) {
          // Clear keepalive on error
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
          }
          debug(1, `Error in stream processing for ${providerName}/${model}:`, error);

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

  const address = proxy.address();
  if (!address) {
    throw new Error("Failed to get proxy address");
  }
  if (typeof address === "string") {
    return address;
  }
  return `http://localhost:${address.port}`;
};
