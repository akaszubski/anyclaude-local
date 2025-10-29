#!/usr/bin/env python3
"""
Test cache functionality to ensure prompt caching actually works
This tests that repeated requests with same system prompt are cached
"""

import json
import requests
import sys
import time

SERVER_URL = "http://localhost:8081/v1/chat/completions"

def test_cache():
    """Verify cache is working by checking cache_read_input_tokens"""

    print("\n=== CACHE VERIFICATION TEST ===\n")

    # First request - should create cache (cache_creation_input_tokens > 0)
    print("1️⃣  First request (should CREATE cache)...")

    system_prompt = "You are a helpful assistant. " * 100  # Simulate long system prompt

    request_1 = {
        "model": "current-model",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Say hello"}
        ],
        "stream": False,
        "max_tokens": 50
    }

    try:
        resp1 = requests.post(SERVER_URL, json=request_1, timeout=30)
        data1 = resp1.json()

        if "error" in data1:
            print(f"❌ ERROR: {data1['error']}")
            return False

        cache_created = data1.get("usage", {}).get("cache_creation_input_tokens", 0)
        print(f"   Cache created: {cache_created} tokens")

        if cache_created == 0:
            print("   ⚠️  No cache created on first request")
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

    time.sleep(1)

    # Second request - should READ from cache (cache_read_input_tokens > 0)
    print("\n2️⃣  Second request (should READ from cache)...")

    request_2 = {
        "model": "current-model",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Say goodbye"}
        ],
        "stream": False,
        "max_tokens": 50
    }

    try:
        resp2 = requests.post(SERVER_URL, json=request_2, timeout=30)
        data2 = resp2.json()

        if "error" in data2:
            print(f"❌ ERROR: {data2['error']}")
            return False

        cache_read = data2.get("usage", {}).get("cache_read_input_tokens", 0)
        cache_created = data2.get("usage", {}).get("cache_creation_input_tokens", 0)

        print(f"   Cache read: {cache_read} tokens")
        print(f"   Cache created: {cache_created} tokens")

        if cache_read > 0:
            print(f"   ✅ CACHE HIT! Read {cache_read} tokens from cache")
            return True
        else:
            print("   ❌ NO CACHE READ - caching not working!")
            return False

    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

if __name__ == "__main__":
    success = test_cache()
    sys.exit(0 if success else 1)
