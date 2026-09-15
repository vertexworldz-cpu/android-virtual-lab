import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  CheckCircle,
  AlertTriangle,
  Cpu,
  HardDrive,
  Camera,
  Mic,
  MapPin,
  Wifi,
  PlusCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { AndroidProfile, CreateDeviceRequest } from '../types';
import { api } from '../services/api';

interface CreateDeviceProps {
  onDeviceCreated: () => void;
  onNavigate: (tab: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CreateDevice: React.FC<CreateDeviceProps> = ({
  onDeviceCreated,
  onNavigate,
  onToast,
}) => {
  const [profiles, setProfiles] = useState<AndroidProfile[]>([]);
  const [systemImagesData, setSystemImagesData] = useState<{ installed_images: any[]; supported_versions: any[] }>({
    installed_images: [],
    supported_versions: [],
  });
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState('Pixel 8 Pro Test');
  const [selectedApi, setSelectedApi] = useState<number>(34);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('pixel_8');
  const [ramMb, setRamMb] = useState<number>(4096);
  const [cpuCores, setCpuCores] = useState<number>(4);
  const [storageMb, setStorageMb] = useState<number>(8192);
  const [orientation, setOrientation] = useState<string>('portrait');
  const [cameraBack, setCameraBack] = useState<string>('virtualscene');
  const [cameraFront, setCameraFront] = useState<string>('emulated');
  const [mic, setMic] = useState<boolean>(true);
  const [gps, setGps] = useState<boolean>(true);
  const [networkSpeed, setNetworkSpeed] = useState<string>('full');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profs, imgs] = await Promise.all([api.getProfiles(), api.getSystemImages()]);
        setProfiles(profs);
        setSystemImagesData(imgs);
      } catch (e) {
        console.warn('Error loading creation meta:', e);
      }
    };
    fetchData();
  }, []);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const selectedVersionObj = systemImagesData.supported_versions.find((v) => v.api_level === selectedApi);

  // Honest capability calculation
  const hasMatchingPlayImage = systemImagesData.installed_images.some(
    (img) => img.api_level === selectedApi && img.has_play_store
  );
  const isPlaySupported = hasMatchingPlayImage || (systemImagesData.installed_images.length === 0);

  const handleProfileChange = (profId: string) => {
    setSelectedProfileId(profId);
    const prof = profiles.find((p) => p.id === profId);
    if (prof) {
      setRamMb(prof.ram_mb);
      setCpuCores(prof.cpu_cores);
      setName(`${prof.name} Test Device`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onToast('Device name is required', 'error');
      return;
    }

    const payload: CreateDeviceRequest = {
      name: name.trim(),
      android_version: selectedVersionObj ? selectedVersionObj.name : `Android API ${selectedApi}`,
      api_level: selectedApi,
      device_profile: selectedProfile ? selectedProfile.name : 'Pixel 8',
      width: selectedProfile ? selectedProfile.width : 1080,
      height: selectedProfile ? selectedProfile.height : 2400,
      dpi: selectedProfile ? selectedProfile.dpi : 428,
      ram_mb: ramMb,
      cpu_cores: cpuCores,
      storage_mb: storageMb,
      orientation,
      camera_back: cameraBack,
      camera_front: cameraFront,
      mic,
      gps,
      network_latency: 'none',
      network_speed: networkSpeed,
    };

    try {
      setLoading(true);
      await api.createDevice(payload);
      onToast(`Virtual device '${payload.name}' created successfully!`, 'success');
      onDeviceCreated();
      onNavigate('devices');
    } catch (e: any) {
      onToast(e.message || 'Device creation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Title */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
          Create Virtual Device
        </h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Configure a genuine Android Virtual Device (AVD) running on host hardware
        </span>
      </div>

      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Device Profile Selection */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Smartphone size={18} color="#3DDC84" /> 1. Select Device Hardware Profile
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            {profiles.map((prof) => {
              const isSelected = selectedProfileId === prof.id;
              return (
                <button
                  type="button"
                  key={prof.id}
                  onClick={() => handleProfileChange(prof.id)}
                  style={{
                    padding: '0.85rem 0.65rem',
                    backgroundColor: isSelected ? 'rgba(61, 220, 132, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '2px solid #3DDC84' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: isSelected ? '#3DDC84' : 'var(--text-primary)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{prof.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {prof.width}x{prof.height}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              padding: '0.65rem 0.85rem',
              backgroundColor: 'rgba(0, 229, 255, 0.05)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.775rem',
              color: 'var(--text-secondary)',
              borderLeft: '3px solid #00E5FF',
            }}
          >
            <Info size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: 'middle' }} />
            <strong>Hardware Profile Transparency:</strong> Profiles configure authentic screen dimensions, density, and hardware flags. Manufacturer operating system skins are represented honestly as standard Android hardware profiles.
          </div>
        </div>

        {/* Android OS Version & Google Play */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Cpu size={18} color="#00E5FF" /> 2. Android Version & Google Play Capability
            </h3>

            {/* Google Play Capability Badge */}
            {isPlaySupported ? (
              <span className="badge badge-ready">
                <CheckCircle size={13} /> Google Play: Available
              </span>
            ) : (
              <span className="badge badge-error" style={{ background: 'rgba(255, 179, 0, 0.15)', color: '#ffb300', borderColor: 'rgba(255, 179, 0, 0.3)' }}>
                <AlertTriangle size={13} /> Google Play: ⚠ Not Available for this image
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Select Android Release</label>
            <select
              className="form-select"
              value={selectedApi}
              onChange={(e) => setSelectedApi(parseInt(e.target.value))}
            >
              <option value={36}>Android 16 (Baklava) — API 36</option>
              <option value={35}>Android 15 (Vanilla Ice Cream) — API 35</option>
              <option value={34}>Android 14 (Upside Down Cake) — API 34 (Recommended)</option>
              <option value={33}>Android 13 (Tiramisu) — API 33</option>
              <option value={32}>Android 12L (Sv2) — API 32</option>
              <option value={31}>Android 12 (S) — API 31</option>
              <option value={30}>Android 11 (R) — API 30</option>
              <option value={29}>Android 10 (Q) — API 29</option>
            </select>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {isPlaySupported
              ? '✓ System image includes real Google Play Store, Play Services, and Google Account authentication. You can sign in and download apps normally.'
              : '⚠ This version will boot as standard AOSP without proprietary Google Play Services. You can still install APKs via Chrome or the Dashboard APK manager.'}
          </p>
        </div>

        {/* Hardware & Peripheral Configuration */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HardDrive size={18} color="#8A2BE2" /> 3. Hardware & Peripherals Configuration
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Device Display Name</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pixel 8 Test Device"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">RAM Allocation (MB)</label>
              <select
                className="form-select"
                value={ramMb}
                onChange={(e) => setRamMb(parseInt(e.target.value))}
              >
                <option value={2048}>2048 MB (2 GB)</option>
                <option value={3072}>3072 MB (3 GB)</option>
                <option value={4096}>4096 MB (4 GB)</option>
                <option value={6144}>6144 MB (6 GB)</option>
                <option value={8192}>8192 MB (8 GB)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">CPU Cores (vCPU)</label>
              <select
                className="form-select"
                value={cpuCores}
                onChange={(e) => setCpuCores(parseInt(e.target.value))}
              >
                <option value={2}>2 Cores</option>
                <option value={4}>4 Cores</option>
                <option value={6}>6 Cores</option>
                <option value={8}>8 Cores</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Internal Storage Partition</label>
              <select
                className="form-select"
                value={storageMb}
                onChange={(e) => setStorageMb(parseInt(e.target.value))}
              >
                <option value={4096}>4 GB</option>
                <option value={8192}>8 GB</option>
                <option value={16384}>16 GB</option>
                <option value={32768}>32 GB</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Back Camera</label>
              <select
                className="form-select"
                value={cameraBack}
                onChange={(e) => setCameraBack(e.target.value)}
              >
                <option value="virtualscene">Virtual Scene (3D Room)</option>
                <option value="emulated">Emulated Test Pattern</option>
                <option value="webcam0">Host Webcam (if available)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Network Emulation</label>
              <select
                className="form-select"
                value={networkSpeed}
                onChange={(e) => setNetworkSpeed(e.target.value)}
              >
                <option value="full">Full Host Speed (Unthrottled)</option>
                <option value="lte">4G / LTE (50 Mbps)</option>
                <option value="hsdpa">3G / HSDPA (14 Mbps)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
              <Mic size={15} color="#3DDC84" /> Audio Input / Host Microphone
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={gps} onChange={(e) => setGps(e.target.checked)} />
              <MapPin size={15} color="#00E5FF" /> GPS Location Hardware Simulation
            </label>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="button" onClick={() => onNavigate('devices')} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: '200px' }}>
            {loading ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />} Create Virtual Device
          </button>
        </div>
      </form>
    </div>
  );
};
