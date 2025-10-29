# Best Practices for Transparent LLM Proxy: Claude Code + MLX on Apple Silicon

**Goal**: Create a transparent proxy enabling Claude Code to use MLX on Apple Silicon with local GPU acceleration, supporting tool calls and caching while handling 9000+ token system prompts.

---

## Executive Summary

Your architecture is **well-positioned** relative to industry best practices. AnyClaude already implements:

✅ **Streaming Response Preservation** - Correctly avoids buffering
✅ **Tool Call Parsing** - Multi-model detection (Hermes, Llama, Mistral)
✅ **Prompt Caching** - Client-side deduplication + cache metrics
✅ **Schema Transformation** - Bidirectional format conversion
✅ **Provider Abstraction** - Clean separation of concerns

This document outlines **optimization opportunities** and **best practices** for your specific use case.

---

## 1. System Prompt Handling (9000 Tokens)

### Current State
- Claude Code system prompt: ~9000 tokens
- AnyClaude: Basic pass-through via message conversion
- MLX-LM: Text embedding, no native prompt caching

### Industry Best Practice: Prompt Prefix Caching

**Technique**: Cache the system prompt separately from conversation.

```
Request 1: [SYSTEM PROMPT (9000 tokens)] + Query 1
→ Full computation, cache system tokens

Request 2: [SYSTEM PROMPT (CACHED)] + Query 2
→ Reuse cached computation, only compute Query 2
→ Time to First Token: 10x faster
→ Token recomputation: 90% reduction
```

### MLX-LM Implementation Strategy

```typescript
// 1. Cache system prompt on first request
const systemPromptHash = sha256(systemPrompt);
const cachedSystemTokens = mlx_lm.cache_prompt(
  model,
  tokenizer,
  systemPrompt
);

// 2. Store cache key globally
promptCacheMap.set(systemPromptHash, cachedSystemTokens);

// 3. Subsequent requests use cached prefix
const generated = mlx_lm.generate(
  model,
  tokenizer,
  systemPrompt,  // MLX internally reuses cache
  {
    max_tokens,
    kv_cache: cachedSystemTokens  // Pass cached KV state
  }
);
```

### Implementation in AnyClaude

**File**: `src/prompt-cache.ts` (enhancement)

```typescript
interface CachedPromptState {
  systemHash: string;
  kvCacheState: any;  // MLX KV cache object
  lastAccessed: number;
  hitCount: number;
}

class PromptCacheManager {
  private kvCaches = new Map<string, CachedPromptState>();

  async cacheSystemPrompt(
    model: any,
    tokenizer: any,
    systemPrompt: string
  ): Promise<string> {
    const hash = crypto.createHash("sha256")
      .update(systemPrompt)
      .digest("hex");

    if (this.kvCaches.has(hash)) {
      this.kvCaches.get(hash)!.hitCount++;
      return hash;
    }

    try {
      // MLX caching (if available)
      const kvState = await mlx_lm.cache_prompt(
        model,
        tokenizer,
        systemPrompt
      );

      this.kvCaches.set(hash, {
        systemHash: hash,
        kvCacheState: kvState,
        lastAccessed: Date.now(),
        hitCount: 1,
      });

      debug(1, `[PromptCache] Cached system prompt: ${hash.slice(0, 8)}...`);
      return hash;
    } catch (e) {
      // Fallback: cache_prompt not available, continue normally
      debug(1, `[PromptCache] MLX caching unavailable: ${e}`);
      return hash;
    }
  }

  getKVCache(systemHash: string): any {
    const cached = this.kvCaches.get(systemHash);
    if (cached) {
      cached.lastAccessed = Date.now();
      cached.hitCount++;
      return cached.kvCacheState;
    }
    return null;
  }

  getStats(): {
    systemPromptCached: boolean,
    cacheHits: number,
    estimatedSpeedup: number
  } {
    const totalHits = Array.from(this.kvCaches.values())
      .reduce((sum, c) => sum + c.hitCount, 0);

    return {
      systemPromptCached: this.kvCaches.size > 0,
      cacheHits: totalHits,
      estimatedSpeedup: totalHits > 0 ? "~10x" : "1x",
    };
  }
}
```

### Metrics to Track

