/**
 * Tool Injection Validator (Issue #35)
 *
 * Security validation for tool instruction injection to prevent:
 * 1. Privilege escalation (e.g., Read → Write)
 * 2. Path traversal (../)
 * 3. Command injection (&&, ;, |)
 * 4. Parameter tampering
 *
 * Strategy: Plan-then-execute pattern with validation gates
 * - Validate tool calls before execution
 * - Block suspicious parameter patterns
 * - Log security events for audit
 */

import { debug } from "./debug";

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

/**
 * Tool privilege levels (from lowest to highest)
 */
const TOOL_PRIVILEGE_LEVELS: Record<string, number> = {
  // Read-only (level 0)
  Read: 0,
  Glob: 0,
  Grep: 0,
  WebSearch: 0,
  WebFetch: 0,

  // Informational (level 1)
  AskUser: 1,
  TodoWrite: 1,

  // Safe execution (level 2)
  TaskOutput: 2,
  Task: 2,
  ExecuteSkill: 2,

  // Modification (level 3)
  Edit: 3,
  NotebookEdit: 3,

  // Creation (level 4)
  Write: 4,

  // Execution (level 5 - highest risk)
  Bash: 5,
  KillShell: 5,
  SlashCommand: 5,
};

/**
 * Tool action mappings (what each tool does)
 */
const TOOL_ACTIONS: Record<string, string> = {
  Read: "read",
  Write: "write",
  Edit: "modify",
  Glob: "list",
  Grep: "search",
  Bash: "execute",
  TaskOutput: "check",
  KillShell: "kill",
  WebSearch: "search",
  WebFetch: "fetch",
  AskUser: "ask",
  TodoWrite: "track",
  Task: "delegate",
  ExecuteSkill: "run",
  SlashCommand: "execute",
  NotebookEdit: "edit",
};

/**
 * Detect privilege escalation
 *
 * @param detectedTool - Tool detected from user intent
 * @param requestedAction - Action requested in user message
 * @returns true if privilege escalation detected
 */
