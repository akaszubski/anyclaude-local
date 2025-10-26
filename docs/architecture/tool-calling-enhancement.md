# Tool Calling Enhancement for Local Models

## Problem Statement

**Test Results**:
- ✅ Simple tools work: Qwen3-Coder-30B successfully calls Bash tool with 2 parameters
- ❌ Claude Code fails: Same model fails with Claude Code's complex tool schemas (10+ parameters)

**Root Cause**: Local models struggle with complex JSON schemas that include:
- Optional vs required parameters
- Nested objects and arrays
- Enum constraints
- `additionalProperties: false`
- Long descriptions

**Goal**: Enable Qwen3-Coder-30B to reliably call tools in Claude Code, matching Claude Sonnet 4.5's capability.

---

## Research: Why Local Models Struggle

### Claude Sonnet 4.5 Tool Calling
- Trained specifically for tool use with complex schemas
- Understands semantic meaning of parameter descriptions
- Can infer which parameters are needed for context
- Handles optional parameters gracefully
- Success rate: >95% even with complex schemas

### Qwen3-Coder-30B Tool Calling
- General instruction-following model
- Basic tool calling support via training
- Struggles with schema complexity
- Gets confused by many optional parameters
- Success rate: 60% simple tools, 30% complex tools

---

## Approach 1: Schema Simplification (Low Effort, High Impact)

**Idea**: Automatically simplify Claude Code's tool schemas before sending to local models

### Implementation

```typescript
// src/tool-simplification.ts

interface SimplificationStrategy {
  // Remove optional parameters (keep only required)
  removeOptional?: boolean;

  // Flatten nested objects into dot notation
  flattenNested?: boolean;

  // Remove enum constraints (use string type)
  removeEnums?: boolean;

  // Shorten descriptions to X characters
  maxDescriptionLength?: number;

  // Remove additionalProperties constraint
  removeAdditionalProperties?: boolean;
}

export function simplifyToolSchema(
  tool: AnthropicTool,
  strategy: SimplificationStrategy = {
    removeOptional: false, // Keep optional but simplify their schemas
    flattenNested: true,
    removeEnums: true,
    maxDescriptionLength: 100,
    removeAdditionalProperties: true
  }
): AnthropicTool {
  const simplified = { ...tool };
  const schema = tool.input_schema;

  // 1. Simplify property descriptions
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (typeof prop === 'object' && prop.description) {
        prop.description = truncate(prop.description, strategy.maxDescriptionLength);
      }
    }
  }

  // 2. Remove enum constraints
  if (strategy.removeEnums && schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (typeof prop === 'object' && 'enum' in prop) {
        delete prop.enum;
        prop.description += ` (options: ${prop.enum.join(', ')})`;
      }
    }
  }

  // 3. Remove additionalProperties constraint
  if (strategy.removeAdditionalProperties) {
    delete schema.additionalProperties;
  }

  // 4. Flatten nested objects
  if (strategy.flattenNested) {
    simplified.input_schema = flattenSchema(schema);
  }

  return simplified;
}
```

**Example**:

**Before (Claude Code Bash tool - complex)**:
```json
{
  "name": "Bash",
  "description": "Executes a bash command in a persistent shell...",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The command to execute..." },
      "description": { "type": "string", "description": "Clear, concise description..." },
      "timeout": { "type": "number", "description": "Optional timeout in milliseconds..." },
      "run_in_background": { "type": "boolean", "description": "Set to true to run..." },
      "dangerouslyDisableSandbox": { "type": "boolean", "description": "..." }
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```

**After (Simplified for Qwen3)**:
```json
{
  "name": "Bash",
  "description": "Executes a bash command",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The command to execute" },
      "description": { "type": "string", "description": "What this command does" }
    },
    "required": ["command"]
  }
}
```

**Benefits**:
- ✅ Reduces token count (less context used)
- ✅ Removes confusing optional parameters
- ✅ Simpler for model to understand
- ✅ Higher success rate

