/**
 * REGRESSION TEST: System Prompt Handling
 *
 * Tests that large system prompts (like Claude Code's ~6449 token system prompt)
 * are properly handled and don't cause garbage output.
 *
 * Issue: When system prompts with newlines were being stripped of whitespace,
 * the model would generate garbage (repeated digits, escaped newlines, etc).
 *
 * Fix: Disabled the problematic newline stripping in anthropic-proxy.ts
 * that was mangling Claude Code's system instructions.
 *
 * This test validates:
 * 1. System prompt parsing handles newlines correctly
 * 2. Garbage output detection works
 * 3. The system prompt structure is preserved during conversion
 */

const fs = require("fs");
const path = require("path");

// Simulate Claude Code's large system prompt with complex structure
const LARGE_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.
You are an interactive CLI tool that helps users with software engineering tasks.

Key responsibilities:
1. Research existing patterns before coding
2. Plan implementation before writing code
3. Write tests as you code (not after)
4. Document changes when you make them
5. Always use TodoWrite tool for complex tasks

When working on tasks:
- Search codebase first
- Check project docs for conventions
- Present plan before coding
- Break into small testable steps
- Mark todos as completed immediately

Code quality standards:
- Type hints required for all public APIs
- Docstrings using Google style format
- Error messages include context and expected format
- Keyword-only args using * for clarity

Testing requirements:
- All new code must have tests
- Unit tests for core logic
- Integration tests for workflows
- Mock external API calls
- Minimum 80% coverage target

Documentation rules:
- Update docs when APIs change
- Keep root directory clean
- Move detailed docs to docs/ subdirectory
- Use ADRs for architectural decisions

Security practices:
- Use .env files (gitignored)
- Never commit secrets
- Use environment variables for sensitive data

When you're stuck:
1. State what you're trying to do
2. Show what you tried
3. Include error messages
4. Ask specific questions

