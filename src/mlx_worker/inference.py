"""
MLX Inference Engine

Handles model loading, token generation, and token counting using mlx_lm.
"""

import mlx_lm
from mlx_lm import stream_generate
from mlx_lm.sample_utils import make_sampler
from typing import Generator, List, Dict, Any, Tuple, Optional
from pathlib import Path


class InferenceError(Exception):
    """Base exception for inference errors"""
    pass


class ModelNotFoundError(InferenceError):
    """Raised when model file not found"""
    pass


# Global model cache to avoid reloading
_model_cache: Dict[str, Tuple[Any, Any]] = {}


def load_model(model_path: str, config: Optional[Dict[str, Any]] = None) -> Tuple[Any, Any]:
    """
    Load MLX model and tokenizer from path.

    Caches loaded models to avoid redundant loading.

    Args:
        model_path: Path to model directory or file
        config: Optional configuration dict to pass to mlx_lm.load

    Returns:
        Tuple of (model, tokenizer)

    Raises:
        ModelNotFoundError: If model path doesn't exist
        InferenceError: If model loading fails
    """
    # Check cache first - use model_path as key if no config
    cache_key = model_path if config is None else f"{model_path}:{config}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    try:
        # Load model using mlx_lm
        if config:
            model, tokenizer = mlx_lm.load(model_path, config=config)
        else:
            model, tokenizer = mlx_lm.load(model_path)

        # Cache the result
        _model_cache[cache_key] = (model, tokenizer)

        return model, tokenizer

    except FileNotFoundError as e:
        raise ModelNotFoundError(f"Model not found at {model_path}: {str(e)}")
    except Exception as e:
        raise InferenceError(f"Failed to load model from {model_path}: {str(e)}")


def generate_stream(
    messages: List[Dict[str, str]],
    model_path: str = "current-model",
    max_tokens: int = 2048,
    temperature: float = 0.7,
    top_p: float = 0.9,
    cache_prompt: bool = True,
    tools: Optional[List[Dict[str, Any]]] = None,
    **kwargs
) -> Generator[str, None, None]:
    """
    Generate tokens from messages using MLX model.

    Args:
        messages: List of message dicts with 'role' and 'content'
        model_path: Path to model (default: "current-model")
        max_tokens: Maximum tokens to generate
        temperature: Sampling temperature (0.0-1.0)
        top_p: Nucleus sampling parameter
        cache_prompt: Enable KV cache for prompt
        tools: Optional list of tool definitions for function calling
        **kwargs: Additional generation parameters

    Yields:
        Generated tokens as strings

    Raises:
        ValueError: If messages is empty
        InferenceError: If generation fails
    """
    if not messages:
        raise ValueError("Messages cannot be empty")

    try:
        # Load model
        model, tokenizer = load_model(model_path)

        # Format messages into prompt using chat template
        prompt = _format_messages(messages, tokenizer, tools=tools)

        # Create sampler with temperature and top_p
        sampler = make_sampler(temp=temperature, top_p=top_p)

        # mlx_lm.stream_generate yields GenerationResponse objects
        try:
            for response in stream_generate(
                model,
                tokenizer,
                prompt,
                max_tokens=max_tokens,
                sampler=sampler,
            ):
                # GenerationResponse has .text attribute with generated text
                yield response.text
        except Exception as e:
            raise InferenceError(f"Generation failed: {str(e)}")

    except ValueError:
        raise
    except InferenceError:
        raise
    except Exception as e:
        raise InferenceError(f"Unexpected error during generation: {str(e)}")


def count_tokens(text: str, model_path: str = "current-model") -> int:
    """
    Count tokens in text using model's tokenizer.

    Args:
        text: Text to tokenize
        model_path: Path to model (for tokenizer)

    Returns:
        Number of tokens
    """
    try:
        # Check if model is already cached to avoid redundant loading
        cache_key = model_path
        if cache_key in _model_cache:
            _, tokenizer = _model_cache[cache_key]
        else:
            model, tokenizer = load_model(model_path)
            # Ensure it's in the cache (in case load_model was mocked)
            if cache_key not in _model_cache:
                _model_cache[cache_key] = (model, tokenizer)

        tokens = tokenizer.encode(text)
        return len(tokens)
    except Exception as e:
        raise InferenceError(f"Token counting failed: {str(e)}")


def _format_messages(
    messages: List[Dict[str, str]],
    tokenizer: Any,
    tools: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Format messages into a prompt string using the model's chat template.

    Args:
        messages: List of message dicts
        tokenizer: Model tokenizer
        tools: Optional list of tool definitions

    Returns:
        Formatted prompt string
    """
    try:
        # Use the tokenizer's chat template for proper formatting
        # This enables native tool calling support for models like Qwen2.5
        kwargs = {
            "add_generation_prompt": True,
            "tokenize": False,
        }
        if tools:
            kwargs["tools"] = tools

        return tokenizer.apply_chat_template(messages, **kwargs)
    except Exception:
        # Fallback to simple formatting if chat template fails
        formatted_parts = []

        for msg in messages:
            role = msg.get('role', '')
            content = msg.get('content', '')

            if role == 'system':
                formatted_parts.append(f"System: {content}")
            elif role == 'user':
                formatted_parts.append(f"User: {content}")
            elif role == 'assistant':
                formatted_parts.append(f"Assistant: {content}")

        if messages[-1]['role'] != 'assistant':
            formatted_parts.append("Assistant:")

        return "\n\n".join(formatted_parts)
