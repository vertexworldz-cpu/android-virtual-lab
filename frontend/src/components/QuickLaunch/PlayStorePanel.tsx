import React, { useState } from 'react';
import { ShoppingBag, CheckCircle, AlertTriangle, ExternalLink, Play, Search } from 'lucide-react';
import { VirtualDevice } from '../../types';
import { api } from '../../services/api';

interface PlayStorePanelProps {
  device: VirtualDevice;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const PlayStorePanel: React.FC<PlayStorePanelProps> = ({ device, onToast }) => {
  const [appSearch, setAppSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLaunch = async (appId?: string) => {
    if (device.status !== 'READY') {
      onToast('Device must be READY to launch Google Play Store', 'error');
      return;
    }
    try {
      setLoading(true);
      await api.launchPlayStore(device.id, appId);
      onToast(appId ? `Opening ${appId} on Play Store...` : 'Launching Google Play Store...', 'success');
    } catch (e: any) {
      onToast(e.message || 'Failed to launch Play Store', 'error');
    } finally {
      setLoading(false);
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
              background: 'linear-gradient(135deg, #00C853 0%, #0091EA 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShoppingBag size={20} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Google Play Store</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Official App Store & Services
            </span>
          </div>
        </div>

        {/* Capability Badge */}
        {device.has_play_store ? (
          <span className="badge badge-ready">
            <CheckCircle size={13} /> Available
          </span>
        ) : (
          <span className="badge badge-error" style={{ background: 'rgba(255, 179, 0, 0.15)', color: '#ffb300', borderColor: 'rgba(255, 179, 0, 0.3)' }}>
            <AlertTriangle size={13} /> Not Available (AOSP)
          </span>
        )}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
        {device.has_play_store
          ? 'Sign in with your Google account to search, download, install, and update real Android applications directly on this virtual device.'
          : 'This system image does not include Google Play services. To use Google Play Store, select a google_apis_playstore image when creating your device.'}
      </p>

      {device.has_play_store && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              className="form-input"
              style={{ flex: 1, padding: '0.5rem 0.8rem', fontSize: '0.825rem' }}
              placeholder="Search or enter package name (e.g. com.spotify.music)"
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
            />
            <button
              onClick={() => handleLaunch(appSearch.trim() || undefined)}
              className="btn btn-primary btn-sm"
              disabled={loading || device.status !== 'READY'}
            >
              <Search size={14} /> Open
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleLaunch()}
              className="btn btn-secondary btn-sm"
              disabled={loading || device.status !== 'READY'}
            >
              <Play size={13} color="#3DDC84" /> Launch Play Store Home
            </button>
            <button
              onClick={() => handleLaunch('com.google.android.youtube')}
              className="btn btn-secondary btn-sm"
              disabled={loading || device.status !== 'READY'}
            >
              YouTube
            </button>
            <button
              onClick={() => handleLaunch('com.whatsapp')}
              className="btn btn-secondary btn-sm"
              disabled={loading || device.status !== 'READY'}
            >
              WhatsApp
            </button>
            <button
              onClick={() => handleLaunch('org.telegram.messenger')}
              className="btn btn-secondary btn-sm"
              disabled={loading || device.status !== 'READY'}
            >
              Telegram
            </button>
          </div>
        </>
      )}
    </div>
  );
};
