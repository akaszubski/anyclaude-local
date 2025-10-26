#!/usr/bin/env node

/**
 * Capture actual tool schemas sent by Claude Code
 *
 * This script starts the proxy in PROXY_ONLY mode and logs all tool schemas
 * that Claude Code sends. This helps us identify which schemas contain union types.
 *
 * Usage:
 *   PROXY_ONLY=true ANYCLAUDE_DEBUG=3 node dist/main.js 2>&1 | tee /tmp/schema-capture.log
 *
 * Then make a request to Claude Code and check the logs for tool schemas.
 */

console.log(`
To capture Claude Code's tool schemas:

1. Start proxy in debug mode:
   PROXY_ONLY=true ANYCLAUDE_DEBUG=3 node dist/main.js 2>&1 | tee /tmp/schema-capture.log

2. In another terminal, send a request using curl:
   curl http://localhost:PROXY_PORT/v1/messages \\
     -H "x-api-key: test" \\
     -H "anthropic-version: 2023-06-01" \\
     -H "content-type: application/json" \\
     -d '{
       "model": "claude-sonnet-4-5-20250514",
       "max_tokens": 100,
       "tools": [
         {
           "name": "test_tool",
           "description": "Test tool with union type",
           "input_schema": {
             "type": "object",
             "properties": {
               "value": {
                 "oneOf": [
                   {"type": "string"},
                   {"type": "number"}
                 ]
               }
             }
           }
         }
       ],
       "messages": [{"role": "user", "content": "test"}]
     }'

3. Check the log for tool schema transformations:
   grep -A 10 "Tool Schema" /tmp/schema-capture.log

Note: The real test is to use actual Claude Code CLI and see what tools it sends.
`);