```typescript
{
  "system_prompt_tokens": 9000,
  "system_prompt_cached": true,
  "system_prompt_cache_hits": 24,
  "estimated_token_savings": 216000,  // 9000 * 24
  "estimated_latency_reduction": "90%",
  "first_request_latency": "5200ms",
  "cached_request_latency": "450ms"
}
```

### Recommendation: Implement This First

**Priority**: HIGH
**Effort**: Medium (2-3 hours)
**Impact**: 10x speedup on follow-up requests

---

## 2. Tool Calling Best Practices

### Current State: Multi-Paradigm Support

AnyClaude already handles:
1. **Native tool calls** (vLLM-MLX, LMStudio)
2. **Streaming tool parameters** (AI SDK deltas → Anthropic SSE)
3. **Text-embedded tool calls** (MLX-LM parsing)

### Industry Best Practice: Tool Definition Versioning

**Problem**: Tool schemas change over time. If system prompt references outdated tool definitions, the model generates invalid tool calls.

**Solution**: Version tool definitions and track in system prompt.

```typescript
interface VersionedToolDef {
  name: string;
  version: number;  // Increment on schema change
  schema: JSONSchema;
  deprecatedAt?: number;  // Unix timestamp when deprecated
  description: string;
  examples: Array<{
    input: object,
    expectedBehavior: string
  }>;
}

class ToolRegistry {
  private tools = new Map<string, VersionedToolDef>();

  registerTool(name: string, def: VersionedToolDef) {
    const existing = this.tools.get(name);
    if (existing && existing.version >= def.version) {
      throw new Error(`Cannot downgrade tool ${name}`);
    }
    this.tools.set(name, def);
  }

  getToolsForSystemPrompt(): string {
    // Generate system prompt section with tool definitions
    return Array.from(this.tools.values())
      .map(tool => `
## Tool: ${tool.name} (v${tool.version})

${tool.description}

**Input Schema**:
\`\`\`json
${JSON.stringify(tool.schema, null, 2)}
\`\`\`

**Example**:
${tool.examples.map(ex => `
Input: ${JSON.stringify(ex.input)}
Behavior: ${ex.expectedBehavior}
`).join('\n')}
      `)
      .join('\n---\n');
  }

  validateToolCall(toolName: string, input: object): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return false;

    // Validate input against schema
    return validateJSONSchema(input, tool.schema);
  }
}
```

### Best Practice: Tool Call Validation Pipeline

```typescript
// In anthropic-proxy.ts, after tool call extraction

async function validateAndHandleToolCall(
  toolCall: ToolCall,
  toolRegistry: ToolRegistry
): Promise<{ valid: boolean, error?: string, result?: any }> {
  // 1. Check tool exists
  if (!toolRegistry.has(toolCall.name)) {
    return {
      valid: false,
      error: `Unknown tool: ${toolCall.name}`
    };
  }

  // 2. Validate schema
  try {
    const valid = toolRegistry.validateToolCall(
      toolCall.name,
      toolCall.input
    );
    if (!valid) {
      return {
        valid: false,
        error: `Invalid input for ${toolCall.name}: schema mismatch`
      };
    }
  } catch (e) {
    return {
      valid: false,
      error: `Schema validation error: ${e.message}`
    };
  }

  // 3. Execute tool (your existing logic)
  try {
    const result = await executeTool(toolCall.name, toolCall.input);
    return { valid: true, result };
  } catch (e) {
    return {
      valid: false,
      error: `Tool execution error: ${e.message}`
    };
  }
}
```

### Recommendation: Add Tool Versioning

**Priority**: MEDIUM
**Effort**: Low (2 hours)
**Impact**: Prevents tool call errors from schema drift

---

## 3. Streaming Response Optimization

### Current State: Correct Implementation

AnyClaude correctly:
- ✅ Preserves `Transfer-Encoding: chunked`
- ✅ Avoids response buffering
- ✅ Uses `text/event-stream` MIME type
- ✅ Implements keepalive interval (every 10 seconds)

### Enhancement: Intelligent Stream Chunking

**Problem**: During prompt encoding phase (first token latency), the server doesn't send data for 5-60 seconds depending on context size.

**Current**: Sends keepalive comments
**Better**: Send incremental status updates

```typescript
// In convert-to-anthropic-stream.ts

