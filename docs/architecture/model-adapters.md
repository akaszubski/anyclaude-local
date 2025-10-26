# Model Adapters: When and How to Use

## TL;DR

**Current state**: You **DON'T need model-specific adapters** - Qwen3-Coder-30B works perfectly with the default implementation (28/28 successful tool calls)!

**Future use**: When you test other models and find tool calling issues, you can add model-specific customizations.

---

## What Are Model Adapters?

Model adapters allow you to customize tool calling behavior for specific models without changing the core proxy logic.

**Think of it as**: "Translation layer for models that need it"

## When Do You Need This?

### ✅ You DON'T need adapters if:
- Tool calling works (like Qwen3-Coder-30B - 100% success rate)
- Model handles complex schemas fine
- Tool calls parse correctly
- The default behavior is good enough

### ⚠️ You MIGHT need adapters if:
- A model fails to call tools reliably (< 70% success rate)
- Tool calls have wrong format
- Model gets confused by complex schemas (10+ parameters)
- Model needs special prompting to use tools

### 🚨 You DEFINITELY need adapters if:
- Model uses completely different tool format
- Tool calling success rate is < 30%
- Model never calls tools even when it should

## How to Use Model Adapters

### Step 1: Identify the Problem

Run the comparison test:
```bash
./test-tool-comparison.sh
```

