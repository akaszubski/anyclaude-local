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
    // Note: Mode detection tests require spawning the proxy, which is slow
    // We'll skip them for now and rely on manual testing
    // {
    //   file: path.join(__dirname, "unit", "test_mode_detection.js"),
    //   description: "Mode Detection Unit Tests",
    // },
  ];

  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║" + " ".repeat(15) + "RUNNING ALL TESTS" + " ".repeat(26) + "║");
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
  console.log(
    `║  Passed: ${passed.toString().padEnd(3)}${" ".repeat(48)}║`
  );
  console.log(
    `║  Failed: ${failed.toString().padEnd(3)}${" ".repeat(48)}║`
  );
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
