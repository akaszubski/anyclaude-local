# Critical Section Detection API

**Module**: `src/critical-sections.ts`
**Status**: COMPLETE - 136/136 unit tests passing
**Purpose**: Preserve tool-calling instructions during prompt optimization

## Overview

The critical-sections module identifies and validates essential system prompt instructions that enable tool-calling in Claude Code. This prevents accidental removal of critical instructions during prompt truncation or optimization.

## Interfaces

### CriticalSection

Defines a critical section pattern with metadata.

```typescript
interface CriticalSection {
  /** Unique identifier for this pattern */
  name: string;

  /** RegExp pattern for matching this section */
  pattern: RegExp;

  /** Whether this section is required (must be present) */
  required: boolean;

  /** Human-readable description of why this section is critical */
  description: string;
}
```

### CriticalSectionMatch

Represents a matched critical section in a prompt.

```typescript
interface CriticalSectionMatch {
  /** Reference to the critical section definition */
  section: CriticalSection;

  /** The actual matched text from the prompt */
  matchedText: string;

  /** Start position in the prompt */
  start: number;

  /** End position in the prompt */
  end: number;
}
```

### ValidationResult

Result of validating critical section presence.

```typescript
interface ValidationResult {
  /** True if all required sections are present */
  isValid: boolean;

  /** Array of missing required sections */
  missingRequired: CriticalSection[];

  /** Warnings for optional missing sections */
  warnings: string[];

  /** Count of sections found */
  foundSections: number;

  /** Total count of required sections */
  requiredCount: number;

  /** Coverage percentage (0-100) */
  coveragePercent: number;
}
```

## Constants

### CRITICAL_SECTIONS

Array of 9 critical patterns (5 required, 4 optional) that must be preserved for tool-calling.

```typescript
export const CRITICAL_SECTIONS: CriticalSection[];
```

**Patterns**:

| Name                       | Required | Pattern                        | Purpose                         |
| -------------------------- | -------- | ------------------------------ | ------------------------------- |
| tool-usage-policy-header   | YES      | `/# Tool usage policy/`        | Marks tool usage policy section |
| json-format-requirement    | YES      | `/\b(?:JSON\|json)\b/`         | Requires JSON parameter format  |
| doing-tasks-section        | YES      | `/# Doing tasks/`              | Marks task execution section    |
| important-markers          | YES      | `/IMPORTANT:/`                 | Critical instruction markers    |
| function-calls-instruction | NO       | `/When making function calls/` | Function call methodology       |
| very-important-markers     | NO       | `/VERY IMPORTANT:/`            | Most critical instructions      |
| absolute-path-requirement  | NO       | `/absolute file paths?/i`      | Absolute path requirement       |
| function-calls-tags        | NO       | `/<function_calls>/`           | XML-style function call tags    |
| invoke-tag                 | NO       | `/<invoke name=/`              | Tool invocation tag format      |

## Functions

### detectCriticalSections()

Detect all critical sections present in a prompt.

```typescript
function detectCriticalSections(prompt: string): CriticalSectionMatch[];
```

**Parameters**:

- `prompt` (string): The system prompt to analyze

**Returns**: Array of matched critical sections with positions

**Security**:

- ReDoS-resistant: Uses simple patterns without nested quantifiers
- Memory-safe: No state accumulation across calls
- Input sanitization: Handles null bytes and control characters

**Performance**: <1ms per pattern match on typical prompts

**Example**:

```typescript
import { detectCriticalSections } from "./critical-sections";

const prompt =
  "You are Claude Code.\n\n# Tool usage policy\n\nWhen making function calls...";
const matches = detectCriticalSections(prompt);

for (const match of matches) {
  console.log(
    `Found: "${match.matchedText}" at position ${match.start}-${match.end}`
  );
  console.log(`Pattern: ${match.section.name}`);
}
```

### validateCriticalPresence()

Validate that all required critical sections are present in a prompt.

```typescript
function validateCriticalPresence(prompt: string): ValidationResult;
```

**Parameters**:

- `prompt` (string): The system prompt to validate

**Returns**: Validation result with coverage details

**Use Case**: Run before optimizing a prompt to ensure tool-calling won't be broken

**Performance**: <5ms on typical prompts (1-20k tokens)

**Example**:

```typescript
import { validateCriticalPresence } from "./critical-sections";

const result = validateCriticalPresence(optimizedPrompt);

if (!result.isValid) {
  console.error("Cannot optimize - missing critical sections:");
  for (const missing of result.missingRequired) {
    console.error(`  - ${missing.name}: ${missing.description}`);
  }
  console.error(`Coverage: ${result.coveragePercent}%`);
} else {
  console.log(`Optimization safe - ${result.coveragePercent}% coverage`);
}
```

**Interpretation**:

- `isValid === true`: All required sections present - safe to use
- `isValid === false`: Missing required sections - optimization broke tool-calling
- `coveragePercent === 100`: All required sections present
- `coveragePercent < 100`: Some required sections missing (shows in `missingRequired`)
- `warnings`: Optional missing sections (may affect functionality)

## Usage Patterns

### Safe Prompt Optimization

Validate before and after truncating a system prompt:

