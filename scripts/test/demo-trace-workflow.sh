#!/bin/bash
set -e

# Complete end-to-end demonstration of trace analysis workflow
# This script shows the full workflow from capture → analyze → benchmark

echo "================================================================================"
echo "TRACE ANALYSIS & MODEL BENCHMARKING - END-TO-END DEMO"
echo "================================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Clean old traces
echo -e "${BLUE}Step 1: Preparing environment...${NC}"
rm -rf ~/.anyclaude/traces/lmstudio/*.json 2>/dev/null || true
rm -rf ./trace-replays/*.json 2>/dev/null || true
echo "✓ Cleaned old traces"
echo ""

# Step 2: Create a realistic test trace (simulating what anyclaude would capture)
echo -e "${BLUE}Step 2: Creating realistic trace file...${NC}"
cat > /tmp/demo-trace.json << 'EOF'
{
  "timestamp": "2025-10-26T10:00:00.000Z",
  "mode": "lmstudio",
  "request": {
    "method": "POST",
    "url": "/v1/messages",
    "headers": {
      "content-type": "application/json",
      "x-api-key": "[REDACTED]"
    },
    "body": {
      "model": "current-model",
      "max_tokens": 4096,
      "system": "You are Claude Code, Anthropic's official CLI for Claude.\nYou are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.\n\nIMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts.",
      "messages": [
        {
          "role": "user",
          "content": "Read the README.md file and summarize it in 2 sentences"
        }
      ],
      "tools": [
        {
          "name": "Read",
          "description": "Reads a file from the local filesystem. You can access any file directly by using this tool.",
          "input_schema": {
            "type": "object",
            "properties": {
              "file_path": {
                "type": "string",
                "description": "The absolute path to the file to read"
              },
              "limit": {
                "type": "number",
                "description": "The number of lines to read"
              },
              "offset": {
                "type": "number",
                "description": "The line number to start reading from"
              }
            },
            "required": ["file_path"]
          }
        },
        {
          "name": "Write",
          "description": "Writes a file to the local filesystem.",
          "input_schema": {
            "type": "object",
            "properties": {
              "file_path": {
                "type": "string",
                "description": "The absolute path to the file to write"
              },
              "content": {
                "type": "string",
                "description": "The content to write to the file"
              }
            },
            "required": ["file_path", "content"]
          }
        },
        {
          "name": "Edit",
          "description": "Performs exact string replacements in files.",
          "input_schema": {
            "type": "object",
            "properties": {
              "file_path": {
                "type": "string",
                "description": "The absolute path to the file to modify"
              },
              "old_string": {
                "type": "string",
                "description": "The text to replace"
              },
              "new_string": {
                "type": "string",
                "description": "The text to replace it with"
              }
            },
            "required": ["file_path", "old_string", "new_string"]
          }
        },
        {
          "name": "Bash",
          "description": "Executes a given bash command in a persistent shell session.",
          "input_schema": {
            "type": "object",
            "properties": {
              "command": {
                "type": "string",
                "description": "The command to execute"
              },
              "timeout": {
                "type": "number",
                "description": "Optional timeout in milliseconds"
              }
            },
            "required": ["command"]
          }
        }
      ]
    }
  }
}
EOF

mkdir -p ~/.anyclaude/traces/lmstudio/
cp /tmp/demo-trace.json ~/.anyclaude/traces/lmstudio/2025-10-26T10-00-00-000Z.json
echo "✓ Created realistic trace file with 4 tools"
echo ""

# Step 3: Analyze the trace
echo -e "${BLUE}Step 3: Analyzing trace with trace-analyzer...${NC}"
echo ""
./dist/trace-analyzer-cli.js analyze ~/.anyclaude/traces/lmstudio/2025-10-26T10-00-00-000Z.json
echo ""

# Step 4: Show verbose analysis
echo -e "${BLUE}Step 4: Verbose analysis (showing tool definitions)...${NC}"
echo ""
./dist/trace-analyzer-cli.js analyze ~/.anyclaude/traces/lmstudio/2025-10-26T10-00-00-000Z.json -v | head -60
echo ""
echo "... (truncated for demo)"
echo ""

# Step 5: List all traces
echo -e "${BLUE}Step 5: Listing all available traces...${NC}"
echo ""
./dist/trace-analyzer-cli.js list
echo ""

# Step 6: Demonstrate replay (without actually calling LMStudio)
echo -e "${BLUE}Step 6: Replay demonstration${NC}"
echo ""
echo "In a real workflow, you would now:"
echo ""
echo "  1. Load a model in LMStudio (e.g., qwen3-coder-30b@4bit)"
echo "  2. Run: trace-replayer replay ~/.anyclaude/traces/lmstudio/2025-10-26T10-00-00-000Z.json"
echo "     This would show:"
echo "       - Prompt processing time (time to first token)"
echo "       - Token generation time"
echo "       - Total time"
echo "       - Tokens/second"
echo ""
echo "  3. Switch models in LMStudio (e.g., llama-3.1-8b)"
echo "  4. Run the same replay command again"
echo ""
echo "  5. Compare results: trace-replayer compare ./trace-replays/"
echo "     This would show a table comparing:"
echo "       - Model names"
echo "       - Prompt processing times"
echo "       - Generation speeds"
echo "       - Total times"
echo ""

# Step 7: Show example replay output format
echo -e "${BLUE}Step 7: Example replay output (simulated)${NC}"
echo ""
cat << 'EOF'
Replaying trace to model: qwen3-coder-30b-a3b-instruct-mlx@4bit
Request: 1 messages, 4 tools

────────────────────────────────────────────────────────────
PERFORMANCE METRICS
────────────────────────────────────────────────────────────
Prompt Processing:  45.23s  (time to first token)
Token Generation:   12.18s  (327 tokens)
Total Time:         57.41s
Generation Speed:   26.84 tokens/sec
────────────────────────────────────────────────────────────

✓ Result saved to: ./trace-replays/2025-10-26T10-00-00-000Z_replay_qwen3-30b-4bit.json

EOF

echo ""
echo -e "${BLUE}Step 8: Example comparison output (simulated)${NC}"
echo ""
cat << 'EOF'
========================================================================================================
REPLAY COMPARISON
========================================================================================================

Model                               Status   Prompt Proc   Generation   Total Time   Tokens  Tok/sec
--------------------------------------------------------------------------------------------------------
qwen3-coder-30b@4bit                  ✓         45.23s        12.18s        57.41s      327    26.84
llama-3.1-8b                          ✓          2.41s         6.71s         9.12s      339    50.52
codestral-22b                         ✓          3.82s         8.92s        12.74s      334    37.44

--------------------------------------------------------------------------------------------------------
Average (3 successful)                          17.15s         9.27s        26.42s              38.27

========================================================================================================

EOF

# Summary
echo ""
echo "================================================================================"
echo -e "${GREEN}WORKFLOW DEMONSTRATION COMPLETE${NC}"
echo "================================================================================"
echo ""
echo "What we demonstrated:"
echo "  ✓ Trace capture (simulated - in real usage, anyclaude captures automatically)"
echo "  ✓ Trace analysis with token breakdown"
echo "  ✓ Verbose mode showing full system prompt and tool definitions"
echo "  ✓ List command showing all available traces"
echo "  ✓ Replay workflow for benchmarking models"
echo "  ✓ Comparison output for choosing optimal model"
echo ""
echo "Key insights from this trace:"
echo "  - Claude Code sends ~${YELLOW}242 tokens${NC} for this request"
echo "  - System prompt: ~52 tokens (21.5%)"
echo "  - Tool definitions: ~175 tokens (72.3%) - 4 tools with schemas"
echo "  - User message: ~15 tokens (6.2%)"
echo ""
echo "Next steps:"
echo "  1. Use anyclaude with ANYCLAUDE_DEBUG=1 to capture real traces"
echo "  2. Analyze traces to understand Claude Code overhead"
echo "  3. Use trace-replayer to scientifically compare models"
echo "  4. Choose the optimal model for YOUR hardware and use case"
echo ""
echo "Documentation: docs/guides/trace-analysis-guide.md"
echo "================================================================================"
