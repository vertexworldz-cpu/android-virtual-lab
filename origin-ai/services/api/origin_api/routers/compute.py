"""Origin GPU — local compute discovery. Everything reported is measured on
this machine at request time; nothing is estimated or invented."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess

import psutil
import torch
from fastapi import APIRouter, Depends

from ..config import get_settings
from ..deps import current_user
from ..models import User

router = APIRouter(prefix="/compute", tags=["compute"])

_NVSMI_FIELDS = ["index", "name", "memory.total", "memory.used", "utilization.gpu", "temperature.gpu", "driver_version"]


def nvidia_gpus() -> tuple[list[dict], str | None]:
    """Query nvidia-smi. Returns (gpus, note). Empty list when no NVIDIA driver is present."""
    exe = shutil.which("nvidia-smi")
    if not exe:
        return [], "nvidia-smi not found: no NVIDIA driver detected on this machine."
    try:
        proc = subprocess.run([exe, f"--query-gpu={','.join(_NVSMI_FIELDS)}", "--format=csv,noheader,nounits"],
                              capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return [], f"nvidia-smi failed: {exc}"
    if proc.returncode != 0:
        return [], f"nvidia-smi exited with code {proc.returncode}: {proc.stderr.strip()[:200]}"
    gpus = []
    for line in proc.stdout.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != len(_NVSMI_FIELDS):
            continue

        def num(v: str) -> float | None:
            try:
                return float(v)
            except ValueError:
                return None
        gpus.append({"index": int(parts[0]), "name": parts[1], "memory_total_mb": num(parts[2]),
                     "memory_used_mb": num(parts[3]), "utilization_percent": num(parts[4]),
                     "temperature_c": num(parts[5]), "driver_version": parts[6]})
    return gpus, None


def local_report() -> dict:
    vm = psutil.virtual_memory()
    disk = shutil.disk_usage(get_settings().data_dir)
    gpus, gpu_note = nvidia_gpus()
    cuda = torch.cuda.is_available()
    mps = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    freq = None
    try:
        f = psutil.cpu_freq()
        freq = round(f.max or f.current) if f else None
    except Exception:
        freq = None
    return {
        "provider": "local",
        "billing": "free",  # your own hardware
        "host": {"os": f"{platform.system()} {platform.release()}", "arch": platform.machine(),
                 "python": platform.python_version()},
        "cpu": {"model": platform.processor() or platform.machine(), "physical_cores": psutil.cpu_count(logical=False),
                "logical_cores": psutil.cpu_count(logical=True), "max_mhz": freq,
                "usage_percent": psutil.cpu_percent(interval=0.2),
                "load_average": list(os.getloadavg()) if hasattr(os, "getloadavg") else None},
        "memory": {"total_bytes": vm.total, "available_bytes": vm.available, "used_percent": vm.percent},
        "disk": {"path": str(get_settings().data_dir), "total_bytes": disk.total, "free_bytes": disk.free},
        "gpus": gpus,
        "gpu_note": gpu_note,
        "torch": {"version": torch.__version__, "cuda_available": cuda,
                  "cuda_device_count": torch.cuda.device_count() if cuda else 0,
                  "mps_available": mps, "threads": torch.get_num_threads()},
        "training_device": "cuda" if cuda else "mps" if mps else "cpu",
    }


@router.get("/local")
def local(user: User = Depends(current_user)) -> dict:
    return local_report()
