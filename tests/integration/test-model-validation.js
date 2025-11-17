#!/usr/bin/env node

/**
 * Model Validation Test
 *
 * Tests OpenRouter models by replaying real Claude Code tool calls from trace files.
 * Measures:
 * - Speed (response time)
 * - Accuracy (tool call format validation)
 * - Functionality (does the model make the expected tool call?)
 *
 * Usage:
 *   node tests/integration/test-model-validation.js <model-id>
 *   node tests/integration/test-model-validation.js google/gemini-2.5-flash-lite
 *   node tests/integration/test-model-validation.js qwen/qwen3-coder
 *
 * Environment:
 *   OPENROUTER_API_KEY - Your OpenRouter API key
 *   TRACE_FILE - Optional: specific trace file to replay (default: uses sample traces)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
function loadEnv() {
  const envPath = path.join(__dirname, '../../.env');

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    lines.forEach(line => {
      // Skip comments and empty lines
      if (!line || line.trim().startsWith('#')) {
        return;
      }

      // Parse KEY=value
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// Load .env before anything else
loadEnv();

// ANSI colors
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

// Sample test cases (extracted from real Claude Code traces)
const TEST_CASES = [
  {
    name: "Simple Read Tool Call",
    system: "You are a helpful assistant with access to file reading tools.",
    messages: [
      {
        role: "user",
        content: "Read the README.md file and summarize it in one sentence."
      }
    ],
    tools: [
      {
        name: "Read",
        description: "Reads a file from the local filesystem",
        input_schema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "The absolute path to the file to read"
            }
          },
          required: ["file_path"],
          additionalProperties: false
        }
      }
    ],
    expectedToolCall: "Read",
    expectedParameters: ["file_path"]
  },
  {
    name: "Complex Question Tool Call",
    system: "You are a helpful assistant that can ask users questions.",
    messages: [
      {
        role: "user",
        content: "Should we rename the vLLM option to MLX? Ask the user."
      }
    ],
    tools: [
      {
        name: "AskUserQuestion",
        description: "Ask the user questions during execution",
        input_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  header: { type: "string" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        description: { type: "string" }
                      },
                      required: ["label", "description"],
                      additionalProperties: false
                    }
                  },
                  multiSelect: { type: "boolean" }
                },
                required: ["question", "header", "options", "multiSelect"],
                additionalProperties: false
              }
            }
          },
          required: ["questions"],
          additionalProperties: false
        }
      }
    ],
    expectedToolCall: "AskUserQuestion",
    expectedParameters: ["questions"]
  },
  {
    name: "Bash Command Tool Call",
    system: "You are a helpful assistant with access to bash commands.",
    messages: [
      {
        role: "user",
        content: "List all JavaScript files in the tests directory."
      }
    ],
    tools: [
      {
        name: "Bash",
        description: "Executes bash commands",
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string" },
            description: { type: "string" }
          },
          required: ["command"],
          additionalProperties: false
        }
      }
    ],
    expectedToolCall: "Bash",
    expectedParameters: ["command"]
  }
];

/**
 * Make OpenRouter API request
 */
