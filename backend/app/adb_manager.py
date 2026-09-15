"""
ADB Manager for Android Virtual Lab.
Provides robust, strictly serial-targeted operations for Android Emulator instances.
"""
import os
import re
import shlex
import shutil
import asyncio
import logging
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from app.config import settings
from app.models import InstalledPackage, DeviceFile

logger = logging.getLogger("avl.adb")


class ADBManager:
    """Encapsulates all interaction with the Android Debug Bridge (ADB)."""

    def __init__(self):
        self._active_recordings: Dict[str, subprocess.Popen] = {}

    def get_adb_binary(self) -> str:
        adb = settings.get_adb_path()
        if not adb or not adb.exists():
            raise RuntimeError("ADB binary not found on host. Please install android-platform-tools.")
        return str(adb)

    async def run_adb(self, args: List[str], timeout: float = 30.0) -> Tuple[int, str, str]:
        """Runs an ADB command with timeout."""
        adb_bin = self.get_adb_binary()
        cmd = [adb_bin] + args
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_data, stderr_data = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return (
                proc.returncode or 0,
                stdout_data.decode("utf-8", errors="replace"),
                stderr_data.decode("utf-8", errors="replace"),
            )
        except asyncio.TimeoutError:
            proc.kill()
            return -1, "", f"Command timed out after {timeout}s: {' '.join(cmd)}"

    def run_adb_sync(self, args: List[str], timeout: float = 30.0) -> Tuple[int, str, str]:
        """Synchronous ADB command runner."""
        adb_bin = self.get_adb_binary()
        cmd = [adb_bin] + args
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return res.returncode, res.stdout, res.stderr
        except subprocess.TimeoutExpired:
            return -1, "", f"Command timed out after {timeout}s: {' '.join(cmd)}"
        except Exception as e:
            return -1, "", str(e)

    async def get_connected_devices(self) -> List[Dict[str, str]]:
        """Returns list of all devices recognized by ADB."""
        code, out, err = await self.run_adb(["devices", "-l"])
        devices = []
        if code != 0:
            return devices

        for line in out.splitlines()[1:]:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 2:
                serial = parts[0]
                state = parts[1]
                details = " ".join(parts[2:]) if len(parts) > 2 else ""
                
                # Extract product, model, device
                model = ""
                m = re.search(r"model:(\S+)", details)
                if m:
                    model = m.group(1)

                devices.append({
                    "serial": serial,
                    "state": state,
                    "model": model,
                    "details": details,
                })
        return devices

    async def is_device_ready(self, serial: str) -> bool:
        """Verifies if device is online, responsive, and boot_completed."""
        # 1. State check
        code, out, _ = await self.run_adb(["-s", serial, "get-state"])
        if code != 0 or "device" not in out.strip():
            return False

        # 2. Boot completed property
        code, out, _ = await self.run_adb(["-s", serial, "shell", "getprop", "sys.boot_completed"])
        if code != 0 or out.strip() != "1":
            return False

        return True

    async def get_device_resolution(self, serial: str) -> Tuple[int, int]:
        """Gets display resolution (width, height)."""
        code, out, _ = await self.run_adb(["-s", serial, "shell", "wm", "size"])
        if code == 0:
            m = re.search(r"Physical size: (\d+)x(\d+)", out)
            if m:
                return int(m.group(1)), int(m.group(2))
            m = re.search(r"(\d+)x(\d+)", out)
            if m:
                return int(m.group(1)), int(m.group(2))
        return 1080, 2400

    def capture_screencap_raw(self, serial: str) -> Optional[bytes]:
        """Captures raw PNG screencap via adb exec-out screencap -p."""
        adb_bin = self.get_adb_binary()
        cmd = [adb_bin, "-s", serial, "exec-out", "screencap", "-p"]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=12)
            if proc.returncode == 0 and len(proc.stdout) > 100:
                return proc.stdout
        except Exception as e:
            logger.warning(f"exec-out screencap failed for {serial}: {e}, trying fallback...")
            try:
                # Fallback: capture on device and pull
                subprocess.run([adb_bin, "-s", serial, "shell", "screencap", "-p", "/data/local/tmp/sc.png"], timeout=10)
                pull = subprocess.run([adb_bin, "-s", serial, "exec-out", "cat", "/data/local/tmp/sc.png"], capture_output=True, timeout=10)
                if pull.returncode == 0 and len(pull.stdout) > 100:
                    return pull.stdout
            except Exception as e2:
                logger.error(f"Fallback screencap also failed for {serial}: {e2}")
        return None

    async def send_tap(self, serial: str, x: int, y: int) -> bool:
        """Sends tap touch event."""
        code, _, _ = await self.run_adb(["-s", serial, "shell", "input", "tap", str(x), str(y)])
        return code == 0

    async def send_swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> bool:
        """Sends swipe / drag touch event."""
        code, _, _ = await self.run_adb([
            "-s", serial, "shell", "input", "swipe",
            str(x1), str(y1), str(x2), str(y2), str(duration_ms)
        ])
        return code == 0

    async def send_key(self, serial: str, keycode: int) -> bool:
        """Sends an Android KeyEvent keycode."""
        code, _, _ = await self.run_adb(["-s", serial, "shell", "input", "keyevent", str(keycode)])
        return code == 0

    async def send_text(self, serial: str, text: str) -> bool:
        """Sends text input into the active focused field.
        
        Uses clipboard-paste method for reliable input including emails with @ symbols.
        Falls back to character-by-character key injection if needed.
        """
        if not text:
            return True

        # Method 1: Use clipboard paste (most reliable for all characters including @)
        # Set clipboard content via adb shell
        try:
            # Escape the text for shell - replace problematic chars
            # Use printf + xclip pattern via am broadcast to set clipboard
            escaped = text.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('!', '\\!').replace('&', '\\&').replace(';', '\\;').replace('<', '\\<').replace('>', '\\>')
            
            # Try direct adb input text first (works for simple ASCII)
            # adb input text handles spaces as %s internally
            adb_safe = ""
            for ch in text:
                if ch == ' ':
                    adb_safe += '%s'
                elif ch in r'\&;<>`"\'$!|(){}[]^#~':
                    adb_safe += '\\' + ch
                else:
                    adb_safe += ch

            code, out, err = await self.run_adb(["-s", serial, "shell", "input", "text", adb_safe], timeout=10)
            if code == 0:
                return True
        except Exception as e:
            logger.warning(f"send_text method 1 failed: {e}")

        # Method 2: Use am broadcast to set clipboard then paste
        try:
            # Set text via content provider / clipboard trick
            clip_cmd = f"am broadcast -a clipper.SET -e text '{escaped}'"
            await self.run_adb(["-s", serial, "shell", clip_cmd], timeout=5)
            # Paste using Ctrl+V
            await self.run_adb(["-s", serial, "shell", "input", "keyevent", "--longpress", "279"], timeout=5)
            return True
        except Exception as e:
            logger.warning(f"send_text method 2 failed: {e}")
            return False

    async def install_apk(self, serial: str, apk_path: str, reinstall: bool = True) -> Tuple[bool, str]:
        """Installs an APK on the target device and returns result message."""
        args = ["-s", serial, "install"]
        if reinstall:
            args.append("-r")
        args.append("-t")  # Allow test packages
        args.append(apk_path)

        code, out, err = await self.run_adb(args, timeout=180.0)
        combined = f"{out}\n{err}".strip()
        if code == 0 and "Success" in combined:
            return True, "Success"
        return False, combined or "Installation failed"

    async def uninstall_package(self, serial: str, package_name: str) -> Tuple[bool, str]:
        """Uninstalls a package."""
        code, out, err = await self.run_adb(["-s", serial, "uninstall", package_name])
        combined = f"{out}\n{err}".strip()
        if code == 0 and "Success" in combined:
            return True, "Package uninstalled successfully"
        return False, combined

    async def list_installed_packages(self, serial: str, user_only: bool = False) -> List[InstalledPackage]:
        """Lists installed packages with details."""
        args = ["-s", serial, "shell", "pm", "list", "packages", "-f"]
        if user_only:
            args.append("-3")

        code, out, _ = await self.run_adb(args)
        packages = []
        if code != 0:
            return packages

        for line in out.splitlines():
            line = line.strip()
            if line.startswith("package:"):
                raw = line[8:]
                if "=" in raw:
                    apk_path, pkg_name = raw.rsplit("=", 1)
                else:
                    apk_path = ""
                    pkg_name = raw

                is_play = (pkg_name == "com.android.vending")
                is_chrome = (pkg_name == "com.android.chrome")
                is_system = apk_path.startswith("/system") or apk_path.startswith("/apex")

                packages.append(
                    InstalledPackage(
                        package_name=pkg_name,
                        app_name=pkg_name.split(".")[-1].capitalize(),
                        apk_path=apk_path,
                        is_system=is_system,
                        is_play_store=is_play,
                        is_chrome=is_chrome,
                    )
                )
        return packages

    async def launch_package(self, serial: str, package_name: str) -> Tuple[bool, str]:
        """Launches an app using Android monkey runner."""
        code, out, err = await self.run_adb([
            "-s", serial, "shell", "monkey",
            "-p", package_name,
            "-c", "android.intent.category.LAUNCHER",
            "1"
        ])
        if code == 0 and ("Events injected: 1" in out or "Monkey" in out):
            return True, f"Launched {package_name}"
        return False, f"{out}\n{err}".strip()

    async def open_play_store(self, serial: str, target_package: Optional[str] = None) -> Tuple[bool, str]:
        """Opens Google Play Store, optionally directing to a specific app details page."""
        if target_package:
            uri = f"market://details?id={target_package}"
            cmd = ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", uri]
        else:
            cmd = ["-s", serial, "shell", "monkey", "-p", "com.android.vending", "-c", "android.intent.category.LAUNCHER", "1"]

        code, out, err = await self.run_adb(cmd)
        if code == 0:
            return True, "Google Play Store launched"
        return False, f"Could not launch Play Store: {out} {err}".strip()

    async def open_chrome(self, serial: str, url: Optional[str] = None) -> Tuple[bool, str]:
        """Opens Chrome browser, optionally navigating to a URL."""
        target_url = url or "https://www.google.com"
        cmd = ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", target_url]
        code, out, err = await self.run_adb(cmd)
        if code == 0:
            return True, f"Opened {target_url} in browser"
        return False, f"Could not launch browser: {out} {err}".strip()

    async def open_downloads_folder(self, serial: str) -> Tuple[bool, str]:
        """Opens the Android Files / Downloads app."""
        cmd = ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW_DOWNLOADS"]
        code, out, err = await self.run_adb(cmd)
        if code == 0:
            return True, "Opened Downloads app"
        # Fallback to Files app
        cmd_fallback = ["-s", serial, "shell", "monkey", "-p", "com.google.android.documentsui", "-c", "android.intent.category.LAUNCHER", "1"]
        c2, o2, e2 = await self.run_adb(cmd_fallback)
        if c2 == 0:
            return True, "Opened Files app"
        return False, f"Failed to open Downloads: {out} {err} {o2}".strip()

    async def push_file(self, serial: str, local_path: str, remote_path: str = "/sdcard/Download/") -> Tuple[bool, str]:
        """Pushes a file from host computer to Android device."""
        code, out, err = await self.run_adb(["-s", serial, "push", local_path, remote_path])
        if code == 0:
            return True, f"File transferred to {remote_path}"
        return False, f"File transfer failed: {out} {err}".strip()

    async def pull_file(self, serial: str, remote_path: str, local_path: str) -> Tuple[bool, str]:
        """Pulls a file from Android device to host computer."""
        code, out, err = await self.run_adb(["-s", serial, "pull", remote_path, local_path])
        if code == 0:
            return True, f"File downloaded to {local_path}"
        return False, f"Download failed: {out} {err}".strip()

    async def list_device_files(self, serial: str, directory: str = "/sdcard/Download") -> List[DeviceFile]:
        """Lists files in device directory."""
        code, out, _ = await self.run_adb(["-s", serial, "shell", "ls", "-la", directory])
        files = []
        if code != 0:
            return files

        for line in out.splitlines():
            line = line.strip()
            if not line or line.startswith("total"):
                continue
            parts = line.split(maxsplit=7)
            if len(parts) >= 8:
                perms = parts[0]
                is_dir = perms.startswith("d")
                size = int(parts[4]) if parts[4].isdigit() else 0
                date = f"{parts[5]} {parts[6]}"
                name = parts[7]
                if name in [".", ".."]:
                    continue
                files.append(
                    DeviceFile(
                        name=name,
                        path=f"{directory.rstrip('/')}/{name}",
                        size=size,
                        is_directory=is_dir,
                        modified=date,
                    )
                )
        return files

    async def set_gps_location(self, serial: str, latitude: float, longitude: float, altitude: float = 0.0) -> Tuple[bool, str]:
        """Sets emulator GPS coordinates via emu geo fix."""
        # Note: 'geo fix' requires longitude first, then latitude, altitude
        code, out, err = await self.run_adb(["-s", serial, "emu", "geo", "fix", str(longitude), str(latitude), str(altitude)])
        if code == 0:
            return True, f"Location updated to Lat: {latitude}, Lon: {longitude}"
        return False, f"Failed to set GPS: {out} {err}".strip()

    async def execute_shell(self, serial: str, command: str) -> Tuple[int, str]:
        """Runs an arbitrary adb shell command scoped strictly to the specified device serial."""
        code, out, err = await self.run_adb(["-s", serial, "shell", command], timeout=30.0)
        output = f"{out}\n{err}".strip() if err else out.strip()
        return code, output

    async def take_screenshot_file(self, serial: str, filename_prefix: str = "screen") -> Optional[str]:
        """Takes a screenshot and saves it as a PNG file in screenshots directory."""
        from datetime import datetime
        raw = self.capture_screencap_raw(serial)
        if not raw:
            return None

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        fn = f"{filename_prefix}_{serial}_{ts}.png"
        target_path = settings.SCREENSHOTS_DIR / fn
        with open(target_path, "wb") as f:
            f.write(raw)
        return str(target_path)


adb_manager = ADBManager()
