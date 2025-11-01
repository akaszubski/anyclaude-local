# System Prompt Regression Prevention

## Problem Summary

When you ran the `test` command in Claude Code, the model was generating garbage instead of responding:

- Strings of repeated digits: `0000000000...`, `1111111...`
- Escaped newlines: `]\n\n\n...`
- Malformed JSON fragments: Starting with `]` instead of proper text

This happened because **Claude Code's system prompt (6449 tokens) was being mangled** during conversion.

## Root Cause

In `src/anthropic-proxy.ts` (lines 484-490), there was code that stripped all newlines from system prompts:

```typescript
// BROKEN CODE (now disabled):
if (system && providerName === "vllm-mlx") {
  system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}
```

This "normalization" was collapsing carefully structured instructions into an incoherent single line, causing the model to generate garbage.

## The Fix

The fix is simple: **disable the problematic newline stripping**. vLLM-MLX handles newlines fine in system prompts.

```typescript
// FIXED CODE (commented out):
// if (system && providerName === "vllm-mlx") {
//   system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
// }
```

**Result:** Claude Code now gets proper responses instead of garbage.

## Testing Strategy

To prevent this regression, a comprehensive regression test was added: `tests/regression/test_system_prompt_regression.js`

### What the Test Validates

1. **System Prompt Structure Preservation**: Newlines and formatting are preserved
2. **Old Behavior Detection**: Demonstrates how the old code broke things
3. **Garbage Output Detection**: Identifies suspicious output patterns
4. **System Prompt Parsing**: Validates message format conversion
5. **Code Verification**: Checks that anthropic-proxy.ts has the fix applied

### Running the Test

```bash
# Run just this regression test
npm run test:regression:system-prompt

# Run all regression tests (includes this one)
npm run test:regression

# Run full test suite (includes this one)
npm test
```

### Test Output

```
╔════════════════════════════════════════════════════════════╗
║    SYSTEM PROMPT REGRESSION TESTS                         ║
║                                                            ║
║  Issue: Large system prompts were having newlines          ║
║  stripped, mangling Claude Code's instructions.            ║
║  Result: Model generated garbage instead of responses.     ║
║                                                            ║
║  Fix: Disabled problematic newline stripping.              ║
╚════════════════════════════════════════════════════════════╝

[Test 1] System Prompt Structure Preservation
  ✓ Newlines are preserved
  ✓ Line structure preserved
  ✓ Content length preserved
  ✓ Numbered list structure preserved
✅ System prompt structure preserved

[Test 2] Old Behavior (Newline Stripping) Detection
  Old behavior (with newline stripping): 0 newlines
  New behavior (preserving newlines): 47 newlines
✅ Old behavior correctly identified

[Test 3] Garbage Output Detection
  ✓ Repeated digits detected as garbage
  ✓ Escaped newlines detected as garbage
  ✓ Malformed JSON detected as garbage
  ✓ Normal responses pass through
✅ Garbage detection working correctly

[Test 4] System Prompt Array Parsing
  ✓ String format
  ✓ Array format
  ✓ Multi-element array
  ✓ Large system prompt
✅ System prompt parsing works correctly

[Test 5] Verify anthropic-proxy.ts Has Fix
  ✓ Newline stripping is disabled (commented out in code)
  ✓ System prompt newlines are preserved

════════════════════════════════════════════════════════════
Passed: 5/5
Failed: 0/5
════════════════════════════════════════════════════════════
```

## How This Prevents Regressions

The test runs:

1. **Before every commit** (pre-commit hook via `npm run typecheck`)
2. **Before every push** (pre-push hook runs full test suite)
3. **In CI/CD** (any pull request will run tests)

This means:

✅ If someone tries to add back the newline stripping, the test fails
✅ If system prompt parsing logic breaks, the test fails
✅ If garbage output patterns change, the test can be updated
✅ The fix is verified to be in place on every commit

## Files Changed

**Fixes:**

- `src/anthropic-proxy.ts` - Disabled problematic newline stripping

**Tests Added:**

- `tests/regression/test_system_prompt_regression.js` - Comprehensive regression test
- `package.json` - Added npm scripts for running the test

## Key Takeaways

1. **Automatic tests catch regressions**: The pre-commit and pre-push hooks ensure tests always run
2. **Targeted tests are better**: A focused test specifically for this issue is more effective than generic tests
3. **Document the "why"**: Comments explain why the code was commented out (vLLM-MLX handles newlines fine)
4. **Validate the fix**: The test verifies the fix is actually in place

## Related Documentation

- See `docs/debugging/stream-truncation-root-cause.md` for similar issues with backpressure
- See `CLAUDE.md` for project conventions on testing and documentation
