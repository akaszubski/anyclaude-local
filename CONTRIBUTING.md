# Contributing to anyclaude-lmstudio

Thank you for considering contributing to anyclaude-lmstudio!

## Fork Relationship

This is a **simplified fork** of [anyclaude](https://github.com/coder/anyclaude) by Coder Technologies Inc.

**Upstream**: https://github.com/coder/anyclaude
**This Fork**: https://github.com/akaszubski/anyclaude-lmstudio

### Fork Philosophy

- **Local-first**: Focus on LMStudio and local models only
- **Simplicity**: Prefer removing features over adding complexity
- **Maintainability**: Keep codebase small and easy to understand
- **Attribution**: Always credit original anyclaude project

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- LMStudio installed and running
- Git

### Development Setup

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/anyclaude-lmstudio.git
cd anyclaude-lmstudio

# 3. Install dependencies
npm install
# or
bun install

# 4. Build the project
npm run build

# 5. Test locally
PROXY_ONLY=true npm start
# Should output: Proxy only mode: http://localhost:XXXXX
```

### Testing Your Changes

```bash
# Build
npm run build

# Test proxy-only mode
PROXY_ONLY=true node dist/main.js

# Test with LMStudio (ensure LMStudio is running)
node dist/main.js

# Test with debug logging
ANYCLAUDE_DEBUG=1 node dist/main.js

# Type checking
npm run typecheck

# Format code
npm run fmt
```

## Project Structure

```
anyclaude-lmstudio/
├── src/
│   ├── main.ts                      # Entry point, LMStudio provider setup
│   ├── anthropic-proxy.ts           # HTTP proxy server
│   ├── convert-anthropic-messages.ts # Message format conversion
│   ├── convert-to-anthropic-stream.ts # Stream conversion
│   ├── json-schema.ts               # Schema adaptation
│   └── debug.ts                     # Debug logging system
├── dist/                            # Build output (gitignored)
├── README.md                        # User documentation
├── CLAUDE.md                        # Developer documentation
├── PROJECT.md                       # Strategic direction
├── CHANGELOG.md                     # Version history
├── CONTRIBUTING.md                  # This file
└── package.json                     # Package metadata

Key files:
- src/main.ts:71 lines - LMStudio provider configuration
- src/anthropic-proxy.ts:433 lines - Core proxy logic
```

## Code Standards

### TypeScript

- **Strict mode**: Always enabled
- **Type safety**: Avoid `any` where possible
- **Imports**: Use explicit imports (verbatimModuleSyntax)

### Formatting

- **Prettier**: Run `npm run fmt` before committing
- **Line length**: 80 characters max
- **Quotes**: Double quotes
- **Semicolons**: Required
- **Trailing commas**: ES5 style

### Naming Conventions

- **Files**: kebab-case (e.g., `convert-to-anthropic-stream.ts`)
- **Variables/Functions**: camelCase
- **Types/Classes**: PascalCase
- **Constants**: UPPER_SNAKE_CASE

### Comments

- Explain "why", not "what"
- JSDoc for public APIs
- Inline comments for complex logic

## Contribution Guidelines

### What We Accept

✅ **Bug fixes** - Especially related to:

- LMStudio compatibility issues
- Message format conversion bugs
- Streaming errors
- Debug logging improvements

✅ **Documentation improvements** - Including:

- Setup instructions
- Troubleshooting guides
- Code comments
- Examples

✅ **Performance optimizations** - That maintain simplicity

✅ **Test additions** - Unit tests, integration tests

### What We Don't Accept

❌ **Cloud provider support** - This fork is LMStudio-only
❌ **Failover systems** - Removed for simplicity
❌ **Complex features** - Keep it simple
❌ **Breaking changes** - Unless absolutely necessary

### Before Submitting

1. **Test your changes** with LMStudio
2. **Run type checking**: `npm run typecheck`
3. **Format code**: `npm run fmt`
4. **Update documentation** if needed
5. **Add to CHANGELOG.md** under `[Unreleased]`

### Pull Request Process

1. **Fork and create a branch**

   ```bash
   git checkout -b fix/issue-description
   # or
   git checkout -b feat/feature-description
   ```

2. **Make your changes**
   - Follow code standards
   - Add tests if applicable
   - Update documentation

3. **Commit with clear messages**

   ```bash
   git commit -m "Fix: Correct stream conversion for tool calls"
   # or
   git commit -m "Docs: Add troubleshooting for port conflicts"
   ```

4. **Push and create PR**

   ```bash
   git push origin your-branch-name
   ```

   Then create a pull request on GitHub

5. **PR description should include**:
   - What changed and why
   - How you tested it
   - Related issue numbers (if any)
   - Screenshots/logs if relevant

## Testing

### Manual Testing Checklist

- [ ] Proxy starts successfully
- [ ] LMStudio connection works
- [ ] Message conversion works (text)
- [ ] Tool calling works
- [ ] Streaming works
- [ ] Model switching works (change model in LMStudio without restart)
- [ ] Debug logging works (ANYCLAUDE_DEBUG=1 and =2)
- [ ] Error handling works (stop LMStudio, see graceful error)

### Automated Testing

Currently manual testing only. Adding unit tests is welcomed!

```bash
# Future: npm test
# Would run tests for:
# - Message conversion (convert-anthropic-messages.ts)
# - Stream conversion (convert-to-anthropic-stream.ts)
# - Schema adaptation (json-schema.ts)
```

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md` (move [Unreleased] to new version)
3. Build: `npm run build`
4. Test: Install locally and verify
5. Commit: `git commit -m "Release v1.x.x"`
6. Tag: `git tag v1.x.x`
7. Push: `git push && git push --tags`
8. Publish: `npm publish` (if publishing to npm)
9. Create GitHub Release with CHANGELOG excerpt

## Questions?

- **Issues**: https://github.com/akaszubski/anyclaude-lmstudio/issues
- **Discussions**: https://github.com/akaszubski/anyclaude-lmstudio/discussions
- **Original Project**: https://github.com/coder/anyclaude

## License

By contributing, you agree that your contributions will be licensed under the MIT License, with dual copyright attribution to both the original anyclaude project (Coder Technologies Inc.) and this fork.

---

**Thank you for contributing!** 🙏

All contributions help make anyclaude-lmstudio better for everyone using local LLMs.
