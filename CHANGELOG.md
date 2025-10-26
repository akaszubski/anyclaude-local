# Changelog

All notable changes to anyclaude-lmstudio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2025-10-26

### Fixed
- **🎉 Tool calling completely fixed!** - Resolved all "Error reading file" and tool execution failures
  - Implemented proper streaming tool parameter handling via `input_json_delta` events
  - Track streamed tool IDs to prevent duplicates from AI SDK's redundant events
  - Aligned with original [coder/anyclaude](https://github.com/coder/anyclaude) streaming approach
  - **Result**: 0 errors - tool calls work perfectly with all LMStudio models
  - Verified with Qwen3 Coder 30B, GPT-OSS-20B, and multiple tool types
  - See [docs/debugging/tool-calling-fix.md](docs/debugging/tool-calling-fix.md) for complete investigation

### Changed
- **Major architectural documentation update** - PROJECT.md now emphasizes translation layer concept
  - Updated tool calling solution with correct streaming implementation
  - Added 5-layer architecture diagram showing translation flow
  - Documented key translation challenges and solutions
  - Emphasized "Active Translation, Not Simple Passthrough" principle
- **Documentation reorganization** - Moved from root clutter to organized structure
  - Created `docs/` directory with categorized subdirectories
  - `docs/guides/` - User guides (authentication, mode switching, installation)
  - `docs/development/` - Development and testing guides
  - `docs/debugging/` - Debugging tools and tool calling investigation
  - `docs/architecture/` - Architectural documentation
  - `docs/reference/` - Technical references
  - Added `docs/README.md` as comprehensive documentation index
  - **Root now clean**: Only essential files (README, CHANGELOG, LICENSE, etc.)
- **README.md messaging updated** - Changed from "simplified fork" to "intelligent translation layer"
  - Accurately reflects project's architectural complexity
  - Matches PROJECT.md's positioning as Claude Code 2.0 port
  - Added links to organized documentation structure

### Added
- **Mode switching**: Toggle between LMStudio (local models) and Claude (real Anthropic API) modes
  - `ANYCLAUDE_MODE=claude|lmstudio` environment variable
  - `--mode=claude|lmstudio` CLI flag (takes priority over env var)
  - Default mode: `lmstudio` (backwards compatible)
- **Trace logging**: Automatic request/response logging in Claude mode
  - Saves full tool schemas, requests, and responses
  - Stored in `~/.anyclaude/traces/claude/` directory
  - Timestamped JSON format for easy parsing
  - API keys automatically redacted from traces
  - Restrictive file permissions (0600) for security
- **TRACE debug level (3)** - Enhanced debugging for tool call investigation
  - Logs all tool-input-start/delta/end events
  - Shows complete tool call parameters
  - Tracks streaming vs atomic tool call handling
- **Anthropic provider integration**: Real Claude API support in Claude mode
  - Passthrough mode (no format conversion)
  - Full compatibility with Claude Code
  - Uses `@ai-sdk/anthropic` package
- **Unit tests**: Comprehensive test coverage for trace logging
  - Directory creation and permissions
  - File writing and reading
  - API key sanitization
  - Trace file management

### Security
- API keys redacted from all trace files
- Trace files created with 0600 permissions (read/write by owner only)
- Trace directories created with 0700 permissions (full access by owner only)
- Sensitive headers (x-api-key, Authorization, etc.) automatically sanitized

### Documentation
- **NEW**: [docs/README.md](docs/README.md) - Complete documentation index
- **NEW**: [docs/debugging/tool-calling-fix.md](docs/debugging/tool-calling-fix.md) - Tool calling investigation
- **UPDATED**: PROJECT.md - Corrected tool calling section, emphasized translation layer
- **UPDATED**: README.md - Changed messaging to match architectural reality
- Added organized documentation structure (guides, development, debugging, architecture, reference)
- Added example workflow for reverse engineering tool schemas
- Added security best practices for trace files

### BREAKING CHANGES
- **Version bump to 2.0.0** due to:
  - Complete rewrite of tool calling mechanism (architectural change)
  - Dual-mode architecture (claude vs lmstudio)
  - Documentation reorganization (file paths changed)
  - While backward compatible in usage, represents major architectural evolution

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
