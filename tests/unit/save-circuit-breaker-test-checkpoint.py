#!/usr/bin/env python3
"""Save test-master agent checkpoint for circuit breaker monitoring tests"""

from pathlib import Path
import sys

# Portable path detection (works from any directory)
current = Path.cwd()
while current != current.parent:
    if (current / ".git").exists() or (current / ".claude").exists():
        project_root = current
        break
    current = current.parent
else:
    project_root = Path.cwd()

# Add lib to path for imports
lib_path = project_root / "plugins/autonomous-dev/lib"
if lib_path.exists():
    sys.path.insert(0, str(lib_path))

    try:
        from agent_tracker import AgentTracker
        AgentTracker.save_agent_checkpoint(
            'test-master',
            'Circuit breaker monitoring tests complete - 112 tests created (TDD RED phase)'
        )
        print("✅ Checkpoint saved: Circuit breaker monitoring tests (112 tests)")
    except ImportError:
        print("ℹ️ Checkpoint skipped (user project - agent_tracker not available)")
else:
    print("ℹ️ Checkpoint skipped (autonomous-dev plugin not found)")
