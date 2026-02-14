#!/usr/bin/env python3
"""
Save test-master agent checkpoint after completing test creation for Issue #34
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

        # Test files created
        test_files = [
            "tests/unit/critical-sections-enhanced.test.ts",
            "tests/unit/safe-system-filter-tiers.test.ts",
            "tests/integration/safe-filter-tool-calling.test.js"
        ]

        # Count tests
        total_tests = 0
        for test_file in test_files:
            file_path = project_root / test_file
            if file_path.exists():
                content = file_path.read_text()
                # Count test() and it() calls
                test_count = content.count("test(") + content.count("it(")
                total_tests += test_count
                print(f"  {test_file}: {test_count} tests")

        print(f"\nTotal tests created: {total_tests}")

        # Save checkpoint
        AgentTracker.save_agent_checkpoint(
            'test-master',
            f'Tests complete - {total_tests} tests created for Issue #34 (TDD RED phase)'
        )
        print("\n✅ Checkpoint saved successfully")

    except ImportError as e:
        print(f"ℹ️ Checkpoint skipped (user project): {e}")
else:
    print("ℹ️ Checkpoint skipped (lib path not found)")
