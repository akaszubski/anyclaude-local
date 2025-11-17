# Documentation Index

Complete documentation for anyclaude - the translation layer enabling Claude Code with:

- **Local models** (MLX, LMStudio) for 100% privacy
- **Cloud models** (OpenRouter) for 400+ models at 84% lower cost than Claude API
- **Official Claude API** for full features

---

## 🚀 Getting Started

**New Users**: Start here

- **[Installation Guide](guides/installation.md)** - Get up and running in 5 minutes
- **[Debug Quick Start](guides/debug-quick-start.md)** - Troubleshooting basics
- **[Testing Guide](testing/TESTING.md)** - Running the 170+ test suite
- **[Configuration Guide](guides/configuration.md)** - Setup and configuration options

---

## 🏗️ Architecture & Design

**Understanding How It Works**

- **[PROJECT.md](../PROJECT.md)** - Complete architectural deep-dive and translation layer design
- **[Architecture Summary](architecture/ARCHITECTURE_SUMMARY.md)** - System overview and design patterns
- **[Model Adapters](architecture/model-adapters.md)** - Model-specific handling and optimization
- **[Tool Calling Enhancement](architecture/tool-calling-enhancement.md)** - Tool system implementation
- **[Cache Control Headers](architecture/cache-control-headers.md)** - **NEW!** Anthropic cache_control marker detection and extraction (Phase 2.2)

---

## 📚 User Guides

**Using anyclaude**

- **[Installation](guides/installation.md)** - Complete setup instructions
- **[Authentication](guides/authentication.md)** - API key setup and modes
- **[OpenRouter Setup](guides/openrouter-setup.md)** - **NEW!** 400+ models at fraction of Claude cost
- **[Mode Switching](guides/mode-switching.md)** - Switch between local, OpenRouter, and Claude modes
- **[Auto-Launch](guides/auto-launch.md)** - Server auto-launch configuration
- **[Crash Fix Guide](guides/crash-fix.md)** - Fixing MLX server crashes
- **[Trace Analysis](guides/trace-analysis.md)** - **NEW!** Analyzing Claude Code prompts

---

## 🛠️ Development & Testing

**Contributing & Test Documentation**

- **[Testing Guide](testing/TESTING.md)** - Overview of 170+ test suite
- **[Cache Control Tests](testing/cache-control-tests.md)** - **NEW!** Phase 2.2 cache_control test suite documentation (84 tests)
- **[Production Hardening Tests](testing/production-hardening-tests.md)** - **NEW!** Phase 3 complete test documentation (151 tests)
  - ErrorHandler unit tests (44): Cache degradation, OOM recovery, network retry
  - MetricsCollector unit tests (52): Cache tracking, latency percentiles, memory, throughput
  - ConfigValidator unit tests (60): Port validation, env vars, model paths, dependencies
  - Integration + regression tests (18 + 11): Metrics endpoint, error recovery
- **[Production Hardening Implementation](development/production-hardening-implementation.md)** - **NEW!** Phase 3 detailed implementation guide
  - ErrorHandler: Error recovery with graceful degradation (44 tests)
  - MetricsCollector: Performance metrics with JSON/Prometheus export (52 tests)
  - ConfigValidator: Pre-startup configuration validation (60 tests)
  - Integration guide for MLX server (18 integration tests + 11 regression tests)
- **[Comprehensive Testing](development/TESTING_COMPREHENSIVE.md)** - Detailed test documentation
  - Unit tests (100 error handling)
  - Integration tests (30 component interactions)
  - End-to-end tests (20 workflows)
  - Performance tests (20 stress/scale)
- **[Development Guide](development/DEVELOPMENT.md)** - Setup for contributors

---

## 🐛 Debugging & Troubleshooting

**Fixing Issues**

- **[Tool Calling Fix](debugging/tool-calling-fix.md)** - Investigation of streaming tool parameters
- **[Tool Call Debug](debugging/tool-call-debug.md)** - Debugging tool execution
- **[Trace Analysis](debugging/trace-analysis.md)** - Using trace files
- **[Capture Tool Calls](debugging/capture-tool-calls.md)** - Recording tool events
- **[MLX Crash Analysis](debugging/mlx-crash-analysis.md)** - Server crash debugging
- **[MLX Integration Findings](debugging/mlx-integration-findings.md)** - MLX-specific insights
- **[Stream Truncation Fix](debugging/stream-truncation-fix.md)** - SSE stream issues

