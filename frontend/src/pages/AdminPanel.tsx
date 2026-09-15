import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Server, Shield, HardDrive, Cpu, Activity, Save, Loader2, Check } from 'lucide-react';
import { api } from '../services/api';

interface AdminPanelProps {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onToast }) => {
  const [summary, setSummary] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [maxUploadMb, setMaxUploadMb] = useState(500);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [sum, audits] = await Promise.all([api.getAdminSummary(), api.getAuditLogs()]);
      setSummary(sum);
      setAuditLogs(audits);
      if (sum.config) {
        setMaxConcurrent(sum.config.max_concurrent_emulators);
        setMaxUploadMb(sum.config.max_upload_size_mb);
      }
    } catch (e) {
      console.warn('Failed to load admin summary', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.updateAdminConfig(maxConcurrent, maxUploadMb);
      onToast('System configuration updated successfully', 'success');
      fetchData();
    } catch (e: any) {
      onToast(e.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
          Platform Administration
        </h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Host telemetry, system limits, storage quotas, and security audit logs
        </span>
      </div>

      {/* Resource Telemetry */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#3DDC84' }}>
              <Server size={18} />
              <h4 style={{ fontWeight: 600 }}>Virtual Devices Fleet</h4>
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>Total Devices: <strong style={{ color: '#fff' }}>{summary.devices_summary.total}</strong></div>
              <div>Running: <strong style={{ color: '#3DDC84' }}>{summary.devices_summary.running}</strong></div>
              <div>Stopped: <strong style={{ color: 'var(--text-muted)' }}>{summary.devices_summary.stopped}</strong></div>
              <div>Errors: <strong style={{ color: '#ff4b4b' }}>{summary.devices_summary.error}</strong></div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#00E5FF' }}>
              <Cpu size={18} />
              <h4 style={{ fontWeight: 600 }}>Host Machine Status</h4>
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>OS: <strong style={{ color: '#fff' }}>{summary.metrics.os_name} {summary.metrics.os_version}</strong></div>
              <div>CPU: <strong style={{ color: '#fff' }}>{summary.metrics.cpu_percent}%</strong> ({summary.metrics.cpu_count} logical / {summary.metrics.cpu_physical_cores || 6} physical cores)</div>
              <div>RAM: <strong style={{ color: '#fff' }}>{summary.metrics.ram_used_gb} / {summary.metrics.ram_total_gb} GB</strong> (<span style={{ color: '#3DDC84' }}>{summary.metrics.ram_available_gb} GB free</span>)</div>
              {summary.metrics.gpus && summary.metrics.gpus.length > 0 && (
                <div>GPU: <strong style={{ color: '#e879f9' }}>{summary.metrics.gpus[0].model}</strong> {summary.metrics.gpus.length > 1 ? `(+${summary.metrics.gpus.length - 1} more)` : ''}</div>
              )}
              <div>Hypervisor: <strong style={{ color: '#3DDC84' }}>{summary.metrics.hypervisor_type}</strong></div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#8A2BE2' }}>
              <HardDrive size={18} />
              <h4 style={{ fontWeight: 600 }}>Storage Paths</h4>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem', wordBreak: 'break-all' }}>
              <div>AVD Home: <code style={{ color: '#38bdf8' }}>{summary.config.avd_storage_path}</code></div>
              <div>Data Cache: <code style={{ color: '#38bdf8' }}>{summary.config.data_storage_path}</code></div>
              <div>Session Persistence: <strong style={{ color: '#3DDC84' }}>Permanent (No artificial timer)</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SettingsIcon size={18} color="#3DDC84" /> Platform Limits & Concurrency
        </h3>

        <form onSubmit={handleSaveConfig} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label">Max Concurrent Emulators</label>
            <input
              type="number"
              className="form-input"
              value={maxConcurrent}
              min={1}
              max={16}
              onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Controls how many real QEMU instances can run simultaneously on the host.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Max APK Upload Limit (MB)</label>
            <input
              type="number"
              className="form-input"
              value={maxUploadMb}
              min={50}
              max={2000}
              onChange={(e) => setMaxUploadMb(parseInt(e.target.value))}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Maximum size allowed for uploaded APK packages and files.
            </span>
          </div>

          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Audit Logs */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={18} color="#00E5FF" /> System Audit Trail ({auditLogs.length})
        </h3>

        {auditLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            No administrative events recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {auditLogs.map((log, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.775rem',
                }}
              >
                <div>
                  <strong style={{ color: '#3DDC84', textTransform: 'uppercase' }}>{log.action}</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '0.65rem' }}>{log.details}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {log.timestamp} • {log.user}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
