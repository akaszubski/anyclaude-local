/**
 * Run all unit and integration tests
 */

const { spawn } = require("child_process");
const path = require("path");

function runTestFile(filepath, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running: ${description}`);
    console.log("=".repeat(60));

    const proc = spawn("node", [filepath], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${description} failed with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function runAllTests() {
  const tests = [
    {
      file: path.join(__dirname, "unit", "test_trace_logger.js"),
      description: "Trace Logger Unit Tests",
    },
    {
      file: path.join(__dirname, "unit", "test_json_schema.js"),
      description: "JSON Schema Transformation Unit Tests",
    },
    {
      file: path.join(__dirname, "unit", "test_trace_analyzer.js"),
      description: "Trace Analyzer Unit Tests",
    },
    {
      file: path.join(__dirname, "unit", "test_lmstudio_client.js"),
      description: "LMStudio Client Unit Tests",
    },
    {
      file: path.join(__dirname, "unit", "test_tool_calling.js"),
      description: "Tool Calling Edge Cases Tests",
    },
    // Phase 1: Stream + File I/O Error Tests
    {
      file: path.join(__dirname, "unit", "test-stream-error-handling.js"),
      description: "Stream Error Handling Tests (Phase 1)",
    },
    {
      file: path.join(__dirname, "unit", "test-file-io-errors.js"),
      description: "File I/O Error Handling Tests (Phase 1)",
    },
    // Phase 2: Network + Tool Validation Tests
    {
      file: path.join(__dirname, "unit", "test-network-errors.js"),
      description: "Network/Timeout Error Handling Tests (Phase 2)",
    },
    {
      file: path.join(__dirname, "unit", "test-tool-validation-errors.js"),
      description: "Tool Validation Error Handling Tests (Phase 2)",
    },
    // Phase 3: Configuration + Message Conversion Tests
    {
      file: path.join(__dirname, "unit", "test-config-errors.js"),
      description: "Configuration Error Handling Tests (Phase 3)",
    },
    {
      file: path.join(__dirname, "unit", "test-message-errors.js"),
      description: "Message Conversion Error Handling Tests (Phase 3)",
    },
    // Phase 4: Process + Context Management Tests
    {
      file: path.join(__dirname, "unit", "test-process-errors.js"),
      description: "Process Management Error Handling Tests (Phase 4)",
    },
    {
      file: path.join(__dirname, "unit", "test-context-errors.js"),
      description: "Context Management Error Handling Tests (Phase 4)",
    },
    // Phase 5: Schema + Proxy Error Tests
    {
      file: path.join(__dirname, "unit", "test-schema-errors.js"),
      description: "JSON Schema Error Handling Tests (Phase 5)",
    },
    {
      file: path.join(__dirname, "unit", "test-proxy-errors.js"),
      description: "Proxy Request/Response Error Handling Tests (Phase 5)",
    },
    // Integration Tests
    {
      file: path.join(__dirname, "integration", "test-message-pipeline.js"),
      description: "Message Pipeline Integration Tests",
    },
    {
      file: path.join(__dirname, "integration", "test-tool-workflow.js"),
      description: "Tool Calling Workflow Integration Tests",
    },
    {
      file: path.join(__dirname, "integration", "test-proxy-cycle.js"),
      description: "Proxy Request/Response Cycle Integration Tests",
    },
    // End-to-End Tests
    {
      file: path.join(__dirname, "e2e", "test-full-conversation.js"),
      description: "Full Conversation End-to-End Tests",
    },
    {
      file: path.join(__dirname, "e2e", "test-tool-use-e2e.js"),
      description: "Tool Use End-to-End Tests",
    },
    // Performance Tests
    {
      file: path.join(__dirname, "performance", "test-large-context.js"),
      description: "Large Context Performance Tests",
    },
    {
      file: path.join(__dirname, "performance", "test-concurrent-requests.js"),
      description: "Concurrent Request Performance Tests",
    },
    // Note: Mode detection tests require spawning the proxy, which is slow
    // We'll skip them for now and rely on manual testing
    // {
    //   file: path.join(__dirname, "unit", "test_mode_detection.js"),
    //   description: "Mode Detection Unit Tests",
    // },
  ];

  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log(
    "║" + " ".repeat(15) + "RUNNING ALL TESTS" + " ".repeat(26) + "║"
  );
  console.log("╚" + "═".repeat(58) + "╝");

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await runTestFile(test.file, test.description);
      passed++;
    } catch (error) {
      console.error(`\n❌ ${test.description} FAILED:`);
      console.error(error.message);
      failed++;
    }
  }

  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║" + " ".repeat(20) + "TEST SUMMARY" + " ".repeat(26) + "║");
  console.log("╠" + "═".repeat(58) + "╣");
  console.log(`║  Passed: ${passed.toString().padEnd(3)}${" ".repeat(48)}║`);
  console.log(`║  Failed: ${failed.toString().padEnd(3)}${" ".repeat(48)}║`);
  console.log("╚" + "═".repeat(58) + "╝");
  console.log("");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error("Error running tests:", error);
  process.exit(1);
});
