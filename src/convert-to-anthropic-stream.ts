import type { Tool } from "ai";
import type { TextStreamPart } from "ai";
import {
  mapAnthropicStopReason,
  type AnthropicStreamChunk,
} from "./anthropic-api-types";
import { debug, isDebugEnabled, isVerboseDebugEnabled } from "./debug";

export function convertToAnthropicStream(
  stream: ReadableStream<TextStreamPart<Record<string, Tool>>>,
  skipFirstMessageStart = false
): ReadableStream<AnthropicStreamChunk> {
  let index = 0; // content block index within the current message
  let reasoningBuffer = ""; // Buffer for accumulating reasoning text
  let chunkCount = 0; // Track chunks for debugging
  let messageStartSkipped = false; // Track if we've skipped the first message_start

  const transform = new TransformStream<
    TextStreamPart<Record<string, Tool>>,
    AnthropicStreamChunk
  >({
    transform(chunk, controller) {
      chunkCount++;

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
            debug(2, `[Stream Conversion] Skipping duplicate message_start (already sent manually)`);
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
          // reset index for next message
          index = 0;
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
          controller.enqueue({
            type: "content_block_start",
            index,
            content_block: {
              type: "tool_use",
              id: chunk.id,
              name: chunk.toolName,
              input: {},
            },
          });
          break;
        }
        case "tool-input-delta": {
          controller.enqueue({
            type: "content_block_delta",
            index,
            delta: { type: "input_json_delta", partial_json: chunk.delta },
          });
          break;
        }
        case "tool-input-end": {
          controller.enqueue({ type: "content_block_stop", index });
          index += 1;
          break;
        }
        case "tool-call": {
          controller.enqueue({
            type: "content_block_start",
            index,
            content_block: {
              type: "tool_use",
              id: chunk.toolCallId,
              name: chunk.toolName,
              input: (chunk as any).input,
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
          debug(1, `[Stream Conversion] ⚠️  Unhandled chunk type: ${unknownChunk.type}`, {
            chunkNumber: chunkCount,
            chunk: unknownChunk,
          });
          const error = new Error(`Unhandled chunk type: ${unknownChunk.type} (chunk ${chunkCount})`);
          debug(1, `[Stream Conversion] Terminating stream due to unhandled chunk`);
          controller.error(error);
        }
      }
    },
    flush(controller) {
      if (isDebugEnabled()) {
        debug(1, `[Stream Conversion] Stream complete. Total chunks: ${chunkCount}`);
      }
    },
  });
  stream.pipeTo(transform.writable).catch((error) => {
    // Log ALL pipeline errors, even empty ones - they indicate problems
    const hasErrorContent = error && (Object.keys(error).length > 0 || error.message);

    if (hasErrorContent) {
      debug(1, `[Stream Conversion] Pipeline error:`, error);
    } else {
      // Empty errors {} are NOT normal - they indicate stream cancellation/abort
      debug(1, `[Stream Conversion] ⚠️  Pipeline aborted with empty error - stream may have been cancelled or sent invalid data`);
      debug(1, `[Stream Conversion] Last processed chunk count: ${chunkCount}`);
    }

    // Note: We swallow the error here because streaming errors should be
    // sent as error chunks in the stream itself. However, empty errors indicate
    // a problem with the stream format or connection.
  });
  return transform.readable;
}
