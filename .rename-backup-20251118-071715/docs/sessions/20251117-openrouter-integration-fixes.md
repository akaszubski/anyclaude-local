# OpenRouter Integration Fixes - Session 2025-11-17

## Overview

This session fixed critical bugs in OpenRouter integration and added comprehensive model selection capabilities.

## Issues Found and Fixed

### Issue #1: OpenRouter Provider Not Using OpenAI Format

**Symptom:**

```
Error: Invalid input: expected string, received array at path ["input"]
```

**Root Cause:**
`src/anthropic-proxy.ts:821` was missing `openrouter` from the OpenAI-compatible provider check.

**Fix:**

```typescript
// Before:
const languageModel =
  providerName === "lmstudio" || providerName === "vllm-mlx"
    ? (provider as any).chat(model)
    : provider.languageModel(model);

// After:
const languageModel =
  providerName === "lmstudio" ||
  providerName === "vllm-mlx" ||
  providerName === "openrouter"
    ? (provider as any).chat(model)
    : provider.languageModel(model);
```

**Files Changed:**

- `src/anthropic-proxy.ts:828`

**Test Coverage Needed:**

- Verify OpenRouter uses `.chat()` method (OpenAI format)
- Verify tool calling works with OpenRouter
- Verify streaming works with OpenRouter

---

### Issue #2: Context Warnings Showing "LOCAL MODEL LIMITATION" for Cloud Models

**Symptom:**

```
⚠️  IMPORTANT - LOCAL MODEL LIMITATION:
  Claude Sonnet 4.5 auto-compresses context while preserving
  key information. Local models cannot do this...
```

This warning appeared even when using OpenRouter (cloud models).

**Root Cause:**
Context warning logic in `src/context-manager.ts` didn't skip warnings for cloud models.

**Fix:**

```typescript
// src/context-manager.ts:272-300
export function logContextWarning(
  stats: ContextStats,
  mode?: "claude" | "lmstudio" | "vllm-mlx" | "openrouter"
): void {
  // Skip warnings for cloud models with large context windows
  if (mode === "claude" || mode === "openrouter") {
    return;
  }
  // ... rest of warning logic
}
```

**Files Changed:**

- `src/context-manager.ts:272-300`
- `src/anthropic-proxy.ts:697-726` (made truncation warnings mode-aware)

**Test Coverage Needed:**

- Verify no warnings for `mode=claude`
- Verify no warnings for `mode=openrouter`
- Verify warnings still appear for `mode=lmstudio` and `mode=vllm-mlx`

---

### Issue #3: Context Limit Detection Using Wrong Model Name

**Symptom:**

```
Limit: 26214 tokens (80% of claude-haiku-4-5-20251001)
```

Should have shown ~210K tokens (80% of 262K for qwen/qwen3-coder).

**Root Cause:**
Context limit calculation was using the configured model name instead of the actual model from `body.model` (what Claude Code sends).

**Fix:**

```typescript
// src/anthropic-proxy.ts:673
// Before:
const modelNameForContext = cachedModelName || model;

// After:
const modelNameForContext = body.model || cachedModelName || model;
```

**Files Changed:**

- `src/anthropic-proxy.ts:673`

**Test Coverage Needed:**

- Verify context limit uses `body.model` when available
- Verify fallback to `cachedModelName` works
- Verify fallback to config `model` works
- Test with various model names (Claude models, OpenRouter models, etc.)

---

### Issue #4: Missing OpenRouter Model IDs in Context Limits Table

**Symptom:**
Context limits defaulting to 32K for OpenRouter models instead of their actual limits.

**Root Cause:**
`MODEL_CONTEXT_LIMITS` table didn't have entries for OpenRouter model IDs.

**Fix:**
Added comprehensive model ID mappings:

```typescript
// src/context-manager.ts:24-43
// OpenRouter model IDs (provider/model-name format)
"qwen/qwen3-coder": 262144,
"deepseek/deepseek-chat-v3.1": 163840,
"openai/gpt-4o": 128000,
"openai/gpt-4o-mini": 128000,
"google/gemini-2.0-flash-exp:free": 1048576,
"google/gemini-2.5-flash": 1048576,
"google/gemini-2.5-flash-lite": 1048576,
"z-ai/glm-4.6": 204800,
"meta-llama/llama-3.3-70b-instruct": 131072,
"anthropic/claude-3.5-sonnet": 200000,

// Claude model names (what Claude Code sends)
"claude-sonnet-4-5-20250929": 200000,
"claude-haiku-4-5-20251001": 200000,
"claude-3-5-sonnet-20241022": 200000,
```

**Files Changed:**

- `src/context-manager.ts:24-43`

**Test Coverage Needed:**

- Verify all OpenRouter model IDs return correct context limits
- Verify Claude model IDs return correct context limits
- Verify unknown models fall back to 32K default
- Test partial matching (e.g., "gemini-2.5" matches "google/gemini-2.5-flash-lite")

---

## Regression Tests Needed

### Test Suite: OpenRouter Integration

**File:** `tests/regression/test_openrouter_integration.js`

```javascript
// Test 1: OpenRouter uses OpenAI format
test("OpenRouter provider uses .chat() method", () => {
  // Verify providerName === "openrouter" uses .chat()
});

// Test 2: Tool calling works with OpenRouter
test("OpenRouter supports tool calling", async () => {
  // Mock OpenRouter API
  // Send request with tools
  // Verify tools are in OpenAI format
  // Verify response is converted back to Anthropic format
});

// Test 3: Streaming works with OpenRouter
test("OpenRouter streaming works", async () => {
  // Mock streaming response
  // Verify SSE events are converted properly
});
```

