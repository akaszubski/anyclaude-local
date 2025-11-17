# MLX-Textgen Migration Post-Mortem (v2.2.0)

**Date**: 2025-11-16
**Status**: ❌ INCOMPLETE - Tool calling non-functional
**Recommendation**: Use `--mode=claude` or `--mode=openrouter` for production work

## Objective

Replace custom `vllm-mlx-server.py` (1400 lines) with production-grade MLX-Textgen to achieve:

- ✅ Working disk-based KV caching (10-90x speedup)
- ❌ Maintain tool calling compatibility with Claude Code

## What Was Accomplished

### ✅ Successful Migration Components

1. **MLX-Textgen Installation**
   - Installed v0.2.1 in Python 3.12 venv
   - Created `scripts/mlx-textgen-server.sh` launcher
   - Updated `src/server-launcher.ts` to support .sh scripts
   - Server auto-launches correctly

2. **KV Caching Verification**
   - Standalone testing confirmed working cache
   - First request: ~3s
   - Follow-up requests: ~0.5s (from cache)
   - Cache files saved to `~/.cache/mlx_textgen/prompt_cache/`
   - Disk-based multi-slot design (doesn't overwrite)

3. **Model Testing**
   - Tested 3 models: Qwen3-Coder-30B, OpenAI GPT OSS 20B/120B, Hermes-3-Llama-3.1-8B
   - All models load successfully
   - Basic text generation works
   - Hermes-3 configured as default (131K context, 4-bit quantized)

### ❌ Failed: Tool Calling Integration

**All 3 models failed tool calling tests:**

#### Qwen3-Coder-30B-A3B-Instruct-MLX-4bit

- **Error**: Infinite loop generating XML format tool calls
- **Cause**: Uses custom XML format incompatible with MLX-Textgen's OpenAI JSON expectation
- **Log**: Generated 10,200+ chunks, stuck at "Cascading..." for 2m 33s
- **Chat Template**: `<tool_call><function=name><parameter=name>value</parameter></function></tool_call>`

#### OpenAI GPT OSS 20B/120B MLX-6.5bit

- **Error**: `[(ERROR)] None has no element 0`
- **Cause**: MLX-Textgen crashes during tool call processing
- **Log**: Server terminates with HTTPException 500
- **Chat Template**: Uses OpenAI JSON format (should work per docs)
- **Issue**: Appears to be MLX-Textgen bug with this model

#### Hermes-3-Llama-3.1-8B-4bit

- **Error**: Stream hangs after 2 tokens, no tool call generated
- **Cause**: MLX-Textgen generates response start but stream converter can't process it
- **Log**: Server generates 2 tokens then shuts down cleanly
- **Chat Template**: ChatML format with tool support
- **Issue**: Despite being documented to work with MLX-Textgen, fails through anyclaude proxy

## Root Cause Analysis

### Tool Calling Incompatibility

MLX-Textgen's tool calling implementation is **incompatible with anyclaude's stream converter**, even for models documented to support tool calling.

**Evidence:**

1. Server logs show tools received correctly (schemas visible in logs)
2. Models generate minimal output (2 tokens) instead of tool calls
3. Stream converter expects OpenAI format but receives incomplete/malformed responses
4. No errors in MLX-Textgen logs - clean shutdown after 2 tokens

**Hypothesis:**

- MLX-Textgen may be using chat template for tool formatting
- Chat templates vary by model (XML vs JSON vs ChatML)
- anyclaude's stream converter expects consistent OpenAI tool_calls format
- Mismatch causes stream to hang or crash

## Performance Reality Check

**Claimed**: 10-90x speedup with KV caching
**Reality**: Speedup only applies to follow-up requests in multi-turn conversations

**Actual User Experience:**

- First request: Still slow (~3s for small model, ~50s for 30B model)
- Follow-ups: Fast (~0.5s) IF using same context
- Tool calling: Doesn't work, making it unusable for Claude Code
- **Net Result**: No practical speedup because tool calling is broken

## What Remains

### Migration Artifacts (Keep)

1. **`scripts/mlx-textgen-server.sh`** - Working launcher
2. **`scripts/archive/vllm-mlx-server.py`** - Original server (for rollback)
3. **`scripts/archive/README.md`** - Rollback procedure
4. **Updated `src/server-launcher.ts`** - Supports both .py and .sh scripts
5. **Performance baseline doc** - Pre-migration metrics

### Configuration

**`.anyclauderc.json` (current state):**

```json
{
  "model": "hermes-3-llama-3.1-8b",
  "modelPath": "/Users/andrewkaszubski/Models/mlx-community/Hermes-3-Llama-3.1-8B-4bit",
  "serverScript": "scripts/mlx-textgen-server.sh",
  "description": "MLX-Textgen - Hermes-3 8B (UNUSABLE: tool calling fails)"
}
```

## Recommendations

### For Users

**DO NOT USE `--mode=vllm-mlx` for real work.** Use instead:

```bash
# For tool calling (Read, Write, Edit, Bash)
anyclaude --mode=claude

# For cheap cloud inference with working tools
anyclaude --mode=openrouter  # GLM-4.6: $0.60/$2 per 1M tokens
```

### For Future Development

If someone wants to fix tool calling, investigate:

1. **Stream Converter Analysis**
   - Debug `src/convert-to-anthropic-stream.ts` with tool call responses
   - Compare MLX-Textgen output format vs AI SDK expectations
   - Check if tool_calls field is properly formatted

2. **Chat Template Investigation**
   - Test if MLX-Textgen uses model's chat template for tool formatting
   - Try models with known OpenAI-compatible templates
   - Consider custom template injection

3. **Alternative Approaches**
   - Try `mlx-omni-server` (different tool implementation)
   - Implement custom tool formatter in anyclaude
   - Use LMStudio mode instead (has working tool calling)

4. **Upstream Bug Report**
   - File issue with MLX-Textgen project
   - Provide minimal reproduction case
   - Reference Hermes-3 failure (documented to work)

## Lessons Learned

1. **Standalone testing ≠ Integration success**
   - KV caching worked in isolation but not practically useful
   - Tool calling compatibility must be tested end-to-end

2. **Model compatibility is fragile**
   - Chat templates vary widely (XML, JSON, ChatML)
   - OpenAI format not universally implemented
   - Documentation may not reflect real compatibility

3. **Performance claims need context**
   - 10-90x speedup only on follow-up requests
   - Requires working tool calling to be useful
   - First request still slow (no speedup there)

## Next Steps

1. **Documentation updated** (✅ Done)
   - README.md - Removed speedup claims, added Known Limitations
   - CLAUDE.md - Warning at top about tool calling failure
   - `.anyclauderc.json` - Description updated to "UNUSABLE"

2. **Rollback available** (✅ Done)
   - `scripts/archive/README.md` has rollback procedure
   - Original server preserved in `scripts/archive/`
   - Git history intact for reverting

3. **Git commit** (Pending)
   - Commit current state with honest changelog
   - Mark v2.2.0 as incomplete/non-functional
   - Push to remote for documentation

## Conclusion

The MLX-Textgen migration **succeeded technically** (server runs, KV caching works) but **failed practically** (tool calling broken, unusable for Claude Code).

**Status**: Migration complete but non-functional. Recommend using `--mode=claude` or `--mode=openrouter` for production work.
