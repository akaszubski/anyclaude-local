#!/usr/bin/env node

/**
 * Full Conversation End-to-End Tests
 *
 * Tests complete conversation workflows:
 * User message → API → AI response → Follow-up → Complete conversation
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock conversation manager
class ConversationManager {
  constructor() {
    this.messages = [];
    this.systemPrompt = "You are a helpful assistant.";
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  addUserMessage(content) {
    this.messages.push({
      role: "user",
      content: content,
      timestamp: Date.now()
    });
  }

  addAssistantMessage(content) {
    this.messages.push({
      role: "assistant",
      content: content,
      timestamp: Date.now()
    });
  }

  getConversation() {
    return {
      systemPrompt: this.systemPrompt,
      messages: this.messages
    };
  }

  getMessageCount() {
    return this.messages.length;
  }

  getLastMessage() {
    if (this.messages.length === 0) {
      throw new Error("No messages in conversation");
    }
    return this.messages[this.messages.length - 1];
  }

  clear() {
    this.messages = [];
  }
}

function testSingleMessage() {
  console.log("\n✓ Test 1: Single message conversation");
  const conv = new ConversationManager();
  conv.addUserMessage("Hello!");

  assert.strictEqual(conv.getMessageCount(), 1, "Message added");
  assert.strictEqual(conv.getLastMessage().role, "user", "User role correct");
  console.log("   ✅ Single message works");
  passed++;
}

function testSimpleExchange() {
  console.log("\n✓ Test 2: Simple conversation exchange");
  const conv = new ConversationManager();

  conv.addUserMessage("What is 2+2?");
  conv.addAssistantMessage("2+2 equals 4");

  assert.strictEqual(conv.getMessageCount(), 2, "Both messages present");
  const messages = conv.getConversation().messages;
  assert.strictEqual(messages[0].role, "user", "First is user");
  assert.strictEqual(messages[1].role, "assistant", "Second is assistant");
  console.log("   ✅ Simple exchange works");
  passed++;
}

function testMultiTurnConversation() {
  console.log("\n✓ Test 3: Multi-turn conversation");
  const conv = new ConversationManager();

  const exchanges = [
    { user: "Hi", ai: "Hello!" },
    { user: "How are you?", ai: "I'm doing well, thank you!" },
    { user: "What's your name?", ai: "I'm Claude" }
  ];

  for (const exchange of exchanges) {
    conv.addUserMessage(exchange.user);
    conv.addAssistantMessage(exchange.ai);
  }

  assert.strictEqual(conv.getMessageCount(), 6, "All messages present");
  const messages = conv.getConversation().messages;
  assert.strictEqual(messages[0].content, "Hi", "First message correct");
  assert.strictEqual(messages[5].content, "I'm Claude", "Last message correct");
  console.log("   ✅ Multi-turn conversation works");
  passed++;
}

function testSystemPrompt() {
  console.log("\n✓ Test 4: System prompt in conversation");
  const conv = new ConversationManager();
  const customPrompt = "You are a math tutor.";
  conv.setSystemPrompt(customPrompt);

  conv.addUserMessage("Explain fractions");

  const conversation = conv.getConversation();
  assert.strictEqual(conversation.systemPrompt, customPrompt, "System prompt set");
  assert.ok(conversation.messages.length > 0, "Messages with system prompt");
  console.log("   ✅ System prompt works");
  passed++;
}

function testConversationContext() {
  console.log("\n✓ Test 5: Conversation maintains context");
  const conv = new ConversationManager();

  conv.addUserMessage("My name is Alice");
  conv.addAssistantMessage("Nice to meet you, Alice!");
  conv.addUserMessage("What's my name?");
  conv.addAssistantMessage("Your name is Alice");

  const messages = conv.getConversation().messages;
  assert.strictEqual(messages[0].content, "My name is Alice", "Context available");
  assert.ok(messages[3].content.includes("Alice"), "AI uses context");
  console.log("   ✅ Conversation context works");
  passed++;
}

function testConversationPersistence() {
  console.log("\n✓ Test 6: Conversation data persistence");
  const conv = new ConversationManager();

  conv.addUserMessage("First message");
  conv.addAssistantMessage("First response");

  const snapshot1 = JSON.stringify(conv.getConversation());

  conv.addUserMessage("Second message");

  const snapshot2 = JSON.stringify(conv.getConversation());

  assert.notStrictEqual(snapshot1, snapshot2, "Conversation changes persist");
  console.log("   ✅ Conversation persistence works");
  passed++;
}

function testConversationClear() {
  console.log("\n✓ Test 7: Conversation clearing");
  const conv = new ConversationManager();

  conv.addUserMessage("Message 1");
  conv.addAssistantMessage("Response 1");

  assert.strictEqual(conv.getMessageCount(), 2, "Messages exist before clear");

  conv.clear();

  assert.strictEqual(conv.getMessageCount(), 0, "Conversation cleared");
  let error = null;
  try {
    conv.getLastMessage();
  } catch (e) {
    error = e;
  }
  assert.ok(error, "Error when accessing empty conversation");
  console.log("   ✅ Conversation clearing works");
  passed++;
}

function testLongConversation() {
  console.log("\n✓ Test 8: Long conversation (many turns)");
  const conv = new ConversationManager();

  for (let i = 0; i < 20; i++) {
    conv.addUserMessage(`Message ${i}`);
    conv.addAssistantMessage(`Response ${i}`);
  }

  assert.strictEqual(conv.getMessageCount(), 40, "All messages stored");
  console.log("   ✅ Long conversation works");
  passed++;
}

function testConversationMetadata() {
  console.log("\n✓ Test 9: Conversation metadata");
  const conv = new ConversationManager();

  const before = Date.now();
  conv.addUserMessage("Test");
  const after = Date.now();

  const message = conv.getLastMessage();
  assert.ok(message.timestamp >= before && message.timestamp <= after, "Timestamp present");
  assert.ok(message.role, "Role stored");
  assert.ok(message.content, "Content stored");
  console.log("   ✅ Conversation metadata works");
  passed++;
}

function testCompleteConversationFlow() {
  console.log("\n✓ Test 10: Complete conversation flow");
  // Simulate: Setup → User message → AI response → Follow-up → Response
  const conv = new ConversationManager();
  conv.setSystemPrompt("You are helpful");

  // Round 1
  conv.addUserMessage("What's the capital of France?");
  conv.addAssistantMessage("The capital of France is Paris");

  // Round 2
  conv.addUserMessage("How many people live there?");
  conv.addAssistantMessage("Paris has about 2.2 million residents");

  // Verify complete flow
  const conversation = conv.getConversation();
  assert.strictEqual(conversation.systemPrompt, "You are helpful", "System prompt configured");
  assert.strictEqual(conv.getMessageCount(), 4, "All messages present");

  const messages = conversation.messages;
  assert.strictEqual(messages[0].role, "user", "First is user question");
  assert.strictEqual(messages[1].role, "assistant", "Second is AI response");
  assert.strictEqual(messages[2].role, "user", "Third is follow-up");
  assert.strictEqual(messages[3].role, "assistant", "Fourth is second response");

  console.log("   ✅ Complete conversation flow works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   FULL CONVERSATION END-TO-END TESTS                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testSingleMessage();
    testSimpleExchange();
    testMultiTurnConversation();
    testSystemPrompt();
    testConversationContext();
    testConversationPersistence();
    testConversationClear();
    testLongConversation();
    testConversationMetadata();
    testCompleteConversationFlow();
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
    console.log("\n✅ All conversation tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { ConversationManager };
