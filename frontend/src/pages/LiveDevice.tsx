import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Play,
  Square,
  RefreshCw,
  ShoppingBag,
  Globe,
  UploadCloud,
  FolderDown,
  Terminal,
  FileText,
  Activity,
  AlertCircle,
  Loader2,
  Link,
} from 'lucide-react';
import { VirtualDevice, InstalledPackage } from '../types';
import { api } from '../services/api';
import { DeviceCanvas } from '../components/DeviceScreen/DeviceCanvas';
import { DeviceToolbar } from '../components/DeviceScreen/DeviceToolbar';
import { PlayStorePanel } from '../components/QuickLaunch/PlayStorePanel';
import { ChromePanel } from '../components/QuickLaunch/ChromePanel';
import { APKUploader } from '../components/APKManager/APKUploader';
import { DeviceFiles } from '../components/FileManager/DeviceFiles';
import { ADBTerminal } from '../components/Terminal/ADBTerminal';
import { LiveLogs } from '../components/Logs/LiveLogs';

interface LiveDeviceProps {
  device: VirtualDevice | null;
  devices: VirtualDevice[];
  onSelectDevice: (device: VirtualDevice) => void;
  onRefreshDevice: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigate: (tab: string) => void;
}

export const LiveDevice: React.FC<LiveDeviceProps> = ({
  device,
  devices,
  onSelectDevice,
  onRefreshDevice,
  onToast,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'play' | 'chrome' | 'apk' | 'files' | 'terminal' | 'logs'>('play');
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const fetchPackages = async () => {
    if (!device || device.status !== 'READY') return;
    try {
      setLoadingPackages(true);
      const res = await api.getPackages(device.id, false);
      setPackages(res);
    } catch (e) {
      console.warn('Error fetching packages', e);
    } finally {
      setLoadingPackages(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, [device?.id, device?.status]);

  if (!device) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <Smartphone size={48} color="#64748b" style={{ margin: '0 auto 1rem' }} />
        <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>No Device Selected</h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Select an Android Virtual Device from your fleet to view its live screen.
        </p>
        <button onClick={() => onNavigate('devices')} className="btn btn-primary">
          Select From Fleet
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'play', label: 'Play Store', icon: ShoppingBag, color: '#3DDC84' },
    { id: 'chrome', label: 'Chrome & Downloads', icon: Globe, color: '#00E5FF' },
    { id: 'apk', label: 'Install APK', icon: UploadCloud, color: '#FFB300' },
    { id: 'files', label: 'Files', icon: FolderDown, color: '#8A2BE2' },
    { id: 'terminal', label: 'ADB Terminal', icon: Terminal, color: '#38bdf8' },
    { id: 'logs', label: 'Live Logs', icon: FileText, color: '#f43f5e' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Device Bar */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Device Selector Dropdown */}
          <select
            className="form-select"
            style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 600 }}
            value={device.id}
            onChange={(e) => {
              const selected = devices.find((d) => d.id === e.target.value);
              if (selected) onSelectDevice(selected);
            }}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.status})
              </option>
            ))}
          </select>

          <span className={`badge badge-${device.status.toLowerCase()}`}>
            {device.status}
          </span>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {device.android_version} • {device.profile} • {device.ram_mb}MB RAM
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {device.status === 'STOPPED' && (
            <button
              onClick={() => api.startDevice(device.id).then(() => onRefreshDevice())}
              className="btn btn-primary btn-sm"
            >
              <Play size={14} /> Start Emulator
            </button>
          )}

          {device.status === 'STOPPED' && (
            <button
              onClick={async () => {
                try {
                  const result = await api.reconnectDevice(device.id);
                  onToast(`✅ Reconnected to ${result.serial}`, 'success');
                  onRefreshDevice();
                } catch (e: any) {
                  onToast(`Reconnect failed: ${e.message}`, 'error');
                }
              }}
              className="btn btn-secondary btn-sm"
              title="Reconnect to a running emulator process"
              style={{ borderColor: '#3DDC84', color: '#3DDC84' }}
            >
              <Link size={14} /> Reconnect
            </button>
          )}

          {device.status === 'READY' && (
            <button
              onClick={() => api.stopDevice(device.id).then(() => onRefreshDevice())}
              className="btn btn-danger btn-sm"
            >
              <Square size={14} /> Shut Down
            </button>
          )}

          <button onClick={onRefreshDevice} className="btn btn-secondary btn-sm" title="Refresh State">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="device-workspace">
        {/* Screen Canvas & Device Toolbar */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <DeviceCanvas device={device} onRefresh={onRefreshDevice} />
          <DeviceToolbar device={device} onRefreshDevice={onRefreshDevice} onToast={onToast} />
        </div>

        {/* Right Side Control Panels */}
        <div style={{ flex: 1, minWidth: '360px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Tab Headers */}
          <div
            style={{
              display: 'flex',
              gap: '0.35rem',
              overflowX: 'auto',
              paddingBottom: '0.25rem',
            }}
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.55rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: isActive ? t.color : 'var(--border-subtle)',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.3)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    fontSize: '0.775rem',
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={14} color={isActive ? t.color : 'currentColor'} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel */}
          {activeTab === 'play' && (
            <PlayStorePanel device={device} onToast={onToast} />
          )}

          {activeTab === 'chrome' && (
            <ChromePanel device={device} onToast={onToast} />
          )}

          {activeTab === 'apk' && (
            <APKUploader
              device={device}
              packages={packages}
              onRefreshPackages={fetchPackages}
              onToast={onToast}
            />
          )}

          {activeTab === 'files' && (
            <DeviceFiles device={device} onToast={onToast} />
          )}

          {activeTab === 'terminal' && (
            <ADBTerminal device={device} onToast={onToast} />
          )}

          {activeTab === 'logs' && (
            <LiveLogs deviceId={device.id} />
          )}
        </div>
      </div>
    </div>
  );
};
