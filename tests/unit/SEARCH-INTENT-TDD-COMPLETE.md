# Search Intent Classifier - TDD Test Suite Complete

## Executive Summary

Created comprehensive TDD test suite (RED phase) for GenAI-based search intent classification system. All 133 tests are currently failing as expected - implementation phase is next.

## Test Suite Statistics

- **Total Tests:** 133
- **Test Files:** 3
- **Test Status:** RED (all failing - no implementation yet)
- **Lines of Test Code:** ~1,400
- **Coverage Target:** 80%+

## Files Created

### Test Files

1. **tests/unit/search-intent-cache.test.ts** (37 tests)
   - IntentCache class tests
   - LRU cache with TTL
   - Message normalization
   - Statistics tracking

2. **tests/unit/llm-classifier.test.ts** (35 tests)
   - LLMClassifier class tests
   - Binary YES/NO classification
   - Response parsing (fuzzy, JSON)
   - Error handling and timeouts

3. **tests/unit/search-intent-classifier.test.ts** (61 tests)
   - SearchIntentClassifier orchestrator tests
   - Cache → Regex → LLM flow
   - Fast-path optimization
   - Fallback behavior
   - Statistics tracking

### Implementation Stubs

1. **src/search-intent-cache.ts**
   - IntentCache class interface
   - CachedIntent type
   - Methods: get, set, clear, getStats

2. **src/llm-classifier.ts**
   - LLMClassifier class interface
   - Method: classify(message) → boolean

3. **src/search-intent-classifier.ts**
   - SearchIntentClassifier class interface
   - ClassificationResult type
   - ClassifierConfig type
   - ClassifierStats type
   - Methods: classify, getStats, clearCache

### Documentation

1. **tests/unit/SEARCH-INTENT-CLASSIFIER-TDD-RED-SUMMARY.md**
   - Comprehensive test overview
   - Test categories and features
   - Interface definitions
   - Test data examples

2. **tests/unit/SEARCH-INTENT-CLASSIFIER-TEST-COVERAGE.md**
   - Complete coverage report
   - 100% feature coverage
   - Test quality metrics
   - Future test suggestions

## Test Execution Results

```bash
$ npx jest tests/unit/search-intent-*.test.ts --no-coverage

FAIL tests/unit/search-intent-cache.test.ts
  37 tests failed - IntentCache not implemented yet (TDD red phase)

FAIL tests/unit/llm-classifier.test.ts
  35 tests failed - LLMClassifier not implemented yet (TDD red phase)

FAIL tests/unit/search-intent-classifier.test.ts
  61 tests failed - SearchIntentClassifier not implemented yet (TDD red phase)

Tests:       133 failed, 133 total
Snapshots:   0 total
Time:        ~2s
```

## Architecture Overview

### System Flow

```
User Message
    |
    v
SearchIntentClassifier.classify(message)
    |
    +---> IntentCache.get(message)
    |         |
    |         +---> [CACHE HIT] → Return cached result (high confidence)
    |         |
    |         +---> [CACHE MISS] → Continue
    |
    +---> Regex Fast-path
    |         |
    |         +---> [OBVIOUS SEARCH] → Return true (high confidence)
    |         |         Examples: "what is the weather", "search for"
    |         |
    |         +---> [OBVIOUS NON-SEARCH] → Return false (high confidence)
    |         |         Examples: "write a function", "fix this bug"
    |         |
    |         +---> [AMBIGUOUS] → Continue
    |
    +---> LLMClassifier.classify(message)
    |         |
    |         +---> [SUCCESS] → Return LLM result (medium confidence)
    |         |
    |         +---> [TIMEOUT/ERROR] → Fallback
    |
    +---> Fallback (if enabled)
    |         |
    |         +---> Return regex-based guess (low confidence)
    |
    v
IntentCache.set(message, result)
    |
    v
Return ClassificationResult
```

### Data Flow

```
IntentCache (LRU + TTL)
  ├─ Normalized message → boolean
  ├─ TTL expiration (default 300s)
  ├─ LRU eviction (default 100 items)
  └─ Stats: size, hitRate, hits, misses

LLMClassifier
  ├─ Input: user message
  ├─ Prompt: "Is this a search query? YES/NO"
  ├─ Backend: local/mlx-cluster (skip cloud)
  ├─ Timeout: configurable (default 1000ms)
  └─ Output: boolean (true = search, false = not search)

SearchIntentClassifier
  ├─ Input: user message
  ├─ Config: enabled, cacheSize, ttl, timeout, fallback
  ├─ Dependencies: IntentCache, LLMClassifier
  └─ Output: ClassificationResult
      ├─ isSearchIntent: boolean
      ├─ confidence: 'high' | 'medium' | 'low'
      ├─ method: 'cache' | 'regex-positive' | 'regex-negative' | 'llm' | 'fallback'
      └─ latencyMs: number
```

## Test Categories

### IntentCache (37 tests)

1. **Basic Operations** (6 tests)
   - Cache hit/miss logic
   - Set and update entries
   - Clear cache

2. **Message Normalization** (6 tests)
   - Lowercase conversion
   - Whitespace normalization
   - Punctuation removal

3. **LRU Eviction** (6 tests)
   - Evict least recently used
   - Update access order on get
   - Update access order on set
   - Handle cache size limits

4. **TTL Expiration** (6 tests)
   - Expire old entries
   - Keep fresh entries
   - Reset TTL on update
   - Disable TTL (ttl=0)

