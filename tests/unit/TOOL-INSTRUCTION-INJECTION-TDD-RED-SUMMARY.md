# Tool Instruction Injection - TDD Red Phase Summary

**Issue**: #35 - Tool instruction injection for local models
**Date**: 2026-01-01
**Status**: RED PHASE COMPLETE (Tests written, implementation pending)

## Test Files Created

### 1. Unit Tests: tool-instruction-injector.test.ts (845 lines)

**Test Coverage**:

- **Tool Intent Detection** (78 tests)
  - Read tool intent (explicit "read", subtle "show", questions)
  - Write tool intent ("create file", "save to")
  - Edit tool intent ("change X to Y", "replace", "update")
  - Bash tool intent ("run", "execute", "list files")
  - Grep tool intent ("search for", "find containing")
  - Glob tool intent ("find all files", glob patterns)
  - Multi-tool detection (prioritization)
  - False positive prevention (conversational keywords)
  - Edge cases (empty, whitespace, no tools)

- **Tool Instruction Formatting** (8 tests)
  - Explicit style (clear, directive)
  - Subtle style (suggestive, shorter)
  - Parameter inclusion
  - Style comparison

- **Main Injection Logic** (24 tests)
  - Basic injection (Read, Write, Edit, Bash)
  - Configuration options (enabled/disabled, confidence threshold, style)
  - Injection tracking (count, max limit)
  - False positive prevention
  - Edge cases (empty message, empty tools, undefined config)
  - Debug information

- **Keyword Conflict Resolution** (3 tests)
  - Overlapping keywords (search → Grep vs Glob)
  - File pattern indicator (\*.ts → Glob)
  - Content search indicator (containing → Grep)

- **Security Validation Integration** (2 tests)
  - Privilege escalation flagging
  - Normal operations (no flag)

**Total**: ~115 test cases

### 2. Integration Tests: tool-instruction-injection.test.js (684 lines)

**Test Coverage**:

- **Basic Integration** (4 tests)
  - Injection enabled (Read, Write, Bash intents)
  - No injection for non-tool messages
  - Injection disabled

- **Instruction Styles** (2 tests)
  - Explicit style configuration
  - Subtle style configuration

- **Multi-Turn Conversations** (2 tests)
  - Selective injection across turns
  - Injection count tracking

- **Over-Injection Detection** (2 tests)
  - Stop after max reached
  - Warning when approaching max

- **Debug Logging** (3 tests)
  - Level 1 (basic injection log)
  - Level 2 (detailed stats)
  - Level 3 (full prompt)

- **Performance Impact** (1 test)
  - Latency measurement (<10ms overhead)

- **Error Handling** (3 tests)
  - Malformed tools array
  - Missing tool schema
  - Continue on injection error

- **Concurrent Requests** (2 tests)
  - Concurrent injections
  - Injection count under concurrency

- **False Positive Prevention** (4 tests)
  - "read this carefully" → no injection
  - "I will write" → no injection
  - "edit my statement" → no injection
  - "search for solution" → no injection

**Total**: ~23 integration tests

### 3. Security Validator Tests: tool-injection-validator.test.ts (856 lines)

**Test Coverage**:

- **Basic Validation** (6 tests)
  - Valid tool calls (Read, Write, Bash)
  - Missing required parameters
  - Wrong parameter types
  - Unknown tool definition

- **Privilege Escalation Detection** (4 tests)
  - Read → Write escalation
  - Read → Bash escalation
  - Read → Edit (acceptable)
  - Implicit escalation via parameters

- **Path Traversal Detection** (3 tests)
  - ../ traversal
  - URL-encoded traversal (%2e%2e%2f)
  - Legitimate relative paths

- **Command Injection Detection** (5 tests)
  - Shell chaining (&&, ||, ;)
  - Command substitution $()
  - Backtick substitution
  - Safe piping (allowed)
  - rm -rf with dangerous paths

- **Suspicious Pattern Detection** (4 tests)
  - eval/exec commands
  - Sensitive file access (/etc/shadow, /etc/passwd)
  - Base64/hex encoding (obfuscation)
  - Remote code execution (curl | sh)

- **Rate Limiting Validation** (3 tests)
  - Excessive tool calls
  - Normal call frequency
  - Rapid-fire identical calls (DoS)

- **Whitelist/Blacklist Enforcement** (4 tests)
  - Tool whitelist
  - Path whitelist
  - Command blacklist
  - Allowed whitelisted paths

- **Audit Logging** (2 tests)
  - Validation results logged
  - Request metadata included

- **Edge Cases** (4 tests)
  - Null/undefined parameters
  - Malformed JSON
  - Empty tool definition
  - Very long parameter values (DoS)

**Total**: ~35 security tests

## Test Verification (RED Phase)

**TypeScript Compilation**:

```
tests/unit/tool-instruction-injector.test.ts(30,8): error TS2307:
Cannot find module '../../src/tool-instruction-injector'

tests/unit/tool-injection-validator.test.ts(28,8): error TS2307:
Cannot find module '../../src/tool-injection-validator'
```

