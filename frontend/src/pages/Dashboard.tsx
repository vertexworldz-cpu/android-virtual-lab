import React from 'react';
import {
  Smartphone,
  Play,
  Cpu,
  HardDrive,
  Activity,
  PlusCircle,
  Wand2,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { VirtualDevice, HostMetrics } from '../types';

interface DashboardProps {
  devices: VirtualDevice[];
  metrics: HostMetrics | null;
  onSelectDevice: (device: VirtualDevice) => void;
  onNavigate: (tab: string) => void;
  onOpenWizard: () => void;
  onStartDevice: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  devices,
  metrics,
  onSelectDevice,
  onNavigate,
  onOpenWizard,
  onStartDevice,
}) => {
  const runningDevices = devices.filter((d) => d.status === 'READY');
  const bootingDevices = devices.filter((d) => d.status === 'BOOTING' || d.status === 'STARTING');
  const stoppedDevices = devices.filter((d) => d.status === 'STOPPED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Banner */}
      <div
        className="glass-card"
        style={{
          padding: '2rem',
          background: 'linear-gradient(135deg, rgba(61, 220, 132, 0.12) 0%, rgba(0, 229, 255, 0.06) 100%), var(--bg-card)',
          border: '1px solid rgba(61, 220, 132, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(61, 220, 132, 0.15)', color: '#3DDC84', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            <CheckCircle size={14} /> PRODUCTION-READY REAL AVD PLATFORM
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
            Android Virtual Lab
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '640px', lineHeight: 1.5 }}>
            Controlling authentic QEMU Android Emulator instances on host hardware.
            Real Google Play Store, native Chrome APK downloads, strict ADB serial execution, and persistent user data without artificial session limits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => onNavigate('create')} className="btn btn-primary">
            <PlusCircle size={16} /> Create Virtual Device
          </button>
          <button onClick={onOpenWizard} className="btn btn-secondary">
            <Wand2 size={16} /> Setup Wizard
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>RUNNING DEVICES</span>
            <Smartphone size={18} color="#3DDC84" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>
            {runningDevices.length}
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
              / {devices.length} Total
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            {bootingDevices.length > 0 ? `${bootingDevices.length} booting right now` : 'All idle devices ready to launch'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>HARDWARE ACCELERATION</span>
            <Cpu size={18} color="#00E5FF" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: metrics?.hypervisor_available ? '#3DDC84' : '#ffb300' }}>
            {metrics?.hypervisor_available ? '✓ Enabled' : '⚠ Emulated'}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {metrics?.hypervisor_type || 'Detecting virtualization engine...'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>HOST CPU & RAM</span>
            <Activity size={18} color="#8A2BE2" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
            {metrics ? `${metrics.cpu_percent}% CPU • ${metrics.ram_used_gb} / ${metrics.ram_total_gb} GB` : '—'}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {metrics?.cpu_brand || 'Host processor'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ANDROID SDK & ADB</span>
            <HardDrive size={18} color="#3DDC84" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: metrics?.adb_version ? '#3DDC84' : '#ff4b4b' }}>
            {metrics?.adb_version ? 'ADB Online' : 'ADB Missing'}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.4rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {metrics?.adb_version || 'Install android-platform-tools'}
          </div>
        </div>
      </div>

      {/* Active Running Devices */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Play size={18} color="#3DDC84" /> Active Running Devices ({runningDevices.length + bootingDevices.length})
          </h3>
          <button onClick={() => onNavigate('devices')} className="btn btn-secondary btn-sm">
            View All AVDs <ArrowRight size={14} />
          </button>
        </div>

        {runningDevices.length === 0 && bootingDevices.length === 0 ? (
          <div
            className="glass-card"
            style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}
          >
            <Smartphone size={36} color="#64748b" style={{ margin: '0 auto 1rem' }} />
            <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '0.5rem' }}>No Active Virtual Devices</h4>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Select a device from the catalog below to boot the real QEMU emulator.
            </p>
            {devices.length > 0 ? (
              <button onClick={() => onStartDevice(devices[0].id)} className="btn btn-primary">
                <Play size={15} /> Start {devices[0].name}
              </button>
            ) : (
              <button onClick={() => onNavigate('create')} className="btn btn-primary">
                <PlusCircle size={15} /> Create First Virtual Device
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {[...runningDevices, ...bootingDevices].map((dev) => (
              <div
                key={dev.id}
                className="glass-card glass-card-interactive"
                style={{ padding: '1.25rem', cursor: 'pointer' }}
                onClick={() => {
                  onSelectDevice(dev);
                  onNavigate('live');
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>{dev.name}</div>
                  <span className={`badge badge-${dev.status.toLowerCase()}`}>{dev.status}</span>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div>Profile: <strong style={{ color: '#fff' }}>{dev.profile}</strong> ({dev.android_version})</div>
                  <div>Serial: <strong style={{ color: '#00E5FF', fontFamily: 'var(--font-mono)' }}>{dev.serial || 'Allocating...'}</strong></div>
                  <div>Google Play: <strong style={{ color: dev.has_play_store ? '#3DDC84' : '#ffb300' }}>{dev.has_play_store ? '✓ Supported' : '⚠ AOSP'}</strong></div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDevice(dev);
                    onNavigate('live');
                  }}
                >
                  Open Live Device Screen <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Device Catalog Overview */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Smartphone size={18} color="#00E5FF" /> Configured AVD Catalog ({devices.length})
          </h3>
          <button onClick={() => onNavigate('create')} className="btn btn-primary btn-sm">
            <PlusCircle size={14} /> New Device
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {devices.map((dev) => (
            <div key={dev.id} className="glass-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{dev.name}</div>
                <span className={`badge badge-${dev.status.toLowerCase()}`}>{dev.status}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {dev.android_version} • {dev.ram_mb}MB RAM • {dev.width}x{dev.height}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {dev.status === 'STOPPED' ? (
                  <button
                    onClick={() => onStartDevice(dev.id)}
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Play size={13} /> Start Device
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onSelectDevice(dev);
                      onNavigate('live');
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                  >
                    Open Workspace
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
