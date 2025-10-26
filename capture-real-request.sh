#!/bin/bash
set -e

echo "Capturing a real request that generates tokens..."
echo ""

# Create a temporary file with the prompt
cat > /tmp/anyclaude-test-prompt.txt <<'EOF'
Write a haiku about coding in TypeScript. Just output the haiku, nothing else.
EOF

# Run anyclaude with the prompt
ANYCLAUDE_DEBUG=1 ./dist/main-cli.js --mode=lmstudio --print < /tmp/anyclaude-test-prompt.txt 2>/tmp/anyclaude-capture.log

echo ""
echo "Trace captured! Finding the trace file..."
TRACE_FILE=$(ls -t ~/.anyclaude/traces/lmstudio/*.json 2>/dev/null | head -1)

if [ -z "$TRACE_FILE" ]; then
  echo "No trace found. Check /tmp/anyclaude-capture.log"
  cat /tmp/anyclaude-capture.log
  exit 1
fi

echo "Trace: $TRACE_FILE"
echo ""
echo "Now you can replay this with different models:"
echo "  ./dist/trace-replayer-cli.js replay \"$TRACE_FILE\""
