# Quick Start - AnyClaude with MLX

## 30 Second Setup

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude
./anyclaude
```

That's it! Ctrl+C to stop.

## What Just Happened?

1. **MLX-Omni-Server** started on port 8080
2. **AnyClaude proxy** started
3. **Claude Code** launched with full tool support
4. System prompt cached for fast follow-ups

## Try It Out

```
Claude Code: What's 2+2?
⏱️  First query: ~30s (computing system prompt)

Claude Code: What about 3+3?
⏱️  Follow-up: <1s (using cached prompt - 30x faster!)

Claude Code: Read src/main.ts and summarize it
✓ Works! Tools (Read, Edit, Bash) fully functional
```

## Modes

```bash
./anyclaude              # MLX-Omni (recommended - fastest + tools)
./anyclaude mlx-omni     # Same as above
./anyclaude help         # Show options
```

## Environment Variables

```bash
# Use a different model (must be HuggingFace MLX community model)
export MLX_MODEL="mlx-community/Qwen2.5-3B-Instruct-4bit"
./anyclaude

# Enable debug logging
export ANYCLAUDE_DEBUG=1
./anyclaude

# Test proxy without spawning Claude
export PROXY_ONLY=true
./anyclaude
```

## Available Models

All [MLX Community models](https://huggingface.co/mlx-community) work:

- `mlx-community/Qwen2.5-0.5B-Instruct-4bit` (smallest, fastest)
- `mlx-community/Qwen2.5-1.5B-Instruct-4bit` (default, balanced)
- `mlx-community/Qwen2.5-3B-Instruct-4bit` (larger, slower)
- `mlx-community/Llama-3.2-1B-Instruct-4bit`
- `mlx-community/Llama-3.2-3B-Instruct-4bit`
- [And many more...](https://huggingface.co/mlx-community)

## Troubleshooting

**"Command not found: ./anyclaude"**
```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude
chmod +x anyclaude
./anyclaude
```

**"mlx-omni-server not found"**
```bash
pip install mlx-omni-server
```

**Port 8080 in use**
```bash
# Use a different port
MLX_OMNI_PORT=8081 ./anyclaude
```

**Slow first response**
- Normal! System prompt (18,490 tokens) is computed and cached
- Once cached, follow-ups are lightning fast (<1s)

**Tools not working**
- Verify AnyClaude is in mlx-omni mode (should be default)
- Check logs: `/tmp/anyclaude-mlx-omni-logs/mlx-omni-server.log`

## Performance Expectations

| Action | Time | Notes |
|--------|------|-------|
| First query | ~30s | System prompt computed once |
| Follow-up | <1s | Using KV cache |
| Tool call | <1s | Uses cached prompt |
| Session (5 msgs) | ~60s | vs 200s without cache |

## Next Steps

- Read [PROJECT.md](PROJECT.md) for architecture details
- See [docs/guides/mlx-omni-quick-start.md](docs/guides/mlx-omni-quick-start.md) for advanced options
- Check [docs/README.md](docs/README.md) for full documentation

## How It Works

```
┌──────────────┐
│ ./anyclaude  │  Single command
└──────┬───────┘
       │
   ┌───┴───────────────────────────────────────┐
   ▼                                            ▼
┌─────────────────────┐              ┌──────────────────────┐
│ MLX-Omni-Server     │              │ Claude Code          │
│ - Qwen/Llama models │◄─────────────┤ - Full tool support  │
│ - Native KV cache   │   HTTP API   │ - Read/Edit/Bash     │
│ - Anthropic format  │ (localhost) │ - Git integration     │
└─────────────────────┘              └──────────────────────┘
```

No external APIs. Everything local. Everything fast. 🚀
