# Token Stripping Test Coverage - TDD Red Phase

**Test File**: `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/test_mlx_worker_server.py`

**Status**: RED Phase (6 tests failing as expected)

**Total Tests**: 54

## Test Results Summary

```
48 PASSED ✓
 6 FAILED ✗ (Expected - Llama 3.x tokens not yet in SPECIAL_TOKENS_TO_STRIP)
```

## Tests Coverage

### 1. Individual Token Types (9 tests)

- ✓ ChatML `<|im_end|>` token stripping
- ✓ ChatML `<|im_start|>` token stripping
- ✓ GPT `<|endoftext|>` token stripping
- ✓ GPT `<|end|>` token stripping
- ✓ Generic `</s>` token stripping
- ✗ Llama 3.x `<|begin_of_text|>` token stripping (FAIL - not in list)
- ✗ Llama 3.x `<|eot_id|>` token stripping (FAIL - not in list)
- ✗ Llama 3.x `<|start_header_id|>` token stripping (FAIL - not in list)
- ✗ Llama 3.x `<|end_header_id|>` token stripping (FAIL - not in list)

### 2. Multiple Tokens (4 tests)

- ✓ Multiple different tokens in sequence
- ✓ Same token repeated multiple times
- ✗ Llama 3.x conversation format (FAIL - tokens not in list)
- ✓ ChatML conversation format

### 3. Token Position (5 tests)

- ✓ Token at start of text
- ✓ Token at end of text
- ✓ Token in middle preserves surrounding text
- ✓ Token with surrounding whitespace
- ✓ Token adjacent to punctuation

### 4. Edge Cases (11 tests)

- ✓ Empty string
- ✓ String with only tokens becomes empty
- ✓ Single token becomes empty
- ✓ Text with no tokens unchanged
- ✓ Whitespace-only unchanged
- ✓ Unicode characters preserved
- ✓ Newlines preserved
- ✓ Tabs preserved
- ✓ Case sensitivity - uppercase not stripped
- ✓ Case sensitivity - mixed case not stripped
- ✓ Case sensitivity - exact match required

### 5. Similar Patterns (3 tests)

- ✓ Partial token not stripped
- ✓ Token with extra characters not stripped
- ✓ Token substring in word not affected

### 6. Streaming Use Cases (5 tests)

- ✓ Streaming chunk with token
- ✓ Streaming chunk only token becomes empty
- ✓ Streaming chunk clean text passes through
- ✓ Streaming chunk token at start
- ✓ Multiple streaming chunks with tokens

### 7. Real-World Scenarios (8 tests)

- ✓ Qwen response format
- ✗ Llama 3.x response format (FAIL - tokens not in list)
- ✓ GPT-style completion
- ✓ Mixed format response
- ✓ Code block with tokens
- ✓ Multiline response with tokens
- ✓ JSON response with tokens
- ✓ Empty response after token stripping

### 8. Token List Verification (2 tests)

- ✓ Required tokens present in SPECIAL_TOKENS_TO_STRIP
- ✓ Llama 3.x tokens handling (informational)

### 9. Performance Edge Cases (3 tests)

- ✓ Very long text (10,000+ chars)
- ✓ Many tokens in long text
- ✓ Similar patterns not modified

### 10. Integration Tests (4 tests)

- ✓ Content quality preserved
- ✓ Tool calling response format
- ✓ Idempotent (stripping twice = stripping once)
- ✓ Commutative with whitespace trim

## Current Implementation Status

### Existing SPECIAL_TOKENS_TO_STRIP

```python
SPECIAL_TOKENS_TO_STRIP = [
    "<|im_end|>",
    "<|im_start|>",
    "<|endoftext|>",
    "<|end|>",
    "</s>",
]
```

### Missing Tokens (Causing Test Failures)

```python
# Llama 3.x tokens (not yet added)
"<|begin_of_text|>",
"<|eot_id|>",
"<|start_header_id|>",
"<|end_header_id|>",
```

