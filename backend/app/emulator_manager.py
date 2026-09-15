"""
Emulator Process Manager for Android Virtual Lab.
Spawns, monitors, and controls real Android Emulator QEMU instances with port and serial tracking.
"""
import os
import time
import signal
import asyncio
import logging
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from app.config import settings
from app.models import (
    VirtualDevice,
    DeviceState,
    LogCategory,
    LogLevel,
    LogEntry,
)
from app.adb_manager import adb_manager
from app.avd_manager import avd_manager

logger = logging.getLogger("avl.emulator")


class EmulatorInstance:
    def __init__(self, device: VirtualDevice, port: int):
        self.device = device
        self.port = port
        self.serial = f"emulator-{port}"
        self.process: Optional[subprocess.Popen] = None
        self.started_at: float = 0.0
        self.boot_task: Optional[asyncio.Task] = None
        self.log_file: Optional[Path] = None


class EmulatorProcessManager:
    """Manages lifecycle of all running Android Emulator instances."""

    def __init__(self):
        self._instances: Dict[str, EmulatorInstance] = {}
        self._next_port = settings.EMULATOR_START_PORT
        self._logs: List[LogEntry] = []

    def add_log(
        self,
        category: LogCategory,
        level: LogLevel,
        message: str,
        device_id: Optional[str] = None,
        serial: Optional[str] = None,
        suggested_fix: Optional[str] = None,
        command: Optional[str] = None,
    ):
        from datetime import datetime
        entry = LogEntry(
            id=f"log_{int(time.time() * 1000)}_{len(self._logs)}",
            category=category,
            level=level,
            message=message,
            timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3],
            device_id=device_id,
            serial=serial,
            suggested_fix=suggested_fix,
            command=command,
        )
        self._logs.append(entry)
        # Keep recent 2000 logs
        if len(self._logs) > 2000:
            self._logs = self._logs[-2000:]
        if level == LogLevel.ERROR:
            logger.error(f"[{category}] {message}")
        else:
            logger.info(f"[{category}] {message}")

    def get_logs(
        self,
        category: Optional[str] = None,
        device_id: Optional[str] = None,
        limit: int = 200,
    ) -> List[LogEntry]:
        filtered = self._logs
        if category and category != "all":
            filtered = [l for l in filtered if l.category.value == category]
        if device_id and device_id != "all":
            filtered = [l for l in filtered if l.device_id == device_id]
        return filtered[-limit:]

    def _allocate_port(self) -> int:
        """Finds an unused even port for an emulator instance."""
        used_ports = {inst.port for inst in self._instances.values()}
        port = settings.EMULATOR_START_PORT
        while port in used_ports:
            port += settings.EMULATOR_PORT_STEP
        return port

    async def start_device(self, device_id: str, wipe_data: bool = False) -> Tuple[bool, str]:
        """Starts a real Android Emulator instance."""
        device = avd_manager.get_device_by_id(device_id)
        if not device:
            return False, f"Device {device_id} not found"

        if device.status in [DeviceState.STARTING, DeviceState.BOOTING, DeviceState.READY]:
            return True, f"Device {device.name} is already running"

        emu_bin = settings.get_emulator_path()
        if not emu_bin or not emu_bin.exists():
            msg = "Android Emulator executable not found on host."
            fix = "Install the Android Emulator via SDK manager or check configuration path."
            self.add_log(LogCategory.EMULATOR, LogLevel.ERROR, msg, device_id=device.id, suggested_fix=fix)
            return False, f"{msg} Suggested fix: {fix}"

        port = self._allocate_port()
        serial = f"emulator-{port}"

        # Prepare log file
        log_file_path = settings.DATA_DIR / f"emulator_{device.avd_name}_{port}.log"
        log_out = open(log_file_path, "w", encoding="utf-8")

        # Build official emulator command
        cmd = [
            str(emu_bin),
            "-avd", device.avd_name,
            "-port", str(port),
            "-no-window",
            "-no-boot-anim",
            "-netdelay", "none",
            "-netspeed", "full",
            "-accel", "on",
            "-no-snapshot",
        ]

        if wipe_data:
            cmd.append("-wipe-data")

        # GPU mode: host uses macOS Metal / GPU hardware drivers for smooth video playback
        cmd.extend([
            "-gpu", "host",
            "-memory", "4096",
            "-cores", "4",
            "-prop", "dalvik.vm.heapsize=512m",
            "-prop", "dalvik.vm.heapgrowthlimit=256m",
            "-prop", "debug.sf.fps=60",
            "-prop", "persist.sys.sf.high_fps=1",
        ])

        # Build environment: explicitly set ANDROID_SDK_ROOT, ANDROID_HOME, JAVA_HOME
        # so the emulator binary can locate system-images, platform-tools, and JDK.
        sdk_path = settings.get_android_sdk_path()
        env = dict(os.environ)
        if sdk_path:
            env["ANDROID_SDK_ROOT"] = str(sdk_path)
            env["ANDROID_HOME"] = str(sdk_path)
        # Set JAVA_HOME if not already set
        if not env.get("JAVA_HOME"):
            java_candidates = [
                Path("/usr/local/opt/openjdk@17"),
                Path("/usr/local/opt/openjdk"),
                Path("/opt/homebrew/opt/openjdk@17"),
            ]
            for jc in java_candidates:
                if jc.exists():
                    env["JAVA_HOME"] = str(jc)
                    env["PATH"] = f"{jc}/bin:{env.get('PATH', '')}"
                    break
        # Ensure emulator's own directory is in PATH
        emu_dir = emu_bin.parent
        env["PATH"] = f"{emu_dir}:{env.get('PATH', '')}"

        self.add_log(
            LogCategory.EMULATOR,
            LogLevel.INFO,
            f"Launching emulator process for '{device.avd_name}' on port {port} ({serial}) [SDK: {sdk_path}]",
            device_id=device.id,
            serial=serial,
            command=" ".join(cmd),
        )

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=log_out,
                stderr=subprocess.STDOUT,
                env=env,
                preexec_fn=os.setsid if hasattr(os, "setsid") else None,
            )
        except Exception as e:
            log_out.close()
            err_msg = f"Failed to spawn emulator process: {e}"
            self.add_log(LogCategory.EMULATOR, LogLevel.ERROR, err_msg, device_id=device.id, serial=serial)
            return False, err_msg

        device.status = DeviceState.STARTING
        device.port = port
        device.serial = serial
        device.pid = proc.pid
        device.boot_progress = 10
        device.boot_status_text = "Starting QEMU process..."

        inst = EmulatorInstance(device, port)
        inst.process = proc
        inst.started_at = time.time()
        inst.log_file = log_file_path
        self._instances[device.id] = inst

        # Launch background boot monitor
        inst.boot_task = asyncio.create_task(self._monitor_boot(inst))

        return True, f"Device {device.name} started on port {port}"

    async def _monitor_boot(self, inst: EmulatorInstance):
        """Asynchronously tracks ADB detection, boot completion, and system readiness."""
        device = inst.device
        serial = inst.serial

        try:
            device.status = DeviceState.BOOTING
            device.boot_progress = 20
            device.boot_status_text = "Waiting for ADB connection..."
            self.add_log(LogCategory.ADB, LogLevel.INFO, f"Waiting for {serial} to connect to ADB...", device_id=device.id, serial=serial)

            # Wait up to 120s for ADB to see device
            connected = False
            for _ in range(120):
                if inst.process and inst.process.poll() is not None:
                    raise RuntimeError(f"Emulator process exited unexpectedly with code {inst.process.returncode}")
                
                devices = await adb_manager.get_connected_devices()
                matching = [d for d in devices if d["serial"] == serial]
                if matching and matching[0]["state"] in ["device", "offline"]:
                    connected = True
                    break
                await asyncio.sleep(1)

            if not connected:
                raise TimeoutError(f"ADB did not detect {serial} within 120 seconds")

            device.boot_progress = 45
            device.boot_status_text = "ADB connected. Waiting for Android OS boot completion..."
            self.add_log(LogCategory.ADB, LogLevel.INFO, f"ADB detected {serial}. Awaiting sys.boot_completed...", device_id=device.id, serial=serial)

            # Wait for sys.boot_completed == 1
            boot_completed = False
            for i in range(180):
                if inst.process and inst.process.poll() is not None:
                    raise RuntimeError(f"Emulator process died during boot (exit code {inst.process.returncode})")

                code, out, _ = await adb_manager.run_adb(["-s", serial, "shell", "getprop", "sys.boot_completed"])
                if code == 0 and out.strip() == "1":
                    boot_completed = True
                    break

                progress = 45 + int((i / 180.0) * 35)
                device.boot_progress = min(progress, 80)
                await asyncio.sleep(1)

            if not boot_completed:
                raise TimeoutError("Device sys.boot_completed timed out after 180 seconds")

            # Verify package manager alive
            device.boot_progress = 85
            device.boot_status_text = "Verifying Package Manager..."
            for _ in range(30):
                code, out, _ = await adb_manager.run_adb(["-s", serial, "shell", "pm", "path", "android"])
                if code == 0 and "package:" in out:
                    break
                await asyncio.sleep(1)

            # Check screen resolution
            w, h = await adb_manager.get_device_resolution(serial)
            device.width = w
            device.height = h

            # Verify screencap
            device.boot_progress = 95
            device.boot_status_text = "Verifying screen capture..."
            raw_screen = adb_manager.capture_screencap_raw(serial)
            if raw_screen:
                self.add_log(LogCategory.BACKEND, LogLevel.INFO, f"Initial screen capture verified ({len(raw_screen)} bytes)", device_id=device.id, serial=serial)

            device.status = DeviceState.READY
            device.boot_progress = 100
            device.boot_status_text = "Ready"
            self.add_log(LogCategory.EMULATOR, LogLevel.INFO, f"Device '{device.name}' ({serial}) is 100% READY!", device_id=device.id, serial=serial)

        except Exception as e:
            device.status = DeviceState.ERROR
            device.error_message = str(e)
            device.error_suggested_fix = "Check emulator log file for crash details, ensure CPU virtualization is enabled, and try starting again."
            device.boot_status_text = f"Error: {e}"
            self.add_log(
                LogCategory.EMULATOR,
                LogLevel.ERROR,
                f"Boot failed for {device.name}: {e}",
                device_id=device.id,
                serial=serial,
                suggested_fix=device.error_suggested_fix,
            )

    async def stop_device(self, device_id: str) -> Tuple[bool, str]:
        """Gracefully stops an emulator instance."""
        inst = self._instances.get(device_id)
        device = avd_manager.get_device_by_id(device_id)
        if not device:
            return False, f"Device {device_id} not found"

        device.status = DeviceState.SHUTTING_DOWN
        device.boot_status_text = "Shutting down..."
        self.add_log(LogCategory.EMULATOR, LogLevel.INFO, f"Shutting down device '{device.name}'...", device_id=device.id)

        # 1. Try adb emu kill
        if device.serial:
            await adb_manager.run_adb(["-s", device.serial, "emu", "kill"], timeout=5)

        # 2. Terminate process if still running
        if inst and inst.process and inst.process.poll() is None:
            try:
                inst.process.terminate()
                for _ in range(10):
                    if inst.process.poll() is not None:
                        break
                    await asyncio.sleep(0.5)
                if inst.process.poll() is None:
                    inst.process.kill()
            except Exception as e:
                logger.warning(f"Error terminating process: {e}")

        if inst and inst.boot_task and not inst.boot_task.done():
            inst.boot_task.cancel()

        device.status = DeviceState.STOPPED
        device.port = None
        device.serial = None
        device.pid = None
        device.boot_progress = 0
        device.boot_status_text = "Stopped"

        self._instances.pop(device_id, None)
        self.add_log(LogCategory.EMULATOR, LogLevel.INFO, f"Device '{device.name}' stopped successfully.", device_id=device.id)
        return True, f"Device {device.name} stopped"

    async def restart_device(self, device_id: str) -> Tuple[bool, str]:
        """Reboots device while completely preserving user data."""
        self.add_log(LogCategory.EMULATOR, LogLevel.INFO, f"Restarting device {device_id} (data preserved)...", device_id=device_id)
        await self.stop_device(device_id)
        await asyncio.sleep(2)
        return await self.start_device(device_id, wipe_data=False)

    async def factory_reset_and_start(self, device_id: str) -> Tuple[bool, str]:
        """Factory resets AVD data and boots fresh."""
        device = avd_manager.get_device_by_id(device_id)
        if not device:
            return False, "Device not found"

        await self.stop_device(device_id)
        await asyncio.sleep(2)
        avd_manager.factory_reset_avd(device.avd_name)
        return await self.start_device(device_id, wipe_data=True)

    def get_instance_by_id(self, device_id: str) -> Optional[EmulatorInstance]:
        return self._instances.get(device_id)

    def get_instance_by_serial(self, serial: str) -> Optional[EmulatorInstance]:
        for inst in self._instances.values():
            if inst.serial == serial:
                return inst
        return None


emulator_manager = EmulatorProcessManager()
