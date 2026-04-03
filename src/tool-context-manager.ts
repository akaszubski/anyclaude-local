/**
 * Tool Context Manager - Simplified
 *
 * Provides two standalone utilities for reducing tool token overhead:
 *   - simplifySchema: strips non-structural JSON schema metadata
 *   - stubTools: replaces verbose tool descriptions with short stubs
 */

/**
 * Stub descriptions for all Claude Code tools.
 * Only the verbose description is replaced; schemas are preserved (and simplified).
 */
export const STUBS: Record<string, string> = {
  Bash: "Executes bash commands with optional timeout.",
  Read: "Reads a file by path with optional offset/limit.",
  Write: "Writes content to a file path.",
  Edit: "Replaces old_string with new_string in a file.",
  Glob: "Finds files matching a glob pattern.",
  Grep: "Searches for regex pattern in files.",
  Task: "Launches a subagent for complex tasks.",
  TodoWrite: "Creates and manages a task list.",
  ExitPlanMode: "Exits plan mode for user approval.",
  NotebookEdit: "Edits Jupyter notebook cells.",
  WebFetch: "Fetches and processes content from a URL.",
  WebSearch: "Searches the web for information.",
  BashOutput: "Gets output from a background shell.",
  KillShell: "Stops a running background shell.",
  Skill: "Executes a named skill in the conversation.",
  SlashCommand: "Executes a slash command.",
  TaskCreate: "Creates a task in the task list.",
  TaskUpdate: "Updates a task status or details.",
  TaskGet: "Retrieves a task by ID.",
  TaskList: "Lists all tasks.",
  TaskOutput: "Gets output from a background task.",
  TaskStop: "Stops a running background task.",
  AskUserQuestion: "Asks the user a question during execution.",
  EnterPlanMode: "Transitions into plan mode for planning.",
};

/**
 * Recursively simplify a JSON schema by removing descriptions, examples,
 * and other non-structural metadata. Keeps type, properties, required,
 * items, enum, const, additionalProperties, and format.
 *
 * @param schema - JSON schema object to simplify
 * @returns Simplified schema with only structural fields retained
 */
export function simplifySchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(simplifySchema);

  const keep = [
    "type",
    "properties",
    "required",
    "items",
    "enum",
    "const",
    "additionalProperties",
    "anyOf",
    "oneOf",
    "allOf",
    "format",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "default",
    "propertyNames",
    "$schema",
  ];
  const result: any = {};
  for (const key of keep) {
    if (key in schema) {
      if (key === "properties" && typeof schema[key] === "object") {
        result[key] = {};
        for (const [prop, val] of Object.entries(schema[key])) {
          result[key][prop] = simplifySchema(val);
        }
      } else if (
        ["items", "additionalProperties", "propertyNames"].includes(key) &&
        typeof schema[key] === "object"
      ) {
        result[key] = simplifySchema(schema[key]);
      } else if (
        ["anyOf", "oneOf", "allOf"].includes(key) &&
        Array.isArray(schema[key])
      ) {
        result[key] = schema[key].map(simplifySchema);
      } else {
        result[key] = schema[key];
      }
    }
  }
  return result;
}

/**
 * Replace tool descriptions with short stubs and simplify their JSON schemas.
 *
 * Reduces tool description tokens from ~15K to ~2-4K while keeping schemas
 * structurally intact for correct function-calling.
 *
 * @param tools - Array of tool objects with name, description, and input_schema fields
 * @returns New array with descriptions replaced by stubs and schemas simplified
 */
export function stubTools<
  T extends {
    name: string;
    description?: string | undefined;
    input_schema?: any;
  },
>(tools: T[]): T[] {
  return tools.map((tool) => {
    const stub = STUBS[tool.name];
    const stubbed =
      stub && tool.description && tool.description.length > stub.length
        ? { ...tool, description: stub }
        : { ...tool };

    // Simplify schemas: strip nested descriptions/examples to reduce token count
    if (stubbed.input_schema) {
      stubbed.input_schema = simplifySchema(stubbed.input_schema);
    }
    return stubbed;
  });
}
