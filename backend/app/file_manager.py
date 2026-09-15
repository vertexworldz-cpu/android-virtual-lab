"""
File Transfer Manager for Android Virtual Lab.
Supports bi-directional file transfer between computer and Android Virtual Devices.
"""
import os
import re
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.config import settings
from app.models import DeviceFile, LogCategory, LogLevel
from app.adb_manager import adb_manager
from app.avd_manager import avd_manager
from app.emulator_manager import emulator_manager

logger = logging.getLogger("avl.files")


class FileManager:
    """Manages file pushing and pulling with Android virtual device filesystem."""

    async def list_files(self, device_id: str, path: str = "/sdcard/Download") -> List[DeviceFile]:
        device = avd_manager.get_device_by_id(device_id)
        if not device or not device.serial:
            return []
        return await adb_manager.list_device_files(device.serial, path)

    async def upload_file_to_device(
        self,
        device_id: str,
        filename: str,
        content: bytes,
        remote_dest: str = "/sdcard/Download/",
    ) -> Tuple[bool, str]:
        device = avd_manager.get_device_by_id(device_id)
        if not device or not device.serial:
            return False, "Device is not active"

        safe_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", os.path.basename(filename))
        local_temp = settings.UPLOADS_DIR / safe_filename
        try:
            with open(local_temp, "wb") as f:
                f.write(content)
        except Exception as e:
            return False, f"Failed to buffer upload: {e}"

        target_remote = f"{remote_dest.rstrip('/')}/{safe_filename}"
        emulator_manager.add_log(
            LogCategory.BACKEND,
            LogLevel.INFO,
            f"Pushing file '{safe_filename}' ({len(content)} bytes) to {target_remote}...",
            device_id=device.id,
            serial=device.serial,
        )

        success, msg = await adb_manager.push_file(device.serial, str(local_temp), target_remote)
        return success, msg

    async def download_file_from_device(
        self,
        device_id: str,
        remote_path: str,
    ) -> Tuple[bool, str, Optional[Path]]:
        device = avd_manager.get_device_by_id(device_id)
        if not device or not device.serial:
            return False, "Device is not active", None

        filename = os.path.basename(remote_path)
        safe_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)
        local_target = settings.DATA_DIR / f"download_{device.serial}_{safe_filename}"

        success, msg = await adb_manager.pull_file(device.serial, remote_path, str(local_target))
        if success and local_target.exists():
            return True, "File downloaded successfully", local_target
        return False, msg, None


file_manager = FileManager()
