#!/bin/bash
# anyclaude Development Aliases
# Add these to your ~/.zshrc or ~/.bashrc

# Core development commands
alias anyclaude-build='cd /Users/akaszubski/Documents/GitHub/anyclaude && npm run build'
alias anyclaude-dev='anyclaude'
alias anyclaude-test='cd /Users/akaszubski/Documents/GitHub/anyclaude && npm test'

# Mode switching
alias anyclaude-lm='anyclaude'                              # LMStudio mode (default)
alias anyclaude-claude='ANYCLAUDE_MODE=claude anyclaude'    # Claude mode
alias anyclaude-openrouter='anyclaude --mode=openrouter'    # OpenRouter mode
alias anyclaude-select-model='./scripts/select-openrouter-model.sh'  # Interactive model selector

# Debug levels
alias anyclaude-debug='ANYCLAUDE_DEBUG=1 anyclaude'         # Basic debug
alias anyclaude-verbose='ANYCLAUDE_DEBUG=2 anyclaude'       # Verbose debug
alias anyclaude-trace='ANYCLAUDE_DEBUG=3 anyclaude'         # Trace level (full schemas)

# Proxy only (for testing)
alias anyclaude-proxy='PROXY_ONLY=true anyclaude'          # LMStudio proxy only
alias anyclaude-proxy-claude='ANYCLAUDE_MODE=claude PROXY_ONLY=true anyclaude'  # Claude proxy only

# Combined shortcuts
alias anyclaude-trace-claude='ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 PROXY_ONLY=true anyclaude'  # Trace Claude API calls
alias anyclaude-trace-lm='ANYCLAUDE_DEBUG=3 PROXY_ONLY=true anyclaude'                             # Trace LMStudio calls

# Trace viewing
alias anyclaude-traces='ls -lth ~/.anyclaude/traces/claude/ | head -10'                  # List recent traces
alias anyclaude-latest-trace='cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq .'  # View latest trace
alias anyclaude-clean-traces='rm -rf ~/.anyclaude/traces/claude/* && echo "Traces cleaned"'       # Clear all traces

# Version checking
alias anyclaude-which='readlink -f $(which anyclaude)'      # Show actual path
alias anyclaude-version='ls -la $(which anyclaude)'         # Show symlink

# Quick workflow
alias anyclaude-rb='cd /Users/akaszubski/Documents/GitHub/anyclaude && npm run build && anyclaude'  # Rebuild and run

# Usage examples
cat << 'EOF'

anyclaude Development Aliases Loaded!

Quick Start:
  anyclaude-build         → Rebuild project
  anyclaude-dev           → Run local version (LMStudio)
  anyclaude-claude        → Run in Claude mode
  anyclaude-openrouter    → Run with OpenRouter
  anyclaude-select-model  → Change OpenRouter model (interactive)
  anyclaude-trace-claude  → Capture Claude API traces

Debug Levels:
  anyclaude-debug         → Basic debug (level 1)
  anyclaude-verbose       → Verbose debug (level 2)
  anyclaude-trace         → Full traces (level 3)

Trace Management:
  anyclaude-traces        → List recent traces
  anyclaude-latest-trace  → View latest trace (JSON)
  anyclaude-clean-traces  → Delete all traces

Workflow:
  1. Make changes to src/
  2. anyclaude-rb         → Rebuild and run
  3. Test your changes
  4. anyclaude-test       → Run tests

Examples:
  # Rebuild and test
  anyclaude-build && anyclaude-test

  # Capture Claude traces
  anyclaude-trace-claude 2> claude.log &

  # Compare with LMStudio
  anyclaude-trace-lm 2> lmstudio.log &

  # View latest trace
  anyclaude-latest-trace

EOF