async function callOpenRouter(model, testCase) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY not found.\n' +
      'Set it in .env file:\n' +
      '  OPENROUTER_API_KEY=sk-or-v1-...\n' +
      'Or export as environment variable:\n' +
      '  export OPENROUTER_API_KEY=sk-or-v1-...'
    );
  }

  // Convert Anthropic format to OpenAI format
  const messages = [];

  if (testCase.system) {
    messages.push({
      role: "system",
      content: testCase.system
    });
  }

  messages.push(...testCase.messages);

  // Convert tools to OpenAI format
  const tools = testCase.tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));

  const requestBody = JSON.stringify({
    model: model,
    messages: messages,
    tools: tools,
    tool_choice: "auto"
  });

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/yourusername/anyclaude',
        'X-Title': 'anyclaude-model-validator'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const elapsed = Date.now() - startTime;

        try {
          const response = JSON.parse(data);
          resolve({ response, elapsed });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}\n${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Validate tool call format
 */
function validateToolCall(toolCall, expectedToolName, expectedParameters, schema) {
  const issues = [];

  // Check if tool was called
  if (!toolCall) {
    issues.push('No tool call made');
    return { valid: false, issues };
  }

  // Check tool name
  if (toolCall.name !== expectedToolName) {
    issues.push(`Wrong tool called: expected ${expectedToolName}, got ${toolCall.name}`);
  }

  // Check parameters
  if (!toolCall.arguments) {
    issues.push('No arguments provided');
    return { valid: issues.length === 0, issues };
  }

  let args;
  try {
    args = typeof toolCall.arguments === 'string'
      ? JSON.parse(toolCall.arguments)
      : toolCall.arguments;
  } catch (error) {
    issues.push(`Invalid JSON in arguments: ${error.message}`);
    return { valid: false, issues };
  }

  // Check expected parameters are present
  for (const param of expectedParameters) {
    if (!(param in args)) {
      issues.push(`Missing expected parameter: ${param}`);
    }
  }

  // Validate against schema
  if (schema && schema.additionalProperties === false) {
    const allowedProps = Object.keys(schema.properties);
    const providedProps = Object.keys(args);
    const unexpectedProps = providedProps.filter(p => !allowedProps.includes(p));

    if (unexpectedProps.length > 0) {
      issues.push(`Unexpected parameters at root level: ${unexpectedProps.join(', ')}`);
    }

    // Validate nested objects (simplified)
    for (const [key, value] of Object.entries(args)) {
      const propSchema = schema.properties[key];

      if (propSchema && propSchema.type === 'array' && propSchema.items) {
        if (propSchema.items.type === 'object' && propSchema.items.additionalProperties === false) {
          if (Array.isArray(value)) {
            const itemAllowedProps = Object.keys(propSchema.items.properties);

            value.forEach((item, i) => {
              const itemProps = Object.keys(item);
              const unexpectedItemProps = itemProps.filter(p => !itemAllowedProps.includes(p));

              if (unexpectedItemProps.length > 0) {
                issues.push(`Unexpected properties in ${key}[${i}]: ${unexpectedItemProps.join(', ')}`);
              }
            });
          }
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    arguments: args
  };
}

/**
 * Run single test case
 */
async function runTestCase(model, testCase) {
  console.log(`\n${CYAN}Test: ${testCase.name}${RESET}`);
  console.log(`Model: ${model}`);

  try {
    const { response, elapsed } = await callOpenRouter(model, testCase);

    // Extract tool calls
    const choice = response.choices?.[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls;

    // Display timing
    console.log(`${BLUE}Response time: ${elapsed}ms${RESET}`);

    // Check for errors
    if (response.error) {
      console.log(`${RED}✗ API Error: ${response.error.message}${RESET}`);
      return {
        passed: false,
        elapsed,
        error: response.error.message
      };
    }

    // Validate tool call
    const toolCall = toolCalls?.[0]?.function;
    const expectedSchema = testCase.tools.find(t => t.name === testCase.expectedToolCall)?.input_schema;

    const validation = validateToolCall(
      toolCall,
      testCase.expectedToolCall,
      testCase.expectedParameters,
      expectedSchema
    );

    if (validation.valid) {
      console.log(`${GREEN}✓ Tool call format valid${RESET}`);
      console.log(`  Tool: ${toolCall.name}`);
      console.log(`  Arguments: ${JSON.stringify(validation.arguments, null, 2).replace(/\n/g, '\n  ')}`);

      return {
        passed: true,
        elapsed,
        toolCall: toolCall.name,
        arguments: validation.arguments
      };
    } else {
      console.log(`${RED}✗ Tool call format invalid${RESET}`);
      validation.issues.forEach(issue => {
        console.log(`  ${RED}- ${issue}${RESET}`);
      });

      if (toolCall) {
        console.log(`  Tool called: ${toolCall.name}`);
        console.log(`  Arguments: ${JSON.stringify(validation.arguments || {}, null, 2).replace(/\n/g, '\n  ')}`);
      }

      return {
        passed: false,
        elapsed,
        issues: validation.issues,
        toolCall: toolCall?.name
      };
    }

  } catch (error) {
    console.log(`${RED}✗ Test failed: ${error.message}${RESET}`);
    return {
      passed: false,
      error: error.message
    };
  }
}

/**
 * Main test runner
 */
async function main() {
  const model = process.argv[2];

  if (!model) {
    console.error(`${RED}Usage: node test-model-validation.js <model-id>${RESET}`);
    console.error(`Example: node test-model-validation.js qwen/qwen3-coder`);
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log(`MODEL VALIDATION TEST: ${model}`);
  console.log('='.repeat(80));

  const results = [];

  for (const testCase of TEST_CASES) {
    const result = await runTestCase(model, testCase);
    results.push({
      name: testCase.name,
      ...result
    });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgTime = results.reduce((sum, r) => sum + (r.elapsed || 0), 0) / results.length;

  console.log(`\nModel: ${model}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log(`Average response time: ${avgTime.toFixed(0)}ms`);

  console.log('\nDetailed Results:');
  results.forEach(result => {
    const status = result.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const time = result.elapsed ? `${result.elapsed}ms` : 'N/A';
    console.log(`  ${status} ${result.name} (${time})`);

    if (!result.passed && result.issues) {
      result.issues.forEach(issue => {
        console.log(`      ${RED}- ${issue}${RESET}`);
      });
    }
  });

  console.log('\n' + '='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`${RED}Fatal error: ${error.message}${RESET}`);
  process.exit(1);
});
