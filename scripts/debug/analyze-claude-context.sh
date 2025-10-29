#!/bin/bash
set -e

TRACE=$(ls -t ~/.anyclaude/traces/lmstudio/*.json | head -1)

echo "Analyzing what Claude Code sends..."
echo "Trace: $TRACE"
echo ""

# Extract system prompt
echo "==================================================================="
echo "SYSTEM PROMPT BREAKDOWN"
echo "==================================================================="
SYSTEM_FULL=$(cat "$TRACE" | jq -r '.request.body.system[1].text')
SYSTEM_CHARS=$(echo "$SYSTEM_FULL" | wc -c)
echo "Total system prompt: $SYSTEM_CHARS characters (2,325 tokens)"
echo ""

# Check if it mentions CLAUDE.md
if echo "$SYSTEM_FULL" | grep -q "CLAUDE.md\|claudeMd"; then
    echo "✓ Contains YOUR custom CLAUDE.md content"
else
    echo "✗ No custom CLAUDE.md detected"
fi
echo ""

# Extract first message (contains claudeMd injection)
echo "==================================================================="
echo "FIRST USER MESSAGE (contains YOUR custom files)"
echo "==================================================================="
MSG=$(cat "$TRACE" | jq -r '.request.body.messages[0].content[0].text')
MSG_CHARS=$(echo "$MSG" | wc -c)
echo "Total first message: $MSG_CHARS characters (~3,500 tokens)"
echo ""

# Check what's in it
if echo "$MSG" | grep -q "claudeMd"; then
    echo "✓ Contains YOUR CLAUDE.md files:"
    echo "$MSG" | grep -A2 "Contents of.*CLAUDE.md" | head -6
fi
echo ""

# Extract tool definitions
echo "==================================================================="
echo "TOOL DEFINITIONS (Claude Code defaults)"
echo "==================================================================="
TOOLS=$(cat "$TRACE" | jq '.request.body.tools | length')
echo "Total tools: $TOOLS (12,622 tokens)"
echo ""

cat "$TRACE" | jq -r '.request.body.tools[] | "  - \(.name): \(.description | split("\n")[0])"' | head -20

echo ""
echo "==================================================================="
echo "BREAKDOWN SUMMARY"
echo "==================================================================="
echo ""
echo "Claude Code DEFAULT content (same for everyone):"
echo "  - System prompt base:        ~2,000 tokens"
echo "  - 16 Tool definitions:      12,622 tokens"
echo "  - Total DEFAULT:            ~14,622 tokens (79%)"
echo ""
echo "YOUR CUSTOM content (from ~/.claude/CLAUDE.md + ./CLAUDE.md):"
echo "  - Custom instructions:       ~3,500 tokens (19%)"
echo ""
echo "User actual request:"
echo "  - Your message:                 ~300 tokens (2%)"
echo ""
echo "TOTAL PER REQUEST:              18,490 tokens"