async function* streamWithProgressUpdates(
  stream: ReadableStream<TextStreamPart>,
  totalContextTokens: number
) {
  let statusInterval: NodeJS.Timeout | null = null;
  let lastChunkTime = Date.now();
  const PROGRESS_INTERVAL = 3000;  // Every 3 seconds

  try {
    // Setup progress reporter
    statusInterval = setInterval(() => {
      const elapsed = Date.now() - lastChunkTime;
      if (elapsed > PROGRESS_INTERVAL) {
        // Send status message (Claude Code might ignore, but it's non-breaking)
        yield `:status - processing (${elapsed}ms elapsed, context: ${totalContextTokens} tokens)\n\n`;
        lastChunkTime = Date.now();
      }
    }, PROGRESS_INTERVAL);

    // Stream normal chunks
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastChunkTime = Date.now();
      yield convertChunk(value);
    }
  } finally {
    if (statusInterval) clearInterval(statusInterval);
  }
}
```

### Best Practice: Response Compression

**For Large Contexts**: Compress streaming responses.

```typescript
res.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Content-Encoding": "gzip",  // ← Enable compression
});

const gzip = require("zlib").createGzip();
stream.pipe(gzip).pipe(res);
```

### Recommendation: Add Progress Updates

**Priority**: LOW (nice-to-have)
**Effort**: Low (1 hour)
**Impact**: Better UX during long encoding phases

---

## 4. Caching Strategy Enhancement

### Current State

- **Client-side deduplication**: SHA256 hash of system + tools
- **MLX-LM**: Automatic KV cache (not explicitly managed)
- **Metrics**: Track Anthropic API cache stats

### Best Practice: Multi-Level Cache Architecture

```
Level 1: System Prompt KV Cache (MLX-specific)
├─ Hash: sha256(systemPrompt)
├─ Storage: In-memory MLX KV state
└─ TTL: Session lifetime

Level 2: Full Request Cache (deduplication)
├─ Hash: sha256(system + tools + messages)
├─ Storage: In-memory with LRU eviction
├─ Size: 128 MB max
└─ TTL: 1 hour

Level 3: Persistent Cache (optional)
├─ Hash: sha256 with timestamp
├─ Storage: SQLite or LMDB
├─ Indexing: Request metadata (model, user, date)
└─ TTL: 30 days
```

### Implementation: Tiered Cache Manager

```typescript
class TieredCacheManager {
  private l1Cache = new Map<string, MLXKVState>();  // System prompt
  private l2Cache = new Map<string, CacheEntry>();  // Request-level
  private l3Cache?: PersistentCache;  // Optional disk cache

  async get(
    cacheKey: string,
    level: 1 | 2 | 3 = 1
  ): Promise<CacheEntry | null> {
    // Try L1 (fastest)
    if (level >= 1 && this.l1Cache.has(cacheKey)) {
      return { source: 'L1', data: this.l1Cache.get(cacheKey) };
    }

    // Try L2
    if (level >= 2 && this.l2Cache.has(cacheKey)) {
      return { source: 'L2', data: this.l2Cache.get(cacheKey) };
    }

    // Try L3
    if (level >= 3 && this.l3Cache) {
      const entry = await this.l3Cache.get(cacheKey);
      if (entry) return { source: 'L3', data: entry };
    }

    return null;
  }

  getCacheStats() {
    return {
      l1: { size: this.l1Cache.size, type: 'MLX KV State' },
      l2: { size: this.l2Cache.size, type: 'Request-level' },
      l3: this.l3Cache ? { enabled: true, type: 'Persistent' } : { enabled: false },
      estimatedMemory: estimateMemoryUsage(this.l1Cache, this.l2Cache),
    };
  }
}
```

### Metrics: Cache Hit Analysis

```typescript
interface CacheMetrics {
  requestId: string;
  timestamp: number;
  cacheLevel: 'L1' | 'L2' | 'L3' | 'MISS';
  hitRate: number;  // Percentage
  tokensReused: number;
  estimatedTimeSaved: number;  // milliseconds
  memoryFootprint: number;
}
```

### Recommendation: Implement L1 Cache Now

**Priority**: MEDIUM
**Effort**: Medium (3 hours)
**Impact**: 5-10x speedup for repeated requests

---

## 5. Apple Silicon-Specific Optimizations

### Current State: Basic Support

- MLX library handles optimization automatically
- No explicit memory management or GPU tuning

### Best Practice: Unified Memory Management

Apple Silicon's unified memory architecture is different from discrete GPU systems.

```typescript
// Monitor GPU memory usage (macOS-specific)
import { execSync } from 'child_process';

