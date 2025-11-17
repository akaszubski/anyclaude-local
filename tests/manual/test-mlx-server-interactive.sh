#!/bin/bash

##
# Manual Interactive Test: MLX Server Tool Calling
#
# This script helps manually test the MLX server tool calling functionality.
# It provides a menu-driven interface to:
# - Start/stop the MLX server
# - Send test requests
# - Verify responses
# - Debug issues
#
# Part of: Phase 1.2 - Tool Calling Verification
# Status: Test infrastructure (not a pass/fail test)
##

set -e

# Configuration
MLX_SERVER_SCRIPT="${MLX_SERVER_SCRIPT:-scripts/mlx-server.py}"
MLX_SERVER_PORT="${MLX_SERVER_PORT:-8081}"
MLX_SERVER_URL="http://localhost:${MLX_SERVER_PORT}"
MLX_MODEL_PATH="${MLX_MODEL_PATH:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_server_running() {
    if curl -s -f "${MLX_SERVER_URL}/v1/models" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

start_server() {
    log_info "Starting MLX server..."

    if [ -z "$MLX_MODEL_PATH" ]; then
        log_error "MLX_MODEL_PATH not set!"
        echo ""
        echo "Please set the model path:"
        echo "  export MLX_MODEL_PATH=/path/to/your/mlx/model"
        echo ""
        return 1
    fi

    if [ ! -d "$MLX_MODEL_PATH" ]; then
        log_error "Model path not found: $MLX_MODEL_PATH"
        return 1
    fi

    log_info "Model: $MLX_MODEL_PATH"
    log_info "Port: $MLX_SERVER_PORT"

    python3 "$MLX_SERVER_SCRIPT" \
        --model "$MLX_MODEL_PATH" \
        --port "$MLX_SERVER_PORT" \
        > /tmp/mlx-server-test.log 2>&1 &

    local pid=$!
    echo $pid > /tmp/mlx-server-test.pid

    log_info "Server PID: $pid"
    log_info "Waiting for server to start..."

    local max_wait=60
    local waited=0

    while [ $waited -lt $max_wait ]; do
        if check_server_running; then
            log_success "Server started successfully!"
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
        echo -n "."
    done

    echo ""
    log_error "Server failed to start within ${max_wait}s"
    log_info "Check logs: tail /tmp/mlx-server-test.log"
    return 1
}

stop_server() {
    log_info "Stopping MLX server..."

    if [ -f /tmp/mlx-server-test.pid ]; then
        local pid=$(cat /tmp/mlx-server-test.pid)
        if kill -0 $pid 2>/dev/null; then
            kill $pid
            log_success "Server stopped (PID: $pid)"
        else
            log_warning "Server process not running"
        fi
        rm /tmp/mlx-server-test.pid
    else
        log_warning "No PID file found"
    fi
}

test_read_tool() {
    log_info "Testing Read tool..."

    local test_file="/tmp/test-read-$(date +%s).txt"
    echo "Hello from test file!" > "$test_file"

    local request=$(cat <<EOF
{
  "model": "current-model",
  "messages": [
    {"role": "user", "content": "Read the file $test_file"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "Read",
        "description": "Read a file",
        "parameters": {
          "type": "object",
          "properties": {
            "file_path": {"type": "string"}
          },
          "required": ["file_path"]
        }
      }
    }
  ],
  "temperature": 0.1,
  "max_tokens": 1000
}
EOF
)

    log_info "Sending request..."
    local response=$(curl -s -X POST "${MLX_SERVER_URL}/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "$request")

    echo ""
    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""

    # Check if tool was called
    if echo "$response" | jq -e '.choices[0].message.tool_calls[0].function.name == "Read"' > /dev/null 2>&1; then
        log_success "Read tool called successfully!"
    else
        log_warning "Read tool not called or unexpected response"
    fi

    rm -f "$test_file"
}

test_write_tool() {
    log_info "Testing Write tool..."

    local test_file="/tmp/test-write-$(date +%s).txt"

    local request=$(cat <<EOF
{
  "model": "current-model",
  "messages": [
    {"role": "user", "content": "Write 'Hello World' to $test_file"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "Write",
        "description": "Write to a file",
        "parameters": {
          "type": "object",
          "properties": {
            "file_path": {"type": "string"},
            "content": {"type": "string"}
          },
          "required": ["file_path", "content"]
        }
      }
    }
  ],
  "temperature": 0.1,
  "max_tokens": 1000
}
EOF
)

    log_info "Sending request..."
    local response=$(curl -s -X POST "${MLX_SERVER_URL}/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "$request")

    echo ""
    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""

    if echo "$response" | jq -e '.choices[0].message.tool_calls[0].function.name == "Write"' > /dev/null 2>&1; then
        log_success "Write tool called successfully!"
    else
        log_warning "Write tool not called or unexpected response"
    fi
}

