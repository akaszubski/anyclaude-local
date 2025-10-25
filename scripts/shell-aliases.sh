# anyclaude Shell Aliases
# Add these to your ~/.zshrc or ~/.bashrc for easy access

# Alias to start Claude Code with LMStudio backend
alias claude-local='/Users/akaszubski/Documents/GitHub/anyclaude/start-local.sh'

# Alternative: Quick start with just environment variables
alias claude-lm='cd /Users/akaszubski/Documents/GitHub/anyclaude && source .env.lmstudio && bun run src/main.ts'

# Helper to check LMStudio status
alias lm-status='curl -s http://localhost:1234/v1/models | grep -o "\"id\":\"[^\"]*\"" | sed "s/\"id\":\"/  - /" | sed "s/\"$//"'

# Helper to test LMStudio connection
alias lm-test='curl -s http://localhost:1234/v1/models > /dev/null && echo "✓ LMStudio is running" || echo "✗ LMStudio is not running"'

# ===========================================
# To install these aliases:
# ===========================================
# 1. Add to your shell config:
#    echo 'source /Users/akaszubski/Documents/GitHub/anyclaude/shell-aliases.sh' >> ~/.zshrc
#
# 2. Reload your shell:
#    source ~/.zshrc
#
# 3. Use the aliases:
#    claude-local     # Start Claude with LMStudio
#    lm-status        # Check which models are loaded
#    lm-test          # Test LMStudio connection