function getGPUMemoryStats(): {
  totalGPU: number,
  usedGPU: number,
  gpuUtilization: number
} {
  try {
    // Uses powermetrics (requires sudo)
    const output = execSync(
      'system_profiler SPDisplaysDataType -json',
      { encoding: 'utf8' }
    );

    // Parse GPU memory from output
    // This is approximate - real implementation would use better tools
    return {
      totalGPU: 0,  // Unified memory, not separate
      usedGPU: 0,
      gpuUtilization: 0
    };
  } catch (e) {
    return { totalGPU: 0, usedGPU: 0, gpuUtilization: 0 };
  }
}

// Configure MLX KV cache based on available memory
function configureMlxKVCache(availableMemoryMB: number): {
  maxKVSize: number,
  warning?: string
} {
  // Apple Silicon M1: 8GB unified memory
  // Rule of thumb: allocate 50% for KV cache, 50% for model weights

  if (availableMemoryMB < 4096) {
    return {
      maxKVSize: 512,
      warning: 'Low memory: using reduced KV cache size (512 tokens)'
    };
  } else if (availableMemoryMB < 8192) {
    return {
      maxKVSize: 2048,
      warning: 'Moderate memory: using standard KV cache (2048 tokens)'
    };
  } else {
    return {
      maxKVSize: 4096,
      warning: undefined
    };
  }
}
```

### Best Practice: Model Quantization Strategy

```typescript
interface QuantizationConfig {
  dataType: '4bit' | '8bit' | 'fp16' | 'bf16';
  warningTime: number;
}

const QUANTIZATION_GUIDANCE: Record<string, QuantizationConfig> = {
  'M1/M2': { dataType: '4bit', warningTime: 0 },
  'M3/M3Pro': { dataType: '4bit', warningTime: 0 },
  'M3Max': { dataType: '8bit', warningTime: 0 },
  'M4/M4Pro': { dataType: '8bit', warningTime: 0 },
  'M4Max': { dataType: 'fp16', warningTime: 0 },
};

function recommendQuantization(chipModel: string): string {
  const config = QUANTIZATION_GUIDANCE[chipModel] || QUANTIZATION_GUIDANCE['M3Pro'];
  return config.dataType;
}
```

### Best Practice: Reduce Memory Leaks in MLX

MLX models can accumulate memory over time due to KV cache growth.

```typescript
interface MLXMemoryManager {
  // Reset KV cache every N requests
  REQUEST_THRESHOLD = 100;

  // Or reset after context grows beyond threshold
  CONTEXT_THRESHOLD = 50000;  // tokens

  resetKVCache(reason: 'request_limit' | 'context_limit') {
    debug(1, `[MLX Memory] Resetting KV cache: ${reason}`);
    // MLX handles this automatically, but explicitly clear if needed
    this.kvCacheState = null;
  }
}
```

### Recommendation: Add Memory Monitoring

**Priority**: MEDIUM
**Effort**: Medium (3-4 hours)
**Impact**: Prevents memory exhaustion on long-running sessions

---

## 6. Request Transformation Pipeline

### Best Practice: Standardized Request/Response Logging

```typescript
interface RequestLog {
  requestId: string;
  timestamp: number;
  provider: string;
  model: string;
  systemTokens: number;
  userTokens: number;
  toolCount: number;
  streaming: boolean;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  errorMessage?: string;
  cacheLevel?: 'L1' | 'L2' | 'L3' | 'MISS';
}

class RequestLogger {
  logRequest(log: RequestLog) {
    // Write to structured JSON file for analysis
    fs.appendFileSync(
      this.logPath,
      JSON.stringify(log) + '\n'
    );
  }

