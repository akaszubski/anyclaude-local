# Debugging: GPT-OSS-20B Tool Calling Issue

## 🎯 Intent

**Goal**: Investigate why gpt-oss-20b-5bit model is outputting a custom "commentary channel" format instead of proper OpenAI tool calling format, preventing tools from executing in Claude Code.

**Expected Outcome**: Identify the root cause and implement a fix so that gpt-oss-20b can properly execute tools (Read, Write, Edit, Bash, etc.) in Claude Code.

## 🐛 Problem Description

### What Should Happen

When Claude Code requests the model to call a tool, the model should output OpenAI tool calling format:

```json
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "Read",
              "arguments": "{\"file_path\":\"/path/to/file.md\"}"
            }
          }
        ]
      }
    }
  ]
}
```

anyclaude then converts this to Anthropic format:

```json
{
  "type": "tool_use",
  "id": "toolu_abc123",
  "name": "Read",
  "input": {
    "file_path": "/path/to/file.md"
  }
}
```

### What Actually Happens

The model outputs a custom "commentary channel" format:

```
<|channel|>commentary to=functions.Read code<|message|>{"file_path":"/path/to/README.md"}commentary<|message|>We need to read file.<|channel|>
```

This format:

- ❌ Is not valid OpenAI tool calling
- ❌ Is not parsed by anyclaude's conversion logic
- ❌ Gets displayed to Claude Code as text instead of executing as a tool
- ❌ Repeats multiple times with slight variations

## 📋 Debugging Checklist

### 1. Verify Configuration

Check the debug log for SESSION CONFIGURATION section:

```
Backend Mode: vllm-mlx
Model: /Users/.../gpt-oss-20b-5bit
Backend URL: http://localhost:8081/v1
```

**Questions to answer:**

- [ ] Is the correct model loaded? (gpt-oss-20b-5bit)
- [ ] Is vllm-mlx backend being used?
- [ ] Is the server responding on the expected port?

### 2. Examine Tool Schema Sent to Model

Search debug log for tool definitions sent in request.

**Look for:**

- `[ANYCLAUDE DEBUG]` messages with tool schemas
- Count of tools sent (should be ~17: Read, Write, Edit, Bash, etc.)
- JSON schema format for each tool

**Questions to answer:**

- [ ] Are tools being sent in OpenAI format (`{"type": "function", "function": {...}}`)?
- [ ] Are the schemas valid and complete?
- [ ] Are there any schema transformations applied (union types, etc.)?

### 3. Analyze Model Response

Search for the model's actual output in the log.

**Look for:**

- `[Stream Conversion]` messages showing raw chunks
- Text output from the model
- Any tool_calls in the response

**Questions to answer:**

- [ ] Does the model output `tool_calls` at all?
- [ ] Does it output text with the commentary format?
- [ ] When in the stream does this happen?
- [ ] Are there ANY valid tool calls mixed in?

### 4. Check for Pattern Recognition Issues

**Hypothesis**: The model may not recognize the tool calling format expected by vllm-mlx.

**Questions to answer:**

- [ ] Does the model support OpenAI tool calling format?
- [ ] Does it use a different chat template?
- [ ] Is there a system prompt needed to enable tool calling?
- [ ] Does the model need specific formatting in the prompt?

### 5. Compare with Working Models

Reference: `docs/debugging/tool-calling-fix.md` states:

- ✅ Qwen3-Coder-30B works perfectly
- ✅ GPT-OSS-20B works perfectly (supposedly)

**Questions to answer:**

- [ ] What's different about this gpt-oss-20b-5bit vs the tested version?
- [ ] Is this a quantization issue? (5-bit vs full precision)
- [ ] Is this a model version issue?
- [ ] Is this a vllm-mlx configuration issue?

## 🔍 Debugging Steps

### Step 1: Extract Key Information from Debug Log

```bash
# Get session config
grep -A 20 "SESSION CONFIGURATION" ~/.anyclaude/logs/debug-session-*.log

# Count tool schemas sent
grep "tool_choice\|tools.*function" ~/.anyclaude/logs/debug-session-*.log | wc -l

# Find model responses
grep "commentary\|tool_calls\|Stream Conversion" ~/.anyclaude/logs/debug-session-*.log

# Check for any tool calls that worked
grep "tool_use" ~/.anyclaude/logs/debug-session-*.log
```

### Step 2: Identify the Exact Format Being Used

Look at what the model outputs and compare to:

**OpenAI format** (expected):

```json
{ "tool_calls": [{ "function": { "name": "Read", "arguments": "..." } }] }
```

**Commentary format** (actual):

```
<|channel|>commentary to=functions.Read...
```

### Step 3: Determine Root Cause Category

Classify the issue into one of these categories:

