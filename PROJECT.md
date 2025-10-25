# PROJECT.md - anyclaude-lmstudio

**Last Updated**: 2025-10-25
**Version**: 1.0.0
**Status**: Active Development

---

## GOALS

### Primary Goals
1. **Enable Claude Code with local LMStudio models** - Bridge Claude Code to work seamlessly with any LMStudio-compatible local model
2. **Zero cloud dependency** - Fully local operation without requiring cloud API keys
3. **Seamless model switching** - Allow users to change LMStudio models on-the-fly without restarting the proxy
4. **Simplicity over features** - Maintain minimal, focused codebase for local-first usage
5. **Fork integrity** - Properly attribute original anyclaude project and maintain clean fork relationship

### Success Metrics
- Users can run Claude Code with local models in under 5 minutes
- Model switching works without proxy restart
- Codebase remains <500 lines simpler than original anyclaude
- Clear attribution to original project maintained

---

## SCOPE

### In Scope
✅ **LMStudio Integration**
- HTTP proxy server that mimics Anthropic API
- Anthropic Messages API ↔ OpenAI Chat Completions format conversion
- Streaming response handling (SSE format)
- Tool calling translation
- Debug logging system

✅ **Dynamic Model Switching**
- Generic model name approach (`current-model`)
- No restart required when changing LMStudio models
- LMStudio serves whatever is currently loaded

✅ **Developer Experience**
- Simple npm installation
- Environment variable configuration
- Debug modes (basic and verbose)
- Proxy-only testing mode
- Clear documentation and testing guides

✅ **Code Quality**
- TypeScript with strict typing
- Prettier formatting
- Clean separation of concerns (main, proxy, converters)
- Comprehensive error handling

### Out of Scope
❌ **Cloud Providers** - No OpenAI, Google, xAI, Azure, or cloud Anthropic support
❌ **Failover Systems** - No circuit breakers, health checks, or automatic failover
❌ **Advanced Features** - No GPT-5 reasoning controls, service tier management
❌ **Multi-Provider Routing** - Single provider (LMStudio) only
❌ **Model Discovery** - No automatic model detection or registry

---

## CONSTRAINTS

### Technical Constraints
- **Platform**: Node.js/Bun runtime required
- **Build**: TypeScript → CommonJS (Node compatibility)
- **API Format**: Must maintain Anthropic API compatibility for Claude Code
- **LMStudio Format**: OpenAI Chat Completions (legacy) format
- **Dependencies**: Minimal - only @ai-sdk/openai, ai, json-schema

### Operational Constraints
- **LMStudio Required**: User must have LMStudio installed and running
- **Local Only**: No internet required for operation (except initial npm install)
- **Port Allocation**: Proxy uses auto-assigned port (configurable)
- **Model Management**: User handles model downloads via LMStudio UI

### Design Constraints
- **Simplicity First**: Prefer removing features over adding complexity
- **Fork Relationship**: Maintain clear attribution to original anyclaude
- **No Breaking Changes**: Keep environment variable compatibility where possible
- **Debug-Friendly**: Comprehensive logging for troubleshooting

---

## ARCHITECTURE

### System Overview

```
Claude Code (Anthropic format)
       ↓
  ANTHROPIC_BASE_URL → http://localhost:PORT
       ↓
┌─────────────────────────────────┐
│   anyclaude-lmstudio Proxy      │
│                                 │
│  1. Receive Anthropic request   │
│  2. Convert to OpenAI format    │
│  3. Forward to LMStudio         │
│  4. Convert response back       │
│  5. Stream to Claude Code       │
└─────────────────────────────────┘
       ↓
  LMStudio (OpenAI Chat Completions)
       ↓
  Local Model (Mistral, Llama, DeepSeek, etc.)
```

### Core Components

#### 1. **Entry Point** (`src/main.ts`)
- **Purpose**: Bootstrap proxy and spawn Claude Code
- **Responsibilities**:
  - Configure LMStudio provider with OpenAI SDK
  - Set `compatibility: 'legacy'` for LMStudio compatibility
  - Strip unsupported parameters (reasoning, service_tier)
  - Spawn Claude Code with `ANTHROPIC_BASE_URL` override
  - Handle PROXY_ONLY mode for testing

#### 2. **HTTP Proxy Server** (`src/anthropic-proxy.ts`)
- **Purpose**: HTTP server that translates API formats
- **Responsibilities**:
  - Accept Anthropic Messages API requests
  - Route `/v1/messages` to LMStudio
  - Pass through non-/v1/messages to Anthropic (fallback)
  - Handle streaming and non-streaming responses
  - Error translation and debug logging
  - Timeout monitoring and performance tracking

#### 3. **Message Converters** (`src/convert-anthropic-messages.ts`)
- **Purpose**: Bidirectional message format translation
- **Responsibilities**:
  - Anthropic Messages → AI SDK CoreMessages
  - System prompts as separate field → system message
  - Content blocks → simple message format
  - Tool use format translation

#### 4. **Stream Converter** (`src/convert-to-anthropic-stream.ts`)
- **Purpose**: Convert AI SDK streams to Anthropic SSE format
- **Responsibilities**:
  - Map stream chunk types (text-start, text-delta, tool-input-start, etc.)
  - Handle reasoning blocks (OpenAI → Anthropic thinking)
  - Token usage tracking and cache statistics
  - Error chunk handling

#### 5. **Schema Adapter** (`src/json-schema.ts`)
- **Purpose**: Adapt tool schemas for LMStudio
- **Responsibilities**:
  - Provider-specific schema transformations
  - JSON schema validation
  - Tool definition mapping

