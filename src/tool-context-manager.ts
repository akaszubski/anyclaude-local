import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeFile } from "fs";
import { homedir } from "os";
import path from "path";
import { debug, isDebugEnabled } from "./debug";

/**
 * Recursively simplify a JSON schema by removing descriptions, examples,
 * and other non-structural metadata. Keeps type, properties, required,
 * items, enum, const, additionalProperties, and format.
 */
function simplifySchema(schema: any): any {
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
 * Stub descriptions for all Claude Code tools.
 * Schemas are kept intact — only the verbose description is replaced.
 */
const STUBS: Record<string, string> = {
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

// ─── Sub-skill definitions ───────────────────────────────────────────────
// Each sub-skill is a named slice of a monolithic tool description.
// They are extracted automatically from the captured full description
// and loaded on demand based on keyword triggers.

interface SubSkillDef {
  /** Sub-skill file name (without cc-sub- prefix and .md suffix) */
  id: string;
  /** Keywords that trigger this sub-skill injection */
  triggers: RegExp;
  /** Also inject when these tools were called in the previous turn */
  onToolCall?: string[];
}

/**
 * Sub-skill split rules: how to slice monolithic skills into sub-skills.
 * Each entry defines where to cut the original description and what triggers it.
 */
interface SplitRule {
  /** Tool name (matches cc-tool-{name}.md) */
  tool: string;
  /** Sub-skills to extract */
  subSkills: Array<{
    id: string;
    /** Regex to find the start of this section in the original description */
    startPattern: RegExp;
    /** Regex to find the end (exclusive) — next section start or EOF */
    endPattern?: RegExp;
    /** Keyword triggers for injection */
    triggers: RegExp;
    /** Inject when these tools were called */
    onToolCall?: string[];
  }>;
}

const SPLIT_RULES: SplitRule[] = [
  {
    tool: "Bash",
    subSkills: [
      {
        id: "Bash-core",
        startPattern: /^Executes a given bash command/,
        endPattern: /^# Committing changes with git/m,
        triggers:
          /\b(run|execute|command|bash|shell|npm|pip|install|build|test|docker|make)\b/,
        onToolCall: ["Bash"],
      },
      {
        id: "Bash-git-commit",
        startPattern: /^# Committing changes with git/m,
        endPattern: /^# Creating pull requests/m,
        triggers: /\b(commit|stage|amend|git add|git commit)\b/,
      },
      {
        id: "Bash-git-pr",
        startPattern: /^# Creating pull requests/m,
        endPattern: /^# Other common operations/m,
        triggers: /\b(pull request|pr|gh pr|create pr)\b/,
      },
      {
        id: "Bash-git-ops",
        startPattern: /^# Other common operations/m,
        endPattern: undefined, // to end of file
        triggers: /\b(gh api|github|issue|release|comment)\b/,
      },
    ],
  },
  {
    tool: "Task",
    subSkills: [
      // Note: Task-agents (the full agent list) is intentionally NOT a sub-skill.
      // At 5K+ chars it's too large, and the stub description already tells the
      // model what Task does. The agent list only matters when the model needs
      // to pick a specific agent type — which the schema's enum handles.
      {
        id: "Task-usage",
        startPattern: /^When NOT to use the Task tool:/m,
        endPattern: undefined,
        triggers: /\b(task|launch|spawn|parallel|background)\b/,
        onToolCall: ["Task"],
      },
    ],
  },
  {
    tool: "EnterPlanMode",
    subSkills: [
      {
        id: "EnterPlanMode-when",
        startPattern: /^Use this tool proactively/,
        endPattern: /^## Examples/m,
        triggers: /\b(plan|planning|design|architect|approach)\b/,
        onToolCall: ["EnterPlanMode"],
      },
    ],
  },
  {
    tool: "TaskCreate",
    subSkills: [
      {
        id: "TaskCreate-core",
        startPattern: /^Use this tool to create/,
        endPattern: /^## Tips/m,
        triggers: /\b(task|todo|checklist|track|progress)\b/,
        onToolCall: ["TaskCreate", "TaskUpdate", "TaskList"],
      },
    ],
  },
];

// ─── Flat sub-skill trigger index (built from SPLIT_RULES) ──────────────

interface SubSkillTrigger {
  id: string;
  triggers: RegExp;
  onToolCall?: string[];
}

const SUB_SKILL_TRIGGERS: SubSkillTrigger[] = [];
for (const rule of SPLIT_RULES) {
  for (const sub of rule.subSkills) {
    SUB_SKILL_TRIGGERS.push({
      id: sub.id,
      triggers: sub.triggers,
      onToolCall: sub.onToolCall,
    });
  }
}

// Tools that are small enough to inject whole (no splitting needed)
const SMALL_TOOL_TRIGGERS: Array<{
  tool: string;
  triggers: RegExp;
  onToolCall?: string[];
}> = [
  {
    tool: "Edit",
    triggers: /\b(edit|replace|modify|change|update|refactor)\b/,
    onToolCall: ["Edit"],
  },
  {
    tool: "Read",
    triggers: /\b(read|view|show|display|open|look at)\b/,
    onToolCall: ["Read"],
  },
  {
    tool: "Grep",
    triggers: /\b(grep|search|find|pattern|regex)\b/,
    onToolCall: ["Grep"],
  },
  {
    tool: "WebFetch",
    triggers: /\b(fetch|url|web|http|download)\b/,
    onToolCall: ["WebFetch"],
  },
  {
    tool: "Write",
    triggers: /\b(write|create file|new file)\b/,
    onToolCall: ["Write"],
  },
];

// ─── End sub-skill definitions ───────────────────────────────────────────

interface SkillMeta {
  hash: string;
  lastSeen: string;
  charCount: number;
  version: number;
}

interface MetaFile {
  [toolName: string]: SkillMeta;
}

export class ToolContextManager {
  private skillsDir: string;
  private meta: MetaFile;
  private metaPath: string;

  constructor(skillsDir?: string) {
    this.skillsDir =
      skillsDir || path.join(homedir(), ".anyclaude", "tool-skills");
    this.metaPath = path.join(this.skillsDir, "cc-tool-meta.json");
    this.ensureDir();
    this.meta = this.loadMeta();
  }

  private ensureDir(): void {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  private loadMeta(): MetaFile {
    try {
      if (existsSync(this.metaPath)) {
        return JSON.parse(readFileSync(this.metaPath, "utf8"));
      }
    } catch {
      // Corrupted meta file — start fresh
    }
    return {};
  }

  private saveMeta(): void {
    // Async write — meta is a cache, not critical path
    writeFile(this.metaPath, JSON.stringify(this.meta, null, 2), (err) => {
      if (err) debug(1, `[tool-context] Failed to save meta: ${err.message}`);
    });
  }

  private hashStr(text: string): string {
    return createHash("sha256").update(text).digest("hex").substring(0, 12);
  }

  private skillPath(name: string): string {
    return path.join(this.skillsDir, `cc-tool-${name}.md`);
  }

  private subSkillPath(id: string): string {
    return path.join(this.skillsDir, `cc-sub-${id}.md`);
  }

  /**
   * Split a monolithic tool description into sub-skills based on SPLIT_RULES.
   * Each sub-skill is saved as cc-sub-{id}.md
   */
  private splitIntoSubSkills(toolName: string, description: string): void {
    const rule = SPLIT_RULES.find((r) => r.tool === toolName);
    if (!rule) return;

    for (const sub of rule.subSkills) {
      const startMatch = description.match(sub.startPattern);
      if (!startMatch) continue;

      const startIdx = startMatch.index!;
      let endIdx = description.length;

      if (sub.endPattern) {
        const endMatch = description.substring(startIdx + 1).match(sub.endPattern);
        if (endMatch && endMatch.index !== undefined) {
          endIdx = startIdx + 1 + endMatch.index;
        }
      }

      const content = description.substring(startIdx, endIdx).trim();
      if (content.length > 0) {
        writeFile(this.subSkillPath(sub.id), content, (err) => {
          if (err) debug(1, `[tool-context] Failed to write sub-skill ${sub.id}: ${err.message}`);
        });
        if (isDebugEnabled()) {
          debug(
            1,
            `[tool-context] Split cc-sub-${sub.id}.md (${content.length} chars)`
          );
        }
      }
    }
  }

  captureAndUpdateSkills(
    tools: Array<{ name: string; description?: string | undefined }>
  ): void {
    let updated = 0;
    const now = new Date().toISOString();

    for (const tool of tools) {
      const desc = tool.description;
      if (!desc || desc.length < 50) continue;

      const toolHash = this.hashStr(desc);
      const existing = this.meta[tool.name];

      if (existing && existing.hash === toolHash) {
        existing.lastSeen = now;
        continue;
      }

      const version = (existing?.version || 0) + 1;
      const oldVersion = existing?.version || 0;

      // Save the full monolithic skill (for reference/fallback) — async, non-blocking
      writeFile(this.skillPath(tool.name), desc, (err) => {
        if (err) debug(1, `[tool-context] Failed to write skill ${tool.name}: ${err.message}`);
      });

      // Split into sub-skills if rules exist
      this.splitIntoSubSkills(tool.name, desc);

      this.meta[tool.name] = {
        hash: toolHash,
        lastSeen: now,
        charCount: desc.length,
        version,
      };
      updated++;

      if (isDebugEnabled()) {
        debug(
          1,
          `[tool-context] Updated cc-tool-${tool.name}.md (v${oldVersion}->v${version}, ${desc.length} chars)`
        );
      }
    }

    if (updated > 0) {
      this.saveMeta();
      if (isDebugEnabled()) {
        debug(1, `[tool-context] Captured ${updated} tool skill(s)`);
      }
    }
  }

  stubTools<
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

  /**
   * Get sub-skills to inject based on context.
   *
   * Instead of injecting entire monolithic tool descriptions (e.g. 10K Bash),
   * we inject only the relevant sub-skills (e.g. 1.5K Bash-git-commit).
   *
   * Selection logic:
   * 1. Check lastToolCalls — if the model just called Bash, inject Bash-core
   * 2. Check userMessage keywords — "commit" → Bash-git-commit, "PR" → Bash-git-pr
   * 3. For small tools (<1500 chars), inject the whole description
   * 4. Budget cap: total injection stays under 4K chars
   */
  getSkillsToInject(lastToolCalls: string[], userMessage: string): string {
    const toInject = new Map<string, string>(); // id → file path
    const lower = userMessage.toLowerCase();

    // 1. Check sub-skill triggers (keyword + tool call based)
    for (const trigger of SUB_SKILL_TRIGGERS) {
      const subPath = this.subSkillPath(trigger.id);
      if (!existsSync(subPath)) continue;

      // Match by keyword
      if (trigger.triggers.test(lower)) {
        toInject.set(trigger.id, subPath);
        continue;
      }

      // Match by previous tool call
      if (trigger.onToolCall) {
        for (const tc of lastToolCalls) {
          if (trigger.onToolCall.includes(tc)) {
            toInject.set(trigger.id, subPath);
            break;
          }
        }
      }
    }

    // 2. Check small tool triggers (inject whole description)
    for (const st of SMALL_TOOL_TRIGGERS) {
      const fullPath = this.skillPath(st.tool);
      if (!existsSync(fullPath)) continue;

      // Check size — only inject if small
      try {
        const content = readFileSync(fullPath, "utf8");
        if (content.length > 2000) continue; // too big for whole injection
      } catch {
        continue;
      }

      if (st.triggers.test(lower)) {
        toInject.set(st.tool, fullPath);
        continue;
      }

      if (st.onToolCall) {
        for (const tc of lastToolCalls) {
          if (st.onToolCall.includes(tc)) {
            toInject.set(st.tool, fullPath);
            break;
          }
        }
      }
    }

    if (toInject.size === 0) return "";

    // 3. Build injection with budget cap
    const CHAR_BUDGET = 5000;
    let charsUsed = 0;
    const sections: string[] = [];

    for (const [id, filePath] of toInject) {
      let content: string;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }

      const section = `[TOOL REFERENCE: ${id}]\n${content}\n[END TOOL REFERENCE]`;
      if (charsUsed + section.length > CHAR_BUDGET) {
        continue; // Skip this one, try remaining (smaller ones may fit)
      }
      sections.push(section);
      charsUsed += section.length;
    }

    if (sections.length > 0 && isDebugEnabled()) {
      const ids = Array.from(toInject.keys()).filter((id) =>
        sections.some((s) => s.includes(`TOOL REFERENCE: ${id}`))
      );
      debug(
        1,
        `[Tool Context] Injected ${sections.length} sub-skill(s) (${charsUsed} chars): ${ids.join(", ")}`
      );
    }

    return sections.join("\n\n");
  }
}

let instance: ToolContextManager | null = null;

export const getToolContextManager = (): ToolContextManager => {
  if (!instance) {
    instance = new ToolContextManager();
  }
  return instance;
};

export const extractLastToolCalls = (
  messages: Array<{ role: string; content: any }>
): string[] => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;

    const toolNames: string[] = [];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && block.type === "tool_use" && block.name) {
          toolNames.push(block.name);
        }
      }
    }
    if (toolNames.length > 0) return toolNames;
  }
  return [];
};
