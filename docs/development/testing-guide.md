# Testing Guide for Qwen3-Coder-30B-A3B-Instruct-MLX-6bit

This guide will help you validate all the new features with your Qwen3-Coder-30B model (262K context).

## Test Environment

**Hardware**:
- Mac M4 Max
- 40 GPU cores, 16 CPU cores
- 128GB shared RAM, 96GB available for GPU

**Software**:
- **LMStudio**: Version 0.3.30
- **Model**: Qwen3-Coder-30B-A3B-Instruct-MLX-6bit
- **Context**: 262,144 tokens (configured in LMStudio)
- **anyclaude**: Current development version

## Prerequisites

1. **LMStudio 0.3.30 is running** with Qwen3-Coder-30B loaded
2. **anyclaude is built**: `bun run build` (already done)
3. **Model configuration in LMStudio**: 262,144 tokens context

## Test Suite

### Test 1: Context Detection ✅
**What it tests**: Automatic context length detection from LMStudio API

**Command**:
```bash
node tests/manual/test_lmstudio_context_query.js
```

**Expected Output**:
```
1️⃣  Querying LMStudio API directly...
   ✅ LMStudio loaded model: qwen3-coder-30b-a3b-instruct-mlx
   ✅ Context length: 262,144 tokens

2️⃣  Starting anyclaude with debug mode...
   [ANYCLAUDE DEBUG] [LMStudio] Loaded model: qwen3-coder-30b-a3b-instruct-mlx | Context: 262,144 tokens
   [ANYCLAUDE DEBUG] [Context] Cached LMStudio context length: 262144 tokens

✅ PERFECT MATCH! Context length correctly queried from LMStudio
```

**What to check**:
- ✅ Model name detected correctly
- ✅ Context length matches LMStudio setting (262,144)
- ✅ No errors or warnings

---

### Test 2: Simple Tool Calling ✅
**What it tests**: Whether your model can call simple tools (Bash with 2 params)

**Command**:
```bash
node tests/manual/test_bash_tool.js
```

**Expected Output**:
```
🧪 Testing Bash Tool Calling

Tool Schema:
{
  "name": "Bash",
  "description": "Executes a bash command",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {"type": "string"},
      "description": {"type": "string"}
    },
    "required": ["command"]
  }
}

Status: 200

✅ Model successfully called tool:
   Tool: Bash
   Input: {
     "command": "git status",
     "description": "Get the current git status"
   }
```

**What to check**:
- ✅ Status: 200 (success)
- ✅ Tool name correct ("Bash")
- ✅ Required parameter provided ("command")
- ✅ Optional parameter may or may not be provided

**If it fails**:
- ❌ Status 400/500: Model cannot do tool calling
- ❌ No "tool_use" in response: Model doesn't understand tool format

---

### Test 3: SSE Keepalive (Slow Prompt Processing) 🆕
**What it tests**: Whether long prompt processing (60+ seconds) works without timeout

**Setup**:
```bash
# Terminal 1: Start anyclaude with verbose debug
ANYCLAUDE_DEBUG=2 anyclaude
```

**Test Prompt**:
In Claude Code, send a complex prompt that will take time to process:

```
Create a comprehensive test suite for the anyclaude project. Include:
1. Unit tests for all core functions
2. Integration tests for the proxy server
3. End-to-end tests with LMStudio
4. Mock tests for edge cases
5. Performance benchmarks
6. Error handling tests
7. Security tests

For each test file, include:
- Detailed test cases with descriptions
- Setup and teardown functions
- Assertions for success and failure paths
- Mock data and fixtures
- Comments explaining test logic
```

**Expected Debug Output**:
```
[ANYCLAUDE DEBUG] [Request Start] lmstudio/current-model at 2025-10-26T...
[ANYCLAUDE DEBUG] [Request Details] lmstudio/current-model {"system":"...","toolCount":X,"messageCount":Y}
[ANYCLAUDE DEBUG] [Keepalive] Sent keepalive #1 (waiting for LMStudio)
[ANYCLAUDE DEBUG] [Keepalive] Sent keepalive #2 (waiting for LMStudio)
[ANYCLAUDE DEBUG] [Keepalive] Sent keepalive #3 (waiting for LMStudio)
[ANYCLAUDE DEBUG] [Keepalive] Sent keepalive #4 (waiting for LMStudio)
[ANYCLAUDE DEBUG] [Keepalive] Sent keepalive #5 (waiting for LMStudio)
[ANYCLAUDE DEBUG] [Keepalive] Cleared (stream started after 5 keepalives)
[ANYCLAUDE DEBUG] [Request Complete] lmstudio/current-model: 65432ms
```

**What to check**:
- ✅ Keepalive messages appear every ~10 seconds
- ✅ Keepalive clears when stream starts
- ✅ Response appears after 30-60+ seconds
- ✅ No "Client disconnected" in LMStudio logs
- ✅ Claude Code shows streaming response