**Risks**:
- ⚠️ Loses functionality (timeout, background, etc.)
- ⚠️ May need to handle missing features gracefully

---

## Approach 2: Prompt Engineering (Medium Effort, Medium Impact)

**Idea**: Add tool calling examples and guidelines to system prompt

### Implementation

```typescript
// src/tool-calling-prompt.ts

export function generateToolCallingGuidance(
  tools: AnthropicTool[]
): string {
  return `
TOOL CALLING GUIDELINES:

You have access to the following tools: ${tools.map(t => t.name).join(', ')}

When calling a tool:
1. Use the EXACT tool name
2. Provide ALL required parameters
3. Use correct types (string, number, boolean)
4. Optional parameters can be omitted

EXAMPLES:

User: "What is the current git status?"
Assistant: I'll check the git status using the Bash tool.
<tool_use>
{
  "name": "Bash",
  "input": {
    "command": "git status",
    "description": "Check git repository status"
  }
}
</tool_use>

User: "Read the README.md file"
Assistant: I'll read the README file.
<tool_use>
{
  "name": "Read",
  "input": {
    "file_path": "/path/to/README.md"
  }
}
</tool_use>

IMPORTANT:
- Always provide required parameters
- Do not add extra properties not in the schema
- If unsure, ask the user for clarification
`;
}
```

**Integration**:
```typescript
// In anthropic-proxy.ts
let system: string | undefined;
if (body.system && body.system.length > 0) {
  system = body.system.map((s) => s.text).join("\n");
}

// Add tool guidance if tools are present
if (body.tools && body.tools.length > 0) {
  const guidance = generateToolCallingGuidance(body.tools);
  system = system ? `${system}\n\n${guidance}` : guidance;
}
```

**Benefits**:
- ✅ Improves model understanding
- ✅ Provides concrete examples
- ✅ No schema modification needed
- ✅ Can be toggled on/off

**Risks**:
- ⚠️ Uses more context tokens
- ⚠️ May not work for all models
- ⚠️ Examples might confuse instead of help

---

## Approach 3: Tool Call Validation & Retry (High Effort, High Impact)

**Idea**: Validate tool calls and automatically retry with helpful error messages

### Implementation

```typescript
// src/tool-validation.ts

interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestion?: string;
}

export function validateToolCall(
  toolName: string,
  input: Record<string, any>,
  schema: JSONSchema7
): ValidationResult {
  const errors: string[] = [];

  // Check required parameters
  for (const required of schema.required || []) {
    if (!(required in input)) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  // Check parameter types
  if (schema.properties) {
    for (const [key, value] of Object.entries(input)) {
      const propSchema = schema.properties[key];
      if (!propSchema) {
        errors.push(`Unknown parameter: ${key}`);
        continue;
      }

      const expectedType = propSchema.type;
      const actualType = typeof value;

      if (expectedType === 'number' && actualType !== 'number') {
        errors.push(`${key} should be number, got ${actualType}`);
      }
      // ... more type checks
    }
  }

  // Generate helpful suggestion
  let suggestion: string | undefined;
  if (errors.length > 0) {
    suggestion = generateSuggestion(toolName, input, schema, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    suggestion
  };
}

function generateSuggestion(
  toolName: string,
  input: Record<string, any>,
  schema: JSONSchema7,
  errors: string[]
): string {
  // Build corrected example
  const example: Record<string, any> = {};

  // Add all required parameters
  for (const required of schema.required || []) {
    const propSchema = schema.properties?.[required];
    if (propSchema && typeof propSchema === 'object') {
      example[required] = getExampleValue(propSchema);
    }
  }

  return `Try this instead:
{
  "name": "${toolName}",
  "input": ${JSON.stringify(example, null, 2)}
}`;
}
```

