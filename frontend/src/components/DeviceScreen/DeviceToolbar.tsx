import React, { useState } from 'react';
import {
  Power,
  Home,
  ArrowLeft,
  Square,
  Volume2,
  Volume1,
  RotateCw,
  Camera,
  MapPin,
  RefreshCw,
  Trash2,
  Download,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { VirtualDevice } from '../../types';
import { api } from '../../services/api';

interface DeviceToolbarProps {
  device: VirtualDevice;
  onRefreshDevice: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DeviceToolbar: React.FC<DeviceToolbarProps> = ({
  device,
  onRefreshDevice,
  onToast,
}) => {
  const [showGPSModal, setShowGPSModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [lat, setLat] = useState('37.4220');
  const [lng, setLng] = useState('-122.0841'); // Googleplex default
  const [isLoading, setIsLoading] = useState(false);

  const handleButton = async (action: string) => {
    try {
      await api.sendButton(device.id, action);
      onToast(`Action: ${action}`, 'info');
    } catch (e: any) {
      onToast(e.message || 'Button action failed', 'error');
    }
  };

  const handleScreenshot = async () => {
    try {
      setIsLoading(true);
      const res = await api.takeScreenshot(device.id);
      if (res.url) {
        window.open(res.url, '_blank');
        onToast('Screenshot captured!', 'success');
      }
    } catch (e: any) {
      onToast(e.message || 'Screenshot failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGPS = async () => {
    try {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      await api.setGPS(device.id, latitude, longitude);
      onToast(`GPS set to ${latitude}, ${longitude}`, 'success');
      setShowGPSModal(false);
    } catch (e: any) {
      onToast(e.message || 'Failed to update GPS', 'error');
    }
  };

  const handleRestart = async () => {
    try {
      setIsLoading(true);
      await api.restartDevice(device.id);
      onToast('Device restart initiated (data preserved)', 'info');
      onRefreshDevice();
    } catch (e: any) {
      onToast(e.message || 'Restart failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFactoryReset = async () => {
    try {
      setIsLoading(true);
      await api.factoryResetDevice(device.id);
      onToast('Factory reset complete. Wiping data partition...', 'info');
      setShowResetModal(false);
      onRefreshDevice();
    } catch (e: any) {
      onToast(e.message || 'Factory reset failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShutdown = async () => {
    try {
      setIsLoading(true);
      await api.stopDevice(device.id);
      onToast('Device shut down successfully', 'info');
      onRefreshDevice();
    } catch (e: any) {
      onToast(e.message || 'Shutdown failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        className="glass-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          padding: '0.6rem',
          borderRadius: 'var(--radius-lg)',
          width: '56px',
          alignItems: 'center',
        }}
      >
        {/* Navigation */}
        <button
          onClick={() => handleButton('back')}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Back (ESC)"
        >
          <ArrowLeft size={18} />
        </button>

        <button
          onClick={() => handleButton('home')}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Home"
        >
          <Home size={18} />
        </button>

        <button
          onClick={() => handleButton('recent')}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Recent Apps (App Switcher)"
        >
          <Square size={16} />
        </button>

        <div style={{ width: '80%', height: '1px', backgroundColor: 'var(--border-subtle)', margin: '0.2rem 0' }} />

        {/* Volume & Screen */}
        <button
          onClick={() => handleButton('vol_up')}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Volume Up"
        >
          <Volume2 size={18} />
        </button>

        <button
          onClick={() => handleButton('vol_down')}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Volume Down"
        >
          <Volume1 size={18} />
        </button>

        <button
          onClick={() => handleButton('rotate')}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Rotate Screen"
        >
          <RotateCw size={18} />
        </button>

        <button
          onClick={handleScreenshot}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Take Screenshot"
        >
          <Camera size={18} />
        </button>

        <button
          onClick={() => setShowGPSModal(true)}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Set GPS Location"
        >
          <MapPin size={18} />
        </button>

        <div style={{ width: '80%', height: '1px', backgroundColor: 'var(--border-subtle)', margin: '0.2rem 0' }} />

        {/* Power Controls */}
        <button
          onClick={handleRestart}
          className="btn btn-secondary btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Restart Device (Data Preserved)"
        >
          <RefreshCw size={17} color="#38bdf8" />
        </button>

        <button
          onClick={() => setShowResetModal(true)}
          className="btn btn-danger btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Factory Reset (Wipes Data)"
        >
          <Trash2 size={17} />
        </button>

        <button
          onClick={handleShutdown}
          className="btn btn-danger btn-sm"
          style={{ width: '40px', height: '40px', padding: 0 }}
          title="Shut Down Device"
        >
          <Power size={18} />
        </button>
      </div>

      {/* GPS Modal */}
      {showGPSModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="glass-card" style={{ padding: '1.5rem', width: '380px', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={20} color="#3DDC84" /> Set Emulator GPS
            </h3>
            <div className="form-group">
              <label className="form-label">Latitude</label>
              <input
                className="form-input"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="e.g. 37.4220"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude</label>
              <input
                className="form-input"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="e.g. -122.0841"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowGPSModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleGPS} className="btn btn-primary">
                Send to Android
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Factory Reset Warning Modal */}
      {showResetModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            className="glass-card"
            style={{
              padding: '1.75rem',
              width: '420px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 75, 75, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 75, 75, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={24} color="#ff4b4b" />
              </div>
              <h3 style={{ fontSize: '1.15rem', color: '#ff4b4b', fontWeight: 700 }}>
                Factory Reset Device
              </h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              <strong>WARNING:</strong> This will erase all apps, Google accounts, downloads, settings, and user data
              from <strong>{device.name}</strong>. The device will be restored to fresh out-of-box condition.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setShowResetModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleFactoryReset} className="btn btn-danger">
                Yes, Erase Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