### Test Suite: Context Limit Detection

**File:** `tests/regression/test_context_limit_detection.js`

```javascript
// Test 1: Uses body.model for context calculation
test('Context limit uses body.model when available', () => {
  const body = { model: 'claude-sonnet-4-5-20250929', messages: [...] };
  const stats = calculateContextStats(body.messages, body.system, body.tools, 'qwen/qwen3-coder');
  // Should use 'qwen/qwen3-coder' from body, not config
});

// Test 2: OpenRouter model IDs recognized
test('OpenRouter model IDs return correct context limits', () => {
  expect(getContextLimit('google/gemini-2.5-flash-lite')).toBe(1048576);
  expect(getContextLimit('qwen/qwen3-coder')).toBe(262144);
  expect(getContextLimit('deepseek/deepseek-chat-v3.1')).toBe(163840);
});

// Test 3: Claude model names recognized
test('Claude model names return correct context limits', () => {
  expect(getContextLimit('claude-sonnet-4-5-20250929')).toBe(200000);
  expect(getContextLimit('claude-haiku-4-5-20251001')).toBe(200000);
});

// Test 4: Unknown models use default
test('Unknown models fall back to 32K default', () => {
  expect(getContextLimit('unknown-model-xyz')).toBe(32768);
});
```

### Test Suite: Context Warnings

**File:** `tests/regression/test_context_warnings.js`

```javascript
// Test 1: No warnings for cloud models
test("No context warnings for mode=claude", () => {
  const stats = {
    /* ... */
  };
  const spy = jest.spyOn(console, "error");
  logContextWarning(stats, "claude");
  expect(spy).not.toHaveBeenCalled();
});

test("No context warnings for mode=openrouter", () => {
  const stats = {
    /* ... */
  };
  const spy = jest.spyOn(console, "error");
  logContextWarning(stats, "openrouter");
  expect(spy).not.toHaveBeenCalled();
});

// Test 2: Warnings still appear for local models
test("Context warnings appear for mode=lmstudio", () => {
  const stats = { exceedsLimit: true /* ... */ };
  const spy = jest.spyOn(console, "error");
  logContextWarning(stats, "lmstudio");
  expect(spy).toHaveBeenCalled();
});

// Test 3: Correct warning message for local vs cloud
test('Warning message does not mention "LOCAL MODEL LIMITATION" for cloud', () => {
  // Verify truncation warning message is mode-aware
});
```

## Benchmark Results

Performance benchmarks for OpenRouter models:

| Model                 | Speed  | Cost (in/out per 1M) | Context |
| --------------------- | ------ | -------------------- | ------- |
| Gemini 2.5 Flash Lite | 0.61s  | $0.10/$0.40          | 1M      |
| GPT-4o                | 0.74s  | $5.00/$15.00         | 128K    |
| Qwen3 Coder 480B      | 1.74s  | $0.22/$0.95          | 262K    |
| Gemini 2.5 Flash      | 1.73s  | $0.30/$2.50          | 1M      |
| DeepSeek V3.1         | 2.64s  | $0.20/$0.80          | 160K    |
| GLM-4.6               | 64.57s | $0.60/$2.00          | 200K    |

## Features Added

### Interactive Model Selector

**File:** `scripts/select-openrouter-model.sh`

- Color-coded CLI interface
- 10 curated models for coding
- One-command model switching
- Integrated benchmark data display
- Automatic config backup

**Usage:**

```bash
./scripts/select-openrouter-model.sh
```

### Benchmark Scripts

**Files:**

- `/tmp/quick-benchmark.sh` - Benchmark all major models
- `/tmp/benchmark-gemini-v2.sh` - Gemini-specific benchmarks

## Documentation Updates

**Files Updated:**

- `docs/guides/openrouter-model-selection.md` - Complete guide to model selection
- `scripts/shell-aliases.sh` - Added OpenRouter aliases
- `CLAUDE.md` - Updated with OpenRouter best practices (if applicable)

## Breaking Changes

None - all changes are backward compatible.

## Migration Guide

If you were using OpenRouter before these fixes:

1. **Rebuild:** `npm run build && npm link`
2. **Update config:** Run `./scripts/select-openrouter-model.sh` to select a model
3. **Test:** `anyclaude --mode=openrouter`

## Future Improvements

1. **Add more regression tests** for edge cases
2. **Add integration tests** for actual OpenRouter API calls (with mocking)
3. **Add performance regression tests** to catch slowdowns
4. **Add cost tracking** to monitor OpenRouter usage

## Related Issues

- Issue #1: OpenRouter tool calling not working
- Issue #2: Context warnings incorrect for cloud models
- Issue #3: Context limits not detected for OpenRouter models

## Testing Checklist

- [ ] All regression tests pass
- [ ] OpenRouter integration works end-to-end
- [ ] Model selector works for all 10 models
- [ ] Context limits correctly detected for all supported models
- [ ] No warnings appear for cloud models (claude, openrouter)
- [ ] Warnings still appear for local models (lmstudio, vllm-mlx)
- [ ] Benchmark scripts run successfully
- [ ] Documentation is accurate and up-to-date
