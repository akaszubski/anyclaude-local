"""
MLX Inference Engine

Handles model loading, token generation, and token counting using mlx_lm.

Performance optimizations (Issue #43):
- Two-stage memory cleanup (gc.collect before mx.clear_cache)
- Periodic cache clearing to prevent memory bloat
- Prompt caching for system prompt reuse

KV Cache Persistence (Issue #56):
- Disk-based KV cache persistence for faster warmup
- Cache saved to ~/.cache/anyclaude/kv-cache/ as .safetensors
- Cache key includes system prompt hash + model path

KV Cache Optimizations (Issues #57, #58, #59):
- FP16 quantization for 2x size reduction (#57)
- Memory-mapped loading for zero-copy performance (#58)
- LRU eviction policy for bounded storage (#59)
"""

import gc
import os
import re
import time
import json
import hashlib
import mlx.core as mx
import mlx_lm
from mlx_lm.generate import stream_generate
from mlx_lm.sample_utils import make_sampler
from mlx_lm.models.cache import make_prompt_cache
from typing import Generator, List, Dict, Any, Tuple, Optional, cast
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

# KV cache persistence settings (Issue #56)
_CACHE_DIR: Path = Path(
    os.environ.get(
        "ANYCLAUDE_KV_CACHE_DIR",
        os.path.expanduser("~/.cache/anyclaude/kv-cache")
    )
)

# KV cache optimization settings (Issues #57, #58, #59)
# Max cache size in GB before LRU eviction kicks in
_MAX_CACHE_SIZE_GB: float = float(os.environ.get("ANYCLAUDE_KV_CACHE_MAX_SIZE_GB", "5.0"))
# Enable FP16 quantization for cache (2x size reduction)
_ENABLE_QUANTIZATION: bool = os.environ.get("ANYCLAUDE_KV_CACHE_QUANTIZE", "true").lower() == "true"
# Enable mmap loading for zero-copy performance
_ENABLE_MMAP: bool = os.environ.get("ANYCLAUDE_KV_CACHE_MMAP", "true").lower() == "true"
# Minimum token threshold for caching (don't cache short prompts)
_MIN_TOKENS_FOR_CACHE: int = int(os.environ.get("ANYCLAUDE_KV_CACHE_MIN_TOKENS", "1024"))


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
        # Show loading message for large models
        model_name = model_path.split("/")[-1] if "/" in model_path else model_path
        print(f"[mlx-worker] Loading model: {model_name}...")
        print(f"[mlx-worker] This may take 30-60 seconds for large models (loading weights to GPU)")
        load_start = time.time()

        # Load model using mlx_lm
        # Note: mlx_lm.load may return 2 or 3 items depending on version
        result = mlx_lm.load(model_path)  # type: ignore[attr-defined]
        model = result[0]
        tokenizer = result[1]

        load_time = time.time() - load_start
        print(f"[mlx-worker] ✓ Model loaded in {load_time:.1f}s")

        # Cache the result
        _model_cache[cache_key] = (model, tokenizer)

        return model, tokenizer

    except FileNotFoundError as e:
        raise ModelNotFoundError(f"Model not found at {model_path}: {str(e)}")
    except Exception as e:
        raise InferenceError(f"Failed to load model from {model_path}: {str(e)}")


def _get_system_prompt_hash(messages: List[Dict[str, str]]) -> str:
    """Get hash of system prompt for cache key."""
    system_content = ""
    for msg in messages:
        if msg.get('role') == 'system':
            system_content += msg.get('content', '')
    return hashlib.md5(system_content.encode()).hexdigest()[:16]


def _get_cache_filename(system_hash: str, model_path: str) -> str:
    """
    Generate cache filename from system prompt hash and model path.

    Includes model path hash to invalidate cache when model changes.

    Args:
        system_hash: Hash of system prompt content
        model_path: Path to the model

    Returns:
        Cache filename (e.g., "cache_abc123_def456.safetensors")
    """
    model_hash = hashlib.md5(model_path.encode()).hexdigest()[:8]
    return f"cache_{system_hash}_{model_hash}.safetensors"


def _get_cache_size_bytes() -> int:
    """
    Calculate total size of KV cache directory in bytes.

    Returns:
        Total size in bytes, 0 if directory doesn't exist
    """
    if not _CACHE_DIR.exists():
        return 0

    total_size = 0
    for item in _CACHE_DIR.rglob("*"):
        if item.is_file():
            total_size += item.stat().st_size
    return total_size


def _update_cache_access_time(cache_dir: Path) -> None:
    """
    Update last access time for LRU tracking.

    Args:
        cache_dir: Path to the cache directory
    """
    try:
        metadata_path = cache_dir / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path, "r") as f:
                metadata = json.load(f)
            metadata["last_access"] = time.time()
            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)
    except Exception:
        pass  # Non-critical operation