5. **Statistics** (8 tests)
   - Track size, hits, misses
   - Calculate hit rate
   - Reset on clear

6. **Edge Cases** (5 tests)
   - Empty strings, unicode, special chars
   - Rapid operations

### LLMClassifier (35 tests)

1. **Binary Parsing** (4 tests)
   - YES → true, NO → false
   - Case insensitive

2. **Fuzzy Responses** (5 tests)
   - "Yes, this is a search..."
   - Whitespace handling
   - Multi-line responses

3. **JSON Parsing** (4 tests)
   - {is_search: true}
   - {answer: "YES"}
   - Embedded JSON

4. **Error Handling** (7 tests)
   - Timeout, network errors
   - Malformed responses
   - Empty/missing responses

5. **Prompt Construction** (4 tests)
   - System/user messages
   - Low temperature
   - Small max_tokens

6. **Configuration** (7 tests)
   - Backend URL
   - Timeout settings
   - Mode-based behavior

7. **Edge Cases** (4 tests)
   - Long messages, unicode
   - Concurrent calls

### SearchIntentClassifier (61 tests)

1. **Configuration** (4 tests)
   - Default config
   - Enabled flag
   - Dependency setup

2. **Cache Path** (4 tests)
   - Cache hit returns immediately
   - Cache miss continues flow

3. **Fast-path Positive** (11 tests)
   - 10 obvious search queries
   - Caching regex results

4. **Fast-path Negative** (11 tests)
   - 10 obvious non-search queries
   - Caching regex results

5. **Slow-path LLM** (8 tests)
   - 5 ambiguous queries
   - Return LLM results
   - Cache LLM results

6. **Fallback** (4 tests)
   - Timeout → fallback
   - Network error → fallback
   - Fallback disabled

7. **Statistics** (7 tests)
   - Track all classification methods
   - Track latency

8. **Cache Management** (2 tests)
   - Clear cache
   - Reset stats

9. **Edge Cases** (6 tests)
   - Empty, long, unicode messages
   - Concurrent calls
   - Result structure validation

10. **Integration** (3 tests)
    - Cache miss → regex → cache
    - Cache miss → LLM → cache
    - Cache miss → LLM fail → fallback

## Test Data Examples

### Obvious Search Queries

```typescript
"what is the current weather in NYC";
"latest React version 2025";
"search LSP plugin in claude code";
"web search for TypeScript best practices";
"look up Node.js documentation";
```

### Obvious Non-Search Queries

```typescript
"write a function to sort an array";
"fix the bug in this code";
"run the tests";
"create a new component called Button";
"explain this code";
```

### Ambiguous Queries (Need LLM)

```typescript
"tell me about React hooks";
"what are TypeScript generics";
"how to use async/await";
```

## Implementation Requirements

### IntentCache

- LRU eviction when size > maxSize
- TTL expiration on get (check timestamp)
- Message normalization: lowercase, trim, collapse whitespace, remove punctuation
- Statistics: track hits, misses, calculate hit rate

### LLMClassifier

- Build prompt: system message + user message
- Fetch to backend: POST /v1/chat/completions
- Parse response: extract YES/NO from content
- Handle fuzzy: "Yes, this is...", JSON: {is_search: true}
- Timeout: AbortController with configurable timeout
- Skip for cloud modes: openrouter, claude

### SearchIntentClassifier

- Check cache first (fast path)
- Regex fast-path: obvious keywords
  - Search: "what", "search", "look up", "find", "google", "latest"
  - Non-search: "write", "fix", "create", "implement", "refactor", "run"
- LLM slow-path: ambiguous queries
- Fallback: regex guess on LLM failure
- Cache all results
- Track statistics: method counts, latency

## Running the Tests

```bash
# Run all search intent tests
npx jest tests/unit/search-intent-*.test.ts --no-coverage

# Run individual test files
npx jest tests/unit/search-intent-cache.test.ts
npx jest tests/unit/llm-classifier.test.ts
npx jest tests/unit/search-intent-classifier.test.ts

# Run with verbose output
npx jest tests/unit/search-intent-*.test.ts --verbose

# Watch mode (for implementation)
npx jest tests/unit/search-intent-*.test.ts --watch
```

## Next Steps

1. **Implement IntentCache**
   - LRU cache with Map
   - TTL with timestamp checks
   - Normalization helper
   - Statistics tracking

2. **Implement LLMClassifier**
   - Fetch wrapper with timeout
   - Response parser (YES/NO, fuzzy, JSON)
   - Error handling

3. **Implement SearchIntentClassifier**
   - Orchestrator logic
   - Regex patterns
   - Statistics aggregation

4. **Run Tests → GREEN**
   - Watch tests turn green
   - Debug failing tests
   - Aim for 100% pass rate

5. **Refactor**
   - Clean up code
   - Optimize performance
   - Add comments

## Success Criteria

- All 133 tests passing
- No implementation leakage (implementation-agnostic tests)
- Fast execution (< 5s for all tests)
- Clear error messages on failures
- 80%+ code coverage after implementation

## Notes

- Tests follow Arrange-Act-Assert pattern
- Mocking used for external dependencies (fetch, cache)
- Fake timers used for TTL tests
- Tests are independent and can run in any order
- No integration tests yet (all unit tests)

**Status:** TDD RED phase complete. Ready for implementation.
