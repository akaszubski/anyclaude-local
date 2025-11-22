# MLX Tools Parameter Bug Fix (v3.1.x)

## Summary

Fixed a critical bug where the MLX server was passing a `tools` parameter to `mlx_lm.generate()`, causing a `TypeError` and resulting in empty responses that made Claude Code hang.

## Bug History

**Version**: v3.1.x
**Status**: Fixed
**Severity**: Critical - made MLX mode unusable with tool calling

## Symptoms

When running anyclaude in MLX mode:

1. User asks simple questions like "hi", "who are you?", "read README.md"
2. Claude Code shows spinning animation with messages like:
   - "✢ Befuddling…"
   - "· Spinning…"
   - "· Determining…"
3. No actual response is generated
4. Claude Code prints: `⏺ I received 2 message(s) and 17 tool(s) are available.`
5. Session gets stuck and becomes unusable

## Root Cause

The MLX server code was adding `tools` and `tool_choice` parameters to the options dictionary passed to `mlx_lm.generate()`:

```python
# BROKEN CODE (scripts/mlx-server.py:897-898)
if tools:
    options['tools'] = tools
    options['tool_choice'] = 'auto'
```

However, `mlx_lm.generate()` doesn't accept a `tools` parameter, causing:

```
ERROR: generate_step() got an unexpected keyword argument 'tools'
WARNING: MLX generation failed, using demo response
WARNING: Fallback parsing found NO tool calls in model output
```

The demo fallback response was empty, causing Claude Code to get stuck.

## The Fix

**File**: `scripts/mlx-server.py`
**Lines**: 894-898

### Before (Broken)

```python
# Add tool calling support if tools provided
if tools:
    logger.debug(f"[Generate Safe] Adding {len(tools)} tools to generation")
    options['tools'] = tools
    options['tool_choice'] = 'auto'  # Let model decide when to use tools
```

### After (Fixed)

```python
# Note: tools are already baked into the prompt via chat template
# MLX generate() doesn't accept tools parameter
if tools:
    logger.debug(f"[Generate Safe] {len(tools)} tools included in prompt via chat template")
```

## Why This Works

Tools are already properly included in the prompt via the chat template (line 1636):

```python
prompt = self.tokenizer.apply_chat_template(
    normalized_messages,
    tools=normalized_tools if normalized_tools else None,  # ✅ Tools go here
    tokenize=False,
    add_generation_prompt=True
)
```

Then the prompt is passed to `mlx_lm.generate()` (line 907):

```python
result = mlx_lm.generate(model, tokenizer, actual_prompt, **options)  # ❌ No tools param here!
```

The chat template converts tools into a format the model understands (part of the prompt text), so there's no need to pass them again to `generate()`.

## Log Evidence

From `~/.anyclaude/logs/mlx-textgen-server.log`:

```
[2025-11-20 22:48:47,313] [mlx] ERROR: Generation error: generate_step() got an unexpected keyword argument 'tools'
[2025-11-20 22:48:47,313] [mlx] WARNING: MLX generation failed: generate_step() got an unexpected keyword argument 'tools', using demo response
[2025-11-20 22:48:47,314] [mlx] WARNING: [Tool Calls] No native tool calls, trying fallback text parsing
[2025-11-20 22:48:47,314] [mlx] WARNING: [Tool Parsing] Using deprecated text parsing - consider upgrading mlx-textgen
[2025-11-20 22:48:47,314] [mlx] WARNING: ❌ Fallback parsing found NO tool calls in model output
```

## Valid mlx_lm.generate() Parameters

According to the MLX documentation, `mlx_lm.generate()` accepts:

- `model` - The language model
- `tokenizer` - The tokenizer
- `prompt` - The input prompt (already includes tools via chat template)
- `max_tokens` - Maximum tokens to generate
- `temp` - Temperature
- `top_p` - Top-p sampling
- `verbose` - Verbose logging
- `repetition_penalty` - Repetition penalty
- `repetition_context_size` - Context size for repetition penalty

**NOT VALID**: `tools`, `tool_choice`

## Regression Test

Created comprehensive regression test: `tests/regression/test_mlx_tools_parameter.py`

Tests verify:

1. ✅ Tools are NOT passed to `mlx_lm.generate()`
2. ✅ Tools ARE included via `apply_chat_template()`
3. ✅ Multiple tools (17+) don't break generation
4. ✅ Only valid parameters are passed to `generate()`

Run tests:

```bash
python3 tests/regression/test_mlx_tools_parameter.py
```

## Testing the Fix

1. Exit any running anyclaude session
2. Run: `./dist/main-cli.js --mode=mlx`
3. Test simple prompts:
   - "hi"
   - "who are you?"
   - "read README.md and summarise"
4. Verify responses are generated correctly

## Related Issues

- **Impact**: All MLX mode users with tool calling enabled (default)
- **Workaround**: None - required code fix
- **Detection**: Check logs for "generate_step() got an unexpected keyword argument 'tools'"

## Prevention

- ✅ Regression test added
- ✅ Pre-push hook runs all regression tests
- ✅ Documentation updated
- ✅ Log messages clarified

## References

- Fix commit: (TBD - will be added after commit)
- MLX documentation: https://github.com/ml-explore/mlx-examples
- Related: `docs/debugging/tool-calling-fix.md` (earlier tool calling investigation)
