# Acknowledgements

## Fork Attribution

This project is a fork of **anyclaude** by Coder Technologies Inc.

- **Original Repository**: https://github.com/coder/anyclaude
- **Original Author**: Coder Technologies Inc.
- **Original License**: MIT License
- **Fork Date**: November 2024
- **Fork Repository**: https://github.com/akaszubski/anyclaude-local

## Original Work

Copyright © Coder Technologies Inc.

The original `anyclaude` project provided the foundational architecture for proxying Anthropic API calls to OpenAI-compatible backends, enabling Claude Code to work with alternative model providers.

Original features from anyclaude:

- HTTP proxy server for Anthropic API
- Message format conversion (Anthropic ↔ OpenAI)
- Stream response conversion with Server-Sent Events (SSE)
- LMStudio backend integration
- Basic debug logging

## Modifications in This Fork

This fork (`anyclaude-local`) extends the original work with significant enhancements:

### 1. MLX Backend Support (Custom Implementation)

- **Custom MLX inference server** (`scripts/mlx-server.py`, ~1,800 lines)
- **RAM-based KV caching** with InMemoryKVCacheManager (100-200x speedup)
- **3-tier tool calling fallback** (native → instruction injection → graceful degradation)
- **Production hardening** (security audit, error recovery, metrics)
- Auto-launch orchestration with server health checks
- Comprehensive tool calling support for open models

### 2. OpenRouter Integration

- Full OpenRouter backend support (400+ cloud models)
- Model comparison and profiling tools
- Trace logging for prompt analysis
- Cost-effective alternative to Claude API (84% savings)

### 3. Production Features

- **Automated testing**: 1,400+ tests across 60 files
- **Git hooks**: Pre-commit validation, pre-push regression tests
- **Security hardening**: VUL-002 fixes, input validation, DoS prevention
- **Metrics collection**: Performance monitoring and debugging
- **Stream backpressure handling**: Prevents truncation issues
- **Cache control headers**: Proper HTTP semantics for caching

### 4. Developer Experience

- Configuration file support (`.anyclauderc.json`)
- Multi-mode switching (`--mode=claude|openrouter|mlx|lmstudio`)
- Comprehensive documentation (architecture, guides, debugging)
- Debug logging levels (0-3) with trace analysis
- Model compatibility testing tools

### 5. Apple Silicon Optimization

- MLX framework integration for M series chips
- Unified memory architecture support
- 512GB RAM cache support for M3 Ultra
- Disk + RAM hybrid caching strategies

## Original vLLM-MLX Server

This project builds upon and originally included a custom vLLM-MLX server implementation (v2.0-v2.1) built on top of the vLLM-MLX library by Yoni Gozlan.

**Original vLLM-MLX Library:**

- **Repository**: https://github.com/yonigozlan/vllm-mlx
- **Original authors**: Yoni Gozlan and contributors
- **License**: Apache 2.0
- **Purpose**: MLX backend for vLLM on Apple Silicon

**What Was Preserved:**

The original vLLM-MLX implementation has been preserved in the project's archives:

- The custom vLLM-MLX server implementation has been archived in `scripts/archive/vllm-mlx-server.py` for historical reference
- Documentation about vLLM-MLX integration can be found in archived docs
- The project has migrated to MLX-Textgen (a production-ready MLX inference server)

**What Changed (v2.2.0 Migration):**

The v2.2.0 release changed the MLX backend implementation:

- **Replaced**: Custom vllm-mlx server (1,400 lines) → MLX-Textgen (pip package)
- **Why**: MLX-Textgen provides production-ready KV caching, better tool calling support, and active maintenance
- **Impact**: Simplified deployment (pip install vs custom server), improved reliability
- **Migration**: See `docs/guides/mlx-migration.md` for migration guide

The vLLM-MLX integration was an important stepping stone that enabled this project to support Apple Silicon with MLX. We acknowledge Yoni Gozlan's work on vLLM-MLX, which made local MLX inference accessible to this project in its early stages.

## License

This fork maintains the original MIT License from anyclaude.

See [LICENSE](LICENSE) for full license text.

## Disclaimers

### Experimental Features

This fork includes experimental features that are not part of the original anyclaude:

1. **Custom MLX Server**: The `scripts/mlx-server.py` implementation is a custom inference server built for this fork. While it has undergone security auditing and testing, it is not an official Apple MLX product.

2. **RAM KV Caching**: The InMemoryKVCacheManager is a custom implementation designed for large-memory systems (512GB). Performance characteristics may vary on systems with different memory configurations.

3. **Tool Calling Fallbacks**: The 3-tier fallback strategy for tool calling is experimental and may not work reliably with all open-source models.

### No Warranty

This software is provided "as is", without warranty of any kind, express or implied. See the MIT License for full warranty disclaimers.

### Not Affiliated

This fork is **not affiliated with, endorsed by, or sponsored by**:

- Coder Technologies Inc. (original anyclaude creators)
- Anthropic PBC (creators of Claude and Claude Code)
- Apple Inc. (creators of MLX framework)

### Support

For issues specific to this fork, please use the [GitHub Issues](https://github.com/akaszubski/anyclaude-local/issues) for this repository.

For issues with the original anyclaude, please refer to the [original repository](https://github.com/coder/anyclaude).

## Third-Party Dependencies

This project uses several open-source dependencies (see `package.json` for complete list):

- **AI SDK** (Vercel) - MIT License
- **Anthropic SDK** - MIT License
- **Express** - MIT License
- **TypeScript** - Apache 2.0 License
- **MLX** (Apple) - MIT License
- **mlx-lm** (Apple) - MIT License

See individual packages for their respective license terms.

## Contributing

Contributions to this fork are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

When contributing, please note that:

1. New code must maintain compatibility with the original anyclaude architecture where possible
2. All contributions are subject to the same MIT License as the original work
3. Contributors grant permission for their contributions to be used under the MIT License

## Acknowledgment of Community

Special thanks to:

- **Coder Technologies Inc.** for creating the original anyclaude and making it open source
- **Anthropic** for Claude Code and the Anthropic API
- **Apple MLX Team** for the MLX framework and tooling
- **OpenRouter** for providing access to diverse model providers
- **Open-source model creators** (Qwen, GLM, OpenAI GPT OSS, etc.) for advancing local AI

## Version History

- **v3.0+** (This Fork): MLX support, RAM caching, OpenRouter integration, production hardening
- **v2.x** (Original): LMStudio support, basic proxy functionality
- **v1.x** (Original): Initial Anthropic ↔ OpenAI proxy implementation

For detailed version history of this fork, see [CHANGELOG.md](CHANGELOG.md).

---

**Last Updated**: November 2024
