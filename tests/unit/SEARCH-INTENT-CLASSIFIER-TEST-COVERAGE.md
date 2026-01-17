# Search Intent Classifier - Test Coverage Report

## Summary

**Total Tests:** 132
**Test Files:** 3
**Status:** RED phase (all tests failing as expected - no implementation yet)

## Coverage Breakdown

### 1. IntentCache (37 tests)

#### Basic Operations (6 tests)

- [x] Cache miss returns null
- [x] Cache hit returns cached value (true)
- [x] Cache hit returns cached value (false)
- [x] Different message returns null
- [x] Update existing entry
- [x] Clear all entries

#### Message Normalization (6 tests)

- [x] Normalize leading/trailing whitespace
- [x] Normalize multiple spaces to single space
- [x] Normalize uppercase to lowercase
- [x] Normalize mixed case to lowercase
- [x] Remove trailing punctuation
- [x] Complex normalization (all at once)

#### LRU Eviction (6 tests)

- [x] No eviction when below max size
- [x] Evict LRU when cache full
- [x] Update LRU on access (get)
- [x] Update LRU on update (set)
- [x] Handle cache size of 1
- [x] Default to reasonable max size

#### TTL Expiration (6 tests)

- [x] Return cached value before TTL expires
- [x] Return null after TTL expires
- [x] Keep fresh, expire old
- [x] Reset TTL on update
- [x] Disable TTL (ttl=0)
- [x] Default TTL behavior

#### Statistics (8 tests)

- [x] Track cache size
- [x] Track cache hits
- [x] Track cache misses
- [x] Calculate hit rate
- [x] Handle hit rate with no accesses
- [x] Update stats after clear
- [x] Track mixed hits/misses
- [x] Don't count set operations in stats

#### Edge Cases (5 tests)

- [x] Handle empty string
- [x] Handle very long messages
- [x] Handle special characters
- [x] Handle unicode
- [x] Handle rapid operations

**Coverage:** 100% of planned IntentCache features

---

### 2. LLMClassifier (35 tests)

#### Binary YES/NO Parsing (4 tests)

- [x] Parse "YES" as true
- [x] Parse "NO" as false
- [x] Parse "yes" (lowercase) as true
- [x] Parse "no" (lowercase) as false

#### Fuzzy Response Handling (5 tests)

- [x] Parse "Yes, this is a search..." as true
- [x] Parse "No, this is not..." as false
- [x] Handle YES with whitespace
- [x] Handle NO with leading explanation
- [x] Extract YES from multi-line response

#### JSON Response Parsing (4 tests)

- [x] Parse JSON with is_search: true
- [x] Parse JSON with is_search: false
- [x] Parse JSON with answer: "YES"
- [x] Handle JSON embedded in text

#### Error Handling (7 tests)

- [x] Throw on timeout
- [x] Throw on network error
- [x] Throw on HTTP error status
- [x] Throw on malformed JSON
- [x] Handle empty response
- [x] Handle missing choices
- [x] Handle ambiguous response (MAYBE)

#### Prompt Construction (4 tests)

- [x] Build correct system/user prompt
- [x] Include user message
- [x] Set low temperature (≤0.3)
- [x] Set small max_tokens (≤10)

#### Configuration (7 tests)

- [x] Use provided backend URL
- [x] Use default backend URL
- [x] Respect custom timeout
- [x] Skip for openrouter mode
- [x] Skip for claude mode
- [x] Work with local mode
- [x] Work with mlx-cluster mode

#### Edge Cases (4 tests)

- [x] Handle very long messages
- [x] Handle special characters
- [x] Handle unicode
- [x] Handle concurrent classifications

**Coverage:** 100% of planned LLMClassifier features

---

### 3. SearchIntentClassifier (60 tests)

#### Configuration (4 tests)

- [x] Create with default config
- [x] Respect enabled=false
- [x] Pass config to IntentCache
- [x] Pass config to LLMClassifier

#### Cache Path (4 tests)

- [x] Return cached result (true)
- [x] Return cached result (false)
- [x] Proceed on cache miss
- [x] Cache result after classification

#### Fast-path Positive (11 tests)

- [x] "what is the current weather in NYC"
- [x] "latest React version 2025"
- [x] "search LSP plugin in claude code"
- [x] "web search for TypeScript best practices"
- [x] "look up Node.js documentation"
- [x] "find the latest news about AI"
- [x] "google how to install docker"
- [x] "search for python tutorials"
- [x] "what are the current interest rates"
- [x] "latest stock prices for AAPL"
- [x] Cache regex-positive results

