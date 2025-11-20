/**
 * Integration tests for streaming JSON parser performance
 *
 * Tests integration with convert-to-anthropic-stream.ts and validates:
 * 1. Stream converter integration
 * 2. Performance benchmarks (tool detection, data reduction)
 * 3. SSE event structure preservation
 * 4. Edge case handling
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

const {
  IncrementalJSONParser,
} = require("../../dist/streaming-json-parser.js");
const {
  createAnthropicStream,
} = require("../../dist/convert-to-anthropic-stream.js");

describe("Stream Converter Integration", () => {
  describe("Delta-only transmission", () => {
    test("should send only deltas in content_block_delta events", async () => {
      // Mock AI SDK stream that sends tool call JSON incrementally
      const mockAIStream = createMockToolCallStream([
        '{"name":"Read"',
        ',"input":{"file_path"',
        ':"/path/to/file.ts"}}',
      ]);

      const events = [];
      const stream = createAnthropicStream(mockAIStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Find all content_block_delta events with tool input
      const deltaEvents = events.filter(
        (e) => e.type === "content_block_delta" && e.delta?.partial_json
      );

      // First delta should contain full JSON so far
      expect(deltaEvents[0].delta.partial_json).toContain('{"name":"Read"');

      // Subsequent deltas should only contain NEW portions
      if (deltaEvents.length > 1) {
        expect(deltaEvents[1].delta.partial_json).not.toContain(
          '{"name":"Read"'
        );
        expect(deltaEvents[1].delta.partial_json).toContain("input");
      }

      // Total data sent via deltas should be less than sending full JSON each time
      const totalDeltaSize = deltaEvents.reduce(
        (sum, e) => sum + e.delta.partial_json.length,
        0
      );
      const fullJSONSize =
        '{"name":"Read","input":{"file_path":"/path/to/file.ts"}}'.length *
        deltaEvents.length;

      expect(totalDeltaSize).toBeLessThan(fullJSONSize);
    });

    test("should maintain existing SSE event structure", async () => {
      const mockAIStream = createMockToolCallStream(['{"name":"Write"}']);

      const events = [];
      const stream = createAnthropicStream(mockAIStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Verify all expected event types are present
      const eventTypes = events.map((e) => e.type);

      expect(eventTypes).toContain("message_start");
      expect(eventTypes).toContain("content_block_start");
      expect(eventTypes).toContain("content_block_delta");
      expect(eventTypes).toContain("content_block_stop");
      expect(eventTypes).toContain("message_delta");
      expect(eventTypes).toContain("message_stop");
    });

    test("should preserve event order", async () => {
      const mockAIStream = createMockToolCallStream(['{"name":"Bash"}']);

      const events = [];
      const stream = createAnthropicStream(mockAIStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Event order should be: message_start → content_block_start → deltas → content_block_stop → message_delta → message_stop
      const eventTypes = events.map((e) => e.type);

      const messageStartIdx = eventTypes.indexOf("message_start");
      const blockStartIdx = eventTypes.indexOf("content_block_start");
      const blockStopIdx = eventTypes.indexOf("content_block_stop");
      const messageDeltaIdx = eventTypes.indexOf("message_delta");
      const messageStopIdx = eventTypes.indexOf("message_stop");

      expect(messageStartIdx).toBeLessThan(blockStartIdx);
      expect(blockStartIdx).toBeLessThan(blockStopIdx);
      expect(blockStopIdx).toBeLessThan(messageDeltaIdx);
      expect(messageDeltaIdx).toBeLessThan(messageStopIdx);
    });

    test("should preserve tool call structure", async () => {
      const toolCallJSON =
        '{"name":"Edit","input":{"file_path":"test.ts","old_string":"foo","new_string":"bar"}}';
      const mockAIStream = createMockToolCallStream([toolCallJSON]);

      const events = [];
      const stream = createAnthropicStream(mockAIStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        events.push(event);
      }

      // Find the final assembled tool call
      const toolUseEvent = events.find(
        (e) =>
          e.type === "content_block_start" &&
          e.content_block?.type === "tool_use"
      );

      expect(toolUseEvent).toBeDefined();
      expect(toolUseEvent.content_block.name).toBe("Edit");

      // Verify all input parameters are present in deltas
      const deltaEvents = events.filter(
        (e) => e.type === "content_block_delta" && e.delta?.partial_json
      );
      const allDeltas = deltaEvents.map((e) => e.delta.partial_json).join("");

      expect(allDeltas).toContain("Edit");
      expect(allDeltas).toContain("file_path");
      expect(allDeltas).toContain("old_string");
      expect(allDeltas).toContain("new_string");
    });

    test("should fallback gracefully on parser errors", async () => {
      // Mock stream with malformed JSON
      const mockAIStream = createMockToolCallStream([
        '{"name":"Read",invalid}',
      ]);

      const events = [];
      const stream = createAnthropicStream(mockAIStream, {
        useIncrementalParser: true,
        fallbackOnError: true,
      });

      // Should not throw - should fallback to full delta transmission
      expect(async () => {
        for await (const event of stream) {
          events.push(event);
        }
      }).not.toThrow();

      // Should still produce events (using fallback mode)
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("Performance benchmarks", () => {
    test("should achieve 60% faster tool detection vs full JSON parsing", async () => {
      const toolCallJSON =
        '{"name":"Bash","input":{"command":"npm install && npm test","timeout":60000,"description":"Install and test"}}';

      // Baseline: Full JSON parsing after complete
      const baselineStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        const mockStream = createMockToolCallStream([toolCallJSON]);
        const stream = createAnthropicStream(mockStream, {
          useIncrementalParser: false,
        });

        let toolName = null;
        for await (const event of stream) {
          if (
            event.type === "content_block_start" &&
            event.content_block?.name
          ) {
            toolName = event.content_block.name;
            break;
          }
        }
      }
      const baselineTime = performance.now() - baselineStart;

      // Incremental: Early tool detection from partial JSON
      const incrementalStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        const mockStream = createMockToolCallStream([toolCallJSON]);
        const stream = createAnthropicStream(mockStream, {
          useIncrementalParser: true,
        });

        let toolName = null;
        for await (const event of stream) {
          // Should detect tool name much earlier
          if (event.toolInfo?.name) {
            toolName = event.toolInfo.name;
            break;
          }
        }
      }
      const incrementalTime = performance.now() - incrementalStart;

      const speedup = ((baselineTime - incrementalTime) / baselineTime) * 100;

      // Should be at least 60% faster
      expect(speedup).toBeGreaterThanOrEqual(60);
    });

    test("should achieve 40% data reduction in transmission", async () => {
      // Large realistic tool call JSON streamed in chunks
      const chunks = [
        '{"name":"Write",',
        '"input":{',
        '"file_path":"/very/long/path/to/some/deeply/nested/file/structure/test.ts",',
        '"content":"function test() {\\n  const data = {\\n    key1: \\"value1\\",\\n    key2: \\"value2\\",\\n    key3: \\"value3\\"\\n  };\\n  return data;\\n}",',
        '"description":"Write test file with function"',
        "}}",
      ];

      // Baseline: Send full JSON each time (old behavior)
      let baselineTotalBytes = 0;
      const baselineStream = createMockToolCallStream(chunks);
      const baselineAnthropic = createAnthropicStream(baselineStream, {
        useIncrementalParser: false,
      });

      for await (const event of baselineAnthropic) {
        if (event.type === "content_block_delta" && event.delta?.partial_json) {
          baselineTotalBytes += event.delta.partial_json.length;
        }
      }

      // Incremental: Send only deltas (new behavior)
      let incrementalTotalBytes = 0;
      const incrementalStream = createMockToolCallStream(chunks);
      const incrementalAnthropic = createAnthropicStream(incrementalStream, {
        useIncrementalParser: true,
      });

      for await (const event of incrementalAnthropic) {
        if (event.type === "content_block_delta" && event.delta?.partial_json) {
          incrementalTotalBytes += event.delta.partial_json.length;
        }
      }

      const reduction =
        ((baselineTotalBytes - incrementalTotalBytes) / baselineTotalBytes) *
        100;

      // Should achieve at least 40% reduction
      expect(reduction).toBeGreaterThanOrEqual(40);
    });

    test("should maintain <5ms parser overhead per chunk", async () => {
      const chunks = [
        '{"name":"Edit",',
        '"input":{',
        '"file_path":"test.ts",',
        '"old_string":"foo",',
        '"new_string":"bar"',
        "}}",
      ];

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const mockStream = createMockToolCallStream(chunks);
        const stream = createAnthropicStream(mockStream, {
          useIncrementalParser: true,
        });

        for await (const event of stream) {
          // Consume events
        }
      }

      const elapsed = performance.now() - start;
      const avgPerChunk = elapsed / (iterations * chunks.length);

      // Should be <5ms overhead per chunk
      expect(avgPerChunk).toBeLessThan(5);
    });

    test("should handle large JSON efficiently", async () => {
      // 10KB of JSON data
      const largeContent = "x".repeat(10000);
      const largeJSON = `{"name":"Write","input":{"file_path":"test.ts","content":"${largeContent}"}}`;

      const chunks = [];
      const chunkSize = 100;
      for (let i = 0; i < largeJSON.length; i += chunkSize) {
        chunks.push(largeJSON.substring(i, i + chunkSize));
      }

      const start = performance.now();

      const mockStream = createMockToolCallStream(chunks);
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      for await (const event of stream) {
        // Consume events
      }

      const elapsed = performance.now() - start;

      // Should complete in reasonable time (<100ms for 10KB)
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Edge cases", () => {
    test("should handle delta before tool-start (orphan event)", async () => {
      // Mock stream that sends delta before content_block_start
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", textDelta: '{"name":' };
          yield { type: "tool-call", toolName: "Read" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      // Should not throw
      expect(async () => {
        for await (const event of stream) {
          events.push(event);
        }
      }).not.toThrow();
    });

    test("should handle duplicate tool-input-end", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "tool-call",
            toolName: "Write",
            args: '{"file_path":"test"}',
          };
          yield { type: "tool-call-delta", argsTextDelta: "}}" }; // Extra closing brace
          yield { type: "finish", finishReason: "tool-calls" };
        },
      };

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      expect(async () => {
        for await (const event of stream) {
          events.push(event);
        }
      }).not.toThrow();
    });

    test("should handle buffer overflow during streaming", async () => {
      // Create very large JSON that exceeds parser buffer
      const hugeContent = "x".repeat(2 * 1024 * 1024); // 2MB
      const hugeJSON = `{"name":"Write","input":{"content":"${hugeContent}"}}`;

      const mockStream = createMockToolCallStream([hugeJSON]);
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
        maxBufferSize: 1024 * 1024, // 1MB limit
      });

      // Should fallback gracefully or throw meaningful error
      const events = [];
      try {
        for await (const event of stream) {
          events.push(event);
        }
      } catch (error) {
        expect(error.message).toMatch(/buffer|overflow|too large/i);
      }
    });

    test("should handle empty chunks", async () => {
      const mockStream = createMockToolCallStream([
        '{"name":"Read"',
        "", // Empty chunk
        "}",
      ]);

      const events = [];
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      expect(async () => {
        for await (const event of stream) {
          events.push(event);
        }
      }).not.toThrow();

      expect(events.length).toBeGreaterThan(0);
    });

    test("should handle rapid chunk succession", async () => {
      // Many small chunks sent rapidly
      const chunks = '{"name":"Bash","input":{"command":"test"}}'.split("");

      const mockStream = createMockToolCallStream(chunks);
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Should handle all chunks correctly
      expect(events.length).toBeGreaterThan(0);
      const deltaEvents = events.filter(
        (e) => e.type === "content_block_delta" && e.delta?.partial_json
      );
      expect(deltaEvents.length).toBeGreaterThan(0);
    });

    test("should handle Unicode in chunks", async () => {
      const unicodeJSON =
        '{"name":"测试","emoji":"🚀","description":"Test with Unicode"}';
      const chunks = [
        unicodeJSON.substring(0, 15),
        unicodeJSON.substring(15, 30),
        unicodeJSON.substring(30),
      ];

      const mockStream = createMockToolCallStream(chunks);
      const stream = createAnthropicStream(mockStream, {
        useIncrementalParser: true,
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Verify Unicode is preserved
      const deltaEvents = events.filter(
        (e) => e.type === "content_block_delta" && e.delta?.partial_json
      );
      const allDeltas = deltaEvents.map((e) => e.delta.partial_json).join("");

      expect(allDeltas).toContain("测试");
      expect(allDeltas).toContain("🚀");
    });
  });
});

/**
 * Helper function to create mock AI SDK stream from JSON chunks
 */
function createMockToolCallStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "text-delta", textDelta: "" }; // Message start

      // Send tool call start
      yield {
        type: "tool-call",
        toolCallId: "test-tool-call-id",
        toolName: "Unknown", // Will be detected from JSON
      };

      // Send JSON chunks as tool call deltas
      for (const chunk of chunks) {
        yield {
          type: "tool-call-delta",
          toolCallId: "test-tool-call-id",
          argsTextDelta: chunk,
        };
      }

      // Finish
      yield {
        type: "finish",
        finishReason: "tool-calls",
      };
    },
  };
}

describe("Backward compatibility", () => {
  test("should work with incremental parser disabled", async () => {
    const mockStream = createMockToolCallStream(['{"name":"Read"}']);

    const events = [];
    const stream = createAnthropicStream(mockStream, {
      useIncrementalParser: false, // Disable new feature
    });

    for await (const event of stream) {
      events.push(event);
    }

    // Should still work with old behavior
    expect(events.length).toBeGreaterThan(0);
    const deltaEvents = events.filter(
      (e) => e.type === "content_block_delta" && e.delta?.partial_json
    );
    expect(deltaEvents.length).toBeGreaterThan(0);
  });

  test("should default to enabled when option not specified", async () => {
    const mockStream = createMockToolCallStream(['{"name":"Write"}']);

    const events = [];
    const stream = createAnthropicStream(mockStream); // No options

    for await (const event of stream) {
      events.push(event);
    }

    // Should use new incremental parser by default
    expect(events.length).toBeGreaterThan(0);
  });
});
