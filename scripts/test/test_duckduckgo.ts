/**
 * Test DuckDuckGo search functionality
 */

// Simple test - import and run
async function testDuckDuckGo() {
  const { executeClaudeSearch } = await import(
    "../../src/claude-search-executor"
  );

  console.log("Testing DuckDuckGo search...\n");

  try {
    const results = await executeClaudeSearch("Claude Code Anthropic 2025");

    console.log(`Found ${results.length} results:\n`);

    for (const result of results.slice(0, 5)) {
      console.log(`Title: ${result.title}`);
      console.log(`URL: ${result.url}`);
      if (result.snippet) {
        console.log(`Snippet: ${result.snippet}`);
      }
      console.log("---");
    }

    console.log("\n✅ DuckDuckGo search working!");
  } catch (error) {
    console.error("❌ Search failed:", error);
    process.exit(1);
  }
}

testDuckDuckGo();
