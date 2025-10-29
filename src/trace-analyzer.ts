#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { encoding_for_model } from "tiktoken";

interface TraceData {
  timestamp: string;
  mode: string;
  request: {
    method: string;
    url: string;
    headers: any;
    body: {
      model?: string;
      system?: any;
      messages?: any[];
      tools?: any[];
      max_tokens?: number;
    };
  };
  response?: {
    statusCode: number;
    headers: any;
    body: any;
  };
}

interface TokenBreakdown {
  systemTokens: number;
  toolTokens: number;
  messageTokens: number;
  totalTokens: number;
  systemPercent: number;
  toolPercent: number;
  messagePercent: number;
}

interface TimingAnalysis {
  timeToFirstToken?: number;
  totalTime?: number;
  tokensPerSecond?: number;
  outputTokens?: number;
}

interface TraceAnalysis {
  trace: TraceData;
  tokens: TokenBreakdown;
  timing: TimingAnalysis;
  requestType: "tool_call" | "text_generation" | "unknown";
  toolsUsed?: string[];
}

/**
 * Estimate tokens using tiktoken
 */
function estimateTokens(text: string): number {
  try {
    const encoder = encoding_for_model("gpt-4");
    const tokens = encoder.encode(text);
    encoder.free();
    return tokens.length;
  } catch (error) {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Analyze token breakdown in a trace
 */
function analyzeTokens(trace: TraceData): TokenBreakdown {
  const body = trace.request.body;

  // System prompt tokens
  let systemTokens = 0;
  if (body.system) {
    const systemText =
      typeof body.system === "string"
        ? body.system
        : Array.isArray(body.system)
          ? body.system.map((s) => s.text || JSON.stringify(s)).join("\n")
          : JSON.stringify(body.system);
    systemTokens = estimateTokens(systemText);
  }

  // Tool definition tokens
  let toolTokens = 0;
  if (body.tools && Array.isArray(body.tools)) {
    toolTokens = estimateTokens(JSON.stringify(body.tools));
  }

  // Message tokens
  let messageTokens = 0;
  if (body.messages && Array.isArray(body.messages)) {
    messageTokens = estimateTokens(JSON.stringify(body.messages));
  }

  const totalTokens = systemTokens + toolTokens + messageTokens;

  return {
    systemTokens,
    toolTokens,
    messageTokens,
    totalTokens,
    systemPercent: totalTokens > 0 ? (systemTokens / totalTokens) * 100 : 0,
    toolPercent: totalTokens > 0 ? (toolTokens / totalTokens) * 100 : 0,
    messagePercent: totalTokens > 0 ? (messageTokens / totalTokens) * 100 : 0,
  };
}

/**
 * Analyze timing from trace
 */
function analyzeTiming(trace: TraceData): TimingAnalysis {
  // TODO: Extract timing from response if available
  // For now, return empty object
  return {};
}

/**
 * Detect request type
 */
function detectRequestType(trace: TraceData): {
  type: "tool_call" | "text_generation" | "unknown";
  toolsUsed?: string[];
} {
  const messages = trace.request.body.messages || [];
  const lastMessage = messages[messages.length - 1];

  // Check if last message contains tool_use
  if (lastMessage?.content) {
    const content = Array.isArray(lastMessage.content)
      ? lastMessage.content
      : [lastMessage.content];

    const toolUses = content.filter((c: any) => c.type === "tool_use");
    if (toolUses.length > 0) {
      return {
        type: "tool_call",
        toolsUsed: toolUses.map((t: any) => t.name),
      };
    }
  }

  // Check if response contains tool calls
  if (trace.response?.body?.content) {
    const content = Array.isArray(trace.response.body.content)
      ? trace.response.body.content
      : [trace.response.body.content];

    const toolUses = content.filter((c: any) => c.type === "tool_use");
    if (toolUses.length > 0) {
      return {
        type: "tool_call",
        toolsUsed: toolUses.map((t: any) => t.name),
      };
    }
  }

  return { type: "text_generation" };
}

/**
 * Validate trace file has required data
 */
function validateTrace(trace: TraceData): {
  valid: boolean;
  error?: string;
} {
  if (!trace.request) {
    return { valid: false, error: "Missing request object" };
  }

  if (!trace.request.body) {
    return { valid: false, error: "Missing request.body" };
  }

  // Check if it's the old broken format
  if (
    typeof trace.request.body === "object" &&
    "index" in trace.request.body &&
    Object.keys(trace.request.body).length === 1
  ) {
    return {
      valid: false,
      error:
        "Incomplete trace (old format). Recapture with latest anyclaude version.",
    };
  }

  return { valid: true };
}

/**
 * Analyze a single trace file
 */
function analyzeTrace(tracePath: string): TraceAnalysis | { error: string } {
  // Check file exists
  if (!fs.existsSync(tracePath)) {
    return { error: `Trace file not found: ${tracePath}` };
  }

  // Read and parse JSON
  let content: string;
  try {
    content = fs.readFileSync(tracePath, "utf8");
  } catch (error: any) {
    return { error: `Failed to read file: ${error.message}` };
  }

  let trace: TraceData;
  try {
    trace = JSON.parse(content);
  } catch (error: any) {
    return { error: `Invalid JSON: ${error.message}` };
  }

  // Validate trace structure
  const validation = validateTrace(trace);
  if (!validation.valid) {
    return { error: validation.error! };
  }

  const tokens = analyzeTokens(trace);
  const timing = analyzeTiming(trace);
  const { type, toolsUsed } = detectRequestType(trace);

  return {
    trace,
    tokens,
    timing,
    requestType: type,
    toolsUsed,
  };
}

/**
 * Print analysis of a single trace
 */
function printAnalysis(analysis: TraceAnalysis, verbose = false): void {
  console.log("\n" + "=".repeat(80));
  console.log("TRACE ANALYSIS");
  console.log("=".repeat(80));

  console.log(`\nTimestamp: ${analysis.trace.timestamp}`);
  console.log(`Mode: ${analysis.trace.mode}`);
  console.log(`Model: ${analysis.trace.request.body.model || "unknown"}`);
  console.log(`Request Type: ${analysis.requestType.toUpperCase()}`);

  if (analysis.toolsUsed && analysis.toolsUsed.length > 0) {
    console.log(`Tools Used: ${analysis.toolsUsed.join(", ")}`);
  }

  console.log("\n" + "-".repeat(80));
  console.log("TOKEN BREAKDOWN");
  console.log("-".repeat(80));

  const t = analysis.tokens;
  console.log(
    `System Prompt:     ${t.systemTokens.toLocaleString().padStart(10)} tokens  (${t.systemPercent.toFixed(1)}%)`
  );
  console.log(
    `Tool Definitions:  ${t.toolTokens.toLocaleString().padStart(10)} tokens  (${t.toolPercent.toFixed(1)}%)`
  );
  console.log(
    `Messages:          ${t.messageTokens.toLocaleString().padStart(10)} tokens  (${t.messagePercent.toFixed(1)}%)`
  );
  console.log("-".repeat(80));
  console.log(
    `Total Input:       ${t.totalTokens.toLocaleString().padStart(10)} tokens`
  );

  if (verbose && analysis.trace.request.body.tools) {
    console.log("\n" + "-".repeat(80));
    console.log("TOOL DEFINITIONS");
    console.log("-".repeat(80));
    const tools = analysis.trace.request.body.tools;
    tools.forEach((tool: any, idx: number) => {
      const toolJson = JSON.stringify(tool);
      const toolTokens = estimateTokens(toolJson);
      console.log(
        `${(idx + 1).toString().padStart(2)}. ${tool.name?.padEnd(20) || "unknown".padEnd(20)} ${toolTokens.toLocaleString().padStart(6)} tokens`
      );
    });
  }

  if (verbose && analysis.trace.request.body.system) {
    console.log("\n" + "-".repeat(80));
    console.log("SYSTEM PROMPT (first 500 chars)");
    console.log("-".repeat(80));
    const systemText =
      typeof analysis.trace.request.body.system === "string"
        ? analysis.trace.request.body.system
        : JSON.stringify(analysis.trace.request.body.system);
    console.log(systemText.substring(0, 500));
    if (systemText.length > 500) {
      console.log(`\n... (${systemText.length - 500} more characters)`);
    }
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

/**
 * Compare multiple traces
 */
function compareTraces(tracePaths: string[]): void {
  console.log("\n" + "=".repeat(120));
  console.log("TRACE COMPARISON");
  console.log("=".repeat(120));

  const analyses: Array<{ path: string; analysis: TraceAnalysis }> = [];

  for (const p of tracePaths) {
    const result = analyzeTrace(p);
    if ("error" in result) {
      console.warn(`⚠️  Skipping ${path.basename(p)}: ${result.error}`);
      continue;
    }
    analyses.push({
      path: path.basename(p),
      analysis: result,
    });
  }

  if (analyses.length === 0) {
    console.error("\n❌ No valid traces to compare\n");
    return;
  }

  // Print header
  console.log(
    "\n" +
      "Trace".padEnd(30) +
      "Type".padEnd(15) +
      "Total Tokens".padStart(15) +
      "System %".padStart(12) +
      "Tools %".padStart(12) +
      "Messages %".padStart(12)
  );
  console.log("-".repeat(120));

  // Print each trace
  for (const { path, analysis } of analyses) {
    const t = analysis.tokens;
    console.log(
      path.substring(0, 28).padEnd(30) +
        analysis.requestType.padEnd(15) +
        t.totalTokens.toLocaleString().padStart(15) +
        `${t.systemPercent.toFixed(1)}%`.padStart(12) +
        `${t.toolPercent.toFixed(1)}%`.padStart(12) +
        `${t.messagePercent.toFixed(1)}%`.padStart(12)
    );
  }

  // Calculate averages by type
  console.log("\n" + "-".repeat(120));
  console.log("AVERAGES BY REQUEST TYPE");
  console.log("-".repeat(120));

  const toolCalls = analyses.filter(
    (a) => a.analysis.requestType === "tool_call"
  );
  const textGen = analyses.filter(
    (a) => a.analysis.requestType === "text_generation"
  );

  if (toolCalls.length > 0) {
    const avgTokens =
      toolCalls.reduce((sum, a) => sum + a.analysis.tokens.totalTokens, 0) /
      toolCalls.length;
    const avgSystem =
      toolCalls.reduce((sum, a) => sum + a.analysis.tokens.systemPercent, 0) /
      toolCalls.length;
    const avgTools =
      toolCalls.reduce((sum, a) => sum + a.analysis.tokens.toolPercent, 0) /
      toolCalls.length;
    console.log(
      `Tool Calls (n=${toolCalls.length})`.padEnd(30) +
        "".padEnd(15) +
        avgTokens.toLocaleString().padStart(15) +
        `${avgSystem.toFixed(1)}%`.padStart(12) +
        `${avgTools.toFixed(1)}%`.padStart(12)
    );
  }

  if (textGen.length > 0) {
    const avgTokens =
      textGen.reduce((sum, a) => sum + a.analysis.tokens.totalTokens, 0) /
      textGen.length;
    const avgSystem =
      textGen.reduce((sum, a) => sum + a.analysis.tokens.systemPercent, 0) /
      textGen.length;
    const avgTools =
      textGen.reduce((sum, a) => sum + a.analysis.tokens.toolPercent, 0) /
      textGen.length;
    console.log(
      `Text Generation (n=${textGen.length})`.padEnd(30) +
        "".padEnd(15) +
        avgTokens.toLocaleString().padStart(15) +
        `${avgSystem.toFixed(1)}%`.padStart(12) +
        `${avgTools.toFixed(1)}%`.padStart(12)
    );
  }

  console.log("\n" + "=".repeat(120) + "\n");
}

/**
 * List available traces
 */
function listTraces(mode?: string): void {
  const homeDir = require("os").homedir();
  const baseDir = path.join(homeDir, ".anyclaude", "traces");

  const modes = mode ? [mode] : ["lmstudio", "claude"];

  console.log("\n" + "=".repeat(80));
  console.log("AVAILABLE TRACES");
  console.log("=".repeat(80) + "\n");

  for (const m of modes) {
    const traceDir = path.join(baseDir, m);
    if (!fs.existsSync(traceDir)) {
      console.log(`${m}: No traces found`);
      continue;
    }

    const files = fs
      .readdirSync(traceDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    console.log(`${m.toUpperCase()} (${files.length} traces):`);
    files.slice(0, 10).forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f}`);
    });
    if (files.length > 10) {
      console.log(`  ... and ${files.length - 10} more`);
    }
    console.log("");
  }
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help") {
    console.log(`
anyclaude trace analyzer - Analyze Claude Code request traces

USAGE:
  trace-analyzer <command> [options]

COMMANDS:
  analyze <file>           Analyze a single trace file
  analyze <file> -v        Analyze with verbose output (show tools, system prompt)

  compare <file1> <file2>  Compare multiple trace files
  compare <dir>            Compare all traces in a directory

  list                     List all available traces
  list lmstudio            List LMStudio traces only
  list claude              List Claude API traces only

EXAMPLES:
  # Analyze a single trace
  trace-analyzer analyze ~/.anyclaude/traces/lmstudio/2025-10-26T12-34-56.json

  # Analyze with details
  trace-analyzer analyze ~/.anyclaude/traces/lmstudio/2025-10-26T12-34-56.json -v

  # Compare all traces in a directory
  trace-analyzer compare ~/.anyclaude/traces/lmstudio/

  # Compare specific traces
  trace-analyzer compare trace1.json trace2.json trace3.json

  # List available traces
  trace-analyzer list
`);
    process.exit(0);
  }

  switch (command) {
    case "analyze": {
      const tracePath = args[1];
      const verbose = args.includes("-v") || args.includes("--verbose");

      if (!tracePath) {
        console.error("Error: Please provide a trace file path");
        process.exit(1);
      }

      const result = analyzeTrace(tracePath);

      // Check if result is an error
      if ("error" in result) {
        console.error(`\n❌ ${result.error}\n`);
        process.exit(1);
      }

      printAnalysis(result, verbose);
      break;
    }

    case "compare": {
      const paths = args.slice(1).filter((a) => !a.startsWith("-"));

      if (paths.length === 0) {
        console.error("Error: Please provide trace files or directory");
        process.exit(1);
      }

      let tracePaths: string[] = [];

      // Check if single argument is a directory
      if (paths.length === 1) {
        try {
          if (fs.statSync(paths[0]).isDirectory()) {
            const dir = paths[0];
            tracePaths = fs
              .readdirSync(dir)
              .filter((f) => f.endsWith(".json"))
              .map((f) => path.join(dir, f));
          } else {
            tracePaths = paths;
          }
        } catch (error: any) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
      } else {
        tracePaths = paths;
      }

      if (tracePaths.length === 0) {
        console.error("Error: No trace files found");
        process.exit(1);
      }

      // Filter out invalid traces and warn
      const validTraces: string[] = [];
      for (const tracePath of tracePaths) {
        const result = analyzeTrace(tracePath);
        if ("error" in result) {
          console.warn(
            `⚠️  Skipping ${path.basename(tracePath)}: ${result.error}`
          );
        } else {
          validTraces.push(tracePath);
        }
      }

      if (validTraces.length === 0) {
        console.error("\n❌ No valid trace files found\n");
        process.exit(1);
      }

      compareTraces(validTraces);
      break;
    }

    case "list": {
      const mode = args[1];
      if (mode && mode !== "lmstudio" && mode !== "claude") {
        console.error('Error: Mode must be "lmstudio" or "claude"');
        process.exit(1);
      }
      listTraces(mode);
      break;
    }

    default:
      console.error(`Error: Unknown command: ${command}`);
      console.error('Run "trace-analyzer help" for usage information');
      process.exit(1);
  }
}

// Export functions for testing
export {
  estimateTokens,
  analyzeTokens,
  validateTrace,
  analyzeTrace,
  listTraces,
  compareTraces,
};

// Run CLI if executed directly or via CLI wrapper
if (
  require.main === module ||
  process.argv[1]?.endsWith("trace-analyzer.ts") ||
  process.argv[1]?.endsWith("trace-analyzer.js") ||
  process.argv[1]?.endsWith("trace-analyzer-cli.js")
) {
  main();
}
