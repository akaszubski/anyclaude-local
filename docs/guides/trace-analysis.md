# Trace Analysis Guide

Learn how to analyze Claude Code's prompts and tool usage patterns to improve your own agent development.

## What is Trace Logging?

When using `--mode=claude` or `--mode=openrouter`, anyclaude automatically saves **every request and response** to trace files. This lets you:

- 📊 Study Claude Code's system prompts
- 🔧 See exactly how it uses tools
- 📈 Learn effective prompting patterns
- 🎓 Reverse-engineer successful agent behaviors

## Automatic Trace Logging

**Enabled by default for:**
- `anyclaude --mode=claude`
- `anyclaude --mode=openrouter`

**Trace location:**
```bash
~/.anyclaude/traces/claude/         # Claude API traces
~/.anyclaude/traces/openrouter/     # OpenRouter traces
```

**Disable if needed:**
```bash
ANYCLAUDE_DEBUG=0 anyclaude --mode=claude
```

## Trace File Format

Each trace is a JSON file containing:

```json
{
  "timestamp": "2024-11-01T10:30:45.123Z",
  "mode": "openrouter",
  "request": {
    "headers": { "authorization": "[REDACTED]" },
    "body": {
      "system": "You are Claude Code, an AI assistant...",
      "messages": [
        { "role": "user", "content": "Write a function..." }
      ],
      "tools": [
        {
          "name": "Read",
          "description": "Read files from the filesystem",
          "input_schema": { "..." }
        }
      ],
      "model": "z-ai/glm-4.6",
      "max_tokens": 4096
    }
  },
  "response": {
    "statusCode": 200,
    "body": {
      "content": [
        { "type": "text", "text": "I'll help..." },
        {
          "type": "tool_use",
          "name": "Read",
          "input": { "file_path": "/path/to/file.ts" }
        }
      ]
    }
  }
}
```

**Note:** API keys are automatically redacted for security.

## Basic Analysis

### View Latest Trace

```bash
# List traces (newest first)
ls -lht ~/.anyclaude/traces/claude/ | head -10

# View latest trace (pretty-printed)
cat ~/.anyclaude/traces/claude/trace-*.json | tail -1 | jq .
```

### Extract System Prompt

```bash
# Get system prompt from latest trace
jq -r '.request.body.system' ~/.anyclaude/traces/claude/trace-*.json | tail -1

# Save all system prompts
jq -r '.request.body.system' ~/.anyclaude/traces/claude/*.json > system-prompts.txt
```

### View Tool Definitions

```bash
# See all tool schemas Claude Code uses
jq '.request.body.tools[]' ~/.anyclaude/traces/claude/trace-*.json | tail -1 | jq .

# List tool names
jq -r '.request.body.tools[].name' ~/.anyclaude/traces/claude/*.json | sort -u
```

## Advanced Analysis

### Find Tool Usage Patterns

```bash
# See what tools Claude actually called
jq -r '.response.body.content[] |
  select(.type == "tool_use") |
  "\(.name): \(.input)"' ~/.anyclaude/traces/claude/*.json

# Count tool usage frequency
jq -r '.response.body.content[] |
  select(.type == "tool_use") |
  .name' ~/.anyclaude/traces/claude/*.json |
  sort | uniq -c | sort -rn
```

Example output:
```
  45 Read
  23 Write
  18 Edit
  12 Bash
   8 Grep
   5 Glob
```

### Analyze Prompting Strategies

```bash
# Extract system prompts by task type
for f in ~/.anyclaude/traces/claude/*.json; do
  echo "=== Trace: $(basename $f) ==="
  jq -r '.request.body.system' "$f" | head -5
  echo ""
done

# Find patterns in tool calling
jq -r '.response.body.content[] |
  select(.type == "tool_use") |
  {tool: .name, params: .input | keys}' \
  ~/.anyclaude/traces/claude/*.json
```

### Compare Different Models

```bash
# Claude API traces
jq -r '.request.body.system' ~/.anyclaude/traces/claude/*.json > claude-prompts.txt

# OpenRouter (GLM-4.6) traces
jq -r '.request.body.system' ~/.anyclaude/traces/openrouter/*.json > openrouter-prompts.txt

# Compare
diff claude-prompts.txt openrouter-prompts.txt
```

## Learning from Traces

### Study Effective Patterns

**1. System Prompt Structure**

Extract and study how Claude Code structures its instructions:

```bash
jq -r '.request.body.system' ~/.anyclaude/traces/claude/trace-*.json |
  tail -1 |
  head -50
```

Look for:
- How it describes its capabilities
- Constraint handling
- Tool usage guidelines
- Error handling instructions

**2. Tool Calling Sequences**

See how Claude chains tools together:

```bash
# Show tool call sequences
jq -r '.response.body.content[] |
  select(.type == "tool_use") |
  .name' ~/.anyclaude/traces/claude/trace-*.json |
  paste -sd " "
```

Example sequences:
```
Read Edit Write        # Modify existing file
Glob Grep Read Edit    # Find, search, modify
Bash Read              # Execute then check output
```