**Timing**:
- 0-10s: Processing... (keepalive #1)
- 10-20s: Processing... (keepalive #2)
- 20-30s: Processing... (keepalive #3)
- 30-40s: Processing... (keepalive #4)
- 40-50s: Processing... (keepalive #5)
- 50-60s: Stream starts! (keepalive cleared)

**If it fails**:
- ❌ Claude Code shows blank response after 30-40s
- ❌ LMStudio logs: "Client disconnected. Stopping generation..."
- ❌ No keepalive messages in debug output

---

### Test 4: Complex Tool Calling (Claude Code Real Usage) 🔍
**What it tests**: Whether model can handle Claude Code's complex tool schemas

**Setup**:
```bash
# Start anyclaude normally (no debug needed)
anyclaude
```

**Test Commands in Claude Code**:

**Test 4a: Simple Command (Expected to Work)**
```
> Run git status
```

Expected: Model calls Bash tool correctly or responds with text

**Test 4b: Implicit Tool Use (May Fail)**
```
> What files have changed in the repository?
```

Expected: Model *should* call Bash tool with `git status` but might respond with text instead

**Test 4c: Multiple Tools (Likely to Fail)**
```
> Read the README.md file and tell me what this project does
```

Expected: Model *should* call Read tool, but may struggle or give "Invalid tool parameters"

**What to check**:
- ✅ Simple explicit commands work
- ⚠️  Implicit tool inference works sometimes
- ❌ Complex multi-step tool use fails

**Document Results**:
- How many tool calls succeeded?
- What errors appeared?
- Did model eventually give up and respond with text?

---

### Test 5: Context Usage Monitoring 📊
**What it tests**: Context warning system as you approach 262K limit

**Setup**:
```bash
# Start with debug to see context stats
ANYCLAUDE_DEBUG=1 anyclaude
```

**Test Scenario**:
Have a long conversation (20+ messages) and watch for context warnings

**Expected Output at Different Stages**:

**At 75% (196K tokens)**:
```
[ANYCLAUDE DEBUG] [Context] 75.3% used (157,286 / 209,715 tokens) - Consider starting new conversation soon
```

**At 90% (188K tokens)**:
```
⚠️  WARNING: Context usage at 92.4%
   Total: 193,776 / 209,715 tokens

   ⚠️  LOCAL MODEL LIMITATION:
   Unlike Claude Sonnet 4.5 which auto-compresses context,
   local models will truncate older messages when limit is exceeded.

   RECOMMENDED ACTION:
   1. Save your work and start a new Claude Code conversation
   2. Or: Use a model with larger context (32K+ recommended)
   3. Or: Set LMSTUDIO_CONTEXT_LENGTH higher if your model supports it
```

**At 100% (209K+ tokens)**:
```
⚠️  CONTEXT LIMIT EXCEEDED - MESSAGES TRUNCATED

Removed 5 older messages to fit within model's context.

  Before: 23 messages (215,432 tokens)
  After:  18 messages
  Limit:  209,715 tokens (80% of 262K)
```

**What to check**:
- ✅ Warnings appear at correct thresholds
- ✅ Token counts are reasonable
- ✅ Truncation preserves recent messages
- ✅ Model continues working after truncation

---

## Quick Test Script

Run all automated tests at once:

```bash
#!/bin/bash

echo "🧪 Running anyclaude Test Suite for Qwen3-Coder-30B"
echo ""

echo "Test 1: Context Detection"
node tests/manual/test_lmstudio_context_query.js
echo ""

echo "Test 2: Simple Tool Calling"
node tests/manual/test_bash_tool.js
echo ""

echo "✅ Automated tests complete!"
echo ""
echo "Manual tests remaining:"
echo "  Test 3: SSE Keepalive - Start 'ANYCLAUDE_DEBUG=2 anyclaude' and send complex prompt"
echo "  Test 4: Complex Tools - Use Claude Code normally and test tool calling"
echo "  Test 5: Context Usage - Long conversation to test warnings"
```

Save as `run-tests.sh`, make executable: `chmod +x run-tests.sh`

---

## Expected Results Summary

| Test | Expected Result | Priority |
|------|----------------|----------|
| Context Detection | ✅ Pass (262,144 tokens) | High |
| Simple Tool Calling | ✅ Pass (95%+ success) | High |
| SSE Keepalive | ✅ Pass (60+ second prompts work) | Critical |
| Complex Tool Calling | ⚠️ Partial (30-60% success) | Medium |
| Context Warnings | ✅ Pass (warnings at 75%, 90%, 100%) | High |

---

## Troubleshooting

### Issue: Context detection shows wrong value
**Solution**: Set manually:
```bash
LMSTUDIO_CONTEXT_LENGTH=262144 anyclaude
```

### Issue: Tool calling fails completely
**Possible causes**:
1. Model doesn't support tool calling (use text commands instead)
2. Schema conversion issue (check debug logs)
3. LMStudio compatibility mode incorrect

**Debug**:
```bash
ANYCLAUDE_DEBUG=2 node tests/manual/test_bash_tool.js
```

### Issue: Keepalive not working
**Check**:
1. Debug logs show keepalive messages? (`ANYCLAUDE_DEBUG=2`)
2. LMStudio shows "Client disconnected"?
3. Prompt actually takes 30+ seconds? (check LMStudio prompt processing %)

### Issue: Context warnings don't appear
**Check**:
1. Debug mode enabled? (`ANYCLAUDE_DEBUG=1`)
2. Actually approaching limit? (need 196K+ tokens)
3. Context detection working? (run Test 1)

---

## Reporting Results

After testing, create a report with:

1. **Hardware**: M4 Max, 128GB RAM, 96GB GPU
2. **Model**: Qwen3-Coder-30B-A3B-Instruct-MLX-6bit
3. **Context**: 262,144 tokens
4. **Test Results**:
   - Context Detection: ✅/❌
   - Simple Tools: ✅/❌ (% success)
   - SSE Keepalive: ✅/❌
   - Complex Tools: ✅/⚠️/❌ (% success)
   - Context Warnings: ✅/❌

5. **Performance**:
   - Prompt processing time: X seconds
   - Token generation: X tokens/second
   - First token latency: X ms

6. **Notes**: Any issues, quirks, or observations

This data will help build the community model capability database!

---

**Ready to test? Start with the Quick Test Script above, then move to manual tests!**
