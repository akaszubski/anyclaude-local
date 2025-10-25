# anyclaude-lmstudio

A simplified fork of [anyclaude](https://github.com/coder/anyclaude) focused exclusively on LMStudio local models.

Use Claude Code with LMStudio and local models.

- Extremely simple setup - just run anyclaude
- Uses the AI SDK for LMStudio compatibility
- Works with any LMStudio-compatible local model
- No cloud API keys required

## Get Started

```sh
# Install anyclaude
$ npm install -g anyclaude

# Start LMStudio and load a model first
# Then run anyclaude (it's a wrapper for the Claude CLI)
$ anyclaude
```

## Setup

1. **Install LMStudio**: Download from [lmstudio.ai](https://lmstudio.ai)

2. **Load a Model**:
   - Open LMStudio
   - Download a model (e.g., Mistral, Llama, DeepSeek)
   - Load the model in the server tab

3. **Start LMStudio Server**:
   - Go to "Server" tab in LMStudio
   - Click "Start Server" (default: http://localhost:1234)

4. **Run anyclaude**:
   ```bash
   anyclaude
   ```

## Configuration

Configure via environment variables:

```bash
# LMStudio endpoint (default: http://localhost:1234/v1)
export LMSTUDIO_URL=http://localhost:1234/v1

# Model name (default: current-model)
# Note: LMStudio serves whatever model is currently loaded,
# regardless of the model name sent in the API request
export LMSTUDIO_MODEL=current-model

# API key for LMStudio (default: lm-studio)
export LMSTUDIO_API_KEY=lm-studio
```

**Important**: You can freely switch models in LMStudio without restarting anyclaude. LMStudio automatically serves whichever model is currently loaded in its server tab.

## How It Works

Claude Code supports customizing the Anthropic endpoint with `ANTHROPIC_BASE_URL`.

anyclaude spawns a local HTTP server that translates between:
- **Anthropic's API format** (what Claude Code uses)
- **OpenAI Chat Completions format** (what LMStudio expects)

This allows Claude Code to work seamlessly with local models without modification.

## Debugging

Enable debug logging:

```bash
# Basic debug info
ANYCLAUDE_DEBUG=1 anyclaude

# Verbose debug info (includes full request/response details)
ANYCLAUDE_DEBUG=2 anyclaude
```

## Testing Model Switching

To verify that model switching works without restarting anyclaude:

1. **Start LMStudio and load a model** (e.g., Mistral 7B)
2. **Start anyclaude in one terminal**:
   ```bash
   anyclaude
   ```

3. **Ask Claude a question** to verify it responds

4. **In LMStudio, switch to a different model** (e.g., DeepSeek Coder)
   - Stop the current model
   - Load the new model
   - Keep the server running

5. **Ask Claude another question** - it should now use the new model without restarting anyclaude

6. **Verify which model responded** by asking: "What model are you?"

### Quick Test with curl

Test the proxy directly to see model switching:

```bash
# Terminal 1: Start proxy only
PROXY_ONLY=true anyclaude

# Terminal 2: Send test request (replace PORT with the port from Terminal 1)
curl -X POST http://localhost:PORT/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'

# Now switch models in LMStudio and run the same curl command again
# You should see responses from different models
```

## Proxy Only Mode

Run the proxy without spawning Claude Code (useful for testing):

```bash
PROXY_ONLY=true anyclaude
```

## Credits

This project is a simplified fork of [anyclaude](https://github.com/coder/anyclaude) by [Coder](https://coder.com).

**Original anyclaude features:**
- Multi-provider support (OpenAI, Google, xAI, Azure, Anthropic)
- Advanced failover and circuit breaker patterns
- GPT-5 reasoning effort controls
- OpenRouter integration

**This fork:**
- Stripped down to LMStudio-only support
- Removed cloud provider dependencies
- Simplified codebase for local-first usage
- Focused on ease of setup and maintenance

All credit for the original concept and implementation goes to the anyclaude team at Coder.

## License

MIT (same as original anyclaude project)
