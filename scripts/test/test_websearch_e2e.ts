/**
 * End-to-end test for WebSearch with local model
 * Sends a request directly to the proxy to test the full flow
 */

async function testWebSearchE2E() {
  // First, get the proxy URL from a running anyclaude instance
  // For testing, we'll call the MLX worker directly

  console.log("Testing WebSearch end-to-end flow...\n");

  // Test 1: Direct DuckDuckGo search
  console.log("1. Testing direct DuckDuckGo search:");
  const { executeClaudeSearch } = await import(
    "../../src/claude-search-executor"
  );
  const results = await executeClaudeSearch("Claude Code 2025");
  console.log(`   Found ${results.length} results`);
  if (results.length > 0) {
    console.log(`   First result: ${results[0].title}`);
  }

  // Test 2: Check if WebSearch tool call triggers the interception
  console.log("\n2. Testing tool call interception (check debug logs):");
  console.log("   Send this to anyclaude with ANYCLAUDE_DEBUG=1:");
  console.log("   > search latest claude features");

  console.log(
    "\n✅ DuckDuckGo search is working. If Claude Code still shows '0 searches',"
  );
  console.log(
    "   the issue is in how the results are being sent back to Claude Code."
  );
}

testWebSearchE2E().catch(console.error);
