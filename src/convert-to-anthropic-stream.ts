import type { Tool } from "ai";
import type { TextStreamPart } from "ai";
import {
  mapAnthropicStopReason,
  type AnthropicStreamChunk,
} from "./anthropic-api-types";
import {
  debug,
  isDebugEnabled,
  isVerboseDebugEnabled,
  isTraceDebugEnabled,
} from "./debug";
import { safeStringify } from "./safe-stringify";

export function convertToAnthropicStream(
  stream: ReadableStream<TextStreamPart<Record<string, Tool>>>,
  skipFirstMessageStart = false
): ReadableStream<AnthropicStreamChunk> {
  let index = 0; // content block index within the current message
  let reasoningBuffer = ""; // Buffer for accumulating reasoning text
  let chunkCount = 0; // Track chunks for debugging
  let messageStartSkipped = false; // Track if we've skipped the first message_start
  let messageStopSent = false; // Track if message_stop has been sent
  const streamedToolIds = new Set<string>(); // Track tool IDs we've already sent via streaming
  const toolsWithoutDeltas = new Map<string, { index: number; name: string }>(); // Track tools that got tool-input-end without deltas
  let currentStreamingTool: {
    id: string;
    name: string;
    index: number;
    receivedDelta: boolean;
  } | null = null; // Track current streaming tool

  const transform = new TransformStream<
    TextStreamPart<Record<string, Tool>>,
    AnthropicStreamChunk
  >({
    transform(chunk, controller) {
      chunkCount++;
      debug(
        1,
        `[Stream Conversion] Received chunk ${chunkCount} of type: ${chunk.type}`
      );

      // Log raw chunks from AI SDK to help debug LMStudio responses
      // Log first 10 chunks at level 1, then all chunks at verbose level 2
      if (isDebugEnabled() && chunkCount <= 10) {
        debug(1, `[Stream Conversion] Raw chunk ${chunkCount}:`, {
          type: chunk.type,
          // Log chunk details without overwhelming the console
          ...(isVerboseDebugEnabled() ? { fullChunk: chunk } : {}),
        });
      } else if (isVerboseDebugEnabled()) {
        debug(2, `[Stream Conversion] Raw chunk ${chunkCount}:`, {
          type: chunk.type,
          fullChunk: chunk,
        });
      }

      switch (chunk.type) {
        case "start-step": {
          // Skip first message_start if we already sent one manually
          if (skipFirstMessageStart && !messageStartSkipped) {
            messageStartSkipped = true;
            debug(
              2,
              `[Stream Conversion] Skipping duplicate message_start (already sent manually)`
            );
            break;
          }

          controller.enqueue({
            type: "message_start",
            message: {
              id: "msg_" + Date.now(),
              role: "assistant",
              content: [],
              model: "claude-4-sonnet-20250514",
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            },
          });
          break;
        }
        case "finish-step": {
          controller.enqueue({
            type: "message_delta",
            delta: {
              stop_reason: mapAnthropicStopReason(chunk.finishReason),
              stop_sequence: null,
            },
            usage: {
              input_tokens: chunk.usage.inputTokens ?? 0,
              output_tokens: chunk.usage.outputTokens ?? 0,
              // OpenAI provides cached tokens via cachedInputTokens or in providerMetadata
              cache_creation_input_tokens: 0, // OpenAI doesn't report cache creation separately
              cache_read_input_tokens:
                chunk.usage.cachedInputTokens ??
                (typeof chunk.providerMetadata?.openai?.cached_tokens ===
                "number"
                  ? chunk.providerMetadata.openai.cached_tokens
                  : 0),
            },
          });
          break;
        }
        case "finish": {
          controller.enqueue({ type: "message_stop" });
          messageStopSent = true;
          // reset index and streamed tools for next message
          index = 0;
          streamedToolIds.clear();
          break;
        }
        case "text-start": {
          controller.enqueue({
            type: "content_block_start",
            index,
            content_block: { type: "text", text: "" },
          });
          break;
        }
        case "text-delta": {
          controller.enqueue({
            type: "content_block_delta",
            index,
            delta: { type: "text_delta", text: chunk.text },
          });
          break;
        }
        case "text-end": {
          controller.enqueue({ type: "content_block_stop", index });
          index += 1;
          break;
        }
        case "tool-input-start": {
          // CRITICAL FIX: Validate tool call ID and name before using
          const toolId = (chunk as any).id;
          const toolName = (chunk as any).toolName;

          if (
            !toolId ||
            !toolName ||
            typeof toolId !== "string" ||
            typeof toolName !== "string"
          ) {
            debug(
              1,
              `[Tool Input Start] ⚠️  INVALID tool start event - missing or invalid id/name:`,
              {
                id: toolId,
                toolName: toolName,
                idType: typeof toolId,
                nameType: typeof toolName,
                fullChunk: chunk,
              }
            );
            break; // Skip malformed tool call
          }

          // DIAGNOSTIC: Log streaming tool start
          debug(1, `[Tool Input Start Debug] Streaming tool detected:`, {
            id: toolId,
            toolName: toolName,
            chunkKeys: Object.keys(chunk),
          });

          // Track this tool for delta detection
          currentStreamingTool = {
            id: toolId,
            name: toolName,
            index: index,
            receivedDelta: false,
          };

          // Send streaming tool parameters as Anthropic's input_json_delta format
          // This is how the original anyclaude handles it
          streamedToolIds.add(toolId); // Mark this tool as streamed
          controller.enqueue({
            type: "content_block_start",
            index,
            content_block: {
              type: "tool_use",
              id: toolId,
              name: toolName,
              input: {},
            },
          });
          if (isTraceDebugEnabled()) {
            debug(3, `[Tool Input] Started streaming tool: ${toolName}`, {
              id: toolId,
            });
          }
          break;
        }
        case "tool-input-delta": {
          // DIAGNOSTIC: Log first few deltas
          if (isDebugEnabled()) {
            debug(1, `[Tool Input Delta Debug] Received delta:`, {
              delta: chunk.delta.substring(0, 100),
              deltaLength: chunk.delta.length,
            });
          }

          // Mark that we received a delta for the current tool
          if (currentStreamingTool) {
            currentStreamingTool.receivedDelta = true;
          }

          // Stream tool parameters incrementally via input_json_delta
          controller.enqueue({
            type: "content_block_delta",
            index,
            delta: { type: "input_json_delta", partial_json: chunk.delta },
          });
          if (isTraceDebugEnabled()) {
            debug(3, `[Tool Input] Delta: ${chunk.delta}`);
          }
          break;
        }
        case "tool-input-end": {
          // Check if we received any deltas for this tool
          if (currentStreamingTool && !currentStreamingTool.receivedDelta) {
            // No deltas received! This means the tool parameters will come in the tool-call chunk.
            // Save this tool to handle later.
            debug(
              1,
              `[Tool Input End] No deltas received for ${currentStreamingTool.name}, waiting for tool-call chunk`
            );
            toolsWithoutDeltas.set(currentStreamingTool.id, {
              index: currentStreamingTool.index,
              name: currentStreamingTool.name,
            });
            // Don't emit content_block_stop yet - we'll do it when we get the tool-call with actual input
            currentStreamingTool = null;
            break;
          }

          // Normal case: received deltas, close the block
          controller.enqueue({ type: "content_block_stop", index });
          index += 1;
          currentStreamingTool = null;
          if (isTraceDebugEnabled()) {
            debug(3, `[Tool Input] Completed streaming tool input`);
          }
          break;
        }
        case "tool-call": {
          // CRITICAL FIX: Validate required fields before processing
          const toolCallId = (chunk as any).toolCallId;
          const toolName = (chunk as any).toolName;

          if (
            !toolCallId ||
            !toolName ||
            typeof toolCallId !== "string" ||
            typeof toolName !== "string"
          ) {
            debug(
              1,
              `[Tool Call] ⚠️  INVALID tool-call chunk - missing or invalid toolCallId/toolName:`,
              {
                toolCallId: toolCallId,
                toolName: toolName,
                toolCallIdType: typeof toolCallId,
                toolNameType: typeof toolName,
                fullChunkKeys: Object.keys(chunk),
              }
            );
            break; // Skip malformed tool call
          }

          // DIAGNOSTIC: Log the full chunk structure
          debug(1, `[Tool Call Debug] Received tool-call chunk:`, {
            toolCallId: toolCallId,
            toolName: toolName,
            hasInput: "input" in (chunk as any),
            inputType: typeof (chunk as any).input,
            inputValue: (chunk as any).input,
            fullChunkKeys: Object.keys(chunk),
          });

          // Check if this tool was started but never received deltas
          const pendingTool = toolsWithoutDeltas.get(toolCallId);
          if (pendingTool) {
            // This tool was started but got tool-input-end without deltas!
            // Now we have the actual input from the tool-call chunk.
            debug(
              1,
              `[Tool Call] Completing tool ${toolName} that had no deltas`
            );

            const toolInput = (chunk as any).input;
            if (toolInput && typeof toolInput === "object") {
              // Send the complete input as a single delta
              // Use safeStringify to handle potential circular references in tool inputs
              controller.enqueue({
                type: "content_block_delta",
                index: pendingTool.index,
                delta: {
                  type: "input_json_delta",
                  partial_json: safeStringify(toolInput),
                },
              });
            }

            // Now close the block
            controller.enqueue({
              type: "content_block_stop",
              index: pendingTool.index,
            });
            index = pendingTool.index + 1;

            // Remove from pending and mark as streamed
            toolsWithoutDeltas.delete(toolCallId);
            streamedToolIds.add(toolCallId);
            break;
          }

          // Skip if we already sent this tool via streaming events
          if (streamedToolIds.has(toolCallId)) {
            if (isTraceDebugEnabled()) {
              debug(
                3,
                `[Tool Call] Skipping duplicate tool-call (already streamed): ${toolName}`
              );
            }
            break;
          }

          // Handle atomic (non-streaming) tool calls
          // Some models might send this instead of streaming events
          const toolInput = (chunk as any).input;

          // Defensive: Ensure input exists and is valid
          if (!toolInput || typeof toolInput !== "object") {
            debug(
              1,
              `[Tool Call] ⚠️  Missing or invalid input for ${toolName}:`,
              {
                toolCallId: toolCallId,
                input: toolInput,
                chunkType: typeof toolInput,
                entireChunk: chunk,
              }
            );
            // Use empty object as fallback
            controller.enqueue({
              type: "content_block_start",
              index,
              content_block: {
                type: "tool_use",
                id: toolCallId,
                name: toolName,
                input: {},
              },
            });
            controller.enqueue({ type: "content_block_stop", index });
            index += 1;
            break;
          }

          if (isTraceDebugEnabled()) {
            debug(3, `[Tool Call] Atomic tool call: ${toolName}`, {
              toolCallId: toolCallId,
              toolName: toolName,
              input: toolInput,
            });
          }

          controller.enqueue({
            type: "content_block_start",
            index,
            content_block: {
              type: "tool_use",
              id: toolCallId,
              name: toolName,
              input: toolInput,
            },
          });
          controller.enqueue({ type: "content_block_stop", index });
          index += 1;
          break;
        }
        case "error": {
          controller.enqueue({
            type: "error",
            error: {
              type: "api_error",
              message:
                chunk.error instanceof Error
                  ? chunk.error.message
                  : (chunk.error as string),
            },
          });
          break;
        }
        case "reasoning-start": {
          // Start a new thinking content block for OpenAI reasoning
          controller.enqueue({
            type: "content_block_start",
            index,
            content_block: { type: "thinking" as any, thinking: "" },
          });
          reasoningBuffer = ""; // Clear the buffer
          break;
        }
        case "reasoning-delta": {
          // Accumulate reasoning text and send as delta
          reasoningBuffer += chunk.text;
          controller.enqueue({
            type: "content_block_delta",
            index,
            delta: { type: "text_delta", text: chunk.text },
          });
          break;
        }
        case "reasoning-end": {
          // End the thinking content block
          controller.enqueue({ type: "content_block_stop", index });
          index += 1;
          reasoningBuffer = ""; // Clear the buffer
          break;
        }
        case "start":
        case "abort":
        case "raw":
        case "source":
        case "file":
          // ignore for Anthropic stream mapping
          if (isVerboseDebugEnabled()) {
            debug(2, `[Stream Conversion] Ignoring chunk type: ${chunk.type}`);
          }
          break;
        default: {
          const unknownChunk = chunk as any;
          // FIXED: Skip unknown chunk types instead of terminating the stream
          // This prevents truncated responses when vLLM-MLX sends unexpected chunk types
          debug(
            2,
            `[Stream Conversion] Skipping unknown chunk type: ${unknownChunk.type}`,
            {
              chunkNumber: chunkCount,
              // Don't log full chunk at debug level 2 to avoid spam
            }
          );
          if (isVerboseDebugEnabled()) {
            debug(2, `[Stream Conversion] Unknown chunk details:`, {
              type: unknownChunk.type,
              keys: Object.keys(unknownChunk),
            });
          }
          // Continue processing instead of terminating stream
          break;
        }
      }
    },
    flush(controller) {
      if (isDebugEnabled()) {
        debug(
          1,
          `[Stream Conversion] Stream complete. Total chunks: ${chunkCount}`
        );
      }

      // Safety net: ensure message_stop is always sent
      // This handles cases where the AI SDK doesn't send a 'finish' event
      if (!messageStopSent) {
        debug(
          1,
          `[Stream Conversion] ⚠️  No finish event received - sending fallback message_stop`
        );
        controller.enqueue({ type: "message_stop" });
        messageStopSent = true;
      }
    },
  });
  stream.pipeTo(transform.writable).catch((error) => {
    // Log ALL pipeline errors, even empty ones - they indicate problems
    const hasErrorContent =
      error && (Object.keys(error).length > 0 || error.message);

    if (hasErrorContent) {
      debug(1, `[Stream Conversion] Pipeline error:`, error);
    } else {
      // Empty errors {} are NOT normal - they indicate stream cancellation/abort
      debug(
        1,
        `[Stream Conversion] ⚠️  Pipeline aborted with empty error - stream may have been cancelled or sent invalid data`
      );
      debug(1, `[Stream Conversion] Last processed chunk count: ${chunkCount}`);
    }

    // Note: We swallow the error here because streaming errors should be
    // sent as error chunks in the stream itself. However, empty errors indicate
    // a problem with the stream format or connection.
  });
  return transform.readable;
}
