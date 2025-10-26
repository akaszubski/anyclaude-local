---
name: Model Capability Detection and Validation
about: Automatically detect and validate model capabilities (tool calling, context, streaming)
title: "[FEATURE] Automatic model capability detection and validation"
labels: enhancement, good-first-issue
assignees: ""
---

## Summary

anyclaude should automatically detect what features each model supports (tool calling, context length, streaming, reasoning) and provide warnings or fallbacks when Claude Code tries to use unsupported features.

## Current State

**What Works**:

- ✅ Context length detection via LMStudio API
- ✅ Basic streaming support
- ✅ Tool calling schema conversion

**What's Missing**:

- ❌ No validation that model can actually use tools
- ❌ No capability reporting to user
- ❌ No automatic fallback when features unsupported
- ❌ No database of known model capabilities

## Proposed Solution

### Phase 1: Capability Detection

Add automatic capability testing on first request:

```typescript
interface ModelCapabilities {
  model: string;
  contextLength: number;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  toolCallingAccuracy: "high" | "medium" | "low" | "none";
  tested: Date;
}

// Test on first request
async function detectModelCapabilities(
  lmstudioUrl: string
): Promise<ModelCapabilities> {
  const modelInfo = await getLoadedModel(lmstudioUrl);

  return {
    model: modelInfo.id,
    contextLength:
      modelInfo.loaded_context_length || modelInfo.max_context_length,
    supportsToolCalling: await testToolCalling(lmstudioUrl),
    supportsStreaming: await testStreaming(lmstudioUrl),
    supportsReasoning: false, // Most local models don't support this
    toolCallingAccuracy: await assessToolAccuracy(lmstudioUrl),
    tested: new Date(),
  };
}
```

### Phase 2: Community Database

Maintain a community-sourced database of model capabilities:

```typescript
// src/model-capabilities.ts
export const KNOWN_MODEL_CAPABILITIES: Record<
  string,
  Partial<ModelCapabilities>
> = {
  "qwen3-coder-30b-a3b-instruct-mlx": {
    contextLength: 262144,
    supportsToolCalling: true,
    toolCallingAccuracy: "medium",
    supportsStreaming: true,
    notes: "Good for code, struggles with complex tool schemas",
  },
  "gpt-oss-20b-mlx": {
    contextLength: 131072, // Reported, but use 32K in practice
    actualContextLength: 32768, // Real working limit
    supportsToolCalling: true,
    toolCallingAccuracy: "low",
    supportsStreaming: true,
    notes: "Context overflow around 32K despite 128K claim",
  },
  "deepseek-coder-v2-lite": {
    contextLength: 16384,
    supportsToolCalling: false,
    toolCallingAccuracy: "none",
    supportsStreaming: true,
    notes: "Better for pure conversation",
  },
  "mistral-7b": {
    contextLength: 32768,
    supportsToolCalling: false,
    toolCallingAccuracy: "none",
    supportsStreaming: true,
    notes: "Not trained for tool calling",
  },
};
```

### Phase 3: Capability Warnings

Show warnings when Claude Code tries to use unsupported features:

```typescript
// When tools are requested but model doesn't support them
if (body.tools && !capabilities.supportsToolCalling) {
  console.warn(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  WARNING: Tool Calling Not Supported
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Model: ${modelName}
Tool Calling Accuracy: ${capabilities.toolCallingAccuracy}

This model has weak or no tool calling support. Claude Code's
tools (Bash, Read, Write, etc.) may not work correctly.

RECOMMENDATIONS:
1. Use text-based commands instead of expecting tool inference
2. Give explicit instructions (e.g., "run git status")
3. Consider switching to a model with better tool support:
   - Qwen3-Coder-30B (medium accuracy)
   - Command-R+ 35B (high accuracy)
   - Claude via API (very high accuracy)

See: https://github.com/user/anyclaude/issues/X

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}
```

### Phase 4: Automatic Testing

Add `--test` flag to verify model capabilities:

```bash
anyclaude --test

# Output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Testing Model Capabilities
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Model: qwen3-coder-30b-a3b-instruct-mlx
LMStudio: http://localhost:1234/v1

✅ Context Length: 262,144 tokens (queried from LMStudio)
✅ Streaming: Working
⚠️  Tool Calling: Partial (simple schemas work, complex schemas fail)
   - Simple tool test: ✅ PASS
   - Complex tool test: ❌ FAIL (invalid parameters)
   - Accuracy: ~60% (medium)
❌ Extended Thinking: Not supported (local model limitation)

RECOMMENDATIONS:
- Use for: Code generation, simple automation
- Avoid: Complex multi-tool workflows
- Tool calling: Expect 60% success rate with Claude Code
- Consider: Qwen3-Coder-32B for better tool accuracy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Test Suite

Add automated tests for different capabilities:

### Test 1: Simple Tool Calling

```javascript
// tests/capabilities/test_simple_tool.js
const result = await testSimpleTool({
  name: "GetTime",
  description: "Get current time",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
});

