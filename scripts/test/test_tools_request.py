#!/usr/bin/env python3
import requests
import json
r = requests.post(
    'http://localhost:8081/v1/chat/completions',
    json={
        'model': 'claude-sonnet-4-20250514',
        'messages': [
            {'role': 'system', 'content': 'You are an assistant with tools.'},
            {'role': 'user', 'content': [
                {'type': 'text', 'text': 'Read the file README.md'}
            ]}
        ],
        'max_tokens': 100,
        'tools': [
            {
                'type': 'function',
                'function': {
                    'name': 'read_file',
                    'description': 'Read contents of a file',
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'path': {'type': 'string', 'description': 'File path'}
                        },
                        'required': ['path']
                    }
                }
            }
        ]
    },
    headers={'Content-Type': 'application/json'},
    timeout=60
)
print(f'Status: {r.status_code}')
print(f'Response: {r.text[:1000]}')