#### 6. **Debug System** (`src/debug.ts`)
- **Purpose**: Comprehensive debug logging
- **Responsibilities**:
  - Two-level debug output (ANYCLAUDE_DEBUG=1|2)
  - Temp file dumps for errors
  - Request/response timing
  - Stream chunk monitoring

### Data Flow

#### Request Flow (Claude Code → LMStudio)
```typescript
1. Claude Code sends Anthropic Messages request
   → POST /v1/messages
   → Body: { model, messages, system, tools, max_tokens, stream }

2. Proxy receives request (anthropic-proxy.ts)
   → Extract body
   → Use defaultProvider="lmstudio", defaultModel="current-model"

3. Convert Anthropic → AI SDK format
   → convertFromAnthropicMessages(messages)
   → Extract system prompt
   → Convert tools to AI SDK format

4. Forward to LMStudio (via OpenAI SDK)
   → streamText({ model, system, tools, messages })
   → compatibility: 'legacy' ensures Chat Completions format
   → max_tokens (not max_completion_tokens)

5. LMStudio returns stream
   → OpenAI Chat Completions format
   → chunks: text-delta, tool-input-start, etc.
```

#### Response Flow (LMStudio → Claude Code)
```typescript
1. Receive AI SDK stream chunks
   → text-start, text-delta, text-end
   → tool-input-start, tool-input-delta, tool-input-end
   → reasoning-start, reasoning-delta, reasoning-end

2. Convert to Anthropic SSE format (convert-to-anthropic-stream.ts)
   → text-start → content_block_start (type: text)
   → text-delta → content_block_delta (type: text_delta)
   → tool-input-start → content_block_start (type: tool_use)
   → reasoning-start → content_block_start (type: thinking)

3. Stream SSE events to Claude Code
   → event: message_start
   → event: content_block_start
   → event: content_block_delta
   → event: content_block_stop
   → event: message_delta
   → event: message_stop
```

### Key Design Decisions

#### 1. **Generic Model Name**
- **Decision**: Use `"current-model"` as default
- **Rationale**: LMStudio serves currently loaded model regardless of API request model name
- **Benefit**: Users can switch models in LMStudio UI without restarting proxy

#### 2. **Legacy Compatibility Mode**
- **Decision**: Use `compatibility: 'legacy'` in OpenAI SDK
- **Rationale**: LMStudio expects classic Chat Completions format
- **Impact**: Uses `max_tokens` instead of `max_completion_tokens`, disables parallel tool calls

#### 3. **Single Provider Architecture**
- **Decision**: Remove all cloud providers, keep only LMStudio
- **Rationale**: Simplify codebase, focus on local-first use case
- **Trade-off**: No provider fallback, but eliminates ~1500 lines of code

#### 4. **Debug System Design**
- **Decision**: Two-level debug logging with temp file dumps
- **Rationale**: Enable troubleshooting without overwhelming users
- **Implementation**: ANYCLAUDE_DEBUG=1 (basic), =2 (verbose)

---

## CURRENT SPRINT

### Sprint Goal
Complete initial release of anyclaude-lmstudio fork with tested model switching capability

### Active Tasks
- ✅ Simplify codebase to LMStudio-only
- ✅ Implement generic model name for dynamic switching
- ✅ Add comprehensive testing documentation
- ✅ Clean up repository and add proper attribution
- ✅ Push to GitHub: https://github.com/akaszubski/anyclaude-lmstudio
- 🔄 Create PROJECT.md from codebase analysis
- 📋 Set up autonomous-dev plugin for quality automation

### Next Steps
1. Test with multiple LMStudio models (Mistral, Llama, DeepSeek)
2. Publish to npm as `anyclaude-lmstudio`
3. Add automated testing (unit tests for converters)
4. Consider adding GitHub Actions for CI

### Risks & Blockers
- **None currently** - Core functionality tested and working

---

## TECHNICAL DEBT

### Known Issues
1. **No automated tests** - Currently manual testing only
2. **Error handling** - Could be more granular for specific LMStudio errors
3. **TypeScript types** - Some `any` types in stream processing

### Future Improvements (Low Priority)
- Add unit tests for message converters
- Add integration tests for proxy server
- Improve TypeScript typing in stream handlers
- Add automatic model detection from LMStudio API
- Support for non-streaming requests optimization

---

## DEPENDENCIES

### Runtime Dependencies
- `json-schema`: ^0.4.0 - JSON schema validation

### Development Dependencies
- `@ai-sdk/openai`: ^2.0.6 - OpenAI provider for AI SDK
- `@types/bun`: latest - Bun type definitions
- `@types/json-schema`: ^7.0.15 - JSON schema type definitions
- `ai`: ^5.0.8 - Vercel AI SDK core
- `prettier`: ^3.6.2 - Code formatting
- `zod`: 3.25.76 - Runtime type validation

### External Dependencies
- **LMStudio**: User must install and run separately
- **Claude Code**: v2.0.0+ required
- **Node.js/Bun**: Runtime environment

---

## TEAM & ROLES

### Maintainer
- **GitHub**: @akaszubski
- **Role**: Fork maintainer, primary developer

### Credits
- **Original Project**: [anyclaude](https://github.com/coder/anyclaude) by Coder Technologies Inc.
- **Original Concept**: Multi-provider Claude Code wrapper
- **Fork Changes**: Simplified to LMStudio-only, removed cloud providers

---

## RELATED DOCUMENTATION

### User Documentation
- `README.md` - Setup and usage guide
- `CLAUDE.md` - Developer guide for Claude Code
- `LICENSE` - MIT license with dual attribution

### Technical Documentation
- Architecture described in this PROJECT.md
- Inline code comments in TypeScript source
- Debug logging for runtime inspection

### External Resources
- LMStudio: https://lmstudio.ai
- Claude Code: https://claude.com/claude-code
- Original anyclaude: https://github.com/coder/anyclaude