## Implementation Function

**Location**: `/Users/andrewkaszubski/Dev/anyclaude/src/mlx_worker/server.py`

```python
def strip_special_tokens(text: str) -> str:
    """Strip special tokens from model output."""
    for token in SPECIAL_TOKENS_TO_STRIP:
        text = text.replace(token, "")
    return text
```

## Next Steps (GREEN Phase)

1. Add Llama 3.x tokens to SPECIAL_TOKENS_TO_STRIP list:

   ```python
   SPECIAL_TOKENS_TO_STRIP = [
       "<|im_end|>",
       "<|im_start|>",
       "<|endoftext|>",
       "<|end|>",
       "</s>",
       "<|begin_of_text|>",
       "<|eot_id|>",
       "<|start_header_id|>",
       "<|end_header_id|>",
   ]
   ```

2. Run tests again to verify all 54 tests pass

3. (Optional) REFACTOR phase: Consider performance optimizations if needed

## Test Execution

```bash
# Run all token stripping tests
python3 -m pytest tests/unit/test_mlx_worker_server.py --tb=line -q

# Run with verbose output
python3 -m pytest tests/unit/test_mlx_worker_server.py -v

# Run specific test class
python3 -m pytest tests/unit/test_mlx_worker_server.py::TestTokenStripping -v
```

## Coverage by Category

| Category          | Tests  | Pass   | Fail  | Coverage              |
| ----------------- | ------ | ------ | ----- | --------------------- |
| Individual Tokens | 9      | 5      | 4     | All token types       |
| Multiple Tokens   | 4      | 3      | 1     | Sequential & repeated |
| Token Position    | 5      | 5      | 0     | Start/middle/end      |
| Edge Cases        | 11     | 11     | 0     | Empty/unicode/case    |
| Similar Patterns  | 3      | 3      | 0     | Partial matches       |
| Streaming         | 5      | 5      | 0     | Chunk processing      |
| Real-world        | 8      | 7      | 1     | Model formats         |
| Verification      | 2      | 2      | 0     | Token list            |
| Performance       | 3      | 3      | 0     | Long text             |
| Integration       | 4      | 4      | 0     | Quality/idempotency   |
| **TOTAL**         | **54** | **48** | **6** | **88.9%**             |

## Key Test Patterns

### Arrange-Act-Assert

All tests follow the AAA pattern:

```python
def test_strip_token_at_end(self):
    # Arrange
    text = "This is content<|im_end|>"

    # Act
    result = strip_special_tokens(text)

    # Assert
    assert result == "This is content"
    assert result.endswith("content")
```

### Edge Case Coverage

- Empty strings
- Strings with only tokens
- Unicode and special characters
- Case sensitivity
- Very long text (10,000+ chars)
- Streaming chunks

### Real-world Scenarios

- Qwen model format
- Llama 3.x format
- GPT-style format
- ChatML format
- Tool calling responses
- Code blocks
- JSON responses

## Test Quality Metrics

- **Comprehensiveness**: 54 tests covering 10 categories
- **Edge Cases**: 11 dedicated edge case tests
- **Real-world**: 8 tests with actual model response formats
- **Integration**: 4 tests for server context usage
- **Performance**: 3 tests for scalability
- **Maintainability**: Clear test names, good organization, AAA pattern

## Notes

1. Tests are designed to fail initially (TDD Red Phase) for unimplemented Llama 3.x tokens
2. 48/54 tests pass with existing implementation (88.9% coverage)
3. 6 tests fail as expected - requiring Llama 3.x tokens to be added
4. All tests use pytest framework with clear assertions
5. Tests are organized into logical classes by functionality
6. Tests verify both positive cases (stripping works) and negative cases (non-tokens preserved)
7. Tests are idempotent and can run in any order
8. Minimal pytest verbosity used to prevent subprocess pipe deadlock (Issue #90)
