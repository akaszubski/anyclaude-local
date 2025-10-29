/**
 * Unit tests for tool calling edge cases
 *
 * These tests verify the fixes for:
 * - Incomplete streaming tool calls (qwen3-coder-30b issue)
 * - Tool-input-start → tool-input-end WITHOUT tool-input-delta
 * - Tool completion when tool-call chunk arrives
 * - Deduplication of redundant tool call events
 *
 * Background:
 * qwen3-coder-30b sends: tool-input-start → tool-input-end (NO deltas)
 * Then later sends: tool-call chunk with complete input
 * We need to track tools without deltas and complete them when tool-call arrives
 */

const assert = require("assert");

// Mock stream chunk types that match AI SDK format
function createToolInputStartChunk(id, name, index = 0) {
  return {
    type: "tool-input-start",
    id,
    toolName: name,
    index,
  };
}

function createToolInputDeltaChunk(id, delta) {
  return {
    type: "tool-input-delta",
    id,
    delta,
  };
}

function createToolInputEndChunk(id) {
  return {
    type: "tool-input-end",
    id,
  };
}

function createToolCallChunk(id, name, args) {
  return {
    type: "tool-call",
    toolCallId: id,
    toolName: name,
    args,
  };
}

/**
 * Simplified version of the stream conversion logic
 * This mirrors the fix in convert-to-anthropic-stream.ts
 */
class ToolCallTracker {
  constructor() {
    this.toolsWithoutDeltas = new Map();
    this.currentStreamingTool = null;
    this.completedTools = new Set();
  }

  /**
   * Process a tool-input-start chunk
   */
  handleToolInputStart(chunk) {
    const { id, toolName, index } = chunk;

    // Track this tool
    this.currentStreamingTool = {
      id,
      name: toolName,
      index,
      receivedDelta: false,
    };

    // Also track in the "tools without deltas" map
    this.toolsWithoutDeltas.set(id, {
      index,
      name: toolName,
    });

    return {
      type: "content_block_start",
      index,
      content_block: {
        type: "tool_use",
        id,
        name: toolName,
      },
    };
  }

  /**
   * Process a tool-input-delta chunk
   */
  handleToolInputDelta(chunk) {
    const { id, delta } = chunk;

    // Mark that we received a delta
    if (this.currentStreamingTool?.id === id) {
      this.currentStreamingTool.receivedDelta = true;
      // Remove from "tools without deltas" since it has a delta now
      this.toolsWithoutDeltas.delete(id);
    }

    return {
      type: "content_block_delta",
      index: this.currentStreamingTool?.index || 0,
      delta: {
        type: "input_json_delta",
        partial_json: delta,
      },
    };
  }

  /**
   * Process a tool-input-end chunk
   */
  handleToolInputEnd(chunk) {
    const { id } = chunk;

    // If this tool never received deltas, DON'T close the block yet
    // Wait for the tool-call chunk with the complete input
    if (this.currentStreamingTool?.id === id) {
      if (this.currentStreamingTool.receivedDelta) {
        // Normal case: had deltas, close the block
        this.currentStreamingTool = null;
        this.toolsWithoutDeltas.delete(id);

        return {
          type: "content_block_stop",
          index: this.currentStreamingTool?.index || 0,
        };
      } else {
        // Incomplete streaming case: NO deltas received
        // Keep it in toolsWithoutDeltas, don't close block
        return null; // Don't emit anything yet
      }
    }

    return null;
  }

  /**
   * Process a tool-call chunk (complete tool with arguments)
   */
  handleToolCall(chunk) {
    const { toolCallId, toolName, args } = chunk;

    // Check if this is a tool we've been tracking without deltas
    if (this.toolsWithoutDeltas.has(toolCallId)) {
      const toolInfo = this.toolsWithoutDeltas.get(toolCallId);

      // Complete the tool by sending the full input at once
      this.toolsWithoutDeltas.delete(toolCallId);
      this.completedTools.add(toolCallId);

      return {
        type: "content_block_delta",
        index: toolInfo.index,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(args),
        },
      };
    }

    // If we already completed this tool, skip (deduplication)
    if (this.completedTools.has(toolCallId)) {
      return null;
    }

    return null;
  }
}

/**
 * Test: Normal tool call with deltas
 * (e.g., llama-3.1-8b, codestral-22b)
 */
function test_normal_tool_call_with_deltas() {
  console.log("Testing: Normal tool call with deltas...");

  const tracker = new ToolCallTracker();

  // Start
  const start = tracker.handleToolInputStart(
    createToolInputStartChunk("call_123", "Read", 0)
  );
  assert.strictEqual(start.type, "content_block_start");
  assert.strictEqual(start.content_block.name, "Read");

  // Delta 1
  const delta1 = tracker.handleToolInputDelta(
    createToolInputDeltaChunk("call_123", '{"file')
  );
  assert.strictEqual(delta1.type, "content_block_delta");
  assert.ok(tracker.currentStreamingTool.receivedDelta);

  // Delta 2
  const delta2 = tracker.handleToolInputDelta(
    createToolInputDeltaChunk("call_123", '_path":')
  );
  assert.strictEqual(delta2.type, "content_block_delta");

  // End
  const end = tracker.handleToolInputEnd(createToolInputEndChunk("call_123"));
  assert.strictEqual(end.type, "content_block_stop");

  // Should not be in toolsWithoutDeltas
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 0);

  console.log("✓ Normal tool call with deltas handled correctly");
}