**3. Parameter Patterns**

Learn how Claude Code uses tool parameters:

```bash
# See how Read tool is used
jq '.response.body.content[] |
  select(.type == "tool_use" and .name == "Read") |
  .input' ~/.anyclaude/traces/claude/*.json | head -20
```

### Build Your Own Prompts

Use insights from traces to improve your own agent prompts:

**Example: Extract best practices**

```bash
# Find successful coding tasks
grep -l "tool_use.*Write" ~/.anyclaude/traces/claude/*.json | \
  xargs -I {} jq -r '.request.body.system' {} | \
  grep -A5 "code quality"
```

## Trace Management

### Clean Up Old Traces

```bash
# Delete traces older than 7 days
find ~/.anyclaude/traces/claude/ -name "*.json" -mtime +7 -delete

# Keep only last 100 traces
ls -t ~/.anyclaude/traces/claude/*.json | tail -n +101 | xargs rm
```

### Export Traces

```bash
# Create archive of interesting traces
mkdir ~/claude-code-research
cp ~/.anyclaude/traces/claude/trace-2024-11*.json ~/claude-code-research/

# Compress for sharing (removes API keys automatically)
tar -czf claude-traces.tar.gz ~/.anyclaude/traces/claude/*.json
```

## Privacy & Security

**What's Redacted:**
- ✅ API keys (Authorization headers)
- ✅ Sensitive headers

**What's NOT Redacted:**
- ⚠️ Your prompts/questions
- ⚠️ Code snippets
- ⚠️ File paths
- ⚠️ Tool responses

**Best Practices:**
- Don't share traces publicly if they contain sensitive code
- Review traces before sharing
- Use trace management to remove old/sensitive data

## Use Cases

### 1. Agent Development

Building your own coding agent? Study Claude Code's patterns:

```bash
# Extract tool schemas for your agent
jq '.request.body.tools' ~/.anyclaude/traces/claude/trace-*.json |
  tail -1 > my-agent-tools.json
```

### 2. Prompt Engineering

Improve your prompts by studying what works:

```bash
# Find successful completions
jq -r 'select(.response.body.stop_reason == "end_turn") |
  .request.body.system' \
  ~/.anyclaude/traces/claude/*.json | \
  head -1000 > successful-prompts.txt
```

### 3. Tool Design

See how users actually use tools:

```bash
# Most common Read parameters
jq '.response.body.content[] |
  select(.type == "tool_use" and .name == "Read") |
  .input' ~/.anyclaude/traces/claude/*.json | \
  jq -s 'group_by(.file_path) | map({path: .[0].file_path, count: length}) | sort_by(.count) | reverse'
```

### 4. Performance Analysis

Track token usage and costs:

```bash
# Calculate total tokens used
jq -r '.response.body.usage |
  "\(.input_tokens) \(.output_tokens)"' \
  ~/.anyclaude/traces/openrouter/*.json | \
  awk '{input+=$1; output+=$2} END {print "Input:", input, "Output:", output}'

# Estimate costs (GLM-4.6 pricing: $0.60/$2 per 1M)
# Input: [tokens] * 0.0000006
# Output: [tokens] * 0.000002
```

## Example: Full Analysis Workflow

```bash
#!/bin/bash
# analyze-traces.sh - Comprehensive trace analysis

TRACE_DIR=~/.anyclaude/traces/claude

echo "=== Claude Code Trace Analysis ==="
echo ""

echo "📊 Statistics:"
echo "Total traces: $(ls -1 $TRACE_DIR/*.json | wc -l)"
echo "Date range: $(ls -t $TRACE_DIR/*.json | tail -1 | xargs basename) to $(ls -t $TRACE_DIR/*.json | head -1 | xargs basename)"
echo ""

echo "🔧 Tool Usage:"
jq -r '.response.body.content[] | select(.type == "tool_use") | .name' \
  $TRACE_DIR/*.json 2>/dev/null | sort | uniq -c | sort -rn
echo ""

echo "📝 Average System Prompt Length:"
jq -r '.request.body.system | length' $TRACE_DIR/*.json 2>/dev/null | \
  awk '{sum+=$1; count++} END {print int(sum/count), "characters"}'
echo ""

echo "💬 Average Message Count:"
jq -r '.request.body.messages | length' $TRACE_DIR/*.json 2>/dev/null | \
  awk '{sum+=$1; count++} END {print sum/count}'
echo ""

echo "🎯 Most Recent Tool Sequence:"
jq -r '.response.body.content[] | select(.type == "tool_use") | .name' \
  $TRACE_DIR/trace-*.json 2>/dev/null | tail -10 | paste -sd " "
```

## Next Steps

- **[OpenRouter Setup](openrouter-setup.md)** - Start collecting traces with cheap models
- **[Mode Switching](mode-switching.md)** - Switch between Claude and OpenRouter for comparison
- **[Development Guide](../development/DEVELOPMENT.md)** - Build your own agent using insights

---

**Questions?** Open an issue on GitHub or check the [debugging docs](../debugging/).
