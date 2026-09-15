export type DeviceState = 'STOPPED' | 'STARTING' | 'BOOTING' | 'READY' | 'ERROR' | 'SHUTTING_DOWN';

export interface VirtualDevice {
  id: string;
  name: string;
  avd_name: string;
  android_version: string;
  api_level: number;
  profile: string;
  width: number;
  height: number;
  dpi: number;
  ram_mb: number;
  cpu_cores: number;
  storage_mb: number;
  has_play_store: boolean;
  status: DeviceState;
  port?: number;
  serial?: string;
  pid?: number;
  boot_progress: number;
  boot_status_text: string;
  created_at: string;
  uptime_seconds: number;
  ip_address?: string;
  error_message?: string;
  error_suggested_fix?: string;
}

export interface AndroidProfile {
  id: string;
  name: string;
  device_type: string;
  width: number;
  height: number;
  dpi: number;
  ram_mb: number;
  cpu_cores: number;
  recommended_api: number;
}

export interface CreateDeviceRequest {
  name: string;
  android_version: string;
  api_level: number;
  device_profile: string;
  width: number;
  height: number;
  dpi: number;
  ram_mb: number;
  cpu_cores: number;
  storage_mb: number;
  orientation: string;
  camera_back: string;
  camera_front: string;
  mic: boolean;
  gps: boolean;
  network_latency: string;
  network_speed: string;
}

export interface GPUMetric {
  model: string;
  type: string;
  vram: string;
  vendor?: string;
  metal_support?: string;
}

export interface ProcessTelemetry {
  pid: number;
  cpu_percent: number;
  memory_rss_mb: number;
  memory_vms_mb: number;
  num_threads: number;
  status: string;
}

export interface HostMetrics {
  os_name: string;
  os_version: string;
  cpu_brand: string;
  cpu_count: number;
  cpu_physical_cores: number;
  cpu_percent: number;
  ram_total_gb: number;
  ram_used_gb: number;
  ram_available_gb: number;
  ram_percent: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_percent: number;
  hypervisor_available: boolean;
  hypervisor_type: string;
  gpus: GPUMetric[];
  android_sdk_path?: string;
  emulator_version?: string;
  adb_version?: string;
}

export interface PerformanceSnapshot {
  timestamp: string;
  host: HostMetrics;
  emulator_process?: ProcessTelemetry;
  active_device_serial?: string;
  bottleneck_analysis: Record<string, any>;
}


export interface SetupWizardStep {
  step_number: number;
  title: string;
  description: string;
  status: 'passed' | 'warning' | 'failed' | 'pending';
  detail: string;
  recommended_action?: string;
  command_hint?: string;
}

export interface SetupWizardReport {
  completed: boolean;
  all_passed: boolean;
  steps: SetupWizardStep[];
}

export interface LogEntry {
  id: string;
  category: 'emulator' | 'adb' | 'network' | 'play_store' | 'apk' | 'websocket' | 'backend';
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
  message: string;
  timestamp: string;
  device_id?: string;
  serial?: string;
  suggested_fix?: string;
  command?: string;
}

export interface InstalledPackage {
  package_name: string;
  app_name?: string;
  version_name?: string;
  version_code?: number;
  is_system: boolean;
  is_play_store: boolean;
  is_chrome: boolean;
  apk_path?: string;
}

export interface DeviceFile {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  modified: string;
}

export interface DiagnosticTestResult {
  test_id: string;
  name: string;
  category: string;
  passed: boolean;
  duration_ms: number;
  details: string;
  suggested_fix?: string;
}

export interface DiagnosticsReport {
  timestamp: string;
  passed_count: number;
  failed_count: number;
  warning_count: number;
  total_count: number;
  results: DiagnosticTestResult[];
}

export interface NetworkDiagnostics {
  dns: { passed: boolean; latency_ms: number; details: string };
  http: { passed: boolean; latency_ms: number; details: string };
  https: { passed: boolean; latency_ms: number; details: string };
  google_play: { passed: boolean; latency_ms: number; details: string };
  chrome: { passed: boolean; latency_ms: number; details: string };
  adb: { passed: boolean; latency_ms: number; details: string };
}