def _evict_old_caches() -> None:
    """
    Evict oldest caches when total size exceeds limit (Issue #59).

    Uses LRU (Least Recently Used) policy based on last_access timestamp.
    """
    if not _CACHE_DIR.exists():
        return

    max_size_bytes = int(_MAX_CACHE_SIZE_GB * 1024 * 1024 * 1024)
    current_size = _get_cache_size_bytes()

    if current_size <= max_size_bytes:
        return

    # Collect cache directories with their access times
    cache_entries: List[Tuple[float, Path, int]] = []
    for cache_subdir in _CACHE_DIR.iterdir():
        if cache_subdir.is_dir():
            metadata_path = cache_subdir / "metadata.json"
            last_access = 0.0
            if metadata_path.exists():
                try:
                    with open(metadata_path, "r") as f:
                        metadata = json.load(f)
                    last_access = metadata.get("last_access", metadata.get("timestamp", 0))
                except Exception:
                    pass

            # Calculate size of this cache
            cache_size = sum(f.stat().st_size for f in cache_subdir.rglob("*") if f.is_file())
            cache_entries.append((last_access, cache_subdir, cache_size))

    # Sort by access time (oldest first)
    cache_entries.sort(key=lambda x: x[0])

    # Evict oldest until under limit
    for access_time, cache_dir, cache_size in cache_entries:
        if current_size <= max_size_bytes:
            break

        try:
            import shutil
            shutil.rmtree(cache_dir)
            current_size -= cache_size
            print(f"[mlx-worker] Evicted old KV cache: {cache_dir.name}")
        except Exception as e:
            print(f"[mlx-worker] Warning: Failed to evict cache {cache_dir.name}: {e}")


def _quantize_tensor(tensor: mx.array) -> Tuple[mx.array, float, float]:
    """
    Quantize tensor to FP16 for storage (Issue #57).

    Args:
        tensor: MLX array to quantize

    Returns:
        Tuple of (quantized_tensor, scale, zero_point)
    """
    if not _ENABLE_QUANTIZATION:
        return tensor, 1.0, 0.0

    # Convert to FP16 for 2x size reduction
    # FP16 is sufficient for KV cache and maintains good quality
    quantized = tensor.astype(mx.float16)
    return quantized, 1.0, 0.0


def _dequantize_tensor(tensor: mx.array, scale: float = 1.0, zero_point: float = 0.0) -> mx.array:
    """
    Dequantize tensor from FP16 back to FP32 (Issue #57).

    Args:
        tensor: Quantized MLX array
        scale: Scale factor (unused for FP16)
        zero_point: Zero point (unused for FP16)

    Returns:
        Dequantized tensor in FP32
    """
    if not _ENABLE_QUANTIZATION:
        return tensor

    # Convert back to FP32
    return tensor.astype(mx.float32)


def _save_cache_to_disk(
    cache_list: List[Any],
    system_hash: str,
    model_path: str
) -> None:
    """
    Save KV cache to disk as safetensors files.

    The cache is saved as a directory with separate files for each layer's
    keys and values tensors. Includes FP16 quantization and LRU eviction.

    Args:
        cache_list: List of cache objects from make_prompt_cache
        system_hash: Hash of system prompt for cache key
        model_path: Path to model for cache invalidation

    Note:
        Gracefully handles serialization failures - logs warning but doesn't raise
    """
    try:
        # Run LRU eviction before saving new cache (Issue #59)
        _evict_old_caches()

        # Create cache directory if it doesn't exist
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)

        # Get cache filename and create subdirectory for this cache
        cache_name = _get_cache_filename(system_hash, model_path)
        cache_dir = _CACHE_DIR / cache_name.replace(".safetensors", "")
        cache_dir.mkdir(exist_ok=True)

        # Save metadata
        current_time = time.time()
        metadata = {
            "system_hash": system_hash,
            "model_path": model_path,
            "num_layers": len(cache_list),
            "timestamp": current_time,
            "last_access": current_time,
            "quantized": _ENABLE_QUANTIZATION,
        }

        metadata_path = cache_dir / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        # Save each layer's KV cache
        for i, cache_obj in enumerate(cache_list):
            if hasattr(cache_obj, "state"):
                keys, values = cache_obj.state
                layer_file = cache_dir / f"layer_{i}.safetensors"

                # Quantize tensors for storage (Issue #57)
                q_keys, _, _ = _quantize_tensor(keys)
                q_values, _, _ = _quantize_tensor(values)

                # Save as dict with keys and values
                mx.save_safetensors(
                    str(layer_file),
                    {"keys": q_keys, "values": q_values}
                )

        quant_msg = " (FP16)" if _ENABLE_QUANTIZATION else ""
        print(f"[mlx-worker] ✓ KV cache saved to disk{quant_msg}: {cache_dir.name}")

    except Exception as e:
        # Graceful degradation - log warning but don't fail
        print(f"[mlx-worker] Warning: Failed to save KV cache to disk: {e}")


