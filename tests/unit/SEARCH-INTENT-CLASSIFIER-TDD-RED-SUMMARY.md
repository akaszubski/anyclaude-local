# Search Intent Classifier - TDD Red Phase Summary

## Overview

Created comprehensive TDD tests (RED phase) for the GenAI-based search intent classifier system. All tests are currently failing as expected - implementation doesn't exist yet.

## Test Files Created

### 1. tests/unit/search-intent-cache.test.ts (37 tests)

Tests the IntentCache class - LRU cache with TTL for caching classification results.

**Test Categories:**

- Basic operations (6 tests): get, set, clear, cache hit/miss
- Message normalization (6 tests): whitespace, case, punctuation handling
- LRU eviction (6 tests): max size, eviction order, access tracking
- TTL expiration (6 tests): time-based expiry, TTL reset, disabled TTL
- Statistics tracking (8 tests): size, hits, misses, hit rate
- Edge cases (5 tests): empty strings, unicode, special chars, rapid ops

**Key Features Tested:**

- Cache returns null on miss, cached value on hit
- Normalization creates consistent keys (case, whitespace, punctuation)
- LRU evicts least recently used items when full
- TTL expires old entries based on timestamp
- Statistics track size, hit rate, hits, misses
- Handles edge cases (empty, long, unicode messages)

### 2. tests/unit/llm-classifier.test.ts (35 tests)

Tests the LLMClassifier class - Makes GenAI binary YES/NO classification calls.

**Test Categories:**

- Binary YES/NO parsing (4 tests): YES/NO, case insensitive
- Fuzzy response handling (5 tests): "Yes, this is...", whitespace, multi-line
- JSON response parsing (4 tests): {is_search: true}, {answer: "YES"}, embedded JSON
- Error handling (7 tests): timeout, network errors, malformed responses
- Prompt construction (4 tests): system/user messages, temperature, max_tokens
- Configuration (7 tests): backend URL, timeout, mode-based behavior
- Edge cases (4 tests): long messages, unicode, special chars, concurrent calls

**Key Features Tested:**

- Parses "YES" as true, "NO" as false (case insensitive)
- Handles fuzzy responses ("Yes, this is clearly a search...")
- Parses JSON responses with is_search or answer fields
- Handles timeouts and network errors gracefully
- Builds correct prompt with system instructions
- Skips classification for cloud modes (claude, openrouter)
- Uses low temperature (≤0.3) and small max_tokens (≤10)

### 3. tests/unit/search-intent-classifier.test.ts (60 tests)

Tests the SearchIntentClassifier orchestrator - Combines cache, regex, and LLM.

**Test Categories:**

- Configuration (4 tests): config validation, enabled flag, dependency setup
- Cache path (4 tests): cache hit returns result, cache miss proceeds
- Fast-path positive (11 tests): obvious search queries via regex
- Fast-path negative (11 tests): obvious non-search queries via regex
- Slow-path LLM (8 tests): ambiguous queries use LLM
- Fallback behavior (4 tests): LLM failure falls back to regex
- Statistics tracking (7 tests): cache hits, regex hits, LLM calls, latency
- Cache management (2 tests): clear cache, reset stats
- Edge cases (6 tests): empty, long, unicode, concurrent calls
- Integration scenarios (3 tests): complete flows (cache→regex, cache→LLM, fallback)

**Key Features Tested:**

- Cache hit returns cached result immediately (high confidence)
- Fast-path detects obvious searches ("what is the weather") via regex
- Fast-path detects obvious non-searches ("write a function") via regex
- Slow-path uses LLM for ambiguous queries ("tell me about React hooks")
- Falls back to regex on LLM timeout/error
- Tracks statistics (cache hits, regex hits, LLM calls, latency)
- Respects configuration (enabled, cacheSize, ttl, timeout)
- Handles edge cases and concurrent classifications

## Test Data

### Obvious Search Queries (Fast-path Positive)

- "what is the current weather in NYC"
- "latest React version 2025"
- "search LSP plugin in claude code"
- "web search for TypeScript best practices"
- "look up Node.js documentation"
- "find the latest news about AI"
- "google how to install docker"
- "search for python tutorials"
- "what are the current interest rates"
- "latest stock prices for AAPL"

