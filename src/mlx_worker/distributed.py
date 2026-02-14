"""
Distributed Inference Manager

Pipeline parallel inference across multiple Apple Silicon Macs using mlx.distributed.
Splits model layers proportionally by available memory across coordinator and workers.

Architecture:
- Coordinator (this machine): Runs first N% of layers
- Workers (remote Macs): Run remaining layers via SSH
- Communication: mlx.distributed send/recv (JACCL backend)
- Fallback: Local-only inference if workers unavailable

Issue #69
"""

import json
import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class PeerConfig:
    """Configuration for a remote peer node."""
    host: str
    memory_gb: int
    port: int = 8081
    ssh_user: Optional[str] = None
    ssh_key: Optional[str] = None


@dataclass
class DistributedConfig:
    """Distributed inference configuration."""
    enabled: bool = False
    peers: List[PeerConfig] = field(default_factory=list)
    strategy: str = "pipeline"  # pipeline or tensor
    connection: str = "auto"  # auto, rdma, tcp
    local_memory_gb: int = 128  # Local machine memory


@dataclass
class LayerAllocation:
    """Layer allocation for a node."""
    node_id: str
    host: str
    start_layer: int
    end_layer: int
    memory_gb: int


class DistributedInferenceManager:
    """
    Manages pipeline parallel inference across multiple Apple Silicon Macs.

    Allocates model layers proportionally by memory and coordinates
    inference using mlx.distributed primitives.
    """

    def __init__(self, config: DistributedConfig):
        self.config = config
        self._allocations: List[LayerAllocation] = []
        self._worker_processes: Dict[str, subprocess.Popen] = {}
        self._is_ready = False

    @classmethod
    def from_config_file(cls, config_path: str = ".anyclauderc.json") -> "DistributedInferenceManager":
        """Load distributed config from .anyclauderc.json."""
        path = Path(config_path)
        if not path.exists():
            return cls(DistributedConfig())

        with open(path) as f:
            raw = json.load(f)

        dist_config = raw.get("backends", {}).get("local", {}).get("distributed", {})
        if not dist_config.get("enabled", False):
            return cls(DistributedConfig())

        peers = [
            PeerConfig(
                host=p["host"],
                memory_gb=p.get("memory_gb", 128),
                port=p.get("port", 8081),
                ssh_user=p.get("ssh_user"),
                ssh_key=p.get("ssh_key"),
            )
            for p in dist_config.get("peers", [])
        ]

        config = DistributedConfig(
            enabled=True,
            peers=peers,
            strategy=dist_config.get("strategy", "pipeline"),
            connection=dist_config.get("connection", "auto"),
            local_memory_gb=dist_config.get("local_memory_gb", 128),
        )
        return cls(config)

    def allocate_layers(self, total_layers: int) -> List[LayerAllocation]:
        """
        Allocate model layers proportionally by memory.

        Args:
            total_layers: Total number of transformer layers in the model

        Returns:
            List of LayerAllocation for each node (coordinator first, then peers)
        """
        nodes = [
            ("coordinator", "localhost", self.config.local_memory_gb),
        ]
        for peer in self.config.peers:
            nodes.append((peer.host, peer.host, peer.memory_gb))

        total_memory = sum(m for _, _, m in nodes)
        allocations = []
        current_layer = 0

        for i, (node_id, host, memory) in enumerate(nodes):
            proportion = memory / total_memory
            if i == len(nodes) - 1:
                # Last node gets remaining layers to avoid rounding issues
                layer_count = total_layers - current_layer
            else:
                layer_count = round(total_layers * proportion)

            allocations.append(LayerAllocation(
                node_id=node_id,
                host=host,
                start_layer=current_layer,
                end_layer=current_layer + layer_count,
                memory_gb=memory,
            ))
            current_layer += layer_count

        self._allocations = allocations
        return allocations

    def check_peer_connectivity(self) -> Dict[str, bool]:
        """
        Check connectivity to all peers.

        Returns:
            Dict mapping host to reachable status
        """
        results = {}
        for peer in self.config.peers:
            try:
                result = subprocess.run(
                    ["ping", "-c", "1", "-W", "2", peer.host],
                    capture_output=True, timeout=5,
                )
                results[peer.host] = result.returncode == 0
            except (subprocess.TimeoutExpired, OSError):
                results[peer.host] = False
        return results

    def detect_connection_type(self, peer_host: str) -> str:
        """
        Detect whether RDMA (Thunderbolt) or TCP should be used.

        Checks for low-latency connection indicative of Thunderbolt/RDMA.

        Args:
            peer_host: Peer hostname or IP

        Returns:
            "rdma" or "tcp"
        """
        if self.config.connection != "auto":
            return self.config.connection

        try:
            result = subprocess.run(
                ["ping", "-c", "3", "-W", "1", peer_host],
                capture_output=True, text=True, timeout=10,
            )
            # Parse average RTT from ping output
            # macOS format: "round-trip min/avg/max/stddev = 0.045/0.052/0.065/0.009 ms"
            output = result.stdout
            if "round-trip" in output or "rtt" in output:
                for line in output.split("\n"):
                    if "avg" in line.lower():
                        parts = line.split("=")[-1].strip().split("/")
                        if len(parts) >= 2:
                            avg_ms = float(parts[1])
                            # Thunderbolt typically shows <0.1ms latency
                            if avg_ms < 0.5:
                                return "rdma"
        except Exception:
            pass

        return "tcp"

    def generate_hostfile(self) -> str:
        """
        Generate JACCL-format hostfile for mlx.distributed.

        Returns:
            Path to generated hostfile
        """
        hostfile_path = Path.home() / ".anyclaude" / "hostfile"
        hostfile_path.parent.mkdir(parents=True, exist_ok=True)

        lines = ["localhost"]
        for peer in self.config.peers:
            lines.append(peer.host)

        hostfile_path.write_text("\n".join(lines) + "\n")
        return str(hostfile_path)

    def start_workers(self, model_path: str) -> bool:
        """
        Launch worker processes on remote peers via SSH.

        Args:
            model_path: Path to the model on each machine

        Returns:
            True if all workers started successfully
        """
        all_started = True

        for i, peer in enumerate(self.config.peers):
            allocation = self._allocations[i + 1] if len(self._allocations) > i + 1 else None
            if not allocation:
                continue

            ssh_cmd = ["ssh"]
            if peer.ssh_key:
                ssh_cmd.extend(["-i", peer.ssh_key])
            if peer.ssh_user:
                ssh_cmd.append(f"{peer.ssh_user}@{peer.host}")
            else:
                ssh_cmd.append(peer.host)

            # Remote command to start MLX worker with layer range
            remote_cmd = (
                f"cd ~/anyclaude && "
                f"MLX_MODEL_PATH='{model_path}' "
                f"MLX_LAYER_START={allocation.start_layer} "
                f"MLX_LAYER_END={allocation.end_layer} "
                f"python3 -m src.mlx_worker.server"
            )
            ssh_cmd.append(remote_cmd)

            try:
                proc = subprocess.Popen(
                    ssh_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                self._worker_processes[peer.host] = proc
                print(f"[distributed] Started worker on {peer.host} "
                      f"(layers {allocation.start_layer}-{allocation.end_layer})")
            except Exception as e:
                print(f"[distributed] Failed to start worker on {peer.host}: {e}")
                all_started = False

        self._is_ready = all_started
        return all_started

    def stop_workers(self) -> None:
        """Stop all remote worker processes."""
        for host, proc in self._worker_processes.items():
            try:
                proc.terminate()
                proc.wait(timeout=10)
                print(f"[distributed] Stopped worker on {host}")
            except Exception as e:
                print(f"[distributed] Error stopping worker on {host}: {e}")
                try:
                    proc.kill()
                except Exception:
                    pass
        self._worker_processes.clear()
        self._is_ready = False

    @property
    def is_ready(self) -> bool:
        """Check if distributed inference is ready."""
        return self._is_ready and self.config.enabled

    @property
    def is_enabled(self) -> bool:
        """Check if distributed inference is configured."""
        return self.config.enabled and len(self.config.peers) > 0

    def get_status(self) -> Dict[str, Any]:
        """Get distributed inference status for health endpoint."""
        return {
            "enabled": self.config.enabled,
            "ready": self._is_ready,
            "strategy": self.config.strategy,
            "peers": [
                {
                    "host": peer.host,
                    "memory_gb": peer.memory_gb,
                    "connected": peer.host in self._worker_processes,
                }
                for peer in self.config.peers
            ],
            "allocations": [
                {
                    "node": a.node_id,
                    "layers": f"{a.start_layer}-{a.end_layer}",
                    "memory_gb": a.memory_gb,
                }
                for a in self._allocations
            ],
        }