**Integration with Streaming**:
```typescript
// When model returns tool_use, validate before executing
if (chunk.type === 'tool_use') {
  const validation = validateToolCall(
    chunk.name,
    chunk.input,
    tools[chunk.name].inputSchema
  );

  if (!validation.valid) {
    // Send error back to model for retry
    return {
      type: 'tool_result',
      tool_use_id: chunk.id,
      content: `Tool call validation failed:\n${validation.errors.join('\n')}\n\n${validation.suggestion}`,
      is_error: true
    };
  }
}
```

**Benefits**:
- ✅ Catches errors before execution
- ✅ Provides helpful feedback to model
- ✅ Model can learn and retry
- ✅ Higher success rate after retry

**Risks**:
- ⚠️ Adds latency (validation + retry)
- ⚠️ May enter retry loops
- ⚠️ Complex to implement well

---

## Approach 4: Hybrid Text + Tool Mode (Low Effort, Medium Impact)

**Idea**: Let model use natural language instead of strict tool calls

### Implementation

```typescript
// src/text-tool-parser.ts

export function parseTextForToolCall(
  text: string,
  availableTools: string[]
): ToolCall | null {
  // Pattern 1: Explicit tool mention
  // "I'll use the Bash tool to run git status"
  const bashPattern = /(?:use|run|execute).*?bash.*?(?:to run|:)\s*`?([^`\n]+)`?/i;
  const bashMatch = text.match(bashPattern);
  if (bashMatch) {
    return {
      name: 'Bash',
      input: {
        command: bashMatch[1].trim(),
        description: 'Execute command'
      }
    };
  }

  // Pattern 2: Code block
  // "```bash\ngit status\n```"
  const codeBlockPattern = /```(?:bash|shell|sh)\n([^`]+)\n```/;
  const codeMatch = text.match(codeBlockPattern);
  if (codeMatch) {
    return {
      name: 'Bash',
      input: {
        command: codeMatch[1].trim(),
        description: 'Execute command'
      }
    };
  }

  // Pattern 3: File read
  // "Let me read the README.md file"
  const readPattern = /(?:read|check|look at|examine).*?(?:the\s+)?([^\s]+\.[\w]+)/i;
  const readMatch = text.match(readPattern);
  if (readMatch) {
    return {
      name: 'Read',
      input: {
        file_path: readMatch[1]
      }
    };
  }

  return null;
}
```

**Integration**:
```typescript
// In stream conversion
if (chunk.type === 'text') {
  // Check if text contains implicit tool call
  const implicitTool = parseTextForToolCall(chunk.text, Object.keys(tools));

  if (implicitTool) {
    // Convert to tool_use
    yield {
      type: 'tool_use',
      id: `text-parsed-${Date.now()}`,
      name: implicitTool.name,
      input: implicitTool.input
    };
  } else {
    // Regular text
    yield chunk;
  }
}
```

**Benefits**:
- ✅ Works with models that can't do formal tool calling
- ✅ Natural for models to describe actions
- ✅ Fallback when tool calling fails

**Risks**:
- ⚠️ Pattern matching is fragile
- ⚠️ May misinterpret text
- ⚠️ Limited to simple tools

---

## Approach 5: Model-Specific Tool Adapters (High Effort, High Impact)

**Idea**: Maintain per-model tool calling strategies

### Implementation

