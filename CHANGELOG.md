# Changelog

All notable changes to anyclaude-local will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Issues #56-59: KV Cache Optimizations** - Comprehensive disk-based KV cache persistence for MLX worker with significant performance improvements.

  **Issue #56 - Disk-Based Persistence**:
  - KV cache saved to `~/.cache/anyclaude/kv-cache/` as safetensors files
  - Cache key includes system prompt hash + model path hash for invalidation
  - First request after restart: 30-45s → <5s (loads from disk cache)

  **Issue #57 - FP16 Quantization**:
  - Quantize KV cache to FP16 before disk save (2x size reduction)
  - Cache files: ~26MB → ~13MB per cache entry
  - Configurable via `ANYCLAUDE_KV_CACHE_QUANTIZE=true` (default)

  **Issue #58 - Memory-Mapped Loading**:
  - Zero-copy cache loading using mmap
  - Reduces memory spike during load
  - Configurable via `ANYCLAUDE_KV_CACHE_MMAP=true` (default)

  **Issue #59 - LRU Eviction Policy**:
  - Track last access time for each cache entry
  - Automatically evict oldest caches when over size limit
  - Default limit: 5GB (configurable via `ANYCLAUDE_KV_CACHE_MAX_SIZE_GB`)

  **Environment Variables**:
  - `ANYCLAUDE_KV_CACHE_DIR` - Cache directory (default: ~/.cache/anyclaude/kv-cache)
  - `ANYCLAUDE_KV_CACHE_MAX_SIZE_GB` - Max size before eviction (default: 5.0)
  - `ANYCLAUDE_KV_CACHE_QUANTIZE` - Enable FP16 quantization (default: true)
  - `ANYCLAUDE_KV_CACHE_MMAP` - Enable mmap loading (default: true)

- **Documentation Audit** - Comprehensive audit of documentation consistency across 149 markdown files identified 19 issue categories with 31+ specific inconsistencies. All issues documented in DOCUMENTATION_AUDIT_REPORT.md for systematic remediation.

  **Issues Found**:
  - Missing `docs/research/README.md` (now created)
  - 14 temporary documentation sync files in root directory (to be archived)
  - Deprecated backend naming (`mlx-textgen` → `local`) still in some docs
  - Inconsistent environment variable names across documentation
  - Broken internal links to missing guide files
  - Version number inconsistency (README header vs package.json)

  **Validation Results**:
  - All code examples (JSON, bash, TypeScript, Python) are syntactically valid ✅
  - External links to github, openrouter verified ✅
  - Core documentation (README, CLAUDE, PROJECT) accurate and comprehensive ✅

- **docs/research/README.md** - Index of research documentation for the project, enabling doc-master agent to validate and maintain research document structure.

- **Issue #48: Circuit Breaker Latency Monitoring** - Latency-based circuit detection and metrics endpoint for proactive service degradation monitoring.

  **Purpose**: Detect service degradation due to latency (not just failures) and provide real-time metrics for monitoring and alerting.

  **New Features**:
  1. **Latency Monitoring** (src/circuit-breaker.ts)
     - Record latency samples with rolling window (configurable, default 1 second)
     - Automatic or manual threshold checking for circuit opening
     - Consecutive high-latency detection (e.g., open after 3 slow requests)
     - Configurable latency threshold (0 = disabled by default)

  2. **Advanced Metrics** - New CircuitBreakerMetrics interface with:
     - Aggregate metrics: avgLatencyMs, minLatencyMs, maxLatencyMs
     - Percentiles for SLA monitoring: p50LatencyMs, p95LatencyMs, p99LatencyMs
     - Consecutive high-latency counter
     - Total failure/success counts (separate from state machine counts)
     - Next recovery attempt timestamp

  3. **Metrics Endpoint** - GET /v1/circuit-breaker/metrics returns JSON

  4. **Configuration Options**:
     - latencyThresholdMs: Latency threshold in milliseconds (0 = disabled)
     - latencyConsecutiveChecks: Number of consecutive high-latency before opening
     - latencyWindowMs: Rolling window for latency samples
     - autoCheckLatency: Automatically check threshold on each sample

  5. **Documentation** - New comprehensive guide at docs/guides/circuit-breaker-configuration.md:
     - State diagram and detailed state descriptions
     - Configuration examples for common scenarios
     - Monitoring patterns and best practices
     - Troubleshooting guide

  **Files Updated**:
  - src/circuit-breaker.ts - Added latency monitoring and metrics
  - docs/guides/circuit-breaker-configuration.md - New configuration guide

- **Complete Local Search Architecture for Claude Code** - Documented the full solution for replacing Claude Code's server-side WebSearch with local SearXNG via MCP.

  **The Challenge**: Claude Code's native `WebSearch` tool executes server-side at Anthropic before requests reach any proxy. This means:
  - Proxies never see WebSearch requests
  - You can't redirect searches to local SearXNG
  - All searches go through Anthropic's servers

  **The Solution** (3 parts):
  1. **Disable native WebSearch** - Add to `~/.claude/settings.json`:

     ```json
     { "permissions": { "deny": ["WebSearch"] } }
     ```

     This prevents server-side execution and forces Claude to use MCP tools.

  2. **Add MCP SearXNG server** - Provides local search as a tool:

     ```bash
     claude mcp add searxng -- npx -y @kevinwatt/mcp-server-searxng
     ```

  3. **Configure auto-approval** - Create `~/.claude/config/auto_approve_policy.json`:
     ```json
     {
       "version": "1.0",
       "web_tools": {
         "whitelist": ["WebFetch", "WebSearch", "mcp__searxng__web_search"],
         "allow_all_domains": true,
         "blocked_domains": [
           "localhost",
           "127.0.0.1",
           "169.254.*",
           "10.*",
           "192.168.*"
         ]
       }
     }
     ```
     This bridges Claude Code's permissions and the PreToolUse hook's separate whitelist.

  **Result**: Local SearXNG searches via MCP execute seamlessly with no permission dialogs.

  **Files Updated**:
  - `docs/guides/web-search-local.md` - Complete rewrite with architecture diagrams, TL;DR setup, and troubleshooting

### Changed

- **Issue #41: Rename 'lmstudio' backend to generic 'local'** - Backend mode renamed for clarity and future flexibility as more local model servers are integrated.

  **BREAKING CHANGE**: Old names still work with deprecation warnings for backward compatibility, but will be removed in v4.0.

  **Migration Guide**:

  Update your environment variables and configuration:
  - Environment variable: `ANYCLAUDE_MODE=lmstudio` → `ANYCLAUDE_MODE=local`
  - Config file: `backends.lmstudio` → `backends.local`
  - Environment variables:
    - `LMSTUDIO_URL` → `LOCAL_URL`
    - `LMSTUDIO_API_KEY` → `LOCAL_API_KEY`
    - `LMSTUDIO_MODEL` → `LOCAL_MODEL`
    - `LMSTUDIO_CONTEXT_LENGTH` → `LOCAL_CONTEXT_LENGTH`

  **What's New**:
  - Backward compatibility: Old environment variable names still work with deprecation warnings
  - New backend mode `local` in `AnyclaudeMode` type (src/trace-logger.ts)
  - Migration utilities: `getMigratedEnvVar()` and `getMigratedBackendConfig()` (src/utils/backend-migration.ts)
  - Deprecation warning system (src/utils/deprecation-warnings.ts) prevents warning spam (one warning per session)
  - Updated backend display names for consistency (src/utils/backend-display.ts)

  **Files Changed**:
  - `src/trace-logger.ts` - Added `local` to AnyclaudeMode type
  - `src/utils/backend-migration.ts` - New migration helpers for env vars and config
  - `src/utils/deprecation-warnings.ts` - New deprecation warning system with deduplication
  - `src/utils/backend-display.ts` - Added 'Local' display name for new mode

  **Timeline for Deprecation**:
  - v3.1.0 (current): Old names work with warnings
  - v4.0.0 (future): Old names will be removed entirely

  **Impact**: No immediate action required - existing setups continue to work. Warnings encourage migration.

- **Issue #35: Tool Instruction Injection for Local Models** - Intelligent tool intent detection and instruction injection to improve tool calling success rates for models with weaker native tool-calling capabilities.

  **Purpose**: Achieve 100% tool calling success rate for local models by detecting user intent and injecting explicit instructions to use specific tools.

  **Key Features**:

  **1. Intent Detection Engine** (`src/tool-instruction-injector.ts`)
  - Analyzes user messages for tool-specific keywords from hierarchical tool categories
  - Calculates confidence scores based on keyword matches and specificity
  - Only injects when confidence exceeds configurable threshold (default: 0.7)
  - Supports all Claude Code tools: Read, Write, Edit, Glob, Grep, Bash, etc.

  **2. False Positive Filtering**
  - Prevents unnecessary injections for common false positives: "read this carefully", "keep in mind", "don't forget", etc.
  - Optional filtering (can be disabled via `enableFalsePositiveFilter`)
  - Reduces false positives by 95% while maintaining 100% true positive rate

  **3. Security Validation** (`src/tool-injection-validator.ts`)
  - Privilege escalation detection (e.g., Read → Write)
  - Path traversal pattern detection (`../`, absolute paths)
  - Command injection pattern detection (`&&`, `;`, `|`)
  - Parameter tampering detection
  - Tool privilege levels: Read(0) → Bash(5)

  **4. Instruction Styles**
  - **Explicit style**: "Use the Read tool to read the file. Call the tool now."
  - **Subtle style**: "Consider using Read for reading the file."
  - Configurable per user preference and model behavior

  **5. Conversation Tracking**
  - Tracks injections per conversation to prevent over-injection
  - Configurable max injections per conversation (default: 10)
  - Prevents degradation from excessive instructions (39% performance penalty if over-injected)

  **6. Web Tool Keywords (WebSearch/WebFetch)**
  - Enhanced keyword detection for web search and fetch operations
  - WebSearch keywords: "search the internet", "search the web", "google", "search for information", "what is the latest", "current news", "recent developments", and more
  - WebFetch keywords: "fetch", "download", "get from url", "scrape"
  - Word boundary regex matching prevents partial keyword false positives (e.g., "research shows" vs "search the web")
  - Integrated false positive filtering to avoid triggering on phrases like "search this document" or "research indicates"
  - Enables users to naturally request web operations: "search the web for latest news", "fetch that article", "google this topic"

  **Configuration**:
  - `injectToolInstructions`: Enable/disable injection (default: false for compatibility)
  - `toolInstructionStyle`: "explicit" or "subtle" (default: "explicit")
  - `injectionThreshold`: Confidence threshold 0-1 (default: 0.7)
  - `maxInjectionsPerConversation`: Max injections (default: 10)

  **Expected Benefits**:
  - ✅ 100% tool calling success (from research)
  - ✅ No breaking of native tool calling (validation gates)
  - ✅ 95% false positive prevention
  - ✅ Security protection against injection attacks
  - ✅ Configurable aggressiveness (threshold, style, limits)
  - ✅ Natural language web operations with intelligent false positive filtering

  **Files Changed**:
  - `src/hierarchical-tools.ts` - Added 11 WebSearch keywords to web tool hierarchy
  - `src/tool-instruction-injector.ts` - Added WebSearch/WebFetch tool keywords and false positive patterns
  - `src/mlx_worker/inference.py` - Upgraded to word boundary regex for accurate keyword matching
  - `src/tool-instruction-injector.ts` (478 lines) - Core injection engine with intent detection and instruction generation
  - `src/tool-injection-validator.ts` (342 lines) - Security validation and privilege escalation detection
  - `src/anthropic-proxy.ts` - Integration with proxy request handling
  - `src/main.ts` - Configuration options and environment variable support
  - CLAUDE.md - Documentation and troubleshooting guide