**Status**: ✅ Tests fail as expected (modules don't exist yet)

## Implementation Requirements

Based on test coverage, the implementation must include:

### 1. src/tool-instruction-injector.ts

**Exports**:

- `detectToolIntent(message: string, tools: Tool[]): ToolIntent | null`
- `formatToolInstruction(tool: Tool, style: "explicit" | "subtle"): string`
- `injectToolInstructions(message: string, tools: Tool[], config: ToolInstructionConfig, currentCount?: number): InjectionResult`

**Types**:

```typescript
interface ToolInstructionConfig {
  enabled: boolean;
  style: "explicit" | "subtle";
  confidenceThreshold: number;
  maxInjectionsPerConversation: number;
}

interface ToolIntent {
  toolName: string;
  confidence: number;
  keywords: string[];
}

interface InjectionResult {
  modified: boolean;
  injectedTool?: string;
  modifiedMessage: string;
  injectionCount?: number;
  debug?: {
    confidence: number;
    keywords: string[];
    securityFlag?: string;
  };
}
```

**Detection Patterns** (from tests):

- **Read**: "read", "show", "check", "what does", file questions
- **Write**: "create file", "save to", "write to", "output to"
- **Edit**: "change X to Y", "replace X with Y", "update"
- **Bash**: "run", "execute", "list files"
- **Grep**: "search for", "find containing", with codebase context
- **Glob**: "find all files", "list files matching", glob patterns (\*.ext)

**False Positive Prevention**:

- "read carefully" → NOT Read
- "I will write" → NOT Write
- "edit my statement" → NOT Edit
- "will run" → NOT Bash
- "search for solution" → NOT Grep (no file context)

### 2. src/tool-injection-validator.ts

**Exports**:

- `validateToolCall(context: ToolCallContext): ValidationResult`

**Types**:

```typescript
enum RiskLevel {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

interface ToolCallContext {
  originalMessage: string;
  detectedTool: string;
  injectedInstruction: string;
  toolDefinition: Tool;
  parameters: any;
  callHistory?: Array<{ tool: string; timestamp: number; parameters?: any }>;
  config?: {
    allowedTools?: string[];
    allowedPaths?: string[];
    blockedCommands?: string[];
  };
  metadata?: {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
  };
}

interface SecurityViolation {
  type: string;
  message: string;
  parameter?: string;
  expected?: string;
}

interface ValidationResult {
  valid: boolean;
  violations: SecurityViolation[];
  riskLevel: RiskLevel;
  auditLog?: {
    timestamp: number;
    tool: string;
    valid: boolean;
    violations: SecurityViolation[];
    metadata?: any;
  };
  debug?: any;
}
```

**Violation Types** (from tests):

- `MISSING_REQUIRED_PARAMETER`
- `INVALID_PARAMETER_TYPE`
- `UNKNOWN_TOOL`
- `PRIVILEGE_ESCALATION`
- `PATH_TRAVERSAL`
- `COMMAND_INJECTION`
- `DANGEROUS_COMMAND`
- `SUSPICIOUS_PATTERN`
- `SUSPICIOUS_PATH`
- `OBFUSCATION_DETECTED`
- `REMOTE_CODE_EXECUTION`
- `RATE_LIMIT_EXCEEDED`
- `DUPLICATE_CALL_SPAM`
- `TOOL_NOT_WHITELISTED`
- `PATH_NOT_WHITELISTED`
- `COMMAND_BLACKLISTED`
- `INVALID_PARAMETERS`
- `MALFORMED_PARAMETERS`
- `INVALID_TOOL_DEFINITION`
- `PARAMETER_SIZE_EXCEEDED`

### 3. Integration Points

**anthropic-proxy.ts**:

- Call `injectToolInstructions()` after message parsing
- Track injection count per conversation (session-based)
- Include injection metadata in response
- Debug logging at levels 1, 2, 3

**Configuration (.anyclauderc.json)**:

```json
{
  "backends": {
    "lmstudio": {
      "injectToolInstructions": true,
      "toolInstructionStyle": "explicit",
      "injectionThreshold": 0.7
    }
  }
}
```

## Next Steps (GREEN Phase)

1. Implement `src/tool-instruction-injector.ts`
2. Implement `src/tool-injection-validator.ts`
3. Integrate with `src/anthropic-proxy.ts`
4. Run tests to verify implementation
5. Fix any failing tests
6. Refactor for code quality

## Test Execution Commands

```bash
# Run unit tests
npm test -- tests/unit/tool-instruction-injector.test.ts --tb=line -q

# Run integration tests
npm test -- tests/integration/tool-instruction-injection.test.js --tb=line -q

# Run security tests
npm test -- tests/unit/tool-injection-validator.test.ts --tb=line -q

# Run all tests
npm test
```

## Coverage Goals

- **Unit Test Coverage**: 80%+ (115 tests)
- **Integration Coverage**: Full request pipeline
- **Security Coverage**: All attack vectors (35 tests)
- **Performance**: <10ms overhead per injection

## Key Design Decisions

1. **Confidence-based injection**: Only inject when confidence > threshold (default 0.7)
2. **Rate limiting**: Max injections per conversation (default 10)
3. **Two styles**: Explicit (forceful) vs Subtle (suggestive)
4. **Security validation**: Separate module for privilege escalation detection
5. **Audit logging**: All validation results logged for security review
6. **Graceful degradation**: Errors don't crash proxy, just skip injection
7. **False positive prevention**: Context-aware pattern matching
8. **Debug levels**: 1=basic, 2=stats, 3=full prompt

## Documentation Requirements

- Update CLAUDE.md with configuration options
- Add debugging section for injection logging
- Document security implications
- Add examples of explicit vs subtle styles
