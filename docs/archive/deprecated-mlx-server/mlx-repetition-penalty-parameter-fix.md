# MLX Repetition Penalty Parameter Bug Fix

**Date**: 2025-01-20
**Status**: ✅ Fixed

## Problem

The MLX server was crashing on startup with this error:

```
ERROR:mlx:Generation error: generate_step() got an unexpected keyword argument 'repetition_penalty'
WARNING:mlx:MLX generation failed: generate_step() got an unexpected keyword argument 'repetition_penalty', using demo response
```

## Root Cause

The code was passing `repetition_penalty` and `repetition_context_size` parameters to `mlx_lm.generate()`, but the current version of the MLX library doesn't support these parameters.

**Code location**: `scripts/mlx-server.py:906`

```python
# Before (broken):
result = mlx_lm.generate(model, tokenizer, actual_prompt, **options)
# options included: repetition_penalty=1.05, repetition_context_size=20
```

**Investigation**:
```bash
$ python3 -c "from mlx_lm.generate import generate_step; help(generate_step)"
```

The `generate_step()` function signature shows it accepts:
- `max_tokens`
- `sampler`
- `logits_processors`
- `max_kv_size`
- `prompt_cache`
- etc.

But **NOT** `repetition_penalty` or `repetition_context_size`.

## Solution

Filter out unsupported parameters before passing to `mlx_lm.generate()`:

```python
# After (fixed):
# Filter out unsupported parameters
supported_options = {k: v for k, v in options.items()
                   if k not in ['repetition_penalty', 'repetition_context_size']}

result = mlx_lm.generate(model, tokenizer, actual_prompt, **supported_options)
```

**Changes**:
1. ✅ Added parameter filtering in `_generate_safe()` (line 905-912)
2. ✅ Updated comments to clarify these parameters aren't currently supported (line 1364-1366)

## Background: Why Were These Parameters Added?

The repetition penalty parameters were added in commit `c6e5e79` to prevent infinite repetition loops (see MLX GitHub issues #1131, #1059). However, it appears:

1. The MLX library API changed, or
2. The parameters were never actually supported by the version we're using

The default `repetition_penalty=1.05` was intended to be gentle enough for coding while preventing loops, but since MLX doesn't support it, we'll need to explore alternative solutions if repetition becomes an issue.

## Testing

```bash
# Kill any existing server
pkill -f mlx-server.py

# Test the fix
./dist/main-cli.js --mode=mlx
```

Expected output:
- ✅ MLX server starts without errors
- ✅ Model loads successfully
- ✅ First request processes (may take 30-50s for cold start)
- ✅ Second request is fast (~0.3-1s with RAM cache)

## Future Considerations

If repetition loops become a problem again, we could:

1. **Check MLX version**: See if newer versions support repetition penalty
2. **Implement custom sampler**: Use `logits_processors` parameter to add repetition penalty logic
3. **Post-process filtering**: Filter out repetitive tokens after generation
4. **Model fine-tuning**: Train the model to naturally avoid repetition

## Related Files

- `scripts/mlx-server.py` - Main server code (fixed)
- `docs/debugging/mlx-repetition-loop-fix.md` - Original repetition fix documentation
- `.anyclauderc.json` - Server configuration

## References

- MLX GitHub Issues: #1131, #1059 (repetition loops)
- MLX LM API: https://ml-explore.github.io/mlx-examples/lm/
