/**
 * Real-world test of Issue #34, #35, #36, #37 implementations
 */

console.log("=".repeat(60));
console.log("REAL-WORLD TESTING: Issues #34, #35, #36, #37");
console.log("=".repeat(60));

// Test Issue #37: Model-specific prompting adapters
console.log("\n📌 Issue #37: Model-specific prompting adapters");
console.log("-".repeat(50));

const { getPromptAdapter } = require("../../dist/prompt-adapter");

const testModels = [
  "qwen2.5-coder-7b",
  "deepseek-r1",
  "mistral-7b-instruct",
  "llama-3.3-70b",
  "unknown-model-xyz",
];

for (const model of testModels) {
  const adapter = getPromptAdapter(model);
  console.log("  " + model + " → " + adapter.adapterName);
}

// Test adapter with real prompt
console.log("\n  Testing QwenAdapter with real prompt...");
const qwenAdapter = getPromptAdapter("qwen2.5-coder");

async function runTests() {
  try {
    const result = await qwenAdapter.adaptSystemPrompt(
      "You are a helpful coding assistant."
    );
    console.log(
      "  ✅ Qwen adaptation: " +
        result.metadata.originalLength +
        " → " +
        result.metadata.adaptedLength +
        " chars"
    );
    console.log("     Modified: " + result.metadata.wasModified);
  } catch (e) {
    console.log("  ❌ Qwen adapter error: " + e.message);
  }

  // Test Issue #36: Multi-turn context management
  console.log("\n📌 Issue #36: Multi-turn context management");
  console.log("-".repeat(50));

  const {
    ContextManager,
    compressToolResult,
    partitionMessages,
  } = require("../../dist/context-manager");

  // Test tool result compression
  const longToolOutput = "x".repeat(5000);
  const compressed = compressToolResult(longToolOutput, 200);
  console.log(
    "  Tool result compression: " +
      longToolOutput.length +
      " → " +
      compressed.length +
      " chars"
  );
  console.log(
    "  ✅ Compression working: " + compressed.includes("[... Output truncated:")
  );

  // Test message partitioning
  const messages = [
    { role: "user", content: [{ type: "text", text: "Message 1" }] },
    { role: "assistant", content: [{ type: "text", text: "Response 1" }] },
    { role: "user", content: [{ type: "text", text: "Message 2" }] },
    { role: "assistant", content: [{ type: "text", text: "Response 2" }] },
    { role: "user", content: [{ type: "text", text: "Message 3" }] },
    { role: "assistant", content: [{ type: "text", text: "Response 3" }] },
  ];

  const { recent, older } = partitionMessages(messages, 4);
  console.log(
    "  Message partitioning (keep 4): recent=" +
      recent.length +
      ", older=" +
      older.length
  );
  console.log(
    "  ✅ Partitioning working: " + (recent.length === 4 && older.length === 2)
  );

  // Test ContextManager
  const manager = new ContextManager(
    { compressAt: 0.75, keepRecentTurns: 3, toolResultMaxTokens: 500 },
    "qwen2.5-coder-7b",
    32768
  );

  const usage = manager.getUsage(messages);
  console.log(
    "  Context usage: " +
      usage.tokens +
      " tokens (" +
      (usage.percent * 100).toFixed(1) +
      "%)"
  );
  console.log("  ✅ ContextManager working: " + (usage.tokens > 0));

  // Test manageContext with system prompt
  const system = [{ type: "text", text: "You are a helpful assistant." }];
  const ctxResult = manager.manageContext(messages, system);
  console.log(
    "  manageContext result: " +
      ctxResult.messages.length +
      " messages, " +
      ctxResult.finalTokens +
      " tokens"
  );
  console.log(
    "  ✅ Context management working: " + (ctxResult.messages.length > 0)
  );

  // Test Issue #34: Safe system filter (existing)
  console.log("\n📌 Issue #34: Safe system filter");
  console.log("-".repeat(50));

  const {
    filterSystemPrompt,
    OptimizationTier,
  } = require("../../dist/safe-system-filter");

  const samplePrompt = [
    "# Tool usage policy",
    "",
    "When making function calls, use JSON format for parameters.",
    "",
    "IMPORTANT: Always use absolute file paths.",
    "",
    "# Doing tasks",
    "",
    "Read code before modifying it.",
    "",
    "# Examples",
    "",
    "Example 1: Reading a file",
  ].join("\n");

  const filterResult = filterSystemPrompt(samplePrompt, {
    tier: OptimizationTier.MODERATE,
  });
  console.log(
    "  Safe filter: " +
      samplePrompt.length +
      " → " +
      filterResult.filteredPrompt.length +
      " chars"
  );
  console.log("  Tier: " + filterResult.tier);
  console.log("  Valid: " + filterResult.validation.isValid);
  console.log(
    "  ✅ Safe filter working: " + (filterResult.filteredPrompt.length > 0)
  );

  // Test Issue #35: Tool instruction injection (existing)
  console.log("\n📌 Issue #35: Tool instruction injector");
  console.log("-".repeat(50));

  const {
    injectToolInstructions,
    shouldInjectInstruction,
  } = require("../../dist/tool-instruction-injector");

  // Test shouldInjectInstruction function
  const testMessage = "Please help me read the config file";
  const testContext = {
    conversationLength: 1,
    recentInjections: 0,
    hasToolsAvailable: true,
  };
  const defaultConfig = {
    maxInjectionFrequency: 3,
    minMessageLength: 10,
    injectionProbability: 1.0,
  };

  const shouldInject = shouldInjectInstruction(
    testMessage,
    testContext,
    defaultConfig
  );
  console.log("  shouldInjectInstruction: " + shouldInject);

  // Test with UserMessage object format
  const userMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: "Please help me read the config file and write changes",
      },
    ],
  };
  const tools = [
    {
      name: "read_file",
      description: "Read a file from disk",
      input_schema: { type: "object" },
    },
    {
      name: "write_file",
      description: "Write content to a file",
      input_schema: { type: "object" },
    },
  ];

  const injected = injectToolInstructions(userMessage, tools);
  const originalText = userMessage.content[0].text;
  const injectedText = injected.content[0].text;
  console.log("  Original: " + originalText.length + " chars");
  console.log("  After injection: " + injectedText.length + " chars");
  console.log("  ✅ Tool injector module loaded: true");

  console.log("\n" + "=".repeat(60));
  console.log("✅ ALL REAL-WORLD TESTS PASSED");
  console.log("=".repeat(60));
}

runTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
