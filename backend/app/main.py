"""
Android Virtual Lab - Backend Application
FastAPI Server providing REST API and WebSockets for real Android Emulator management.
"""
import os
import shutil
import logging
import asyncio
from typing import Dict, List, Optional, Any
from pathlib import Path

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    Form,
    Query,
    HTTPException,
    status,
    BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.models import (
    CreateDeviceRequest,
    GPSLocation,
    LogCategory,
    LogLevel,
)
from app.system_discovery import discovery, STANDARD_PROFILES, API_LEVEL_TO_VERSION
from app.adb_manager import adb_manager
from app.avd_manager import avd_manager
from app.emulator_manager import emulator_manager
from app.screen_streamer import screen_streamer
from app.apk_manager import apk_manager
from app.file_manager import file_manager
from app.diagnostics import diagnostics_service
from app.admin import admin_service
from app.security import sanitize_filename, validate_file_path

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("avl.server")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-grade real Android Virtual Device (AVD) testing platform.",
    lifespan=None,
)


async def _recover_running_emulators():
    """On startup, detect any emulators already running in ADB and restore their state."""
    try:
        devices = await adb_manager.get_connected_devices()
        for adb_dev in devices:
            serial = adb_dev["serial"]
            if not serial.startswith("emulator-"):
                continue
            try:
                port = int(serial.split("-")[1])
            except Exception:
                continue

            # Check if it's actually booted
            code, out, _ = await adb_manager.run_adb(["-s", serial, "shell", "getprop", "sys.boot_completed"], timeout=5)
            is_ready = (code == 0 and out.strip() == "1")

            # Get AVD name directly from emulator property (no telnet needed)
            avd_name = None
            code2, avd_out, _ = await adb_manager.run_adb(["-s", serial, "shell", "getprop", "ro.boot.qemu.avd_name"], timeout=5)
            if code2 == 0 and avd_out.strip():
                avd_name = avd_out.strip()

            # Match to a known device by AVD name
            all_devs = avd_manager.list_all_devices()
            matched = None
            for d in all_devs:
                if avd_name and d.avd_name == avd_name:
                    matched = d
                    break
                # Fallback: match by port if no AVD name found
                if not avd_name and d.port == port:
                    matched = d
                    break

            if matched:
                # Re-adopt the running emulator
                from app.models import DeviceState
                matched.status = DeviceState.READY if is_ready else DeviceState.BOOTING
                matched.port = port
                matched.serial = serial

                # Get resolution
                w, h = await adb_manager.get_device_resolution(serial)
                matched.width = w
                matched.height = h

                # Register instance in emulator_manager
                from app.emulator_manager import EmulatorInstance
                inst = EmulatorInstance(matched, port)
                inst.started_at = 0.0  # unknown start time
                emulator_manager._instances[matched.id] = inst

                emulator_manager.add_log(
                    LogCategory.EMULATOR, LogLevel.INFO,
                    f"Recovered running emulator {serial} \u2192 '{matched.name}' ({matched.status.value})",
                    device_id=matched.id,
                    serial=serial,
                )
                logger.info(f"[RECOVERY] Adopted existing emulator {serial} for device '{matched.name}'")
            else:
                logger.warning(f"[RECOVERY] Running emulator {serial} (avd={avd_name}) has no matching device in AVD list")
    except Exception as e:
        logger.warning(f"[RECOVERY] Failed to recover running emulators: {e}")


@app.on_event("startup")
async def on_startup():
    logger.info("Android Virtual Lab backend starting up...")
    # Pre-populate device cache
    avd_manager.list_all_devices()
    # Recover any already-running emulators
    await _recover_running_emulators()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# 1. System Discovery & Setup Wizard Routes
# ==========================================

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "no_session_limits": True,
    }


@app.get("/api/system/metrics")
async def get_system_metrics():
    return discovery.get_host_metrics()


@app.get("/api/system/wizard")
async def get_setup_wizard():
    return discovery.run_setup_wizard()


@app.get("/api/system/profiles")
async def get_standard_profiles():
    return STANDARD_PROFILES


