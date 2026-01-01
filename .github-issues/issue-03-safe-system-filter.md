## Summary

Create the main filtering module that applies tiered optimization to system prompts with automatic fallback on validation failure.

## Background

Previous optimization attempts broke tool calling. This module implements a SAFE approach with validation gates that automatically fall back to less aggressive tiers if critical content would be removed.

## Requirements

### Optimization Tiers

| Tier       | Target Tokens | Strategy                       | Risk     |
| ---------- | ------------- | ------------------------------ | -------- |
| MINIMAL    | 12-15k        | Remove duplicates only         | Very Low |
| MODERATE   | 8-10k         | Dedupe + condense examples     | Low      |
| AGGRESSIVE | 4-6k          | Hierarchical tools + summaries | Medium   |
| EXTREME    | 2-3k          | Core only + tool schemas       | High     |

### Core Algorithm

1. Parse prompt into sections
2. Filter by tier (but ALWAYS include containsCritical sections)
3. Rebuild prompt from filtered sections
4. VALIDATION GATE - Critical safety check
5. Automatic fallback if validation fails

### Key Safety Feature

If validateCriticalPresence() fails, automatically fall back to the previous (less aggressive) tier. This ensures tool calling is NEVER broken.

### Interfaces

- OptimizationTier enum: MINIMAL, MODERATE, AGGRESSIVE, EXTREME
- FilterOptions: modelCapability, preserveExamples
- FilterResult: filteredPrompt, preservedSections, removedSections, stats, validation
- FilterStats: originalTokens, filteredTokens, reductionPercent, processingTimeMs

## File Location

src/safe-system-filter.ts

## Dependencies

- src/critical-sections.ts
- src/prompt-section-parser.ts
- src/prompt-templates.ts (existing deduplication)

## Acceptance Criteria

- [ ] All 4 tiers implemented with distinct behaviors
- [ ] Validation gate ALWAYS runs before returning
- [ ] Automatic fallback on validation failure
- [ ] Critical sections preserved in ALL tiers (even EXTREME)
- [ ] Stats include token counts and reduction percentage
- [ ] Integration tests verify tool calling works after filtering
- [ ] No regression in existing functionality

## Labels

phase-1, prompt-optimization, critical
