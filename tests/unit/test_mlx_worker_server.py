#!/usr/bin/env python3
"""
Unit Tests: MLX Worker Server - Token Stripping

Tests for the strip_special_tokens function that removes model-specific
special tokens from MLX worker output before returning to the client.

Expected to FAIL initially (TDD Red Phase) if implementation is incomplete.

Test Coverage:
- Individual token stripping (9 special token types + 14 reasoning token types)
- Multiple sequential tokens
- Tokens in middle of text (preserves surrounding content)
- Empty string after stripping
- Text with no special tokens (unchanged)
- Mixed content (text + token + text)
- Case sensitivity (exact match required)
- Streaming chunks with tokens
- Edge cases (whitespace, punctuation adjacency)
- Reasoning tokens before tool calls (Issue #46)
- Nested reasoning tags
- Mixed reasoning and special tokens

Tokens Under Test:
- ChatML: <|im_end|>, <|im_start|>
- GPT: <|endoftext|>, <|end|>
- Generic: </s>
- Llama 3.x: <|begin_of_text|>, <|eot_id|>, <|start_header_id|>, <|end_header_id|>
- Reasoning: <think>, <reasoning>, <thinking>, <thought>, <reflection>, <|thinking>, <output>
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / 'src'
sys.path.insert(0, str(src_path))

# This import will fail until implementation is complete
try:
    from mlx_worker.server import strip_special_tokens, SPECIAL_TOKENS_TO_STRIP
except ImportError:
    # Mock for TDD red phase
    SPECIAL_TOKENS_TO_STRIP = [
        "<|im_end|>",
        "<|im_start|>",
        "<|endoftext|>",
        "<|end|>",
        "</s>",
    ]

    def strip_special_tokens(text: str) -> str:
        raise NotImplementedError("strip_special_tokens not yet implemented")


class TestTokenStripping:
    """Test special token stripping functionality"""

    # ============================================================================
    # Test Individual Token Types
    # ============================================================================

    def test_strip_chatml_im_end_token(self):
        """Test stripping <|im_end|> token"""
        text = "Hello world<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "Hello world"
        assert "<|im_end|>" not in result

    def test_strip_chatml_im_start_token(self):
        """Test stripping <|im_start|> token"""
        text = "<|im_start|>user\nHello"
        result = strip_special_tokens(text)
        assert result == "user\nHello"
        assert "<|im_start|>" not in result

    def test_strip_gpt_endoftext_token(self):
        """Test stripping <|endoftext|> token"""
        text = "The quick brown fox<|endoftext|>"
        result = strip_special_tokens(text)
        assert result == "The quick brown fox"
        assert "<|endoftext|>" not in result

    def test_strip_gpt_end_token(self):
        """Test stripping <|end|> token"""
        text = "Response complete<|end|>"
        result = strip_special_tokens(text)
        assert result == "Response complete"
        assert "<|end|>" not in result

    def test_strip_generic_eos_token(self):
        """Test stripping </s> token"""
        text = "Final answer</s>"
        result = strip_special_tokens(text)
        assert result == "Final answer"
        assert "</s>" not in result

    def test_strip_llama3_begin_of_text_token(self):
        """Test stripping <|begin_of_text|> token"""
        text = "<|begin_of_text|>Hello there"
        result = strip_special_tokens(text)
        assert result == "Hello there"
        assert "<|begin_of_text|>" not in result

    def test_strip_llama3_eot_id_token(self):
        """Test stripping <|eot_id|> token"""
        text = "Message content<|eot_id|>"
        result = strip_special_tokens(text)
        assert result == "Message content"
        assert "<|eot_id|>" not in result

    def test_strip_llama3_start_header_id_token(self):
        """Test stripping <|start_header_id|> token"""
        text = "<|start_header_id|>assistant"
        result = strip_special_tokens(text)
        assert result == "assistant"
        assert "<|start_header_id|>" not in result

    def test_strip_llama3_end_header_id_token(self):
        """Test stripping <|end_header_id|> token"""
        text = "system<|end_header_id|>\nYou are helpful"
        result = strip_special_tokens(text)
        assert result == "system\nYou are helpful"
        assert "<|end_header_id|>" not in result

    # ============================================================================
    # Test Reasoning Token Types (Issue #46)
    # ============================================================================

    def test_strip_think_open_tag(self):
        """Test stripping <think> opening tag"""
        text = "<think>Let me analyze this problem"
        result = strip_special_tokens(text)
        assert result == "Let me analyze this problem"
        assert "<think>" not in result

    def test_strip_think_close_tag(self):
        """Test stripping </think> closing tag"""
        text = "Let me consider the options</think>"
        result = strip_special_tokens(text)
        assert result == "Let me consider the options"
        assert "</think>" not in result

    def test_strip_reasoning_open_tag(self):
        """Test stripping <reasoning> opening tag"""
        text = "<reasoning>First, we need to understand"
        result = strip_special_tokens(text)
        assert result == "First, we need to understand"
        assert "<reasoning>" not in result

    def test_strip_reasoning_close_tag(self):
        """Test stripping </reasoning> closing tag"""
        text = "Therefore, the answer is clear</reasoning>"
        result = strip_special_tokens(text)
        assert result == "Therefore, the answer is clear"
        assert "</reasoning>" not in result

    def test_strip_thinking_open_tag(self):
        """Test stripping <thinking> opening tag"""
        text = "<thinking>Breaking down the problem step by step"
        result = strip_special_tokens(text)
        assert result == "Breaking down the problem step by step"
        assert "<thinking>" not in result

    def test_strip_thinking_close_tag(self):
        """Test stripping </thinking> closing tag"""
        text = "This leads to the conclusion</thinking>"
        result = strip_special_tokens(text)
        assert result == "This leads to the conclusion"
        assert "</thinking>" not in result

    def test_strip_thought_open_tag(self):
        """Test stripping <thought> opening tag"""
        text = "<thought>Hmm, interesting approach"
        result = strip_special_tokens(text)
        assert result == "Hmm, interesting approach"
        assert "<thought>" not in result

    def test_strip_thought_close_tag(self):
        """Test stripping </thought> closing tag"""
        text = "That makes sense now</thought>"
        result = strip_special_tokens(text)
        assert result == "That makes sense now"
        assert "</thought>" not in result

    def test_strip_reflection_open_tag(self):
        """Test stripping <reflection> opening tag"""
        text = "<reflection>Looking back at this"
        result = strip_special_tokens(text)
        assert result == "Looking back at this"
        assert "<reflection>" not in result

    def test_strip_reflection_close_tag(self):
        """Test stripping </reflection> closing tag"""
        text = "I should reconsider</reflection>"
        result = strip_special_tokens(text)
        assert result == "I should reconsider"
        assert "</reflection>" not in result

    def test_strip_pipe_thinking_open_tag(self):
        """Test stripping <|thinking> opening tag (pipe variant)"""
        text = "<|thinking>Let me work through this"
        result = strip_special_tokens(text)
        assert result == "Let me work through this"
        assert "<|thinking>" not in result

    def test_strip_pipe_thinking_close_tag(self):
        """Test stripping </|thinking> closing tag (pipe variant)"""
        text = "Step by step analysis</|thinking>"
        result = strip_special_tokens(text)
        assert result == "Step by step analysis"
        assert "</|thinking>" not in result

    def test_strip_output_open_tag(self):
        """Test stripping <output> opening tag"""
        text = "<output>Here is the final result"
        result = strip_special_tokens(text)
        assert result == "Here is the final result"
        assert "<output>" not in result

    def test_strip_output_close_tag(self):
        """Test stripping </output> closing tag"""
        text = "This is my answer</output>"
        result = strip_special_tokens(text)
        assert result == "This is my answer"
        assert "</output>" not in result

    # ============================================================================
    # Test Reasoning Tokens with Tool Calls (Issue #46 Core Use Case)
    # ============================================================================

    def test_strip_thinking_tags_before_tool_call(self):
        """Test stripping thinking tags before tool call (Issue #46 primary scenario)"""
        text = '<think>I need to read the file first</think><tool_call>{"name":"Read","arguments":{"file_path":"test.txt"}}</tool_call>'
        result = strip_special_tokens(text)
        assert result == '<tool_call>{"name":"Read","arguments":{"file_path":"test.txt"}}</tool_call>'
        assert "<think>" not in result
        assert "</think>" not in result
        assert "<tool_call>" in result
        assert "Read" in result

    def test_strip_reasoning_tags_before_tool_call(self):
        """Test stripping reasoning tags before tool call"""
        text = '<reasoning>Analyzing the requirements</reasoning><tool_call>{"name":"Bash","arguments":{"command":"ls -la"}}</tool_call>'
        result = strip_special_tokens(text)
        assert result == '<tool_call>{"name":"Bash","arguments":{"command":"ls -la"}}</tool_call>'
        assert "<reasoning>" not in result
        assert "</reasoning>" not in result
        assert "<tool_call>" in result

    def test_strip_thinking_tags_before_multiple_tool_calls(self):
        """Test stripping thinking tags before multiple tool calls"""
        text = '<think>First read</think><tool_call>{"name":"Read"}</tool_call><think>Then write</think><tool_call>{"name":"Write"}</tool_call>'
        result = strip_special_tokens(text)
        assert result == '<tool_call>{"name":"Read"}</tool_call><tool_call>{"name":"Write"}</tool_call>'
        assert "<think>" not in result
        assert "</think>" not in result
        # Both tool calls should be preserved
        assert result.count("<tool_call>") == 2

    def test_strip_nested_thinking_tags(self):
        """Test stripping nested thinking tags"""
        text = "<think>Outer thought<reasoning>Inner analysis</reasoning>More thinking</think>Result"
        result = strip_special_tokens(text)
        assert result == "Outer thoughtInner analysisMore thinkingResult"
        assert "<think>" not in result
        assert "</think>" not in result
        assert "<reasoning>" not in result
        assert "</reasoning>" not in result

    def test_strip_thinking_with_text_only(self):
        """Test stripping thinking tags from text-only response"""
        text = "<think>Let me analyze this carefully</think>The answer is 42"
        result = strip_special_tokens(text)
        assert result == "Let me analyze this carefullyThe answer is 42"
        assert "<think>" not in result
        assert "</think>" not in result
        assert "The answer is 42" in result

    def test_strip_multiple_reasoning_tag_types(self):
        """Test stripping multiple different reasoning tag types in one response"""
        text = "<think>Initial thought</think><reasoning>Analysis</reasoning><reflection>Review</reflection>Final answer"
        result = strip_special_tokens(text)
        assert result == "Initial thoughtAnalysisReviewFinal answer"
        assert "<think>" not in result
        assert "<reasoning>" not in result
        assert "<reflection>" not in result

    def test_strip_output_tags_around_content(self):
        """Test stripping <output> tags around content"""
        text = "<output>This is the user-facing response</output>"
        result = strip_special_tokens(text)
        assert result == "This is the user-facing response"
        assert "<output>" not in result
        assert "</output>" not in result

    def test_strip_thinking_tags_preserve_tool_call_json(self):
        """Test that thinking tag removal preserves tool call JSON structure"""
        text = '''<think>I should use the Grep tool</think><tool_call>
{
  "name": "Grep",
  "arguments": {
    "pattern": "test",
    "path": "src/"
  }
}</tool_call>'''
        result = strip_special_tokens(text)
        assert "<think>" not in result
        assert "</think>" not in result
        assert "<tool_call>" in result
        assert '"name": "Grep"' in result
        assert '"pattern": "test"' in result

    # ============================================================================
    # Test Streaming with Reasoning Tokens (Issue #46)
    # ============================================================================

    def test_strip_streaming_chunk_with_partial_thinking_tag(self):
        """Test streaming chunk containing partial thinking tag"""
        # In real streaming, tags might be split across chunks
        chunk1 = "<think>Starting to analyze"
        chunk2 = " the problem</think>The answer"

        result1 = strip_special_tokens(chunk1)
        result2 = strip_special_tokens(chunk2)

        assert "<think>" not in result1
        assert "</think>" not in result2
        assert "Starting to analyze" in result1
        assert "The answer" in result2

    def test_strip_streaming_thinking_then_tool_call(self):
        """Test streaming scenario: thinking tag, then tool call"""
        chunks = [
            "<think>",
            "I need to check the file",
            "</think>",
            "<tool_call>",
            '{"name":"Read"}',
            "</tool_call>"
        ]
        results = [strip_special_tokens(chunk) for chunk in chunks]

        # Tags should be removed
        assert results[0] == ""
        assert results[2] == ""
        # Content preserved
        assert "I need to check the file" in results[1]
        assert "<tool_call>" in results[3]
        assert '{"name":"Read"}' in results[4]

    def test_strip_streaming_nested_reasoning_chunks(self):
        """Test streaming with nested reasoning tags across chunks"""
        chunks = [
            "<think>Outer",
            "<reasoning>Inner",
            "</reasoning>",
            "</think>Result"
        ]
        results = [strip_special_tokens(chunk) for chunk in chunks]

        # All tags removed, content preserved
        combined = "".join(results)
        assert "<think>" not in combined
        assert "<reasoning>" not in combined
        assert "</think>" not in combined
        assert "</reasoning>" not in combined
        assert "Outer" in combined
        assert "Inner" in combined
        assert "Result" in combined

    # ============================================================================
    # Test Reasoning Token Regression Cases
    # ============================================================================

    def test_strip_no_thinking_tokens_regression(self):
        """Test that responses without thinking tokens still work (regression)"""
        text = '<tool_call>{"name":"test"}</tool_call>'
        result = strip_special_tokens(text)
        assert result == text
        # Should be unchanged

    def test_strip_thinking_does_not_break_existing_tokens(self):
        """Test that reasoning token stripping doesn't break existing special tokens"""
        text = "<think>Thinking</think><|im_start|>assistant<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "Thinkingassistant"
        # All tokens should be removed
        assert "<think>" not in result
        assert "</think>" not in result
        assert "<|im_start|>" not in result
        assert "<|im_end|>" not in result

    def test_strip_mixed_reasoning_and_special_tokens(self):
        """Test stripping mixed reasoning and special tokens"""
        text = "<|im_start|><think>Analyzing</think>Response<|im_end|></s>"
        result = strip_special_tokens(text)
        assert result == "AnalyzingResponse"
        # All tokens removed
        assert "<|im_start|>" not in result
        assert "<think>" not in result
        assert "</think>" not in result
        assert "<|im_end|>" not in result
        assert "</s>" not in result

    def test_strip_thinking_tags_case_sensitive(self):
        """Test that reasoning tags are case-sensitive"""
        text = "<THINK>Should not be stripped</THINK>"
        result = strip_special_tokens(text)
        # Uppercase tags should NOT be stripped
        assert result == text

    def test_strip_thinking_partial_tags_not_stripped(self):
        """Test that partial reasoning tags are not stripped"""
        text = "<thin>incomplete</thin>"
        result = strip_special_tokens(text)
        # Partial tags should remain
        assert result == text

    def test_strip_thinking_tags_in_code_block_not_confused(self):
        """Test that reasoning tags in code examples are still stripped"""
        text = "```xml\n<think>example</think>\n```"
        result = strip_special_tokens(text)
        # Tags are stripped even in code blocks (they're just text)
        assert result == "```xml\nexample\n```"
        assert "<think>" not in result

    # ============================================================================
    # Test Real-World Reasoning Token Scenarios
    # ============================================================================

    def test_strip_deepseek_style_thinking(self):
        """Test stripping DeepSeek-style thinking tokens"""
        text = "<think>\nStep 1: Analyze the problem\nStep 2: Find solution\n</think>\nThe answer is X"
        result = strip_special_tokens(text)
        assert result == "\nStep 1: Analyze the problem\nStep 2: Find solution\n\nThe answer is X"
        assert "<think>" not in result
        assert "</think>" not in result

    def test_strip_qwen_style_reasoning(self):
        """Test stripping Qwen-style reasoning tokens"""
        text = "<reasoning>First, let's break this down...</reasoning><output>Final answer</output>"
        result = strip_special_tokens(text)
        assert result == "First, let's break this down...Final answer"
        assert "<reasoning>" not in result
        assert "<output>" not in result

    def test_strip_complex_nested_reasoning_before_tool(self):
        """Test complex nested reasoning structure before tool call"""
        text = '''<think>Initial analysis
<reasoning>Deep dive
<reflection>Second thoughts</reflection>
Continue analysis</reasoning>
Final thought</think>
<tool_call>{"name":"Bash","arguments":{"command":"pwd"}}</tool_call>'''
        result = strip_special_tokens(text)

        # All reasoning tags removed
        assert "<think>" not in result
        assert "<reasoning>" not in result
        assert "<reflection>" not in result
        assert "</think>" not in result
        assert "</reasoning>" not in result
        assert "</reflection>" not in result

        # Tool call preserved
        assert "<tool_call>" in result
        assert "Bash" in result
        assert "pwd" in result

        # Reasoning content preserved (tags removed but content remains)
        assert "Initial analysis" in result
        assert "Deep dive" in result
        assert "Second thoughts" in result

    def test_strip_thinking_with_llama3_tokens_and_tool_call(self):
        """Test realistic scenario: Llama3 tokens + thinking tags + tool call"""
        text = '<|begin_of_text|><|start_header_id|>assistant<|end_header_id|>\n<think>I should check the directory</think><tool_call>{"name":"Bash","arguments":{"command":"ls"}}</tool_call><|eot_id|>'
        result = strip_special_tokens(text)

        # All special tokens removed
        assert "<|begin_of_text|>" not in result
        assert "<|start_header_id|>" not in result
        assert "<|end_header_id|>" not in result
        assert "<|eot_id|>" not in result
        assert "<think>" not in result
        assert "</think>" not in result

        # Tool call preserved
        assert "<tool_call>" in result
        assert "Bash" in result

    def test_strip_pipe_thinking_variant(self):
        """Test stripping <|thinking> pipe variant (some models use this)"""
        text = "<|thinking>Analyzing the context</|thinking>Final answer"
        result = strip_special_tokens(text)
        assert result == "Analyzing the contextFinal answer"
        assert "<|thinking>" not in result
        assert "</|thinking>" not in result

    def test_strip_output_tags_separate_reasoning_from_response(self):
        """Test <output> tags separating reasoning from user-facing response"""
        text = "<think>Internal reasoning process</think><output>User sees this</output>"
        result = strip_special_tokens(text)
        assert result == "Internal reasoning processUser sees this"
        assert "<think>" not in result
        assert "<output>" not in result
        # Both parts preserved, just tags removed

    # ============================================================================
    # Test Multiple Tokens
    # ============================================================================

    def test_strip_multiple_tokens_in_sequence(self):
        """Test stripping multiple different tokens in one string"""
        text = "<|im_start|>user<|im_end|>Hello<|endoftext|></s>"
        result = strip_special_tokens(text)
        assert result == "userHello"
        assert "<|im_start|>" not in result
        assert "<|im_end|>" not in result
        assert "<|endoftext|>" not in result
        assert "</s>" not in result

    def test_strip_repeated_same_token(self):
        """Test stripping same token appearing multiple times"""
        text = "First</s>Second</s>Third</s>"
        result = strip_special_tokens(text)
        assert result == "FirstSecondThird"
        assert "</s>" not in result

    def test_strip_llama3_conversation_format(self):
        """Test stripping Llama 3.x conversation format tokens"""
        text = "<|begin_of_text|><|start_header_id|>user<|end_header_id|>\nHello<|eot_id|>"
        result = strip_special_tokens(text)
        assert result == "user\nHello"
        assert "<|begin_of_text|>" not in result
        assert "<|start_header_id|>" not in result
        assert "<|end_header_id|>" not in result
        assert "<|eot_id|>" not in result

    def test_strip_chatml_conversation_format(self):
        """Test stripping ChatML conversation format tokens"""
        text = "<|im_start|>system\nYou are helpful<|im_end|><|im_start|>user\nHi<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "system\nYou are helpfuluser\nHi"
        assert "<|im_start|>" not in result
        assert "<|im_end|>" not in result

    # ============================================================================
    # Test Token Position
    # ============================================================================

    def test_strip_token_at_start(self):
        """Test token at beginning of text is removed"""
        text = "<|im_start|>This is content"
        result = strip_special_tokens(text)
        assert result == "This is content"
        assert result.startswith("This")

    def test_strip_token_at_end(self):
        """Test token at end of text is removed"""
        text = "This is content<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "This is content"
        assert result.endswith("content")

    def test_strip_token_in_middle(self):
        """Test token in middle of text is removed, text preserved"""
        text = "Hello<|endoftext|>World"
        result = strip_special_tokens(text)
        assert result == "HelloWorld"
        assert "<|endoftext|>" not in result

    def test_strip_token_with_surrounding_whitespace(self):
        """Test token with whitespace before and after"""
        text = "Hello </s> World"
        result = strip_special_tokens(text)
        assert result == "Hello  World"
        assert "</s>" not in result
        # Note: Whitespace is preserved, creating double space

    def test_strip_token_adjacent_to_punctuation(self):
        """Test token adjacent to punctuation is handled correctly"""
        text = "Question?<|im_end|> Answer!"
        result = strip_special_tokens(text)
        assert result == "Question? Answer!"
        assert "<|im_end|>" not in result

    # ============================================================================
    # Test Edge Cases
    # ============================================================================

    def test_strip_empty_string(self):
        """Test empty string returns empty string"""
        result = strip_special_tokens("")
        assert result == ""

    def test_strip_only_tokens_no_text(self):
        """Test string with only tokens results in empty string"""
        text = "<|im_start|><|im_end|></s>"
        result = strip_special_tokens(text)
        assert result == ""

    def test_strip_only_single_token(self):
        """Test string with only one token results in empty string"""
        text = "<|endoftext|>"
        result = strip_special_tokens(text)
        assert result == ""

    def test_strip_no_special_tokens(self):
        """Test text with no special tokens is unchanged"""
        text = "This is normal text with no tokens."
        result = strip_special_tokens(text)
        assert result == text

    def test_strip_whitespace_only(self):
        """Test whitespace-only string is unchanged"""
        text = "   \n\t  "
        result = strip_special_tokens(text)
        assert result == text

    def test_strip_unicode_text_preserved(self):
        """Test unicode characters are preserved"""
        text = "Hello 世界 🌍<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "Hello 世界 🌍"
        assert "世界" in result
        assert "🌍" in result

    def test_strip_newlines_preserved(self):
        """Test newlines in text are preserved"""
        text = "Line 1\nLine 2<|endoftext|>\nLine 3"
        result = strip_special_tokens(text)
        assert result == "Line 1\nLine 2\nLine 3"
        assert result.count("\n") == 2

    def test_strip_tabs_preserved(self):
        """Test tabs in text are preserved"""
        text = "Column1\tColumn2<|im_end|>\tColumn3"
        result = strip_special_tokens(text)
        assert result == "Column1\tColumn2\tColumn3"
        assert "\t" in result

    # ============================================================================
    # Test Case Sensitivity
    # ============================================================================

    def test_case_sensitive_uppercase_not_stripped(self):
        """Test uppercase version of token is NOT stripped (case sensitive)"""
        text = "Hello<|IM_END|>World"
        result = strip_special_tokens(text)
        # Uppercase token should NOT be stripped (case sensitive)
        assert result == "Hello<|IM_END|>World"

    def test_case_sensitive_mixed_case_not_stripped(self):
        """Test mixed case token is NOT stripped (case sensitive)"""
        text = "Hello<|Im_End|>World"
        result = strip_special_tokens(text)
        assert result == "Hello<|Im_End|>World"

    def test_case_sensitive_exact_match_required(self):
        """Test exact lowercase match is required for stripping"""
        text = "Hello<|im_end|>World"
        result = strip_special_tokens(text)
        assert result == "HelloWorld"
        assert "<|im_end|>" not in result

    # ============================================================================
    # Test Similar But Different Strings
    # ============================================================================

    def test_partial_token_not_stripped(self):
        """Test partial token string is not stripped"""
        text = "This has <|im_end in it"
        result = strip_special_tokens(text)
        # Partial token should remain
        assert result == text

    def test_token_with_extra_characters_not_stripped(self):
        """Test token with extra characters is not stripped"""
        text = "Hello<|im_end|>extra>World"
        result = strip_special_tokens(text)
        # Only exact token should be stripped
        assert result == "Helloextra>World"

    def test_token_substring_in_word_not_stripped(self):
        """Test token-like substring within a word is not affected"""
        text = "The </s>ending tag is here"
        result = strip_special_tokens(text)
        # </s> token should be stripped, but "ending" remains
        assert result == "The ending tag is here"

    # ============================================================================
    # Test Streaming Use Case
    # ============================================================================

    def test_strip_streaming_chunk_with_token(self):
        """Test stripping token from streaming chunk"""
        chunk = "Hello<|im_end|>"
        result = strip_special_tokens(chunk)
        assert result == "Hello"

    def test_strip_streaming_chunk_only_token(self):
        """Test streaming chunk containing only token becomes empty"""
        chunk = "<|endoftext|>"
        result = strip_special_tokens(chunk)
        assert result == ""

    def test_strip_streaming_chunk_clean_text(self):
        """Test streaming chunk with no tokens passes through"""
        chunk = "This is a normal chunk"
        result = strip_special_tokens(chunk)
        assert result == chunk

    def test_strip_streaming_chunk_token_at_start(self):
        """Test streaming chunk starting with token"""
        chunk = "</s>Next chunk content"
        result = strip_special_tokens(chunk)
        assert result == "Next chunk content"

    def test_strip_streaming_multiple_chunks_with_tokens(self):
        """Test stripping tokens from sequence of streaming chunks"""
        chunks = [
            "<|im_start|>user",
            "\nHello<|im_end|>",
            "<|im_start|>assistant",
            "\nHi there</s>"
        ]
        results = [strip_special_tokens(chunk) for chunk in chunks]
        assert results == ["user", "\nHello", "assistant", "\nHi there"]

    # ============================================================================
    # Test Real-World Scenarios
    # ============================================================================

    def test_strip_qwen_response_format(self):
        """Test stripping tokens from Qwen model response"""
        text = "<|im_start|>assistant\nThe answer is 42.<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "assistant\nThe answer is 42."

    def test_strip_llama3_response_format(self):
        """Test stripping tokens from Llama 3.x model response"""
        text = "<|begin_of_text|><|start_header_id|>assistant<|end_header_id|>\n\nHello!<|eot_id|>"
        result = strip_special_tokens(text)
        assert result == "assistant\n\nHello!"

    def test_strip_gpt_style_completion(self):
        """Test stripping tokens from GPT-style completion"""
        text = "This is the response.<|endoftext|>"
        result = strip_special_tokens(text)
        assert result == "This is the response."

    def test_strip_mixed_format_response(self):
        """Test stripping tokens when model mixes formats (edge case)"""
        text = "<|im_start|>Some text</s>More text<|endoftext|>"
        result = strip_special_tokens(text)
        assert result == "Some textMore text"

    def test_strip_code_block_with_tokens(self):
        """Test stripping tokens from response containing code block"""
        text = "```python\nprint('hello')\n```<|im_end|>"
        result = strip_special_tokens(text)
        assert result == "```python\nprint('hello')\n```"
        assert "```python" in result

    def test_strip_multiline_response_with_tokens(self):
        """Test stripping tokens from multi-line response"""
        text = """<|im_start|>assistant
Here is a multi-line
response with several
lines of content<|im_end|>"""
        result = strip_special_tokens(text)
        expected = """assistant
Here is a multi-line
response with several
lines of content"""
        assert result == expected

    def test_strip_json_response_with_tokens(self):
        """Test stripping tokens from JSON response"""
        text = '{"result": "success"}<|endoftext|>'
        result = strip_special_tokens(text)
        assert result == '{"result": "success"}'

    def test_strip_empty_response_after_tokens(self):
        """Test response that becomes empty after stripping tokens"""
        text = "<|im_start|><|im_end|></s><|endoftext|>"
        result = strip_special_tokens(text)
        assert result == ""
        assert len(result) == 0

    # ============================================================================
    # Test Token List Verification
    # ============================================================================

    def test_special_tokens_list_contains_required_tokens(self):
        """Test SPECIAL_TOKENS_TO_STRIP contains all required tokens"""
        required_tokens = [
            "<|im_end|>",
            "<|im_start|>",
            "<|endoftext|>",
            "<|end|>",
            "</s>",
        ]
        for token in required_tokens:
            assert token in SPECIAL_TOKENS_TO_STRIP, f"Missing token: {token}"

    def test_special_tokens_list_may_contain_llama3_tokens(self):
        """Test SPECIAL_TOKENS_TO_STRIP may contain Llama 3.x tokens"""
        llama3_tokens = [
            "<|begin_of_text|>",
            "<|eot_id|>",
            "<|start_header_id|>",
            "<|end_header_id|>",
        ]
        # These may or may not be in the list yet - test is informational
        # If they are added, the individual token tests above will verify stripping
        for token in llama3_tokens:
            if token in SPECIAL_TOKENS_TO_STRIP:
                # Verify it gets stripped if it's in the list
                text = f"Test{token}Content"
                result = strip_special_tokens(text)
                assert token not in result

    def test_special_tokens_list_contains_reasoning_tokens(self):
        """Test SPECIAL_TOKENS_TO_STRIP contains all reasoning tokens (Issue #46)"""
        reasoning_tokens = [
            "<think>",
            "</think>",
            "<reasoning>",
            "</reasoning>",
            "<thinking>",
            "</thinking>",
            "<thought>",
            "</thought>",
            "<reflection>",
            "</reflection>",
            "<|thinking>",
            "</|thinking>",
            "<output>",
            "</output>",
        ]
        for token in reasoning_tokens:
            assert token in SPECIAL_TOKENS_TO_STRIP, f"Missing reasoning token: {token} (Issue #46)"

    # ============================================================================
    # Test Performance Edge Cases
    # ============================================================================

    def test_strip_very_long_text(self):
        """Test stripping tokens from very long text"""
        long_text = "A" * 10000 + "<|im_end|>" + "B" * 10000
        result = strip_special_tokens(long_text)
        assert len(result) == 20000
        assert "<|im_end|>" not in result

    def test_strip_many_tokens_in_long_text(self):
        """Test stripping many tokens scattered in long text"""
        # Create text with tokens every 100 chars
        segments = ["Text segment " + str(i) for i in range(100)]
        text = "</s>".join(segments)
        result = strip_special_tokens(text)
        assert "</s>" not in result
        assert "Text segment 0" in result
        assert "Text segment 99" in result

    def test_strip_does_not_modify_similar_patterns(self):
        """Test that similar but different patterns are not modified"""
        text = "The tag <|custom|> and text </span> remain"
        result = strip_special_tokens(text)
        # Only exact special tokens should be stripped
        assert result == text


class TestTokenStrippingIntegration:
    """Integration tests for token stripping in server context"""

    def test_strip_preserves_content_quality(self):
        """Test token stripping preserves response content quality"""
        # Simulate a real model response with tokens
        response = "<|im_start|>assistant\nTo solve this problem, you need to:\n1. First step\n2. Second step\n3. Third step<|im_end|>"
        result = strip_special_tokens(response)

        # Content should be preserved
        assert "To solve this problem" in result
        assert "1. First step" in result
        assert "2. Second step" in result
        assert "3. Third step" in result
        # Tokens should be removed
        assert "<|im_start|>" not in result
        assert "<|im_end|>" not in result

    def test_strip_handles_tool_calling_response(self):
        """Test token stripping with tool calling response format"""
        response = """<|im_start|>assistant
<tool_call>
{"name": "Read", "arguments": {"file_path": "test.txt"}}
</tool_call><|im_end|>"""
        result = strip_special_tokens(response)

        # Tool call content should be preserved
        assert "<tool_call>" in result
        assert "Read" in result
        assert "test.txt" in result
        # Special tokens should be removed
        assert "<|im_start|>" not in result
        assert "<|im_end|>" not in result

    def test_strip_idempotent(self):
        """Test that stripping twice gives same result as stripping once"""
        text = "Hello<|im_end|>World</s>"
        result1 = strip_special_tokens(text)
        result2 = strip_special_tokens(result1)
        assert result1 == result2
        assert result1 == "HelloWorld"

    def test_strip_commutative_with_whitespace_trim(self):
        """Test that stripping and trimming can be done in any order"""
        text = "  <|im_start|>content<|im_end|>  "

        # Strip then trim
        result1 = strip_special_tokens(text).strip()

        # Trim then strip
        result2 = strip_special_tokens(text.strip())

        # Results should contain same core content
        assert "content" in result1
        assert "content" in result2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
