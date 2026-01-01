# Safe System Filter Test Coverage

**Status:** TDD RED Phase - Tests written, implementation pending

**Test File:** `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/safe-system-filter.test.ts`

**Test Runner:** `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/run-safe-system-filter-test.js`

## Test Summary

**Total Test Suites:** 12
**Total Tests:** 130+ comprehensive test cases
**Expected Coverage:** 80%+

## Test Suites

### 1. OptimizationTier Enum (7 tests)

- ✅ Enum value definitions (MINIMAL, MODERATE, AGGRESSIVE, EXTREME)
- ✅ Enum ordering for fallback logic
- ✅ Type safety validation

### 2. estimateTokens() (11 tests)

- ✅ Basic token estimation (chars / 4)
- ✅ Empty string handling
- ✅ Whitespace and newline handling
- ✅ Real-world Claude Code prompts (~12-15k tokens)
- ✅ Very long prompts (>10k tokens)
- ✅ Unicode and emoji characters
- ✅ Mixed content (code, markdown, emoji)

### 3. filterSystemPrompt() - Basic Filtering (20 tests)

- ✅ FilterResult structure validation
- ✅ FilterStats structure validation
- ✅ ValidationResult structure validation
- ✅ MINIMAL tier (12-15k tokens, deduplication only)
- ✅ MODERATE tier (8-10k tokens, dedupe + condense examples)
- ✅ AGGRESSIVE tier (4-6k tokens, hierarchical + summaries)
- ✅ EXTREME tier (2-3k tokens, core + tool schemas only)
- ✅ Tier-specific reduction targets
- ✅ No fallback for valid prompts

### 4. Critical Section Preservation (12 tests)

- ✅ Always preserve critical sections (all tiers)
- ✅ Tool usage policy preservation
- ✅ Doing tasks section preservation
- ✅ IMPORTANT marker preservation
- ✅ JSON format requirement preservation
- ✅ Track preserved sections in result
- ✅ Track removed sections in result
- ✅ Integration with critical-sections.ts

### 5. Validation Gate (8 tests)

- ✅ Validate filtered prompt has critical sections
- ✅ Catch missing critical sections after aggressive filtering
- ✅ List present patterns
- ✅ List missing patterns
- ✅ Prevent broken output
- ✅ Ensure tool calling instructions are present

### 6. Automatic Fallback (10 tests)

- ✅ Fallback from EXTREME to AGGRESSIVE on validation failure
- ✅ Fallback from AGGRESSIVE to MODERATE on validation failure
- ✅ Fallback from MODERATE to MINIMAL on validation failure
- ✅ Track fallback in result (fallbackOccurred boolean)
- ✅ Update appliedTier after fallback
- ✅ Try multiple fallbacks if needed
- ✅ Stop at MINIMAL tier (no further fallback)
- ✅ No fallback for valid prompts

### 7. Statistics & Metrics (12 tests)

- ✅ Count original tokens
- ✅ Count filtered tokens
- ✅ Filtered tokens <= original tokens
- ✅ Calculate reduction percentage (0-100%)
- ✅ Reduction percentage accuracy
- ✅ Track processing time (ms)
- ✅ Processing time < 100ms for small prompts
- ✅ Handle very long prompts without timeout (<5s)

### 8. FilterOptions (8 tests)

- ✅ Require tier option
- ✅ Accept tier option
- ✅ Optional preserveExamples flag
- ✅ Respect preserveExamples: false
- ✅ Optional maxTokens limit
- ✅ maxTokens overrides tier defaults
- ✅ Handle all options together

### 9. Edge Cases (14 tests)

