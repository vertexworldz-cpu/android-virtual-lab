"""
Admin Service and System Telemetry for Android Virtual Lab.
Provides real-time host metrics, audit logging, and configuration overrides.
"""
import time
from typing import Dict, List, Any
from app.config import settings
from app.models import HostMetrics
from app.system_discovery import discovery
from app.avd_manager import avd_manager
from app.emulator_manager import emulator_manager


class AdminService:
    """Manages system metrics, configuration, and audit logs."""

    def __init__(self):
        self._audit_logs: List[Dict[str, Any]] = []

    def record_audit(self, action: str, details: str, user: str = "admin"):
        from datetime import datetime
        self._audit_logs.append({
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "user": user,
            "action": action,
            "details": details,
        })
        if len(self._audit_logs) > 500:
            self._audit_logs = self._audit_logs[-500:]

    def get_audit_logs(self) -> List[Dict[str, Any]]:
        return list(reversed(self._audit_logs[-100:]))

    def get_system_summary(self) -> Dict[str, Any]:
        metrics = discovery.get_host_metrics()
        devices = avd_manager.list_all_devices()

        running = sum(1 for d in devices if d.status.value in ["STARTING", "BOOTING", "READY"])
        stopped = sum(1 for d in devices if d.status.value == "STOPPED")
        errors = sum(1 for d in devices if d.status.value == "ERROR")

        return {
            "metrics": metrics.model_dump(),
            "devices_summary": {
                "total": len(devices),
                "running": running,
                "stopped": stopped,
                "error": errors,
            },
            "config": {
                "android_sdk_path": str(settings.get_android_sdk_path() or "Not Set"),
                "emulator_path": str(settings.get_emulator_path() or "Not Found"),
                "adb_path": str(settings.get_adb_path() or "Not Found"),
                "max_concurrent_emulators": settings.MAX_CONCURRENT_EMULATORS,
                "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
                "data_storage_path": str(settings.DATA_DIR),
                "avd_storage_path": str(settings.get_avd_home()),
                "no_session_limits": True,
            },
        }

    def update_config(self, max_concurrent: int, max_upload_mb: int) -> Dict[str, Any]:
        settings.MAX_CONCURRENT_EMULATORS = max_concurrent
        settings.MAX_UPLOAD_SIZE_MB = max_upload_mb
        self.record_audit("UPDATE_CONFIG", f"Max concurrent: {max_concurrent}, Max upload: {max_upload_mb}MB")
        return {"status": "success", "max_concurrent": max_concurrent, "max_upload_mb": max_upload_mb}


admin_service = AdminService()