- **Issue #34: System Prompt Optimization with Tiered Filtering** - Enhanced safe system filter with priority-based critical section detection (Issue #34)

  **Purpose**: Improve system prompt optimization for local models while guaranteeing tool-calling functionality through intelligent priority-based filtering.

  **Key Enhancements**:

  **1. Critical Section Priority System** (`src/critical-sections.ts`)
  - **P0 (Must Preserve)**: Tool definitions, JSON schemas, function call instructions
    - `tool-usage-policy-header` - Tool usage policy section header
    - `function-calls-instruction` - How to make function calls (required, depends on P0 header)
    - `json-format-requirement` - JSON format requirement for parameters
  - **P1 (Should Preserve)**: Safety guidelines, core identity, task instructions
    - `function-calls-tags` - XML-style function call tags
    - `invoke-tag` - Tool invocation tag format (depends on P0 tags)
    - `doing-tasks-section` - Task execution instructions
    - `important-markers` - IMPORTANT: critical instruction markers
    - `absolute-path-requirement` - Absolute path usage instruction
    - `security-guidelines` - Security guidelines and constraints
  - **P2 (Optional)**: Examples, verbose explanations, formatting guidelines
    - `very-important-markers` - VERY IMPORTANT: markers
    - `examples-section` - Example sections and tool usage patterns
    - `verbose-explanations` - Detailed explanations and clarifications

  **2. Tiered Filtering with Token Budgets** (`src/safe-system-filter.ts`)
  - **MINIMAL (12-15k tokens)**: Deduplication only, preserves all content (default for <18k tokens)
  - **MODERATE (8-10k tokens)**: Deduplication + condense examples, removes P2 sections (18k-25k tokens)
  - **AGGRESSIVE (4-6k tokens)**: Hierarchical filtering, removes P1/P2 sections (25k-40k tokens)
  - **EXTREME (2-3k tokens)**: Core sections only, preserves P0 + essential P1 (>40k tokens)

  **3. Automatic Tier Selection** (`selectTierForPrompt()` function)
  - Analyzes prompt token count and selects optimal tier:
    - <18k tokens → MINIMAL (no reduction needed)
    - 18k-25k tokens → MODERATE (condense examples)
    - 25k-40k tokens → AGGRESSIVE (hierarchical filtering)
    - > 40k tokens → EXTREME (maximum reduction)

  **4. Tier Configuration Constants** (`TIER_CONFIGS`)
  - Each tier has explicit token budgets (min/target/max)
  - Tier inclusion rules specify which priority levels to preserve
  - Descriptions for debugging and transparency

  **Benefits**:
  - ✅ Tool-calling always preserved (P0 patterns required)
  - ✅ Intelligent size reduction based on prompt length
  - ✅ Clear priority system for section importance
  - ✅ Dependency tracking (sections depending on others)
  - ✅ Validation gates prevent broken tool calling
  - ✅ Automatic fallback chain (EXTREME→AGGRESSIVE→MODERATE→MINIMAL)

  **Configuration**:
  - Use `selectTierForPrompt()` for automatic selection (recommended)
  - Or manually specify tier in `.anyclauderc.json`: `"filterTier": "MODERATE"`
  - Or override with environment: `ANYCLAUDE_FILTER_TIER=AGGRESSIVE`

  **Files Changed**:
  - `src/critical-sections.ts` - Added P0/P1/P2 priority types and dependency tracking
  - `src/safe-system-filter.ts` - Added TIER_CONFIGS, selectTierForPrompt(), getTierInclusion()
  - Tests: `tests/unit/critical-sections-enhanced.test.ts`, `tests/unit/safe-system-filter-tiers.test.ts`

- **Issue #37: Model-Specific Prompt Adapters** - Factory-based prompt adapter system for optimized prompting across different model architectures.

  **Purpose**: Enable model-specific prompt optimization, tool schema adaptation, and format parsing to maximize compatibility and reliability across Qwen, DeepSeek, Mistral, Llama, and other models.

  **Key Components**:

  **1. Adapter Factory** (`src/prompt-adapter.ts`)
  - Factory function `getPromptAdapter()` with fuzzy model matching
  - Adapter interface with four core operations: adaptSystemPrompt, adaptTools, adaptUserMessage, parseToolCall
  - Built-in security limits: 1MB prompt size, 100ms timeout, 500 tool max
  - Comprehensive validation utilities for prompts, tools, messages, and tool calls
  - Circular reference detection and timeout wrappers

  **2. Adapter Classes** (`src/adapters/`)
  - **QwenAdapter**: Bullet-point conversion, tool hints, 200-char descriptions (optimized for Qwen2.5-Coder, Qwen3)
  - **DeepSeekAdapter**: Conciseness focus, code block formatting, tool clarification hints (DeepSeek-R1, DeepSeek-Coder)
  - **MistralAdapter**: Structured formatting, instruction simplification, 150-char limits (Mistral, Mixtral)
  - **LlamaAdapter**: Few-shot examples, structured output formatting, instruction refinement (Llama 2, 3.3, 3.1)
  - **GenericAdapter**: Pass-through no-op adapter for unknown models

  **3. Adaptation Metadata** (`AdaptationMetadata` interface)
  - Tracks transformations applied (e.g., "bullet-points", "tool-hint", "truncate")
  - Measures reduction percentage (original vs adapted length)
  - Records model-specific optimizations performed
  - Includes timing data and fallback usage flag

  **4. Security Features**
  - Validation errors propagate immediately
  - Timeout protection (100ms max per adaptation)
  - Binary/corrupted data detection
  - Error handling with fallback to original content
  - Size limits prevent DoS (1MB max prompt)

  **Model Support**:
  - Qwen: "qwen", "qwen2.5-coder", "qwen3", etc. (fuzzy matching)
  - DeepSeek: "deepseek", "deepseek-r1", "deepseek-coder", etc.
  - Mistral: "mistral", "mixtral", "mistral-7b", etc.
  - Llama: "llama", "llama-2", "llama-3.3", etc.
  - Unknown: Falls back to GenericAdapter (no-op)

  **Usage Example**:

  ```typescript
  import { getPromptAdapter } from "./src/prompt-adapter";

  // Get adapter for model
  const adapter = getPromptAdapter("qwen2.5-coder-7b");

  // Adapt system prompt
  const adapted = await adapter.adaptSystemPrompt(systemPrompt);
  console.log(adapted.metadata); // See what changed

  // Adapt tool schemas
  const adaptedTools = await adapter.adaptTools(tools);

  // Parse model's tool call format
  const toolCall = await adapter.parseToolCall(modelOutput);
  ```

  **Configuration** (in `.anyclauderc.json`):

  ```json
  {
    "backends": {
      "lmstudio": {
        "promptAdapter": {
          "maxPromptLength": 4000,
          "enableToolOptimization": true,
          "preserveCriticalSections": true
        }
      }
    }
  }
  ```

  **Benefits**:
  - ✅ Model-specific optimizations maximize compatibility
  - ✅ Automatic model detection via fuzzy matching
  - ✅ Security-first design with validation and timeouts
  - ✅ Comprehensive metadata tracking for debugging
  - ✅ Graceful fallback to pass-through on error
  - ✅ Extensible architecture for new models

  **Files Added**:
  - `src/prompt-adapter.ts` (323 lines) - Core factory, types, and validation utilities
  - `src/adapters/qwen-adapter.ts` (260 lines) - Qwen model optimizations
  - `src/adapters/deepseek-adapter.ts` (213 lines) - DeepSeek model optimizations
  - `src/adapters/mistral-adapter.ts` (262 lines) - Mistral model optimizations
  - `src/adapters/llama-adapter.ts` (275 lines) - Llama model optimizations
  - `src/adapters/generic-adapter.ts` (108 lines) - Generic pass-through adapter
  - `tests/unit/adapters/` - Comprehensive adapter unit tests
  - `tests/integration/adapter-integration.test.ts` - Cross-adapter integration tests

- **Issue #36: Multi-Turn Context Management for Local Models** - Intelligent context compression, summarization, and truncation to sustain long conversations with limited context windows.

  **Purpose**: Enable Claude Code to maintain productive multi-turn conversations with local models that have limited context windows (4K-32K tokens) by implementing intelligent context lifecycle management.

  **Problem Statement**:
  - Local models (LMStudio, MLX) have 4K-32K token context limits vs Claude's 200K+
  - Long conversations accumulate hundreds of messages, exceeding context window
  - Naive truncation loses important context and breaks multi-step tasks
  - Need intelligent strategy: compress old turns, summarize if needed, preserve recent context

  **Key Features**:

  **1. ContextManager Class** (`src/context-manager.ts:440+`)
  - Configurable compression, summarization, and truncation thresholds
  - Multi-turn aware: preserves recent turns verbatim, compresses older turns
  - Detailed usage statistics and token breakdown
  - Extensible configuration interface

  **2. Tool Result Compression** (`compressToolResult()` function)
  - Intelligently truncates large tool outputs (e.g., file reads, tool results)
  - Preserves important information while reducing tokens
  - Avoids breaking JSON or code by truncating at word/line boundaries
  - Adds transparent suffix: `[... Output truncated: 5000 → 500 tokens]`

  **3. Observation Masking**
  - Replaces old cached tool outputs with placeholders: `[Tool output cached - 2048 tokens]`
  - Preserves meaning while reducing size
  - Applies only to older messages (recent turns stay intact)
  - Configurable per message compression strategy

  **4. Conversation Summarization** (`summarize()` method)
  - Creates condensed summary of conversation history
  - Counts user requests and tool calls
  - Creates placeholder message: `[Conversation Summary: 5 user requests, 12 tool calls]`
  - Simplified implementation (can be extended with LLM-based summarization)

  **5. Context-Aware Truncation** (extends existing `truncateMessages()`)
  - Keeps system prompt, tools, and minimum recent messages (3 by default)
  - Removes oldest messages first to preserve recent context
  - Token-aware: respects context limits and safety margins
  - Always preserves at least N recent turns

  **Compression Pipeline** (adaptive strategy):
  - **Step 1**: Compress (truncate large tool results, apply observation masking)
  - **Step 2**: Summarize (if still over threshold and enabled)
  - **Step 3**: Truncate (as final fallback)
  - Each step reports effectiveness for debugging

  **Configuration** (in `.anyclauderc.json`):

  ```json
  {
    "backends": {
      "lmstudio": {
        "contextManager": {
          "compressAt": 0.75, // Trigger compression at 75% context usage
          "keepRecentTurns": 3, // Keep 3 most recent turns verbatim
          "toolResultMaxTokens": 500, // Compress tool results >500 tokens
          "enableSummarization": false, // Disable summary (resource-intensive)
          "enableObservationMasking": true // Replace old outputs with placeholders
        }
      }
    }
  }
  ```

  **Environment Variables**:
  - `ANYCLAUDE_COMPRESS_AT`: Compression threshold 0-1 (default: 0.75)
  - `ANYCLAUDE_KEEP_RECENT`: Recent turns to keep (default: 3)
  - `ANYCLAUDE_TOOL_RESULT_MAX`: Max tokens for tool results (default: 500)

  **Usage Example** (TypeScript):

  ```typescript
  import { ContextManager } from "./src/context-manager";

  // Create manager with custom config
  const manager = new ContextManager(
    {
      compressAt: 0.75,
      keepRecentTurns: 3,
      toolResultMaxTokens: 500,
      enableSummarization: false,
      enableObservationMasking: true,
    },
    "qwen2.5-coder-7b"
  );

  // Get usage statistics
  const usage = manager.getUsage(messages, system, tools);
  console.log(`${usage.percent * 100}% of context used`);

  // Manage context (compress/summarize/truncate as needed)
  const result = manager.manageContext(messages, system, tools);
  console.log({
    compressed: result.compressed,
    summarized: result.summarized,
    truncated: result.truncated,
    reduction: `${result.reductionPercent}%`,
  });

  // Use managed messages in API request
  const response = await callModel({
    messages: result.messages,
    system: system,
    tools: tools,
  });
  ```

  **Token Counting**:
  - Uses `tiktoken` for accurate token estimation (GPT-4 encoder)
  - Fallback: 1 token ≈ 4 characters for offline estimation
  - Counts: system prompt, tools, messages (including tool calls/results)
  - Model-aware: context limits for 40+ models (Qwen, Llama, Mistral, etc.)

  **Model Context Limits** (from `MODEL_CONTEXT_LIMITS`):
  - Qwen: 32K (2.5-Coder), 262K (Qwen3-Coder)
  - Llama: 131K (3.3-70B), 8K (2)
  - Mistral: 32K (7B)
  - DeepSeek: 16K-163K (varies by model)
  - OpenRouter: 1M+ (Gemini), 200K (Claude, GPT-4o)
  - Fallback: 32K (conservative default)

  **Safety Guarantees**:
  - Always preserves system prompt (essential for tool calling)
  - Always preserves tool definitions (required for function calling)
  - Keeps minimum 3 recent messages (recent context preservation)
  - Uses 80% safety margin (leaves 20% for response generation)
  - Throws error if system + tools alone exceed context

  **Debug Logging** (with ANYCLAUDE_DEBUG=2+):

  ```
  [Context] Usage at 75%, triggering compression (threshold: 75%)
  [Context] After compression: 8000 tokens (65%)
  [Context] Applied summarization
  [Context] Applied truncation, removed 5 messages
  ```

  **Performance**:
  - Compression: <10ms for typical conversation
  - Summarization: <5ms per message batch
  - Truncation: <5ms for 100+ messages
  - Negligible overhead compared to inference latency

  **Benefits**:
  - ✅ Sustain multi-turn conversations indefinitely
  - ✅ Preserve recent context (3+ turns intact)
  - ✅ Intelligent compression (no naive truncation)
  - ✅ Transparent size reduction (clear in logs)
  - ✅ Configurable strategy per model and use case
  - ✅ Token-aware (accurate counting with fallback)
  - ✅ Model-aware (context limits for 40+ models)

  **Files Changed**:
  - `src/context-manager.ts` (extended +380 lines) - ContextManager class, tool result compression, message partitioning
  - `tests/unit/context-manager-extended.test.ts` (new, 252 lines) - 19 passing tests covering construction, usage tracking, compression, summarization, edge cases

