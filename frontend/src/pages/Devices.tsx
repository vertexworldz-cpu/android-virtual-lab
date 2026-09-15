import React, { useState } from 'react';
import {
  Smartphone,
  Play,
  Square,
  RefreshCw,
  Trash2,
  AlertTriangle,
  PlusCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { VirtualDevice } from '../types';

interface DevicesProps {
  devices: VirtualDevice[];
  onSelectDevice: (device: VirtualDevice) => void;
  onNavigate: (tab: string) => void;
  onStartDevice: (id: string) => void;
  onStopDevice: (id: string) => void;
  onRestartDevice: (id: string) => void;
  onFactoryReset: (id: string) => void;
  onDeleteDevice: (id: string) => void;
}

export const Devices: React.FC<DevicesProps> = ({
  devices,
  onSelectDevice,
  onNavigate,
  onStartDevice,
  onStopDevice,
  onRestartDevice,
  onFactoryReset,
  onDeleteDevice,
}) => {
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredDevices = devices.filter((d) => {
    if (filter === 'running') return d.status === 'READY' || d.status === 'BOOTING' || d.status === 'STARTING';
    if (filter === 'stopped') return d.status === 'STOPPED';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            Virtual Devices Fleet
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real QEMU-based Android Virtual Devices on host system
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {/* Filter Pills */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--radius-md)',
              padding: '0.2rem',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {(['all', 'running', 'stopped'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '0.35rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: filter === f ? '#3DDC84' : 'transparent',
                  color: filter === f ? '#05140b' : 'var(--text-secondary)',
                  fontWeight: filter === f ? 700 : 500,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <button onClick={() => onNavigate('create')} className="btn btn-primary">
            <PlusCircle size={16} /> Create Virtual Device
          </button>
        </div>
      </div>

      {/* Grid of Devices */}
      {filteredDevices.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Smartphone size={40} color="#64748b" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.5rem' }}>No Virtual Devices Found</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {filter === 'all'
              ? 'No AVDs are currently configured on this host machine.'
              : `No devices matching status '${filter}'.`}
          </p>
          <button onClick={() => onNavigate('create')} className="btn btn-primary">
            <PlusCircle size={15} /> Create Device Now
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {filteredDevices.map((dev) => {
            const isRunning = dev.status === 'READY';
            const isBooting = dev.status === 'BOOTING' || dev.status === 'STARTING';

            return (
              <div key={dev.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{dev.name}</h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      AVD Name: <code style={{ color: '#38bdf8' }}>{dev.avd_name}</code>
                    </div>
                  </div>

                  <span className={`badge badge-${dev.status.toLowerCase()}`}>
                    {dev.status}
                  </span>
                </div>

                {/* Specs List */}
                <div
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem',
                    fontSize: '0.775rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div>
                    OS: <strong style={{ color: '#fff' }}>{dev.android_version}</strong>
                  </div>
                  <div>
                    Profile: <strong style={{ color: '#fff' }}>{dev.profile}</strong>
                  </div>
                  <div>
                    RAM: <strong style={{ color: '#fff' }}>{dev.ram_mb} MB</strong>
                  </div>
                  <div>
                    Cores: <strong style={{ color: '#fff' }}>{dev.cpu_cores} vCPU</strong>
                  </div>
                  <div>
                    Resolution: <strong style={{ color: '#fff' }}>{dev.width}x{dev.height}</strong>
                  </div>
                  <div>
                    Density: <strong style={{ color: '#fff' }}>{dev.dpi} DPI</strong>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    Google Play:{' '}
                    <strong style={{ color: dev.has_play_store ? '#3DDC84' : '#ffb300' }}>
                      {dev.has_play_store ? '✓ Available' : '⚠ Not Available (AOSP)'}
                    </strong>
                  </div>
                  {dev.serial && (
                    <div style={{ gridColumn: 'span 2' }}>
                      ADB Serial: <strong style={{ color: '#00E5FF', fontFamily: 'var(--font-mono)' }}>{dev.serial}</strong>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {isRunning ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          onSelectDevice(dev);
                          onNavigate('live');
                        }}
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        <Play size={14} /> Open Screen
                      </button>
                      <button
                        onClick={() => onRestartDevice(dev.id)}
                        className="btn btn-secondary"
                        title="Restart Device (Data Preserved)"
                      >
                        <RefreshCw size={14} color="#38bdf8" />
                      </button>
                      <button
                        onClick={() => onStopDevice(dev.id)}
                        className="btn btn-danger"
                        title="Stop Device"
                      >
                        <Square size={14} />
                      </button>
                    </div>
                  ) : isBooting ? (
                    <button
                      onClick={() => {
                        onSelectDevice(dev);
                        onNavigate('live');
                      }}
                      className="btn btn-primary"
                    >
                      <Loader2 size={14} className="spin" /> Booting ({dev.boot_progress}%) — View
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => onStartDevice(dev.id)}
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        <Play size={14} /> Start Device
                      </button>
                      <button
                        onClick={() => onFactoryReset(dev.id)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem' }}
                        title="Factory Reset Data"
                      >
                        Wipe
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(dev.id)}
                        className="btn btn-danger btn-sm"
                        title="Delete AVD"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="glass-card" style={{ padding: '1.75rem', width: '380px', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#ff4b4b', fontWeight: 700, marginBottom: '0.75rem' }}>
              Delete Virtual Device
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Are you sure you want to completely delete this AVD and its disk storage from the host?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setConfirmDeleteId(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteDevice(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="btn btn-danger"
              >
                Yes, Delete AVD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