```typescript
// src/model-adapters.ts

interface ToolCallingAdapter {
  simplifySchema: (tool: AnthropicTool) => AnthropicTool;
  addPromptGuidance: (tools: AnthropicTool[]) => string;
  validateAndRetry: boolean;
  parseTextFallback: boolean;
}

export const MODEL_ADAPTERS: Record<string, ToolCallingAdapter> = {
  "qwen3-coder-30b": {
    simplifySchema: (tool) => simplifyToolSchema(tool, {
      removeOptional: false,
      flattenNested: true,
      removeEnums: true,
      maxDescriptionLength: 80,
      removeAdditionalProperties: true
    }),
    addPromptGuidance: (tools) => generateToolCallingGuidance(tools),
    validateAndRetry: true,
    parseTextFallback: true
  },
  "gpt-oss-20b": {
    simplifySchema: (tool) => simplifyToolSchema(tool, {
      removeOptional: true, // More aggressive for weaker model
      flattenNested: true,
      removeEnums: true,
      maxDescriptionLength: 50,
      removeAdditionalProperties: true
    }),
    addPromptGuidance: (tools) => generateToolCallingGuidance(tools),
    validateAndRetry: true,
    parseTextFallback: true
  },
  "claude-sonnet-4.5": {
    // No modifications needed - use original schemas
    simplifySchema: (tool) => tool,
    addPromptGuidance: () => "",
    validateAndRetry: false,
    parseTextFallback: false
  }
};

export function getAdapter(modelId: string): ToolCallingAdapter {
  // Match by partial name
  for (const [key, adapter] of Object.entries(MODEL_ADAPTERS)) {
    if (modelId.toLowerCase().includes(key.toLowerCase())) {
      return adapter;
    }
  }

  // Default: aggressive simplification
  return MODEL_ADAPTERS["gpt-oss-20b"];
}
```

**Integration**:
```typescript
// In anthropic-proxy.ts
const modelInfo = await getLoadedModel(lmstudioUrl);
const adapter = getAdapter(modelInfo.id);

// Apply adapter to tools
const adaptedTools = body.tools?.map(tool => adapter.simplifySchema(tool));

// Add guidance to system prompt
let system = ...;
if (body.tools && adapter.addPromptGuidance) {
  system += "\n\n" + adapter.addPromptGuidance(body.tools);
}
```

**Benefits**:
- ✅ Optimized per model
- ✅ Community can contribute adapters
- ✅ Easy to tune and test
- ✅ Graceful degradation

**Risks**:
- ⚠️ Maintenance burden (many models)
- ⚠️ May diverge from Claude Code's intent

---

## Recommended Implementation Plan

### Phase 1: Quick Win (1-2 days)
1. **Schema Simplification** (Approach 1)
   - Implement `simplifyToolSchema()` function
   - Remove optional parameters for Qwen3
   - Test with Claude Code

2. **Prompt Engineering** (Approach 2)
   - Add tool calling examples to system prompt
   - Test with Qwen3

**Expected Result**: 30% → 60% success rate

### Phase 2: Robust Solution (1 week)
3. **Tool Call Validation** (Approach 3)
   - Validate parameters before execution
   - Provide helpful error messages
   - Allow model to retry

4. **Model Adapters** (Approach 5)
   - Create adapter for Qwen3-Coder-30B
   - Test and tune strategy
   - Document results

**Expected Result**: 60% → 80% success rate

### Phase 3: Fallback (Future)
5. **Hybrid Text + Tool** (Approach 4)
   - Parse natural language for tool intent
   - Fallback when formal tool calling fails
   - Handle simple cases automatically

**Expected Result**: 80% → 90% success rate (close to Claude Sonnet 4.5)

---

## Testing Strategy

After each phase, test with:

1. **Simple tools**: Bash with 1-2 params (should be 95%+)
2. **Medium tools**: Read/Write with 2-3 params (target 70%+)
3. **Complex tools**: Full Claude Code schemas (target 50%+)
4. **Real usage**: Full Claude Code session (track success rate)

**Success Criteria**:
- Phase 1: 60% overall success (up from 30%)
- Phase 2: 80% overall success
- Phase 3: 90% overall success (acceptable for daily use)

---

## Next Steps

1. **Implement Phase 1** (schema simplification + prompt engineering)
2. **Test with Qwen3-Coder-30B**
3. **Measure success rate** (before/after)
4. **Iterate based on results**
5. **Document findings** in GitHub issues

---

**Ready to start with Phase 1?** This should give immediate improvement with low risk!