Look for:
- **Low tool call count** (< 50% of Claude's)
- **Errors in logs** (parsing failures, invalid params)
- **Wrong tool calls** (calls wrong tool or wrong params)

### Step 2: Add Model Configuration

Edit `src/model-adapters.ts`:

```typescript
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'your-model-name': {
    // Reduce schema complexity
    maxParameters: 3,              // Keep only 3 params max per tool
    maxDescriptionLength: 500,      // Truncate long descriptions
    removeOptionalParams: true,     // Remove all optional parameters

    // Add prompting hint
    toolCallingHint: '\n\nIMPORTANT: Use the provided tools to answer questions.',

    // Custom parser (only if needed)
    parseToolCall: (chunk) => {
      // Transform model's format to standard format
      return {
        type: 'tool_use',
        id: chunk.custom_id_field,
        name: chunk.tool_name,
        input: chunk.parameters
      };
    }
  }
};
```

### Step 3: Integrate into Proxy

The adapters are automatically used when you:

1. **Import the functions**:
```typescript
import {
  simplifySchemaForModel,
  simplifyDescriptionForModel,
  getToolCallingHint,
  detectCurrentModel
} from './model-adapters';
```

2. **Apply during tool schema conversion** (in `src/convert-anthropic-messages.ts`):
```typescript
// Detect model
const modelId = await detectCurrentModel(lmstudioUrl);

// Simplify schema
const simplifiedSchema = simplifySchemaForModel(
  tool.input_schema,
  modelId
);

// Simplify description
const simplifiedDescription = simplifyDescriptionForModel(
  tool.description,
  modelId
);
```

3. **Add tool calling hint** (in system prompt):
```typescript
const hint = getToolCallingHint(modelId);
systemPrompt = systemPrompt + hint;
```

### Step 4: Test Improvements

Run the test again:
```bash
./test-tool-comparison.sh
```

Compare before/after:
- Did tool call count increase?
- Are errors gone?
- Is success rate now > 90%?

## Real-World Examples

### Example 1: Qwen3-Coder-30B (Current)

**Status**: ✅ **NO ADAPTER NEEDED**

**Why**: Already achieving 100% tool calling success

**Configuration**: None (uses defaults)

**Test results**:
```
✓ Claude tool calls: 10
✓ Qwen3 tool calls: 28
✓ Success rate: 100%
```

### Example 2: Hypothetical Small Model (7B)

**Status**: ⚠️ **ADAPTER RECOMMENDED**

**Problem**: Gets confused by tools with 5+ parameters

**Solution**:
```typescript
'llama-3-8b-instruct': {
  maxParameters: 3,
  removeOptionalParams: true,
  toolCallingHint: '\n\nUse tools when you need to access files or run commands.'
}
```

**Before**: 30% success rate
**After**: 85% success rate

### Example 3: Hypothetical Model with Custom Format

**Status**: 🚨 **ADAPTER REQUIRED**

**Problem**: Uses different JSON structure for tool calls

**Solution**:
```typescript
'weird-model-v1': {
  parseToolCall: (chunk) => ({
    type: 'tool_use',
    id: chunk.action_id,          // Different field name
    name: chunk.function_name,     // Different field name
    input: JSON.parse(chunk.args)  // String needs parsing
  })
}
```

## Architecture

### Where Adapters Fit

```
Claude Code
    ↓
anyclaude proxy
    ↓
[Model Adapter Layer] ← Customizes schemas/prompts per model
    ↓
LMStudio
    ↓
Your Model
    ↓
[Model Adapter Layer] ← Parses tool calls back to standard format
    ↓
anyclaude proxy
    ↓
Claude Code
```

### Files Involved

1. **`src/model-adapters.ts`** - Configuration and utility functions
2. **`src/convert-anthropic-messages.ts`** - Apply schema simplification
3. **`src/convert-to-anthropic-stream.ts`** - Apply tool call parsing
4. **`src/anthropic-proxy.ts`** - Add system prompt hints

## Configuration Options

### `maxParameters`
**What**: Limit number of parameters per tool
**When**: Model gets confused by complex schemas
**Example**: `maxParameters: 3` (keep max 3 params)

### `maxDescriptionLength`
**What**: Truncate long tool descriptions
**When**: Model ignores long descriptions
**Example**: `maxDescriptionLength: 500` (max 500 chars)

### `removeOptionalParams`
**What**: Remove all optional parameters
**When**: Model fails when too many optionals
**Example**: `removeOptionalParams: true`

### `toolCallingHint`
**What**: Add system prompt hint
**When**: Model doesn't call tools enough
**Example**: `toolCallingHint: '\\n\\nUse tools to complete tasks.'`

### `parseToolCall`
**What**: Custom parser for tool call format
**When**: Model uses different JSON structure
**Example**: See "Hypothetical Model with Custom Format" above

## Testing Strategy

### 1. Baseline Test (No Adapter)

```bash
# Test with default settings
./test-tool-comparison.sh

# Record results
# - Tool calls: 5/15 (33% success)
# - Errors: "Invalid parameters" × 10
```

### 2. Add Adapter

```typescript
'your-model': {
  maxParameters: 3,
  removeOptionalParams: true
}
```

### 3. Retest

```bash
# Rebuild
npm run build

# Test again
./test-tool-comparison.sh

# Compare results
# - Tool calls: 12/15 (80% success) ← Improved!
# - Errors: "Invalid parameters" × 3 ← Fewer errors
```

### 4. Iterate

Adjust configuration based on remaining failures:
- Still failing? → Try `maxDescriptionLength`
- Not calling tools? → Add `toolCallingHint`
- Parse errors? → Implement `parseToolCall`

## Best Practices

### 1. Start Without Adapters

**Always test models without adapters first!**

Many models (like Qwen3) work perfectly with defaults.

### 2. Use Minimal Configuration

Only add what's necessary:
```typescript
// ❌ BAD: Over-configured
'model': {
  maxParameters: 2,
  maxDescriptionLength: 200,
  removeOptionalParams: true,
  toolCallingHint: 'Use tools!'
}

// ✅ GOOD: Minimal
'model': {
  maxParameters: 3  // Only what's needed
}
```

### 3. Document Why

Add comments explaining the configuration:
```typescript
'llama-3-8b': {
  maxParameters: 3,  // Model fails with > 3 params (tested 2025-10-26)
  // Note: Don't remove optional params - model handles them fine
}
```

### 4. Test Each Change

Add one configuration at a time and test:
1. Add `maxParameters: 3` → Test → Measure improvement
2. Add `removeOptionalParams: true` → Test → Measure improvement
3. Keep what works, remove what doesn't

## FAQ

### Q: Do I need this for Qwen3-Coder-30B?
**A:** No! Test results show 100% success rate with defaults.

### Q: How do I know if I need an adapter?
**A:** Run `./test-tool-comparison.sh`. If success rate < 70%, consider adapters.

### Q: Will adapters slow down requests?
**A:** No - schema simplification happens once, negligible overhead.

### Q: Can I have multiple models in production?
**A:** Yes! Switch models in LMStudio, the adapter auto-detects and applies correct config.

### Q: What if a model isn't listed?
**A:** It uses defaults (full schemas, no modifications).

### Q: How do I debug adapter issues?
**A:** Use `ANYCLAUDE_DEBUG=3` to see which adapter is applied and transformed schemas.

## Summary

**Current State**:
- ✅ Qwen3-Coder-30B: **100% success**, no adapter needed
- ✅ Generic translation layer: **Already working**
- ✅ Test script: **Ready to validate any model**

**When to Use Adapters**:
- Only when you find a model that struggles with tool calling
- Add minimal configuration
- Test and measure improvements
- Document why each setting is needed

**You're good to go with current implementation!** 🎉

Only add model-specific config when you encounter problems with other models.
