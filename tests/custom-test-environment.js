// Custom Jest environment to bypass localStorage security error in Node.js v25
const NodeEnvironment = require("jest-environment-node").TestEnvironment;

class CustomTestEnvironment extends NodeEnvironment {
  constructor(config, context) {
    // Skip parent constructor temporarily to avoid localStorage init
    super(config, context);

    // Patch localStorage after initialization
    this.global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }
}

module.exports = CustomTestEnvironment;
