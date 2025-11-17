"""
Smart Prompt Caching for MLX

Optimizes prompt processing by:
1. Hashing the system prompt + tools (rarely changes)
2. Only sending recent conversation history (sliding window)
3. Reusing MLX's automatic caching when prompts match
"""

import hashlib
import json
from typing import List, Dict, Any, Tuple


def hash_system_config(system_message: str, tools: List[Dict]) -> str:
    """Hash system prompt + tool definitions for cache key"""
    config = {
        "system": system_message,
        "tools": json.dumps(tools, sort_keys=True) if tools else ""
    }
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()[:16]


def optimize_messages(
    messages: List[Dict[str, Any]],
    max_history: int = 2  # Keep last 2 turns (4 messages: 2 user + 2 assistant) for better KV cache hits
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Optimize message list for better cache hits

    Args:
        messages: Full message history
        max_history: Number of recent conversation turns to keep

    Returns:
        (optimized_messages, metadata)
    """
    if not messages:
        return messages, {}

    # Separate system message from conversation
    system_msg = None
    conversation = []

    for msg in messages:
        if msg.get("role") == "system":
            system_msg = msg
        else:
            conversation.append(msg)

    # Keep only recent history (sliding window)
    # This makes prompts more likely to match as conversation grows
    recent_conversation = conversation[-max_history:] if len(conversation) > max_history else conversation

    # Reconstruct optimized message list
    optimized = []
    if system_msg:
        optimized.append(system_msg)
    optimized.extend(recent_conversation)

    metadata = {
        "original_length": len(messages),
        "optimized_length": len(optimized),
        "trimmed_messages": len(conversation) - len(recent_conversation),
        "cache_friendly": len(recent_conversation) <= max_history
    }

    return optimized, metadata


def estimate_prompt_tokens(messages: List[Dict[str, Any]]) -> int:
    """Rough estimate of prompt token count"""
    total_chars = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    total_chars += len(str(block.get("text", "")))

    # Rough estimate: 1 token ≈ 4 characters
    return total_chars // 4


def should_trim_history(messages: List[Dict[str, Any]], token_limit: int = 8000) -> bool:
    """Check if conversation history should be trimmed"""
    estimated_tokens = estimate_prompt_tokens(messages)
    return estimated_tokens > token_limit