```typescript
import { validateCriticalPresence } from "./critical-sections";

const originalPrompt = "...very long system prompt...";

// Check baseline
const baseBefore = validateCriticalPresence(originalPrompt);
if (!baseBefore.isValid) {
  throw new Error("Original prompt missing critical sections");
}

// Apply optimization
const optimized = truncatePrompt(originalPrompt, maxTokens);

// Validate after optimization
const baseAfter = validateCriticalPresence(optimized);
if (!baseAfter.isValid) {
  console.error("Optimization removed critical sections. Required sections:");
  for (const section of baseAfter.missingRequired) {
    console.error(`  - ${section.name}: ${section.description}`);
  }
  throw new Error("Optimization broke tool-calling");
}

console.log(`Optimization successful - ${baseAfter.coveragePercent}% coverage`);
```

### Pattern Analysis

Find exactly which patterns are in a prompt:

```typescript
import { detectCriticalSections } from "./critical-sections";

const matches = detectCriticalSections(prompt);
const patterns = new Map<string, CriticalSectionMatch[]>();

// Group by pattern name
for (const match of matches) {
  if (!patterns.has(match.section.name)) {
    patterns.set(match.section.name, []);
  }
  patterns.get(match.section.name)!.push(match);
}

// Report findings
for (const [name, matches] of patterns) {
  console.log(`Pattern "${name}" found ${matches.length} time(s)`);
  for (const m of matches) {
    console.log(`  Position ${m.start}-${m.end}: "${m.matchedText}"`);
  }
}
```

### Coverage Monitoring

Track how much of required functionality is preserved:

```typescript
import { validateCriticalPresence } from "./critical-sections";

const result = validateCriticalPresence(prompt);

console.log(`Tool-calling Coverage: ${result.coveragePercent}%`);
console.log(`Sections Found: ${result.foundSections}/${result.requiredCount}`);

if (result.missingRequired.length > 0) {
  console.log("Missing required sections:");
  for (const section of result.missingRequired) {
    console.log(`  - ${section.name}: ${section.description}`);
  }
}

if (result.warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of result.warnings) {
    console.log(`  - ${warning}`);
  }
}
```

## Security Considerations

### ReDoS Resistance

All patterns are designed to prevent Regular Expression Denial of Service (ReDoS) attacks:

- **Simple patterns**: No nested quantifiers (`.*, .+, {n,m}`)
- **Character classes**: Used instead of dot-star (`[a-z]` instead of `.`)
- **Performance**: <1000ms on malicious input (10k+ character strings)

Tested with adversarial inputs:

- 10,000+ character repeating strings
- Alternating character patterns
- Nested pattern attempts

### Memory Safety

Function implementations are memory-safe:

- **No state accumulation**: Each call is independent
- **Linear memory growth**: Growth proportional to input size
- **No memory leaks**: <10MB total growth after 100+ calls on large prompts

### Input Sanitization

- Handles null bytes safely
- Processes control characters without issues
- Supports Unicode input
- No unbounded buffer growth

## Integration Examples

### With Adaptive Prompt Optimization

```typescript
import { validateCriticalPresence } from "./critical-sections";

class AdaptiveOptimizer {
  async optimizePrompt(prompt: string, maxTokens: number): Promise<string> {
    // Validate before optimization
    const before = validateCriticalPresence(prompt);
    if (!before.isValid) {
      throw new Error("Cannot optimize - missing critical sections");
    }

    // Apply optimization strategies
    let optimized = prompt;
    if (prompt.length > maxTokens) {
      optimized = this.truncateSafely(prompt, maxTokens);
    }

    // Validate after optimization
    const after = validateCriticalPresence(optimized);
    if (!after.isValid) {
      console.warn("Optimization broke tool-calling, reverting");
      return prompt; // Fall back to original
    }

    console.log(
      `Optimization successful - coverage: ${after.coveragePercent}%`
    );
    return optimized;
  }

  private truncateSafely(prompt: string, maxTokens: number): string {
    // Keep at least the first 50% of prompt for critical sections
    const minLength = Math.max(Math.floor(prompt.length * 0.5), 2000);
    return prompt.substring(0, Math.min(prompt.length, minLength));
  }
}
```

## Performance Characteristics

| Operation                    | Typical Time | Max Time                |
| ---------------------------- | ------------ | ----------------------- |
| detectCriticalSections()     | <1ms         | <100ms (on 100k+ char)  |
| validateCriticalPresence()   | <5ms         | <100ms (on 100k+ char)  |
| Pattern matching per section | <0.1ms       | <10ms                   |
| Memory per call              | <100KB       | <10MB on repeated calls |

## Testing

**File**: `tests/unit/critical-sections.test.js` (557 lines)

**Test Coverage**: 136 tests, 100% passing

**Test Categories**:

- Structure validation (10 tests)
- Pattern detection (27 tests)
- Validation logic (32 tests)
- Security and ReDoS resistance (21 tests)
- Real Claude Code prompts (21 tests)
- Edge cases and integration (25 tests)

**Key Test Scenarios**:

- Empty and whitespace-only prompts
- Malicious ReDoS attempts (10k+ characters)
- Unicode and control characters
- Multiple pattern matches
- Memory safety (100+ repeated calls)
- Real Claude Code system prompt variations

## Version History

- **v1.0.0** (2025-12-27): Initial release with 9 critical patterns, 136 unit tests
