## Summary

Create a module that detects critical patterns in Claude Code's system prompt that must NEVER be removed during optimization.

## Background

The previous smart-system-prompt.ts broke tool calling by removing critical instructions. This module provides pattern detection to ensure those sections are always preserved.

## Requirements

### Critical Patterns to Detect

- Tool calling format: "When making function calls", "function_calls", "antml:function_calls", "antml:invoke", "antml:parameter"
- JSON formatting: "JSON format", "valid JSON", "String and scalar parameters should be specified as is"
- Tool schemas: "Here are the functions available", "JSONSchema format"
- Path requirements: "absolute path", "file_path parameter"
- Multi-tool calling: "call multiple tools in a single response"

### Functions to Implement

1. containsCriticalContent(text: string): boolean - Check if text contains any critical pattern
2. validateCriticalPresence(prompt: string): ValidationResult - Validate all required sections present
3. getCriticalPatternMatches(text: string): CriticalMatch[] - Return all matched patterns with locations

### ValidationResult Interface

- valid: boolean
- criticalSectionsPresent: string[]
- criticalSectionsMissing: string[]
- warnings: string[]

## File Location

src/critical-sections.ts

## Acceptance Criteria

- [ ] All critical patterns defined as constants
- [ ] containsCriticalContent() returns true for any critical pattern
- [ ] validateCriticalPresence() checks for ALL required patterns
- [ ] Returns detailed validation result with what's missing
- [ ] Unit tests cover all patterns
- [ ] TypeScript strict mode compatible

## Labels

phase-1, prompt-optimization
