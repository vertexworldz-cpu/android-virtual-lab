import React, { useState, useEffect, useRef } from 'react';
import { FolderDown, Upload, Download, File, Folder, RefreshCw, Loader2 } from 'lucide-react';
import { VirtualDevice, DeviceFile } from '../../types';
import { api } from '../../services/api';

interface DeviceFilesProps {
  device: VirtualDevice;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DeviceFiles: React.FC<DeviceFilesProps> = ({ device, onToast }) => {
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [path, setPath] = useState('/sdcard/Download');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFiles = async () => {
    if (device.status !== 'READY') return;
    try {
      setLoading(true);
      const res = await api.getFiles(device.id, path);
      setFiles(res);
    } catch (e: any) {
      console.warn('Failed to load files:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [device.id, device.status, path]);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      await api.uploadFile(device.id, file, path);
      onToast(`Uploaded ${file.name} to ${path}`, 'success');
      loadFiles();
    } catch (e: any) {
      onToast(e.message || 'File upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (remotePath: string) => {
    const url = `/api/devices/${device.id}/download-file?remote_path=${encodeURIComponent(remotePath)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FolderDown size={20} color="#3DDC84" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Device File Manager</h3>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary btn-sm"
            disabled={uploading || device.status !== 'READY'}
          >
            {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Upload to Device
          </button>
          <button onClick={loadFiles} className="btn btn-secondary btn-sm" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleUpload(e.target.files[0]);
            }
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Location:</span>
        <input
          className="form-input"
          style={{ padding: '0.35rem 0.6rem', fontSize: '0.775rem', fontFamily: 'var(--font-mono)' }}
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>

      {files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
          No files found in {path}. Upload files or download APKs through Chrome.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {files.map((file) => (
            <div
              key={file.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.8rem',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {file.is_directory ? (
                  <Folder size={16} color="#00E5FF" />
                ) : (
                  <File size={16} color="#3DDC84" />
                )}
                <span style={{ fontSize: '0.825rem', color: '#fff' }}>{file.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>

              {!file.is_directory && (
                <button
                  onClick={() => handleDownload(file.path)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0.25rem 0.5rem' }}
                  title="Download to Computer"
                >
                  <Download size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
