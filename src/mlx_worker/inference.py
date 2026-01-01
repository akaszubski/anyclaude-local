"""
MLX Inference Engine

Handles model loading, token generation, and token counting using mlx_lm.
"""

import mlx_lm
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

        # Format messages into prompt
        prompt = _format_messages(messages, tokenizer)

        # Generate tokens using mlx_lm
        generation_kwargs = {
            'max_tokens': max_tokens,
            'temperature': temperature,
            'top_p': top_p,
            'cache_prompt': cache_prompt,
            **kwargs
        }

        # mlx_lm.generate returns a generator
        try:
            for token in model.generate(prompt, **generation_kwargs):
                yield token
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


def _format_messages(messages: List[Dict[str, str]], tokenizer: Any) -> str:
    """
    Format messages into a prompt string.

    Args:
        messages: List of message dicts
        tokenizer: Model tokenizer

    Returns:
        Formatted prompt string
    """
    # Simple formatting - can be enhanced with chat template
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

    # End with Assistant: to prompt for response
    if messages[-1]['role'] != 'assistant':
        formatted_parts.append("Assistant:")

    return "\n\n".join(formatted_parts)
