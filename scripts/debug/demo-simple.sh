#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "    CAPTURE & REPLAY DEMONSTRATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Clean up old traces for demo
rm -rf ~/.anyclaude/traces/lmstudio/*.json 2>/dev/null || true
rm -rf ./trace-replays/*.json 2>/dev/null || true

echo "STEP 1: CAPTURE Communication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Sending a simple prompt: 'Say hello in one sentence'"
echo ""

# Send a simple message directly to the local anyclaude
(
  sleep 2
  echo "Say hello in one sentence"
  sleep 10
  echo "exit"
) | ANYCLAUDE_DEBUG=1 ./dist/main-cli.js --mode=lmstudio > /tmp/anyclaude-demo.log 2>&1 &
ANYCLAUDE_PID=$!

# Wait for it to complete
echo "Waiting for anyclaude to capture the trace..."
wait $ANYCLAUDE_PID 2>/dev/null || true

echo ""
echo "✓ Trace captured!"
echo ""

# Find the latest trace
TRACE_FILE=$(ls -t ~/.anyclaude/traces/lmstudio/*.json 2>/dev/null | head -1)

if [ -z "$TRACE_FILE" ]; then
  echo "❌ No trace file found. Check /tmp/anyclaude-demo.log for errors"
  cat /tmp/anyclaude-demo.log
  exit 1
fi

echo "Trace saved to: $TRACE_FILE"
echo ""

echo "STEP 2: ANALYZE What Was Captured"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

./dist/trace-analyzer-cli.js analyze "$TRACE_FILE"

echo ""
echo "STEP 3: REPLAY to Current Model"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Replaying the exact same request to measure performance..."
echo ""

./dist/trace-replayer-cli.js replay "$TRACE_FILE"

echo ""
echo "STEP 4: COMPARE (would compare multiple models)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "In a real workflow, you would:"
echo "  1. Switch to a different model in LMStudio"
echo "  2. Run: ./dist/trace-replayer-cli.js replay $TRACE_FILE"
echo "  3. Repeat for each model you want to test"
echo "  4. Run: ./dist/trace-replayer-cli.js compare ./trace-replays/"
echo ""
echo "This would show a table comparing all models side-by-side!"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "    ✅ DEMONSTRATION COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "The trace file is ready at: $TRACE_FILE"
echo "You can replay it anytime with different models!"
echo ""