// Pass: Model returns tool_use with correct name
// Fail: Model returns text or invalid tool call
```

### Test 2: Complex Tool Calling

```javascript
// tests/capabilities/test_complex_tool.js
const result = await testComplexTool({
  name: "Bash",
  description: "Execute bash command",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout: { type: "number" },
      description: { type: "string" },
      cwd: { type: "string" },
    },
    required: ["command"],
    additionalProperties: false,
  },
});

// Pass: Model provides required params, respects optional
// Fail: Invalid parameters or extra properties
```

### Test 3: Context Length Validation

```javascript
// tests/capabilities/test_context_overflow.js
const result = await testContextOverflow({
  reportedLimit: 131072,
  testSizes: [8192, 16384, 32768, 65536, 131072],
});

// Returns actual working context limit
```

### Test 4: Streaming Validation

```javascript
// tests/capabilities/test_streaming.js
const result = await testStreaming();

// Pass: Receives SSE events in correct format
// Fail: Connection drops or invalid format
```

## Model Capability Database Schema

```typescript
interface ModelCapabilityEntry {
  // Identification
  modelId: string; // From LMStudio API
  aliases: string[]; // Common name variations

  // Core Capabilities
  contextLength: {
    reported: number; // What model claims
    tested: number; // What actually works
    recommended: number; // Safe limit (80%)
  };

  toolCalling: {
    supported: boolean;
    accuracy: {
      simple: number; // 0-100% (1-2 params)
      medium: number; // 0-100% (3-5 params)
      complex: number; // 0-100% (5+ params)
    };
    notes: string;
  };

  streaming: {
    supported: boolean;
    reliability: number; // 0-100%
  };

  // Performance
  performance: {
    promptProcessing: "fast" | "medium" | "slow" | "very-slow";
    tokenGeneration: number; // tokens/second (typical)
    firstTokenLatency: number; // milliseconds (typical)
  };

  // Recommendations
  bestFor: string[]; // ["code", "chat", "analysis"]
  avoidFor: string[]; // ["tool-heavy-workflows", "long-context"]

  // Metadata
  testedBy: string[]; // GitHub usernames
  lastTested: Date;
  anyclaudeVersion: string;
}
```

## User Contribution Workflow

1. User runs `anyclaude --test`
2. Results displayed and saved to `~/.anyclaude/model-capabilities.json`
3. User can submit results via GitHub issue or PR
4. Maintainers merge into official database

## CLI Commands

```bash
# Test current model capabilities
anyclaude --test

# Show known capabilities for model
anyclaude --capabilities

# Force re-test (ignore cache)
anyclaude --test --force

# Export test results for sharing
anyclaude --test --export capabilities.json

# Import community database
anyclaude --import-capabilities community-db.json
```

## GitHub Integration

### Issue Template: Report Model Capabilities

```markdown
**Model**: qwen3-coder-30b-a3b-instruct-mlx
**Context Length**: 262,144 tokens (tested: 262,144 works)
**Tool Calling**: ⚠️ Partial (60% accuracy)
**Streaming**: ✅ Works

**Test Results**:

- Simple tools: ✅ 95% success
- Medium tools: ⚠️ 60% success
- Complex tools: ❌ 30% success

**Notes**: Good for code generation, struggles with Claude Code's complex schemas

**Hardware**: M4 Max, 128GB RAM, 96GB GPU
**LMStudio**: 0.3.5
**anyclaude**: 1.0.0
```

## Implementation Phases

### Phase 1: Core Detection (Week 1)

- [ ] Implement capability testing functions
- [ ] Add warning system for unsupported features
- [ ] Create basic model database

### Phase 2: CLI Integration (Week 2)

- [ ] Add `--test` command
- [ ] Add `--capabilities` command
- [ ] Cache capability results

### Phase 3: Community Database (Week 3)

- [ ] Create contribution workflow
- [ ] Add issue templates
- [ ] Implement database updates

### Phase 4: Advanced Features (Future)

- [ ] Automatic fallbacks for unsupported features
- [ ] Model recommendation based on use case
- [ ] Integration with LMStudio model browser

## Related Issues

- Tool calling limitations (#X)
- Context detection (#X)
- Performance benchmarking (#X)

## Success Criteria

1. ✅ User can run `anyclaude --test` and get accurate capability report
2. ✅ Warnings appear when model lacks required capabilities
3. ✅ Database covers 10+ popular models
4. ✅ Community can easily contribute test results
5. ✅ Reduced "why isn't this working?" support requests

---

**Priority**: High

**Effort**: Medium (2-3 weeks)

**Impact**: High (improves user experience significantly)

**Dependencies**:

- Context detection feature (completed)
- Tool calling infrastructure (completed)

**Nice to Have**:

- Integration with LMStudio model browser
- Automatic model recommendation
- Cloud-based capability database
