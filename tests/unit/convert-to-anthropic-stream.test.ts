/**
 * Tests for convert-to-anthropic-stream
 *
 * Focuses on the stripWebSearchCalls option that filters
 * WebSearch tool calls from the response stream.
 */

import { convertToAnthropicStream } from "../../src/convert-to-anthropic-stream";
import type { TextStreamPart } from "ai";
import type { Tool } from "ai";

// Helper to create a mock stream from an array of chunks
function createMockStream(
  chunks: TextStreamPart<Record<string, Tool>>[]
): ReadableStream<TextStreamPart<Record<string, Tool>>> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// Helper to collect all chunks from a stream
async function collectChunks(stream: ReadableStream<any>): Promise<any[]> {
  const chunks: any[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("convertToAnthropicStream", () => {
  describe("stripWebSearchCalls option", () => {
    it("should strip WebSearch tool calls when enabled", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        {
          type: "tool-call",
          toolCallId: "call_123",
          toolName: "WebSearch",
          input: { query: "test query" },
        } as any,
        { type: "text-start" } as any,
        { type: "text-delta", text: "Here is the response" } as any,
        { type: "text-end" } as any,
        {
          type: "finish-step",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20 },
        } as any,
        { type: "finish" } as any,
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream, {
        stripWebSearchCalls: true,
      });

      const outputChunks = await collectChunks(converted);

      // Should NOT contain any tool_use blocks for WebSearch
      const toolUseBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" &&
          c.content_block?.type === "tool_use"
      );
      expect(toolUseBlocks.length).toBe(0);

      // Should still contain text content
      const textBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" && c.content_block?.type === "text"
      );
      expect(textBlocks.length).toBe(1);
    });

    it("should NOT strip WebSearch tool calls when disabled", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        {
          type: "tool-call",
          toolCallId: "call_123",
          toolName: "WebSearch",
          input: { query: "test query" },
        } as any,
        { type: "text-start" } as any,
        { type: "text-delta", text: "Response" } as any,
        { type: "text-end" } as any,
        {
          type: "finish-step",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20 },
        } as any,
        { type: "finish" } as any,
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream, {
        stripWebSearchCalls: false,
      });

      const outputChunks = await collectChunks(converted);

      // Should contain tool_use block for WebSearch
      const toolUseBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" &&
          c.content_block?.type === "tool_use"
      );
      expect(toolUseBlocks.length).toBe(1);
      expect(toolUseBlocks[0].content_block.name).toBe("WebSearch");
    });

    it("should strip all WebSearch variants (WebSearch, web_search, websearch)", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "WebSearch",
          input: { query: "q1" },
        } as any,
        {
          type: "tool-call",
          toolCallId: "call_2",
          toolName: "web_search",
          input: { query: "q2" },
        } as any,
        {
          type: "tool-call",
          toolCallId: "call_3",
          toolName: "websearch",
          input: { query: "q3" },
        } as any,
        {
          type: "finish-step",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20 },
        } as any,
        { type: "finish" } as any,
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream, {
        stripWebSearchCalls: true,
      });

      const outputChunks = await collectChunks(converted);

      // Should NOT contain any tool_use blocks
      const toolUseBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" &&
          c.content_block?.type === "tool_use"
      );
      expect(toolUseBlocks.length).toBe(0);
    });

    it("should NOT strip other tools when stripWebSearchCalls is enabled", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "WebSearch",
          input: { query: "q1" },
        } as any,
        {
          type: "tool-call",
          toolCallId: "call_2",
          toolName: "Read",
          input: { file_path: "/test.txt" },
        } as any,
        {
          type: "tool-call",
          toolCallId: "call_3",
          toolName: "Bash",
          input: { command: "ls" },
        } as any,
        {
          type: "finish-step",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20 },
        } as any,
        { type: "finish" } as any,
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream, {
        stripWebSearchCalls: true,
      });

      const outputChunks = await collectChunks(converted);

      // Should contain tool_use blocks for Read and Bash, but not WebSearch
      const toolUseBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" &&
          c.content_block?.type === "tool_use"
      );
      expect(toolUseBlocks.length).toBe(2);
      expect(toolUseBlocks.map((b) => b.content_block.name).sort()).toEqual([
        "Bash",
        "Read",
      ]);
    });

    it("should strip streaming WebSearch tool calls (tool-input-start/delta/end)", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        {
          type: "tool-input-start",
          id: "call_123",
          toolName: "WebSearch",
        } as any,
        { type: "tool-input-delta", delta: '{"query":' } as any,
        { type: "tool-input-delta", delta: '"test"}' } as any,
        { type: "tool-input-end" } as any,
        { type: "text-start" } as any,
        { type: "text-delta", text: "Response text" } as any,
        { type: "text-end" } as any,
        {
          type: "finish-step",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20 },
        } as any,
        { type: "finish" } as any,
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream, {
        stripWebSearchCalls: true,
      });

      const outputChunks = await collectChunks(converted);

      // Should NOT contain any tool_use blocks
      const toolUseBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" &&
          c.content_block?.type === "tool_use"
      );
      expect(toolUseBlocks.length).toBe(0);

      // Should still contain text content
      const textBlocks = outputChunks.filter(
        (c) =>
          c.type === "content_block_start" && c.content_block?.type === "text"
      );
      expect(textBlocks.length).toBe(1);
    });
  });

  describe("basic stream conversion", () => {
    it("should convert text stream to Anthropic format", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        { type: "text-start" } as any,
        { type: "text-delta", text: "Hello, " } as any,
        { type: "text-delta", text: "world!" } as any,
        { type: "text-end" } as any,
        {
          type: "finish-step",
          finishReason: "stop",
          usage: { inputTokens: 5, outputTokens: 10 },
        } as any,
        { type: "finish" } as any,
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream);

      const outputChunks = await collectChunks(converted);

      // Should have message_start, content_block_start, deltas, content_block_stop, message_delta, message_stop
      expect(outputChunks.some((c) => c.type === "message_start")).toBe(true);
      expect(outputChunks.some((c) => c.type === "content_block_start")).toBe(
        true
      );
      expect(outputChunks.some((c) => c.type === "content_block_delta")).toBe(
        true
      );
      expect(outputChunks.some((c) => c.type === "message_stop")).toBe(true);
    });

    it("should include message_stop even without finish event", async () => {
      const inputChunks: TextStreamPart<Record<string, Tool>>[] = [
        { type: "start-step" } as any,
        { type: "text-start" } as any,
        { type: "text-delta", text: "Test" } as any,
        { type: "text-end" } as any,
        // No finish event
      ];

      const stream = createMockStream(inputChunks);
      const converted = convertToAnthropicStream(stream);

      const outputChunks = await collectChunks(converted);

      // Should still have message_stop (fallback in flush)
      expect(outputChunks.some((c) => c.type === "message_stop")).toBe(true);
    });
  });
});
