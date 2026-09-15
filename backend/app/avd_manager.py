"""
AVD (Android Virtual Device) Manager for Android Virtual Lab.
Creates, configures, inspects, and wipes real AVD instances.
"""
import os
import re
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from app.config import settings
from app.models import (
    VirtualDevice,
    CreateDeviceRequest,
    DeviceState,
)
from app.system_discovery import discovery, STANDARD_PROFILES

logger = logging.getLogger("avl.avd")


class AVDManager:
    """Manages AVD disk configurations, creation, deletion, and factory resetting."""

    def __init__(self):
        self._devices_cache: Dict[str, VirtualDevice] = {}

    def get_avd_dir(self, avd_name: str) -> Path:
        return settings.get_avd_home() / f"{avd_name}.avd"

    def get_ini_file(self, avd_name: str) -> Path:
        return settings.get_avd_home() / f"{avd_name}.ini"

    def list_all_devices(self) -> List[VirtualDevice]:
        """Lists all detected and configured AVDs on the host system."""
        avds_raw = discovery.get_installed_avds()
        devices: List[VirtualDevice] = []

        for item in avds_raw:
            avd_name = item["avd_name"]
            dev_id = f"dev_{avd_name}"
            
            # Check if cached with live runtime state
            if dev_id in self._devices_cache:
                dev = self._devices_cache[dev_id]
                # Update static properties if needed
                dev.api_level = item["api_level"]
                dev.android_version = item["android_version"]
                dev.has_play_store = item["has_play_store"]
                devices.append(dev)
            else:
                dev = VirtualDevice(
                    id=dev_id,
                    name=avd_name.replace("_", " "),
                    avd_name=avd_name,
                    android_version=item["android_version"],
                    api_level=item["api_level"],
                    profile=item["device_name"],
                    width=item["width"],
                    height=item["height"],
                    dpi=item["dpi"],
                    ram_mb=item["ram_mb"],
                    cpu_cores=item["cpu_cores"],
                    storage_mb=item.get("storage_mb", 8192),
                    has_play_store=item["has_play_store"],
                    status=DeviceState.STOPPED,
                    created_at="Pre-existing on Host",
                )
                self._devices_cache[dev_id] = dev
                devices.append(dev)

        return devices

    def get_device_by_id(self, device_id: str) -> Optional[VirtualDevice]:
        devices = self.list_all_devices()
        for d in devices:
            if d.id == device_id or d.avd_name == device_id:
                return d
        return None

    def create_avd(self, req: CreateDeviceRequest) -> Tuple[bool, str, Optional[VirtualDevice]]:
        """Creates a real AVD configuration on the host with persistent storage."""
        # Sanitize AVD name for filesystem
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", req.name.strip())
        if not safe_name:
            return False, "Device name cannot be empty", None

        avd_home = settings.get_avd_home()
        avd_dir = avd_home / f"{safe_name}.avd"
        ini_file = avd_home / f"{safe_name}.ini"

        if ini_file.exists() or avd_dir.exists():
            return False, f"AVD '{safe_name}' already exists on host", None

        # Check installed system images to pick the best match
        installed_images = discovery.get_installed_system_images()
        matched_image = None
        for img in installed_images:
            if img.api_level == req.api_level:
                matched_image = img
                break
        if not matched_image and installed_images:
            matched_image = installed_images[0]

        has_play_store = matched_image.has_play_store if matched_image else True
        image_tag = matched_image.tag if matched_image else "google_apis_playstore"
        image_abi = matched_image.abi if matched_image else settings.arch
        image_sysdir = matched_image.path if matched_image else f"system-images/android-{req.api_level}/{image_tag}/{image_abi}/"

        # Try avdmanager binary if available
        avd_tool = settings.get_avd_manager_path()
        created_via_tool = False
        if avd_tool and avd_tool.exists() and matched_image:
            cmd = [
                str(avd_tool), "create", "avd",
                "-n", safe_name,
                "-k", f"system-images;android-{matched_image.api_level};{matched_image.tag};{matched_image.abi}",
                "--force",
            ]
            try:
                proc = subprocess.run(cmd, input="no\n", capture_output=True, text=True, timeout=30)
                if proc.returncode == 0:
                    created_via_tool = True
            except Exception as e:
                logger.warning(f"avdmanager tool execution error: {e}")

        # If not created via tool, create standard AVD directory and files
        if not created_via_tool:
            try:
                avd_dir.mkdir(parents=True, exist_ok=True)
                
                # Write .ini file
                with open(ini_file, "w", encoding="utf-8") as f:
                    f.write(f"avd.ini.encoding=UTF-8\n")
                    f.write(f"path={avd_dir}\n")
                    f.write(f"path.rel=avd/{safe_name}.avd\n")
                    f.write(f"target=android-{req.api_level}\n")

                # Write config.ini with rich realistic hardware parameters
                config_lines = [
                    f"avd.ini.displayname={req.name}",
                    f"avd.ini.encoding=UTF-8",
                    f"abi.type={image_abi}",
                    f"hw.cpu.arch={image_abi}",
                    f"hw.cpu.ncore={req.cpu_cores}",
                    f"hw.ramSize={req.ram_mb}",
                    f"vm.heapSize=512",
                    f"hw.lcd.width={req.width}",
                    f"hw.lcd.height={req.height}",
                    f"hw.lcd.density={req.dpi}",
                    f"hw.device.name={req.device_profile.lower().replace(' ', '_')}",
                    f"hw.device.manufacturer=Google",
                    f"hw.keyboard=yes",
                    f"hw.dPad=no",
                    f"hw.touchScreen=touchscreen",
                    f"hw.trackBall=no",
                    f"hw.mainKeys=no",
                    f"hw.camera.back={req.camera_back}",
                    f"hw.camera.front={req.camera_front}",
                    f"hw.audioInput=yes" if req.mic else "hw.audioInput=no",
                    f"hw.audioOutput=yes",
                    f"hw.gps=yes" if req.gps else "hw.gps=no",
                    f"hw.battery=yes",
                    f"hw.accelerometer=yes",
                    f"hw.sensors.orientation=yes",
                    f"hw.sensors.proximity=yes",
                    f"disk.dataPartition.size={req.storage_mb}M",
                    f"PlayStore.enabled={'true' if has_play_store else 'false'}",
                    f"tag.id={image_tag}",
                    f"tag.display={'Google Play' if has_play_store else 'Google APIs'}",
                    f"image.sysdir.1={image_sysdir}",
                ]
                with open(avd_dir / "config.ini", "w", encoding="utf-8") as f:
                    f.write("\n".join(config_lines) + "\n")

            except Exception as e:
                return False, f"Failed to write AVD files: {e}", None

        dev_id = f"dev_{safe_name}"
        new_dev = VirtualDevice(
            id=dev_id,
            name=req.name,
            avd_name=safe_name,
            android_version=req.android_version,
            api_level=req.api_level,
            profile=req.device_profile,
            width=req.width,
            height=req.height,
            dpi=req.dpi,
            ram_mb=req.ram_mb,
            cpu_cores=req.cpu_cores,
            storage_mb=req.storage_mb,
            has_play_store=has_play_store,
            status=DeviceState.STOPPED,
            created_at="Just now",
        )
        self._devices_cache[dev_id] = new_dev
        return True, "AVD created successfully", new_dev

    def delete_avd(self, avd_name: str) -> Tuple[bool, str]:
        """Deletes an AVD and its data from host."""
        ini_file = self.get_ini_file(avd_name)
        avd_dir = self.get_avd_dir(avd_name)

        # Check if avdmanager can delete
        avd_tool = settings.get_avd_manager_path()
        if avd_tool and avd_tool.exists():
            subprocess.run([str(avd_tool), "delete", "avd", "-n", avd_name], capture_output=True)

        if ini_file.exists():
            try:
                ini_file.unlink()
            except Exception as e:
                logger.error(f"Error removing {ini_file}: {e}")

        if avd_dir.exists():
            try:
                shutil.rmtree(avd_dir)
            except Exception as e:
                return False, f"Error removing {avd_dir}: {e}"

        dev_id = f"dev_{avd_name}"
        self._devices_cache.pop(dev_id, None)
        return True, f"AVD {avd_name} deleted"

    def factory_reset_avd(self, avd_name: str) -> Tuple[bool, str]:
        """
        Factory resets an AVD by wiping its user data partitions and snapshots.
        This wipes user apps, downloads, and accounts while keeping the base system image.
        """
        avd_dir = self.get_avd_dir(avd_name)
        if not avd_dir.exists():
            return False, f"AVD directory {avd_dir} does not exist"

        wipe_targets = [
            "userdata-qemu.img",
            "userdata-qemu.img.qcow2",
            "userdata.img",
            "hardware-qemu.ini",
            "snapshots",
            "cache.img",
            "cache.img.qcow2",
        ]
        wiped = []
        for target_name in wipe_targets:
            p = avd_dir / target_name
            if p.exists():
                if p.is_dir():
                    shutil.rmtree(p)
                else:
                    p.unlink()
                wiped.append(target_name)

        return True, f"Factory reset complete for {avd_name}. Erased: {', '.join(wiped) if wiped else 'Clean state'}"


avd_manager = AVDManager()
