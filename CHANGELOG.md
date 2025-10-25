# Changelog

All notable changes to anyclaude-lmstudio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-10-25

### Added
- **Initial fork from anyclaude v1.2.1** by Coder Technologies Inc.
- **LMStudio-only support** - Simplified to focus exclusively on local models
- **Dynamic model switching** - Use generic "current-model" name to switch LMStudio models without restart
- **Comprehensive documentation** - Setup guides, testing instructions, troubleshooting
- **Debug system** - Two-level debug logging (ANYCLAUDE_DEBUG=1|2)
- **PROJECT.md** - Strategic direction document for autonomous development
- **Testing guides** - Instructions for verifying model switching works

### Removed
- **Cloud provider support** - Removed OpenAI, Google, xAI, Azure, and cloud Anthropic providers (~1500 lines)
- **Failover systems** - Removed circuit breaker, health checks, and automatic failover logic
- **Advanced features** - Removed GPT-5 reasoning controls, service tier management
- **Multi-provider routing** - Simplified to single LMStudio provider
- **Command-line flags** - Removed --reasoning-effort and --service-tier flags
- **Dependencies** - Removed @ai-sdk/anthropic, @ai-sdk/azure, @ai-sdk/google, @ai-sdk/xai, yargs-parser

### Changed
- **Package name** - Renamed from "anyclaude" to "anyclaude-lmstudio"
- **Default model** - Changed from "local-model" to "current-model" for clarity
- **Repository URL** - https://github.com/akaszubski/anyclaude-lmstudio
- **Focus** - Simplified codebase for local-first, privacy-focused usage
- **main.ts** - Reduced from 235 lines to 71 lines
- **anthropic-proxy.ts** - Reduced from 900 lines to 433 lines

### Documentation
- Updated README.md with LMStudio-only setup instructions
- Updated CLAUDE.md with simplified architecture documentation
- Added LICENSE with dual copyright attribution
- Added comprehensive testing section with curl examples
- Created PROJECT.md for autonomous development workflow

### Attribution
- Forked from: https://github.com/coder/anyclaude
- Original authors: Coder Technologies Inc.
- Original license: MIT
- Fork maintains MIT license with dual copyright

## Fork Relationship

This project is a **simplified fork** of the original anyclaude project:

**Original Project**: [anyclaude](https://github.com/coder/anyclaude) by [Coder](https://coder.com)
- Multi-provider support (OpenAI, Google, xAI, Azure, Anthropic)
- Advanced failover and circuit breaker patterns
- GPT-5 reasoning effort controls
- OpenRouter integration

**This Fork**: anyclaude-lmstudio
- **Focused on**: LMStudio local models only
- **Removed**: Cloud provider dependencies and complexity
- **Added**: Dynamic model switching without restart
- **Simplified**: ~1500 lines removed for easier maintenance

All credit for the original concept and implementation goes to the anyclaude team at Coder.

[unreleased]: https://github.com/akaszubski/anyclaude-lmstudio/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/akaszubski/anyclaude-lmstudio/releases/tag/v1.0.0
