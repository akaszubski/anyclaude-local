#!/bin/bash
# Test the full integration with Claude Code

echo "Starting anyclaude with debug logging..."
echo "Will send query: 1+1="
echo ""

# Launch anyclaude with debug logging
# Note: You'll need to manually type "1+1=" and press Enter
# Then wait to see if it completes or hangs

ANYCLAUDE_DEBUG=1 anyclaude
