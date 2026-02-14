import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { debug, isDebugEnabled } from "./debug";

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
    writeFileSync(this.metaPath, JSON.stringify(this.meta, null, 2));
  }

  private hashStr(text: string): string {
    return createHash("sha256").update(text).digest("hex").substring(0, 12);
  }

  private skillPath(toolName: string): string {
    return path.join(this.skillsDir, `cc-tool-${toolName}.md`);
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

      writeFileSync(this.skillPath(tool.name), desc);
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

  stubTools<T extends { name: string; description?: string | undefined }>(
    tools: T[]
  ): T[] {
    return tools.map((tool) => {
      const stub = STUBS[tool.name];
      if (stub && tool.description && tool.description.length > stub.length) {
        return { ...tool, description: stub };
      }
      return tool;
    });
  }

  getSkillsToInject(lastToolCalls: string[], userMessage: string): string {
    const skillsToLoad = new Set<string>();

    for (const toolName of lastToolCalls) {
      if (this.hasSkill(toolName)) {
        skillsToLoad.add(toolName);
      }
    }

    const lower = userMessage.toLowerCase();
    if (
      /\b(commit|push|pull|merge|rebase|branch|pr|cherry.?pick|git)\b/.test(
        lower
      )
    ) {
      if (this.hasSkill("Bash")) skillsToLoad.add("Bash");
    }
    if (/\b(plan|planning|design|architect)\b/.test(lower)) {
      if (this.hasSkill("ExitPlanMode")) skillsToLoad.add("ExitPlanMode");
      if (this.hasSkill("EnterPlanMode")) skillsToLoad.add("EnterPlanMode");
    }
    if (/\b(task|todo|checklist)\b/.test(lower)) {
      if (this.hasSkill("TodoWrite")) skillsToLoad.add("TodoWrite");
      if (this.hasSkill("TaskCreate")) skillsToLoad.add("TaskCreate");
    }
    if (/\b(search|find|look\s?up|web)\b/.test(lower)) {
      if (this.hasSkill("WebSearch")) skillsToLoad.add("WebSearch");
      if (this.hasSkill("WebFetch")) skillsToLoad.add("WebFetch");
    }

    const skillNames = Array.from(skillsToLoad).slice(0, 3);
    if (skillNames.length === 0) return "";

    const sections = skillNames
      .map((name) => {
        const content = this.readSkill(name);
        if (!content) return null;
        return `[TOOL REFERENCE: ${name}]\n${content}\n[END TOOL REFERENCE]`;
      })
      .filter(Boolean);

    if (sections.length > 0 && isDebugEnabled()) {
      debug(
        1,
        `[tool-context] Injecting ${sections.length} skill(s): ${skillNames.join(", ")}`
      );
    }

    return sections.join("\n\n");
  }

  private hasSkill(toolName: string): boolean {
    return existsSync(this.skillPath(toolName));
  }

  private readSkill(toolName: string): string | null {
    try {
      return readFileSync(this.skillPath(toolName), "utf8");
    } catch {
      return null;
    }
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
