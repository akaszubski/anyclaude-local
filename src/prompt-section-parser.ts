/**
 * Prompt Section Parser
 *
 * Parses Claude Code system prompts into sections for intelligent truncation
 * and optimization. Supports:
 * - Markdown header parsing (#, ##, ###)
 * - Tier-based importance classification (0-3)
 * - Critical section detection (tool schemas, function calling)
 * - Prompt reconstruction from sections
 *
 * Usage:
 * ```typescript
 * import { parseIntoSections, getSectionsByTier, reconstructPrompt } from './prompt-section-parser';
 *
 * const sections = parseIntoSections(prompt);
 * const important = getSectionsByTier(sections, 1); // Tiers 0-1
 * const optimized = reconstructPrompt(important);
 * ```
 */

import { detectCriticalSections } from "./critical-sections";

/**
 * A parsed section of a system prompt
 */
export interface PromptSection {
  /** Kebab-case ID derived from header (e.g., "tool-usage-policy") */
  id: string;

  /** Original markdown header (e.g., "# Tool Usage Policy") */
  header: string;

  /** Section content (excluding header) */
  content: string;

  /** Importance tier (0 = most important, 3 = least) */
  tier: 0 | 1 | 2 | 3;

  /** First line of section (header line) */
  startLine: number;

  /** Last line of section */
  endLine: number;

  /** True if section contains critical patterns (tool schemas, etc.) */
  containsCritical: boolean;
}

/**
 * Regular expressions for tier classification
 */
const TIER_PATTERNS = {
  0: [
    /tool.*usage.*policy/i,
    /function.*calling/i,
    /tool.*schema/i,
    /available.*tools/i,
  ],
  1: [/core.*identity/i, /tone/i, /doing.*tasks/i, /task.*management/i],
  2: [/planning/i, /git.*workflow/i, /asking.*questions/i],
  3: [/example/i, /verbose/i],
};

/**
 * Parse a system prompt into sections based on markdown headers.
 *
 * Handles:
 * - Content before first header (preamble section with id="preamble")
 * - All header levels (#, ##, ###)
 * - Empty sections
 * - Line number tracking
 * - Critical section detection
 *
 * @param prompt - System prompt to parse
 * @returns Array of parsed sections with metadata
 *
 * @example
 * ```typescript
 * const prompt = `# Tool Usage Policy
 *
 * Use JSON format.
 *
 * # Core Identity
 *
 * You are Claude Code.`;
 *
 * const sections = parseIntoSections(prompt);
 * // Returns [
 * //   { id: "tool-usage-policy", tier: 0, containsCritical: true, ... },
 * //   { id: "core-identity", tier: 1, containsCritical: false, ... }
 * // ]
 * ```
 */
export function parseIntoSections(prompt: string): PromptSection[] {
  // Handle empty/whitespace prompts
  if (!prompt || prompt.trim().length === 0) {
    return [];
  }

  const lines = prompt.split("\n");
  const sections: PromptSection[] = [];

  // Find all header lines (skip headers inside code blocks)
  const headerIndices: Array<{ index: number; header: string }> = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip undefined lines

    // Track code block boundaries (```)
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Match markdown headers only outside code blocks: #, ##, ###, etc.
    if (!inCodeBlock && /^#{1,6}\s+.+/.test(line)) {
      headerIndices.push({ index: i, header: line });
    }
  }

  // Handle content before first header (preamble)
  if (
    headerIndices.length > 0 &&
    headerIndices[0] &&
    headerIndices[0].index > 0
  ) {
    const preambleContent = lines.slice(0, headerIndices[0].index).join("\n");
    if (preambleContent.trim().length > 0) {
      const preambleSection: PromptSection = {
        id: "preamble",
        header: "",
        content: preambleContent,
        tier: 1, // Preambles usually contain identity info
        startLine: 0,
        endLine: headerIndices[0].index - 1,
        containsCritical: false,
      };

      // Check if preamble contains critical patterns
      const criticalMatches = detectCriticalSections(preambleContent);
      preambleSection.containsCritical = criticalMatches.length > 0;

      // Force tier 0 only if contains tool-calling critical sections
      const toolCriticalNames = [
        "tool-usage-policy-header",
        "function-calls-instruction",
        "function-calls-tags",
        "invoke-tag",
      ];
      const hasToolCritical = criticalMatches.some((match) =>
        toolCriticalNames.includes(match.section.name)
      );

      if (hasToolCritical) {
        preambleSection.tier = 0;
      }

      sections.push(preambleSection);
    }
  }

  // Parse each section
  for (let i = 0; i < headerIndices.length; i++) {
    const headerInfo = headerIndices[i];
    if (!headerInfo) continue;

    const { index: startLine, header } = headerInfo;
    const nextHeader = headerIndices[i + 1];
    const nextHeaderIndex = nextHeader ? nextHeader.index : lines.length;

    // Extract content (everything between this header and next header)
    const contentLines = lines.slice(startLine + 1, nextHeaderIndex);
    const content = contentLines.join("\n");

    // Generate ID from header (kebab-case)
    const id = generateId(header);

    // Classify tier
    let tier = classifySection(header);

    // Check for critical patterns in content
    const fullSectionText = header + "\n" + content;
    const criticalMatches = detectCriticalSections(fullSectionText);
    const containsCritical = criticalMatches.length > 0;

    // Force tier 0 only if contains tool-calling critical sections
    // (not just header markers like "# Doing tasks")
    const toolCriticalNames = [
      "tool-usage-policy-header",
      "function-calls-instruction",
      "function-calls-tags",
      "invoke-tag",
    ];
    const hasToolCritical = criticalMatches.some((match) =>
      toolCriticalNames.includes(match.section.name)
    );

    if (hasToolCritical) {
      tier = 0;
    }

    sections.push({
      id,
      header,
      content,
      tier,
      startLine,
      endLine: nextHeaderIndex - 1,
      containsCritical,
    });
  }

  return sections;
}

