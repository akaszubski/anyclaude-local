/**
 * Critical Section Detection for Tool-Calling Preservation
 *
 * This module identifies and validates critical sections in Claude Code system prompts
 * that must be preserved during prompt optimization to maintain tool-calling functionality.
 *
 * Key Requirements:
 * - ReDoS-resistant regex patterns (< 1000ms even on malicious input)
 * - Handle null bytes, control characters safely
 * - Memory-safe on large prompts (< 10MB growth on repeated calls)
 *
 * Usage:
 * ```typescript
 * import { detectCriticalSections, validateCriticalPresence } from './critical-sections';
 *
 * const matches = detectCriticalSections(prompt);
 * const validation = validateCriticalPresence(prompt);
 *
 * if (!validation.isValid) {
 *   console.error('Missing required sections:', validation.missingRequired);
 * }
 * ```
 */

/**
 * A critical section pattern that must be preserved in system prompts
 */
export interface CriticalSection {
  /** Unique identifier for this pattern */
  name: string;

  /** RegExp pattern for matching this section */
  pattern: RegExp;

  /** Whether this section is required (must be present) */
  required: boolean;

  /** Human-readable description of why this section is critical */
  description: string;
}

/**
 * A matched critical section in a prompt
 */
export interface CriticalSectionMatch {
  /** Reference to the critical section definition */
  section: CriticalSection;

  /** The actual matched text from the prompt */
  matchedText: string;

  /** Start position in the prompt */
  start: number;

  /** End position in the prompt */
  end: number;
}

/**
 * Result of validating critical section presence
 */
