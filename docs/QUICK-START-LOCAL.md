# Quick Start - LMStudio Local Mode

Your anyclaude is now configured to use LMStudio permanently instead of Claude servers!

## ✅ What's Configured

- **Force Mode**: Always uses LMStudio (never contacts Anthropic)
- **Default Model**: `deepseek-r1-distill-qwen-32b-abliterated`
- **LMStudio URL**: `http://localhost:1234/v1`

## 🚀 How to Start Claude Code

### Method 1: Using the Script (Recommended)

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude
./scripts/debug/start-local.sh
```

This will:
1. ✅ Check LMStudio is running
2. ✅ Show available models
3. ✅ Load configuration
4. ✅ Start Claude Code with LMStudio backend

### Method 2: Direct Command

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude
source .env.lmstudio
bun run src/main.ts
```

### Method 3: Install Shell Aliases (One-time setup)

```bash
# Add aliases to your shell config
echo 'source /Users/akaszubski/Documents/GitHub/anyclaude/shell-aliases.sh' >> ~/.zshrc
source ~/.zshrc

# Now you can just run from anywhere:
claude-local
```

## 🎯 Current Model Configuration

Your current model is: **deepseek-r1-distill-qwen-32b-abliterated**

### Available Models (Pick One)

Edit `.env.lmstudio` and uncomment your preferred model:

**Best for Coding:**
- `deepseek-r1-distill-qwen-32b-abliterated` ← *Current*
- `mistralai/devstral-small-2505`
- `qwen3-coder-30b-a3b-instruct-mlx`
- `wizardlm-1.0-uncensored-codellama-34b`

**Larger Models (Better quality):**
- `openai/gpt-oss-120b`
- `dolphin-2.9.2-qwen2-72b.quantized`
- `cognitivecomputations_-_dolphin-2.9-llama3-70b`

**Smaller/Faster:**
- `glm-4.5-air-mlx`
- `gpt-oss-20b-mlx`

### How to Change Model

1. Edit the file:
   ```bash
   nano .env.lmstudio
   ```

2. Find the line with your current model:
   ```bash
   export LMSTUDIO_MODEL=deepseek-r1-distill-qwen-32b-abliterated
   ```

3. Comment it out and uncomment a different one:
   ```bash
   # export LMSTUDIO_MODEL=deepseek-r1-distill-qwen-32b-abliterated
   export LMSTUDIO_MODEL=mistralai/devstral-small-2505
   ```

4. Save and restart

## 📊 What You'll See When Starting

```
=====================================
  anyclaude - LMStudio Local Mode
=====================================

[1/4] Checking LMStudio server...
✓ LMStudio server is running on http://localhost:1234

Available models:
  - deepseek-r1-distill-qwen-32b-abliterated
  - mistralai/devstral-small-2505
  - qwen3-coder-30b-a3b-instruct-mlx
  [... more models ...]

[2/4] Loading LMStudio configuration...
✓ Configuration loaded from .env.lmstudio
   Model: deepseek-r1-distill-qwen-32b-abliterated
   URL: http://localhost:1234/v1

[3/4] Verifying model availability...
✓ Model 'deepseek-r1-distill-qwen-32b-abliterated' is loaded and ready

[4/4] Starting Claude Code with LMStudio backend...
=====================================

[anyclaude] proxy=http://localhost:XXXX
[Failover] FORCE_LMSTUDIO enabled - all requests will use LMStudio
[Failover] Emergency failover system enabled
[Failover] LMStudio endpoint: http://localhost:1234/v1
[Failover] Default model: deepseek-r1-distill-qwen-32b-abliterated

[Claude Code starts here...]
```

## 🛠️ Troubleshooting

### LMStudio not running?

```bash
# Check if LMStudio is running
curl http://localhost:1234/v1/models

# Or use the helper alias (after installing shell-aliases.sh)
lm-test
```

**Fix**: Open LMStudio and click "Start Server" in the Server tab

### Model not loaded?

**Fix**: In LMStudio, go to the "Server" tab and ensure a model is loaded

### Want to switch back to Claude servers?

Edit `.env.lmstudio` and change:
```bash
export FORCE_LMSTUDIO=false  # Will use Claude, fallback to LMStudio if offline
```

Or just use the regular command without the config:
```bash
bun run src/main.ts  # Uses Claude servers normally
```

## 📁 Files Created

- `.env.lmstudio` - Your configuration file
- `start-local.sh` - Startup script with checks
- `shell-aliases.sh` - Optional shell aliases
- `QUICK-START-LOCAL.md` - This guide!

## 🎯 Next Steps

1. **Start LMStudio** (if not already running)
2. **Run the script**: `./scripts/debug/start-local.sh`
3. **Use Claude Code** normally - it's now powered by your local model!

## 💡 Tips

- **Faster responses**: Use smaller models (glm-4.5-air-mlx, gpt-oss-20b-mlx)
- **Better quality**: Use larger models (120B, 72B models)
- **Best for coding**: DeepSeek R1, Devstral, Qwen Coder, CodeLlama
- **Debug mode**: Already enabled in `.env.lmstudio` (ANYCLAUDE_DEBUG=1)

---

**You're all set!** Your Claude Code now runs entirely on your local machine using LMStudio. No internet required! 🎉