/**
 * Classify a section header into an importance tier.
 *
 * Tier definitions:
 * - Tier 0: Tool usage, function calling, tool schemas (critical for functionality)
 * - Tier 1: Core identity, tone, task execution (important for behavior)
 * - Tier 2: Planning, git workflow, asking questions (helpful but optional)
 * - Tier 3: Examples, verbose content (can be removed)
 *
 * @param header - Markdown header to classify
 * @returns Importance tier (0-3)
 *
 * @example
 * ```typescript
 * classifySection("# Tool Usage Policy"); // Returns 0
 * classifySection("# Core Identity");     // Returns 1
 * classifySection("# Planning");          // Returns 2
 * classifySection("# Examples");          // Returns 3
 * ```
 */
export function classifySection(header: string): 0 | 1 | 2 | 3 {
  // Check each tier in order (0 is highest priority)
  for (const [tierStr, patterns] of Object.entries(TIER_PATTERNS)) {
    const tier = parseInt(tierStr) as 0 | 1 | 2 | 3;
    for (const pattern of patterns) {
      if (pattern.test(header)) {
        return tier;
      }
    }
  }

  // Default to tier 3 (lowest priority)
  return 3;
}

/**
 * Filter sections by maximum tier (inclusive).
 *
 * Returns all sections with tier <= maxTier. Useful for creating
 * optimized prompts by keeping only important sections.
 *
 * @param sections - Sections to filter
 * @param maxTier - Maximum tier to include (0-3)
 * @returns Filtered sections
 *
 * @example
 * ```typescript
 * const sections = parseIntoSections(prompt);
 * const critical = getSectionsByTier(sections, 0); // Only tier 0
 * const important = getSectionsByTier(sections, 1); // Tiers 0-1
 * ```
 */
export function getSectionsByTier(
  sections: PromptSection[],
  maxTier: number
): PromptSection[] {
  return sections.filter((section) => section.tier <= maxTier);
}

/**
 * Reconstruct a prompt from sections.
 *
 * Preserves:
 * - Markdown headers
 * - Content formatting
 * - Section order
 * - Whitespace between sections
 *
 * @param sections - Sections to reconstruct
 * @returns Reconstructed prompt
 *
 * @example
 * ```typescript
 * const sections = parseIntoSections(original);
 * const filtered = getSectionsByTier(sections, 1);
 * const optimized = reconstructPrompt(filtered);
 * ```
 */
export function reconstructPrompt(sections: PromptSection[]): string {
  if (sections.length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    // Handle preamble section (no header)
    if (section.id === "preamble") {
      parts.push(section.content);
    } else {
      // Regular section: header + content
      parts.push(section.header);
      if (section.content.length > 0) {
        parts.push(section.content);
      }
    }
  }

  // Join parts with single newline (content already has trailing newlines)
  return parts.join("\n");
}

/**
 * Generate a kebab-case ID from a markdown header.
 *
 * Rules:
 * - Remove # symbols
 * - Convert to lowercase
 * - Replace spaces with hyphens
 * - Remove special characters
 *
 * @param header - Markdown header
 * @returns Kebab-case ID
 *
 * @example
 * ```typescript
 * generateId("# Tool Usage Policy");  // "tool-usage-policy"
 * generateId("## Core Identity");     // "core-identity"
 * generateId("### Git Workflow!");    // "git-workflow"
 * ```
 */
function generateId(header: string): string {
  return header
    .replace(/^#+\s*/, "") // Remove leading # symbols
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars (keep spaces and hyphens)
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}
