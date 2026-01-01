#!/usr/bin/env node

/**
 * Test runner for safe-system-filter.test.ts
 * Handles TDD red phase where implementation doesn't exist yet
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("\n=== Safe System Filter Tests (TDD RED Phase) ===\n");

// Check if implementation exists
const implPath = path.resolve(__dirname, "../../dist/safe-system-filter.js");
const implExists = fs.existsSync(implPath);

if (!implExists) {
  console.log("⚠️  Implementation not found (expected in TDD RED phase)");
  console.log("   Expected: " + implPath);
  console.log("   Tests will fail - this is correct for TDD red phase!\n");
}

try {
  // Try to run the TypeScript tests
  console.log("Building test file...\n");
  execSync(
    "npx tsc tests/unit/safe-system-filter.test.ts --outDir tests/unit/compiled --module commonjs --target ES2020 --skipLibCheck --esModuleInterop",
    { stdio: "pipe" }
  );

  console.log("✓ Test file compiled\n");
  console.log("Running tests with Jest...\n");

  // Run with Jest
  execSync("npx jest tests/unit/safe-system-filter.test.ts --verbose", {
    stdio: "inherit",
  });
} catch (error) {
  if (!implExists) {
    console.log("\n✅ Tests failed as expected (TDD RED phase)");
    console.log("   Implementation needed: src/safe-system-filter.ts");
    console.log("\nNext step: Run code-agent to implement the module");
    process.exit(0); // Expected failure in red phase
  } else {
    console.error("\n❌ Tests failed unexpectedly");
    process.exit(1);
  }
}

// Clean up compiled test
const compiledPath = path.resolve(__dirname, "compiled");
if (fs.existsSync(compiledPath)) {
  fs.rmSync(compiledPath, { recursive: true });
}