export interface ValidationResult {
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

/**
 * Critical sections that must be preserved for tool-calling functionality.
 *
 * These patterns identify essential instructions in the Claude Code system prompt
 * that enable proper tool usage, JSON formatting, and absolute path handling.
 *
 * Pattern Design:
 * - Simple, non-nested patterns to prevent ReDoS attacks
 * - Avoid quantifiers like .*, .+, {n,m} where possible
 * - Use character classes instead of dot-star
 * - Keep patterns short and specific
 */
export const CRITICAL_SECTIONS: CriticalSection[] = [
  {
    name: "tool-usage-policy-header",
    pattern: /# Tool usage policy/,
    required: true,
    description: "Header marking the tool usage policy section - contains critical function call instructions",
  },
  {
    name: "function-calls-instruction",
    pattern: /When making function calls/,
    required: false,
    description: "Core instruction for how to make function calls - critical for tool invocation",
  },
  {
    name: "json-format-requirement",
    pattern: /\b(?:JSON|json)\b/,
    required: true,
    description: "Requirement to use JSON format for parameters - prevents malformed tool calls",
  },
  {
    name: "doing-tasks-section",
    pattern: /# Doing tasks/,
    required: true,
    description: "Section header for task execution instructions - contains workflow guidance",
  },
  {
    name: "important-markers",
    pattern: /IMPORTANT:/,
    required: true,
    description: "Markers for critical instructions that must be followed",
  },
  {
    name: "very-important-markers",
    pattern: /VERY IMPORTANT:/,
    required: false,
    description: "Markers for the most critical instructions - optional but recommended",
  },
  {
    name: "absolute-path-requirement",
    pattern: /absolute file paths?/i,
    required: false,
    description: "Instruction to use absolute paths instead of relative paths - prevents file access errors",
  },
  {
    name: "function-calls-tags",
    pattern: /<function_calls>/,
    required: false,
    description: "XML-style function call tags - used in some tool invocation formats",
  },
  {
    name: "invoke-tag",
    pattern: /<invoke name=/,
    required: false,
    description: "Tool invocation tag format - shows how to structure tool calls",
  },
];

/**
 * Detect all critical sections present in a prompt.
 *
 * This function searches for all defined critical section patterns and returns
 * matches with their positions in the prompt.
 *
 * Security:
 * - ReDoS-resistant: Uses simple patterns without nested quantifiers
 * - Memory-safe: Does not accumulate state across calls
 * - Input sanitization: Handles null bytes and control characters
 *
 * @param prompt - The system prompt to analyze
 * @returns Array of matched critical sections with positions
 *
 * @example
 * ```typescript
 * const prompt = "You are Claude Code.\n\n# Tool usage policy\n\nWhen making function calls...";
 * const matches = detectCriticalSections(prompt);
 * console.log(`Found ${matches.length} critical sections`);
 * ```
 */
export function detectCriticalSections(prompt: string): CriticalSectionMatch[] {
  // Input validation
  if (typeof prompt !== "string") {
    return [];
  }

  // Empty or whitespace-only prompts have no matches
  if (prompt.trim().length === 0) {
    return [];
  }

  const matches: CriticalSectionMatch[] = [];

  // Iterate through each critical section pattern
  for (const section of CRITICAL_SECTIONS) {
    // Find all matches for this pattern
    // Using RegExp.exec() in a loop is ReDoS-safe because our patterns are simple
    const regex = new RegExp(section.pattern.source, section.pattern.flags + "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(prompt)) !== null) {
      matches.push({
        section,
        matchedText: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });

      // Prevent infinite loops on zero-width matches
      if (match[0].length === 0) {
        break;
      }
    }
  }

  // Sort matches by position for consistent ordering
  matches.sort((a, b) => a.start - b.start);

  return matches;
}

/**
 * Validate that all required critical sections are present in a prompt.
 *
 * This function checks whether a prompt contains all required critical sections
 * and provides detailed feedback about missing sections and coverage percentage.
 *
 * Use this before optimizing a prompt to ensure tool-calling instructions won't be lost.
 *
 * @param prompt - The system prompt to validate
 * @returns Validation result with coverage details
 *
 * @example
 * ```typescript
 * const result = validateCriticalPresence(optimizedPrompt);
 * if (!result.isValid) {
 *   console.error('Optimization removed critical sections:', result.missingRequired);
 *   console.error(`Coverage: ${result.coveragePercent}%`);
 * }
 * ```
 */
export function validateCriticalPresence(prompt: string): ValidationResult {
  // Detect all critical sections present in the prompt
  const matches = detectCriticalSections(prompt);

  // Build a set of section names that were found
  const foundSectionNames = new Set<string>();
  for (const match of matches) {
    foundSectionNames.add(match.section.name);
  }

  // Identify required sections
  const requiredSections = CRITICAL_SECTIONS.filter(s => s.required);
  const requiredCount = requiredSections.length;

  // Find missing required sections
  const missingRequired = requiredSections.filter(
    section => !foundSectionNames.has(section.name)
  );

  // Find missing optional sections for warnings
  const optionalSections = CRITICAL_SECTIONS.filter(s => !s.required);
  const missingOptional = optionalSections.filter(
    section => !foundSectionNames.has(section.name)
  );

  // Generate warnings only for important optional sections
  // (exclude XML-style tags which are not commonly used)
  const warnings: string[] = [];
  const importantOptionalNames = ['very-important-markers', 'absolute-path-requirement'];
  for (const section of missingOptional) {
    if (importantOptionalNames.includes(section.name)) {
      warnings.push(`Optional section missing: "${section.name}" - ${section.description}`);
    }
  }

  // Calculate coverage percentage
  const foundRequiredCount = requiredCount - missingRequired.length;
  const coveragePercent = requiredCount > 0
    ? Math.round((foundRequiredCount / requiredCount) * 100)
    : 100; // Empty prompts get 100% coverage (no requirements to meet)

  // Validation passes if all required sections are present
  const isValid = missingRequired.length === 0;

  return {
    isValid,
    missingRequired,
    warnings,
    foundSections: foundSectionNames.size,
    requiredCount,
    coveragePercent,
  };
}