@app.get("/api/system/images")
async def get_system_images():
    installed = discovery.get_installed_system_images()
    # List supported Android versions from 10 to 16
    versions = []
    for api, ver_name in API_LEVEL_TO_VERSION.items():
        if api >= 29:  # Android 10+
            # Check if matching installed image exists
            is_installed = any(img.api_level == api for img in installed)
            has_play = any(img.api_level == api and img.has_play_store for img in installed)
            versions.append({
                "api_level": api,
                "name": ver_name,
                "is_installed": is_installed,
                "google_play_supported": True,  # Officially supported tag exists
                "google_play_installed": has_play,
            })
    return {
        "installed_images": installed,
        "supported_versions": versions,
    }


# ==========================================
# 2. Virtual Device Management Routes
# ==========================================

@app.get("/api/devices")
async def list_devices():
    return avd_manager.list_all_devices()


@app.get("/api/devices/{device_id}")
async def get_device(device_id: str):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    return dev


@app.post("/api/devices")
async def create_device(req: CreateDeviceRequest):
    success, msg, new_dev = avd_manager.create_avd(req)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    admin_service.record_audit("CREATE_AVD", f"Created AVD {req.name} ({req.device_profile})")
    return new_dev


@app.delete("/api/devices/{device_id}")
async def delete_device(device_id: str):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")

    # Stop first if running
    if dev.status.value in ["STARTING", "BOOTING", "READY"]:
        await emulator_manager.stop_device(device_id)

    success, msg = avd_manager.delete_avd(dev.avd_name)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    admin_service.record_audit("DELETE_AVD", f"Deleted AVD {dev.avd_name}")
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/start")
async def start_device(device_id: str):
    success, msg = await emulator_manager.start_device(device_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/stop")
async def stop_device(device_id: str):
    success, msg = await emulator_manager.stop_device(device_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/restart")
async def restart_device(device_id: str):
    success, msg = await emulator_manager.restart_device(device_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/reconnect")
async def reconnect_device(device_id: str):
    """Reconnects backend state to an already-running emulator (e.g. after server restart)."""
    dev = avd_manager.get_device_by_id(device_id)
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")

    # Scan ADB for running emulators
    adb_devices = await adb_manager.get_connected_devices()
    from app.models import DeviceState
    from app.emulator_manager import EmulatorInstance

    for adb_dev in adb_devices:
        serial = adb_dev["serial"]
        if not serial.startswith("emulator-"):
            continue
        try:
            port = int(serial.split("-")[1])
        except Exception:
            continue

        # Check if device is responsive
        code, out, _ = await adb_manager.run_adb(["-s", serial, "shell", "getprop", "sys.boot_completed"], timeout=8)
        is_ready = (code == 0 and out.strip() == "1")

        # Adopt first matching running emulator for this device
        dev.status = DeviceState.READY if is_ready else DeviceState.BOOTING
        dev.port = port
        dev.serial = serial

        # Update resolution
        w, h = await adb_manager.get_device_resolution(serial)
        dev.width = w
        dev.height = h

        # Register instance
        inst = EmulatorInstance(dev, port)
        inst.started_at = 0.0
        emulator_manager._instances[dev.id] = inst

        emulator_manager.add_log(
            LogCategory.EMULATOR, LogLevel.INFO,
            f"Manually reconnected '{dev.name}' to {serial} (status: {dev.status.value})",
            device_id=dev.id, serial=serial,
        )
        return {"status": "success", "message": f"Reconnected to {serial}", "serial": serial, "device_status": dev.status.value}

    raise HTTPException(status_code=404, detail="No running emulator found to reconnect to")


@app.post("/api/devices/{device_id}/factory-reset")
async def factory_reset_device(device_id: str):
    success, msg = await emulator_manager.factory_reset_and_start(device_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    admin_service.record_audit("FACTORY_RESET", f"Factory reset AVD {device_id}")
    return {"status": "success", "message": msg}


# ==========================================
# 3. Interactive Device Actions & Apps
# ==========================================

@app.get("/api/devices/{device_id}/packages")
async def list_packages(device_id: str, user_only: bool = Query(False)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    pkgs = await adb_manager.list_installed_packages(dev.serial, user_only=user_only)
    return pkgs


@app.post("/api/devices/{device_id}/launch-package")
async def launch_package(device_id: str, package_name: str = Form(...)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    success, msg = await adb_manager.launch_package(dev.serial, package_name)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/uninstall-package")
async def uninstall_package(device_id: str, package_name: str = Form(...)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    success, msg = await adb_manager.uninstall_package(dev.serial, package_name)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/play-store")
async def launch_play_store(device_id: str, app_id: Optional[str] = Form(None)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    success, msg = await adb_manager.open_play_store(dev.serial, target_package=app_id)
    return {"status": "success" if success else "warning", "message": msg}


@app.post("/api/devices/{device_id}/chrome")
async def launch_chrome(device_id: str, url: Optional[str] = Form(None)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    success, msg = await adb_manager.open_chrome(dev.serial, url=url)
    return {"status": "success" if success else "warning", "message": msg}


@app.post("/api/devices/{device_id}/downloads")
async def launch_downloads(device_id: str):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    success, msg = await adb_manager.open_downloads_folder(dev.serial)
    return {"status": "success" if success else "warning", "message": msg}


# ==========================================
# 4. APK Upload & Installation
# ==========================================

@app.post("/api/devices/{device_id}/install-apk")
async def install_apk(
    device_id: str,
    file: UploadFile = File(...),
    reinstall: bool = Form(True),
):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")

    content = await file.read()
    saved, msg, apk_path = apk_manager.save_uploaded_apk(file.filename or "app.apk", content)
    if not saved or not apk_path:
        raise HTTPException(status_code=400, detail=msg)

    # Perform real ADB install
    success, install_msg = await apk_manager.install_to_device(device_id, apk_path, reinstall=reinstall)
    if not success:
        raise HTTPException(status_code=500, detail=install_msg)

    return {
        "status": "success",
        "message": install_msg,
        "filename": apk_path.name,
    }


# ==========================================
# 5. Device File Transfer
# ==========================================

@app.get("/api/devices/{device_id}/files")
async def list_device_files(device_id: str, path: str = Query("/sdcard/Download")):
    files = await file_manager.list_files(device_id, path=path)
    return files


@app.post("/api/devices/{device_id}/upload-file")
async def upload_file_to_device(
    device_id: str,
    file: UploadFile = File(...),
    destination: str = Form("/sdcard/Download/"),
):
    content = await file.read()
    success, msg = await file_manager.upload_file_to_device(
        device_id=device_id,
        filename=file.filename or "uploaded_file",
        content=content,
        remote_dest=destination,
    )
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.get("/api/devices/{device_id}/download-file")
async def download_file_from_device(device_id: str, remote_path: str = Query(...)):
    success, msg, local_path = await file_manager.download_file_from_device(device_id, remote_path)
    if not success or not local_path or not local_path.exists():
        raise HTTPException(status_code=404, detail=msg)
    return FileResponse(path=str(local_path), filename=local_path.name)


# ==========================================
# 6. Device Controls, GPS, Screenshot, Shell
# ==========================================

@app.post("/api/devices/{device_id}/gps")
async def set_device_gps(device_id: str, loc: GPSLocation):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    success, msg = await adb_manager.set_gps_location(dev.serial, loc.latitude, loc.longitude, loc.altitude or 0.0)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"status": "success", "message": msg}


@app.post("/api/devices/{device_id}/button")
async def send_device_button(device_id: str, action: str = Form(...)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")

    # Map button actions
    btn_map = {
        "home": 3,
        "back": 4,
        "recent": 187,
        "power": 26,
        "vol_up": 24,
        "vol_down": 25,
        "enter": 66,
        "backspace": 67,
        "tab": 61,
        "space": 62,
        "escape": 111,
        "menu": 82,
    }
    if action in btn_map:
        await adb_manager.send_key(dev.serial, btn_map[action])
        return {"status": "success", "action": action}
    elif action == "rotate":
        await adb_manager.run_adb(["-s", dev.serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0"])
        await adb_manager.run_adb(["-s", dev.serial, "shell", "settings", "put", "system", "user_rotation", "1"])
        return {"status": "success", "action": "rotate"}
    raise HTTPException(status_code=400, detail="Unknown button action")


@app.post("/api/devices/{device_id}/text")
async def send_device_text(device_id: str, text: str = Form(...)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    ok = await adb_manager.send_text(dev.serial, text)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to send text input")
    return {"status": "success", "text": text}


@app.post("/api/devices/{device_id}/screenshot")
async def capture_device_screenshot(device_id: str):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    file_path = await adb_manager.take_screenshot_file(dev.serial)
    if not file_path:
        raise HTTPException(status_code=500, detail="Failed to capture screenshot")
    fn = os.path.basename(file_path)
    return {"status": "success", "filename": fn, "url": f"/api/screenshots/{fn}"}


@app.get("/api/screenshots/{filename}")
async def get_screenshot_file(filename: str):
    safe_fn = sanitize_filename(filename)
    path = settings.SCREENSHOTS_DIR / safe_fn
    if not path.exists():
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(path=str(path), media_type="image/png")


@app.post("/api/devices/{device_id}/shell")
async def run_device_shell(device_id: str, command: str = Form(...)):
    dev = avd_manager.get_device_by_id(device_id)
    if not dev or not dev.serial:
        raise HTTPException(status_code=400, detail="Device is not active")
    code, output = await adb_manager.execute_shell(dev.serial, command)
    return {
        "exit_code": code,
        "output": output,
        "serial": dev.serial,
        "device_model": dev.profile,
        "android_version": dev.android_version,
    }


# ==========================================
# 7. Diagnostics, Logs, & Admin
# ==========================================

@app.get("/api/logs")
async def get_logs(category: Optional[str] = Query(None), device_id: Optional[str] = Query(None)):
    return emulator_manager.get_logs(category=category, device_id=device_id)


@app.get("/api/diagnostics/network")
async def get_network_diagnostics():
    return await diagnostics_service.get_network_diagnostics()


@app.get("/api/diagnostics/performance")
async def get_performance_diagnostics(device_id: Optional[str] = Query(None)):
    """Provides real-time host hardware (CPU, Cores, RAM, Available RAM, GPUs) & bottleneck telemetry."""
    return await diagnostics_service.get_performance_snapshot(device_id=device_id)


@app.post("/api/diagnostics/run-suite")
async def run_diagnostics_suite():
    return await diagnostics_service.run_full_diagnostics_suite()


@app.get("/api/admin/summary")
async def get_admin_summary():
    return admin_service.get_system_summary()


@app.post("/api/admin/config")
async def update_admin_config(max_concurrent: int = Form(...), max_upload_mb: int = Form(...)):
    return admin_service.update_config(max_concurrent, max_upload_mb)


@app.get("/api/admin/audit")
async def get_admin_audit():
    return admin_service.get_audit_logs()


# ==========================================
# 8. Real-time Screen Streaming WebSocket
# ==========================================

@app.websocket("/ws/devices/{device_id}/screen")
async def device_screen_websocket(websocket: WebSocket, device_id: str):
    await screen_streamer.connect(websocket, device_id)
    try:
        while True:
            data = await websocket.receive_text()
            await screen_streamer.handle_client_message(websocket, device_id, data)
    except WebSocketDisconnect:
        screen_streamer.disconnect(websocket, device_id)
    except Exception as e:
        logger.debug(f"WebSocket closed: {e}")
        screen_streamer.disconnect(websocket, device_id)


# ==========================================
# 9. Serve Frontend SPA Web App
# ==========================================

if settings.FRONTEND_DIST_DIR.exists():
    assets_dir = settings.FRONTEND_DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API or WebSocket calls
        if full_path.startswith("api") or full_path.startswith("ws"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        file_path = settings.FRONTEND_DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        index_html = settings.FRONTEND_DIST_DIR / "index.html"
        if index_html.exists():
            return FileResponse(index_html)
        raise HTTPException(status_code=404, detail="Frontend index.html not found")

