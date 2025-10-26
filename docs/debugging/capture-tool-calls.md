# How to Capture Tool Calls from Claude Code

## Auth: Already Working ✅

The auth passthrough is working perfectly - you just saw it successfully authenticate and run Claude Code!

## Goal: Capture Tool Call Behavior

Now you want to see:
1. How Claude Code formats tool calls in requests
2. How Claude responds with tool calls
3. What parameters it actually uses
4. How tool results are sent back

## Prompts That Trigger Tools

### File Operations (Read, Write, Glob)

```bash
# Start Claude mode with trace logging
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude

# In Claude Code, use these prompts:
> Read the README.md file and summarize it

> Show me all TypeScript files in the src directory

> Create a new file called test.txt with "Hello World"
```

**Tools triggered**: Read, Glob, Write

### Git Operations (Bash)

```
> What files have changed in this repository?

> Show me the git log for the last 5 commits

> Run npm test and tell me if it passes
```

**Tools triggered**: Bash

### Search Operations (Grep)

```
> Find all occurrences of "anthropic" in the codebase

> Search for the function definition of "createAnthropicProxy"

> Find all TODO comments in the code
```

**Tools triggered**: Grep

### Complex Multi-Tool Workflows

```
> Find all test files, read them, and tell me what they test

> Check git status, read any modified files, and explain what changed

> Search for "FIXME" comments, create a list, and write them to FIXME.md
```

**Tools triggered**: Multiple (Bash, Grep, Read, Write)

## What to Look For in Traces

### Tool Use Request (From Claude)

After you give a prompt, Claude will respond with tool calls. Look in the trace for:

```json
{
  "response": {
    "body": {
      "content": [
        {
          "type": "tool_use",
          "id": "toolu_01A2B3C4D5E6F7G8H9I0J1K2",
          "name": "Read",
          "input": {
            "file_path": "/Users/akaszubski/Documents/GitHub/anyclaude/README.md"
          }
        }
      ],
      "stop_reason": "tool_use"
    }
  }
}
```

**Key things**:
- Tool call ID format
- How parameters are formatted
- Which parameters are included (required vs optional)

### Tool Result (Back to Claude)

The next trace will show how tool results are sent back:

```json
{
  "request": {
    "body": {
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "type": "tool_result",
              "tool_use_id": "toolu_01A2B3C4D5E6F7G8H9I0J1K2",
              "content": "... file contents here ..."
            }
          ]
        }
      ]
    }
  }
}
```

## Step-by-Step Test

### Test 1: Simple Read Tool

```bash
# Terminal 1: Start proxy with trace logging
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude

# In Claude Code:
> Read the README.md file

# Exit Claude
> /exit

# Terminal 2: Analyze the trace
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq '.response.body.content[] | select(.type == "tool_use")'
```

**You should see**: Claude's tool call with the Read tool

### Test 2: Bash Tool with Parameters

```bash
# In Claude Code:
> Run "git status" and show me the output

# After exit, check trace:
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq '.response.body.content[] | select(.type == "tool_use" and .name == "Bash")'
```

**Look for**: Which parameters Claude includes (command, description, timeout?)

### Test 3: Complex Multi-Tool

```bash
# In Claude Code:
> Find all JSON files in the current directory and read package.json

# Check traces:
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq '.response.body.content[] | select(.type == "tool_use") | {name, input}'
```

**You should see**: Multiple tool calls (Glob, Read)

## Compare with Qwen3-Coder-30B

After capturing Claude's tool calls, test the same prompts with Qwen3:

```bash
# Terminal 1: Start in LMStudio mode with Qwen3-Coder-30B loaded
ANYCLAUDE_DEBUG=3 anyclaude 2> qwen3-trace.log

# In Claude Code: Use the EXACT same prompts
> Read the README.md file

# Exit and analyze
grep -A20 "Tool Call" qwen3-trace.log
```

**Compare**:
1. Does Qwen3 call the tool?
2. Does it use the same parameters?
3. Are the parameters formatted correctly?
4. Does it fail? Why?

## Example Analysis

### Claude's Tool Call (from trace)
```json
{
  "type": "tool_use",
  "id": "toolu_123",
  "name": "Bash",
  "input": {
    "command": "git status",
    "description": "Check git repository status"
  }
}
```

### Qwen3's Tool Call (from debug log)
```
[TRACE] Model called tool: Bash
Tool call input: {
  "command": "git status"
  // Missing: description parameter!
}
```

**Observation**: Qwen3 only provides `command`, not `description` (even though it's optional)

## Quick Test Script

Save this for easy testing:

```bash
#!/bin/bash
# test-tool-calls.sh

echo "Starting Claude mode with trace logging..."
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude << 'EOF'
Read the README.md file
/exit
EOF

echo ""
echo "Latest trace with tool calls:"
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | \
  jq '.response.body.content[] | select(.type == "tool_use") | {name, input}'
```

## What You're Looking For

### Schema Sent (Request)
- Already captured ✅ (17 tools with full schemas)
- Located in: `.request.body.tools[]`

### Tool Calls Made (Response)
- How Claude calls the tools
- What parameters it includes
- Located in: `.response.body.content[] | select(.type == "tool_use")`

### Tool Results (Next Request)
- How results are formatted
- Located in: `.request.body.messages[].content[] | select(.type == "tool_result")`

### Model Response (After Tool Result)
- Final answer using tool results
- Located in: `.response.body.content[] | select(.type == "text")`

## Summary

✅ **Auth working** - Claude Code authenticated successfully
✅ **Traces captured** - You have 6 traces with tool schemas
🔄 **Next step**: Capture tool CALLS by giving prompts that use tools

**Recommended first test**:
```bash
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude

> Read the README.md file and tell me what this project does

> /exit
```

Then check:
```bash
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | \
  jq '.response.body.content[] | select(.type == "tool_use")'
```

You'll see exactly how Claude formats the Read tool call with its parameters!