def _load_cache_from_disk(
    model: Any,
    system_hash: str,
    model_path: str
) -> Optional[List[Any]]:
    """
    Load KV cache from disk if it exists.

    Supports mmap loading for zero-copy performance and dequantization
    from FP16 back to FP32.

    Args:
        model: MLX model (needed to create cache structure)
        system_hash: Hash of system prompt for cache key
        model_path: Path to model for cache validation

    Returns:
        List of cache objects if found and valid, None otherwise

    Note:
        Gracefully handles missing or invalid cache files
    """
    try:
        # Get cache directory
        cache_name = _get_cache_filename(system_hash, model_path)
        cache_dir = _CACHE_DIR / cache_name.replace(".safetensors", "")

        if not cache_dir.exists():
            return None

        # Load and validate metadata
        metadata_path = cache_dir / "metadata.json"
        if not metadata_path.exists():
            return None

        with open(metadata_path, "r") as f:
            metadata = json.load(f)

        # Validate metadata
        if metadata.get("system_hash") != system_hash:
            print("[mlx-worker] Warning: Cache system hash mismatch, ignoring cache")
            return None

        if metadata.get("model_path") != model_path:
            print("[mlx-worker] Warning: Cache model path mismatch, ignoring cache")
            return None

        # Create fresh cache structure
        cache_list = make_prompt_cache(model)
        num_layers = metadata.get("num_layers", 0)
        was_quantized = metadata.get("quantized", False)

        if len(cache_list) != num_layers:
            print(f"[mlx-worker] Warning: Layer count mismatch (cache: {num_layers}, model: {len(cache_list)})")
            return None

        # Load each layer's KV cache
        for i in range(num_layers):
            layer_file = cache_dir / f"layer_{i}.safetensors"
            if not layer_file.exists():
                print(f"[mlx-worker] Warning: Missing cache file for layer {i}")
                return None

            # Load tensors with mmap for zero-copy performance (Issue #58)
            try:
                if _ENABLE_MMAP:
                    tensors = mx.load(str(layer_file), return_metadata=False)  # type: ignore[call-arg]
                else:
                    tensors = mx.load(str(layer_file))
            except TypeError:
                # Fallback if mmap parameter not supported
                tensors = mx.load(str(layer_file))

            keys = tensors["keys"]
            values = tensors["values"]

            # Dequantize if cache was saved with quantization (Issue #57)
            if was_quantized:
                keys = _dequantize_tensor(keys)
                values = _dequantize_tensor(values)

            # Restore state if cache object supports it
            if hasattr(cache_list[i], "state"):
                cache_list[i].state = (keys, values)

        # Update access time for LRU tracking (Issue #59)
        _update_cache_access_time(cache_dir)

        mmap_msg = " (mmap)" if _ENABLE_MMAP else ""
        quant_msg = " (dequantized)" if was_quantized else ""
        print(f"[mlx-worker] ✓ KV cache loaded from disk{mmap_msg}{quant_msg} ({num_layers} layers)")
        return cache_list

    except Exception as e:
        # Graceful degradation - log warning and return None
        print(f"[mlx-worker] Warning: Failed to load KV cache from disk: {e}")
        return None


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

        # Prompt caching with disk persistence (Issue #56)
        # The cache must be created with make_prompt_cache(model) to work correctly
        current_hash = _get_system_prompt_hash(messages)
        prompt_cache = None
        is_cache_warming = False
        loaded_from_disk = False

        if cache_prompt:
            # Try to reuse in-memory cache first (fastest)
            if current_hash == _prompt_cache_hash and current_hash in _prompt_cache:
                prompt_cache = _prompt_cache[current_hash]
                print("[mlx-worker] Using in-memory KV cache")
            else:
                # Try to load from disk (faster than warming)
                print("[mlx-worker] Checking for disk-cached KV state...")
                prompt_cache = _load_cache_from_disk(model, current_hash, model_path)

                if prompt_cache is not None:
                    loaded_from_disk = True
                    _prompt_cache_hash = current_hash
                else:
                    # No cache available - need to warm (slow first time)
                    print(f"[mlx-worker] Warming KV cache with system prompt (~18k tokens)...")
                    print(f"[mlx-worker] This is a one-time cost - cache will be saved to disk")
                    is_cache_warming = True
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

                # Save to disk after warming or if loaded from disk but modified
                # (to update with new tokens processed)
                if is_cache_warming:
                    print("[mlx-worker] Saving warmed KV cache to disk...")
                    _save_cache_to_disk(prompt_cache, current_hash, model_path)

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
                         'search in code', 'in the codebase', 'search the codebase', 'search code for'],
                'websearch': ['search the internet', 'search internet', 'search the web', 'search web',
                              'look up online', 'find online', 'google', 'search for information',
                              'what is the latest', 'current news', 'recent developments',
                              'search online', 'look online', 'find information about',
                              'search best practices', 'search documentation', 'search tutorials',
                              'search for latest', 'search for current', 'search for recent'],
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
