#!/bin/bash
# Tool Calling Validation Test
# Tests basic tool functionality and measures response times

set -e

echo "=========================================="
echo "TOOL CALLING VALIDATION TEST"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create temp test directory
TEST_DIR="/tmp/anyclaude-test-$$"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Create test files
echo "Test content" > test-file.txt
echo '{"test": "data"}' > test.json

echo "Test directory: $TEST_DIR"
echo ""

# Function to test a tool call
test_tool() {
    local test_name="$1"
    local prompt="$2"
    local expected="$3"

    echo -e "${YELLOW}Testing: $test_name${NC}"
    echo "Prompt: $prompt"

    start_time=$(date +%s.%N)

    # Send prompt to Claude Code via stdin (won't work in batch, just showing structure)
    # In practice, you'd manually test these in Claude Code

    echo "  → Manual test required in Claude Code"
    echo "  → Expected: $expected"
    echo ""
}

echo "=========================================="
echo "MANUAL TESTS (Run these in Claude Code)"
echo "=========================================="
echo ""

cat << 'EOF'
1. READ TOOL TEST
   Command: read test-file.txt
   Expected: Should show "Test content"

2. GLOB TOOL TEST
   Command: list all .txt files
   Expected: Should find test-file.txt

3. BASH TOOL TEST
   Command: run ls -la
   Expected: Should list directory contents

4. WRITE TOOL TEST
   Command: create a file called output.txt with content "Hello World"
   Expected: Should create output.txt

5. EDIT TOOL TEST (if Write succeeded)
   Command: edit output.txt to change "Hello" to "Goodbye"
   Expected: Should modify file

6. MULTI-TOOL TEST
   Command: read test.json and tell me what's in it
   Expected: Should read and parse JSON

7. ERROR HANDLING TEST
   Command: read nonexistent-file.txt
   Expected: Should show error gracefully (not crash)

8. SPEED TEST - First request (cold)
   Command: who are you?
   Measure: Time to first response

9. SPEED TEST - Second request (warm)
   Exit Claude Code, restart, run again:
   Command: who are you?
   Measure: Should be faster due to automatic MLX caching

10. COMPLEX MULTI-TURN TEST
    Command 1: list files in this directory
    Command 2: read the JSON file you found
    Command 3: summarize what you learned
    Expected: gpt-oss-20b might struggle here
EOF

echo ""
echo "=========================================="
echo "SPEED BENCHMARK"
echo "=========================================="
echo ""

cat << 'EOF'
To benchmark caching:

1. Start fresh session:
   anyclaude

2. First request (COLD - no cache):
   > who are you?
   [Note the time]

3. Exit:
   /exit

4. Start new session:
   anyclaude

5. Same request (WARM - system prompt cached):
   > who are you?
   [Should be MUCH faster]

6. Third request in same session:
   > who are you?
   [Adds conversation history, slower again]

Expected results:
- Cold: 10-30 seconds
- Warm (cached system prompt): 1-5 seconds
- With history: 10-20 seconds
EOF

echo ""
echo "Test directory created at: $TEST_DIR"
echo "cd there and run: anyclaude"
echo ""