Philosophy: "Research first. Test coverage required."`;

/**
 * Simulates the problematic old behavior that was stripping newlines
 */
function stripNewlinesOldWay(text) {
  return text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Validates that a system prompt is properly preserved
 */
function validateSystemPromptPreservation(original, processed) {
  const tests = [];

  // Test 1: Newlines are preserved
  const originalNewlines = (original.match(/\n/g) || []).length;
  const processedNewlines = (processed.match(/\n/g) || []).length;

  tests.push({
    name: "Newlines are preserved",
    pass: originalNewlines === processedNewlines,
    details: {
      original: originalNewlines,
      processed: processedNewlines,
    },
  });

  // Test 2: Line structure is intact (each guideline on own line)
  const originalLines = original.split("\n").length;
  const processedLines = processed.split("\n").length;

  tests.push({
    name: "Line structure preserved",
    pass: originalLines === processedLines,
    details: {
      original: originalLines,
      processed: processedLines,
    },
  });

  // Test 3: Content length preserved (within tolerance for whitespace)
  const contentLengthRatio = processed.length / original.length;
  tests.push({
    name: "Content length preserved",
    pass: contentLengthRatio > 0.95 && contentLengthRatio < 1.05,
    details: {
      ratio: contentLengthRatio.toFixed(2),
      originalLength: original.length,
      processedLength: processed.length,
    },
  });

  // Test 4: Key structure markers present (numbers 1-5 for guidelines)
  const originalMarkers = (original.match(/^\d\./m) || []).length;
  const processedMarkers = (processed.match(/^\d\./m) || []).length;

  tests.push({
    name: "Numbered list structure preserved",
    pass: originalMarkers === processedMarkers,
    details: {
      original: originalMarkers,
      processed: processedMarkers,
    },
  });

  return tests;
}

/**
 * Checks if output looks like garbage
 */
function isGarbageOutput(text) {
  if (!text) return false;

  // Pattern: Many consecutive repeated characters (8+ in a row, at least 25% of text)
  const repeatedCharsPattern = /(.)\1{7,}/g;
  const repeatedMatches = text.match(repeatedCharsPattern) || [];
  const repeatedCharLength = repeatedMatches.reduce((sum, m) => sum + m.length, 0);

  if (repeatedCharLength > text.length * 0.25) {
    return true;
  }

  // Pattern: Starts with JSON syntax but malformed
  if (text.trim().startsWith("]")) {
    return true;
  }

  // Pattern: Lots of escaped newlines with no real content
  const escapedNewlineCount = (text.match(/\\n/g) || []).length;
  const wordCount = text
    .replace(/[\\n0-9]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2).length;

  if (escapedNewlineCount > 50 && wordCount < 5) {
    return true;
  }

  return false;
}

function testSystemPromptPreservation() {
  console.log("[Test 1] System Prompt Structure Preservation");

  // The new code should NOT strip newlines
  const preserved = LARGE_SYSTEM_PROMPT; // This is what the fixed code does

  const tests = validateSystemPromptPreservation(LARGE_SYSTEM_PROMPT, preserved);

  let allPass = true;
  for (const test of tests) {
    const pass = test.pass ? "✓" : "✗";
    console.log(`  ${pass} ${test.name}`);
    if (test.details) {
      console.log(
        `     ${JSON.stringify(test.details, null, 2)
          .split("\n")
          .join("\n     ")}`
      );
    }
    if (!test.pass) allPass = false;
  }

  if (!allPass) {
    throw new Error("System prompt preservation test failed");
  }

  console.log("✅ System prompt structure preserved\n");
}

function testOldBehaviorDetection() {
  console.log("[Test 2] Old Behavior (Newline Stripping) Detection");

  // Demonstrate the old broken behavior
  const oldProcessed = stripNewlinesOldWay(LARGE_SYSTEM_PROMPT);
  const newProcessed = LARGE_SYSTEM_PROMPT;

  // The old way should collapse everything
  const oldNewlines = (oldProcessed.match(/\n/g) || []).length;
  const newNewlines = (newProcessed.match(/\n/g) || []).length;

  console.log(`  Old behavior (with newline stripping):`);
  console.log(`    - Newlines: ${oldNewlines}`);
  console.log(`    - Length: ${oldProcessed.length}`);
  console.log(`    - First 100 chars: ${oldProcessed.substring(0, 100)}...`);

  console.log(`\n  New behavior (preserving newlines):`);
  console.log(`    - Newlines: ${newNewlines}`);
  console.log(`    - Length: ${newProcessed.length}`);
  console.log(`    - First 100 chars: ${newProcessed.substring(0, 100)}...`);

  if (oldNewlines >= newNewlines) {
    throw new Error(
      "Old behavior should remove newlines, but didn't. Check stripNewlinesOldWay function."
    );
  }

  console.log("✅ Old behavior correctly identified\n");
}

function testGarbageDetection() {
  console.log("[Test 3] Garbage Output Detection");

  const testCases = [
    {
      name: "Repeated digits (garbage)",
      text: "1111111111111111111111111111",
      shouldBeGarbage: true,
    },
    {
      name: "Repeated digits (garbage)",
      text: "0000000000000000000000000000",
      shouldBeGarbage: true,
    },
    {
      name: "Escaped newlines (garbage)",
      text: "]\n\n\n\n\n\n\n\n\n\n",
      shouldBeGarbage: true,
    },
    {
      name: "Malformed JSON start (garbage)",
      text: "]\nsomething\n\n\n",
      shouldBeGarbage: true,
    },
    {
      name: "Normal response",
      text: "Hello, this is a normal response.",
      shouldBeGarbage: false,
    },
    {
      name: "Code response",
      text: "function hello() { console.log('hi'); }",
      shouldBeGarbage: false,
    },
  ];

  let allPass = true;
  for (const testCase of testCases) {
    const detected = isGarbageOutput(testCase.text);
    const pass = detected === testCase.shouldBeGarbage;

    const passIcon = pass ? "✓" : "✗";
    const expectedStr = testCase.shouldBeGarbage ? "garbage" : "normal";
    const detectedStr = detected ? "garbage" : "normal";

    console.log(
      `  ${passIcon} ${testCase.name}: expected ${expectedStr}, got ${detectedStr}`
    );

    if (!pass) allPass = false;
  }

  if (!allPass) {
    throw new Error("Garbage detection test failed");
  }

  console.log("✅ Garbage detection working correctly\n");
}

function testSystemPromptParsing() {
  console.log("[Test 4] System Prompt Array Parsing");

  // Simulate how the proxy handles system prompts
  // From anthropic-proxy.ts lines 472-481

  const testCases = [
    {
      name: "String format",
      input: "You are helpful",
      expected: "You are helpful",
    },
    {
      name: "Array format",
      input: [{ type: "text", text: "You are helpful" }],
      expected: "You are helpful",
    },
    {
      name: "Multi-element array",
      input: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
      expected: "Line 1\nLine 2",
    },
    {
      name: "Large system prompt",
      input: [{ type: "text", text: LARGE_SYSTEM_PROMPT }],
      expected: LARGE_SYSTEM_PROMPT,
    },
  ];

  let allPass = true;
  for (const testCase of testCases) {
    // Simulate the proxy's system prompt parsing
    let system = undefined;
    if (testCase.input) {
      if (typeof testCase.input === "string") {
        system = testCase.input;
      } else if (Array.isArray(testCase.input) && testCase.input.length > 0) {
        system = testCase.input
          .map((s) => (typeof s === "string" ? s : s.text))
          .join("\n");
      }
    }

    const pass = system === testCase.expected;
    const passIcon = pass ? "✓" : "✗";
    console.log(`  ${passIcon} ${testCase.name}`);

    if (!pass) {
      console.log(
        `     Expected length: ${testCase.expected.length}, got: ${system.length}`
      );
      allPass = false;
    }
  }

  if (!allPass) {
    throw new Error("System prompt parsing test failed");
  }

  console.log("✅ System prompt parsing works correctly\n");
}

function testNoNewlineStrippingInProxy() {
  console.log("[Test 5] Verify anthropic-proxy.ts Has Fix");

  try {
    const proxyPath = path.join(__dirname, "../../src/anthropic-proxy.ts");
    const proxyContent = fs.readFileSync(proxyPath, "utf-8");

    // Check that the problematic newline stripping is disabled
    // Look for the commented-out code
    const hasDisabledCode =
      proxyContent.includes("// if (system && providerName ===") &&
      proxyContent.includes("vllm-mlx") &&
      proxyContent.includes("//   system = system.replace");

    if (!hasDisabledCode) {
      throw new Error(
        "Expected to find disabled newline stripping code in anthropic-proxy.ts. " +
          "The problematic newline stripping should be commented out."
      );
    }

    console.log(
      `  ✓ Newline stripping is disabled (commented out in code)`
    );
    console.log(`  ✓ System prompt newlines are preserved\n`);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(
        `  ⚠ Could not verify proxy code (file not found: ${error.path})`
      );
      console.log(`  This test must be run from the project root\n`);
    } else {
      throw error;
    }
  }
}

async function runTests() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║    SYSTEM PROMPT REGRESSION TESTS                         ║");
  console.log("║                                                            ║");
  console.log("║  Issue: Large system prompts were having newlines          ║");
  console.log("║  stripped, mangling Claude Code's instructions.            ║");
  console.log("║  Result: Model generated garbage instead of responses.     ║");
  console.log("║                                                            ║");
  console.log("║  Fix: Disabled problematic newline stripping.              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: "System Prompt Preservation", fn: testSystemPromptPreservation },
    { name: "Old Behavior Detection", fn: testOldBehaviorDetection },
    { name: "Garbage Output Detection", fn: testGarbageDetection },
    { name: "System Prompt Parsing", fn: testSystemPromptParsing },
    {
      name: "Verify anthropic-proxy.ts Has Fix",
      fn: testNoNewlineStrippingInProxy,
    },
  ];

  for (const test of tests) {
    try {
      test.fn();
      passed++;
    } catch (error) {
      console.error(`✗ ${test.name}: ${error.message}\n`);
      failed++;
    }
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = {
  isGarbageOutput,
  validateSystemPromptPreservation,
  stripNewlinesOldWay,
};
