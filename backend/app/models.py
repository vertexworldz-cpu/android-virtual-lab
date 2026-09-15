"""
Data models and schemas for Android Virtual Lab.
"""
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class DeviceState(str, Enum):
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    BOOTING = "BOOTING"
    READY = "READY"
    ERROR = "ERROR"
    SHUTTING_DOWN = "SHUTTING_DOWN"


class LogCategory(str, Enum):
    EMULATOR = "emulator"
    ADB = "adb"
    NETWORK = "network"
    PLAY_STORE = "play_store"
    APK = "apk"
    WEBSOCKET = "websocket"
    BACKEND = "backend"


class LogLevel(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    DEBUG = "DEBUG"


class LogEntry(BaseModel):
    id: str
    category: LogCategory
    level: LogLevel
    message: str
    timestamp: str
    device_id: Optional[str] = None
    serial: Optional[str] = None
    suggested_fix: Optional[str] = None
    command: Optional[str] = None


class AndroidProfile(BaseModel):
    id: str
    name: str
    device_type: str  # "phone" or "tablet"
    width: int
    height: int
    dpi: int
    ram_mb: int = 2048
    cpu_cores: int = 2
    recommended_api: int = 34


class SystemImageInfo(BaseModel):
    tag: str  # "google_apis_playstore", "google_apis", "default"
    api_level: int
    android_version: str
    abi: str  # "x86_64", "arm64-v8a"
    has_play_store: bool
    path: Optional[str] = None
    installed: bool = False


class VirtualDevice(BaseModel):
    id: str
    name: str
    avd_name: str
    android_version: str
    api_level: int
    profile: str
    width: int
    height: int
    dpi: int
    ram_mb: int
    cpu_cores: int
    storage_mb: int
    has_play_store: bool
    status: DeviceState = DeviceState.STOPPED
    port: Optional[int] = None
    serial: Optional[str] = None
    pid: Optional[int] = None
    boot_progress: int = 0
    boot_status_text: str = "Stopped"
    created_at: str
    uptime_seconds: int = 0
    ip_address: Optional[str] = None
    error_message: Optional[str] = None
    error_suggested_fix: Optional[str] = None


class CreateDeviceRequest(BaseModel):
    name: str
    android_version: str = "Android 14"
    api_level: int = 34
    device_profile: str = "Pixel 8"
    width: int = 1080
    height: int = 2400
    dpi: int = 428
    ram_mb: int = 2048
    cpu_cores: int = 2
    storage_mb: int = 8192
    orientation: str = "portrait"
    camera_back: str = "virtualscene"
    camera_front: str = "emulated"
    mic: bool = True
    gps: bool = True
    network_latency: str = "none"
    network_speed: str = "full"


class TouchEvent(BaseModel):
    type: str  # "down", "move", "up"
    x: float  # normalized 0.0 - 1.0 or pixel
    y: float  # normalized 0.0 - 1.0 or pixel
    duration_ms: Optional[int] = None


class SwipeEvent(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    duration_ms: int = 300


class KeyEvent(BaseModel):
    keycode: int
    char: Optional[str] = None
    text: Optional[str] = None


class GPSLocation(BaseModel):
    latitude: float
    longitude: float
    altitude: Optional[float] = 0.0


class InstalledPackage(BaseModel):
    package_name: str
    app_name: Optional[str] = None
    version_name: Optional[str] = None
    version_code: Optional[int] = None
    is_system: bool = False
    is_play_store: bool = False
    is_chrome: bool = False
    apk_path: Optional[str] = None


class DeviceFile(BaseModel):
    name: str
    path: str
    size: int
    is_directory: bool
    modified: str


class GPUMetric(BaseModel):
    model: str
    type: str  # "Built-In", "PCIe", "Discrete", "Integrated"
    vram: str
    vendor: Optional[str] = None
    metal_support: Optional[str] = None


class ProcessTelemetry(BaseModel):
    pid: int
    cpu_percent: float
    memory_rss_mb: float
    memory_vms_mb: float
    num_threads: int
    status: str


class HostMetrics(BaseModel):
    os_name: str
    os_version: str
    cpu_brand: str
    cpu_count: int  # Logical cores
    cpu_physical_cores: int = 1  # Physical cores
    cpu_percent: float
    ram_total_gb: float
    ram_used_gb: float
    ram_available_gb: float = 0.0
    ram_percent: float
    disk_total_gb: float
    disk_used_gb: float
    disk_percent: float
    hypervisor_available: bool
    hypervisor_type: str
    gpus: List[GPUMetric] = []
    android_sdk_path: Optional[str] = None
    emulator_version: Optional[str] = None
    adb_version: Optional[str] = None


class PerformanceSnapshot(BaseModel):
    timestamp: str
    host: HostMetrics
    emulator_process: Optional[ProcessTelemetry] = None
    active_device_serial: Optional[str] = None
    bottleneck_analysis: Dict[str, Any] = {}


class SetupWizardStep(BaseModel):
    step_number: int
    title: str
    description: str
    status: str  # "passed", "warning", "failed", "pending"
    detail: str
    recommended_action: Optional[str] = None
    command_hint: Optional[str] = None


class SetupWizardReport(BaseModel):
    completed: bool
    all_passed: bool
    steps: List[SetupWizardStep]


class DiagnosticTestResult(BaseModel):
    test_id: str
    name: str
    category: str
    passed: bool
    duration_ms: int
    details: str
    suggested_fix: Optional[str] = None


class DiagnosticsReport(BaseModel):
    timestamp: str
    passed_count: int
    failed_count: int
    warning_count: int
    total_count: int
    results: List[DiagnosticTestResult]
