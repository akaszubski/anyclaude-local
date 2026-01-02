"""
MLX Inference Engine

Handles model loading, token generation, and token counting using mlx_lm.

Performance optimizations (Issue #43):
- Two-stage memory cleanup (gc.collect before mx.clear_cache)
- Periodic cache clearing to prevent memory bloat
- Prompt caching for system prompt reuse
"""

import gc
import re
import mlx.core as mx
import mlx_lm
from mlx_lm import stream_generate
from mlx_lm.sample_utils import make_sampler
from mlx_lm.models.cache import make_prompt_cache
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

# Global prompt cache for KV state reuse
# Key: hash of system prompt, Value: prompt_cache object
_prompt_cache: Dict[str, Any] = {}
_prompt_cache_hash: str = ""

# Request counter for periodic memory cleanup (Issue #43)
_request_counter: int = 0
_MEMORY_CLEANUP_INTERVAL: int = 10  # Clear memory every N requests


def clear_memory(log: bool = False) -> None:
    """
    Two-stage memory cleanup for MLX.

    CRITICAL: gc.collect() MUST be called BEFORE mx.clear_cache()
    to properly free Python references before releasing GPU memory.

    This pattern is from realign/core/model_utils.py and is essential
    for effective memory management in long-running MLX servers.

    Args:
        log: If True, log memory cleanup events (for debugging)
    """
    # Stage 1: Free Python references
    gc.collect()

    # Stage 2: Free MLX/GPU memory
    mx.clear_cache()

    if log:
        print("[inference] Memory cleared (gc.collect + mx.clear_cache)")


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


def _get_system_prompt_hash(messages: List[Dict[str, str]]) -> str:
    """Get hash of system prompt for cache key."""
    import hashlib
    system_content = ""
    for msg in messages:
        if msg.get('role') == 'system':
            system_content += msg.get('content', '')
    return hashlib.md5(system_content.encode()).hexdigest()[:16]


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
    global _prompt_cache, _prompt_cache_hash, _request_counter

    if not messages:
        raise ValueError("Messages cannot be empty")

    # Periodic memory cleanup (Issue #43)
    _request_counter += 1
    if _request_counter >= _MEMORY_CLEANUP_INTERVAL:
        clear_memory(log=False)
        _request_counter = 0

    try:
        # Load model
        model, tokenizer = load_model(model_path)

        # Format messages into prompt using chat template
        prompt = _format_messages(messages, tokenizer, tools=tools)

        # Create sampler with temperature and top_p
        sampler = make_sampler(temp=temperature, top_p=top_p)

        # Prompt caching using make_prompt_cache (not empty list!)
        # The cache must be created with make_prompt_cache(model) to work correctly
        current_hash = _get_system_prompt_hash(messages)
        prompt_cache = None

        if cache_prompt:
            if current_hash == _prompt_cache_hash and current_hash in _prompt_cache:
                # Reuse existing cache for same system prompt
                prompt_cache = _prompt_cache[current_hash]
            else:
                # Create new cache using make_prompt_cache (NOT empty list!)
                prompt_cache = make_prompt_cache(model)
                _prompt_cache_hash = current_hash

        # mlx_lm.stream_generate yields GenerationResponse objects
        try:
            gen_kwargs = {
                "max_tokens": max_tokens,
                "sampler": sampler,
            }
            if prompt_cache is not None:
                gen_kwargs["prompt_cache"] = prompt_cache

            for response in stream_generate(
                model,
                tokenizer,
                prompt,
                **gen_kwargs,
            ):
                # GenerationResponse has .text attribute with generated text
                yield response.text

            # Save cache for next request (cache is updated in-place by mlx_lm)
            if cache_prompt and prompt_cache is not None:
                _prompt_cache[current_hash] = prompt_cache

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


