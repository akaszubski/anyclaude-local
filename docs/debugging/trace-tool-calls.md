# Tracing Tool Calls with Qwen3-Coder-30B

## Goal

Capture exactly what Claude Code sends and what Qwen3 returns to understand why tool calls fail.

## Debug Levels

**ANYCLAUDE_DEBUG** environment variable:
- `0` - No debug logging (default)
- `1` - Basic debug (context detection, request timing)
- `2` - Verbose debug (stream chunks, keepalive)
- **`3` - TRACE (full tool schemas, tool calls)** ← **USE THIS**

## Step 1: Start anyclaude with Trace Logging

```bash
ANYCLAUDE_DEBUG=3 anyclaude
```

This will log:
- ✅ Full Claude Code tool schemas (input_schema with all properties)
- ✅ Schema transformations (original → providerized → LMStudio)
- ✅ Tool calls from model (name, input, validation)
- ✅ All stream chunks and conversions

## Step 2: Test Simple Command (Baseline)

In Claude Code:
```
> Run git status and show me the output
```

**Expected in logs**:
```
[ANYCLAUDE DEBUG] [Tools] Claude Code sent 1 tool(s):
[ANYCLAUDE DEBUG] [Tool 1/1] Bash {
  "description": "Executes a given bash command...",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {"type": "string", "description": "The command to execute"},
      "description": {"type": "string", "description": "..."},
      "timeout": {"type": "number", "description": "..."},
      // ... more properties
    },
    "required": ["command"],
    "additionalProperties": false
  }
}

[ANYCLAUDE DEBUG] [Tool Schema] Bash - No changes needed
// OR
[ANYCLAUDE DEBUG] [Tool Schema Transform] Bash {
  "original": {...},
  "providerized": {...}
}

[ANYCLAUDE DEBUG] [Tool Call] Model called tool: Bash {
  "toolCallId": "call_123",
  "toolName": "Bash",
  "input": {
    "command": "git status",
    "description": "Show git status"
  }
}
```

**What to capture**:
1. **Full input_schema** - Save to file for analysis
2. **Schema transformation** - Did we modify it? How?
3. **Tool call success** - Did model provide correct parameters?

## Step 3: Test Implicit Tool Use (Where it Fails)

In Claude Code:
```
> What files have changed in the repository?
```

**Expected** (if working):
```
[ANYCLAUDE DEBUG] [Tool Call] Model called tool: Bash {
  "toolName": "Bash",
  "input": {
    "command": "git status" // or "git diff"
  }
}
```

**Actual** (if failing):
```
# No [Tool Call] log appears
# Instead, model returns text or invalid tool_use
```

**What to check**:
- Does [Tool Call] appear in logs?
- If yes: What input did model provide? Is it valid?
- If no: Did model return text instead? Did it try and fail?

## Step 4: Test Complex Multi-Tool (Hardest Case)

In Claude Code:
```
> Read the README.md file and tell me what this project is about
```

**Expected tools**:
- Read tool (for file reading)
- Maybe Bash tool (if model tries `cat README.md`)

**What to capture**:
1. How many tools did Claude Code send?
2. What are their schemas? (especially Read tool)
3. Which tool did model choose?
4. Did it provide correct file_path?

## Step 5: Save Full Logs

```bash
# Redirect stderr (debug logs) to file
ANYCLAUDE_DEBUG=3 anyclaude 2> tool-trace.log

# In another terminal, watch logs live
tail -f tool-trace.log | grep -E "\[Tool|\[Schema"
```

Then test all 3 scenarios above and save the complete log.

## What We're Looking For

### Pattern 1: Schema Complexity
**Hypothesis**: Claude Code sends too many properties, model gets confused

**Evidence**:
```json
// Claude Code sends
{
  "properties": {
    "command": {...},
    "description": {...},
    "timeout": {...},
    "run_in_background": {...},
    "dangerouslyDisableSandbox": {...}
  },
  "required": ["command"]
}

// Model tries to use all of them and fails
```

**Solution**: Simplify schema to only required + 1-2 common optional params

### Pattern 2: Property Naming
**Hypothesis**: camelCase vs snake_case confuses model

**Evidence**:
```
Model returns: {"run-in-background": true}
Schema expects: {"run_in_background": true}
```

**Solution**: Normalize naming in schema

### Pattern 3: additionalProperties: false
**Hypothesis**: Model adds extra fields, validation fails

**Evidence**:
```
Model returns: {"command": "git status", "cwd": "."}
Schema has: "additionalProperties": false
Error: Unknown property 'cwd'
```

**Solution**: Remove additionalProperties constraint for local models

### Pattern 4: Enum Constraints
**Hypothesis**: Model doesn't respect enum values

**Evidence**:
```
Schema: {"type": {"enum": ["bash", "sh", "zsh"]}}
Model: {"type": "shell"}  // Not in enum!
```

**Solution**: Convert enums to descriptions instead of constraints

## Analysis Script

After collecting logs, analyze patterns:

```bash
# Extract all tool schemas
grep "\[Tool.*\].*{" tool-trace.log > schemas.json

# Extract all tool calls
grep "\[Tool Call\]" tool-trace.log > calls.json

# Find failures (no tool call after schema)
# Compare: Number of [Tools] vs Number of [Tool Call]
```

## Expected Findings

Based on test with simplified schema (successful):
```json
{
  "name": "Bash",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {"type": "string"},
      "description": {"type": "string"}
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```
**Result**: ✅ 95%+ success

Claude Code's full schema (failed in your testing):
```json
{
  "name": "Bash",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {...},
      "description": {...},
      "timeout": {...},
      "run_in_background": {...},
      "dangerouslyDisableSandbox": {...},
      // ... more
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```
**Result**: ❌ 30% success

**Hypothesis**: 2 properties = 95% success, 5+ properties = 30% success

**Solution**: Simplify to 2-3 most common properties

## Next Steps After Analysis

1. **Save tool-trace.log** - Upload to GitHub issue for community analysis
2. **Count failures** - How many tool calls succeeded vs failed?
3. **Identify patterns** - What makes calls fail?
4. **Design simplification** - What properties can we remove?
5. **Implement adapter** - Create Qwen3-specific schema simplifier
6. **Test again** - Measure success rate improvement

## Quick Start

```bash
# Terminal 1: Start with trace logging
ANYCLAUDE_DEBUG=3 anyclaude 2> tool-trace-$(date +%Y%m%d-%H%M%S).log

# Terminal 2: Watch tool activity
tail -f tool-trace-*.log | grep -E "Tool|Schema"
```

Then run through test scenarios in Claude Code and analyze the logs!

---

**Ready to trace?** This will give us the data we need to build a perfect schema simplification system for Qwen3-Coder-30B!
