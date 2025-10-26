#!/bin/bash
# Debug Session Logger
# Captures detailed logs when running anyclaude with Claude Code

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐛 anyclaude Debug Session"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create debug directory
DEBUG_DIR="debug-logs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEBUG_DIR"

echo "📁 Debug logs will be saved to: $DEBUG_DIR"
echo ""

# Check prerequisites
echo "1️⃣  Checking prerequisites..."
echo ""

# Check LMStudio
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo "   ✅ LMStudio is running on :1234"
    curl -s http://localhost:1234/v1/models | jq '.' > "$DEBUG_DIR/lmstudio-models.json" 2>/dev/null
else
    echo "   ❌ LMStudio is NOT responding on :1234"
    echo "   Please start LMStudio server before continuing"
    exit 1
fi

# Check anyclaude build
if [ -f "dist/main.js" ]; then
    echo "   ✅ anyclaude is built (dist/main.js exists)"
else
    echo "   ❌ anyclaude not built - run: bun run build"
    exit 1
fi

echo ""
echo "2️⃣  Starting anyclaude with verbose debug logging..."
echo ""
echo "   Log files:"
echo "   - stdout: $DEBUG_DIR/anyclaude-stdout.log"
echo "   - stderr: $DEBUG_DIR/anyclaude-stderr.log"
echo "   - combined: $DEBUG_DIR/anyclaude-combined.log"
echo ""

# Start anyclaude with debug logging
ANYCLAUDE_DEBUG=2 node dist/main.js > "$DEBUG_DIR/anyclaude-combined.log" 2>&1 &
ANYCLAUDE_PID=$!

echo "   ✅ anyclaude started (PID: $ANYCLAUDE_PID)"
echo ""
echo "3️⃣  anyclaude is now running with Claude Code"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "INSTRUCTIONS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Use Claude Code normally"
echo "2. Try to reproduce the freeze"
echo "3. When done, press Ctrl+C to stop logging"
echo ""
echo "All debug info will be in: $DEBUG_DIR"
echo ""
echo "Press Ctrl+C to stop debug session..."
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🛑 Stopping debug session..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Kill anyclaude
    kill $ANYCLAUDE_PID 2>/dev/null

    # Copy error logs if they exist
    ERROR_LOG="/var/folders/7s/v055m81j7_1f5709y8xdfm_c0000gn/T/anyclaude-errors.log"
    if [ -f "$ERROR_LOG" ]; then
        cp "$ERROR_LOG" "$DEBUG_DIR/anyclaude-errors.log"
        echo "   ✅ Copied error log"
    fi

    # Copy debug JSON files
    find /var/folders -name "anyclaude-debug-*.json" -mmin -10 -exec cp {} "$DEBUG_DIR/" \; 2>/dev/null

    echo ""
    echo "📊 Debug session complete!"
    echo ""
    echo "Debug files saved to: $DEBUG_DIR"
    echo ""
    echo "To analyze:"
    echo "  cat $DEBUG_DIR/anyclaude-combined.log"
    echo "  cat $DEBUG_DIR/anyclaude-errors.log"
    echo ""

    exit 0
}

trap cleanup SIGINT SIGTERM

# Tail the log file
tail -f "$DEBUG_DIR/anyclaude-combined.log"
