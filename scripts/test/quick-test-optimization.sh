#!/bin/bash
#
# Quick Optimization Test
#
# Fast test to verify optimization is working
# Usage: ./scripts/test/quick-test-optimization.sh

set -e

echo "🧪 Quick Optimization Test"
echo "=========================="
echo ""

# Build
echo "Building..."
bun run build > /dev/null 2>&1
echo "✓ Build OK"

# Run benchmark
echo ""
echo "Running benchmark tests..."
TEST_OUTPUT=$(bun test tests/optimization-benchmark.test.ts 2>&1)
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -o "[0-9]\+ pass" | awk '{print $1}')
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -o "[0-9]\+ fail" | awk '{print $1}')

if [ "$FAIL_COUNT" = "0" ]; then
    echo "✓ All $PASS_COUNT tests passed"
else
    echo "✗ $FAIL_COUNT tests failed"
    echo "$TEST_OUTPUT"
    exit 1
fi

# Quick optimization test
echo ""
echo "Testing optimization pipeline..."

# Get project root directory
PROJECT_ROOT=$(pwd)

cat > /tmp/quick-opt-test.js << EOF
const { optimizePromptAdaptive } = require('$PROJECT_ROOT/dist/adaptive-optimizer.js');

const prompt = "You are Claude. ".repeat(2000); // ~8k tokens
const result = optimizePromptAdaptive(prompt, "Fix the bug in auth.ts", []);

console.log(\`Original: \${result.stats.originalTokens} tokens\`);
console.log(\`Optimized: \${result.stats.optimizedTokens} tokens\`);
console.log(\`Reduction: \${result.stats.reductionPercent.toFixed(1)}%\`);
console.log(\`Tier: \${result.tier}\`);
console.log(\`Time: \${result.stats.processingTimeMs}ms\`);
EOF

node /tmp/quick-opt-test.js
rm /tmp/quick-opt-test.js

echo ""
echo "✓ All checks passed!"
echo ""
echo "Next: Test with LMStudio"
echo "  ANYCLAUDE_DEBUG=2 anyclaude"
