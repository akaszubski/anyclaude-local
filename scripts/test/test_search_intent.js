const {
  detectSearchIntent,
  executeProactiveSearch,
} = require("../../dist/server-side-tool-handler.js");

console.log("=== Search Intent Detection ===");
const testMessages = [
  "What is the latest documentation about Claude Code LSP?",
  "what is the latest version of Claude Code?",
  "look up how to configure anyclaude",
  "fix the bug in this code",
  "how does LSP work?",
  "current weather in NYC",
];

for (const msg of testMessages) {
  const result = detectSearchIntent(msg);
  console.log(
    (result ? "✓" : "✗") + ' "' + msg.substring(0, 50) + '..." -> ' + result
  );
}

console.log("\n=== Internal Message Filtering ===");
const internalMessages = [
  "[SUGGESTION MODE: suggest what user might type]",
  "write a 5-10 word title for the conversation",
  "<system-reminder>Something here</system-reminder>",
  "Perform a web search for: Claude Code",
  "What is the latest news about AI?", // Should NOT be filtered
];

async function testInternal() {
  for (const msg of internalMessages) {
    const result = await executeProactiveSearch(msg, true, "local");
    const wasFiltered = result === null;
    console.log(
      (wasFiltered ? "✗ (filtered)" : "✓ (allowed)") +
        ' "' +
        msg.substring(0, 40) +
        '..."'
    );
  }
}

testInternal();
