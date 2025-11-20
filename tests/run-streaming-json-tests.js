let passed = 0;
let failed = 0;

global.describe = (name, fn) => {
  console.log("\n" + name);
  fn();
};

global.test = (name, fn) => {
  try {
    fn();
    console.log("  ✓ " + name);
    passed++;
  } catch (err) {
    console.log("  ✗ " + name);
    console.log("    Error: " + err.message);
    failed++;
  }
};

global.expect = (actual) => {
  const matchers = {
    toBe: (expected) => {
      if (actual !== expected)
        throw new Error("Expected " + expected + ", got " + actual);
    },
    toEqual: (expected) => {
      const a = JSON.stringify(actual),
        e = JSON.stringify(expected);
      if (a !== e) throw new Error("Expected " + e + ", got " + a);
    },
    toHaveLength: (expected) => {
      if (actual.length !== expected)
        throw new Error(
          "Expected length " + expected + ", got " + actual.length
        );
    },
    toContainEqual: (expected) => {
      const found = actual.some(
        (item) => JSON.stringify(item) === JSON.stringify(expected)
      );
      if (!found)
        throw new Error(
          "Expected array to contain " + JSON.stringify(expected)
        );
    },
    toBeGreaterThan: (expected) => {
      if (actual <= expected)
        throw new Error("Expected " + actual + " > " + expected);
    },
    toBeGreaterThanOrEqual: (expected) => {
      if (actual < expected)
        throw new Error("Expected " + actual + " >= " + expected);
    },
    toBeLessThan: (expected) => {
      if (actual >= expected)
        throw new Error("Expected " + actual + " < " + expected);
    },
    toBeCloseTo: (expected, precision = 2) => {
      const power = Math.pow(10, precision);
      const actualRounded = Math.round(actual * power) / power;
      const expectedRounded = Math.round(expected * power) / power;
      if (actualRounded !== expectedRounded) {
        throw new Error("Expected " + actual + " to be close to " + expected);
      }
    },
    toHaveProperty: (prop, value) => {
      if (!(prop in actual))
        throw new Error("Expected object to have property " + prop);
      if (value !== undefined && actual[prop] !== value) {
        throw new Error(
          "Expected " + prop + " to be " + value + ", got " + actual[prop]
        );
      }
    },
    toBeDefined: () => {
      if (actual === undefined) throw new Error("Expected value to be defined");
    },
    toBeNull: () => {
      if (actual !== null)
        throw new Error("Expected value to be null, got " + actual);
    },
    toMatch: (pattern) => {
      if (!pattern.test(actual))
        throw new Error("Expected " + actual + " to match " + pattern);
    },
    toThrow: (expectedMsg) => {
      try {
        actual();
        throw new Error("Expected function to throw");
      } catch (err) {
        if (expectedMsg) {
          // Support regex patterns
          const regex =
            typeof expectedMsg === "string"
              ? new RegExp(expectedMsg)
              : expectedMsg;
          if (!regex.test(err.message)) {
            throw new Error(
              'Expected error to match "' +
                expectedMsg +
                '", got "' +
                err.message +
                '"'
            );
          }
        }
      }
    },
    not: {
      toBe: (expected) => {
        if (actual === expected)
          throw new Error("Expected not " + expected + ", got " + actual);
      },
      toEqual: (expected) => {
        const a = JSON.stringify(actual),
          e = JSON.stringify(expected);
        if (a === e) throw new Error("Expected not " + e + ", got " + a);
      },
      toThrow: () => {
        try {
          actual();
          // Success - function didn't throw
        } catch (err) {
          throw new Error(
            "Expected function not to throw, but it threw: " + err.message
          );
        }
      },
      toMatch: (pattern) => {
        if (pattern.test(actual))
          throw new Error("Expected " + actual + " not to match " + pattern);
      },
    },
  };
  return matchers;
};

console.log("\n============================================================");
console.log("Running: Streaming JSON Parser Unit Tests");
console.log("============================================================");

require("./unit/streaming-json-parser.test.js");

console.log("\n============================================================");
console.log(
  "Results: " +
    passed +
    " passed, " +
    failed +
    " failed (" +
    (passed + failed) +
    " total)"
);
console.log("============================================================\n");

process.exit(failed > 0 ? 1 : 0);
