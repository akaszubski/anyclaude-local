#!/usr/bin/env python3
"""
Checkpoint: Reasoning Token Stripping Tests Complete (Issue #46)
Save agent checkpoint for test-master after completing TDD red phase.
"""

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
            'Tests complete - 35 reasoning token tests created (Issue #46) - RED phase verified'
        )
        print("✅ Checkpoint saved: test-master - Reasoning token stripping tests complete")
    except ImportError:
        print("ℹ️ Checkpoint skipped (agent_tracker not available)")
else:
    print("ℹ️ Checkpoint skipped (plugins/autonomous-dev/lib not found)")
