#!/usr/bin/env python3
"""
Unit Tests: MLX Worker Inference Engine

Tests for the MLX inference engine that handles model loading,
token generation, and token counting.

Expected to FAIL until inference.py implementation is complete (TDD Red Phase)

Test Coverage:
- Model loading with mlx_lm
- Streaming token generation via generator
- Token counting accuracy
- Error handling for missing models
- Memory management
- Configuration validation
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, call
from typing import Generator, List, Dict, Any

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / 'src'
sys.path.insert(0, str(src_path))

# This import will fail until implementation is complete
try:
    from mlx_worker.inference import (
        load_model,
        generate_stream,
        count_tokens,
        InferenceError,
        ModelNotFoundError,
        _inject_tool_instruction
    )
except ImportError:
    # Mock classes for TDD red phase
    class InferenceError(Exception):
        """Base exception for inference errors"""
        pass

    class ModelNotFoundError(InferenceError):
        """Raised when model file not found"""
        pass

    def load_model(model_path: str) -> Any:
        raise NotImplementedError("load_model not yet implemented")

    def generate_stream(messages: List[Dict[str, str]], **kwargs) -> Generator[str, None, None]:
        raise NotImplementedError("generate_stream not yet implemented")
        yield ""  # Make it a generator

    def count_tokens(text: str) -> int:
        raise NotImplementedError("count_tokens not yet implemented")

    def _inject_tool_instruction(messages, tools):
        raise NotImplementedError("_inject_tool_instruction not yet implemented")


class TestModelLoading:
    """Test model loading functionality"""

    @patch('mlx_worker.inference.mlx_lm')
    def test_load_model_success(self, mock_mlx_lm):
        """Test successful model loading"""
        # Setup mock
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_mlx_lm.load.return_value = (mock_model, mock_tokenizer)

        # Load model
        model, tokenizer = load_model("models/Qwen2.5-Coder-7B")

        # Verify mlx_lm.load was called
        mock_mlx_lm.load.assert_called_once_with("models/Qwen2.5-Coder-7B")

        # Verify returns are correct
        assert model == mock_model
        assert tokenizer == mock_tokenizer

    @patch('mlx_worker.inference.mlx_lm')
    def test_load_model_not_found(self, mock_mlx_lm):
        """Test error when model path doesn't exist"""
        # Setup mock to raise FileNotFoundError
        mock_mlx_lm.load.side_effect = FileNotFoundError("Model not found")

        # Should raise ModelNotFoundError
        with pytest.raises(ModelNotFoundError) as exc_info:
            load_model("models/nonexistent-model")

        assert "Model not found" in str(exc_info.value)

    @patch('mlx_worker.inference.mlx_lm')
    def test_load_model_caches_result(self, mock_mlx_lm):
        """Test model loading caches result for same path"""
        # Setup mock
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_mlx_lm.load.return_value = (mock_model, mock_tokenizer)

        # Load same model twice
        model1, tokenizer1 = load_model("models/test-model")
        model2, tokenizer2 = load_model("models/test-model")

        # mlx_lm.load should only be called once (cached)
        mock_mlx_lm.load.assert_called_once()

        # Should return same instances
        assert model1 is model2
        assert tokenizer1 is tokenizer2

    @patch('mlx_worker.inference.mlx_lm')
    def test_load_model_different_paths(self, mock_mlx_lm):
        """Test loading different models doesn't use cache"""
        # Setup mock
        mock_model1 = MagicMock()
        mock_tokenizer1 = MagicMock()
        mock_model2 = MagicMock()
        mock_tokenizer2 = MagicMock()

        mock_mlx_lm.load.side_effect = [
            (mock_model1, mock_tokenizer1),
            (mock_model2, mock_tokenizer2)
        ]

        # Load different models
        model1, tokenizer1 = load_model("models/model-1")
        model2, tokenizer2 = load_model("models/model-2")

        # mlx_lm.load should be called twice
        assert mock_mlx_lm.load.call_count == 2

        # Should return different instances
        assert model1 is not model2
        assert tokenizer1 is not tokenizer2

    @patch('mlx_worker.inference.mlx_lm')
    def test_load_model_with_custom_config(self, mock_mlx_lm):
        """Test loading model with custom configuration"""
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_mlx_lm.load.return_value = (mock_model, mock_tokenizer)

        # Load with config
        model, tokenizer = load_model(
            "models/test-model",
            config={"max_tokens": 4096}
        )

        # Verify config was passed through
        mock_mlx_lm.load.assert_called_once_with(
            "models/test-model",
            config={"max_tokens": 4096}
        )