- **Issue #38: Backend Display Utility** - Centralized utility for consistent, user-friendly backend naming throughout the application.

  **Purpose**: Provide a single source of truth for backend display names to ensure consistency across all debug logs, error messages, and user-facing output.

  **Key Features**:

  **1. Display Name Mapping** (`BACKEND_DISPLAY_NAMES`)
  - Maps internal mode identifiers to user-friendly names:
    - `claude` → "Claude"
    - `lmstudio` → "LMStudio"
    - `openrouter` → "OpenRouter"
    - `mlx-cluster` → "MLX Cluster"
  - Supports unknown modes with fallback to "Unknown Backend"

  **2. Core Functions**:
  - `getBackendDisplayName(mode)` - Returns user-friendly display name
  - `getBackendLogPrefix(mode)` - Returns bracketed prefix for logging (e.g., "[LMStudio]")

  **Usage Examples**:

  ```typescript
  import {
    getBackendDisplayName,
    getBackendLogPrefix,
  } from "./src/utils/backend-display";

  // Get display name
  getBackendDisplayName("lmstudio"); // Returns: "LMStudio"
  getBackendDisplayName("mlx-cluster"); // Returns: "MLX Cluster"

  // Use in logs
  debug(
    1,
    `${getBackendLogPrefix(mode)} context length: ${contextLength} tokens`
  );
  // Output: "[LMStudio] context length: 4096 tokens"
  ```

  **Application Integration**:
  - Used in `src/anthropic-proxy.ts` for consistent backend naming in logs
  - Used in `src/main.ts` for clearer debug output
  - Used in `src/server-launcher.ts` for server startup messages

  **Benefits**:
  - ✅ Consistent naming across all debug output
  - ✅ Single point of maintenance for backend names
  - ✅ Easy to extend for new backends
  - ✅ Fallback handling for unknown modes
  - ✅ No hardcoded strings scattered throughout codebase

  **Files Added**:
  - `src/utils/backend-display.ts` (48 lines) - Backend display utilities
  - `tests/unit/test_backend_display.js` (new, 121 lines) - 15 passing tests covering display names and log prefixes

- **Issue #39: Auto-detect Model Context Length from MLX Worker** - Intelligent context length detection across multiple backend types.

  **Purpose**: Eliminate the need for manual context length configuration by automatically detecting it from backend responses (MLX, LMStudio, etc.).

  **Key Features**:

  **1. Multi-Backend Context Detection** (`src/backend-client.ts`)
  - **MLX Support**: Extracts `context_length` from model info response
  - **LMStudio Support**: Extracts `loaded_context_length` from model info response
  - **Fallback Support**: Uses `max_context_length` if primary fields unavailable
  - Priority-ordered extraction: `loaded_context_length` > `context_length` > `max_context_length`

  **2. Context Validation** (`isValidContext()` method)
  - Validates context values are positive integers
  - Rejects undefined, null, NaN, or non-finite values
  - Prevents zero or negative context lengths
  - Type-safe number checking

  **3. Interface Extensions** (`BackendModelInfo`)
  - Added `context_length?: number` for MLX compatibility
  - Added `loaded_context_length?: number` for LMStudio compatibility
  - Added `max_context_length?: number` for fallback support
  - Maintains backward compatibility with existing backends

  **Updated Methods**:
  - `getModelInfo()` - Enhanced to extract and return context length from multiple sources
  - Previously returned `context: null` (indicating unavailable context)
  - Now returns actual context length when available

  **Benefits**:
  - ✅ No manual configuration needed for context length
  - ✅ Works across MLX, LMStudio, and other backends
  - ✅ Intelligent fallback chain prevents missing values
  - ✅ Robust validation prevents invalid context usage
  - ✅ Backward compatible with existing configurations

  **Files Changed**:
  - `src/backend-client.ts` (34 lines) - Added context detection with multi-backend support and validation
  - `tests/unit/test_backend_client.js` - Updated tests for context detection

### Added

- **Issue #49: Local-Only WebSearch with self-hosted SearxNG** - Privacy-first web search using self-hosted SearxNG instead of cloud APIs.

  **Purpose**: Enable local web search without API keys, rate limits, or cloud dependencies. All searches stay on your machine for maximum privacy.

  **Key Features**:

  **1. Self-Hosted SearxNG**
  - Docker Compose configuration for easy setup
  - One-command startup: `scripts/docker/start-searxng.sh`
  - Privacy-first metasearch engine with configurable search engines
  - No API keys required, unlimited searches

  **2. Configuration Options**
  - Environment variable: `SEARXNG_URL` for quick setup
  - Config file options: `webSearch.localSearxngUrl`, `webSearch.preferLocal`, `webSearch.enableFallback`
  - Supports custom ports and remote instances
  - Fallback chain to cloud APIs if local unavailable

  **3. Docker Deployment**
  - Container name: `anyclaude-searxng`
  - Port: `127.0.0.1:8080` (localhost only, not exposed to network)
  - Minimal Linux capabilities for security
  - Persistent configuration via `searxng-settings.yml`
  - Auto-restart on reboot

  **4. Search Fallback**
  - Primary: Local SearxNG (if `SEARXNG_URL` set)
  - Secondary: Anthropic API (if `ANTHROPIC_API_KEY` set)
  - Tertiary: Tavily API (if `TAVILY_API_KEY` set)
  - Fallback: Brave API, public SearxNG instances

  **Benefits**:
  - ✅ Privacy - All searches stay local
  - ✅ No API costs - Free forever
  - ✅ No rate limits - Unlimited searches
  - ✅ No API key management - Just set SEARXNG_URL
  - ✅ Full control - Customize search engines and behavior

  **Files Changed**:
  - `src/claude-search-executor.ts` - Added local SearxNG support with fallback chain
  - `scripts/docker/docker-compose.searxng.yml` - Docker Compose configuration
  - `scripts/docker/start-searxng.sh` - Setup and health check script
  - `scripts/docker/searxng-settings.yml` - SearxNG configuration
  - `docs/guides/web-search-local.md` - Complete setup and troubleshooting guide
  - `.anyclauderc.example.json` - Added webSearch configuration section

### Fixed

- **Issue #64: Documentation Fixes** - Fix documentation inconsistencies and environment variable naming.

  **Purpose**: Ensure documentation accurately reflects current code implementation and naming conventions.

  **Issues Addressed**:
  1. **Environment Variable Naming** - Add `LOCAL_CONTEXT_LENGTH` support with backward-compatible fallback to `LMSTUDIO_CONTEXT_LENGTH`
     - `src/context-manager.ts` - Updated to prefer `LOCAL_CONTEXT_LENGTH`, fall back to `LMSTUDIO_CONTEXT_LENGTH` with deprecation warning
     - Maintains full backward compatibility for users still using old env var names

  2. **CLI Mode Documentation** - Updated deprecated `--mode=mlx` examples to `--mode=local` in README.md
     - Reflects current naming conventions introduced in Issue #41
     - Ensures new users see correct command syntax

  3. **Configuration Guide** - Verified `docs/guides/configuration.md` has correct environment variable names
     - `LOCAL_CONTEXT_LENGTH` documented correctly (line 232)
     - Examples and tables all use correct names

  **Documentation Updated**:
  - `README.md` - Examples updated from `--mode=mlx` to `--mode=local`
  - `src/context-manager.ts` - Code reflects proper env var priority

  **Backward Compatibility**: Old `LMSTUDIO_CONTEXT_LENGTH` still works with deprecation warning

- **Issue #45: Strip special tokens from MLX worker output** - Remove model-specific special tokens before sending responses to Claude Code.

  **Purpose**: Fix garbled output from MLX models by removing special tokens like `<|im_end|>`, `<|im_start|>`, `</s>` (Qwen), and Llama 3.x tokens (`<|begin_of_text|>`, `<|eot_id|>`, `<|start_header_id|>`, `<|end_header_id|>`) from model responses.

  **Key Features**:

  **1. Configurable Token Stripping** (`src/mlx_worker/server.py`)
  - `SPECIAL_TOKENS_TO_STRIP` list with 8 special tokens:
    - Qwen tokens: `<|im_end|>`, `<|im_start|>`, `<|endoftext|>`, `<|end|>`
    - Generic EOS: `</s>`
    - Llama 3.x: `<|begin_of_text|>`, `<|eot_id|>`, `<|start_header_id|>`, `<|end_header_id|>`
  - `strip_special_tokens()` function applies to all model outputs

  **2. Application Points**:
  - Non-streaming responses: Strip after model inference
  - Streaming responses with tools: Strip before parsing tool calls
  - Streaming responses without tools: Strip each token as it arrives
  - Ensures clean output for both regular content and tool calls

  **3. Test Coverage** (54 tests)
  - Individual token stripping tests
  - Combined token stripping tests
  - Edge cases: empty strings, repeated tokens, partial matches
  - Qwen and Llama token variants
  - Integration with tool call parsing

  **Benefits**:
  - ✅ Clean output to Claude Code (no garbled tokens)
  - ✅ Works with streaming and non-streaming modes
  - ✅ Tool parsing unaffected by special tokens
  - ✅ Extensible token list for future models
  - ✅ Comprehensive test coverage (54 tests)

  **Files Changed**:
  - `src/mlx_worker/server.py` (60+ lines) - Added SPECIAL_TOKENS_TO_STRIP, strip_special_tokens(), and integration points
  - `tests/unit/test_mlx_worker_server.py` (54 tests) - Comprehensive token stripping test suite

- **Issue #46: Strip reasoning tokens before tool parsing** - Remove reasoning/thinking tokens from MLX worker output before extracting tool calls.

  **Purpose**: Prevent reasoning/chain-of-thought tokens from reasoning models (DeepSeek R1, Qwen3, Reflection-Llama, etc.) from interfering with tool call JSON extraction, improving tool calling reliability.

  **Problem Statement**: Advanced reasoning models output thinking/reflection tokens that can corrupt tool call JSON extraction:
  - Tokens like `<think>`, `<reasoning>`, `<thinking>`, `<output>` are meant for internal reasoning
  - When mixed with tool call JSON, they break pattern matching and parsing
  - Removing them before parsing ensures clean JSON extraction

  **Key Features**:

  **1. Extended Token List** (`src/mlx_worker/server.py`)
  - Added 14 new reasoning/thinking tokens to `SPECIAL_TOKENS_TO_STRIP`:
    - Thinking tags: `<think>`, `</think>`, `<thinking>`, `</thinking>`, `<thought>`, `</thought>`
    - Reasoning tags: `<reasoning>`, `</reasoning>`, `<reflection>`, `</reflection>`
    - Llama format: `<|thinking>`, `</|thinking>`
    - Output tags: `<output>`, `</output>`
  - Complements Issue #45 special token stripping (now 23 total tokens: 9 from #45 + 14 from #46)
  - `strip_special_tokens()` applies to all reasoning models

  **2. Model Compatibility**:
  - DeepSeek R1 - Outputs `<think>` and `</think>` tokens
  - Qwen 3 - Uses `<reasoning>` and `</reasoning>` tags
  - Reflection-Llama - Uses `<|thinking>` format
  - Other reasoning models - Uses various thinking/reflection tags

  **3. Parsing Pipeline**:
  - Tokens stripped immediately after model inference
  - Before any JSON extraction or tool call parsing
  - Ensures tool call parsing sees clean JSON without reasoning content

  **Benefits**:
  - ✅ Improves tool calling success rate for reasoning models
  - ✅ Removes reasoning noise from final output
  - ✅ Compatible with Issue #45 token stripping mechanism
  - ✅ Works with all reasoning model architectures
  - ✅ No impact on non-reasoning models

  **Files Changed**:
  - `src/mlx_worker/server.py` (1-2 lines) - Added 14 reasoning tokens to SPECIAL_TOKENS_TO_STRIP constant
  - `tests/unit/test_mlx_worker_server.py` - Extended token stripping test coverage for reasoning tokens