def _inject_tool_instruction(
    messages: List[Dict[str, str]],
    tools: List[Dict[str, Any]]
) -> List[Dict[str, str]]:
    """
    Inject tool use instruction into messages to encourage tool calling.

    Local models often need explicit instruction to actually call tools
    rather than just describing what they would do.

    Args:
        messages: List of message dicts
        tools: List of tool definitions

    Returns:
        Modified messages with tool instruction injected
    """
    # Make a copy to avoid mutating original
    messages = [dict(m) for m in messages]

    # Find the last user message
    last_user_idx = None
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get('role') == 'user':
            last_user_idx = i
            break

    if last_user_idx is not None:
        # Detect if user is asking to read/write/edit files
        user_content = messages[last_user_idx].get('content', '')

        # False positive patterns to avoid injecting WebSearch instructions
        # These should NOT trigger WebSearch even if they contain search keywords
        websearch_false_positives = [
            r'\bresearch\s+(shows|suggests|indicates)\b',
            r'\bsearch\s+(this|the)\s+(document|file|code|codebase)\b',
            r'\b(what|check|show|list).*current\s+(directory|file|function)\b',
        ]

        # General false positive patterns (apply to all tools)
        general_false_positives = [
            r'\bread\s+(this|that|it)\s+(carefully|thoroughly|closely)\b',
        ]

        # Check for general false positives first
        is_general_false_positive = False
        for pattern in general_false_positives:
            if re.search(pattern, user_content, re.IGNORECASE):
                is_general_false_positive = True
                break

        if not is_general_false_positive:
            # Keywords that strongly suggest file/tool operations
            # Must be specific to avoid false positives on general questions
            tool_keywords = {
                'read': ['read the file', 'read file', 'show me the file', 'show the file',
                         'show me the contents', 'display the file', 'cat the', 'view the file',
                         'look at the file', 'open the file', 'read this', 'read that'],
                'write': ['write to file', 'write the file', 'create a file', 'create file',
                          'save to file', 'save the file', 'make a file'],
                'edit': ['edit the file', 'edit file', 'modify the file', 'change the file',
                         'update the file', 'fix the file'],
                'bash': ['run the command', 'run command', 'execute the command', 'execute command',
                         'run this', 'run that', 'in the terminal', 'in terminal'],
                'glob': ['find files', 'find the files', 'list files', 'list the files', 'search for files'],
                'grep': ['grep for', 'grep the', 'search in file', 'search the file', 'find in file',
                         'search for', 'in the codebase', 'search the codebase'],
                'websearch': ['search the internet', 'search internet', 'search the web', 'search web',
                              'look up online', 'find online', 'google', 'search for information',
                              'what is the latest', 'current news', 'recent developments'],
                'webfetch': ['fetch', 'download', 'get from url', 'scrape'],
            }

            # Check which tools are available
            available_tool_names = set()
            for tool in tools:
                if 'function' in tool:
                    available_tool_names.add(tool['function'].get('name', '').lower())
                elif 'name' in tool:
                    available_tool_names.add(tool.get('name', '').lower())

            # Tool name mapping for proper capitalization
            tool_name_map = {
                'read': 'Read',
                'write': 'Write',
                'edit': 'Edit',
                'bash': 'Bash',
                'glob': 'Glob',
                'grep': 'Grep',
                'websearch': 'WebSearch',
                'webfetch': 'WebFetch',
            }

            # Initialize suggested tool
            suggested_tool = None

            # Check for URL pattern (suggests WebFetch)
            url_pattern = r'https?://[^\s]+'
            has_url = re.search(url_pattern, user_content)
            if has_url and 'webfetch' in available_tool_names:
                # Check for WebFetch trigger words with URL
                webfetch_triggers = ['get', 'fetch', 'download', 'scrape', 'retrieve', 'access']
                for trigger in webfetch_triggers:
                    trigger_pattern = r'\b' + re.escape(trigger) + r'\b'
                    if re.search(trigger_pattern, user_content, re.IGNORECASE):
                        suggested_tool = 'WebFetch'
                        break

            # Find matching tool to suggest using word boundary regex (if not already found)
            if not suggested_tool:
                for tool_name, keywords in tool_keywords.items():
                    if tool_name in available_tool_names:
                        # Check WebSearch-specific false positives
                        if tool_name == 'websearch':
                            is_websearch_false_positive = False
                            for pattern in websearch_false_positives:
                                if re.search(pattern, user_content, re.IGNORECASE):
                                    is_websearch_false_positive = True
                                    break
                            if is_websearch_false_positive:
                                continue

                        for kw in keywords:
                            # Use word boundary regex to avoid partial matches (e.g., "research" matching "search")
                            pattern = r'\b' + re.escape(kw) + r'\b'
                            if re.search(pattern, user_content, re.IGNORECASE):
                                suggested_tool = tool_name_map.get(tool_name, tool_name.capitalize())
                                break
                    if suggested_tool:
                        break

            # Inject instruction if tool detected
            if suggested_tool:
                instruction = f"\n\n[IMPORTANT: You have tools available. To complete this task, you MUST call the {suggested_tool} tool using the proper function call format. Do not just describe what you would do - actually call the tool.]"
                messages[last_user_idx]['content'] = messages[last_user_idx].get('content', '') + instruction

    return messages


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
        # If tools are present, inject tool use instruction into last user message
        # This helps local models understand they MUST call tools, not just describe them
        if tools and messages:
            messages = _inject_tool_instruction(messages, tools)

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