- ✅ Empty prompt handling
- ✅ Whitespace-only prompt handling
- ✅ Fail validation for empty prompt
- ✅ Plain text without markdown headers
- ✅ Fail validation for prompt without critical sections
- ✅ All-critical prompt (no removal)
- ✅ Minimal reduction for all-critical prompt
- ✅ Very long prompts (efficient processing)
- ✅ Significant reduction for very long prompts
- ✅ Preserve critical sections in very long prompts
- ✅ Nested markdown headers (##, ###)
- ✅ Preserve hierarchy in nested markdown

### 10. Adversarial Inputs (12 tests)

- ✅ ReDoS resistance (no hanging)
- ✅ Repeated patterns without crash
- ✅ Deeply nested headers
- ✅ Malformed markdown
- ✅ Markdown injection attempts
- ✅ Unicode characters
- ✅ Null bytes
- ✅ Control characters
- ✅ Prompt injection attempts
- ✅ Section duplication attempts

### 11. Integration with Dependencies (6 tests)

- ✅ critical-sections.ts: validateCriticalPresence()
- ✅ critical-sections.ts: detect missing patterns
- ✅ prompt-section-parser.ts: parseIntoSections()
- ✅ prompt-section-parser.ts: reconstructPrompt()
- ✅ prompt-templates.ts: deduplicatePrompt() for MINIMAL tier
- ✅ prompt-templates.ts: deduplication for all tiers

### 12. FilterResult Structure (5 tests)

- ✅ All required fields present
- ✅ Correct data types
- ✅ preservedSections array
- ✅ removedSections array
- ✅ stats, validation, appliedTier, fallbackOccurred

## Test Data

### Fixtures

- **MINIMAL_VALID_PROMPT:** Basic valid prompt with critical sections
- **FULL_CLAUDE_PROMPT:** Full-featured prompt (~2400 chars, ~600 tokens)
- **PROMPT_MISSING_CRITICAL:** Prompt without required sections
- **PROMPT_ALL_CRITICAL:** Prompt where everything is critical
- **EMPTY_PROMPT:** Empty string
- **WHITESPACE_ONLY:** Whitespace-only prompt
- **VERY_LONG_PROMPT:** >10k token prompt with filler sections
- **MALICIOUS_REDOS_ATTEMPT:** 10k chars + pattern for ReDoS testing
- **NESTED_MARKDOWN:** Multi-level headers (##, ###)

## Key Test Scenarios

### 1. Token Reduction Targets

Each tier must achieve its target reduction:

- **MINIMAL:** 12-15k tokens (deduplication only)
- **MODERATE:** 8-10k tokens (dedupe + condense examples)
- **AGGRESSIVE:** 4-6k tokens (hierarchical + summaries)
- **EXTREME:** 2-3k tokens (core + tool schemas only)

### 2. Critical Section Preservation

**ALWAYS preserved** (containsCritical: true):

- Tool usage policy
- Function call instructions
- JSON format requirements
- Doing tasks section
- IMPORTANT markers

### 3. Validation Gate

After filtering, validate that critical sections are present:

```typescript
const validation = validateCriticalPresence(filteredPrompt);
if (!validation.isValid) {
  // Trigger automatic fallback
}
```

### 4. Automatic Fallback Chain

```
EXTREME (fails validation)
  ↓ fallback
AGGRESSIVE (fails validation)
  ↓ fallback
MODERATE (fails validation)
  ↓ fallback
MINIMAL (most conservative, no further fallback)
```

### 5. Performance Requirements

- Small prompts (<1k tokens): <100ms processing time
- Very long prompts (>10k tokens): <5s processing time
- ReDoS resistance: <1s for malicious inputs

## Expected Test Results (TDD Red Phase)

**Current Status:** All tests FAIL (expected)

**Reason:** Implementation (`src/safe-system-filter.ts`) doesn't exist yet

**Next Step:** Run `code-agent` to implement the module

## Running Tests

```bash
# Run test suite (currently fails - expected)
node tests/unit/run-safe-system-filter-test.js

# After implementation, run with Jest
npm test -- tests/unit/safe-system-filter.test.ts
```

## Coverage Goals

**Target:** 80%+ line coverage

**Critical Paths:**

- ✅ All four tier filtering algorithms
- ✅ Validation gate logic
- ✅ Automatic fallback chain
- ✅ Critical section preservation
- ✅ Token estimation accuracy
- ✅ Edge case handling
- ✅ Adversarial input resistance

## Dependencies

The implementation must integrate with:

1. **src/critical-sections.ts**
   - `validateCriticalPresence(prompt): ValidationResult`
   - Validates that critical sections are present in filtered prompt

2. **src/prompt-section-parser.ts**
   - `parseIntoSections(prompt): PromptSection[]`
   - `reconstructPrompt(sections): string`
   - Parses and rebuilds prompts with markdown structure

3. **src/prompt-templates.ts**
   - `deduplicatePrompt(prompt): { optimized: string, ... }`
   - Applies semantic deduplication (used in all tiers)

## Implementation Checklist

When implementing `src/safe-system-filter.ts`, ensure:

- [ ] OptimizationTier enum with 4 tiers
- [ ] FilterOptions interface (tier, preserveExamples?, maxTokens?)
- [ ] FilterResult interface (all fields documented above)
- [ ] FilterStats interface (originalTokens, filteredTokens, reductionPercent, processingTimeMs)
- [ ] estimateTokens() function (chars / 4)
- [ ] filterSystemPrompt() main function
- [ ] Tier-specific filtering logic (MINIMAL, MODERATE, AGGRESSIVE, EXTREME)
- [ ] Critical section preservation (containsCritical: true)
- [ ] Validation gate after filtering
- [ ] Automatic fallback chain (EXTREME→AGGRESSIVE→MODERATE→MINIMAL)
- [ ] Performance optimization (processing time tracking)
- [ ] Edge case handling (empty, whitespace, no sections, etc.)
- [ ] Adversarial input resistance (ReDoS, malicious patterns)

## Notes

- Tests follow existing patterns from `critical-sections.test.js` and `prompt-templates.test.ts`
- Uses Jest/TypeScript for consistency with project
- Includes both unit tests and integration tests
- Covers normal flow, edge cases, and adversarial inputs
- Validates performance requirements
- Ensures critical sections are NEVER removed
