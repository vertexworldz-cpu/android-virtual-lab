import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, Package, Trash2, Play } from 'lucide-react';
import { VirtualDevice, InstalledPackage } from '../../types';
import { api } from '../../services/api';

interface APKUploaderProps {
  device: VirtualDevice;
  packages: InstalledPackage[];
  onRefreshPackages: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const APKUploader: React.FC<APKUploaderProps> = ({
  device,
  packages,
  onRefreshPackages,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reinstall, setReinstall] = useState(true);
  const [installLog, setInstallLog] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.apk')) {
      onToast('Please select a valid .apk file', 'error');
      return;
    }
    if (device.status !== 'READY') {
      onToast('Device must be READY to install APKs', 'error');
      return;
    }

    try {
      setIsUploading(true);
      setInstallLog(`Uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);
      const res = await api.installAPK(device.id, file, reinstall);
      setInstallLog(`ADB Output:\n${res.message}`);
      onToast(`APK ${file.name} installed successfully!`, 'success');
      onRefreshPackages();
    } catch (e: any) {
      setInstallLog(`ADB Installation Error:\n${e.message}`);
      onToast(e.message || 'APK install failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleLaunchApp = async (pkgName: string) => {
    try {
      await api.launchPackage(device.id, pkgName);
      onToast(`Launched ${pkgName}`, 'success');
    } catch (e: any) {
      onToast(e.message || 'Failed to launch app', 'error');
    }
  };

  const handleUninstall = async (pkgName: string) => {
    if (!confirm(`Are you sure you want to uninstall ${pkgName}?`)) return;
    try {
      await api.uninstallPackage(device.id, pkgName);
      onToast(`Uninstalled ${pkgName}`, 'info');
      onRefreshPackages();
    } catch (e: any) {
      onToast(e.message || 'Uninstall failed', 'error');
    }
  };

  const userPackages = packages.filter((p) => !p.is_system || p.is_chrome || p.is_play_store);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Upload Box */}
      <div
        className="glass-card"
        style={{
          padding: '1.75rem',
          border: isDragOver ? '2px dashed #3DDC84' : '1px solid var(--border-subtle)',
          backgroundColor: isDragOver ? 'rgba(61, 220, 132, 0.05)' : 'var(--bg-card)',
          textAlign: 'center',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".apk"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'rgba(61, 220, 132, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
          }}
        >
          {isUploading ? (
            <Loader2 size={28} className="spin" color="#3DDC84" />
          ) : (
            <UploadCloud size={28} color="#3DDC84" />
          )}
        </div>

        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', marginBottom: '0.35rem' }}>
          {isUploading ? 'Installing APK via ADB...' : 'Select or Drag & Drop APK File'}
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Supports standalone APKs and APK updates directly onto serial <strong>{device.serial || 'emulator'}</strong>.
        </p>

        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}
          onClick={(e) => e.stopPropagation()}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={reinstall}
              onChange={(e) => setReinstall(e.target.checked)}
            />
            Reinstall / Update existing package (-r)
          </label>
        </div>
      </div>

      {/* Real ADB Output Log */}
      {installLog && (
        <div className="terminal-window" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
            Real-time ADB Installation Output
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{installLog}</pre>
        </div>
      )}

      {/* Installed Apps List */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={16} color="#3DDC84" /> Installed User Applications ({userPackages.length})
          </h3>
          <button onClick={onRefreshPackages} className="btn btn-secondary btn-sm">
            Refresh
          </button>
        </div>

        {userPackages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            No user-installed applications detected yet. Upload an APK or install from Play Store/Chrome.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {userPackages.map((pkg) => (
              <div
                key={pkg.package_name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                    {pkg.app_name || pkg.package_name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {pkg.package_name}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => handleLaunchApp(pkg.package_name)}
                    className="btn btn-secondary btn-sm"
                    title="Launch on Device"
                  >
                    <Play size={13} color="#3DDC84" /> Launch
                  </button>
                  {!pkg.is_system && (
                    <button
                      onClick={() => handleUninstall(pkg.package_name)}
                      className="btn btn-danger btn-sm"
                      title="Uninstall"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
