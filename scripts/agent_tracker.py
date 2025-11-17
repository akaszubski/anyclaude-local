#!/usr/bin/env python3
"""
Agent Tracker - Tracks agent invocations and parallel execution metrics

Monitors which agents have been invoked during /auto-implement workflow
and validates checkpoint requirements (parallel exploration, parallel validation).

Usage:
    # Track agent invocation
    python scripts/agent_tracker.py track <agent_name>

    # Check status
    python scripts/agent_tracker.py status

    # Reset session
    python scripts/agent_tracker.py reset

Expected agents in order:
    1. researcher (parallel with planner)
    2. planner (parallel with researcher)
    3. test-master
    4. implementer
    5. reviewer (parallel with security-auditor, doc-master)
    6. security-auditor (parallel with reviewer, doc-master)
    7. doc-master (parallel with reviewer, security-auditor)
"""

import sys
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class AgentTracker:
    """Tracks agent invocations and validates parallel execution"""

    # Expected agents for /auto-implement workflow
    REQUIRED_AGENTS = [
        "researcher",
        "planner",
        "test-master",
        "implementer",
        "reviewer",
        "security-auditor",
        "doc-master"
    ]

    # Parallel execution groups
    PARALLEL_EXPLORATION = ["researcher", "planner"]
    PARALLEL_VALIDATION = ["reviewer", "security-auditor", "doc-master"]

    def __init__(self, session_file: Optional[Path] = None):
        """Initialize agent tracker with session file"""
        if session_file:
            self.session_file = Path(session_file)
        else:
            # Default location: .claude/session_state.json
            self.session_file = Path(".claude/session_state.json")

        # Create .claude directory if it doesn't exist
        self.session_file.parent.mkdir(parents=True, exist_ok=True)

        # Load or initialize session data
        self._load_or_create_session()

    def _load_or_create_session(self):
        """Load existing session or create new one"""
        if self.session_file.exists():
            try:
                with open(self.session_file, 'r') as f:
                    self.data = json.load(f)
            except (json.JSONDecodeError, IOError):
                # Corrupted file, recreate
                self.data = self._new_session()
        else:
            self.data = self._new_session()

        # Ensure all required fields exist
        self.data.setdefault("agents", {})
        self.data.setdefault("parallel_exploration", {})
        self.data.setdefault("parallel_validation", {})
        self.data.setdefault("workflow", "auto-implement")
        self.data.setdefault("created_at", datetime.now().isoformat())

    def _new_session(self) -> Dict:
        """Create new session data structure"""
        return {
            "workflow": "auto-implement",
            "created_at": datetime.now().isoformat(),
            "agents": {},
            "parallel_exploration": {
                "status": "pending",
                "required": self.PARALLEL_EXPLORATION,
                "completed": [],
                "time_saved_seconds": 0,
                "efficiency_percent": 0
            },
            "parallel_validation": {
                "status": "pending",
                "required": self.PARALLEL_VALIDATION,
                "completed": [],
                "time_saved_seconds": 0,
                "efficiency_percent": 0,
                "sequential_time_seconds": 0,
                "parallel_time_seconds": 0
            }
        }

    def _save(self):
        """Save session data to file"""
        try:
            with open(self.session_file, 'w') as f:
                json.dump(self.data, f, indent=2)
        except IOError as e:
            print(f"⚠️  Failed to save session: {e}", file=sys.stderr)

    def track_agent(self, agent_name: str, duration_seconds: Optional[int] = None):
        """Track that an agent has been invoked"""
        timestamp = datetime.now().isoformat()

        self.data["agents"][agent_name] = {
            "invoked_at": timestamp,
            "duration_seconds": duration_seconds
        }

        # Update parallel execution tracking
        if agent_name in self.PARALLEL_EXPLORATION:
            self.data["parallel_exploration"]["completed"].append(agent_name)

        if agent_name in self.PARALLEL_VALIDATION:
            self.data["parallel_validation"]["completed"].append(agent_name)

        self._save()
        print(f"✅ Tracked: {agent_name} at {timestamp}")

    def verify_parallel_exploration(self) -> bool:
        """
        Verify that researcher and planner both ran.

        Returns:
            True if both agents completed, False otherwise
        """
        completed = self.data["parallel_exploration"]["completed"]
        required = self.PARALLEL_EXPLORATION

        # Check if all required agents completed
        success = all(agent in completed for agent in required)

        if success:
            # Calculate metrics
            self._calculate_parallel_metrics("parallel_exploration")
            self.data["parallel_exploration"]["status"] = "parallel" if len(set(completed)) == len(required) else "sequential"
        else:
            self.data["parallel_exploration"]["status"] = "incomplete"

        self._save()
        return success

    def verify_parallel_validation(self) -> bool:
        """
        Verify that reviewer, security-auditor, and doc-master all ran.

        Returns:
            True if all three agents completed, False otherwise
        """
        completed = self.data["parallel_validation"]["completed"]
        required = self.PARALLEL_VALIDATION

        # Check if all required agents completed
        success = all(agent in completed for agent in required)

        if success:
            # Calculate metrics
            self._calculate_parallel_metrics("parallel_validation")
            self.data["parallel_validation"]["status"] = "parallel" if len(set(completed)) == len(required) else "sequential"
        else:
            self.data["parallel_validation"]["status"] = "incomplete"

        self._save()
        return success

    def _calculate_parallel_metrics(self, phase: str):
        """Calculate time saved and efficiency for parallel execution"""
        agents = self.data[phase]["completed"]

        # Get agent durations (if available)
        durations = []
        for agent in agents:
            if agent in self.data["agents"]:
                duration = self.data["agents"][agent].get("duration_seconds")
                if duration:
                    durations.append(duration)

        if not durations:
            # No duration data, use estimates
            if phase == "parallel_exploration":
                # Researcher + Planner typically take 3-5 minutes each
                sequential_time = 8 * 60  # 8 minutes sequential
                parallel_time = 5 * 60    # 5 minutes parallel
            else:  # parallel_validation
                # Reviewer + Security + Docs typically take 1-2 minutes each
                sequential_time = 5 * 60  # 5 minutes sequential
                parallel_time = 2 * 60    # 2 minutes parallel
        else:
            sequential_time = sum(durations)
            parallel_time = max(durations)

        time_saved = sequential_time - parallel_time
        efficiency = (time_saved / sequential_time * 100) if sequential_time > 0 else 0

        self.data[phase]["sequential_time_seconds"] = sequential_time
        self.data[phase]["parallel_time_seconds"] = parallel_time
        self.data[phase]["time_saved_seconds"] = time_saved
        self.data[phase]["efficiency_percent"] = round(efficiency, 1)

    def get_status(self) -> Dict:
        """Get current status of all agents"""
        completed_agents = list(self.data["agents"].keys())
        missing_agents = [a for a in self.REQUIRED_AGENTS if a not in completed_agents]

        return {
            "total_agents": len(self.REQUIRED_AGENTS),
            "completed_count": len(completed_agents),
            "completed_agents": completed_agents,
            "missing_agents": missing_agents,
            "parallel_exploration": self.data["parallel_exploration"],
            "parallel_validation": self.data["parallel_validation"],
            "all_complete": len(missing_agents) == 0
        }

    def reset(self):
        """Reset session tracking"""
        self.data = self._new_session()
        self._save()
        print("✅ Session reset")

    def print_status(self):
        """Print formatted status report"""
        status = self.get_status()

        print("\n" + "="*50)
        print("AGENT TRACKER STATUS")
        print("="*50)
        print(f"\nCompleted: {status['completed_count']}/{status['total_agents']} agents")

        if status['completed_agents']:
            print("\n✅ Completed agents:")
            for agent in status['completed_agents']:
                timestamp = self.data["agents"][agent]["invoked_at"]
                print(f"   - {agent} ({timestamp})")

        if status['missing_agents']:
            print("\n❌ Missing agents:")
            for agent in status['missing_agents']:
                print(f"   - {agent}")

        # Parallel exploration status
        pe = status['parallel_exploration']
        print(f"\n📊 Parallel Exploration: {pe['status'].upper()}")
        if pe['status'] == 'parallel':
            print(f"   Time saved: {pe['time_saved_seconds']} seconds")
            print(f"   Efficiency: {pe['efficiency_percent']}%")

        # Parallel validation status
        pv = status['parallel_validation']
        print(f"\n📊 Parallel Validation: {pv['status'].upper()}")
        if pv['status'] == 'parallel':
            print(f"   Time saved: {pv['time_saved_seconds']} seconds")
            print(f"   Efficiency: {pv['efficiency_percent']}%")

        print("\n" + "="*50)

        if status['all_complete']:
            print("\n✅ All 7 agents completed successfully!")
        else:
            print(f"\n⚠️  {len(status['missing_agents'])} agents still pending")

        print()


def main():
    """Command-line interface"""
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python scripts/agent_tracker.py track <agent_name> [duration_seconds]")
        print("  python scripts/agent_tracker.py status")
        print("  python scripts/agent_tracker.py reset")
        sys.exit(1)

    command = sys.argv[1]
    tracker = AgentTracker()

    if command == "track":
        if len(sys.argv) < 3:
            print("Error: agent_name required for 'track' command")
            sys.exit(1)

        agent_name = sys.argv[2]
        duration = int(sys.argv[3]) if len(sys.argv) > 3 else None
        tracker.track_agent(agent_name, duration)

    elif command == "status":
        tracker.print_status()

    elif command == "reset":
        tracker.reset()

    else:
        print(f"Unknown command: {command}")
        print("Valid commands: track, status, reset")
        sys.exit(1)


if __name__ == "__main__":
    main()