test_bash_tool() {
    log_info "Testing Bash tool..."

    local request=$(cat <<EOF
{
  "model": "current-model",
  "messages": [
    {"role": "user", "content": "Run the command: echo 'Hello from bash'"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "Bash",
        "description": "Execute bash command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {"type": "string"}
          },
          "required": ["command"]
        }
      }
    }
  ],
  "temperature": 0.1,
  "max_tokens": 1000
}
EOF
)

    log_info "Sending request..."
    local response=$(curl -s -X POST "${MLX_SERVER_URL}/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "$request")

    echo ""
    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""

    if echo "$response" | jq -e '.choices[0].message.tool_calls[0].function.name == "Bash"' > /dev/null 2>&1; then
        log_success "Bash tool called successfully!"
    else
        log_warning "Bash tool not called or unexpected response"
    fi
}

test_streaming() {
    log_info "Testing streaming tool calls..."

    local request=$(cat <<EOF
{
  "model": "current-model",
  "messages": [
    {"role": "user", "content": "Read /tmp/test.txt"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "Read",
        "parameters": {
          "type": "object",
          "properties": {"file_path": {"type": "string"}}
        }
      }
    }
  ],
  "stream": true,
  "temperature": 0.1,
  "max_tokens": 1000
}
EOF
)

    log_info "Sending streaming request..."
    echo ""
    curl -s -X POST "${MLX_SERVER_URL}/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "$request"
    echo ""
    echo ""
    log_success "Streaming response received"
}

show_menu() {
    echo ""
    echo "========================================"
    echo "MLX Server Tool Calling - Interactive Test"
    echo "========================================"
    echo ""
    echo "Server Status: $(check_server_running && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Not Running${NC}")"
    echo "URL: $MLX_SERVER_URL"
    echo ""
    echo "1) Start server"
    echo "2) Stop server"
    echo "3) Test Read tool"
    echo "4) Test Write tool"
    echo "5) Test Bash tool"
    echo "6) Test streaming"
    echo "7) Run all tests"
    echo "8) View server logs"
    echo "9) Check server health"
    echo "0) Exit"
    echo ""
    echo -n "Choose option: "
}

main_loop() {
    while true; do
        show_menu
        read -r choice

        case $choice in
            1)
                start_server
                ;;
            2)
                stop_server
                ;;
            3)
                test_read_tool
                ;;
            4)
                test_write_tool
                ;;
            5)
                test_bash_tool
                ;;
            6)
                test_streaming
                ;;
            7)
                test_read_tool
                test_write_tool
                test_bash_tool
                ;;
            8)
                log_info "Server logs:"
                echo ""
                tail -50 /tmp/mlx-server-test.log
                ;;
            9)
                if check_server_running; then
                    log_success "Server is running"
                    curl -s "${MLX_SERVER_URL}/v1/models" | jq . 2>/dev/null || echo "No JSON response"
                else
                    log_error "Server is not running"
                fi
                ;;
            0)
                log_info "Exiting..."
                if check_server_running; then
                    log_warning "Server is still running. Stop it? (y/n)"
                    read -r stop_choice
                    if [ "$stop_choice" = "y" ]; then
                        stop_server
                    fi
                fi
                exit 0
                ;;
            *)
                log_warning "Invalid option"
                ;;
        esac

        echo ""
        echo -n "Press Enter to continue..."
        read -r
    done
}

# Cleanup on exit
trap 'stop_server' EXIT

# Check dependencies
if ! command -v jq > /dev/null 2>&1; then
    log_warning "jq not found - JSON output won't be pretty-printed"
fi

if ! command -v curl > /dev/null 2>&1; then
    log_error "curl not found - required for tests"
    exit 1
fi

# Show intro
echo ""
log_info "MLX Server Interactive Test Tool"
log_info "================================"
echo ""

if [ -z "$MLX_MODEL_PATH" ]; then
    log_warning "MLX_MODEL_PATH not set!"
    echo ""
    echo "To auto-start the server, set:"
    echo "  export MLX_MODEL_PATH=/path/to/your/mlx/model"
    echo ""
    echo "Or start the server manually before running tests."
    echo ""
fi

# Start main loop
main_loop