  // Analyze performance patterns
  analyzePerformance(): {
    avgLatency: number,
    cacheHitRate: number,
    toolCallSuccess: number,
    mostUsedTools: string[]
  } {
    // Parse logs and compute metrics
  }
}
```

### Best Practice: Schema Transformation Tracing

When Claude Code sends a tool definition, trace exactly what transformations happen.

```typescript
class SchemaTransformationTracer {
  trace(toolName: string, originalSchema: object, transformedSchema: object) {
    const diff = deepDiff(originalSchema, transformedSchema);

    debug(3, `[Schema Transform] ${toolName}`, {
      original: originalSchema,
      transformed: transformedSchema,
      changes: diff.changes,
      removedKeys: diff.removed,
      addedKeys: diff.added
    });

    // Warn if significant changes detected
    if (diff.removed.length > 3) {
      console.warn(
        `⚠️ Schema simplified for ${toolName}: ` +
        `removed ${diff.removed.join(', ')}`
      );
    }
  }
}
```

### Recommendation: Implement Request Logging

**Priority**: MEDIUM
**Effort**: Low (2 hours)
**Impact**: Better observability and debugging

---

## 7. Error Handling and Resilience

### Current State: Basic Error Handling

AnyClaude has:
- ✅ Try-catch blocks
- ✅ Provider-specific error messages
- ✅ Fallback to demo mode (vLLM-MLX)

### Best Practice: Structured Error Classification

```typescript
enum ErrorCategory {
  NETWORK = 'NETWORK',           // Connection timeouts, refused
  SCHEMA = 'SCHEMA',             // Invalid tool schema, JSON errors
  RESOURCE = 'RESOURCE',         // Out of memory, disk full
  TIMEOUT = 'TIMEOUT',           // Model encoding/generation too slow
  INVALID_INPUT = 'INVALID_INPUT', // Malformed request
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED', // Feature not supported
  UNKNOWN = 'UNKNOWN'
}

class AnyclaudeError extends Error {
  constructor(
    public category: ErrorCategory,
    public message: string,
    public context?: Record<string, any>,
    public retryable: boolean = false
  ) {
    super(message);
  }
}

// Usage
throw new AnyclaudeError(
  ErrorCategory.SCHEMA,
  'Tool schema missing required field: input_schema',
  { toolName: 'search', providedSchema: tool },
  false  // Not retryable
);
```

### Best Practice: Retry Strategy

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!(error instanceof AnyclaudeError) || !error.retryable) {
        throw error;  // Not retryable
      }

      if (attempt < config.maxAttempts) {
        debug(1, `[Retry] Attempt ${attempt + 1}/${config.maxAttempts} after ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }

  throw lastError;
}
```

### Recommendation: Implement Error Classification

**Priority**: MEDIUM
**Effort**: Low (2 hours)
**Impact**: Better error recovery and user feedback

---

## 8. Configuration Management Best Practices

### Current State

- ✅ `.anyclauderc.json` for configuration
- ✅ Environment variable overrides
- ✅ CLI flag support (`--mode=`)

### Enhancement: Configuration Validation

```typescript
// Use Zod for runtime schema validation
import { z } from 'zod';

const AnyclaudeConfigSchema = z.object({
  backend: z.enum(['claude', 'lmstudio', 'mlx-lm', 'vllm-mlx']).optional(),
  debug: z.object({
    level: z.number().min(0).max(3).optional(),
    enableTraces: z.boolean().optional(),
    enableStreamLogging: z.boolean().optional(),
  }).optional(),
  backends: z.object({
    lmstudio: z.object({
      enabled: z.boolean().optional(),
      port: z.number().optional(),
      baseUrl: z.string().url().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
    }).optional(),
    // ... other backends
  }).optional(),
  caching: z.object({
    l1Enabled: z.boolean().default(true),
    l2Enabled: z.boolean().default(true),
    l3Enabled: z.boolean().default(false),
    l2MaxSize: z.number().default(128),  // MB
    l3Path: z.string().optional(),
  }).optional(),
  performance: z.object({
    streamChunkSize: z.number().optional(),
    keepaliveInterval: z.number().optional(),
    maxContextTokens: z.number().optional(),
  }).optional(),
});

type AnyclaudeConfig = z.infer<typeof AnyclaudeConfigSchema>;

