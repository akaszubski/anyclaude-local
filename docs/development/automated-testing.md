# Automated Tool Call Testing

## One-Command Solution ✨

I created a fully automated script that:

1. Tests Claude API tool calling
2. Tests Qwen3-Coder-30B tool calling
3. Compares the results
4. Generates a detailed report with fix recommendations

## How to Use

### Prerequisites

1. **LMStudio running** with Qwen3-Coder-30B (or any model) loaded
2. **anyclaude built** (`npm run build`)
3. **npm link** completed (so `anyclaude` points to your local version)

### Run the Test

```bash
./test-tool-comparison.sh
```

That's it! The script will:

1. ✅ Check LMStudio is running
2. ✅ Test Claude API with 3 different prompts
3. ✅ Test Qwen3 with the same 3 prompts
4. ✅ Analyze traces and logs
5. ✅ Generate a detailed report: `tool-comparison-report.md`
6. ✅ Suggest specific code fixes

### What It Tests

**Test Prompts** (designed to trigger different tools):

1. "Read the README.md file and summarize it" → **Read** tool
2. "What files have changed in git?" → **Bash** tool (git status)
3. "List all TypeScript files in the src directory" → **Glob** tool

### Output

The script generates:

**Console Output**:

```
╔══════════════════════════════════════════════════════════════╗
║  Automated Tool Call Analysis: Claude vs Qwen3-Coder-30B    ║
╚══════════════════════════════════════════════════════════════╝

✓ LMStudio running
✓ Loaded model: qwen3-coder-30b

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cleaning old data...
✓ Cleaned

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣  TESTING CLAUDE API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test 1: Read the README.md file and summarize it
Testing Claude with prompt 1............ done

[...continues...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Claude traces: 12 files
✓ Qwen3 logs: 3 files
✓ Claude tool calls: 8
✓ Qwen3 tool calls: 2

📄 Detailed report saved to: tool-comparison-report.md
```

**Report File** (`tool-comparison-report.md`):

- Complete comparison of Claude vs Qwen3 behavior
- Specific tool calls made by each
- Errors and issues detected
- **Concrete fix recommendations** with code examples
- Implementation priority (High/Medium/Low)
- Testing plan

### Example Report Section

```markdown
### Recommended Fixes

#### 1. Schema Complexity

**Problem**: Qwen3 struggles with complex schemas (many optional parameters)

**Solution**: Simplify schemas in `src/json-schema.ts`

**Files to modify**:

- `src/json-schema.ts` - Add model-specific schema simplification
- `src/convert-anthropic-messages.ts` - Handle parameter mapping

[...specific code examples...]
```

## What Gets Captured

### From Claude API

**Trace files** in `~/.anyclaude/traces/claude/`:

- Complete tool schemas (17 tools)
- Tool calls with parameters
- Tool results
- Response format

**Example**:

```json
{
  "response": {
    "content": [
      {
        "type": "tool_use",
        "name": "Read",
        "id": "toolu_123",
        "input": {
          "file_path": "/path/to/README.md"
        }
      }
    ]
  }
}
```

### From Qwen3-Coder-30B

**Debug logs** in `/tmp/qwen3-tool-test-*.log`:

- Tool schemas sent to LMStudio
- Tool calls attempted (or failures)
- Error messages
- Response format

**Example**:

```
[TRACE] Tool Call: Read
Input: {"file_path": "/path/to/README.md"}
```

## Interpreting Results

### Success Metrics

**Claude tool calls**: Should be 6-10 (2-3 per test prompt)
**Qwen3 tool calls**: Currently 2-4 (30% success rate)

**Goal**: Increase Qwen3 to 6-10 (90% success rate)

### Common Issues Found

1. **Schema Too Complex**
   - Claude schema: 5 parameters (1 required, 4 optional)
   - Qwen3 confused by optional parameters
   - Fix: Reduce to 2-3 parameters max

2. **Description Too Long**
   - Claude description: 8000+ characters
   - Qwen3 truncates/ignores long descriptions
   - Fix: Limit to 200-500 characters

3. **Format Mismatch**
   - Qwen3 returns parameters in slightly different format
   - Fix: Add format normalization

## After Running the Test

### 1. Read the Report

```bash
cat tool-comparison-report.md
```

Or on macOS (opens automatically):

```bash
open tool-comparison-report.md
```

### 2. View Raw Data

**Claude traces**:

```bash
ls -lth ~/.anyclaude/traces/claude/
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq .
```

**Qwen3 logs**:

```bash
cat /tmp/qwen3-tool-test-1.log
```

### 3. Implement Fixes

Based on report recommendations:

1. **Edit `src/json-schema.ts`**:
   - Add model-specific schema simplification
   - Remove optional parameters for LMStudio mode
   - Truncate descriptions

2. **Edit `src/convert-anthropic-messages.ts`**:
   - Handle parameter mapping
   - Add default values for removed params

3. **Edit `src/convert-to-anthropic-stream.ts`**:
   - Normalize tool call format
   - Handle edge cases

### 4. Re-test

```bash
# Rebuild
npm run build

# Re-run test
./test-tool-comparison.sh

# Compare results
# - Did Qwen3 tool call count increase?
# - Are there fewer errors?
# - Did success rate improve?
```

## Troubleshooting

### "LMStudio is not running"

```bash
# Check if LMStudio server is running
curl http://localhost:1234/v1/models

# Start LMStudio and enable server on port 1234
```

### "No tool calls detected"

Possible causes:

1. Model not loaded in LMStudio
2. Model doesn't support tool calling
3. Prompt too simple (model gave text response instead)
4. Schema conversion broken (check logs)

### "Script hangs"

- The script has 60-second timeout per test
- If Claude Code or Qwen3 doesn't respond, it will auto-kill
- Check `/tmp/claude-tool-test-*.log` for errors

## Advanced Usage

### Test with Different Prompts

Edit the script and modify this section:

```bash
TEST_PROMPTS=(
  "Read the README.md file and summarize it"
  "What files have changed in git?"
  "List all TypeScript files in the src directory"
  # Add your own:
  # "Create a new file called test.txt"
  # "Search for 'TODO' in the codebase"
)
```

### Test with Different Models

Load a different model in LMStudio, then run the script. The report will show which model was tested.

### Generate Multiple Reports

The script overwrites `tool-comparison-report.md`. To keep historical reports:

```bash
./test-tool-comparison.sh
mv tool-comparison-report.md report-$(date +%Y%m%d-%H%M%S).md
```

## Summary

**One command. Complete analysis. Specific recommendations.**

```bash
./test-tool-comparison.sh
```

Then implement the suggested fixes and re-run to verify improvement!

**Goal**: 30% → 90% tool calling success rate with Qwen3-Coder-30B 🎯
