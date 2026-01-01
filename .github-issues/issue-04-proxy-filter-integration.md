## Summary

Integrate the safe system filter into anthropic-proxy.ts to enable adaptive prompt optimization.

## Background

The safe-system-filter module needs to be integrated into the request handling pipeline in anthropic-proxy.ts, replacing the current experimental smart prompt optimization.

## Requirements

### Integration Point

Location: src/anthropic-proxy.ts lines 534-561 (current adaptive optimization block)

### Request Analysis

Before filtering, analyze the request to select appropriate tier:

- Message length and complexity
- Tool count requested
- Conversation depth
- Model capability (70B vs 30B)

### Configuration

Add to .anyclauderc.json backends.lmstudio:

- safeSystemFilter: boolean (enable/disable)
- filterTier: "auto" | "minimal" | "moderate" | "aggressive" | "extreme"
- filterModelCapability: "high" | "medium" | "low"

### Logging

- Log tier selection and token reduction at debug level 1
- Log validation results at debug level 2
- Log full filter details at debug level 3

## File Location

Modify: src/anthropic-proxy.ts

## Dependencies

- src/safe-system-filter.ts
- src/critical-sections.ts
- src/prompt-section-parser.ts

## Acceptance Criteria

- [ ] Filter called before streamText for LMStudio mode
- [ ] Request analysis selects appropriate tier
- [ ] Configuration options work correctly
- [ ] Debug logging at appropriate levels
- [ ] Fallback to original prompt if filter errors
- [ ] No performance regression (filter should be < 10ms)
- [ ] Tool calling still works after integration

## Labels

phase-1, prompt-optimization, integration
