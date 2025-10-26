# AnyClaude Integrated Launchers

This directory contains integrated launcher scripts that start both the backend server and AnyClaude together, managing their complete lifecycle.

## Quick Start

### MLX-Omni (Recommended - Best Performance + Tools)

```bash
./anyclaude-mlx-omni
```

That's it! This will:
1. ✓ Start MLX-Omni-Server (native KV cache + tool support)
2. ✓ Wait for server to be ready
3. ✓ Spawn Claude Code
4. ✓ Manage both processes together
5. ✓ Clean up on Ctrl+C

### Usage

**Default (start Claude Code):**
```bash
./anyclaude-mlx-omni
```

**Proxy-only mode (test without Claude Code):**
```bash
PROXY_ONLY=true ./anyclaude-mlx-omni
```

**Custom model:**
```bash
export MLX_MODEL="mlx-community/Qwen2.5-3B-Instruct-4bit"
./anyclaude-mlx-omni
```

**Custom debug level:**
```bash
ANYCLAUDE_DEBUG=1 ./anyclaude-mlx-omni
ANYCLAUDE_DEBUG=2 ./anyclaude-mlx-omni
ANYCLAUDE_DEBUG=3 ./anyclaude-mlx-omni
```

## Environment Variables

All scripts support these environment variables:

- `MLX_MODEL`: HuggingFace model ID (default: `mlx-community/Qwen2.5-1.5B-Instruct-4bit`)
- `MLX_OMNI_PORT`: Port for MLX-Omni-Server (default: 8080)
- `ANYCLAUDE_DEBUG`: Debug level (0, 1, 2, or 3)
- `PROXY_ONLY`: Run proxy without spawning Claude (true/false)

## How It Works

The launcher script:

1. **Cleans up** any existing processes
2. **Starts the backend** (MLX-Omni, MLX-LM, or LMStudio)
3. **Waits for readiness** with exponential backoff
4. **Configures AnyClaude** with proper environment variables
5. **Spawns Claude Code** (or runs proxy-only mode)
6. **Manages lifecycle** - Ctrl+C stops both cleanly
7. **Logs outputs** to `/tmp/anyclaude-mlx-omni-logs/`

## Stopping

Just press **Ctrl+C** in the terminal. The launcher will:
- Gracefully stop both services
- Clean up process files
- Display shutdown confirmation

## Troubleshooting

### Server won't start
Check logs:
```bash
tail -f /tmp/anyclaude-mlx-omni-logs/mlx-omni-server.log
```

### Port already in use
Change the port:
```bash
MLX_OMNI_PORT=8081 ./anyclaude-mlx-omni
```

### Need a specific model
List available models at https://huggingface.co/mlx-community and use:
```bash
export MLX_MODEL="mlx-community/your-model-name"
./anyclaude-mlx-omni
```

## Performance Tips

**For fastest first response:**
- Use smaller models: `mlx-community/Qwen2.5-1.5B-Instruct-4bit` (default)
- Reduce system prompt in PROJECT.md if needed

**For better follow-up speed:**
- MLX-Omni provides <1s follow-ups with KV cache
- Each question after the first benefits from cached prompt

**For debugging:**
- Use `ANYCLAUDE_DEBUG=3` to see all tool calls
- Check logs in `/tmp/anyclaude-mlx-omni-logs/`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Your Terminal                                           │
│ $ ./anyclaude-mlx-omni                                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ Launcher Script (bash)     │
    │ - Start MLX-Omni          │
    │ - Wait for ready          │
    │ - Start Claude Code       │
    │ - Manage lifecycle        │
    └────────────┬──────────────┘
                 │
     ┌───────────┴──────────────┐
     ▼                          ▼
┌──────────────┐         ┌──────────────────────┐
│ MLX-Omni     │         │ Claude Code          │
│ (port 8080)  │◄────────┤ (AnyClaude proxy)    │
│              │         │                      │
│ - Qwen Model │         │ - GPT-like interface │
│ - KV Cache   │         │ - File operations    │
│ - Tools      │         │ - Code analysis      │
└──────────────┘         └──────────────────────┘
```

## Next Steps

Once running, try:

1. **Test basic query:**
   ```
   "What is 2+2?"
   ```

2. **Test KV cache (fast follow-up):**
   ```
   "What about 3+3?"  # Should be <1s
   ```

3. **Test tool calling:**
   ```
   "Read src/main.ts and summarize it"
   ```

Enjoy fast, integrated local Claude Code! 🚀
