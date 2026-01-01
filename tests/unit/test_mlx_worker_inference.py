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
        ModelNotFoundError
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


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
