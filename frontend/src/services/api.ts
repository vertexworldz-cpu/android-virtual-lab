import {
  VirtualDevice,
  CreateDeviceRequest,
  AndroidProfile,
  HostMetrics,
  SetupWizardReport,
  LogEntry,
  InstalledPackage,
  DeviceFile,
  DiagnosticsReport,
  NetworkDiagnostics,
  PerformanceSnapshot,
} from '../types';

const BASE_URL = '/api';

export const api = {
  // Health
  getHealth: async () => {
    const res = await fetch(`${BASE_URL}/health`);
    return res.json();
  },

  // System & Wizard
  getMetrics: async (): Promise<HostMetrics> => {
    const res = await fetch(`${BASE_URL}/system/metrics`);
    return res.json();
  },

  getWizard: async (): Promise<SetupWizardReport> => {
    const res = await fetch(`${BASE_URL}/system/wizard`);
    return res.json();
  },

  getProfiles: async (): Promise<AndroidProfile[]> => {
    const res = await fetch(`${BASE_URL}/system/profiles`);
    return res.json();
  },

  getSystemImages: async () => {
    const res = await fetch(`${BASE_URL}/system/images`);
    return res.json();
  },

  // Devices
  getDevices: async (): Promise<VirtualDevice[]> => {
    const res = await fetch(`${BASE_URL}/devices`);
    return res.json();
  },

  getDevice: async (id: string): Promise<VirtualDevice> => {
    const res = await fetch(`${BASE_URL}/devices/${id}`);
    if (!res.ok) throw new Error('Device not found');
    return res.json();
  },

  createDevice: async (data: CreateDeviceRequest): Promise<VirtualDevice> => {
    const res = await fetch(`${BASE_URL}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create device');
    }
    return res.json();
  },

  deleteDevice: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to delete device');
    }
    return res.json();
  },

  startDevice: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/start`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to start device');
    }
    return res.json();
  },

  stopDevice: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/stop`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to stop device');
    }
    return res.json();
  },

  restartDevice: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/restart`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to restart device');
    }
    return res.json();
  },

  factoryResetDevice: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/factory-reset`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to factory reset device');
    }
    return res.json();
  },

  reconnectDevice: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/reconnect`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'No running emulator found to reconnect to');
    }
    return res.json();
  },

  // Interactive controls & Quick Launch
  sendButton: async (id: string, action: string) => {
    const form = new FormData();
    form.append('action', action);
    const res = await fetch(`${BASE_URL}/devices/${id}/button`, { method: 'POST', body: form });
    return res.json();
  },

  sendText: async (id: string, text: string) => {
    const form = new FormData();
    form.append('text', text);
    const res = await fetch(`${BASE_URL}/devices/${id}/text`, { method: 'POST', body: form });
    return res.json();
  },

  launchPlayStore: async (id: string, appId?: string) => {
    const form = new FormData();
    if (appId) form.append('app_id', appId);
    const res = await fetch(`${BASE_URL}/devices/${id}/play-store`, { method: 'POST', body: form });
    return res.json();
  },

  launchChrome: async (id: string, url?: string) => {
    const form = new FormData();
    if (url) form.append('url', url);
    const res = await fetch(`${BASE_URL}/devices/${id}/chrome`, { method: 'POST', body: form });
    return res.json();
  },

  launchDownloads: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/downloads`, { method: 'POST' });
    return res.json();
  },

  setGPS: async (id: string, lat: number, lng: number) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/gps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
    return res.json();
  },

  takeScreenshot: async (id: string) => {
    const res = await fetch(`${BASE_URL}/devices/${id}/screenshot`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to take screenshot');
    return res.json();
  },

  runShell: async (id: string, command: string) => {
    const form = new FormData();
    form.append('command', command);
    const res = await fetch(`${BASE_URL}/devices/${id}/shell`, { method: 'POST', body: form });
    return res.json();
  },

  // Packages & APKs
  getPackages: async (id: string, userOnly: boolean = false): Promise<InstalledPackage[]> => {
    const res = await fetch(`${BASE_URL}/devices/${id}/packages?user_only=${userOnly}`);
    return res.json();
  },

  launchPackage: async (id: string, packageName: string) => {
    const form = new FormData();
    form.append('package_name', packageName);
    const res = await fetch(`${BASE_URL}/devices/${id}/launch-package`, { method: 'POST', body: form });
    return res.json();
  },

  uninstallPackage: async (id: string, packageName: string) => {
    const form = new FormData();
    form.append('package_name', packageName);
    const res = await fetch(`${BASE_URL}/devices/${id}/uninstall-package`, { method: 'POST', body: form });
    return res.json();
  },

  installAPK: async (id: string, file: File, reinstall: boolean = true) => {
    const form = new FormData();
    form.append('file', file);
    form.append('reinstall', reinstall.toString());
    const res = await fetch(`${BASE_URL}/devices/${id}/install-apk`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Installation failed');
    }
    return res.json();
  },

  // Files
  getFiles: async (id: string, path: string = '/sdcard/Download'): Promise<DeviceFile[]> => {
    const res = await fetch(`${BASE_URL}/devices/${id}/files?path=${encodeURIComponent(path)}`);
    return res.json();
  },

  uploadFile: async (id: string, file: File, destination: string = '/sdcard/Download/') => {
    const form = new FormData();
    form.append('file', file);
    form.append('destination', destination);
    const res = await fetch(`${BASE_URL}/devices/${id}/upload-file`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  // Logs & Diagnostics
  getLogs: async (category?: string, deviceId?: string): Promise<LogEntry[]> => {
    let url = `${BASE_URL}/logs`;
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (deviceId) params.append('device_id', deviceId);
    if (params.toString()) url += `?${params.toString()}`;
    const res = await fetch(url);
    return res.json();
  },

  getNetworkDiagnostics: async (): Promise<NetworkDiagnostics> => {
    const res = await fetch(`${BASE_URL}/diagnostics/network`);
    return res.json();
  },

  getPerformanceDiagnostics: async (deviceId?: string): Promise<PerformanceSnapshot> => {
    let url = `${BASE_URL}/diagnostics/performance`;
    if (deviceId) url += `?device_id=${encodeURIComponent(deviceId)}`;
    const res = await fetch(url);
    return res.json();
  },

  runDiagnosticsSuite: async (): Promise<DiagnosticsReport> => {
    const res = await fetch(`${BASE_URL}/diagnostics/run-suite`, { method: 'POST' });
    return res.json();
  },

  // Admin
  getAdminSummary: async () => {
    const res = await fetch(`${BASE_URL}/admin/summary`);
    return res.json();
  },

  updateAdminConfig: async (maxConcurrent: number, maxUploadMb: number) => {
    const form = new FormData();
    form.append('max_concurrent', maxConcurrent.toString());
    form.append('max_upload_mb', maxUploadMb.toString());
    const res = await fetch(`${BASE_URL}/admin/config`, { method: 'POST', body: form });
    return res.json();
  },

  getAuditLogs: async () => {
    const res = await fetch(`${BASE_URL}/admin/audit`);
    return res.json();
  },
};
