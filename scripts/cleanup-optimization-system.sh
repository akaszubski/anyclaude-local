#!/bin/bash
# Cleanup script to remove deprecated optimization system after confirming cache_prompt works

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   OPTIMIZATION SYSTEM CLEANUP                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  This will delete the custom optimization system (~2,140 lines)"
echo "   Reason: Replaced by native llama.cpp cache_prompt parameter"
echo ""

# Confirm with user
read -p "Have you tested that cache_prompt works? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted. Test cache_prompt first:"
    echo "   ANYCLAUDE_DEBUG=2 anyclaude"
    exit 1
fi

echo ""
echo "Files to be deleted:"
echo "  - src/prompt-templates.ts (350 lines)"
echo "  - src/hierarchical-tools.ts (400 lines)"
echo "  - src/smart-system-prompt.ts (500 lines)"
echo "  - src/adaptive-optimizer.ts (400 lines)"
echo "  - tests/optimization-benchmark.test.ts (490 lines)"
echo "  - scripts/test/test-optimization.sh"
echo "  - scripts/test/quick-test-optimization.sh"
echo ""

read -p "Proceed with deletion? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted."
    exit 1
fi

# Delete optimization files
echo ""
echo "[1/7] Deleting src/prompt-templates.ts..."
rm -f src/prompt-templates.ts

echo "[2/7] Deleting src/hierarchical-tools.ts..."
rm -f src/hierarchical-tools.ts

echo "[3/7] Deleting src/smart-system-prompt.ts..."
rm -f src/smart-system-prompt.ts

echo "[4/7] Deleting src/adaptive-optimizer.ts..."
rm -f src/adaptive-optimizer.ts

echo "[5/7] Deleting tests/optimization-benchmark.test.ts..."
rm -f tests/optimization-benchmark.test.ts

echo "[6/7] Deleting scripts/test/test-optimization.sh..."
rm -f scripts/test/test-optimization.sh

echo "[7/7] Deleting scripts/test/quick-test-optimization.sh..."
rm -f scripts/test/quick-test-optimization.sh

echo ""
echo "✓ Files deleted"
echo ""
echo "Next steps:"
echo "  1. Remove imports from src/anthropic-proxy.ts:"
echo "     - Remove lines importing smart-system-prompt"
echo "     - Remove lines importing adaptive-optimizer"
echo "     - Remove optimization logic (lines ~534-561)"
echo ""
echo "  2. Remove config fields from src/main.ts:"
echo "     - Remove smartSystemPrompt config"
echo "     - Remove smartPromptMode config"
echo ""
echo "  3. Remove from .anyclauderc.example.json:"
echo "     - Remove smartSystemPrompt field"
echo "     - Remove smartPromptMode field"
echo ""
echo "  4. Rebuild and test:"
echo "     bun run build"
echo "     anyclaude"
echo ""
echo "Run: git status"
echo "To see what changed and commit when ready."