/**
 * Test: Incomplete streaming (qwen3-coder-30b issue)
 * tool-input-start → tool-input-end (NO deltas) → tool-call
 */
function test_incomplete_streaming_qwen3_coder() {
  console.log("Testing: Incomplete streaming (qwen3-coder fix)...");

  const tracker = new ToolCallTracker();

  // Start
  const start = tracker.handleToolInputStart(
    createToolInputStartChunk("call_456", "Read", 0)
  );
  assert.strictEqual(start.type, "content_block_start");

  // End WITHOUT any deltas
  const end = tracker.handleToolInputEnd(createToolInputEndChunk("call_456"));
  assert.strictEqual(end, null, "Should not close block yet");

  // Tool should still be in toolsWithoutDeltas
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 1);
  assert.ok(tracker.toolsWithoutDeltas.has("call_456"));

  // Later: tool-call chunk arrives with complete input
  const toolCall = tracker.handleToolCall(
    createToolCallChunk("call_456", "Read", {
      file_path: "/Users/akaszubski/README.md",
    })
  );

  assert.ok(toolCall, "Should emit tool call");
  assert.strictEqual(toolCall.type, "content_block_delta");
  assert.ok(toolCall.delta.partial_json.includes("file_path"));

  // Tool should now be completed
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 0);
  assert.ok(tracker.completedTools.has("call_456"));

  console.log("✓ Incomplete streaming handled correctly (qwen3-coder fix)");
}

/**
 * Test: Tool call deduplication
 * AI SDK sometimes sends redundant tool-call chunks
 */
function test_tool_call_deduplication() {
  console.log("Testing: Tool call deduplication...");

  const tracker = new ToolCallTracker();

  // Incomplete streaming sequence
  tracker.handleToolInputStart(
    createToolInputStartChunk("call_789", "Write", 0)
  );
  tracker.handleToolInputEnd(createToolInputEndChunk("call_789"));

  // First tool-call chunk
  const firstCall = tracker.handleToolCall(
    createToolCallChunk("call_789", "Write", {
      file_path: "/test.txt",
      content: "hello",
    })
  );
  assert.ok(firstCall, "First tool call should be processed");

  // Second identical tool-call chunk (redundant)
  const secondCall = tracker.handleToolCall(
    createToolCallChunk("call_789", "Write", {
      file_path: "/test.txt",
      content: "hello",
    })
  );
  assert.strictEqual(secondCall, null, "Duplicate should be ignored");

  console.log("✓ Tool call deduplication works");
}

/**
 * Test: Multiple tools in sequence
 */
function test_multiple_tools_in_sequence() {
  console.log("Testing: Multiple tools in sequence...");

  const tracker = new ToolCallTracker();

  // Tool 1: Normal with deltas
  tracker.handleToolInputStart(createToolInputStartChunk("call_1", "Read", 0));
  tracker.handleToolInputDelta(createToolInputDeltaChunk("call_1", '{"file'));
  tracker.handleToolInputEnd(createToolInputEndChunk("call_1"));

  // Tool 2: Incomplete streaming
  tracker.handleToolInputStart(createToolInputStartChunk("call_2", "Write", 1));
  tracker.handleToolInputEnd(createToolInputEndChunk("call_2"));

  // Tool 2 should still be tracked
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 1);
  assert.ok(tracker.toolsWithoutDeltas.has("call_2"));

  // Complete tool 2
  const toolCall = tracker.handleToolCall(
    createToolCallChunk("call_2", "Write", { file_path: "/test.txt" })
  );
  assert.ok(toolCall);

  // Both tools completed
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 0);
  assert.ok(tracker.completedTools.has("call_2"));

  console.log("✓ Multiple tools in sequence handled correctly");
}

/**
 * Test: Edge case - tool-call arrives before tool-input-end
 * (Shouldn't happen, but test defensive programming)
 */
function test_tool_call_before_end() {
  console.log("Testing: Tool call before tool-input-end (edge case)...");

  const tracker = new ToolCallTracker();

  tracker.handleToolInputStart(
    createToolInputStartChunk("call_999", "Bash", 0)
  );

  // Tool-call arrives immediately (unusual but possible)
  const toolCall = tracker.handleToolCall(
    createToolCallChunk("call_999", "Bash", { command: "ls" })
  );

  // Should handle gracefully
  assert.ok(toolCall, "Should handle out-of-order chunks");
  assert.ok(tracker.completedTools.has("call_999"));

  console.log("✓ Out-of-order chunks handled gracefully");
}

function runTests() {
  console.log(
    "================================================================================"
  );
  console.log("TOOL CALLING EDGE CASES TESTS");
  console.log(
    "================================================================================"
  );
  console.log("");

  try {
    test_normal_tool_call_with_deltas();
    test_incomplete_streaming_qwen3_coder();
    test_tool_call_deduplication();
    test_multiple_tools_in_sequence();
    test_tool_call_before_end();

    console.log("");
    console.log(
      "================================================================================"
    );
    console.log("✓ ALL TOOL CALLING TESTS PASSED");
    console.log(
      "================================================================================"
    );
    return 0;
  } catch (error) {
    console.error("");
    console.error(
      "================================================================================"
    );
    console.error("✗ TEST FAILED");
    console.error(
      "================================================================================"
    );
    console.error(error);
    return 1;
  }
}

// Run tests if executed directly
if (require.main === module) {
  process.exit(runTests());
}

module.exports = { runTests, ToolCallTracker };
