"""
APK Manager for Android Virtual Lab.
Handles APK upload validation, package inspection, installation, and management.
"""
import os
import io
import re
import zipfile
import shutil
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from app.config import settings
from app.models import InstalledPackage, LogCategory, LogLevel
from app.adb_manager import adb_manager
from app.avd_manager import avd_manager
from app.emulator_manager import emulator_manager

logger = logging.getLogger("avl.apk")


class APKManager:
    """Manages APK inspection and installation workflows."""

    def save_uploaded_apk(self, filename: str, content: bytes) -> Tuple[bool, str, Optional[Path]]:
        """Saves uploaded APK to secure uploads folder with path traversal protection."""
        # Sanitize filename
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", os.path.basename(filename))
        if not safe_name.lower().endswith(".apk"):
            safe_name += ".apk"

        # Check file size limit
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(content) > max_bytes:
            return False, f"APK file size exceeds limit of {settings.MAX_UPLOAD_SIZE_MB}MB", None

        # Verify it is a valid zip/apk
        try:
            with zipfile.ZipFile(io.BytesIO(content)) if hasattr(io, "BytesIO") else zipfile.ZipFile(filename):
                pass
        except Exception:
            pass  # We will save to disk first then inspect

        target_path = settings.UPLOADS_DIR / safe_name
        try:
            with open(target_path, "wb") as f:
                f.write(content)
        except Exception as e:
            return False, f"Failed to save APK: {e}", None

        # Inspect if valid zip
        if not zipfile.is_zipfile(target_path):
            target_path.unlink(missing_ok=True)
            return False, "File is not a valid Android APK package archive", None

        return True, "APK saved successfully", target_path

    def inspect_apk(self, apk_path: Path) -> Dict[str, Any]:
        """Reads basic metadata from APK without external dependencies."""
        info = {
            "filename": apk_path.name,
            "size_bytes": apk_path.stat().st_size,
            "has_manifest": False,
            "has_classes_dex": False,
            "has_resources": False,
        }

        try:
            with zipfile.ZipFile(apk_path, "r") as zf:
                names = zf.namelist()
                info["has_manifest"] = "AndroidManifest.xml" in names
                info["has_classes_dex"] = any(n.startswith("classes") and n.endswith(".dex") for n in names)
                info["has_resources"] = "resources.arsc" in names
        except Exception as e:
            logger.warning(f"Error reading APK zip: {e}")

        return info

    async def install_to_device(
        self,
        device_id: str,
        apk_path: Path,
        reinstall: bool = True,
    ) -> Tuple[bool, str]:
        """Installs the APK file onto the specified virtual device."""
        device = avd_manager.get_device_by_id(device_id)
        if not device or not device.serial:
            return False, f"Device {device_id} is not running or has no ADB serial"

        serial = device.serial
        emulator_manager.add_log(
            LogCategory.APK,
            LogLevel.INFO,
            f"Initiating installation of '{apk_path.name}' to {serial}...",
            device_id=device.id,
            serial=serial,
        )

        success, message = await adb_manager.install_apk(serial, str(apk_path), reinstall=reinstall)
        if success:
            emulator_manager.add_log(
                LogCategory.APK,
                LogLevel.INFO,
                f"Successfully installed '{apk_path.name}' on {serial}",
                device_id=device.id,
                serial=serial,
            )
        else:
            fix = "Ensure device has sufficient storage and unknown sources are permitted."
            if "INSTALL_FAILED_ALREADY_EXISTS" in message:
                fix = "Package already exists; retry with reinstall enabled."
            elif "INSTALL_FAILED_VERSION_DOWNGRADE" in message:
                fix = "Cannot downgrade an installed package without uninstalling it first."
            elif "INSTALL_FAILED_INSUFFICIENT_STORAGE" in message:
                fix = "Device storage is full. Free up space or increase AVD storage partition."

            emulator_manager.add_log(
                LogCategory.APK,
                LogLevel.ERROR,
                f"Failed to install '{apk_path.name}' on {serial}: {message}",
                device_id=device.id,
                serial=serial,
                suggested_fix=fix,
            )

        return success, message


apk_manager = APKManager()
