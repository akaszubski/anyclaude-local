#!/usr/bin/env python3
"""
Comprehensive trace analyzer for anyclaude
Shows speed, tokens, exact prompts, cache hits, tool calls, and more
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any
import sys

def get_trace_files(backend: str = "mlx", limit: int = 10) -> List[Path]:
    """Get most recent trace files for a backend"""
    trace_dir = Path.home() / ".anyclaude" / "traces" / backend

    if not trace_dir.exists():
        print(f"❌ No traces found for {backend}")
        return []

    files = sorted(trace_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    return files[:limit]

def analyze_trace(trace_file: Path) -> Dict[str, Any]:
    """Analyze a single trace file"""
    with open(trace_file) as f:
        data = json.load(f)

    timestamp = data.get("timestamp", "unknown")
    request = data.get("request", {})
    response = data.get("response", {})

    # Extract request details
    messages = request.get("body", {}).get("messages", [])
    system_prompt = request.get("body", {}).get("system", [])
    tools = request.get("body", {}).get("tools", [])

    # Count tokens in request
    request_body = request.get("body", {})
    input_tokens = 0
    output_tokens = 0
    cache_read = 0
    cache_created = 0

    # Extract response metrics
    response_body = response.get("body", {}) if response else {}
    if isinstance(response_body, str):
        try:
            response_body = json.loads(response_body)
        except:
            response_body = {}

    usage = response_body.get("usage", {})
    input_tokens = usage.get("prompt_tokens", 0)
    output_tokens = usage.get("completion_tokens", 0)
    cache_created = usage.get("cache_creation_input_tokens", 0)
    cache_read = usage.get("cache_read_input_tokens", 0)

    # Extract message content
    user_messages = []
    for msg in messages:
        if msg.get("role") == "user":
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        user_messages.append(block.get("text", "")[:200])  # First 200 chars
            elif isinstance(content, str):
                user_messages.append(content[:200])

    return {
        "timestamp": timestamp,
        "file": trace_file.name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cache_created": cache_created,
        "cache_read": cache_read,
        "cache_hit": cache_read > 0,
        "tool_count": len(tools),
        "message_count": len(messages),
        "system_prompt_length": sum(len(p.get("text", "")) for p in system_prompt if isinstance(p, dict)),
        "user_messages": user_messages,
        "response_status": response.get("statusCode", "unknown") if response else "unknown",
    }

def print_summary(traces: List[Dict[str, Any]]):
    """Print summary of traces"""
    if not traces:
        print("No traces to analyze")
        return

    print("\n" + "="*80)
    print("📊 TRACE ANALYSIS SUMMARY")
    print("="*80)

    # Overall stats
    total_input = sum(t["input_tokens"] for t in traces)
    total_output = sum(t["output_tokens"] for t in traces)
    total_cached = sum(t["cache_read"] for t in traces)
    cache_hits = sum(1 for t in traces if t["cache_hit"])

    print(f"\nTotal Requests: {len(traces)}")
    print(f"Cache Hits: {cache_hits}/{len(traces)} ({cache_hits*100//len(traces)}%)")
    print(f"\nToken Summary:")
    print(f"  Total Input: {total_input:,} tokens")
    print(f"  Total Output: {total_output:,} tokens")
    print(f"  Total Cached (read): {total_cached:,} tokens")
    print(f"  Total New (created): {sum(t['cache_created'] for t in traces):,} tokens")

    print("\n" + "-"*80)
    print("RECENT REQUESTS (newest first):")
    print("-"*80)

    for i, trace in enumerate(traces[:10], 1):
        cache_status = "✅ CACHE HIT" if trace["cache_hit"] else "❌ CACHE MISS"

        print(f"\n{i}. {trace['timestamp']}")
        print(f"   Status: {cache_status}")
        print(f"   Input: {trace['input_tokens']:,} tokens | Output: {trace['output_tokens']:,} tokens")
        print(f"   Cache: Read {trace['cache_read']:,} | Created {trace['cache_created']:,}")
        print(f"   Tools: {trace['tool_count']} | Messages: {trace['message_count']}")

        if trace["user_messages"]:
            print(f"   User Query: {trace['user_messages'][0][:80]}...")

        print(f"   File: {trace['file']}")

def print_detailed(traces: List[Dict[str, Any]], index: int = 0):
    """Print detailed trace information"""
    if index >= len(traces):
        print(f"❌ Index out of range (0-{len(traces)-1})")
        return

    trace = traces[index]
    trace_file = Path.home() / ".anyclaude" / "traces" / "mlx" / trace["file"]

    with open(trace_file) as f:
        data = json.load(f)

    request_body = data.get("request", {}).get("body", {})
    response_body = data.get("response", {}).get("body", {})

    if isinstance(response_body, str):
        try:
            response_body = json.loads(response_body)
        except:
            response_body = {}

    print("\n" + "="*80)
    print(f"DETAILED TRACE: {trace['file']}")
    print("="*80)

    # Request details
    print("\n📨 REQUEST:")
    print(f"  Timestamp: {trace['timestamp']}")
    print(f"  Model: {request_body.get('model', 'unknown')}")
    print(f"  Max Tokens: {request_body.get('max_tokens', 'not specified')}")

    # System prompt
    system = request_body.get("system", [])
    if system:
        system_text = ""
        for block in system:
            if isinstance(block, dict):
                system_text += block.get("text", "")
        print(f"\n  System Prompt ({len(system_text)} chars):")
        print(f"    {system_text[:200]}...")

    # User messages
    messages = request_body.get("messages", [])
    print(f"\n  Messages ({len(messages)}):")
    for i, msg in enumerate(messages, 1):
        content = msg.get("content", "")
        if isinstance(content, list):
            content_str = " | ".join(
                f"[{b.get('type')}]" for b in content if isinstance(b, dict)
            )
        else:
            content_str = content[:100] if isinstance(content, str) else str(content)[:100]
        print(f"    {i}. [{msg.get('role')}] {content_str}...")

    # Tools
    tools = request_body.get("tools", [])
    if tools:
        print(f"\n  Tools ({len(tools)}):")
        for tool in tools:
            print(f"    - {tool.get('name', 'unknown')}")

    # Response details
    print(f"\n📥 RESPONSE:")
    usage = response_body.get("usage", {})
    print(f"  Status: {data.get('response', {}).get('statusCode', 'unknown')}")
    print(f"  Input Tokens: {usage.get('prompt_tokens', 0):,}")
    print(f"  Output Tokens: {usage.get('completion_tokens', 0):,}")
    print(f"  Cache Read: {usage.get('cache_read_input_tokens', 0):,} tokens")
    print(f"  Cache Created: {usage.get('cache_creation_input_tokens', 0):,} tokens")

    # Response content
    choices = response_body.get("choices", [])
    if choices:
        choice = choices[0]
        content = choice.get("message", {}).get("content", "")
        print(f"\n  Response Content ({len(content)} chars):")
        print(f"    {content[:200]}...")

        tool_calls = choice.get("message", {}).get("tool_calls")
        if tool_calls:
            print(f"\n  Tool Calls ({len(tool_calls)}):")
            for call in tool_calls:
                print(f"    - {call.get('name', 'unknown')}")

def main():
    """Main function"""
    backend = "mlx"

    if len(sys.argv) > 1:
        if sys.argv[1] == "--help":
            print("Usage: analyze-traces.py [--backend BACKEND] [--detail INDEX]")
            print("\nExamples:")
            print("  analyze-traces.py                    # Show summary of mlx traces")
            print("  analyze-traces.py --backend claude   # Show summary of claude traces")
            print("  analyze-traces.py --detail 0         # Show details of first trace")
            return
        elif sys.argv[1] == "--backend" and len(sys.argv) > 2:
            backend = sys.argv[2]
        elif sys.argv[1] == "--detail" and len(sys.argv) > 2:
            detail_idx = int(sys.argv[2])
            traces = [analyze_trace(f) for f in get_trace_files(backend)]
            print_detailed(traces, detail_idx)
            return

    # Get and analyze traces
    trace_files = get_trace_files(backend)
    traces = [analyze_trace(f) for f in trace_files]

    if traces:
        print_summary(traces)
    else:
        print(f"❌ No traces found for {backend}")
        print(f"\nTrace directory: ~/.anyclaude/traces/{backend}/")
        print("Run anyclaude to generate traces")

if __name__ == "__main__":
    main()