#### A. Model Doesn't Support Tool Calling

- Model was not trained on tool calling
- Solution: Document limitation, recommend different model

#### B. Model Uses Different Format

- Model expects different prompt structure
- Solution: Add model-specific adapter in `src/convert-anthropic-messages.ts`

#### C. vllm-mlx Configuration Issue

- Server needs different parameters
- Solution: Update vllm-mlx server launch options in `scripts/vllm-mlx-server.py`

#### D. Schema Transformation Issue

- Tool schemas are being mangled by `src/json-schema.ts`
- Solution: Fix schema conversion for this model

#### E. Chat Template Issue

- Model needs specific chat template for tool calling
- Solution: Configure chat template in vllm-mlx launch

### Step 4: Test Hypothesis

Based on root cause category, test solutions:

**For A (Model limitation):**

```bash
# Test with known working model
ANYCLAUDE_DEBUG=2 anyclaude --mode=vllm-mlx
# (Load Qwen3-Coder-30B in server instead)
```

**For B (Different format):**

```bash
# Check model card/docs for expected tool format
# Search for gpt-oss-20b tool calling examples
```

**For C (Server config):**

```bash
# Try different vllm-mlx launch options
python scripts/vllm-mlx-server.py --model /path/to/model --enable-tool-calling
```

**For D (Schema issue):**

```bash
# Add debug logging to json-schema.ts to see transformations
# Check if union types are being handled correctly
```

**For E (Chat template):**

```bash
# Check what chat template is being used
curl http://localhost:8081/v1/models
# Look for chat_template in response
```

## 🔧 Known Solutions

### Solution 1: Model-Specific Prompt Engineering

Some models need specific system prompts to enable tool calling:

```typescript
// In src/convert-anthropic-messages.ts
if (modelName.includes("gpt-oss")) {
  systemPrompt +=
    '\n\nYou have access to tools. When calling a tool, output valid JSON in this format: {"tool_calls": [...]}';
}
```

### Solution 2: Chat Template Override

Force a specific chat template in vllm-mlx:

```python
# In scripts/vllm-mlx-server.py
chat_template = "{% for message in messages %}..." # Custom template
```

### Solution 3: Format Adapter

Add a post-processing step to convert commentary format to tool calls:

```typescript
// In src/convert-to-anthropic-stream.ts
if (chunk.includes("<|channel|>commentary")) {
  // Parse commentary format and convert to tool_use
  const match = chunk.match(/to=functions\.(\w+).*"(.*?)"/);
  if (match) {
    const toolName = match[1];
    const args = match[2];
    // Convert to proper tool_use format
  }
}
```

### Solution 4: Model Documentation

If model doesn't support tool calling, document it:

```markdown
## Tested Models

### gpt-oss-20b-5bit ❌

- Tool calling: NOT SUPPORTED
- Reason: Model outputs custom commentary format instead of OpenAI tool calls
- Workaround: Use text-based commands instead
- Alternative: Use Qwen3-Coder-30B or other tool-capable model
```

## 📊 Success Criteria

The fix is successful when:

1. ✅ Model outputs valid OpenAI tool calling format
2. ✅ anyclaude converts it to Anthropic format correctly
3. ✅ Claude Code executes the tool (Read, Write, etc.)
4. ✅ Tool result is returned to the model
5. ✅ Model can continue the conversation with the result

**Test case:**

```
User: "Read README.md and summarize"
Expected: Tool executes, file is read, summary is provided
Actual: Tool executes successfully ✅
```

## 📝 Notes for Claude

When analyzing the debug log:

1. **Start with SESSION CONFIGURATION** - verify model and backend
2. **Look for tool schemas** - are they being sent correctly?
3. **Find the model's raw output** - what format is it using?
4. **Check for any successful tool calls** - partial success?
5. **Compare to working models** - what's different?

The debug log will have ALL the information needed. Look for:

- Request body with tools array
- Response with model output
- Stream conversion messages showing what format was detected
- Any errors or warnings during conversion

## 🎓 Learning Goals

After debugging this issue, we should understand:

1. How different models implement tool calling
2. What formats are incompatible with anyclaude
3. How to detect and handle model-specific quirks
4. When to recommend alternative models vs fixing the issue
5. How to document model compatibility clearly

## 📚 Related Files

- `src/convert-to-anthropic-stream.ts` - Stream conversion logic
- `src/convert-anthropic-messages.ts` - Message format conversion
- `src/json-schema.ts` - Tool schema transformation
- `scripts/vllm-mlx-server.py` - vllm-mlx server launcher
- `docs/debugging/tool-calling-fix.md` - Previous tool calling fixes
- `docs/reference/github-issues-summary.md` - Model compatibility notes
