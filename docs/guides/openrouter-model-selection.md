# OpenRouter Model Selection Guide

Quick guide to selecting and switching between OpenRouter models in anyclaude.

## Interactive Model Selector

The easiest way to change models is with the interactive selector:

```bash
./scripts/select-openrouter-model.sh
```

### Features

- **Browse curated models** - See pricing, context limits, and speed ratings
- **Benchmark data** - View performance from previous benchmarks
- **One-command switching** - Updates `.anyclauderc.json` automatically
- **Cost estimates** - See pricing before you switch
- **Current model highlight** - Green arrow shows which model is active

### Options

```
1-9   Select a model by number
b     Run benchmark on all models (~2 min)
s     Show full benchmark results
q     Quit without changes
```

## Example Usage

### Switch to GPT-4o (fastest)

```bash
./scripts/select-openrouter-model.sh
# Press '3' then Enter
# Immediately run:
anyclaude --mode=openrouter
```

### Switch to DeepSeek (cheapest)

```bash
./scripts/select-openrouter-model.sh
# Press '2' then Enter
anyclaude --mode=openrouter
```

### Benchmark All Models

```bash
./scripts/select-openrouter-model.sh
# Press 'b' then Enter
# Wait ~2 minutes
# Run selector again to see benchmark times
```

## Available Models (Curated for Coding)

### 🏆 RECOMMENDED: Best Overall

**Qwen3 Coder 480B** - `qwen/qwen3-coder`
- Cost: $0.22 / $0.95 per 1M tokens
- Context: 262K (2nd largest)
- Speed: ⚡⚡ Fast (1.74s benchmark)
- **✅ Reliable tool calling** - Works perfectly with Claude Code
- **Best choice for coding** - Good balance of speed, cost, and reliability

### ⚠️ Fastest But Limited

**Gemini 2.5 Flash Lite** - `google/gemini-2.5-flash-lite`
- Cost: $0.10 / $0.40 per 1M tokens ✨ **CHEAPEST OF FAST MODELS**
- Context: 1M ✨ **LARGEST CONTEXT**
- Speed: ⚡⚡⚡ Fastest (0.61s benchmark) ✨ **BEATS GPT-4o!**
- **⚠️ LIMITATION**: Tool calling format issues - parameters placed at wrong nesting level
- **When to use**: Simple queries without complex tools (Read, Bash OK; AskUserQuestion fails)
- **Issue**: Places nested object parameters at root level, violating `additionalProperties: false`
- **See**: `tests/regression/test_tool_calling_format_validation.js` for details

### Fastest

**GPT-4o** - `openai/gpt-4o`
- Cost: $5.00 / $15.00 per 1M tokens
- Context: 128K
- Speed: ⚡⚡⚡ Fastest (0.74s benchmark)
- Premium option for maximum speed

### Cheapest

**DeepSeek V3.1** - `deepseek/deepseek-chat-v3.1`
- Cost: $0.20 / $0.80 per 1M tokens (cheapest!)
- Context: 160K
- Speed: ⚡ Moderate (2.64s benchmark)
- Good for simple tasks

### Free Option

**Gemini 2.0 Flash** - `google/gemini-2.0-flash-exp:free`
- Cost: **FREE!**
- Context: 1M (massive!)
- Speed: ⚡ Moderate
- Great for experimentation

### More Options

- **GPT-4o Mini** - Budget GPT-4o ($0.15/$0.60, fast)
- **Claude 3.5 Sonnet** - Real Claude via OpenRouter ($3/$15)
- **Llama 3.3 70B** - Good balance ($0.35/$0.40)
- **Qwen 2.5 72B** - Alternative to Qwen3 ($0.35/$0.70)

### Avoid

**GLM-4.6** - `z-ai/glm-4.6`
- 🐌 Very slow (64s benchmark - 37x slower than Qwen3!)
- Not recommended for interactive coding

## Manual Configuration

You can also edit `.anyclauderc.json` directly:

```json
{
  "backends": {
    "openrouter": {
      "model": "qwen/qwen3-coder"
    }
  }
}
```

Then run:

```bash
anyclaude --mode=openrouter
```

## Shell Aliases

If you've sourced the shell aliases:

```bash
source scripts/shell-aliases.sh

# Quick model switching
anyclaude-select-model

# Run OpenRouter mode
anyclaude-openrouter
```

## Tips

### Cost Optimization

1. **Use Gemini 2.5 Flash Lite** for everything! (fastest + cheapest + 1M context)
2. **Use Qwen3 Coder** as backup if Gemini unavailable
3. **Avoid GLM-4.6** (too slow - 64s response time)

### Performance Comparison

Based on benchmark results:

| Model | Speed | Cost (in/out) | Context | Best For |
|-------|-------|---------------|---------|----------|
| **Gemini 2.5 Flash Lite** | **0.61s ⚡⚡⚡** | **$0.10/$0.40** | **1M** | **🏆 EVERYTHING!** (fastest + cheapest + largest) |
| GPT-4o | 0.74s ⚡⚡⚡ | $5/$15 | 128K | When Gemini unavailable |
| Qwen3 Coder | 1.74s ⚡⚡ | $0.22/$0.95 | 262K | Backup option |
| Gemini 2.5 Flash | 1.73s ⚡⚡ | $0.30/$2.50 | 1M | Premium Gemini |
| DeepSeek V3.1 | 2.64s ⚡ | $0.20/$0.80 | 160K | Simple tasks |
| GLM-4.6 | 64s 🐌 | $0.60/$2 | 200K | ❌ Avoid |

### Benchmark Your Own Setup

Network latency and OpenRouter routing can affect speeds. Run your own benchmark:

```bash
./scripts/select-openrouter-model.sh
# Press 'b'
# Wait ~2 minutes
# Results saved to ~/.anyclaude/benchmarks/
```

## Troubleshooting

### Model not working

1. Check your OpenRouter API key in `.env`:
   ```bash
   grep OPENROUTER_API_KEY .env
   ```

2. Verify model ID is correct:
   ```bash
   jq -r '.backends.openrouter.model' .anyclauderc.json
   ```

3. Check OpenRouter model list: https://openrouter.ai/models

### Slow responses

- Run benchmark to compare models
- Check network connection
- Consider switching to GPT-4o or Qwen3 Coder

### High costs

- Switch to cheaper models (DeepSeek, Gemini Free)
- Monitor usage via OpenRouter dashboard
- Use context limit warnings to avoid truncation costs

## See Also

- [OpenRouter Models](https://openrouter.ai/models) - Full model list
- [OpenRouter Dashboard](https://openrouter.ai/activity) - Usage tracking
- [anyclaude OpenRouter Guide](./installation-local.md) - Initial setup