#### Fast-path Negative (11 tests)

- [x] "write a function to sort an array"
- [x] "fix the bug in this code"
- [x] "run the tests"
- [x] "create a new component called Button"
- [x] "explain this code"
- [x] "refactor this function"
- [x] "add error handling to this endpoint"
- [x] "implement a binary search tree"
- [x] "update the documentation"
- [x] "rename this variable to be more descriptive"
- [x] Cache regex-negative results

#### Slow-path LLM (8 tests)

- [x] Use LLM for "tell me about React hooks"
- [x] Use LLM for "what are TypeScript generics"
- [x] Use LLM for "how to use async/await"
- [x] Use LLM for "explain the benefits of immutability"
- [x] Use LLM for "what is dependency injection"
- [x] Return LLM result (true)
- [x] Return LLM result (false)
- [x] Cache LLM results

#### Fallback Behavior (4 tests)

- [x] Fall back on LLM timeout
- [x] Fall back on network error
- [x] Return false when fallback disabled
- [x] Cache fallback results

#### Statistics (7 tests)

- [x] Track cache hits
- [x] Track regex positive hits
- [x] Track regex negative hits
- [x] Track LLM calls
- [x] Track fallback count
- [x] Track average latency
- [x] Track total classifications

#### Cache Management (2 tests)

- [x] Clear cache
- [x] Reset stats after clear

#### Edge Cases (6 tests)

- [x] Handle empty string
- [x] Handle very long messages
- [x] Handle unicode
- [x] Handle special characters
- [x] Handle concurrent classifications
- [x] Validate result structure

#### Integration Scenarios (3 tests)

- [x] Flow: cache miss → regex → cache
- [x] Flow: cache miss → LLM → cache
- [x] Flow: cache miss → LLM fail → fallback

**Coverage:** 100% of planned SearchIntentClassifier features

---

## Feature Coverage Matrix

| Feature          | IntentCache | LLMClassifier | Orchestrator | Total Tests |
| ---------------- | ----------- | ------------- | ------------ | ----------- |
| Basic operations | 6           | 4             | 4            | 14          |
| Normalization    | 6           | -             | -            | 6           |
| LRU eviction     | 6           | -             | -            | 6           |
| TTL expiration   | 6           | -             | -            | 6           |
| Parsing          | -           | 13            | -            | 13          |
| Error handling   | -           | 7             | 4            | 11          |
| Configuration    | -           | 7             | 4            | 11          |
| Fast-path regex  | -           | -             | 22           | 22          |
| Slow-path LLM    | -           | -             | 8            | 8           |
| Statistics       | 8           | -             | 7            | 15          |
| Cache mgmt       | 1           | -             | 2            | 3           |
| Edge cases       | 5           | 4             | 6            | 15          |
| Integration      | -           | -             | 3            | 3           |
| **Total**        | **37**      | **35**        | **60**       | **132**     |

## Test Quality Metrics

### Test Patterns

- **Arrange-Act-Assert:** 100% of tests
- **Mocking:** Used in LLMClassifier (fetch) and Orchestrator (dependencies)
- **Fake Timers:** Used in IntentCache (TTL tests)
- **Data-driven:** 10 search queries, 10 non-search queries, 5 ambiguous

### Coverage Goals

- **Unit Test Coverage:** 100% (all planned features tested)
- **Edge Case Coverage:** 15 tests (11% of total)
- **Error Handling:** 11 tests (8% of total)
- **Integration:** 3 end-to-end flows

### Test Characteristics

- **Independence:** All tests can run in isolation
- **Repeatability:** Mock deterministic responses
- **Fast:** No real network calls (all mocked)
- **Clear naming:** Descriptive test names
- **Good assertions:** Clear expected/actual comparisons

## Gaps and Future Tests

### Potential Additional Tests

1. **Performance:** Benchmark cache vs LLM latency
2. **Stress:** 10k+ rapid classifications
3. **Memory:** Cache memory usage tracking
4. **Concurrency:** Race conditions in cache updates
5. **Integration:** Real LLM calls in integration tests (not unit)

### Notes

- All tests currently in RED phase (expected)
- No integration tests with real backend yet
- LLM tests use mocked fetch responses
- Tests assume jest framework

## Implementation Readiness

All tests written and failing. Ready for implementation phase:

1. Implement IntentCache (37 tests to pass)
2. Implement LLMClassifier (35 tests to pass)
3. Implement SearchIntentClassifier (60 tests to pass)

**Target:** All 132 tests passing after implementation
