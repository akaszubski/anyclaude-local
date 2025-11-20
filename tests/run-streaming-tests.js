/**
 * Run streaming JSON parser tests
 */

// Load the simple test runner
require("./simple-test-runner.js");

// Load the test file
require("./unit/streaming-json-parser.test.js");

// Report results
const { reportResults } = require("./simple-test-runner.js");
reportResults();
