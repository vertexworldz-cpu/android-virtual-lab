import React, { useState } from 'react';
import { Globe, Download, ExternalLink, ArrowRight, FolderOpen } from 'lucide-react';
import { VirtualDevice } from '../../types';
import { api } from '../../services/api';

interface ChromePanelProps {
  device: VirtualDevice;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ChromePanel: React.FC<ChromePanelProps> = ({ device, onToast }) => {
  const [url, setUrl] = useState('https://f-droid.org');
  const [loading, setLoading] = useState(false);

  const handleLaunchChrome = async (targetUrl?: string) => {
    if (device.status !== 'READY') {
      onToast('Device must be READY to launch Chrome', 'error');
      return;
    }
    try {
      setLoading(true);
      await api.launchChrome(device.id, targetUrl || url);
      onToast(`Launching browser with ${targetUrl || url}...`, 'success');
    } catch (e: any) {
      onToast(e.message || 'Failed to launch Chrome', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDownloads = async () => {
    if (device.status !== 'READY') {
      onToast('Device must be READY to open Downloads', 'error');
      return;
    }
    try {
      await api.launchDownloads(device.id);
      onToast('Opening Android Downloads app...', 'info');
    } catch (e: any) {
      onToast(e.message || 'Failed to open Downloads', 'error');
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #FFC107 0%, #FF5722 50%, #4CAF50 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Globe size={20} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Chrome Browser & Web Downloads</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Real Web & Unknown App Installation Flow
            </span>
          </div>
        </div>

        <button
          onClick={handleOpenDownloads}
          className="btn btn-secondary btn-sm"
          disabled={device.status !== 'READY'}
          title="Open Android Download Manager"
        >
          <FolderOpen size={14} color="#00E5FF" /> Open Downloads
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
        Navigate to any website in Chrome, download APK files directly into Android Downloads,
        open the downloaded file, and complete the native unknown-source install permission flow.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          className="form-input"
          style={{ flex: 1, padding: '0.5rem 0.8rem', fontSize: '0.825rem' }}
          placeholder="https://example.com or APK download URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={() => handleLaunchChrome()}
          className="btn btn-primary btn-sm"
          disabled={loading || device.status !== 'READY'}
        >
          <ArrowRight size={14} /> Navigate
        </button>
      </div>

      {/* Preset APK Download Hubs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => handleLaunchChrome('https://f-droid.org')}
          className="btn btn-secondary btn-sm"
          disabled={loading || device.status !== 'READY'}
        >
          <Download size={13} color="#00E5FF" /> F-Droid APK Hub
        </button>
        <button
          onClick={() => handleLaunchChrome('https://www.apkmirror.com')}
          className="btn btn-secondary btn-sm"
          disabled={loading || device.status !== 'READY'}
        >
          <Download size={13} color="#00E5FF" /> APKMirror
        </button>
        <button
          onClick={() => handleLaunchChrome('https://github.com')}
          className="btn btn-secondary btn-sm"
          disabled={loading || device.status !== 'READY'}
        >
          GitHub Releases
        </button>
      </div>
    </div>
  );
};
