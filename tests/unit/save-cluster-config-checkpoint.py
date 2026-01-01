#!/usr/bin/env python3
"""
Save checkpoint for cluster-config test completion.
"""

from pathlib import Path
import sys

# Portable path detection
current = Path.cwd()
while current != current.parent:
    if (current / ".git").exists() or (current / ".claude").exists():
        project_root = current
        break
    current = current.parent
else:
    project_root = Path.cwd()

# Add lib to path
lib_path = project_root / "plugins/autonomous-dev/lib"
if lib_path.exists():
    sys.path.insert(0, str(lib_path))

    try:
        from agent_tracker import AgentTracker
        AgentTracker.save_agent_checkpoint(
            'test-master',
            'cluster-config tests complete - 86 comprehensive tests created'
        )
        print("✅ Checkpoint saved")
    except ImportError:
        print("ℹ️ Checkpoint skipped (user project)")
else:
    print("ℹ️ Checkpoint skipped (lib not found)")
