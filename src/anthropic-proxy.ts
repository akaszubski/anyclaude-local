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
  debug,
} from "./debug";

export type CreateAnthropicProxyOptions = {
  providers: Record<string, ProviderV2>;
  port?: number;
  defaultProvider: string;
  defaultModel: string;
};

// createAnthropicProxy creates a proxy server that accepts
// Anthropic Message API requests and proxies them through
// LMStudio - converting the results back to the Anthropic
// Message API format.
export const createAnthropicProxy = ({
  port,
  providers,
  defaultProvider,
  defaultModel,
}: CreateAnthropicProxyOptions): string => {
  // Log debug status on startup
  displayDebugStartup();

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
            });

            proxiedRes.on("end", () => {
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

                const responseBody = Buffer.concat(responseChunks).toString();
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

      if (!req.url.startsWith("/v1/messages")) {
        proxyToAnthropic();
        return;
      }

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

        const coreMessages = convertFromAnthropicMessages(body.messages);
        let system: string | undefined;
        if (body.system && body.system.length > 0) {
          system = body.system.map((s) => s.text).join("\n");
        }

        const tools = body.tools?.reduce(
          (acc, tool) => {
            acc[tool.name] = {
              description: tool.description || tool.name,
              inputSchema: jsonSchema(
                providerizeSchema(providerName, tool.input_schema)
              ),
            };
            return acc;
          },
          {} as Record<string, Tool>
        );

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
          stream = await streamText({
            model: provider.languageModel(model),
            system,
            tools,
            messages: coreMessages,
            maxOutputTokens: body.max_tokens,
            temperature: body.temperature,

            onFinish: ({ response, usage, finishReason }) => {
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

        try {
          await convertToAnthropicStream(stream.fullStream).pipeTo(
            new WritableStream({
              write(chunk) {
                if (isVerboseDebugEnabled()) {
                  debug(2, `[Stream Chunk]`, chunk);
                }

                // Write chunk to stream
                res.write(
                  `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`
                );
              },
              close() {
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