---

## 💾 Caching & Performance

**KV Cache & Optimization**

- **[Cache Performance Tuning](caching/cache-performance-tuning.md)** - Complete guide to cache optimization
  - Configure cache size for your workload
  - Monitor cache hit rates and cost savings
  - Understand performance metrics
- **[Cache Strategy](caching/CACHE_STRATEGY.md)** - Caching approach overview
- **[Implementation Summary](caching/IMPLEMENTATION_SUMMARY.md)** - Cache implementation details
- **[Quick Start](caching/QUICK_START.md)** - Getting started with caching
- **[Prompt Cache Explanation](caching/PROMPT_CACHE_EXPLANATION.md)** - Technical details
- **[Cache Control Headers](architecture/cache-control-headers.md)** - Phase 2.2 implementation for cache_control detection (see Architecture section)

---

## 📖 Reference

**Technical References**

- **[Production Hardening API](reference/production-hardening-api.md)** - **NEW!** Phase 3 API reference
  - `/v1/metrics` endpoint with JSON/Prometheus formats
  - ErrorHandler class API (CacheError, OOMError, NetworkError)
  - MetricsCollector class API (15 methods)
  - ConfigValidator class API (8 methods)
  - Integration examples and security notes
- **[Claude Code Auth](reference/claude-code-auth.md)** - Authentication mechanism
- **[GitHub Issues Summary](reference/github-issues-summary.md)** - Known issues and status
- **[Path Setup](reference/path-setup-complete.md)** - Environment configuration

---

## 📄 Project Documentation

**Core Project Files**

- **[README.md](../README.md)** - Main project overview
- **[PROJECT.md](../PROJECT.md)** - Complete architecture and design
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history and changes
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - How to contribute
- **[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)** - Community guidelines
- **[SECURITY.md](../SECURITY.md)** - Security policy
- **[CLAUDE.md](../CLAUDE.md)** - Claude Code-specific instructions
- **[LICENSE](../LICENSE)** - MIT License

---

## 📊 Documentation Statistics

| Category     | Files  | Purpose                      |
| ------------ | ------ | ---------------------------- |
| Guides       | 15     | User guides and tutorials    |
| Development  | 2      | Contributing and testing     |
| Debugging    | 7      | Troubleshooting and analysis |
| Architecture | 2      | Design and architecture      |
| Caching      | 5      | Performance optimization     |
| Reference    | 3      | Technical references         |
| **Total**    | **34** | **Complete documentation**   |

---

## 🎯 Quick Navigation

**By Task**

| Task                    | Documentation                                       |
| ----------------------- | --------------------------------------------------- |
| Install anyclaude       | [Installation](guides/installation.md)              |
| Configure settings      | [Configuration](guides/configuration.md)            |
| Run tests               | [Testing Guide](testing/TESTING.md)                 |
| Debug issues            | [Debugging Guides](debugging/)                      |
| Understand architecture | [PROJECT.md](../PROJECT.md)                         |
| Contribute code         | [Development](development/DEVELOPMENT.md)           |
| Optimize performance    | [Cache Tuning](caching/cache-performance-tuning.md) |
| Understand git hooks    | [CLAUDE.md](../CLAUDE.md#-git-automation-hooks)     |

---

## 📝 Recent Updates (v2.1.0)

### ✅ New Documentation

- **[Cache Performance Tuning](caching/cache-performance-tuning.md)** - Complete guide to cache optimization, monitoring, and tuning

### ✅ Updated Documentation

- **[README.md](../README.md)** - Added latest improvements section, updated testing docs
- **[CLAUDE.md](../CLAUDE.md)** - Added git hooks automation section

### ✅ Completed Features

- Streaming response safeguards (message_stop guarantee)
- Git hooks for automated regression testing
- Cache performance tuning (60-85% hit rate)
- 170+ comprehensive test suite with pre-push validation

---

## 📝 Notes

All documentation is organized per [CLAUDE.md](../CLAUDE.md) standards:

✅ Core files in root directory
✅ Guides in `docs/guides/`
✅ Development docs in `docs/development/`
✅ Debugging guides in `docs/debugging/`
✅ Architecture docs in `docs/architecture/`
✅ Reference docs in `docs/reference/`
✅ Feature-specific docs in feature folders (e.g., `docs/caching/`)

---

**Last Updated**: 2025-10-30
**Status**: ✅ Complete and Up-to-Date