class TestStreamingGeneration:
    """Test streaming token generation"""

    @pytest.fixture
    def mock_model(self):
        """Mock MLX model for testing"""
        model = MagicMock()
        model.generate = MagicMock()
        return model

    @pytest.fixture
    def mock_tokenizer(self):
        """Mock tokenizer for testing"""
        tokenizer = MagicMock()
        tokenizer.encode.return_value = [1, 2, 3]  # Mock token IDs
        tokenizer.decode.side_effect = lambda tokens: " ".join(str(t) for t in tokens)
        return tokenizer

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_yields_tokens(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream yields tokens as they're generated"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock streaming output
        mock_model.generate.return_value = iter([
            "Hello",
            " world",
            "!",
            " How",
            " are",
            " you",
            "?"
        ])

        # Generate stream
        messages = [{"role": "user", "content": "Hello"}]
        tokens = list(generate_stream(messages))

        # Verify yields all tokens
        assert tokens == ["Hello", " world", "!", " How", " are", " you", "?"]

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_with_max_tokens(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream respects max_tokens parameter"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock streaming output
        mock_model.generate.return_value = iter(["token1", "token2", "token3"])

        # Generate with max_tokens
        messages = [{"role": "user", "content": "Test"}]
        list(generate_stream(messages, max_tokens=100))

        # Verify max_tokens was passed to generate
        mock_model.generate.assert_called_once()
        call_kwargs = mock_model.generate.call_args[1]
        assert call_kwargs.get('max_tokens') == 100

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_with_temperature(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream respects temperature parameter"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_model.generate.return_value = iter(["test"])

        messages = [{"role": "user", "content": "Test"}]
        list(generate_stream(messages, temperature=0.7))

        # Verify temperature was passed
        call_kwargs = mock_model.generate.call_args[1]
        assert call_kwargs.get('temperature') == 0.7

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_with_top_p(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream respects top_p parameter"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_model.generate.return_value = iter(["test"])

        messages = [{"role": "user", "content": "Test"}]
        list(generate_stream(messages, top_p=0.9))

        # Verify top_p was passed
        call_kwargs = mock_model.generate.call_args[1]
        assert call_kwargs.get('top_p') == 0.9

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_formats_messages(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream properly formats message history"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_model.generate.return_value = iter(["response"])

        # Multi-turn conversation
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"}
        ]

        list(generate_stream(messages))

        # Verify messages were formatted and passed
        mock_model.generate.assert_called_once()
        call_args = mock_model.generate.call_args[0]
        assert len(call_args) > 0  # Should have formatted prompt

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_handles_empty_messages(self, mock_load_model):
        """Test generate_stream handles empty message list"""
        mock_load_model.return_value = (MagicMock(), MagicMock())

        with pytest.raises(ValueError) as exc_info:
            list(generate_stream([]))

        assert "messages cannot be empty" in str(exc_info.value).lower()

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_handles_generation_error(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream handles errors during generation"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock generation error
        def raise_error():
            yield "token1"
            raise RuntimeError("Generation failed")

        mock_model.generate.return_value = raise_error()

        messages = [{"role": "user", "content": "Test"}]

        with pytest.raises(InferenceError) as exc_info:
            list(generate_stream(messages))

        assert "Generation failed" in str(exc_info.value)

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_with_cache_prompt(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream enables cache_prompt for KV caching"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_model.generate.return_value = iter(["test"])

        messages = [{"role": "user", "content": "Test"}]
        list(generate_stream(messages, cache_prompt=True))

        # Verify cache_prompt was enabled
        call_kwargs = mock_model.generate.call_args[1]
        assert call_kwargs.get('cache_prompt') is True

    @patch('mlx_worker.inference.load_model')
    def test_generate_stream_yields_immediately(self, mock_load_model, mock_model, mock_tokenizer):
        """Test generate_stream is a true generator (yields immediately)"""
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock streaming with delay
        def slow_generate():
            yield "first"
            # In real usage, there would be computation here
            yield "second"

        mock_model.generate.return_value = slow_generate()

        messages = [{"role": "user", "content": "Test"}]
        gen = generate_stream(messages)

        # First token should be available immediately
        first_token = next(gen)
        assert first_token == "first"


class TestTokenCounting:
    """Test token counting functionality"""

    @patch('mlx_worker.inference.load_model')
    def test_count_tokens_simple_text(self, mock_load_model):
        """Test count_tokens with simple text"""
        mock_tokenizer = MagicMock()
        mock_tokenizer.encode.return_value = [1, 2, 3, 4, 5]
        mock_load_model.return_value = (MagicMock(), mock_tokenizer)

        # Count tokens
        count = count_tokens("Hello world")

        # Should return length of encoded tokens
        assert count == 5

    @patch('mlx_worker.inference.load_model')
    def test_count_tokens_empty_string(self, mock_load_model):
        """Test count_tokens with empty string"""
        mock_tokenizer = MagicMock()
        mock_tokenizer.encode.return_value = []
        mock_load_model.return_value = (MagicMock(), mock_tokenizer)

        count = count_tokens("")
        assert count == 0

    @patch('mlx_worker.inference.load_model')
    def test_count_tokens_long_text(self, mock_load_model):
        """Test count_tokens with long text"""
        mock_tokenizer = MagicMock()
        # Simulate long text encoding
        mock_tokenizer.encode.return_value = list(range(1000))
        mock_load_model.return_value = (MagicMock(), mock_tokenizer)

        long_text = "This is a long text " * 100
        count = count_tokens(long_text)

        assert count == 1000

    @patch('mlx_worker.inference.load_model')
    def test_count_tokens_special_characters(self, mock_load_model):
        """Test count_tokens with special characters"""
        mock_tokenizer = MagicMock()
        mock_tokenizer.encode.return_value = [1, 2, 3]
        mock_load_model.return_value = (MagicMock(), mock_tokenizer)

        text = "Hello\n\nWorld!\t@#$%"
        count = count_tokens(text)

        # Should encode special characters
        assert count == 3
        mock_tokenizer.encode.assert_called_once_with(text)

    @patch('mlx_worker.inference.load_model')
    def test_count_tokens_unicode(self, mock_load_model):
        """Test count_tokens with unicode characters"""
        mock_tokenizer = MagicMock()
        mock_tokenizer.encode.return_value = [1, 2, 3, 4]
        mock_load_model.return_value = (MagicMock(), mock_tokenizer)

        text = "Hello 世界 🌍"
        count = count_tokens(text)

        assert count == 4

    @patch('mlx_worker.inference.load_model')
    def test_count_tokens_caches_tokenizer(self, mock_load_model):
        """Test count_tokens reuses cached tokenizer"""
        mock_tokenizer = MagicMock()
        mock_tokenizer.encode.return_value = [1, 2]
        mock_load_model.return_value = (MagicMock(), mock_tokenizer)

        # Count tokens twice
        count_tokens("test1")
        count_tokens("test2")

        # load_model should only be called once (cached)
        mock_load_model.assert_called_once()


class TestInferenceErrorHandling:
    """Test error handling in inference module"""

    @patch('mlx_worker.inference.mlx_lm')
    def test_inference_error_includes_context(self, mock_mlx_lm):
        """Test InferenceError includes helpful context"""
        mock_mlx_lm.load.side_effect = RuntimeError("CUDA error")

        with pytest.raises(InferenceError) as exc_info:
            load_model("models/test")

        error_msg = str(exc_info.value)
        # Should include original error message
        assert "CUDA error" in error_msg
        # Should include model path
        assert "models/test" in error_msg

    @patch('mlx_worker.inference.load_model')
    def test_generation_error_preserves_partial_output(self, mock_load_model):
        """Test that partial output is available before error"""
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Generate some tokens then fail
        def partial_generate():
            yield "token1"
            yield "token2"
            raise RuntimeError("Generation interrupted")

        mock_model.generate.return_value = partial_generate()

        messages = [{"role": "user", "content": "Test"}]
        gen = generate_stream(messages)

        # Should get partial tokens
        tokens = []
        with pytest.raises(InferenceError):
            for token in gen:
                tokens.append(token)

        # Should have received tokens before error
        assert tokens == ["token1", "token2"]


class TestInferenceConfiguration:
    """Test configuration and initialization"""

    @patch('mlx_worker.inference.mlx_lm')
    def test_supports_multiple_model_formats(self, mock_mlx_lm):
        """Test loading different model formats"""
        mock_mlx_lm.load.return_value = (MagicMock(), MagicMock())

        # Should support various formats
        load_model("models/model.safetensors")
        load_model("models/model.gguf")
        load_model("models/model-folder/")

        assert mock_mlx_lm.load.call_count == 3

    @patch('mlx_worker.inference.load_model')
    def test_default_generation_parameters(self, mock_load_model):
        """Test default parameters for generation"""
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_model.generate.return_value = iter(["test"])

        messages = [{"role": "user", "content": "Test"}]
        list(generate_stream(messages))

        # Check default parameters
        call_kwargs = mock_model.generate.call_args[1]
        assert 'max_tokens' in call_kwargs
        assert 'temperature' in call_kwargs
        assert call_kwargs.get('max_tokens', 0) > 0  # Should have reasonable default


class TestMemoryManagement:
    """Test memory management and resource cleanup"""

    @patch('mlx_worker.inference.mlx_lm')
    def test_model_cleanup_on_error(self, mock_mlx_lm):
        """Test model is cleaned up if loading fails partway"""
        # Mock partial load that fails
        mock_mlx_lm.load.side_effect = MemoryError("Out of memory")

        with pytest.raises(InferenceError):
            load_model("models/large-model")

        # In implementation, should ensure cleanup happens
        # This test verifies error is raised properly

    @patch('mlx_worker.inference.load_model')
    def test_generation_releases_resources_on_completion(self, mock_load_model):
        """Test resources are released after generation completes"""
        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_load_model.return_value = (mock_model, mock_tokenizer)
        mock_model.generate.return_value = iter(["token1", "token2"])

        messages = [{"role": "user", "content": "Test"}]
        tokens = list(generate_stream(messages))

        assert len(tokens) == 2
        # Generator should be exhausted and resources freed


class TestToolInstructionInjection:
    """Test tool instruction injection for local models"""

    @pytest.fixture
    def read_tool(self):
        """Sample Read tool definition"""
        return {
            "type": "function",
            "function": {
                "name": "Read",
                "description": "Read a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string"}
                    }
                }
            }
        }

    @pytest.fixture
    def bash_tool(self):
        """Sample Bash tool definition"""
        return {
            "type": "function",
            "function": {
                "name": "Bash",
                "description": "Execute bash command",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string"}
                    }
                }
            }
        }

    @pytest.fixture
    def glob_tool(self):
        """Sample Glob tool definition"""
        return {
            "type": "function",
            "function": {
                "name": "Glob",
                "description": "Find files",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string"}
                    }
                }
            }
        }

    @pytest.fixture
    def web_search_tool(self):
        """Sample WebSearch tool definition"""
        return {
            "type": "function",
            "function": {
                "name": "WebSearch",
                "description": "Search the web",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "allowed_domains": {"type": "array"},
                        "blocked_domains": {"type": "array"}
                    },
                    "required": ["query"]
                }
            }
        }

    @pytest.fixture
    def web_fetch_tool(self):
        """Sample WebFetch tool definition"""
        return {
            "type": "function",
            "function": {
                "name": "WebFetch",
                "description": "Fetch web content",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "prompt": {"type": "string"}
                    },
                    "required": ["url", "prompt"]
                }
            }
        }

    def test_inject_tool_instruction_read_keyword(self, read_tool):
        """Test injection when user mentions 'read file' keyword"""
        messages = [
            {"role": "user", "content": "Please read the file README.md"}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        # Should inject instruction mentioning Read tool
        assert "[IMPORTANT:" in result[0]['content']
        assert "Read" in result[0]['content']
        assert "MUST call" in result[0]['content']

    def test_inject_tool_instruction_show_keyword(self, read_tool):
        """Test injection when user uses 'show me the contents' (maps to Read)"""
        messages = [
            {"role": "user", "content": "Show me the contents of package.json"}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "Read" in result[0]['content']

    def test_inject_tool_instruction_run_keyword(self, bash_tool):
        """Test injection when user uses 'run command' (maps to Bash)"""
        messages = [
            {"role": "user", "content": "Run the command ls -la in the current directory"}
        ]

        result = _inject_tool_instruction(messages, [bash_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "Bash" in result[0]['content']

    def test_inject_tool_instruction_find_keyword(self, glob_tool):
        """Test injection when user uses 'find files' (maps to Glob)"""
        messages = [
            {"role": "user", "content": "Find files with .py extension in the project"}
        ]

        result = _inject_tool_instruction(messages, [glob_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "Glob" in result[0]['content']

    def test_inject_tool_instruction_no_matching_keyword(self, read_tool):
        """Test no injection when user message has no tool keywords"""
        messages = [
            {"role": "user", "content": "What is the capital of France?"}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        # Should not inject instruction
        assert "[IMPORTANT:" not in result[0]['content']
        assert result[0]['content'] == "What is the capital of France?"

    def test_inject_tool_instruction_tool_not_available(self, bash_tool):
        """Test no injection when matching tool is not available"""
        messages = [
            {"role": "user", "content": "Read the file README.md"}
        ]

        # Only Bash tool is available, but user wants to read
        result = _inject_tool_instruction(messages, [bash_tool])

        # Should not inject since Read tool not available
        assert "[IMPORTANT:" not in result[0]['content']

    def test_inject_tool_instruction_preserves_original_content(self, read_tool):
        """Test original message content is preserved"""
        original_content = "Please read the file config.yaml"
        messages = [
            {"role": "user", "content": original_content}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        # Original content should be preserved (at the start)
        assert result[0]['content'].startswith(original_content)

    def test_inject_tool_instruction_does_not_mutate_original(self, read_tool):
        """Test original messages list is not mutated"""
        messages = [
            {"role": "user", "content": "Please read the file README.md"}
        ]
        original_content = messages[0]['content']

        _inject_tool_instruction(messages, [read_tool])

        # Original should not be modified
        assert messages[0]['content'] == original_content

    def test_inject_tool_instruction_last_user_message(self, read_tool):
        """Test injection targets the last user message"""
        messages = [
            {"role": "user", "content": "First question"},
            {"role": "assistant", "content": "First answer"},
            {"role": "user", "content": "Read the file please"}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        # Only last user message should have injection
        assert "[IMPORTANT:" not in result[0]['content']
        assert "[IMPORTANT:" in result[2]['content']

    def test_inject_tool_instruction_empty_tools(self):
        """Test no injection when tools list is empty"""
        messages = [
            {"role": "user", "content": "Read the file README.md"}
        ]

        result = _inject_tool_instruction(messages, [])

        # Should not inject when no tools available
        assert "[IMPORTANT:" not in result[0]['content']

    def test_inject_tool_instruction_empty_messages(self, read_tool):
        """Test handles empty messages list"""
        result = _inject_tool_instruction([], [read_tool])

        assert result == []

    def test_inject_tool_instruction_no_user_messages(self, read_tool):
        """Test handles messages with no user role"""
        messages = [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "assistant", "content": "How can I help?"}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        # Should return unchanged (no user message to inject into)
        assert len(result) == 2
        assert "[IMPORTANT:" not in result[0]['content']
        assert "[IMPORTANT:" not in result[1]['content']

    def test_inject_tool_instruction_multiple_keywords(self, read_tool, bash_tool):
        """Test with message containing multiple tool keywords"""
        messages = [
            {"role": "user", "content": "Read the file and then run the command pytest"}
        ]

        result = _inject_tool_instruction(messages, [read_tool, bash_tool])

        # Should inject for first matching tool
        assert "[IMPORTANT:" in result[0]['content']
        # Should mention one of the tools
        assert "Read" in result[0]['content'] or "Bash" in result[0]['content']

    def test_inject_tool_instruction_case_insensitive(self, read_tool):
        """Test keyword matching is case insensitive"""
        messages = [
            {"role": "user", "content": "READ THE FILE readme.md please"}
        ]

        result = _inject_tool_instruction(messages, [read_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "Read" in result[0]['content']

    def test_inject_tool_instruction_alternative_tool_format(self):
        """Test with tool definitions using 'name' at top level"""
        tool = {
            "name": "Write",
            "description": "Write a file"
        }
        messages = [
            {"role": "user", "content": "Write to file output.txt the results"}
        ]

        result = _inject_tool_instruction(messages, [tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "Write" in result[0]['content']


class TestWebSearchToolInjection:
    """Test WebSearch/WebFetch tool instruction injection with all 11 keywords"""

    @pytest.fixture
    def web_search_tool(self):
        """Sample WebSearch tool definition"""
        return {
            "name": "WebSearch",
            "description": "Search the web using current information",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"}
                },
                "required": ["query"]
            }
        }

    @pytest.fixture
    def web_fetch_tool(self):
        """Sample WebFetch tool definition"""
        return {
            "name": "WebFetch",
            "description": "Fetch web content from URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "prompt": {"type": "string"}
                },
                "required": ["url", "prompt"]
            }
        }

    # ============================================================================
    # Test All 11 WebSearch Keywords
    # ============================================================================

    def test_keyword_search_the_internet(self, web_search_tool):
        """Test 'search the internet' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Search the internet for React best practices"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']
        assert "MUST call" in result[0]['content']

    def test_keyword_search_internet(self, web_search_tool):
        """Test 'search internet' keyword (short form) triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Search internet for TypeScript tutorials"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_search_the_web(self, web_search_tool):
        """Test 'search the web' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Search the web for latest AI news"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_search_web(self, web_search_tool):
        """Test 'search web' keyword (short form) triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Search web for Python documentation"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_look_up_online(self, web_search_tool):
        """Test 'look up online' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Look up online the current Bitcoin price"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_find_online(self, web_search_tool):
        """Test 'find online' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Find online information about GraphQL"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_google(self, web_search_tool):
        """Test 'google' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Google the latest Node.js version"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_search_for_information(self, web_search_tool):
        """Test 'search for information' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Search for information about Rust programming"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_what_is_the_latest(self, web_search_tool):
        """Test 'what is the latest' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "What is the latest version of React?"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_current_news(self, web_search_tool):
        """Test 'current news' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "What is the current news about AI regulation?"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_recent_developments(self, web_search_tool):
        """Test 'recent developments' keyword triggers WebSearch"""
        messages = [
            {"role": "user", "content": "Tell me about recent developments in quantum computing"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    # ============================================================================
    # Test Case Insensitivity
    # ============================================================================

    def test_keyword_case_insensitive(self, web_search_tool):
        """Test keywords are matched case-insensitively"""
        messages = [
            {"role": "user", "content": "SEARCH THE INTERNET for React tutorials"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_keyword_mixed_case(self, web_search_tool):
        """Test mixed case keywords are matched"""
        messages = [
            {"role": "user", "content": "Search The Web for documentation"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    # ============================================================================
    # Test Word Boundary Behavior
    # ============================================================================

    def test_word_boundary_research_not_search(self, web_search_tool):
        """Test 'research' does NOT trigger 'search' (word boundary)"""
        messages = [
            {"role": "user", "content": "I will research this topic thoroughly"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Should NOT inject WebSearch instruction
        assert "[IMPORTANT:" not in result[0]['content']

    def test_word_boundary_searching_not_search(self, web_search_tool):
        """Test 'searching' within word does NOT trigger (word boundary)"""
        messages = [
            {"role": "user", "content": "The algorithm is searching internally"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Should NOT inject WebSearch instruction
        assert "[IMPORTANT:" not in result[0]['content']

    def test_word_boundary_search_standalone(self, web_search_tool):
        """Test 'search' at word boundary DOES trigger"""
        messages = [
            {"role": "user", "content": "Search the internet for answers"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_word_boundary_google_standalone(self, web_search_tool):
        """Test 'google' as standalone word triggers"""
        messages = [
            {"role": "user", "content": "Google this for me please"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    def test_word_boundary_googled_not_google(self, web_search_tool):
        """Test 'googled' does NOT trigger (strict word boundary)"""
        messages = [
            {"role": "user", "content": "I googled this yesterday"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Strict word boundary: should NOT match
        assert "[IMPORTANT:" not in result[0]['content']

    # ============================================================================
    # Test False Positive Prevention
    # ============================================================================

    def test_false_positive_research_shows(self, web_search_tool):
        """Test 'research shows' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Research shows that TypeScript improves code quality"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_research_suggests(self, web_search_tool):
        """Test 'research suggests' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Research suggests using async/await over promises"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_research_indicates(self, web_search_tool):
        """Test 'research indicates' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Research indicates that React is very popular"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_search_this_document(self, web_search_tool):
        """Test 'search this document' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Search this document for the configuration section"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_search_this_file(self, web_search_tool):
        """Test 'search this file' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Search this file for the function definition"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_search_the_code(self, web_search_tool):
        """Test 'search the code' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Search the code for all instances of TODO"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_current_directory(self, web_search_tool):
        """Test 'current directory' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "Check the current directory for package.json"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_current_file(self, web_search_tool):
        """Test 'current file' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "The current file needs to be refactored"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    def test_false_positive_current_function(self, web_search_tool):
        """Test 'current function' does NOT trigger WebSearch"""
        messages = [
            {"role": "user", "content": "The current function has a bug"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        assert "[IMPORTANT:" not in result[0]['content']

    # ============================================================================
    # Test WebFetch Keywords
    # ============================================================================

    def test_webfetch_keyword_fetch(self, web_fetch_tool):
        """Test 'fetch' keyword triggers WebFetch"""
        messages = [
            {"role": "user", "content": "Fetch the content from https://example.com/docs"}
        ]
        result = _inject_tool_instruction(messages, [web_fetch_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebFetch" in result[0]['content']

    def test_webfetch_keyword_download(self, web_fetch_tool):
        """Test 'download' keyword triggers WebFetch"""
        messages = [
            {"role": "user", "content": "Download the page at https://github.com/repo/readme"}
        ]
        result = _inject_tool_instruction(messages, [web_fetch_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebFetch" in result[0]['content']

    def test_webfetch_keyword_get_from_url(self, web_fetch_tool):
        """Test 'get from url' keyword triggers WebFetch"""
        messages = [
            {"role": "user", "content": "Get from url https://api.example.com/data"}
        ]
        result = _inject_tool_instruction(messages, [web_fetch_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebFetch" in result[0]['content']

    def test_webfetch_keyword_scrape(self, web_fetch_tool):
        """Test 'scrape' keyword triggers WebFetch"""
        messages = [
            {"role": "user", "content": "Scrape the documentation from https://docs.example.com"}
        ]
        result = _inject_tool_instruction(messages, [web_fetch_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebFetch" in result[0]['content']

    def test_webfetch_url_pattern_detection(self, web_fetch_tool):
        """Test URL pattern in message suggests WebFetch"""
        messages = [
            {"role": "user", "content": "Get the data from https://api.example.com/v1/users"}
        ]
        result = _inject_tool_instruction(messages, [web_fetch_tool])

        assert "[IMPORTANT:" in result[0]['content']
        assert "WebFetch" in result[0]['content']

    # ============================================================================
    # Test Tool Not Available
    # ============================================================================

    def test_no_injection_when_tool_not_available(self, web_search_tool):
        """Test no injection when WebSearch tool not in available tools"""
        other_tool = {
            "name": "Read",
            "description": "Read a file"
        }
        messages = [
            {"role": "user", "content": "Search the internet for React tutorials"}
        ]

        # Only Read tool available, not WebSearch
        result = _inject_tool_instruction(messages, [other_tool])

        # Should NOT inject since WebSearch not available
        assert "[IMPORTANT:" not in result[0]['content']

    def test_no_injection_when_no_keywords_match(self, web_search_tool):
        """Test no injection when message has no matching keywords"""
        messages = [
            {"role": "user", "content": "What is the capital of France?"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Should NOT inject
        assert "[IMPORTANT:" not in result[0]['content']

    # ============================================================================
    # Test Integration with Other Tools
    # ============================================================================

    def test_differentiate_grep_vs_websearch(self, web_search_tool):
        """Test distinguishing Grep (code search) from WebSearch (internet)"""
        grep_tool = {
            "name": "Grep",
            "description": "Search files"
        }

        # Code search should prefer Grep
        grep_messages = [
            {"role": "user", "content": "Search for TODO in the codebase"}
        ]
        grep_result = _inject_tool_instruction(grep_messages, [grep_tool, web_search_tool])
        assert "Grep" in grep_result[0]['content']

        # Internet search should prefer WebSearch
        web_messages = [
            {"role": "user", "content": "Search the internet for TODO list apps"}
        ]
        web_result = _inject_tool_instruction(web_messages, [grep_tool, web_search_tool])
        assert "WebSearch" in web_result[0]['content']

    def test_multiple_keywords_in_message(self, web_search_tool):
        """Test message with multiple WebSearch keywords"""
        messages = [
            {"role": "user", "content": "Google the latest React version and search for information about hooks"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Should inject for WebSearch (first matching tool)
        assert "[IMPORTANT:" in result[0]['content']
        assert "WebSearch" in result[0]['content']

    # ============================================================================
    # Test Edge Cases
    # ============================================================================

    def test_empty_messages(self, web_search_tool):
        """Test handles empty messages list"""
        result = _inject_tool_instruction([], [web_search_tool])
        assert result == []

    def test_no_user_messages(self, web_search_tool):
        """Test handles messages with no user role"""
        messages = [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "assistant", "content": "How can I help?"}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Should return unchanged
        assert len(result) == 2
        assert "[IMPORTANT:" not in result[0]['content']

    def test_preserves_original_content(self, web_search_tool):
        """Test original message content is preserved"""
        original_content = "Search the internet for React best practices"
        messages = [
            {"role": "user", "content": original_content}
        ]
        result = _inject_tool_instruction(messages, [web_search_tool])

        # Original content should be at the start
        assert result[0]['content'].startswith(original_content)

    def test_does_not_mutate_original(self, web_search_tool):
        """Test original messages list is not mutated"""
        messages = [
            {"role": "user", "content": "Search the internet for React"}
        ]
        original_content = messages[0]['content']

        _inject_tool_instruction(messages, [web_search_tool])

        # Original should not be modified
        assert messages[0]['content'] == original_content


class TestKVCachePersistence:
    """Test disk-based KV cache persistence (Issue #56)"""

    @pytest.fixture
    def mock_cache_dir(self, tmp_path):
        """Create temporary cache directory for testing"""
        cache_dir = tmp_path / "kv-cache"
        cache_dir.mkdir()
        return cache_dir

    @pytest.fixture
    def mock_model(self):
        """Mock MLX model for testing"""
        model = MagicMock()
        return model

    @pytest.fixture
    def mock_cache_object(self):
        """Mock KV cache object with state property"""
        cache_obj = MagicMock()
        # Mock keys and values tensors
        keys = MagicMock()
        values = MagicMock()
        cache_obj.state = (keys, values)
        return cache_obj

    @pytest.fixture
    def mock_cache_list(self, mock_cache_object):
        """Mock cache list with multiple layers"""
        return [mock_cache_object for _ in range(3)]

    def test_get_cache_filename(self):
        """Test cache filename generation includes both hashes"""
        from mlx_worker.inference import _get_cache_filename

        filename = _get_cache_filename("abc123", "/path/to/model")

        # Should include both system hash and model hash
        assert "abc123" in filename
        assert filename.endswith(".safetensors")
        assert "_" in filename  # Delimiter between hashes

    def test_get_cache_filename_different_models(self):
        """Test different model paths produce different cache filenames"""
        from mlx_worker.inference import _get_cache_filename

        filename1 = _get_cache_filename("abc123", "/model1")
        filename2 = _get_cache_filename("abc123", "/model2")

        # Same system prompt, different models -> different filenames
        assert filename1 != filename2

    def test_get_cache_filename_different_prompts(self):
        """Test different system prompts produce different cache filenames"""
        from mlx_worker.inference import _get_cache_filename

        filename1 = _get_cache_filename("hash1", "/model")
        filename2 = _get_cache_filename("hash2", "/model")

        # Different system prompts, same model -> different filenames
        assert filename1 != filename2

    @patch('mlx_worker.inference._CACHE_DIR')
    @patch('mlx_worker.inference.mx.save_safetensors')
    def test_save_cache_to_disk_creates_directory(
        self,
        mock_save_safetensors,
        mock_cache_dir_path,
        mock_cache_list,
        mock_cache_dir
    ):
        """Test saving cache creates cache directory if missing"""
        from mlx_worker.inference import _save_cache_to_disk

        mock_cache_dir_path.__truediv__ = lambda self, other: mock_cache_dir / other
        mock_cache_dir_path.mkdir = MagicMock()

        _save_cache_to_disk(mock_cache_list, "abc123", "/model")

        # Should create cache directory
        mock_cache_dir_path.mkdir.assert_called()

    @patch('mlx_worker.inference._CACHE_DIR')
    @patch('mlx_worker.inference.mx.save_safetensors')
    def test_save_cache_to_disk_saves_metadata(
        self,
        mock_save_safetensors,
        mock_cache_dir_path,
        mock_cache_list,
        mock_cache_dir,
        tmp_path
    ):
        """Test saving cache creates metadata.json with correct info"""
        from mlx_worker.inference import _save_cache_to_disk
        import json

        # Mock cache directory
        cache_subdir = tmp_path / "cache_abc123_12345678"
        mock_cache_dir_path.__truediv__ = lambda self, other: tmp_path / other
        mock_cache_dir_path.mkdir = MagicMock()

        _save_cache_to_disk(mock_cache_list, "abc123", "/model")

        # Find created metadata file
        metadata_files = list(tmp_path.rglob("metadata.json"))
        assert len(metadata_files) > 0

        # Verify metadata content
        with open(metadata_files[0]) as f:
            metadata = json.load(f)

        assert metadata["system_hash"] == "abc123"
        assert metadata["model_path"] == "/model"
        assert metadata["num_layers"] == 3
        assert "timestamp" in metadata

    @patch('mlx_worker.inference._CACHE_DIR')
    @patch('mlx_worker.inference.mx.save_safetensors')
    def test_save_cache_to_disk_saves_all_layers(
        self,
        mock_save_safetensors,
        mock_cache_dir_path,
        mock_cache_list,
        tmp_path
    ):
        """Test saving cache saves each layer's KV tensors"""
        from mlx_worker.inference import _save_cache_to_disk

        mock_cache_dir_path.__truediv__ = lambda self, other: tmp_path / other
        mock_cache_dir_path.mkdir = MagicMock()

        _save_cache_to_disk(mock_cache_list, "abc123", "/model")

        # Should call save_safetensors for each layer
        assert mock_save_safetensors.call_count == 3

        # Verify saved with keys and values
        for call in mock_save_safetensors.call_args_list:
            args, kwargs = call
            tensors_dict = args[1]
            assert "keys" in tensors_dict
            assert "values" in tensors_dict

    @patch('mlx_worker.inference._CACHE_DIR')
    def test_save_cache_to_disk_handles_errors_gracefully(
        self,
        mock_cache_dir_path,
        mock_cache_list
    ):
        """Test saving cache handles errors without raising"""
        from mlx_worker.inference import _save_cache_to_disk

        # Mock error during mkdir
        mock_cache_dir_path.mkdir.side_effect = PermissionError("Access denied")

        # Should NOT raise exception (graceful degradation)
        try:
            _save_cache_to_disk(mock_cache_list, "abc123", "/model")
        except Exception as e:
            pytest.fail(f"Should not raise exception: {e}")

    def test_load_cache_from_disk_success(self, tmp_path, mock_model):
        """Test loading cache from disk successfully"""
        from mlx_worker.inference import _load_cache_from_disk, _get_cache_filename
        import mlx_worker.inference as inf
        import json

        # Create mock cache objects with state property
        mock_cache_list = []
        for _ in range(3):
            cache_obj = MagicMock()
            cache_obj.state = (MagicMock(), MagicMock())
            mock_cache_list.append(cache_obj)

        # Setup cache directory structure
        cache_filename = _get_cache_filename("abc123", "/model")
        cache_subdir = tmp_path / cache_filename.replace(".safetensors", "")
        cache_subdir.mkdir(parents=True)

        # Create metadata
        metadata = {
            "system_hash": "abc123",
            "model_path": "/model",
            "num_layers": 3,
            "timestamp": 1234567890
        }
        with open(cache_subdir / "metadata.json", "w") as f:
            json.dump(metadata, f)

        # Create layer files
        for i in range(3):
            layer_file = cache_subdir / f"layer_{i}.safetensors"
            layer_file.touch()

        # Temporarily override _CACHE_DIR
        original_cache_dir = inf._CACHE_DIR
        try:
            inf._CACHE_DIR = tmp_path

            # Mock make_prompt_cache to return cache objects
            with patch('mlx_worker.inference.make_prompt_cache', return_value=mock_cache_list):
                # Mock mx.load to return tensor dict
                with patch('mlx_worker.inference.mx.load', return_value={"keys": MagicMock(), "values": MagicMock()}) as mock_mx_load:
                    # Load cache
                    result = _load_cache_from_disk(mock_model, "abc123", "/model")

                    # Should return cache list
                    assert result is not None
                    assert len(result) == 3

                    # Should have loaded each layer
                    assert mock_mx_load.call_count == 3
        finally:
            # Restore original cache dir
            inf._CACHE_DIR = original_cache_dir

    @patch('mlx_worker.inference._CACHE_DIR')
    def test_load_cache_from_disk_missing_cache(
        self,
        mock_cache_dir_path,
        mock_model,
        tmp_path
    ):
        """Test loading cache returns None when cache doesn't exist"""
        from mlx_worker.inference import _load_cache_from_disk

        mock_cache_dir_path.__truediv__ = lambda self, other: tmp_path / "nonexistent"

        result = _load_cache_from_disk(mock_model, "abc123", "/model")

        # Should return None for missing cache
        assert result is None

    @patch('mlx_worker.inference._CACHE_DIR')
    def test_load_cache_from_disk_hash_mismatch(
        self,
        mock_cache_dir_path,
        mock_model,
        tmp_path
    ):
        """Test loading cache returns None when hash doesn't match"""
        from mlx_worker.inference import _load_cache_from_disk
        import json

        cache_subdir = tmp_path / "cache_abc123_12345678"
        cache_subdir.mkdir(parents=True)

        # Create metadata with different hash
        metadata = {
            "system_hash": "different",
            "model_path": "/model",
            "num_layers": 3
        }
        with open(cache_subdir / "metadata.json", "w") as f:
            json.dump(metadata, f)

        mock_cache_dir_path.__truediv__ = lambda self, other: tmp_path / other

        result = _load_cache_from_disk(mock_model, "abc123", "/model")

        # Should return None for hash mismatch
        assert result is None

    @patch('mlx_worker.inference._CACHE_DIR')
    def test_load_cache_from_disk_model_mismatch(
        self,
        mock_cache_dir_path,
        mock_model,
        tmp_path
    ):
        """Test loading cache returns None when model path doesn't match"""
        from mlx_worker.inference import _load_cache_from_disk
        import json

        cache_subdir = tmp_path / "cache_abc123_12345678"
        cache_subdir.mkdir(parents=True)

        # Create metadata with different model
        metadata = {
            "system_hash": "abc123",
            "model_path": "/different-model",
            "num_layers": 3
        }
        with open(cache_subdir / "metadata.json", "w") as f:
            json.dump(metadata, f)

        mock_cache_dir_path.__truediv__ = lambda self, other: tmp_path / other

        result = _load_cache_from_disk(mock_model, "abc123", "/model")

        # Should return None for model mismatch
        assert result is None

    @patch('mlx_worker.inference._CACHE_DIR')
    def test_load_cache_from_disk_handles_errors_gracefully(
        self,
        mock_cache_dir_path,
        mock_model,
        tmp_path
    ):
        """Test loading cache handles errors without raising"""
        from mlx_worker.inference import _load_cache_from_disk

        # Mock error during exists check
        mock_cache_dir_path.__truediv__ = MagicMock(side_effect=RuntimeError("I/O error"))

        # Should NOT raise exception (graceful degradation)
        result = _load_cache_from_disk(mock_model, "abc123", "/model")

        # Should return None on error
        assert result is None

    @patch('mlx_worker.inference.load_model')
    @patch('mlx_worker.inference._load_cache_from_disk')
    @patch('mlx_worker.inference._save_cache_to_disk')
    @patch('mlx_worker.inference.stream_generate')
    def test_generate_stream_uses_disk_cache(
        self,
        mock_stream_generate,
        mock_save_cache,
        mock_load_cache,
        mock_load_model
    ):
        """Test generate_stream loads cache from disk when available"""
        from mlx_worker.inference import generate_stream

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_tokenizer.apply_chat_template = MagicMock(return_value="formatted prompt")
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock disk cache available
        mock_cache_list = [MagicMock() for _ in range(3)]
        mock_load_cache.return_value = mock_cache_list

        # Mock generation response
        mock_response = MagicMock()
        mock_response.text = "response"
        mock_stream_generate.return_value = iter([mock_response])

        messages = [{"role": "system", "content": "test"}]
        list(generate_stream(messages, model_path="/model", cache_prompt=True))

        # Should try to load cache from disk
        mock_load_cache.assert_called_once()

        # Should NOT save cache (already loaded from disk)
        mock_save_cache.assert_not_called()

    @patch('mlx_worker.inference._prompt_cache_hash', '')
    @patch('mlx_worker.inference._prompt_cache', {})
    @patch('mlx_worker.inference.load_model')
    @patch('mlx_worker.inference._load_cache_from_disk')
    @patch('mlx_worker.inference._save_cache_to_disk')
    @patch('mlx_worker.inference.stream_generate')
    @patch('mlx_worker.inference.make_prompt_cache')
    def test_generate_stream_saves_cache_after_warming(
        self,
        mock_make_cache,
        mock_stream_generate,
        mock_save_cache,
        mock_load_cache,
        mock_load_model
    ):
        """Test generate_stream saves cache to disk after warming"""
        from mlx_worker.inference import generate_stream
        import mlx_worker.inference as inf

        # Clear global state
        inf._prompt_cache_hash = ''
        inf._prompt_cache = {}

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_tokenizer.apply_chat_template = MagicMock(return_value="formatted prompt")
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock disk cache NOT available (need to warm)
        mock_load_cache.return_value = None

        # Mock cache creation
        mock_cache_list = [MagicMock() for _ in range(3)]
        mock_make_cache.return_value = mock_cache_list

        # Mock generation response
        mock_response = MagicMock()
        mock_response.text = "response"
        mock_stream_generate.return_value = iter([mock_response])

        messages = [{"role": "system", "content": "test"}]
        list(generate_stream(messages, model_path="/model", cache_prompt=True))

        # Should try to load cache from disk
        mock_load_cache.assert_called_once()

        # Should create new cache (warming)
        mock_make_cache.assert_called_once()

        # Should save cache to disk after warming
        mock_save_cache.assert_called_once()

    @patch('mlx_worker.inference.load_model')
    @patch('mlx_worker.inference._load_cache_from_disk')
    @patch('mlx_worker.inference._save_cache_to_disk')
    @patch('mlx_worker.inference.stream_generate')
    def test_generate_stream_skips_disk_cache_when_disabled(
        self,
        mock_stream_generate,
        mock_save_cache,
        mock_load_cache,
        mock_load_model
    ):
        """Test generate_stream skips disk cache when cache_prompt=False"""
        from mlx_worker.inference import generate_stream

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_tokenizer.apply_chat_template = MagicMock(return_value="formatted prompt")
        mock_load_model.return_value = (mock_model, mock_tokenizer)

        # Mock generation response
        mock_response = MagicMock()
        mock_response.text = "response"
        mock_stream_generate.return_value = iter([mock_response])

        messages = [{"role": "user", "content": "test"}]
        list(generate_stream(messages, model_path="/model", cache_prompt=False))

        # Should NOT try to load or save cache
        mock_load_cache.assert_not_called()
        mock_save_cache.assert_not_called()

    def test_cache_dir_environment_variable(self, monkeypatch, tmp_path):
        """Test cache directory can be configured via environment variable"""
        import importlib
        import mlx_worker.inference as inference_module

        custom_cache_dir = str(tmp_path / "custom-cache")
        monkeypatch.setenv("ANYCLAUDE_KV_CACHE_DIR", custom_cache_dir)

        # Reload module to pick up env var
        importlib.reload(inference_module)

        from mlx_worker.inference import _CACHE_DIR

        # Should use custom cache directory
        assert str(_CACHE_DIR) == custom_cache_dir

    def test_cache_dir_default_location(self, monkeypatch):
        """Test cache directory defaults to ~/.cache/anyclaude/kv-cache"""
        import os
        import importlib
        import mlx_worker.inference as inference_module

        # Clear any existing env var
        monkeypatch.delenv("ANYCLAUDE_KV_CACHE_DIR", raising=False)

        # Reload module to use default
        importlib.reload(inference_module)

        from mlx_worker.inference import _CACHE_DIR

        expected = os.path.expanduser("~/.cache/anyclaude/kv-cache")

        # Should use default location
        assert str(_CACHE_DIR) == expected


class TestKVCacheOptimizations:
    """Tests for KV cache optimizations (Issues #57, #58, #59)"""

    def test_quantize_tensor_returns_fp16(self):
        """Test _quantize_tensor converts to FP16 when enabled"""
        from mlx_worker.inference import _quantize_tensor, _ENABLE_QUANTIZATION
        import mlx.core as mx

        if not _ENABLE_QUANTIZATION:
            pytest.skip("Quantization disabled")

        tensor = mx.array([1.0, 2.0, 3.0], dtype=mx.float32)
        quantized, scale, zero_point = _quantize_tensor(tensor)

        assert quantized.dtype == mx.float16
        assert scale == 1.0
        assert zero_point == 0.0

    def test_dequantize_tensor_returns_fp32(self):
        """Test _dequantize_tensor converts back to FP32"""
        from mlx_worker.inference import _dequantize_tensor, _ENABLE_QUANTIZATION
        import mlx.core as mx

        if not _ENABLE_QUANTIZATION:
            pytest.skip("Quantization disabled")

        tensor = mx.array([1.0, 2.0, 3.0], dtype=mx.float16)
        dequantized = _dequantize_tensor(tensor)

        assert dequantized.dtype == mx.float32

    def test_quantize_roundtrip_preserves_values(self):
        """Test quantize -> dequantize preserves approximate values"""
        from mlx_worker.inference import _quantize_tensor, _dequantize_tensor, _ENABLE_QUANTIZATION
        import mlx.core as mx

        if not _ENABLE_QUANTIZATION:
            pytest.skip("Quantization disabled")

        original = mx.array([1.5, 2.5, 3.5], dtype=mx.float32)
        quantized, _, _ = _quantize_tensor(original)
        restored = _dequantize_tensor(quantized)

        # FP16 has enough precision for these values
        assert mx.allclose(original, restored, atol=1e-3).item()

    def test_get_cache_size_bytes_empty_dir(self, tmp_path, monkeypatch):
        """Test _get_cache_size_bytes returns 0 for empty/nonexistent directory"""
        from mlx_worker.inference import _get_cache_size_bytes
        from pathlib import Path

        monkeypatch.setattr('mlx_worker.inference._CACHE_DIR', tmp_path / "nonexistent")

        size = _get_cache_size_bytes()
        assert size == 0

    def test_get_cache_size_bytes_with_files(self, tmp_path, monkeypatch):
        """Test _get_cache_size_bytes calculates total size correctly"""
        from mlx_worker.inference import _get_cache_size_bytes

        # Create test files
        cache_dir = tmp_path / "kv-cache"
        cache_dir.mkdir()
        (cache_dir / "file1.safetensors").write_bytes(b"x" * 1000)
        (cache_dir / "file2.safetensors").write_bytes(b"x" * 500)

        monkeypatch.setattr('mlx_worker.inference._CACHE_DIR', cache_dir)

        size = _get_cache_size_bytes()
        assert size == 1500

    def test_update_cache_access_time(self, tmp_path):
        """Test _update_cache_access_time updates last_access in metadata"""
        from mlx_worker.inference import _update_cache_access_time
        import json
        import time

        cache_dir = tmp_path / "test-cache"
        cache_dir.mkdir()

        # Create initial metadata
        initial_time = time.time() - 1000
        metadata = {"system_hash": "abc", "last_access": initial_time}
        with open(cache_dir / "metadata.json", "w") as f:
            json.dump(metadata, f)

        _update_cache_access_time(cache_dir)

        # Read updated metadata
        with open(cache_dir / "metadata.json", "r") as f:
            updated = json.load(f)

        assert updated["last_access"] > initial_time

    def test_evict_old_caches_removes_oldest(self, tmp_path, monkeypatch):
        """Test _evict_old_caches removes oldest entries first"""
        from mlx_worker.inference import _evict_old_caches
        import json
        import time

        cache_dir = tmp_path / "kv-cache"
        cache_dir.mkdir()

        # Create 3 cache directories with different access times
        for i, age in enumerate([1000, 500, 100]):  # Oldest to newest
            subdir = cache_dir / f"cache_{i}"
            subdir.mkdir()
            metadata = {"last_access": time.time() - age}
            with open(subdir / "metadata.json", "w") as f:
                json.dump(metadata, f)
            # Create a 1KB file in each
            (subdir / "layer_0.safetensors").write_bytes(b"x" * 1024)

        monkeypatch.setattr('mlx_worker.inference._CACHE_DIR', cache_dir)
        monkeypatch.setattr('mlx_worker.inference._MAX_CACHE_SIZE_GB', 0.000002)  # ~2KB limit

        _evict_old_caches()

        # Should have evicted the oldest (cache_0)
        remaining = list(cache_dir.iterdir())
        assert len(remaining) <= 2
        # Oldest should be evicted
        assert not (cache_dir / "cache_0").exists() or len(remaining) == 3

    def test_save_cache_includes_quantized_flag(self, tmp_path, monkeypatch):
        """Test saved metadata includes quantized flag"""
        from mlx_worker.inference import _save_cache_to_disk, _ENABLE_QUANTIZATION
        import json

        monkeypatch.setattr('mlx_worker.inference._CACHE_DIR', tmp_path)
        monkeypatch.setattr('mlx_worker.inference._evict_old_caches', lambda: None)

        # Create mock cache objects
        class MockCache:
            def __init__(self):
                import mlx.core as mx
                self.state = (mx.zeros((1, 1)), mx.zeros((1, 1)))

        cache_list = [MockCache()]

        _save_cache_to_disk(cache_list, "test_hash", "/test/model")

        # Find the created cache directory
        cache_dirs = [d for d in tmp_path.iterdir() if d.is_dir()]
        assert len(cache_dirs) == 1

        # Check metadata
        with open(cache_dirs[0] / "metadata.json", "r") as f:
            metadata = json.load(f)

        assert "quantized" in metadata
        assert metadata["quantized"] == _ENABLE_QUANTIZATION

    def test_load_cache_with_quantized_flag(self, tmp_path, monkeypatch):
        """Test loading respects quantized flag in metadata"""
        from mlx_worker.inference import _load_cache_from_disk, _get_cache_filename
        from unittest.mock import MagicMock, patch
        import json
        import mlx.core as mx

        # Get the actual cache directory name that will be looked up
        cache_name = _get_cache_filename("abc123", "/model")
        cache_dir = tmp_path / cache_name.replace(".safetensors", "")
        cache_dir.mkdir(parents=True)

        # Create metadata with quantized=True
        metadata = {
            "system_hash": "abc123",
            "model_path": "/model",
            "num_layers": 1,
            "quantized": True,
            "last_access": 0
        }
        with open(cache_dir / "metadata.json", "w") as f:
            json.dump(metadata, f)

        # Create a layer file with FP16 data
        mx.save_safetensors(
            str(cache_dir / "layer_0.safetensors"),
            {"keys": mx.zeros((1, 1), dtype=mx.float16), "values": mx.zeros((1, 1), dtype=mx.float16)}
        )

        monkeypatch.setattr('mlx_worker.inference._CACHE_DIR', tmp_path)

        # Mock model and make_prompt_cache
        mock_model = MagicMock()
        mock_cache_obj = MagicMock()
        mock_cache_obj.state = (mx.zeros((1, 1)), mx.zeros((1, 1)))

        with patch('mlx_worker.inference.make_prompt_cache', return_value=[mock_cache_obj]):
            result = _load_cache_from_disk(mock_model, "abc123", "/model")

        # Should successfully load
        assert result is not None

    def test_config_env_vars_max_size(self, monkeypatch):
        """Test _MAX_CACHE_SIZE_GB can be configured via env var"""
        import importlib
        import mlx_worker.inference as inference_module

        monkeypatch.setenv("ANYCLAUDE_KV_CACHE_MAX_SIZE_GB", "10.5")
        importlib.reload(inference_module)

        from mlx_worker.inference import _MAX_CACHE_SIZE_GB
        assert _MAX_CACHE_SIZE_GB == 10.5

    def test_config_env_vars_quantize(self, monkeypatch):
        """Test _ENABLE_QUANTIZATION can be configured via env var"""
        import importlib
        import mlx_worker.inference as inference_module

        monkeypatch.setenv("ANYCLAUDE_KV_CACHE_QUANTIZE", "false")
        importlib.reload(inference_module)

        from mlx_worker.inference import _ENABLE_QUANTIZATION
        assert _ENABLE_QUANTIZATION is False

    def test_config_env_vars_mmap(self, monkeypatch):
        """Test _ENABLE_MMAP can be configured via env var"""
        import importlib
        import mlx_worker.inference as inference_module

        monkeypatch.setenv("ANYCLAUDE_KV_CACHE_MMAP", "false")
        importlib.reload(inference_module)

        from mlx_worker.inference import _ENABLE_MMAP
        assert _ENABLE_MMAP is False


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
