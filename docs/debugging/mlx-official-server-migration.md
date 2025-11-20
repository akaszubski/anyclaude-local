# MLX Tools Parameter Bug & Migration to Official Server

**Date**: 2025-11-20
**Issue**: Custom MLX server crashed with `generate_step() got an unexpected keyword argument 'repetition_penalty'`
**Solution**: Migrate to official `mlx_lm.server`
**Status**: ✅ RESOLVED

---

## Problem Summary

The custom MLX server (`scripts/mlx-server.py`) was passing `repetition_penalty` and `repetition_context_size` directly to `mlx_lm.generate()`, but the MLX-LM API doesn't accept these as direct parameters. Instead, they must be passed through `logits_processors`.

\`\`\`python
# ❌ WRONG (our custom server)
result = mlx_lm.generate(
    model, tokenizer, prompt,
    repetition_penalty=1.05,  # ERROR: unexpected keyword argument
    repetition_context_size=20
)

# ✅ CORRECT (official server)
logits_processors = make_logits_processors(
    logit_bias=None,
    repetition_penalty=1.05,
    repetition_context_size=20
)
result = mlx_lm.stream_generate(
    model, tokenizer, prompt,
    logits_processors=logits_processors
)
\`\`\`

---

## Why Custom Server Was a Mistake

| Aspect              | Custom Server              | Official Server          |
|---------------------|----------------------------|--------------------------|
| **Maintenance**     | 1500 lines, hard to update | Maintained by Apple/mlx  |
| **Bugs**            | Repetition penalty bug     | Battle-tested            |
| **API Changes**     | Manual sync required       | \`pip install -U\` works   |
| **Tool Calling**    | Custom implementation      | Official implementation  |
| **Features**        | Need to implement yourself | Auto-updated             |

**Key Insight**: Our only real innovation was RAM caching. Everything else should use official code.

---

## Migration to Official Server

### What Changed

1. **Server**: Now uses \`mlx_lm.server\` (installed via \`pipx install mlx-lm\`)
2. **Launch**: Auto-launches official server instead of custom Python script
3. **Config**: Updated \`.anyclauderc.json\` to use port 8081 (official default)
4. **No RAM Cache**: Removed custom caching (Phase 2 will add it back to proxy layer)

### Installation

\`\`\`bash
# Install official MLX-LM server
pipx install mlx-lm
pipx ensurepath

# Verify installation
mlx_lm.server --help
\`\`\`

### Configuration

Update \`.anyclauderc.json\`:

\`\`\`json
{
  "backend": "mlx",
  "backends": {
    "mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx",
      "model": "/path/to/your/mlx/model",
      "description": "Official MLX-LM server"
    }
  }
}
\`\`\`

### Usage

\`\`\`bash
# Same command - now uses official server
anyclaude

# Server logs at:
tail -f ~/.anyclaude/logs/mlx-lm-server.log
\`\`\`

---

## Phase 2: Add Caching Back

The RAM caching was our real innovation. In Phase 2, we'll add it back at the **proxy layer** (\`anthropic-proxy.ts\`) so it works for ALL backends:

- ✅ MLX (local)
- ✅ LMStudio (local)
- ✅ OpenRouter (cloud) - save API costs!
- ✅ Claude API (official) - save money!

This is better architecture:
- Cache once, benefit everywhere
- No need to modify backend servers
- Works at Anthropic API format level

---

## Testing

To test the official server:

\`\`\`bash
# Build and run
bun run build
./dist/main-cli.js --mode=mlx

# Try tool calling
> read README.md and summarize
\`\`\`

Expected: Tool calling should work perfectly (Read, Write, Edit, Bash, Git, etc.)

---

## References

- Official MLX-LM Docs: https://github.com/ml-explore/mlx-lm
- Server Implementation: https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/server.py
- Logits Processors: https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/sample_utils.py
- Issue #385: Repetition penalty implementation

---

## Lessons Learned

1. **Don't reinvent the wheel** - Official implementations are better maintained
2. **Focus on real innovations** - Our RAM cache was valuable, everything else wasn't
3. **Architectural clarity** - Caching should be at proxy layer, not backend layer
4. **Test with official tools first** - Reduces bug surface area dramatically

Great detective work catching these bugs! 🎉
