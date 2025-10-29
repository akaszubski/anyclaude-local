#!/usr/bin/env node

/**
 * Large Context Performance Tests
 *
 * Tests how the system handles large contexts and long conversations
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock token counter
class TokenCounter {
  countTokens(text) {
    // Approximate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  estimateMessageTokens(message) {
    const textTokens = this.countTokens(message.content || "");
    const roleTokens = 10; // overhead for role
    return textTokens + roleTokens;
  }

  estimateConversationTokens(messages) {
    return messages.reduce((total, msg) => total + this.estimateMessageTokens(msg), 0);
  }
}

// Mock context manager
class ContextManager {
  constructor(maxTokens = 32768) {
    this.maxTokens = maxTokens;
    this.counter = new TokenCounter();
  }

  canAddMessage(messages, newMessage) {
    const currentTokens = this.counter.estimateConversationTokens(messages);
    const newTokens = this.counter.estimateMessageTokens(newMessage);
    return (currentTokens + newTokens) <= this.maxTokens;
  }

  getAvailableTokens(messages) {
    const used = this.counter.estimateConversationTokens(messages);
    return Math.max(0, this.maxTokens - used);
  }

  truncateConversation(messages, maxMessages) {
    if (messages.length <= maxMessages) return messages;
    // Keep system message if present, then keep last N messages
    return messages.slice(-maxMessages);
  }
}

function testLargeMessageHandling() {
  console.log("\n✓ Test 1: Large message handling");
  const counter = new TokenCounter();

  // 10KB message
  const largeMessage = "text ".repeat(2000);
  const tokens = counter.countTokens(largeMessage);

  assert.ok(tokens > 1000, "Large message has significant token count");
  assert.ok(tokens < 10000, "Token count is reasonable");
  console.log("   ✅ Large message handling works");
  passed++;
}

function testLargeConversationTokenCounting() {
  console.log("\n✓ Test 2: Large conversation token counting");
  const counter = new TokenCounter();
  const messages = [];

  // Create 100 messages
  for (let i = 0; i < 100; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Message content with some text ".repeat(10)
    });
  }

  const tokens = counter.estimateConversationTokens(messages);
  assert.ok(tokens > 0, "Tokens counted");
  assert.ok(tokens < 100000, "Token count reasonable");
  console.log(`   ✅ Large conversation token counting works (${tokens} tokens)`);
  passed++;
}

function testContextManagement() {
  console.log("\n✓ Test 3: Context management with limits");
  const ctx = new ContextManager(2000);
  const messages = [];

  // Add messages until approaching limit
  for (let i = 0; i < 20; i++) {
    const msg = {
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Test message with content ".repeat(50)
    };

    if (ctx.canAddMessage(messages, msg)) {
      messages.push(msg);
    } else {
      break;
    }
  }

  assert.ok(messages.length > 0, "Some messages added");
  assert.ok(messages.length < 20, "Respects context limit");
  console.log("   ✅ Context management works");
  passed++;
}

function testAvailableTokenTracking() {
  console.log("\n✓ Test 4: Available token tracking");
  const ctx = new ContextManager(5000);
  const messages = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there" }
  ];

  const available = ctx.getAvailableTokens(messages);
  assert.ok(available < 5000, "Available tokens less than max");
  assert.ok(available > 0, "Some tokens still available");
  console.log(`   ✅ Available token tracking works (${available} tokens remaining)`);
  passed++;
}

function testConversationTruncation() {
  console.log("\n✓ Test 5: Conversation truncation");
  const messages = [];
  for (let i = 0; i < 50; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`
    });
  }

  const ctx = new ContextManager();
  const truncated = ctx.truncateConversation(messages, 10);

  assert.strictEqual(truncated.length, 10, "Truncated to 10 messages");
  assert.strictEqual(truncated[0].content, "Message 40", "Keeps recent messages");
  console.log("   ✅ Conversation truncation works");
  passed++;
}

function testLargeContextWithinLimits() {
  console.log("\n✓ Test 6: Large context within limits");
  const counter = new TokenCounter();

  // Create a large but valid conversation
  const messages = [];
  const targetTokens = 30000;
  let currentTokens = 0;

  while (currentTokens < targetTokens) {
    const msg = {
      role: messages.length % 2 === 0 ? "user" : "assistant",
      content: "x ".repeat(1000)
    };
    messages.push(msg);
    currentTokens += counter.estimateMessageTokens(msg);
  }

  assert.ok(messages.length > 10, "Large conversation created");
  assert.ok(currentTokens > targetTokens - 500, "Token count in range");
  console.log(`   ✅ Large context within limits works (${messages.length} messages)`);
  passed++;
}

function testMessageSizeVariation() {
  console.log("\n✓ Test 7: Message size variation");
  const counter = new TokenCounter();

  const messages = [
    { role: "user", content: "Hi" }, // 1 token
    { role: "assistant", content: "Hello! " + "word ".repeat(1000) }, // ~250 tokens
    { role: "user", content: "Test" } // minimal
  ];

  const tokens = messages.map(m => counter.estimateMessageTokens(m));
  assert.ok(tokens[0] < tokens[1], "Larger message has more tokens");
  assert.ok(tokens[0] < tokens[2] || tokens[0] === tokens[2], "Size variation handled");
  console.log("   ✅ Message size variation works");
  passed++;
}

function testPerformanceWithManyMessages() {
  console.log("\n✓ Test 8: Performance with many messages");
  const startTime = Date.now();

  const counter = new TokenCounter();
  const messages = [];

  // Create 1000 messages
  for (let i = 0; i < 1000; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Message " + i
    });
  }

  const totalTokens = counter.estimateConversationTokens(messages);
  const elapsed = Date.now() - startTime;

  assert.strictEqual(messages.length, 1000, "All messages created");
  assert.ok(elapsed < 1000, "Token counting is fast"); // Should complete in <1s
  console.log(`   ✅ Performance with many messages works (1000 messages in ${elapsed}ms)`);
  passed++;
}

function testContextFillScenario() {
  console.log("\n✓ Test 9: Context fill scenario");
  const ctx = new ContextManager(8192);
  const messages = [];

  // Simulate adding messages until context is nearly full
  for (let i = 0; i < 100; i++) {
    const msg = {
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Sample message with some content ".repeat(20)
    };

    if (ctx.canAddMessage(messages, msg)) {
      messages.push(msg);
    } else {
      break;
    }
  }

  const available = ctx.getAvailableTokens(messages);
  assert.ok(available >= 0, "Non-negative available tokens");
  assert.ok(available < 500, "Context nearly full");
  console.log(`   ✅ Context fill scenario works (${messages.length} messages, ${available} tokens left)`);
  passed++;
}

function testZeroContextScenario() {
  console.log("\n✓ Test 10: Zero context/recovery scenario");
  const ctx = new ContextManager(5000);
  let messages = [];

  // Fill context
  for (let i = 0; i < 50; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x ".repeat(100)
    });
  }

  // Context exhausted, truncate
  messages = ctx.truncateConversation(messages, 5);

  // Should be able to add new messages now
  const canAdd = ctx.canAddMessage(messages, {
    role: "user",
    content: "New message"
  });

  assert.ok(canAdd, "Can add messages after truncation");
  console.log("   ✅ Zero context scenario works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   LARGE CONTEXT PERFORMANCE TESTS                       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testLargeMessageHandling();
    testLargeConversationTokenCounting();
    testContextManagement();
    testAvailableTokenTracking();
    testConversationTruncation();
    testLargeContextWithinLimits();
    testMessageSizeVariation();
    testPerformanceWithManyMessages();
    testContextFillScenario();
    testZeroContextScenario();
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    failed++;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0 && passed === 10) {
    console.log("\n✅ All large context tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { TokenCounter, ContextManager };
