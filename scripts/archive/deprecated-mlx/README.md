# Deprecated Custom MLX Server

**Status**: ⚠️ DEPRECATED as of v3.0.0

This directory contains the deprecated custom MLX server implementation that was used in anyclaude versions 2.x.

## Why Deprecated?

The custom MLX server (`mlx-server.py`) has been replaced with **mistral.rs** for the following reasons:

1. **Production Readiness**: mistral.rs is a mature Rust inference engine with better stability
2. **Native MLX Support**: Built-in MLX acceleration without custom Python implementation
3. **MoE Support**: Native support for Mixture-of-Experts models
4. **Better Tool Calling**: More reliable tool calling with fewer edge cases
5. **Maintenance Burden**: Maintaining ~1500 lines of custom Python code vs using battle-tested Rust library

## Migration Path

If you're still using the old MLX server, migrate to mistral.rs:

1. **Install mistral.rs**: Follow `docs/guides/mistralrs-setup-guide.md`
2. **Update config**: Change `.anyclauderc.json` to use mistral.rs backend
3. **Test**: Run `anyclaude` and verify tool calling works

## What Was Archived

**Files**:

- `mlx-server.py` - Custom MLX server implementation (~1500 lines)
- `ram_cache.py` - RAM-based KV cache manager

**Documentation**:

- Various debugging docs from the MLX server development era
- Implementation guides and migration postmortems
- Tool calling fixes and repetition penalty patches

## Historical Context

The custom MLX server was developed because:

- MLX-Textgen pip package had broken tool calling
- vLLM-MLX was experimental and incomplete
- We needed a working local solution for Apple Silicon

It served us well for versions 2.0-2.3, but mistral.rs is the better long-term solution.

## For Archival/Research Purposes

If you need to reference the old implementation:

- System prompt caching implementation
- RAM-based KV cache design
- vLLM-inspired features (circuit breaker, error recovery)
- Tool calling format translation

These patterns may be useful for other MLX projects or understanding the evolution of anyclaude.

---

**Last Updated**: 2024-11-23
**Replaced By**: mistral.rs (v3.0.0+)
**See Also**: `docs/guides/mistralrs-setup-guide.md`