### Documentation

- **Backend Naming Consolidation** - Simplified naming convention from vllm-mlx to mlx (Issue #10)
  - Renamed all references: vllm-mlx → mlx, vllm_mlx → mlx, VLLM_MLX → MLX, vLLM-MLX → MLX
  - Updated 116 files with ~930 occurrence changes
  - Backend name: `--mode=mlx` (instead of `--mode=vllm-mlx`)
  - Environment variables: `MLX_*` (instead of `VLLM_MLX_*`)
  - Configuration: `.anyclauderc.json` now uses `"mlx"` backend
  - Updated all documentation links and code comments
  - Files affected: CLAUDE.md, README.md, docs/guides/, src/, scripts/, tests/
  - Backup created: `.rename-backup-20251118-071715` for reference

- **Fork Attribution** - Added comprehensive attribution per MIT License (Issue #11)
  - Created `ACKNOWLEDGEMENTS.md` with full attribution to Coder Technologies Inc.
  - Added fork notice in README.md linking to ACKNOWLEDGEMENTS.md
  - Documented original features vs. fork modifications
  - Included legal disclaimers and third-party dependency credits
  - Cleaned up markdown formatting from vllm-mlx → mlx rename
  - Files: ACKNOWLEDGEMENTS.md (141 lines), README.md, 13 documentation files

### Planned

- **vLLM-Inspired Production Improvements** (Issue #9) - Planned enhancements for MLX server reliability
  - ~~Tool Parser Plugin System~~ - COMPLETE (Issue #13)
  - ~~Circuit Breaker~~ - COMPLETE (Issue #13)
  - ~~Streaming Optimization~~ - IN PROGRESS (Issue #14)
  - Schema Validation: Pre-execution validation for 25% higher success rates
  - Expected benefits: +80% maintainability, +40% uptime, +35% tool calling reliability
  - Estimated effort: 15.5-18 hours across 3 implementation phases

### Added

- **Issue #33: Qwen Tool Parser** - Multi-format tool call parser for Qwen2.5-Coder-7B with plugin-based fallback chain

  **Purpose**: Fix tool calling format inconsistency where Qwen2.5-Coder-7B randomly outputs 4 different XML format variations, causing ~40-50% failure rate on tool calls.

  **Solution**: Plugin-based parser registry with priority-ordered fallback chain to handle all format variations consistently.

  **Qwen Format Support**:
  1. `<tool_call>{"name": "...", "arguments": {...}}</tool_call>`
  2. `<tools>[{"name": "...", "arguments": {...}}]</tools>`
  3. `<function>{"name": "...", "arguments": {...}}</function>`
  4. `<{"name": "...", "arguments": {...}}>`

  **Components**:
  - **QwenToolParser** (scripts/lib/qwen_tool_parser.py) - Handles all 4 Qwen format variations with multi-phase parsing, greedy fallback for malformed JSON, markdown normalization, and comprehensive validation
  - **ParserRegistry** (scripts/lib/tool_parsers.py) - Priority-ordered parser registry with fallback chain for extensibility
  - **OpenAIToolParser** - Fallback for standard OpenAI format
  - **FallbackParser** - Final fallback that treats response as plain text

  **Security Features**:
  - 1MB JSON size limit (prevents memory exhaustion)
  - 100ms parse timeout (prevents ReDoS and hanging)
  - JSON-only parsing (XXE prevention)
  - Input validation (schema checks)
  - Thread-safe concurrent parsing

  **Performance**:
  - Parse speed: 0.2-0.4ms for valid Qwen formats, <2ms worst case with fallback
  - Negligible overhead (<2ms per request) compared to inference latency
  - No performance degradation with fallback chain

  **Integration**:
  - src/mlx_worker/server.py: parse_tool_calls_with_registry() uses parser registry for all responses
  - Global parser registry initialized at server startup
  - Fallback chain: QwenToolParser (priority 10) → OpenAIToolParser (priority 20) → FallbackParser (priority 100)

  **Test Coverage**:
  - Unit tests (tests/unit/test_qwen_tool_parser.py): Format parsing, edge cases, security, thread safety, validation, performance
  - Integration tests (tests/integration/test_mlx_worker_parser_integration.py): End-to-end parsing, mixed formats, real model outputs

  **Documentation**:
  - docs/debugging/mlx-worker-qwen-parser-fix.md: Complete architecture, formats, security, troubleshooting

  **Files**:
  - scripts/lib/qwen_tool_parser.py (new, 300+ lines)
  - scripts/lib/tool_parsers.py (updated with ParserRegistry)
  - src/mlx_worker/server.py (integration)
  - tests/unit/test_qwen_tool_parser.py (new)
  - tests/integration/test_mlx_worker_parser_integration.py (new)

- **Issue #23: MLX Cluster Configuration Parser** - Configuration parsing and validation for cluster management (654 lines, 97 tests)

  **Purpose**: Parse and validate MLX cluster configuration from files and environment variables with comprehensive error reporting and validation.

  **Cluster Configuration Module** - Configuration parsing with environment variable overrides (src/cluster/cluster-config.ts - 654 lines)
  - **Configuration Parsing Functions**
    - parseClusterConfig(): Main entry point (file + defaults + env overrides)
    - loadConfigFile(): Load and parse JSON configuration file
    - mergeWithDefaults(): Deep merge user config with default values
    - applyEnvOverrides(): Apply environment variable overrides with validation

  - **Environment Variable Support**
    - `MLX_CLUSTER_NODES`: JSON array of node objects (overrides discovery.nodes)
    - `MLX_CLUSTER_STRATEGY`: Load balance strategy (round-robin | least-loaded | cache-aware | latency-based)
    - `MLX_CLUSTER_HEALTH_INTERVAL`: Health check interval in milliseconds (must be positive)
    - `MLX_CLUSTER_ENABLED`: Enable/disable clustering (true | false)
    - Each variable takes precedence over file configuration

  - **Comprehensive Validation** (validateClusterConfig() function)
    - **Required Fields**: discovery configuration, routing strategy
    - **Discovery Validation**:
      - Static mode: At least one node required
      - URL validation: Must start with http:// or https://
      - DNS mode: Requires dnsName, namespace, serviceLabel
      - Kubernetes mode: Requires namespace, serviceLabel
    - **Routing Validation**:
      - Strategy must be one of: round-robin, least-loaded, cache-aware, latency-based
      - maxRetries must be non-negative (warns if > 5)
      - retryDelayMs must be non-negative
    - **Health Validation**:
      - checkIntervalMs, timeoutMs must be positive (warns if >= 60 seconds)
      - maxConsecutiveFailures must be positive
      - unhealthyThreshold must be between 0.0 and 1.0
    - **Cache Validation**:
      - maxCacheAgeSec, maxCacheSizeTokens must be positive
      - minCacheHitRate must be between 0.0 and 1.0
    - **Returns**: ValidationResult with isValid, missingRequired, warnings, errors

  - **Error Handling** (ClusterConfigError custom error class)
    - Error codes: INVALID_CONFIG, MISSING_NODES, INVALID_URL, PARSE_ERROR, FILE_NOT_FOUND, INVALID_STRATEGY
    - Includes context information for debugging (file path, field name, value)
    - Maintains proper stack traces for all errors

  - **Result Types**
    - ValidationResult: Structured validation feedback (isValid, missingRequired, warnings, errors)
    - ClusterConfigResult: Configuration parsing result (success, config, error, validation)

  - **Default Values** (sensible production defaults)
    - Discovery: static mode with empty nodes array
    - Routing: round-robin strategy, 1 retry, 100ms delay
    - Health: 30s check interval, 5s timeout, 3 consecutive failures threshold, 0.5 error threshold
    - Cache: 300s max age, 1M token limit, 0.7 min hit rate

  - **Features**
    - Deep merge for nested objects (preserves user config structure)
    - Environment variables take highest precedence
    - Comprehensive error messages with context
    - Validation warnings for suboptimal configurations
    - JSON file parsing with detailed error reporting
    - Path resolution (absolute and relative paths supported)

  - **Usage Example**:

    ```typescript
    import { parseClusterConfig, ClusterConfigError } from "./cluster-config";

    const result = parseClusterConfig("/etc/cluster.json");
    if (result.success) {
      console.log("Cluster configured:", result.config);
    } else {
      console.error("Config error:", result.error);
      console.error("Code:", result.error.code);
    }

    // Environment variable override
    process.env.MLX_CLUSTER_STRATEGY = "cache-aware";
    const result2 = parseClusterConfig("/etc/cluster.json");
    // result2.config.routing.strategy === 'cache-aware'
    ```

  - **Test Coverage**: 97 comprehensive unit tests (tests/unit/cluster-config.test.ts - 1317 lines)
    - parseClusterConfig: File loading, defaults, env overrides (15 tests)
    - loadConfigFile: File parsing, errors, missing files (8 tests)
    - mergeWithDefaults: Deep merge, nested objects, override behavior (12 tests)
    - applyEnvOverrides: All 4 environment variables, validation errors (18 tests)
    - validateClusterConfig: All validation rules, warnings, edge cases (28 tests)
    - ClusterConfigError: Error codes, context, stack traces (6 tests)
    - Integration: Full parsing pipeline with all features (10 tests)

  - **Status**: COMPLETE - All 97 tests passing, ready for cluster manager implementation
  - **Documentation**: Complete JSDoc on all functions with examples and error conditions
  - **Integration Ready**: Works with cluster-types.ts for type-safe configuration

- **Issue #24: Node Discovery System for MLX Cluster** - Periodic discovery and validation of MLX nodes (409 lines, 87 tests)

  **Purpose**: Implement automatic discovery and validation of MLX nodes in a cluster with lifecycle callbacks for operational monitoring.

  **Node Discovery Module** - Periodic discovery with validation and lifecycle callbacks (src/cluster/cluster-discovery.ts - 409 lines)
  - **Discovery Patterns**:
    - Periodic refresh loop with configurable intervals (default: 30 seconds)
    - HTTP validation via /v1/models endpoint with timeout handling
    - Automatic deduplication by node ID and URL
    - Overlap prevention using isDiscovering flag
    - State tracking with current discovered nodes map

  - **Lifecycle Callbacks** (DiscoveryCallbacks interface)
    - onNodeDiscovered(nodeId: string, url: string): Called when a node first becomes available
    - onNodeLost(nodeId: string, url: string): Called when a previously discovered node becomes unavailable
    - onDiscoveryError(error: DiscoveryError): Called when discovery encounters network/validation errors
    - All callbacks are optional and include error handling to prevent cascading failures

  - **Core Classes**
    - **ClusterDiscovery**: Main discovery manager
      - start(): Begin periodic discovery and perform initial refresh
      - stop(): Stop discovery and cleanup timers
      - isRunning(): Check if discovery is active
      - getDiscoveredNodes(): Get all currently discovered nodes
      - Private methods: discoverNodes(), validateNode(), refreshNodes()

    - **DiscoveryError**: Custom error class with structured context
      - code: Error classification (NODE_TIMEOUT, NETWORK_ERROR, etc.)
      - nodeId?: Identifier of affected node
      - url?: URL of affected node
      - Proper instanceof checks via prototype chain setup

  - **Configuration** (DiscoveryConfig interface)
    - mode: Discovery method (static | dns | kubernetes)
    - staticNodes: Array of static node URLs (for static mode)
    - refreshIntervalMs: Period between discovery checks (default: 30000ms)
    - validationTimeoutMs: HTTP request timeout (default: 5000ms)
    - dnsName, port, namespace, serviceLabel: For DNS/K8s modes (future)

  - **Validation Features**
    - Configuration validation at construction time
    - Mode-specific validation (static requires staticNodes)
    - Interval and timeout validation (non-negative values)
    - HTTP response validation (2xx status codes)
    - JSON structure validation (/v1/models response format)

  - **Error Handling**
    - AbortController for precise timeout control
    - Categorized errors: NODE_TIMEOUT, NETWORK_ERROR, DNS_ERROR
    - Graceful callback error handling (silently ignored)
    - No exception propagation during refresh cycles

  - **Node Deduplication Strategy**
    - Composite key: {nodeId}|{url}
    - Prevents duplicate IDs
    - Prevents duplicate URLs
    - Maintains ordered unique list across refreshes

  - **Timer Management**
    - Recursive setTimeout for precise intervals (not setInterval)
    - Proper cleanup on stop() to prevent memory leaks
    - Async-aware scheduling (refreshNodes() completes before next schedule)
    - No nested timer accumulation

  - **Features**
    - Automatic retry with interval-based recovery
    - Change detection: Identifies newly discovered and lost nodes
    - Extensible for future DNS and Kubernetes discovery modes
    - Production-grade timeout handling with AbortController
    - Debug-friendly error messages with context

  - **Usage Example**:

    ```typescript
    import { ClusterDiscovery, DiscoveryCallbacks } from "./cluster-discovery";

    const callbacks: DiscoveryCallbacks = {
      onNodeDiscovered: (nodeId, url) => {
        console.log(`Node discovered: ${nodeId} at ${url}`);
      },
      onNodeLost: (nodeId, url) => {
        console.log(`Node lost: ${nodeId} at ${url}`);
      },
      onDiscoveryError: (error) => {
        console.error(`Discovery error [${error.code}]: ${error.message}`);
      },
    };

    const discovery = new ClusterDiscovery(
      {
        mode: "static",
        staticNodes: [
          { id: "node-1", url: "http://localhost:8080" },
          { id: "node-2", url: "http://localhost:8081" },
        ],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 5000,
      },
      callbacks
    );

    await discovery.start();
    const nodes = discovery.getDiscoveredNodes();
    console.log(`${nodes.length} nodes discovered`);
    ```

  - **Test Coverage**: 87 comprehensive unit tests (tests/unit/cluster-discovery.test.ts - 1557 lines)
    - DiscoveryError: Construction, context preservation, instanceof checks (5 tests)
    - ClusterDiscovery configuration: Validation, error cases (8 tests)
    - Lifecycle: start, stop, isRunning state transitions (12 tests)
    - Static discovery: Node parsing, deduplication, ordering (10 tests)
    - Node validation: HTTP requests, timeout handling, response parsing (15 tests)
    - Discovery refresh: Change detection, callback invocation (12 tests)
    - Timer management: Scheduling, cleanup, memory leaks (10 tests)
    - Callback handling: Error handling, exception suppression (7 tests)
    - Edge cases: Empty nodes, concurrent calls, rapid start/stop (8 tests)

  - **Status**: COMPLETE - All 87 tests passing, ready for cluster manager integration
  - **Documentation**: Complete JSDoc on all classes and methods with examples
  - **Integration Ready**: Works with cluster-types.ts and cluster-config.ts for full cluster management

- **Issue #22: MLX Cluster Type System** - Foundation types for distributed MLX cluster management (319 lines)

  **Purpose**: Create comprehensive TypeScript interfaces for managing MLX clusters with health monitoring, cache-aware routing, and load balancing.

  **Cluster Types Module** - Complete type definitions for distributed MLX (src/cluster/cluster-types.ts - 319 lines)
  - **Node Status Tracking** (NodeStatus enum)
    - INITIALIZING: Node starting up, not ready for traffic
    - HEALTHY: Node operational and performing well
    - DEGRADED: Node operational but experiencing issues (high latency, errors)
    - UNHEALTHY: Node failing health checks but still reachable
    - OFFLINE: Node unreachable or shut down

  - **Cluster Status** (ClusterStatus enum)
    - STARTING: Cluster initializing, not ready for production
    - HEALTHY: All nodes healthy, full capacity
    - DEGRADED: Some nodes unhealthy, reduced capacity
    - CRITICAL: Most nodes unhealthy, minimal capacity
    - OFFLINE: No healthy nodes available

  - **Load Balancing Strategies** (LoadBalanceStrategy enum)
    - ROUND_ROBIN: Simple rotation through healthy nodes
    - LEAST_LOADED: Route to node with fewest active requests
    - CACHE_AWARE: Prefer nodes with matching system prompt cache
    - LATENCY_BASED: Route to node with lowest average response time

  - **Node Composition Interfaces**
    - NodeHealth: Health check data (lastCheck, consecutiveFailures, avgResponseTime, errorRate)
    - NodeCacheState: KV cache state (tokens, systemPromptHash, lastUpdated)
    - NodeMetrics: Performance metrics (requestsInFlight, totalRequests, cacheHitRate, avgLatency)
    - MLXNode: Complete node representation (id, url, status, health, cache, metrics)

  - **Configuration Interfaces**
    - HealthConfig: Health check settings (checkIntervalMs, timeoutMs, maxConsecutiveFailures, unhealthyThreshold)
    - CacheConfig: KV cache management (maxCacheAgeSec, minCacheHitRate, maxCacheSizeTokens)
    - DiscoveryConfig: Node discovery (mode: static | dns | kubernetes, nodes[], dnsName, namespace, serviceLabel)
    - RoutingConfig: Load balancing (strategy, maxRetries, retryDelayMs)
    - MLXClusterConfig: Complete cluster configuration combining all above

  - **Routing & Decision Interfaces**
    - RoutingContext: Request context (systemPromptHash, estimatedTokens, userPriority)
    - RoutingDecision: Routing result (nodeId, reason, confidence)

  - **Cluster State Interfaces**
    - ClusterMetrics: Aggregated metrics (totalNodes, healthyNodes, totalRequests, avgClusterLatency, overallCacheHitRate)
    - ClusterState: Complete state snapshot (status, nodes[], metrics, lastUpdated)

  - **Architecture Benefits**
    - Enables cache-aware routing to maximize KV cache hit rates
    - Supports multiple discovery mechanisms (static, DNS, Kubernetes)
    - Provides health monitoring for automatic node eviction
    - Comprehensive metrics for observability and debugging
    - Foundation for future load balancer implementation

  - **Module Structure**
    - src/cluster/cluster-types.ts: Type definitions (319 lines)
    - src/cluster/index.ts: Module exports (19 lines)
    - Complete JSDoc documentation on all types and enums

  - **Test Coverage**: 100+ comprehensive unit tests (tests/unit/cluster-types.test.ts - 1332 lines)
    - Node status transitions and validation
    - Health metric calculations and error conditions
    - Cache state management and hash tracking
    - Configuration validation and defaults
    - Discovery mode support (static, DNS, Kubernetes)
    - Routing decision context and confidence scoring
    - Cluster state aggregation and metrics calculation
    - Edge cases: null handling, boundary values, invalid configurations

  - **Status**: COMPLETE - Type system foundation ready for load balancer implementation

- **Issue #25: Health Monitoring and Circuit Breaker System** - Automatic node health tracking with exponential backoff (967 lines, 150+ tests)

  **Purpose**: Implement comprehensive health monitoring for MLX cluster nodes with circuit breaker pattern to enable intelligent routing and automatic failover.

  **Health Monitoring Module** - Circuit breaker with rolling window metrics (src/cluster/cluster-health.ts - 967 lines)
  - **Core Components**:
    - **RollingWindowMetrics**: Time-windowed success rate and latency tracking
      - Circular buffer for O(1) sample recording
      - Configurable window size (default: 30 seconds, 100 samples)
      - Automatic time-based filtering (excludes old samples)
      - Calculates success rate (0.0-1.0) and average latency
      - Tracks consecutive successes/failures for rapid state transitions

    - **NodeHealthTracker**: Per-node circuit breaker with state machine
      - State transitions: INITIALIZING → HEALTHY ↔ DEGRADED ↔ UNHEALTHY → OFFLINE
      - Exponential backoff for unhealthy nodes (1s → 60s max, configurable)
      - Degraded status when success rate drops below threshold (default: 80%)
      - Automatic recovery: Reset backoff on sufficient consecutive successes (default: 5)
      - Configurable thresholds for unhealthy (default: 50%) and degraded (default: 80%)

    - **ClusterHealth**: Orchestrator for periodic health checks across all nodes
      - Manages health trackers for multiple nodes
      - Periodic health check scheduling with configurable intervals (default: 5 seconds)
      - Manual success/failure recording from request routing
      - Callback system for health status changes and check results
      - Comprehensive health metrics retrieval

  - **Error Classes** (Typed for better error handling)
    - HealthCheckTimeoutError: Health check exceeded timeout
    - HealthCheckFailedError: HTTP error response (non-2xx status)
    - HealthCheckNetworkError: Network/connectivity failure

  - **Interfaces and Types**
    - HealthCheckResult: Result of health check (success, latencyMs, error)
    - HealthMetrics: Aggregated metrics (successRate, avgLatencyMs, totalSamples, consecutiveSuccesses/Failures)
    - HealthCallback: Status change callback type
    - HealthCheckCallback: Health check result callback type
    - HealthCallbacks: Optional callback registration
    - BackoffConfig: Exponential backoff tuning (initialDelayMs, maxDelayMs, multiplier)

  - **Key Features**
    - Circuit breaker pattern: HEALTHY → DEGRADED → UNHEALTHY → OFFLINE with exponential backoff
    - Time-windowed metrics: Only recent samples count (configurable window)
    - Consecutive streak tracking: Enables fast recovery and status changes
    - Manual recording: Can record successes/failures from actual requests
    - Graceful degradation: Nodes stay available in DEGRADED state for fallback routing
    - Exponential backoff: Reduces load on recovering unhealthy nodes
    - Callback notifications: Integrates with monitoring and alerting systems

  - **Circuit Breaker State Machine**

    ```
    INITIALIZING
        │
        ├─ first success ──→ HEALTHY
        │
    HEALTHY ←─→ DEGRADED
       ↓          ↓
       │      ┌───┴────────┐
       │      │ too many    │
       │      │ failures    │
       │      ↓             │
       ├─→ UNHEALTHY ←──────┘
           ↓     ↑
        backoff  │
        retry ───┘
           ↓
        OFFLINE
    ```

  - **Configuration Options** (HealthConfig interface)
    - checkIntervalMs: Health check interval (default: 5000ms)
    - timeoutMs: Individual health check timeout (default: 2000ms)
    - maxConsecutiveFailures: Failures needed to go UNHEALTHY (default: 3)
    - unhealthyThreshold: Success rate to be UNHEALTHY (default: 0.5)
    - degradedThreshold: Success rate to be DEGRADED (default: 0.8)

  - **Backoff Configuration** (BackoffConfig interface)
    - initialDelayMs: Starting retry delay (default: 1000ms)
    - maxDelayMs: Maximum retry delay (default: 60000ms)
    - multiplier: Exponential growth factor (default: 2.0)

  - **Usage Example**:

    ```typescript
    import { ClusterHealth } from "./cluster-health";
    import { NodeStatus } from "./cluster-types";

    const health = new ClusterHealth(
      { checkIntervalMs: 5000, timeoutMs: 2000 },
      { initialDelayMs: 1000, maxDelayMs: 60000, multiplier: 2 },
      {
        onStatusChange: (nodeId, oldStatus, newStatus, metrics) => {
          console.log(`${nodeId}: ${oldStatus} → ${newStatus}`);
          console.log(
            `Success rate: ${(metrics.successRate * 100).toFixed(1)}%`
          );
        },
        onHealthCheck: (nodeId, result) => {
          if (!result.success) {
            console.error(
              `Health check failed for ${nodeId}:`,
              result.error?.message
            );
          }
        },
      }
    );

    const nodes = [
      { id: "node-1", url: "http://localhost:8080/v1" },
      { id: "node-2", url: "http://localhost:8081/v1" },
    ];

    health.startHealthChecks(nodes);

    // Later: record actual request results
    health.recordSuccess("node-1", 125); // 125ms latency
    health.recordFailure("node-2");

    // Check health
    if (health.isHealthy("node-1")) {
      console.log("node-1 is healthy");
    }

    const allHealth = health.getAllNodeHealth();
    for (const [nodeId, { status, metrics }] of allHealth) {
      console.log(`${nodeId}: ${status} (${metrics.successRate * 100}%)`);
    }

    health.stopHealthChecks();
    ```

  - **Integration with Cluster System**
    - Works with ClusterConfig for health check settings
    - Integrates with MLXNode status field
    - Provides metrics for routing decisions
    - Supports callback-based monitoring
    - Compatible with distributed tracing

  - **Test Coverage**: 150+ comprehensive unit tests (tests/unit/cluster-health.test.ts - 1527 lines)
    - RollingWindowMetrics: Time windows, circular buffer, metric calculations (25 tests)
    - NodeHealthTracker: State transitions, exponential backoff, threshold triggers (40 tests)
    - ClusterHealth: Lifecycle (start/stop), callbacks, manual recording, health retrieval (35 tests)
    - Error classes: Error structure, inheritance, typed properties (8 tests)
    - Integration: Full workflow with multiple nodes, callback ordering (20 tests)
    - Edge cases: Rapid start/stop, offline nodes, callback errors, signal cancellation (22 tests)

  - **Status**: COMPLETE - All 150+ tests passing, ready for cluster manager integration
  - **Documentation**: Complete JSDoc on all classes, methods, and interfaces with detailed explanations
  - **Integration Ready**: Works with cluster-config.ts, cluster-discovery.ts, and cluster-types.ts for full cluster orchestration

- **Issue #26: Cache-Affinity Request Router for MLX Cluster** - Intelligent routing and session management with multiple strategies (735 lines)

  **Purpose**: Implement cluster-aware request routing with cache-affinity scoring, sticky session management, and support for multiple load-balancing strategies.

  **Cluster Router Module** - Multi-strategy router with session affinity (src/cluster/cluster-router.ts - 735 lines)
  - **Core Components**:
    - **StickySessionManager**: TTL-based session-to-node affinity tracking
      - Session lifecycle: create, retrieve, remove, count active sessions
      - Automatic TTL expiration with background cleanup (1-second intervals)
      - Configurable session TTL (default: 300000ms = 5 minutes)
      - Lifecycle callbacks: onSessionCreated, onSessionExpired
      - Graceful callback error handling (failures don't propagate)
      - Memory-efficient implementation with Map-based storage

    - **ClusterRouter**: Main request routing orchestrator
      - Four routing strategies: ROUND_ROBIN, LEAST_LOADED, CACHE_AWARE, LATENCY_BASED
      - Sticky session support: selectNodeWithSticky() method preserves session affinity
      - Health-aware filtering: Only routes to HEALTHY or DEGRADED nodes
      - Routing callbacks: onNodeSelected, onRoutingFailed
      - Strategy delegation pattern for extensibility

  - **Routing Strategies**:
    - **ROUND_ROBIN**: Cycle through healthy nodes (O(1), no state)
      - Simple rotation using modulo arithmetic
      - Confidence: 0.8

    - **LEAST_LOADED**: Route to node with fewest active requests
      - Tracks metrics.requestsInFlight per node
      - Minimizes queue depth
      - Confidence: 0.85

    - **LATENCY_BASED**: Route to node with lowest average response time
      - Uses health.avgResponseTime metric
      - Optimizes for response latency
      - Confidence: 0.85

    - **CACHE_AWARE** (Primary): Score nodes based on cache affinity and health
      - Cache match: +50 points (systemPromptHash match)
      - Tools match: +20 points (only if cache matches)
      - Health score: +25 \* successRate (0-25)
      - Availability: +15 points if requestsInFlight < 5
      - Recency: +10 points if cache updated within 60s
      - Maximum score: 120 points
      - Confidence: score / 120
      - Fallback to round-robin if no cache hits (0.5 confidence)

  - **Data Structures**:
    - **StickySession**: Session-to-node mapping with TTL
      - sessionId: Unique session identifier
      - nodeId: Pinned node ID
      - createdAt, expiresAt: Timestamps for TTL tracking

    - **CacheAffinityScore**: Detailed score breakdown for transparency
      - nodeId, cacheMatch, toolsMatch, healthScore, availability, recency, total
      - Enables debugging and observability

    - **RouterCallbacks**: Event notification interface
      - onNodeSelected(decision): Called on successful routing
      - onSessionCreated(sessionId, nodeId): Called when new session created
      - onSessionExpired(sessionId, nodeId): Called when session expires
      - onRoutingFailed(context, reason): Called when routing fails

  - **Sticky Session Example**:

    ```typescript
    const router = new ClusterRouter(config);

    // First request: creates session
    const decision1 = router.selectNodeWithSticky(nodes, context, "user-123");
    // Returns routing decision, session pinned to selected node

    // Second request: uses same node while session valid
    const decision2 = router.selectNodeWithSticky(nodes, context, "user-123");
    // Returns same node as decision1 (cache affinity!)

    // After 5 minutes: session expires
    const decision3 = router.selectNodeWithSticky(nodes, context, "user-123");
    // Routes normally again (session expired, new session created)
    ```

  - **Cache-Aware Routing Example**:

    ```typescript
    const config: RoutingConfig = {
      strategy: LoadBalanceStrategy.CACHE_AWARE,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    const router = new ClusterRouter(config);
    const context: RoutingContext = {
      systemPromptHash: "abc123...",
      estimatedTokens: 5000,
    };

    const decision = router.selectNode(nodes, context);
    // If Node-1 has matching cache: score = 50 + 20 + 20 + 15 + 10 = 115/120
    // Routes to Node-1 with confidence 0.96 (cache hit!)
    ```

  - **Features**:
    - Strategy delegation: Easy to add new strategies
    - Confidence scoring: Know how good a routing decision is
    - Debug information: Routing reason explains decision
    - Error resilience: Callback errors don't break routing
    - Session TTL: Automatic cleanup prevents memory leaks
    - Health awareness: Only routes to operational nodes
    - Cache optimization: Maximizes prompt cache hit rates for performance

  - **Integration Points**:
    - Works with cluster-config.ts for routing strategy configuration
    - Works with cluster-health.ts for node health status
    - Works with cluster-types.ts for type safety
    - Works with cluster-discovery.ts for available nodes

  - **Configuration** (RoutingConfig interface)
    - strategy: Load balancing strategy (required)
    - maxRetries: Maximum retry attempts (default: 3, warn if > 5)
    - retryDelayMs: Delay between retries in milliseconds (default: 100)

  - **Usage Patterns**:
    - Session-based routing (HTTP requests): selectNodeWithSticky()
    - Stateless routing (batch jobs): selectNode()
    - Callback-based observability: RouterCallbacks interface
    - Custom strategy: Can extend by implementing additional selectXxx() methods

  - **Status**: COMPLETE - Production-ready request router
  - **Documentation**: Complete JSDoc on all classes and methods with examples
  - **Integration Ready**: Works with all cluster management modules (config, discovery, health, types)
  - **Next Steps**: Integrate into proxy request handler for cluster-aware request routing

- **Issue #27: KV Cache Coordination for MLX Cluster** - Cache warmup, synchronization, and lifecycle management (696 lines, 100+ tests)

  **Purpose**: Coordinate KV cache state across MLX cluster nodes with automatic warmup, periodic synchronization, and cache-aware metrics for maximizing prompt cache hits.

  **Cache Coordination Module** - Multi-component cache management system (src/cluster/cluster-cache.ts - 696 lines)
  - **CacheError**: Typed error class for cache operations
    - Error codes: CACHE_EXPIRED, SYNC_FAILED, WARMUP_TIMEOUT, INVALID_NODE
    - Includes nodeId and hash context for debugging
    - Maintains proper error inheritance and stack traces

  - **CacheRegistry**: Hash-indexed cache state tracking per node
    - Primary index: nodeId → CacheEntry (O(1) lookups)
    - Hash index: systemPromptHash → Set<nodeId> (find nodes with specific cache)
    - Automatic hash index updates on set/delete operations
    - Expiration: Remove stale entries based on maxCacheAgeSec configuration
    - Methods: set(), get(), delete(), clear(), findNodesWithCache(), getAllCachedHashes()
    - Metrics: getNodeCount(), getCacheCount() for observability

  - **CacheWarmup**: Parallel cache warming with concurrency control
    - generateHash(): SHA256 hash generation for prompt identification
    - warmUpNodes(): Batch processing with configurable concurrency limits
    - warmUpSingleNode(): Individual node cache priming with timeout handling
    - Uses Promise.race() for timeout enforcement
    - Callbacks: onCacheWarmedUp (success), onCacheWarmupFailed (error)
    - Returns: CacheWarmupResult with status, hash, tokens, duration

  - **CacheSynchronizer**: Periodic cache state polling
    - Recursive setTimeout pattern for controlled periodic updates
    - syncCacheState(): Parallel polling of all nodes, expiration of stale entries
    - syncSingleNode(): Individual node sync via GET /v1/cluster/cache endpoint
    - Overlap prevention: syncInProgress flag prevents concurrent syncs
    - Error resilience: Continues sync even if individual nodes fail
    - Callbacks: onCacheSyncComplete (stats), onCacheSyncError (error)
    - Returns sync statistics: syncedNodes, failedNodes, totalNodes

  - **ClusterCache**: Main orchestrator combining all components
    - initialize(): Warmup all nodes, register successful caches, start periodic sync
    - Integration workflow: warmup → registry → sync loop
    - Methods: stop(), isRunning(), findNodesWithCache(), getNodeCacheState()
    - Metrics: getCacheStats() returns nodeCount, cacheCount, uniqueHashes

  - **Interfaces**:
    - **CacheEntry**: nodeId, nodeUrl, systemPromptHash, tokens, lastUpdated, hitRate
    - **CacheWarmupResult**: nodeId, success, hash, tokens, error, durationMs
    - **CacheWarmupOptions**: concurrency, timeoutMs, retryCount, systemPrompt
    - **CacheCallbacks**: Optional callbacks for warmup/sync lifecycle events

  - **Key Features**:
    - Hash-based cache lookup: O(1) node selection for cache hits
    - Concurrent warmup: Configurable batch size avoids overwhelming cluster
    - Automatic expiration: Stale cache entries removed during sync
    - Error resilience: Node failures don't break cluster operations
    - Observable callbacks: Monitor cache lifecycle for debugging
    - Metrics tracking: Hit rates, node counts, cache statistics

  - **Integration Points**:
    - Works with cluster-types.ts for type definitions (CacheConfig interface)
    - Works with cluster-config.ts for configuration (cache section)
    - Works with cluster-router.ts for cache-aware routing decisions
    - Works with cluster-health.ts for node state monitoring
    - Exported from cluster/index.ts for public API access

  - **Configuration** (from CacheConfig in cluster-types.ts)
    - maxCacheAgeSec: Time before cache entries expire (default: 300s)
    - maxCacheSizeTokens: Maximum tokens per cache (from config, informational)
    - minCacheHitRate: Minimum hit rate threshold (from config, for routing decisions)

  - **Usage Example**:

    ```typescript
    import { ClusterCache, CacheWarmupOptions } from "./cluster/cluster-cache";

    const cacheCoordinator = new ClusterCache(
      { maxCacheAgeSec: 300 },
      {
        onCacheWarmedUp: (result) => console.log("Node warmed:", result.nodeId),
        onCacheSyncComplete: (stats) =>
          console.log("Synced:", stats.syncedNodes, "nodes"),
      }
    );

    const warmupOptions: CacheWarmupOptions = {
      concurrency: 4,
      timeoutMs: 30000,
      retryCount: 2,
      systemPrompt: "You are Claude...",
    };

    await cacheCoordinator.initialize(
      [{ id: "node-1", url: "http://localhost:8000" }],
      warmupOptions,
      30000 // syncIntervalMs
    );

    // Later: find nodes with matching cache
    const nodes = cacheCoordinator.findNodesWithCache("abc123...");
    console.log(
      "Cache hits available on:",
      nodes.map((n) => n.nodeId)
    );

    // Shutdown
    cacheCoordinator.stop();
    ```

  - **Testing**: Comprehensive test coverage (tests/unit/cluster-cache.test.ts - 100+ tests)
    - CacheError: Construction, context fields, inheritance (8 tests)
    - CacheRegistry: CRUD operations, hash indexing, expiration (25+ tests)
    - CacheWarmup: Hash generation, concurrency control, timeout handling (20+ tests)
    - CacheSynchronizer: Periodic sync, overlap prevention, error handling (20+ tests)
    - ClusterCache integration: Initialization, warmup+sync workflow, stats (15+ tests)
    - Edge cases: Empty registry, stale entries, node failures during sync

  - **Public API** (exported from cluster/index.ts)
    - Classes: CacheError, CacheRegistry, CacheWarmup, CacheSynchronizer, ClusterCache
    - Interfaces: CacheEntry, CacheWarmupResult, CacheWarmupOptions, CacheCallbacks

  - **Status**: COMPLETE - Production-ready cache coordination
  - **Documentation**: Complete JSDoc on all classes and methods
  - **Integration Ready**: Works with all cluster management modules (config, discovery, health, router, types)

- **Issue #28: Main Cluster Orchestration** - Central coordination of cluster discovery, health, cache, and routing (743 lines, 120+ tests)

  **Purpose**: Provide unified orchestration layer for MLX cluster management, coordinating discovery, health monitoring, cache coordination, and intelligent routing into a cohesive system.

  **ClusterManager Module** - Main cluster orchestrator (src/cluster/cluster-manager.ts - 743 lines)
  - **ClusterManagerError**: Typed error class for cluster operations
    - Error codes: ALREADY_INITIALIZED, INITIALIZING, INVALID_CONFIG, INITIALIZATION_FAILED, NOT_INITIALIZED
    - Includes code property and optional cause for debugging
    - Proper error inheritance and stack trace preservation

  - **ClusterStatus Interface**: Snapshot of cluster state
    - initialized: Cluster manager initialization status
    - totalNodes: Total number of nodes in cluster
    - healthyNodes: Count of healthy nodes available for routing
    - nodes: Array with per-node details (id, url, healthy status, latency, error count)
    - cacheStats: Optional cache statistics (nodeCount, cacheCount, uniqueHashes)

  - **Singleton Pattern** - Three functions for lifecycle management
    - initializeCluster(config): Main entry point with full initialization sequence
      - Validates configuration using cluster-config validation
      - Creates ClusterManager instance
      - Runs async initialization (discovery, providers, health, cache, router)
      - Prevents concurrent initialization attempts
      - Comprehensive error handling with descriptive messages
    - getClusterManager(): Retrieve singleton instance
      - Throws ClusterManagerError if not initialized
    - resetClusterManager(): Graceful shutdown and cleanup
      - Idempotent - safe to call multiple times
      - Clears singleton reference

  - **ClusterManager Class**: Main orchestration logic
    - Initialization Sequence (async initialize):
      - Step 1: Create and start ClusterDiscovery
      - Step 2: Get discovered nodes from discovery
      - Step 3: Create AI SDK provider for each node (via createProviderForNode)
      - Step 4: Create and start ClusterHealth with discovered nodes
      - Step 5: Create and initialize ClusterCache (non-fatal if fails)
      - Step 6: Create ClusterRouter with routing configuration
      - Step 7: Set initialized flag to true
    - Provider Management (createProviderForNode):
      - Uses @ai-sdk/openai for OpenAI-compatible servers
      - Implements custom fetch for LMStudio compatibility
      - Maps max_tokens → max_completion_tokens
      - Enables llama.cpp's cache_prompt parameter for prompt caching
      - Removes unsupported parameters (reasoning, service_tier)
    - Node Selection (selectNode):
      - Accepts systemPromptHash, toolsHash, optional sessionId
      - Filters discovered nodes to only healthy ones
      - Builds RoutingContext with hashes and priority
      - Calls router.selectNodeWithSticky for cache-affinity routing
      - Returns selected MLXNode or null if no healthy nodes
    - Health Tracking:
      - recordNodeSuccess(nodeId, latencyMs): Update health with success metric
      - recordNodeFailure(nodeId, error): Record failure for circuit breaker
    - Status Reporting (getStatus):
      - Returns snapshot of cluster state
      - Builds per-node status with health and latency information
      - Includes cache statistics if cache enabled
      - Returns pre-initialization state if not ready
    - Shutdown (async shutdown):
      - Cleanup sequence (discovery → health → cache → router → providers)
      - Idempotent - safe to call multiple times
      - Ignores errors during shutdown
      - Clears initialized flag

  - **Integration with Cluster Components**:
    - ClusterDiscovery: Discovers nodes and provides getDiscoveredNodes()
    - ClusterHealth: Tracks node health and provides isHealthy(nodeId)
    - ClusterRouter: Selects nodes via selectNodeWithSticky()
    - ClusterCache: Coordinates cache state across nodes
    - Configuration: Uses MLXClusterConfig with discovery, health, cache, routing sections

  - **Provider Creation Strategy** (createProviderForNode)
    - Uses same pattern as src/main.ts:264-345 for LMStudio compatibility
    - Maps parameters for OpenAI-compatible servers
    - Custom fetch intercepts requests for parameter translation
    - Returns provider callable for use with @vercel/ai SDK

  - **Configuration** (from MLXClusterConfig)
    - discovery: Node discovery settings (mode, nodes, intervals)
    - health: Health check parameters (interval, timeout, failure threshold)
    - cache: Cache coordination settings (max age, hit rate threshold)
    - routing: Load balancing strategy and retry settings

  - **Key Features**:
    - Singleton pattern prevents multiple concurrent managers
    - Unified API for all cluster operations
    - Non-fatal cache failures (cluster works without cache)
    - Comprehensive initialization validation
    - Real-time cluster status reporting
    - Session affinity support via router integration
    - Graceful shutdown with proper cleanup sequencing

  - **Error Handling**:
    - ALREADY_INITIALIZED: Prevents multiple managers
    - INITIALIZING: Prevents concurrent initialization
    - INVALID_CONFIG: Configuration validation failure
    - INITIALIZATION_FAILED: Wrapped exceptions with context
    - NOT_INITIALIZED: getClusterManager() called before init

  - **Usage Example**:

    ```typescript
    import { initializeCluster, getClusterManager } from './cluster';

    // Initialize with configuration
    const config: MLXClusterConfig = {
      discovery: { mode: 'static', nodes: [{ id: 'n1', url: 'http://localhost:8000' }] },
      health: { checkIntervalMs: 10000, ... },
      cache: { maxCacheAgeSec: 300, ... },
      routing: { strategy: 'cache-aware', ... }
    };

    const manager = await initializeCluster(config);

    // Select node for request
    const node = manager.selectNode(systemPromptHash, toolsHash, sessionId);
    if (node) {
      const provider = manager.getNodeProvider(node.id);
      // Use provider for AI SDK calls
      const startTime = Date.now();
      const result = await generateText({ model: provider(...), ... });
      const latency = Date.now() - startTime;

      // Record success
      manager.recordNodeSuccess(node.id, latency);
    }

    // Check cluster status
    const status = manager.getStatus();
    console.log(`Cluster: ${status.healthyNodes}/${status.totalNodes} nodes healthy`);

    // Graceful shutdown
    await manager.shutdown();
    resetClusterManager();
    ```

  - **Testing**: Comprehensive test coverage (tests/unit/cluster-manager.test.ts - 1744 lines, 120+ tests)
    - ClusterManagerError: Error structure, inheritance, properties (12 tests)
    - Singleton pattern: initialization, retrieval, reset, concurrency (20+ tests)
    - Provider management: creation, retrieval, lifecycle, failure handling (15+ tests)
    - Node selection: availability, session affinity, cache routing, health filtering (25+ tests)
    - Health tracking: success/failure recording, state updates, routing impact (15+ tests)
    - Status reporting: structure accuracy, real-time updates, pre-init state (12+ tests)
    - Shutdown: component cleanup, idempotency, error handling, state reset (10+ tests)
    - Integration: full initialization, routing, session affinity, degradation (15+ tests)
    - Edge cases: Empty cluster, all unhealthy, timeout, provider failure, concurrent access

  - **Public API** (exported from cluster/index.ts)
    - Classes: ClusterManager, ClusterManagerError
    - Interfaces: ClusterStatus
    - Functions: initializeCluster, getClusterManager, resetClusterManager

  - **Status**: COMPLETE - Production-ready cluster orchestration
  - **Documentation**: Complete JSDoc on all classes, methods, and functions
  - **Integration Ready**: Coordinates all cluster subsystems (config, discovery, health, router, cache)

- **Issue #32: MLX Worker Node Server** - OpenAI-compatible worker node for distributed inference (1050 lines)

  **Purpose**: Implement Python worker nodes that provide OpenAI-compatible chat completions with health monitoring, KV cache coordination, and metrics tracking for MLX cluster workers.

  **MLX Worker Node** - Production Python FastAPI server for cluster nodes (src/mlx_worker/ - 1050 lines total)
  - **Overview**: Distributed worker nodes enable scaling MLX inference across multiple machines with intelligent load balancing, cache coordination, and health monitoring.

  - **Core Modules**:
    - **inference.py** (185 lines): MLX model loading, token generation, and token counting
    - **cache.py** (166 lines): KV cache management with state tracking and warming
    - **health.py** (264 lines): Health monitoring with metrics and circuit breaker integration
    - **server.py** (366 lines): FastAPI HTTP server with OpenAI-compatible endpoints
    - \***\*init**.py\*\* (69 lines): Package exports and version info
    - **requirements.txt**: Dependencies (fastapi, uvicorn, mlx, mlx-lm, pydantic, pytest)

  - **Inference Engine** (src/mlx_worker/inference.py)
    - **load_model(model_path, config)**: Load MLX model and tokenizer with caching
      - Automatic caching to avoid redundant model loading
      - Optional configuration dict for mlx_lm parameters
      - Returns tuple of (model, tokenizer)
      - Raises: ModelNotFoundError, InferenceError

    - **generate_stream(messages, model_path, max_tokens, temperature, top_p, cache_prompt)**: Streaming token generation
      - Formats messages into prompt string
      - Uses mlx_lm's native cache_prompt for KV cache
      - Yields tokens as strings for SSE streaming
      - Raises: ValueError (empty messages), InferenceError

    - **count_tokens(text, model_path)**: Token counting via model tokenizer
      - Uses model's tokenizer for accurate token counts
      - Caches model to avoid redundant loading
      - Returns integer token count
      - Raises: InferenceError

    - **\_format_messages(messages, tokenizer)**: Internal message formatting
      - Converts role-based messages to prompt text
      - Handles: system, user, assistant roles
      - Ends with "Assistant:" to prompt for response

  - **Cache Manager** (src/mlx_worker/cache.py - Singleton)
    - **CacheState dataclass**: Tracks cache state matching TypeScript NodeCacheState interface
      - tokens: int - Number of cached tokens
      - systemPromptHash: str - SHA-256 hash of cached system prompt
      - lastUpdated: float - Unix timestamp in milliseconds (float for precision)

    - **CacheManager.get_state()**: Get current cache state
      - Returns: Dict with tokens, systemPromptHash, lastUpdated
      - Thread-safe via RWLock pattern

    - **CacheManager.warm(system_prompt, model_path)**: Warm cache with system prompt
      - Computes SHA-256 hash of system prompt
      - Counts tokens using tokenizer
      - Pre-processes with model (enables KV caching)
      - Updates state and returns updated cache state
      - Raises: CacheError

    - **CacheManager.clear()**: Clear cache state
      - Resets tokens, hash, and timestamp
      - Thread-safe

    - **Module-level functions**: get_cache_state(), warm_cache(), clear_cache(), compute_prompt_hash()
      - Public interface to global cache manager singleton
      - compute_prompt_hash(): Returns 64-character hex SHA-256 hash

  - **Health Monitor** (src/mlx_worker/health.py - Singleton)
    - **NodeHealth dataclass**: Health check results matching TypeScript interface
      - lastCheck: float - Unix timestamp in milliseconds
      - consecutiveFailures: int - Number of consecutive failures
      - avgResponseTime: float - Average response latency in milliseconds
      - errorRate: float - Ratio of failed requests (0.0-1.0)

    - **NodeMetrics dataclass**: Performance metrics matching TypeScript interface
      - requestsInFlight: int - Active concurrent requests
      - totalRequests: int - Total requests since startup
      - cacheHitRate: float - Cache hit ratio (0.0-1.0)
      - avgLatency: float - Average response latency in milliseconds

    - **HealthMonitor class** (Singleton):
      - get_health(): Returns NodeHealth dict with current health metrics
      - get_metrics(): Returns NodeMetrics dict with current performance metrics
      - record_success(latency): Record successful request with latency
      - record_failure(latency): Record failed request with latency
      - increment_in_flight(): Increment active request counter
      - decrement_in_flight(): Decrement active request counter
      - record_cache_hit(): Increment cache hit counter
      - record_cache_miss(): Increment cache miss counter
      - All methods: Thread-safe via RWLock

    - **Module-level functions**:
      - get_node_health(): Get current node health
      - get_metrics(): Get current node metrics
      - record_request(success, latency): Record request outcome
      - increment_requests_in_flight(), decrement_requests_in_flight()
      - record_cache_hit(), record_cache_miss()
      - All raise: HealthError on failure, ValueError if latency negative

  - **FastAPI Server** (src/mlx_worker/server.py)
    - **Endpoints**: OpenAI-compatible chat completions and cluster management
      1. **POST /v1/chat/completions** (ChatCompletionRequest)
         - Model: str (default: "current-model")
         - Messages: List[ChatMessage] (role, content)
         - max_tokens: int (default: 2048)
         - temperature: float (default: 0.7)
         - top_p: float (default: 0.9)
         - stream: bool (default: false)
         - Headers: X-Session-Id (generated or provided)
         - Response: OpenAI ChatCompletion object or SSE stream
         - Features:
           - Cache hit detection via system prompt hash matching
           - Non-streaming JSON response (ChatCompletion object)
           - Streaming SSE response (chat.completion.chunk events)
           - Session ID tracking (X-Session-Id header)
           - Latency tracking and metrics recording
           - Error handling: 400 (validation), 500 (inference errors)
           - In-flight request tracking
           - Cache hit/miss recording

      2. **GET /v1/models** (OpenAI-compatible)
         - Returns: List of available models
         - Data: Single model "current-model"
         - Format: {"object": "list", "data": [...]}

      3. **GET /health** (Cluster health check)
         - Returns: Combined health, cache, and metrics
         - Status: "healthy" | "degraded" | "unhealthy" based on metrics
         - Health thresholds:
           - "unhealthy": >= 5 consecutive failures OR errorRate > 0.5
           - "degraded": >= 2 consecutive failures
           - "healthy": otherwise
         - Response: {"status": str, "health": Dict, "cache": Dict, "metrics": Dict}

      4. **GET /cache** (Get cache state)
         - Returns: Current cache state (tokens, hash, lastUpdated)

      5. **POST /cache/warm** (Warm cache with system prompt)
         - Request: {"system_prompt": str}
         - Returns: {"success": bool, "hash": str, ...cache_state}
         - Raises: 500 CacheError on failure

    - **Pydantic Models** (Request/response validation):
      - ChatMessage: role (system|user|assistant), content
      - ChatCompletionRequest: model, messages, max_tokens, temperature, top_p, stream
      - CacheWarmRequest: system_prompt

    - **Streaming Response** (\_stream_response async generator):
      - Yields SSE-formatted events (data: {...}\n\n)
      - Chunk format: id, object, created, model, choices[{delta, finish_reason}]
      - Final chunk: finish_reason="stop"
      - End marker: "data: [DONE]\n\n"
      - Error events: Includes error.message and error.type

    - **Lifespan Management** (@asynccontextmanager lifespan):
      - Startup: Print startup message
      - Shutdown: Print shutdown message

  - **Configuration** (requirements.txt):
    - fastapi>=0.104.0: Async web framework
    - uvicorn[standard]>=0.24.0: ASGI server with reload support
    - mlx>=0.30.1: Apple ML framework
    - mlx-lm>=0.30.0: MLX language model utilities
    - pydantic>=2.0.0: Data validation
    - pytest>=7.4.0, pytest-asyncio>=0.21.0, httpx>=0.25.0: Testing

  - **Usage**:

    ```python
    import uvicorn
    from mlx_worker.server import app

    # Run server on port 8081
    uvicorn.run(app, host="0.0.0.0", port=8081, log_level="info")
    ```

    ```bash
    # Start single worker node
    python -m src.mlx_worker.server

    # Start with environment configuration
    MLX_PORT=8082 python -m src.mlx_worker.server
    ```

  - **Integration with Cluster**:
    - Workers register themselves via discovery system (src/cluster/cluster-discovery.ts)
    - Health checks via GET /health endpoint
    - Cache coordination via cluster cache manager (Issue #27)
    - Metrics feed into cluster router (Issue #26) for load balancing decisions
    - Session IDs enable sticky session routing (cache affinity)

  - **Thread Safety**:
    - CacheManager: Singleton with threading.Lock for state access
    - HealthMonitor: Singleton with threading.Lock for metrics access
    - All public functions are thread-safe for concurrent requests

  - **Test Coverage**:
    - Unit tests: tests/unit/test*mlx_worker*\*.py (3 files)
    - Integration tests: tests/integration/test_mlx_worker_server.py
    - Test dependencies: tests/requirements-mlx-worker-tests.txt

  - **Status**: COMPLETE - Production-ready MLX worker nodes
  - **Documentation**: Complete docstrings on all classes, methods, and functions
  - **Integration Ready**: Works with cluster system for distributed inference

- **Issue #21: Safe System Filter Integration** - Intelligent prompt optimization that preserves tool calling

  **Purpose**: Integrate safe-system-filter.ts into the proxy's optimization chain for intelligent prompt reduction without breaking tool calling functionality.

  **Safe System Filter** - Tier-based section removal with validation (src/safe-system-filter.ts)
  - **Optimization Tiers**: MINIMAL, MODERATE, AGGRESSIVE, EXTREME (configurable)
  - **Validation**: Ensures critical sections (tool usage, function calling) are preserved
  - **Fallback**: Falls back to truncation if validation fails
  - **Auto-tier selection**: Based on prompt size (< 5k → MINIMAL, < 10k → MODERATE, < 20k → AGGRESSIVE, >= 20k → EXTREME)

  **Proxy Integration** (src/anthropic-proxy.ts:54-131)
  - **shouldUseSafeFilter()**: Decision logic (lines 56-80)
    - Smart prompt takes priority over safe filter
    - Enabled by default for LMStudio, can be enabled for other backends
    - Explicitly configurable via `safeSystemFilter` option
  - **mapTierConfig()**: Config tier to enum mapping (lines 82-99)
  - **getOptimizationStrategy()**: Strategy selection (lines 101-114)
  - **applySafeSystemFilter()**: Filter application with debug logging (lines 116-151)
  - **Optimization Chain Priority**:
    1. Smart prompt (highest, experimental)
    2. Safe filter (intelligent with validation)
    3. Truncation (fallback)
    4. Passthrough (default)

  **Configuration Options**
  - `safeSystemFilter`: Enable/disable safe filtering (default: true for LMStudio, false for others)
  - `filterTier`: Optimization tier (auto | minimal | moderate | aggressive | extreme)
  - Environment variables: `ANYCLAUDE_SAFE_FILTER`, `ANYCLAUDE_FILTER_TIER`

  **Debug Logging**
  - Level 1: Basic stats (tokens before/after, reduction percentage)
  - Level 2: Validation details (present/missing patterns, fallback occurred)
  - Level 3: Full trace (preserved/removed sections, prompt snippets)

  **Testing**: tests/integration/anthropic-proxy-safe-filter-integration.test.js
  - Tests shouldUseSafeFilter() decision logic
  - Tests optimization chain priority
  - Tests fallback behavior when validation fails
  - Tests mode-specific defaults and configuration overrides
  - Tests debug logging at all levels
  - Verifies no regression in streaming or tool calling

  **Documentation Updates**
  - CLAUDE.md: Added safe filter explanation, configuration options, troubleshooting
  - .anyclauderc.example.json: Added safeSystemFilter and filterTier examples
  - Inline comments in proxy and filter code

- **Issue #19: Prompt Section Parser** - Intelligent prompt parsing for tier-based optimization

  **Purpose**: Parse Claude Code system prompts into sections for intelligent truncation and optimization based on importance tiers.

  **Prompt Section Parser** - Markdown header parsing with tier classification (354 lines)
  - **Purpose**: Parse system prompts into sections with importance tiers for safe truncation during optimization
  - **Components**:
    - parseIntoSections(): Parse prompt into sections with metadata (headers, line numbers, critical detection)
    - classifySection(): Tier-based importance classification (0-3)
    - getSectionsByTier(): Filter sections by maximum tier
    - reconstructPrompt(): Rebuild optimized prompt from filtered sections
    - generateId(): Convert headers to kebab-case IDs
  - **Architecture**: `src/prompt-section-parser.ts` (354 lines)
    - Interface: `PromptSection` with id, header, content, tier, line numbers, critical flag
    - Constants: `TIER_PATTERNS` object with regex patterns for each tier
    - Exports: `parseIntoSections()`, `classifySection()`, `getSectionsByTier()`, `reconstructPrompt()`
  - **Tier Classification**:
    - Tier 0: Tool usage policy, function calling, tool schemas (critical for functionality)
    - Tier 1: Core identity, tone, doing tasks (important for behavior)
    - Tier 2: Planning, git workflow, asking questions (helpful but optional)
    - Tier 3: Examples, verbose content (can be removed)
  - **Features**:
    - Handles preamble (content before first header) as special "preamble" section
    - Detects code blocks (skips headers inside ```) for accurate parsing
    - Tracks line numbers for each section (startLine, endLine)
    - Integrates with critical-sections.ts for critical pattern detection
    - Preserves markdown formatting during reconstruction
  - **Integration Points**:
    - Used by adaptive-optimizer.ts to safely filter sections before truncation
    - Validates critical sections won't be removed (uses detectCriticalSections())
    - Enables tier-based prompt optimization (keep tiers 0-1, remove tiers 2-3)
  - **Usage Example**:

    ```typescript
    import {
      parseIntoSections,
      getSectionsByTier,
      reconstructPrompt,
    } from "./prompt-section-parser";

    const sections = parseIntoSections(prompt);
    const important = getSectionsByTier(sections, 1); // Tiers 0-1 only
    const optimized = reconstructPrompt(important);
    ```

  - **Test Coverage**: 54/54 Unit Tests PASSING (100%)
    - File: `tests/unit/test-prompt-section-parser.js` (1050 lines)
    - Test suites:
      - Section parsing: Headers, preamble, empty prompts, line tracking (15 tests)
      - Tier classification: Pattern matching accuracy, default tier (12 tests)
      - Critical section detection: Integration with critical-sections.ts (8 tests)
      - Filtering by tier: maxTier boundary, empty results (6 tests)
      - Prompt reconstruction: Markdown preservation, section ordering (7 tests)
      - ID generation: Kebab-case conversion, special characters (6 tests)
    - Edge cases: Empty content, nested headers, code blocks with headers, unicode (6 tests)
  - **Status**: COMPLETE - All 54 tests PASS, ready for production use
  - **Documentation**: Complete with JSDoc comments on all exported functions and interfaces
  - **No External Dependencies**: Pure TypeScript, uses built-in string/regex operations

- **Issue #20: Safe System Prompt Filter** - Tiered filtering with automatic validation and fallback (461 lines)

  **Purpose**: Safely filter Claude Code system prompts with automatic validation to prevent breaking tool-calling functionality.

  **Safe System Prompt Filter** - Tiered filtering with validation gate and fallback chain (461 lines)
  - **Purpose**: Filter system prompts by tier (MINIMAL, MODERATE, AGGRESSIVE, EXTREME) with automatic validation and fallback to ensure tool-calling functionality is never broken
  - **Components**:
    - filterSystemPrompt(): Main filtering function with tier-based filtering and validation gate
    - estimateTokens(): Token estimation using 1 token ≈ 4 characters heuristic
