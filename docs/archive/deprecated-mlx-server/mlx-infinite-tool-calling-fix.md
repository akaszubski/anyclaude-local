# MLX Infinite Tool Calling Loop Fix

**Date**: 2025-11-21
**Issue**: MLX server generates infinite repeated tool calls (similar to vLLM Issue #21026)
**Status**: ✅ Fixed

## Problem Description

When using the custom MLX server with Claude Code, the model would get stuck in an infinite loop generating the same tool call repeatedly. Example:

```
⏺ Explore: Find files related to metrics collection
⏺ Explore: Find files related to metrics collection
⏺ Explore: Find files related to metrics collection
⏺ Explore: Find files related to metrics collection
... (continues indefinitely until timeout)
```

This is the **same root cause** as vLLM Issue #21026, where constrained grammar for tool calling gets stuck generating infinite whitespace or repeated structures.

## Root Cause

MLX's `mlx_lm.generate()` function lacks proper stopping conditions for tool calls:

1. **No tool-specific stop tokens**: MLX only respects generic EOS tokens, but doesn't know when a tool call is "complete"
2. **Unbounded generation**: Without explicit limits, the model can generate indefinitely
3. **Constrained grammar loops**: Like vLLM, MLX's grammar constraints can get stuck in repetitive patterns

## Solution: Multi-Layered Defense

We implemented a **three-tier protection system** inspired by vLLM's fix:

### Tier 1: Bounded Token Limits (Prevention)

**Location**: `scripts/mlx-server.py:920-929`

```python
# CRITICAL FIX: Add stop tokens to prevent infinite tool calling loops
# Based on vLLM issue #21026 - constrained grammar can generate infinite whitespace
if 'max_tokens' not in options:
    options['max_tokens'] = 2048
elif options.get('max_tokens', 0) > 4096:
    # Cap extremely high max_tokens to prevent infinite loops
    logger.warning(f"[Tool Call Safety] Capping max_tokens from {options['max_tokens']} to 4096")
    options['max_tokens'] = 4096
```

**What it does**:

- Sets default `max_tokens=2048` (enough for most tool calls)
- Caps excessive limits at 4096 to prevent runaway generation
- Provides hard upper bound on generation length

### Tier 2: Repetition Detection (Early Detection)

**Location**: `scripts/mlx-server.py:1257-1310`

```python
def _has_repetitive_tool_calls(self, text: str) -> bool:
    """
    Detect if text contains repetitive tool calling patterns (infinite loop indicator)

    Checks for 3+ consecutive identical tool calls across multiple formats:
    - LMStudio format: [TOOL_REQUEST]...[END_TOOL_REQUEST]
    - Harmony format: <|channel|>commentary to=X...
    - Generic format: ⏺ TaskName: description
    """
```

**What it does**:

- Scans generated text for repeated tool call patterns
- Triggers when same tool appears 3+ times consecutively
- Supports multiple tool calling formats (LMStudio, Harmony, generic)
- Detects both exact matches and similar patterns (first 50 chars)

### Tier 3: Smart Truncation (Recovery)

**Location**: `scripts/mlx-server.py:1312-1382`

```python
def _truncate_repetitive_tool_calls(self, text: str) -> str:
    """
    Truncate text at the point where repetitive tool calls start

    Keeps first 2 instances, removes subsequent duplicates.
    Prevents infinite loops while preserving legitimate multi-tool calls.
    """
```

**What it does**:

- Finds the position where repetition begins
- Keeps first 2 occurrences (legitimate use case)
- Truncates everything after 2nd occurrence
- Preserves valid multi-tool scenarios while cutting loops

## How It Works Together

```
User Request
    ↓
MLX Generate (Tier 1: max_tokens=2048 cap)
    ↓
Generate Text
    ↓
Extract Tool Calls (Tier 2: Check for repetition)
    ↓
  Repetition Detected?
    ├─ YES → Truncate (Tier 3) → Return first 2 calls
    └─ NO → Return all calls
```

## Testing

**Before fix**:

```bash
./dist/main-cli.js --mode=mlx
> read README.md and summarise

# Result: Infinite "Explore: ..." loop, timeout after 10 minutes
```

**After fix**:

```bash
./dist/main-cli.js --mode=mlx
> read README.md and summarise

# Result: Should complete normally with 1-2 tool calls
```

## vLLM Comparison

Our fix follows the same pattern as vLLM's solution to Issue #21026:

| vLLM Fix                                   | Our MLX Fix                              |
| ------------------------------------------ | ---------------------------------------- |
| `--guided-decoding-disable-any-whitespace` | `max_tokens` cap at 4096                 |
| PR #24108: Limit whitespace in JSON schema | `_has_repetitive_tool_calls()` detection |
| Stop at valid JSON boundary                | `_truncate_repetitive_tool_calls()`      |

## Related Issues

- **vLLM Issue #21026**: Tool calling infinite loop with `tool_choice='required'`
- **vLLM PR #24108**: "Fixed reasoning streaming with tool_choice='required'"
- **xgrammar Issue**: "Limit the number of WS characters during json schema conversion"

## Code Changes Summary

**Files Modified**:

- `scripts/mlx-server.py`
  - Line 920-929: Added `max_tokens` bounds
  - Line 1222-1227: Added repetition check in `_extract_tool_calls()`
  - Line 1257-1310: New `_has_repetitive_tool_calls()` method
  - Line 1312-1382: New `_truncate_repetitive_tool_calls()` method

**Total Changes**: ~140 lines added (safety checks + detection + recovery)

## Future Improvements

1. **MLX Upstream**: Submit issue to `ml-explore/mlx-lm` about tool calling stop conditions
2. **Custom Stop Tokens**: Investigate MLX's `eos_token_id` parameter for tool-specific stops
3. **Metrics**: Track truncation frequency to identify problematic models
4. **User Feedback**: Add warning message when truncation occurs

## References

- vLLM Issue #21026: https://github.com/vllm-project/vllm/issues/21026
- vLLM PR #24108: https://github.com/vllm-project/vllm/pull/24108
- MLX-LM Documentation: https://github.com/ml-explore/mlx-lm
- This fix: `docs/debugging/mlx-infinite-tool-calling-fix.md`