### Obvious Non-Search Queries (Fast-path Negative)

- "write a function to sort an array"
- "fix the bug in this code"
- "run the tests"
- "create a new component called Button"
- "explain this code"
- "refactor this function"
- "add error handling to this endpoint"
- "implement a binary search tree"
- "update the documentation"
- "rename this variable to be more descriptive"

### Ambiguous Queries (Need LLM)

- "tell me about React hooks"
- "what are TypeScript generics"
- "how to use async/await"
- "explain the benefits of immutability"
- "what is dependency injection"

## Stub Files Created

Created placeholder implementation files that throw errors:

1. `/Users/andrewkaszubski/Dev/anyclaude/src/search-intent-cache.ts`
   - IntentCache class with get, set, clear, getStats methods
   - CachedIntent interface

2. `/Users/andrewkaszubski/Dev/anyclaude/src/llm-classifier.ts`
   - LLMClassifier class with classify method

3. `/Users/andrewkaszubski/Dev/anyclaude/src/search-intent-classifier.ts`
   - SearchIntentClassifier class with classify, getStats, clearCache methods
   - ClassificationResult, ClassifierConfig, ClassifierStats interfaces

## Test Execution Results

All 132 tests are in **RED state** (failing as expected):

```
FAIL tests/unit/search-intent-cache.test.ts (37 tests)
  - All tests fail with "IntentCache not implemented yet (TDD red phase)"

FAIL tests/unit/llm-classifier.test.ts (35 tests)
  - All tests fail with "LLMClassifier not implemented yet (TDD red phase)"

FAIL tests/unit/search-intent-classifier.test.ts (60 tests)
  - All tests fail with "SearchIntentClassifier not implemented yet (TDD red phase)"
```

## Interface Definitions

### IntentCache

```typescript
interface CachedIntent {
  intent: boolean;
  timestamp: number;
  normalizedMessage: string;
}

class IntentCache {
  constructor(maxSize?: number, ttlSeconds?: number);
  get(message: string): boolean | null;
  set(message: string, intent: boolean): void;
  clear(): void;
  getStats(): { size: number; hitRate: number; hits: number; misses: number };
}
```

### LLMClassifier

```typescript
class LLMClassifier {
  constructor(mode: string, backendUrl?: string, timeout?: number);
  async classify(message: string): Promise<boolean>;
}
```

### SearchIntentClassifier

```typescript
interface ClassificationResult {
  isSearchIntent: boolean;
  confidence: "high" | "medium" | "low";
  method: "cache" | "regex-positive" | "regex-negative" | "llm" | "fallback";
  latencyMs: number;
}

interface ClassifierConfig {
  enabled: boolean;
  cacheSize: number;
  cacheTtlSeconds: number;
  llmTimeout: number;
  fallbackToRegex: boolean;
}

interface ClassifierStats {
  totalClassifications: number;
  cacheHits: number;
  regexPositive: number;
  regexNegative: number;
  llmCalls: number;
  fallbacks: number;
  avgLatencyMs: number;
}

class SearchIntentClassifier {
  constructor(config: ClassifierConfig, mode: string, backendUrl?: string);
  async classify(message: string): Promise<ClassificationResult>;
  getStats(): ClassifierStats;
  clearCache(): void;
}
```

## Next Steps (Implementation Phase)

1. Implement IntentCache with LRU and TTL
2. Implement LLMClassifier with fetch and parsing
3. Implement SearchIntentClassifier orchestrator
4. Run tests - watch them turn GREEN
5. Refactor if needed (TDD green → refactor)

## Test Patterns Used

- **Arrange-Act-Assert**: Clear test structure
- **Mocking**: Mock fetch for LLM tests, mock dependencies for orchestrator
- **Fake Timers**: Jest fake timers for TTL testing
- **Test Data**: Realistic search/non-search queries
- **Edge Cases**: Empty strings, unicode, special chars, concurrent calls
- **Error Handling**: Timeout, network errors, malformed responses
- **Statistics**: Track metrics for observability

## Coverage Goals

Target 80%+ coverage across:

- Unit tests (individual classes)
- Integration tests (orchestrator flow)
- Edge cases (error handling, boundaries)
- Performance (caching, latency tracking)

All tests follow TDD RED phase - failing before implementation exists.
