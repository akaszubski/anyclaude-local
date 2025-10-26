#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

interface TraceData {
  timestamp: string;
  mode: string;
  request: {
    method: string;
    url: string;
    headers: any;
    body: any;
  };
  response?: any;
}

interface ReplayResult {
  model: string;
  timestamp: string;
  promptProcessingTime: number; // Time to process prompt before generation starts
  timeToFirstToken: number; // Time until first token appears (includes prompt processing)
  generationTime: number; // Time spent generating tokens (totalTime - timeToFirstToken)
  totalTime: number; // Complete end-to-end time
  tokensGenerated: number;
  tokensPerSecond: number;
  success: boolean;
  error?: string;
  response?: any;
}

/**
 * Replay a trace request to LMStudio
 */
async function replayTrace(
  tracePath: string,
  lmstudioUrl: string
): Promise<ReplayResult> {
  const content = fs.readFileSync(tracePath, "utf8");
  const trace: TraceData = JSON.parse(content);

  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let tokensGenerated = 0;
  let responseBody = "";

  try {
    // Query LMStudio for current model
    // Note: lmstudioUrl includes /v1, but models API is at /api/v0/models (root level)
    const baseUrl = lmstudioUrl.replace("/v1", "");
    const modelsResponse = await fetch(`${baseUrl}/api/v0/models`);
    const modelsData: any = await modelsResponse.json();
    const loadedModel = modelsData.data?.find((m: any) => m.state === "loaded");
    const modelName = loadedModel?.id || "unknown";

    console.log(`\nReplaying trace to model: ${modelName}`);
    console.log(`LMStudio URL: ${lmstudioUrl}`);

    // Convert Anthropic Messages API format to OpenAI Chat Completions format
    const anthropicBody = trace.request.body;
    const openaiBody: any = {
      model: "current-model",
      messages: [],
      stream: true,
      max_tokens: anthropicBody.max_tokens || 1000,
    };

    // Add system message
    if (anthropicBody.system) {
      const systemText =
        typeof anthropicBody.system === "string"
          ? anthropicBody.system
          : Array.isArray(anthropicBody.system)
            ? anthropicBody.system.map((s: any) => s.text).join("\n")
            : JSON.stringify(anthropicBody.system);
      openaiBody.messages.push({
        role: "system",
        content: systemText,
      });
    }

    // Add user/assistant messages
    if (anthropicBody.messages) {
      for (const msg of anthropicBody.messages) {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .map((c: any) =>
                    c.type === "text" ? c.text : JSON.stringify(c)
                  )
                  .join("\n")
              : JSON.stringify(msg.content);

        openaiBody.messages.push({
          role: msg.role,
          content,
        });
      }
    }

    // Add tools if present
    if (anthropicBody.tools && anthropicBody.tools.length > 0) {
      openaiBody.tools = anthropicBody.tools.map((tool: any) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));
    }

    console.log(`Request: ${openaiBody.messages.length} messages, ${openaiBody.tools?.length || 0} tools`);

    // Make streaming request
    const response = await fetch(`${lmstudioUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Process streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.substring(6);
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.content) {
              if (firstTokenTime === null) {
                firstTokenTime = Date.now();
                console.log(
                  `Time to first token: ${((firstTokenTime - startTime) / 1000).toFixed(2)}s`
                );
              }
              tokensGenerated++;
              responseBody += delta.content;
              process.stdout.write(".");
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const timeToFirst = firstTokenTime
      ? (firstTokenTime - startTime) / 1000
      : totalTime;
    const generationTime = firstTokenTime
      ? (endTime - firstTokenTime) / 1000
      : 0;
    const tokensPerSecond = generationTime > 0 ? tokensGenerated / generationTime : 0;

    console.log("\n");
    console.log("─".repeat(60));
    console.log("PERFORMANCE METRICS");
    console.log("─".repeat(60));
    console.log(`Prompt Processing:  ${timeToFirst.toFixed(2)}s  (time to first token)`);
    console.log(`Token Generation:   ${generationTime.toFixed(2)}s  (${tokensGenerated} tokens)`);
    console.log(`Total Time:         ${totalTime.toFixed(2)}s`);
    console.log(`Generation Speed:   ${tokensPerSecond.toFixed(2)} tokens/sec`);
    console.log("─".repeat(60));

    return {
      model: modelName,
      timestamp: new Date().toISOString(),
      promptProcessingTime: timeToFirst,
      timeToFirstToken: timeToFirst,
      generationTime,
      totalTime,
      tokensGenerated,
      tokensPerSecond,
      success: true,
      response: responseBody,
    };
  } catch (error: any) {
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;

    console.error(`\n❌ Error: ${error.message}`);

    return {
      model: "unknown",
      timestamp: new Date().toISOString(),
      promptProcessingTime: 0,
      timeToFirstToken: 0,
      generationTime: 0,
      totalTime,
      tokensGenerated: 0,
      tokensPerSecond: 0,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Save replay result
 */
function saveReplayResult(
  tracePath: string,
  result: ReplayResult,
  outputDir?: string
): string {
  const traceBasename = path.basename(tracePath, ".json");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const modelName = result.model.replace(/[^a-zA-Z0-9-]/g, "_");

  const filename = `${traceBasename}_replay_${modelName}_${timestamp}.json`;
  const dir = outputDir || path.join(process.cwd(), "trace-replays");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

  return filepath;
}

/**
 * Compare multiple replay results
 */
function compareResults(resultPaths: string[]): void {
  console.log("\n" + "=".repeat(120));
  console.log("REPLAY COMPARISON");
  console.log("=".repeat(120));

  const results = resultPaths.map((p) => {
    const content = fs.readFileSync(p, "utf8");
    return JSON.parse(content) as ReplayResult;
  });

  // Print header
  console.log(
    "\n" +
      "Model".padEnd(35) +
      "Status".padEnd(8) +
      "Prompt Proc".padStart(13) +
      "Generation".padStart(13) +
      "Total Time".padStart(13) +
      "Tokens".padStart(9) +
      "Tok/sec".padStart(10)
  );
  console.log("-".repeat(120));

  // Print each result
  for (const result of results) {
    const status = result.success ? "✓" : "✗";
    console.log(
      result.model.substring(0, 33).padEnd(35) +
        status.padEnd(8) +
        `${result.promptProcessingTime.toFixed(2)}s`.padStart(13) +
        `${result.generationTime.toFixed(2)}s`.padStart(13) +
        `${result.totalTime.toFixed(2)}s`.padStart(13) +
        result.tokensGenerated.toString().padStart(9) +
        result.tokensPerSecond.toFixed(2).padStart(10)
    );
  }

  // Print summary
  console.log("\n" + "-".repeat(120));
  const successful = results.filter((r) => r.success);
  if (successful.length > 0) {
    const avgPromptProc =
      successful.reduce((sum, r) => sum + r.promptProcessingTime, 0) /
      successful.length;
    const avgGeneration =
      successful.reduce((sum, r) => sum + r.generationTime, 0) /
      successful.length;
    const avgTotal =
      successful.reduce((sum, r) => sum + r.totalTime, 0) / successful.length;
    const avgTokensPerSec =
      successful.reduce((sum, r) => sum + r.tokensPerSecond, 0) /
      successful.length;

    console.log(
      `Average (${successful.length} successful)`.padEnd(43) +
        `${avgPromptProc.toFixed(2)}s`.padStart(13) +
        `${avgGeneration.toFixed(2)}s`.padStart(13) +
        `${avgTotal.toFixed(2)}s`.padStart(13) +
        "".padStart(9) +
        avgTokensPerSec.toFixed(2).padStart(10)
    );
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length}`);
    failed.forEach((r) => {
      console.log(`  ${r.model}: ${r.error}`);
    });
  }

  console.log("\n" + "=".repeat(120) + "\n");
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help") {
    console.log(`
trace-replayer - Replay Claude Code traces to test different models

USAGE:
  trace-replayer <command> [options]

COMMANDS:
  replay <trace-file>              Replay trace to currently loaded LMStudio model
  replay <trace-file> --output <dir>  Save result to specific directory

  compare <result1> <result2> ...  Compare replay results
  compare <results-dir>            Compare all results in directory

ENVIRONMENT VARIABLES:
  LMSTUDIO_URL                     LMStudio server URL (default: http://localhost:1234/v1)

EXAMPLES:
  # Replay a trace (saves result to ./trace-replays/)
  trace-replayer replay ~/.anyclaude/traces/lmstudio/2025-10-26T12-34-56.json

  # Switch model in LMStudio, replay again
  trace-replayer replay ~/.anyclaude/traces/lmstudio/2025-10-26T12-34-56.json

  # Compare results
  trace-replayer compare ./trace-replays/

WORKFLOW:
  1. Capture a trace by using anyclaude with ANYCLAUDE_DEBUG=1
  2. Replay the trace with different models loaded in LMStudio
  3. Compare the results to find the best model for your hardware
`);
    process.exit(0);
  }

  const lmstudioUrl = process.env.LMSTUDIO_URL || "http://localhost:1234";

  switch (command) {
    case "replay": {
      const tracePath = args[1];
      const outputDir = args.includes("--output")
        ? args[args.indexOf("--output") + 1]
        : undefined;

      if (!tracePath) {
        console.error("Error: Please provide a trace file path");
        process.exit(1);
      }

      if (!fs.existsSync(tracePath)) {
        console.error(`Error: Trace file not found: ${tracePath}`);
        process.exit(1);
      }

      const result = await replayTrace(tracePath, lmstudioUrl);
      const resultPath = saveReplayResult(tracePath, result, outputDir);

      console.log(`\n✓ Result saved to: ${resultPath}`);

      if (!result.success) {
        process.exit(1);
      }

      break;
    }

    case "compare": {
      const paths = args.slice(1).filter((a) => !a.startsWith("-"));

      if (paths.length === 0) {
        console.error("Error: Please provide result files or directory");
        process.exit(1);
      }

      let resultPaths: string[] = [];

      // Check if single argument is a directory
      if (paths.length === 1 && fs.statSync(paths[0]).isDirectory()) {
        const dir = paths[0];
        resultPaths = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(dir, f));
      } else {
        resultPaths = paths;
      }

      if (resultPaths.length === 0) {
        console.error("Error: No result files found");
        process.exit(1);
      }

      compareResults(resultPaths);
      break;
    }

    default:
      console.error(`Error: Unknown command: ${command}`);
      console.error('Run "trace-replayer help" for usage information');
      process.exit(1);
  }
}

main();
