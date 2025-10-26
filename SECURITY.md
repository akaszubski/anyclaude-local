# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in anyclaude-lmstudio, please report it by:

### Preferred Method

- **Email**: Create an issue at https://github.com/akaszubski/anyclaude-lmstudio/issues with the label `security`
- Please **DO NOT** disclose security vulnerabilities publicly until they have been addressed

### What to Include

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if you have one)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Updates**: Regular updates on progress
- **Resolution**: Security fixes prioritized and released ASAP
- **Credit**: You will be credited (if desired) when the fix is released

## Security Considerations

### This Project

- **Local-only**: anyclaude-lmstudio runs entirely on your local machine
- **No cloud communication**: No data is sent to external servers (except LMStudio on localhost)
- **Open source**: All code is transparent and auditable

### Dependencies

We use minimal dependencies:

- `@ai-sdk/openai` - OpenAI SDK adapter
- `ai` - Vercel AI SDK
- `json-schema` - JSON schema validation

Run `npm audit` to check for known vulnerabilities in dependencies.

### Best Practices for Users

1. **Keep LMStudio updated** - Use the latest version
2. **Review code** - This is open source, audit it yourself
3. **Use `.env` for secrets** - Don't hardcode API keys (though none are required)
4. **Check `LMSTUDIO_URL`** - Ensure it points to your local server, not a remote one

## Responsible Disclosure

We follow responsible disclosure practices:

1. **Report** → You report the vulnerability privately
2. **Acknowledge** → We acknowledge within 48 hours
3. **Fix** → We develop and test a fix
4. **Release** → We release the fix
5. **Disclosure** → We publicly disclose the vulnerability (giving you credit)

Thank you for helping keep anyclaude-lmstudio secure! 🔒