export function detectPrivilegeEscalation(
  detectedTool: string,
  requestedAction: string
): boolean {
  const detectedLevel = TOOL_PRIVILEGE_LEVELS[detectedTool];
  const detectedAction = TOOL_ACTIONS[detectedTool];

  if (detectedLevel === undefined || !detectedAction) {
    // Unknown tool, can't validate
    return false;
  }

  // Check for contradictory actions
  // e.g., "read" intent but "write" action mentioned
  const actionLower = requestedAction.toLowerCase();

  const escalationPatterns: Array<{ fromAction: string; toActions: string[] }> =
    [
      {
        fromAction: "read",
        toActions: [
          "write",
          "create",
          "modify",
          "edit",
          "delete",
          "execute",
          "run",
        ],
      },
      {
        fromAction: "list",
        toActions: [
          "write",
          "create",
          "modify",
          "edit",
          "delete",
          "execute",
          "run",
        ],
      },
      {
        fromAction: "search",
        toActions: [
          "write",
          "create",
          "modify",
          "edit",
          "delete",
          "execute",
          "run",
        ],
      },
    ];

  for (const pattern of escalationPatterns) {
    if (detectedAction === pattern.fromAction) {
      for (const toAction of pattern.toActions) {
        if (actionLower.includes(toAction)) {
          debug(
            1,
            `[Security] Privilege escalation detected: ${detectedTool} (${detectedAction}) → ${toAction}`
          );
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Detect path traversal attempts
 *
 * @param params - Tool call parameters
 * @returns true if path traversal detected
 */
export function detectPathTraversal(params: Record<string, any>): boolean {
  const pathParams = ["file_path", "path", "directory", "dir"];

  for (const paramName of pathParams) {
    const value = params[paramName];
    if (typeof value === "string") {
      // Check for common path traversal patterns
      const traversalPatterns = [
        /\.\.\//g, // ../
        /\.\.\\/g, // ..\
        /%2e%2e%2f/gi, // URL-encoded ../
        /%2e%2e%5c/gi, // URL-encoded ..\
        /\.\.%2f/gi, // Mixed encoding
        /\.\.%5c/gi, // Mixed encoding
      ];

      for (const pattern of traversalPatterns) {
        if (pattern.test(value)) {
          debug(
            1,
            `[Security] Path traversal detected in ${paramName}: ${value}`
          );
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Detect command injection attempts
 *
 * @param params - Tool call parameters
 * @returns true if command injection detected
 */
export function detectCommandInjection(params: Record<string, any>): boolean {
  const commandParams = ["command", "cmd", "script", "code"];

  for (const paramName of commandParams) {
    const value = params[paramName];
    if (typeof value === "string") {
      // Check for common command injection patterns
      const injectionPatterns = [
        /&&/g, // Command chaining
        /;\s*[a-z]/gi, // Semicolon command separator
        /\|\s*[a-z]/gi, // Pipe to another command
        /`/g, // Backticks for command substitution
        /\$\(/g, // $() command substitution
        /%0a/gi, // URL-encoded newline
        /%0d/gi, // URL-encoded carriage return
      ];

      for (const pattern of injectionPatterns) {
        if (pattern.test(value)) {
          // Allow legitimate multi-command usage in Bash tool
          if (
            paramName === "command" &&
            (params.toolName === "Bash" || !params.toolName)
          ) {
            // Bash tool is allowed to use command chaining
            continue;
          }

          debug(
            1,
            `[Security] Command injection detected in ${paramName}: ${value}`
          );
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Validate tool call parameters
 *
 * @param toolName - Name of the tool being called
 * @param params - Tool call parameters
 * @param userMessage - Original user message (for context)
 * @returns Validation result
 */
export function validateToolCall(
  toolName: string,
  params: Record<string, any>,
  userMessage: string
): ValidationResult {
  // 1. Check privilege escalation
  if (detectPrivilegeEscalation(toolName, userMessage)) {
    return {
      valid: false,
      reason: "Privilege escalation detected",
      severity: "high",
    };
  }

  // 2. Check path traversal
  if (detectPathTraversal(params)) {
    return {
      valid: false,
      reason: "Path traversal attempt detected",
      severity: "high",
    };
  }

  // 3. Check command injection (only for non-Bash tools)
  if (toolName !== "Bash" && detectCommandInjection(params)) {
    return {
      valid: false,
      reason: "Command injection attempt detected",
      severity: "critical",
    };
  }

  // 4. Validate required parameters exist
  const requiredParams = getRequiredParams(toolName);
  for (const required of requiredParams) {
    if (!params[required]) {
      return {
        valid: false,
        reason: `Missing required parameter: ${required}`,
        severity: "low",
      };
    }
  }

  // All checks passed
  return {
    valid: true,
  };
}

/**
 * Get required parameters for a tool
 *
 * @param toolName - Name of the tool
 * @returns Array of required parameter names
 */
function getRequiredParams(toolName: string): string[] {
  const requiredByTool: Record<string, string[]> = {
    Read: ["file_path"],
    Write: ["file_path", "content"],
    Edit: ["file_path", "old_string", "new_string"],
    Glob: ["pattern"],
    Grep: ["pattern"],
    Bash: ["command"],
    TaskOutput: ["bash_id"],
    KillShell: ["shell_id"],
    WebSearch: ["query"],
    WebFetch: ["url", "prompt"],
    AskUser: ["question", "options", "multiSelect"],
    TodoWrite: ["todos"],
    Task: ["agent", "prompt"],
    ExecuteSkill: ["skill"],
    SlashCommand: ["command"],
    NotebookEdit: ["file_path", "cell_index", "new_content"],
  };

  return requiredByTool[toolName] || [];
}

/**
 * Validate injection configuration
 *
 * @param config - Injection configuration object
 * @returns Validation result
 */
export function validateInjectionConfig(config: any): ValidationResult {
  // Check required fields
  if (typeof config.enabled !== "boolean") {
    return {
      valid: false,
      reason: "config.enabled must be a boolean",
      severity: "medium",
    };
  }

  if (config.style && !["explicit", "subtle"].includes(config.style)) {
    return {
      valid: false,
      reason: "config.style must be 'explicit' or 'subtle'",
      severity: "medium",
    };
  }

  if (
    typeof config.threshold === "number" &&
    (config.threshold < 0 || config.threshold > 1)
  ) {
    return {
      valid: false,
      reason: "config.threshold must be between 0 and 1",
      severity: "medium",
    };
  }

  if (
    typeof config.maxInjectionsPerConversation === "number" &&
    config.maxInjectionsPerConversation < 0
  ) {
    return {
      valid: false,
      reason: "config.maxInjectionsPerConversation must be non-negative",
      severity: "medium",
    };
  }

  return {
    valid: true,
  };
}
