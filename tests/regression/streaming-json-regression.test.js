/**
 * Regression tests for streaming JSON parser
 *
 * Ensures backward compatibility and prevents regressions:
 * 1. Existing tool calling behavior unchanged
 * 2. All SSE events still present
 * 3. Event order preserved
 * 4. Tool call structure identical
 * 5. Error handling doesn't crash stream
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

const {
  createAnthropicStream,
} = require("../../dist/convert-to-anthropic-stream.js");

describe("Backward Compatibility - Tool Calling Behavior", () => {
  describe("SSE event structure preservation", () => {
    test("should produce identical events with and without incremental parser", async () => {
      const toolCallJSON = '{"name":"Read","input":{"file_path":"test.ts"}}';
      const mockStream = createMockToolCallStream([toolCallJSON]);

      // Capture events with old behavior (no incremental parser)
      const oldEvents = [];
      const oldStream = createAnthropicStream(mockStream.clone(), {
        useIncrementalParser: false,
      });
      for await (const event of oldStream) {
        oldEvents.push(event);
      }

      // Capture events with new behavior (incremental parser)
      const newEvents = [];
      const newStream = createAnthropicStream(mockStream.clone(), {
        useIncrementalParser: true,
      });
      for await (const event of newStream) {
        newEvents.push(event);
      }

      // Event types should be identical
      const oldTypes = oldEvents.map((e) => e.type);
      const newTypes = newEvents.map((e) => e.type);
      expect(newTypes).toEqual(oldTypes);

      // Event counts should match
      expect(newEvents.length).toBe(oldEvents.length);
    });

    test("should preserve all SSE event types", async () => {
      const mockStream = createMockToolCallStream(['{"name":"Write"}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      const eventTypes = new Set(events.map((e) => e.type));

      // All expected event types must be present
      expect(eventTypes).toContain("message_start");
      expect(eventTypes).toContain("content_block_start");
      expect(eventTypes).toContain("content_block_delta");
      expect(eventTypes).toContain("content_block_stop");
      expect(eventTypes).toContain("message_delta");
      expect(eventTypes).toContain("message_stop");
    });

    test("should maintain event order", async () => {
      const mockStream = createMockToolCallStream(['{"name":"Bash"}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      const eventTypes = events.map((e) => e.type);

      // Verify correct order
      const messageStartIdx = eventTypes.indexOf("message_start");
      const contentStartIdx = eventTypes.indexOf("content_block_start");
      const contentDeltaIdx = eventTypes.indexOf("content_block_delta");
      const contentStopIdx = eventTypes.indexOf("content_block_stop");
      const messageDeltaIdx = eventTypes.indexOf("message_delta");
      const messageStopIdx = eventTypes.indexOf("message_stop");

      expect(messageStartIdx).toBeLessThan(contentStartIdx);
      expect(contentStartIdx).toBeLessThan(contentDeltaIdx);
      expect(contentDeltaIdx).toBeLessThan(contentStopIdx);
      expect(contentStopIdx).toBeLessThan(messageDeltaIdx);
      expect(messageDeltaIdx).toBeLessThan(messageStopIdx);
    });

    test("should preserve tool_use content block structure", async () => {
      const toolCallJSON =
        '{"name":"Edit","input":{"file_path":"test.ts","old_string":"foo","new_string":"bar"}}';
      const mockStream = createMockToolCallStream([toolCallJSON]);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Find content_block_start with tool_use
      const toolUseStart = events.find(
        (e) =>
          e.type === "content_block_start" &&
          e.content_block?.type === "tool_use"
      );

      expect(toolUseStart).toBeDefined();
      expect(toolUseStart.content_block).toHaveProperty("type", "tool_use");
      expect(toolUseStart.content_block).toHaveProperty("id");
      expect(toolUseStart.content_block).toHaveProperty("name", "Edit");
      expect(toolUseStart.content_block).toHaveProperty("input");
    });

    test("should preserve input_json_delta events", async () => {
      const mockStream = createMockToolCallStream([
        '{"name":"Read",',
        '"input":{"file_path":"test.ts"}}',
      ]);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Find input_json_delta events
      const inputDeltas = events.filter(
        (e) =>
          e.type === "content_block_delta" &&
          e.delta?.type === "input_json_delta"
      );

      expect(inputDeltas.length).toBeGreaterThan(0);

      // Verify structure
      inputDeltas.forEach((event) => {
        expect(event.delta).toHaveProperty("type", "input_json_delta");
        expect(event.delta).toHaveProperty("partial_json");
        expect(event).toHaveProperty("index");
      });
    });

    test("should produce valid final tool call object", async () => {
      const toolCallJSON =
        '{"name":"Bash","input":{"command":"npm test","timeout":30000,"description":"Run tests"}}';
      const mockStream = createMockToolCallStream([toolCallJSON]);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Reconstruct final tool call from deltas
      const inputDeltas = events.filter(
        (e) =>
          e.type === "content_block_delta" &&
          e.delta?.type === "input_json_delta"
      );

      const fullJSON = inputDeltas.map((e) => e.delta.partial_json).join("");
      const parsed = JSON.parse(fullJSON);

      expect(parsed).toEqual({
        name: "Bash",
        input: {
          command: "npm test",
          timeout: 30000,
          description: "Run tests",
        },
      });
    });
  });

  describe("Tool call structure compatibility", () => {
    test("should handle multiple tool calls in sequence", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          // First tool call
          yield { type: "tool-call", toolCallId: "call-1", toolName: "Read" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-1",
            argsTextDelta: '{"file_path":"a.ts"}',
          };

          // Second tool call
          yield { type: "tool-call", toolCallId: "call-2", toolName: "Write" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-2",
            argsTextDelta: '{"file_path":"b.ts","content":"test"}',
          };

          yield { type: "finish", finishReason: "tool-calls" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Should have two separate content blocks
      const blockStarts = events.filter(
        (e) =>
          e.type === "content_block_start" &&
          e.content_block?.type === "tool_use"
      );

      expect(blockStarts.length).toBe(2);
      expect(blockStarts[0].content_block.name).toBe("Read");
      expect(blockStarts[1].content_block.name).toBe("Write");
    });

    test("should handle text before tool calls", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", textDelta: "Let me help with that." };
          yield { type: "tool-call", toolCallId: "call-1", toolName: "Read" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-1",
            argsTextDelta: '{"file_path":"test.ts"}',
          };
          yield { type: "finish", finishReason: "tool-calls" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Should have both text and tool_use content blocks
      const blockStarts = events.filter(
        (e) => e.type === "content_block_start"
      );

      expect(blockStarts.length).toBe(2);
      expect(blockStarts[0].content_block.type).toBe("text");
      expect(blockStarts[1].content_block.type).toBe("tool_use");
    });

    test("should handle tool call with no input parameters", async () => {
      const mockStream = createMockToolCallStream(['{"name":"TestTool"}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Should handle gracefully
      const toolUseStart = events.find(
        (e) =>
          e.type === "content_block_start" &&
          e.content_block?.type === "tool_use"
      );

      expect(toolUseStart).toBeDefined();
      expect(toolUseStart.content_block.name).toBe("TestTool");
    });

    test("should handle nested input parameters", async () => {
      const complexJSON = JSON.stringify({
        name: "ComplexTool",
        input: {
          config: {
            nested: {
              deeply: {
                value: "test",
              },
            },
          },
          array: [1, 2, { key: "value" }],
        },
      });

      const mockStream = createMockToolCallStream([complexJSON]);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Reconstruct and verify structure
      const inputDeltas = events.filter(
        (e) =>
          e.type === "content_block_delta" &&
          e.delta?.type === "input_json_delta"
      );

      const fullJSON = inputDeltas.map((e) => e.delta.partial_json).join("");
      const parsed = JSON.parse(fullJSON);

      expect(parsed.input.config.nested.deeply.value).toBe("test");
      expect(parsed.input.array).toEqual([1, 2, { key: "value" }]);
    });
  });

  describe("Error handling - Stream resilience", () => {
    test("should not crash stream on parser error", async () => {
      const mockStream = createMockToolCallStream(['{"name":"Read",invalid}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        fallbackOnError: true,
      });

      // Should not throw
      await expect(async () => {
        for await (const event of stream) {
          events.push(event);
        }
      }).not.toThrow();
    });

    test("should fallback to full delta on parser error", async () => {
      const mockStream = createMockToolCallStream(['{"malformed":invalid,}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        fallbackOnError: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Should still produce events (using fallback)
      expect(events.length).toBeGreaterThan(0);

      // Should have emitted an error event or warning
      const errorEvents = events.filter((e) => e.type === "error");
      // Or should fallback silently and continue
    });

    test("should continue stream after parser failure", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "tool-call", toolCallId: "call-1", toolName: "Bad" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-1",
            argsTextDelta: '{"bad":malformed}', // Invalid JSON
          };

          // Second tool call (valid)
          yield { type: "tool-call", toolCallId: "call-2", toolName: "Good" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-2",
            argsTextDelta: '{"file_path":"test.ts"}',
          };

          yield { type: "finish", finishReason: "tool-calls" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        fallbackOnError: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Should process the second (valid) tool call
      const blockStarts = events.filter(
        (e) =>
          e.type === "content_block_start" &&
          e.content_block?.type === "tool_use"
      );

      expect(blockStarts.length).toBeGreaterThan(0);
      // At least the second tool call should work
    });

    test("should handle buffer overflow gracefully", async () => {
      // Create JSON exceeding buffer limit
      const huge = "x".repeat(2 * 1024 * 1024); // 2MB
      const mockStream = createMockToolCallStream([
        `{"name":"Write","content":"${huge}"}`,
      ]);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        maxBufferSize: 1024 * 1024, // 1MB limit
        fallbackOnError: true,
      });

      // Should either fallback or throw meaningful error
      try {
        for await (const event of stream) {
          events.push(event);
        }
      } catch (error) {
        expect(error.message).toMatch(/buffer|overflow|too large/i);
      }

      // Stream should not be corrupted
      if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        expect(lastEvent).toBeDefined();
      }
    });

    test("should handle timeout during parsing", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "tool-call", toolCallId: "call-1", toolName: "Slow" };

          // Simulate slow streaming
          const chunks = '{"file_path":"test.ts"}'.split("");
          for (const chunk of chunks) {
            await new Promise((resolve) => setTimeout(resolve, 20)); // 20ms delay per char
            yield {
              type: "tool-call-delta",
              toolCallId: "call-1",
              argsTextDelta: chunk,
            };
          }

          yield { type: "finish", finishReason: "tool-calls" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        timeout: 100, // 100ms timeout
        fallbackOnError: true,
      });

      // Should either complete or fallback gracefully
      await expect(async () => {
        for await (const event of stream) {
          events.push(event);
        }
      }).not.toThrow();
    });

    test("should reset parser state after error", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          // First tool call (invalid)
          yield { type: "tool-call", toolCallId: "call-1", toolName: "Bad" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-1",
            argsTextDelta: '{"bad":invalid}',
          };

          // Second tool call (valid) - parser should be reset
          yield { type: "tool-call", toolCallId: "call-2", toolName: "Good" };
          yield {
            type: "tool-call-delta",
            toolCallId: "call-2",
            argsTextDelta: '{"file_path":"test.ts"}',
          };

          yield { type: "finish", finishReason: "tool-calls" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        fallbackOnError: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Second tool call should work correctly
      const goodToolDeltas = events.filter(
        (e) =>
          e.type === "content_block_delta" &&
          e.delta?.partial_json?.includes("test.ts")
      );

      expect(goodToolDeltas.length).toBeGreaterThan(0);
    });
  });

  describe("Message metadata preservation", () => {
    test("should preserve message ID", async () => {
      const mockStream = createMockToolCallStream(['{"name":"Read"}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      const messageStart = events.find((e) => e.type === "message_start");
      expect(messageStart).toBeDefined();
      expect(messageStart.message).toHaveProperty("id");
    });

    test("should preserve usage metadata", async () => {
      const mockStream = createMockToolCallStream(['{"name":"Write"}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      const messageDelta = events.find((e) => e.type === "message_delta");
      expect(messageDelta).toBeDefined();
      expect(messageDelta.usage).toBeDefined();
    });

    test("should preserve stop reason", async () => {
      const mockStream = createMockToolCallStream(['{"name":"Bash"}']);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      const messageDelta = events.find((e) => e.type === "message_delta");
      expect(messageDelta).toBeDefined();
      expect(messageDelta.delta).toHaveProperty("stop_reason");
    });
  });
});

/**
 * Helper function to create mock AI SDK stream from JSON chunks
 */
function createMockToolCallStream(chunks) {
  const cloneableStream = {
    chunks,
    clone() {
      return createMockToolCallStream([...this.chunks]);
    },
    async *[Symbol.asyncIterator]() {
      yield { type: "text-delta", textDelta: "" };

      yield {
        type: "tool-call",
        toolCallId: "test-call-id",
        toolName: "Unknown",
      };

      for (const chunk of this.chunks) {
        yield {
          type: "tool-call-delta",
          toolCallId: "test-call-id",
          argsTextDelta: chunk,
        };
      }

      yield { type: "finish", finishReason: "tool-calls" };
    },
  };

  return cloneableStream;
}