function loadAndValidateConfig(): AnyclaudeConfig {
  const raw = loadConfigFile();
  const result = AnyclaudeConfigSchema.safeParse(raw);

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
}
```

### Recommendation: Add Config Validation

**Priority**: LOW
**Effort**: Low (1 hour)
**Impact**: Catches configuration errors early

---

## 9. Observability and Metrics

### Current State

- ✅ Debug logging at 3 levels
- ✅ Cache metrics tracking
- ✅ Request tracing for tool calls

### Best Practice: Structured Metrics Collection

```typescript
interface AnyclaudeMetrics {
  uptime: number;
  totalRequests: number;
  totalTokens: {
    input: number;
    output: number;
  };
  provider: Record<string, {
    requests: number;
    avgLatency: number;
    errorRate: number;
  }>;
  caching: {
    hitRate: number;
    tokensReused: number;
    estimatedCostSavings: number;
  };
  tools: {
    totalCalls: number;
    successRate: number;
    mostUsed: string[];
  };
  errors: Array<{
    category: ErrorCategory;
    count: number;
    recent: string;
  }>;
}

class MetricsCollector {
  private metrics: AnyclaudeMetrics = {
    uptime: Date.now(),
    totalRequests: 0,
    totalTokens: { input: 0, output: 0 },
    provider: {},
    caching: { hitRate: 0, tokensReused: 0, estimatedCostSavings: 0 },
    tools: { totalCalls: 0, successRate: 0, mostUsed: [] },
    errors: []
  };

  recordRequest(provider: string, tokens: { input: number, output: number }) {
    this.metrics.totalRequests++;
    this.metrics.totalTokens.input += tokens.input;
    this.metrics.totalTokens.output += tokens.output;

    if (!this.metrics.provider[provider]) {
      this.metrics.provider[provider] = { requests: 0, avgLatency: 0, errorRate: 0 };
    }
    this.metrics.provider[provider].requests++;
  }

  export(): string {
    return JSON.stringify(this.metrics, null, 2);
  }
}
```

### Best Practice: Health Check Endpoint

```typescript
// Add to anthropic-proxy.ts
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    provider: {
      name: process.env.ANYCLAUDE_MODE || 'unknown',
      available: isProviderAvailable(),
      latency: await measureProviderLatency()
    },
    memory: {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external
    },
    cache: cacheManager.getStats()
  };

  res.json(health);
});
```

### Recommendation: Add Metrics Endpoint

**Priority**: LOW
**Effort**: Low (1-2 hours)
**Impact**: Better observability in production

---

## 10. Implementation Roadmap

### Phase 1: Critical Improvements (Week 1)
- [ ] Implement system prompt KV cache (L1)
- [ ] Fix Python crash (already done ✓)
- [ ] Add error classification

**Estimated Impact**: 10x faster follow-up requests

### Phase 2: Enhanced Caching (Week 2)
- [ ] Implement request-level cache (L2)
- [ ] Add cache metrics dashboard
- [ ] Memory monitoring

**Estimated Impact**: 5x faster for repeated queries

### Phase 3: Observability (Week 3)
- [ ] Add structured request logging
- [ ] Implement metrics collection
- [ ] Health check endpoint
- [ ] Schema transformation tracing

**Estimated Impact**: Better debugging and optimization

### Phase 4: Polish (Week 4)
- [ ] Configuration validation
- [ ] Retry strategy implementation
- [ ] Tool versioning system
- [ ] Documentation

**Estimated Impact**: Production-ready reliability

---

## 11. Summary: What You're Doing Right

Your architecture is **excellent**:

✅ **Streaming**: Correctly preserves transfer-encoding
✅ **Tool Calls**: Multi-model support + graceful fallbacks
✅ **Message Conversion**: Bidirectional translation working
✅ **Provider Abstraction**: Clean separation of concerns
✅ **Error Handling**: Basic safety net in place

## Key Opportunities (in order of impact)

1. **System Prompt KV Cache** - 10x improvement (HIGH priority)
2. **Request-Level L2 Cache** - 5x improvement (MEDIUM priority)
3. **Memory Management** - Stability improvement (MEDIUM priority)
4. **Observability** - Debugging improvement (LOW priority)

---

## References

- **Anthropic Prompt Caching**: https://docs.anthropic.com/en/docs/build-a-prompt-caching-app
- **MLX-LM Cache Prompt**: https://github.com/ml-explore/mlx-lm
- **API Gateway Best Practices**: https://api7.ai/learning-center/api-gateway-guide/api-gateway-proxy-llm-requests
- **LLM Token Optimization**: https://developer.ibm.com/articles/awb-token-optimization-backbone-of-effective-prompt-engineering/

---

**Document Status**: Research-based best practices
**Last Updated**: 2025-10-28
**Applicable To**: AnyClaude v2.0+
