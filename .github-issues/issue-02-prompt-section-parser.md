## Summary

Create a parser that breaks Claude Code's system prompt into classified sections for tiered optimization.

## Background

Claude Code's system prompt is ~12-20k tokens. To safely optimize it, we need to parse it into sections and classify each by importance tier.

## Requirements

### Section Tiers

- Tier 0: NEVER REMOVE - Tool calling format, schemas, critical instructions
- Tier 1: HIGH PRIORITY - Tone, doing tasks, task management
- Tier 2: MEDIUM PRIORITY - Planning, git workflow, asking questions
- Tier 3: LOW PRIORITY - Extended examples, verbose explanations

### Data Structures

PromptSection interface:

- id: string
- header: string
- content: string
- tier: 0 | 1 | 2 | 3
- startLine: number
- endLine: number
- containsCritical: boolean (from critical-sections.ts)

### Functions to Implement

1. parseIntoSections(prompt: string): PromptSection[] - Parse prompt into sections
2. classifySection(header: string): 0 | 1 | 2 | 3 - Determine tier from header
3. getSectionsByTier(sections: PromptSection[], maxTier: number): PromptSection[] - Filter by tier

### Classification Rules

- Tier 0: "tool usage policy", "function calls", "You are Claude Code"
- Tier 1: "tone", "doing tasks", "task management", "code references"
- Tier 2: "planning", "asking questions", "git"
- Tier 3: Everything else (default)

## File Location

src/prompt-section-parser.ts

## Dependencies

- src/critical-sections.ts (uses containsCriticalContent)

## Acceptance Criteria

- [ ] Correctly parses markdown headers (# and ##)
- [ ] Assigns correct tier to known sections
- [ ] Marks sections containing critical patterns as containsCritical: true
- [ ] Preserves original line numbers for debugging
- [ ] Handles edge cases (no headers, empty sections)
- [ ] Unit tests with real Claude Code prompt samples

## Labels

phase-1, prompt-optimization
