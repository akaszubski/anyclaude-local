# SearxNG Local Search - TDD Red Phase Summary

**Issue:** #49 - Local-only WebSearch with self-hosted SearxNG
**Test File:** `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/searxng-local.test.ts`
**Status:** RED PHASE - All tests fail (functions not implemented)

## Test Coverage Overview

### Total Test Suites: 11

### Total Test Cases: 66

## Suite Breakdown

### Suite 1: searchViaLocalSearxNG() - Success scenarios (7 tests)

- Return SearchResult[] on 200 response
- Make fetch with correct URL parameters
- Use custom base URL when provided
- Handle results without content field (optional snippet)
- Return empty array for empty results
- Handle missing results field in response
- Limit results to 10 items

### Suite 2: searchViaLocalSearxNG() - URL encoding (4 tests)

- Encode query with spaces
- Encode special characters (&, ?, =)
- Handle unicode characters
- Handle quotes and symbols

### Suite 3: searchViaLocalSearxNG() - Network errors (3 tests)

- Connection refused (Docker not running)
- Network timeout
- DNS resolution failure

### Suite 4: searchViaLocalSearxNG() - HTTP errors (4 tests)

- 403 Forbidden (JSON format disabled)
- 404 Not Found
- 500 Internal Server Error
- 502 Bad Gateway

### Suite 5: searchViaLocalSearxNG() - Timeout enforcement (3 tests)

- Abort request after 5 seconds
- Pass AbortController signal to fetch
- Clear timeout on successful response

### Suite 6: searchViaLocalSearxNG() - Invalid JSON responses (3 tests)

- Malformed JSON throws SyntaxError
- HTML response instead of JSON
- Empty response body

### Suite 7: searchViaLocalSearxNG() - Edge cases (5 tests)

- Empty query string
- Very long query (>1000 chars)
- Results with missing required fields
- Results with null/undefined fields
- Proper field mapping

### Suite 8: getLocalSearxngUrl() - Environment configuration (8 tests)

- Return SEARXNG_URL when set
- Return default http://localhost:8080 when unset
- Return default for empty string
- Custom port support
- URL with trailing slash
- HTTPS URLs
- IPv4 addresses
- IPv6 addresses

### Suite 9: executeClaudeSearch() - Local SearxNG integration (9 tests)

- Try local SearxNG first when configured
- Skip local when SEARXNG_URL not set
- Fallback to public SearxNG on connection refused
- Fallback to Tavily when both fail
- Return immediately without cloud calls
- Handle timeout and fallback
- Handle 403 error and fallback
- Propagate error when all providers fail
- Maintain fallback chain integrity

### Suite 10: Integration scenarios (3 tests)

- Real-world query patterns
- Multiple special characters
- Concurrent searches

### Suite 11: SearchResult type validation (2 tests)

- Transform SearxNG to SearchResult format
- Ensure snippet is optional

## Functions to Implement

### 1. searchViaLocalSearxNG(query: string, baseUrl?: string): Promise<SearchResult[]>

**Responsibilities:**

- Make HTTP GET request to local SearxNG
- Use AbortController with 5-second timeout
- Format URL: `${baseUrl}/search?q=${encoded}&format=json&categories=general`
- Parse JSON response
- Transform to SearchResult[] format
- Handle errors with descriptive messages

**Error Scenarios:**

- Network errors (ECONNREFUSED, DNS, timeout)
- HTTP errors (403, 404, 500, 502)
- Invalid JSON responses
- Missing required fields

### 2. getLocalSearxngUrl(): string

**Responsibilities:**

- Read SEARXNG_URL environment variable
- Return default "http://localhost:8080" if not set or empty
- Support various URL formats (HTTP/HTTPS, IPv4/IPv6)

### 3. Modified executeClaudeSearch(query: string): Promise<SearchResult[]>

**Responsibilities:**

- Try local SearxNG first if SEARXNG_URL is set
- Fall back to public SearxNG instances on local failure
- Continue to Tavily/Brave/Anthropic as existing fallback chain
- Log errors appropriately with debug()

## Expected Behavior

### Success Path

1. User sets `SEARXNG_URL=http://localhost:8080`
2. Local SearxNG running in Docker
3. Query executes against local instance
4. Results returned immediately (no cloud API calls)

### Fallback Path

1. Local SearxNG configured but Docker not running
2. Connection refused error caught
3. Falls back to public SearxNG instances
4. Continues existing fallback chain

### Skip Path

1. SEARXNG_URL not set or empty
2. Skips local SearxNG attempt
3. Uses existing public search providers

## Type Definitions

```typescript
interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}
```

**SearxNG Response Format:**

```json
{
  "results": [
    {
      "url": "https://example.com",
      "title": "Page Title",
      "content": "Page snippet/description"
    }
  ]
}
```

**Mapping:**

- `url` → `url`
- `title` → `title`
- `content` → `snippet` (optional)

## Test Execution Status

```
FAIL tests/unit/searxng-local.test.ts
  Test suite failed to run

    TS2305: Module '"../../src/claude-search-executor"' has no exported member 'searchViaLocalSearxNG'.
    TS2305: Module '"../../src/claude-search-executor"' has no exported member 'getLocalSearxngUrl'.

Test Suites: 1 failed, 1 total
Tests:       0 total
```

**Status:** RED PHASE - Functions don't exist yet (expected for TDD)

## Next Steps

1. Implement `searchViaLocalSearxNG()` function
2. Implement `getLocalSearxngUrl()` helper
3. Modify `executeClaudeSearch()` to try local first
4. Run tests - expect GREEN phase
5. Verify all 66 tests pass
6. Check for edge cases and add tests if needed

## Coverage Goals

- **Unit Tests:** 100% of new functions
- **Integration Tests:** 100% of fallback scenarios
- **Edge Cases:** All error conditions covered
- **Overall Goal:** 90%+ coverage

## Test Quality Metrics

- **Arrange-Act-Assert Pattern:** All tests follow AAA
- **Mock Usage:** Proper fetch mocking with jest.fn()
- **Async Handling:** All async tests use async/await
- **Error Testing:** Comprehensive error scenarios
- **Edge Cases:** Empty strings, long queries, unicode, special chars
- **Integration:** Multi-provider fallback chain tested

## Documentation Requirements

After implementation:

1. Update CHANGELOG.md with Issue #49
2. Add SearxNG setup guide to docs/guides/
3. Update configuration.md with SEARXNG_URL
4. Add Docker Compose example for SearxNG
5. Document privacy benefits of local-only search
