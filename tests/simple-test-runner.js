/**
 * Simple test runner that mimics Jest API
 * Used for running TDD tests without installing Jest
 */

const assert = require("assert");

// Global test state
let currentSuite = "";
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

// Jest-like globals
global.describe = function (suiteName, fn) {
  const previousSuite = currentSuite;
  currentSuite = currentSuite ? `${currentSuite} > ${suiteName}` : suiteName;
  console.log(`\n${currentSuite}`);
  fn();
  currentSuite = previousSuite;
};

global.test = function (testName, fn) {
  testsRun++;
  const fullName = currentSuite ? `${currentSuite} > ${testName}` : testName;

  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${testName}`);
  } catch (err) {
    testsFailed++;
    console.log(`  ✗ ${testName}`);
    failures.push({ name: fullName, error: err });
  }
};

// Jest-like expect API
function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(
        actual,
        expected,
        `Expected ${actual} to be ${expected}`
      );
    },
    toEqual(expected) {
      assert.deepStrictEqual(
        actual,
        expected,
        `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
      );
    },
    toContainEqual(expected) {
      const found = actual.some((item) => {
        try {
          assert.deepStrictEqual(item, expected);
          return true;
        } catch {
          return false;
        }
      });
      assert(
        found,
        `Expected array to contain ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
      );
    },
    toHaveLength(expected) {
      assert.strictEqual(
        actual.length,
        expected,
        `Expected length ${expected} but got ${actual.length}`
      );
    },
    toHaveProperty(key, value) {
      assert(key in actual, `Expected object to have property ${key}`);
      if (value !== undefined) {
        assert.strictEqual(
          actual[key],
          value,
          `Expected property ${key} to be ${value} but got ${actual[key]}`
        );
      }
    },
    toBeDefined() {
      assert(
        actual !== undefined,
        `Expected value to be defined but got undefined`
      );
    },
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const threshold = Math.pow(10, -precision);
      assert(
        diff < threshold,
        `Expected ${actual} to be close to ${expected} (precision ${precision})`
      );
    },
    toBeGreaterThan(expected) {
      assert(
        actual > expected,
        `Expected ${actual} to be greater than ${expected}`
      );
    },
    toBeLessThan(expected) {
      assert(
        actual < expected,
        `Expected ${actual} to be less than ${expected}`
      );
    },
    toBeGreaterThanOrEqual(expected) {
      assert(actual >= expected, `Expected ${actual} to be >= ${expected}`);
    },
    toThrow(expected) {
      assert.throws(actual, expected || Error);
    },
    toContain(expected) {
      if (typeof actual === "string") {
        assert(
          actual.includes(expected),
          `Expected string "${actual}" to contain "${expected}"`
        );
      } else {
        assert(
          actual.includes(expected),
          `Expected array to contain ${expected}`
        );
      }
    },
    toMatch(pattern) {
      assert(
        pattern.test(actual),
        `Expected "${actual}" to match pattern ${pattern}`
      );
    },
    not: {
      toContain(expected) {
        if (typeof actual === "string") {
          assert(
            !actual.includes(expected),
            `Expected string "${actual}" not to contain "${expected}"`
          );
        } else {
          assert(
            !actual.includes(expected),
            `Expected array not to contain ${expected}`
          );
        }
      },
      toMatch(pattern) {
        assert(
          !pattern.test(actual),
          `Expected "${actual}" not to match pattern ${pattern}`
        );
      },
      toThrow() {
        try {
          actual();
          // Should not throw
        } catch (err) {
          throw new Error(
            `Expected function not to throw but it threw: ${err.message}`
          );
        }
      },
    },
  };
}

global.expect = expect;

// Run tests and report results
function reportResults() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test Results: ${testsPassed}/${testsRun} passed`);

  if (testsFailed > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`FAILURES (${testsFailed}):`);
    console.log("=".repeat(60));

    failures.forEach(({ name, error }) => {
      console.log(`\n${name}`);
      console.log(`  ${error.message}`);
      if (error.stack) {
        console.log(error.stack.split("\n").slice(1, 4).join("\n"));
      }
    });
  }

  console.log(`\n${"=".repeat(60)}`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Handle unhandled errors
process.on("uncaughtException", (err) => {
  console.error("\nUNCHAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("\nUNHANDLED REJECTION:", err);
  process.exit(1);
});

// Export reporter for manual use
module.exports = { reportResults };
