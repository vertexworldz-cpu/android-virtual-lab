import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Navigation/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Devices } from './pages/Devices';
import { CreateDevice } from './pages/CreateDevice';
import { LiveDevice } from './pages/LiveDevice';
import { NetworkDiagnostics } from './pages/NetworkDiagnostics';
import { SystemDiagnostics } from './pages/SystemDiagnostics';
import { AdminPanel } from './pages/AdminPanel';
import { LiveLogs } from './components/Logs/LiveLogs';
import { SetupWizardModal } from './components/SetupWizard/SetupWizardModal';
import { VirtualDevice, HostMetrics } from './types';
import { api } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [devices, setDevices] = useState<VirtualDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<VirtualDevice | null>(null);
  const [metrics, setMetrics] = useState<HostMetrics | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const fetchDevices = async () => {
    try {
      const data = await api.getDevices();
      setDevices(data);
      if (data.length > 0 && !selectedDevice) {
        // Auto-select first running device, or just the first device
        const running = data.find((d) => d.status === 'READY');
        setSelectedDevice(running || data[0]);
      } else if (selectedDevice) {
        // Update selected device with fresh state
        const updated = data.find((d) => d.id === selectedDevice.id);
        if (updated) setSelectedDevice(updated);
      }
    } catch (e) {
      console.warn('Error fetching devices', e);
    }
  };

  const fetchMetrics = async () => {
    try {
      const m = await api.getMetrics();
      setMetrics(m);
    } catch (e) {
      console.warn('Error fetching metrics', e);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchMetrics();
    const interval = setInterval(fetchDevices, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStartDevice = async (id: string) => {
    try {
      showToast('Starting Android Emulator process...', 'info');
      await api.startDevice(id);
      showToast('Device starting! Awaiting ADB and boot completion...', 'success');
      fetchDevices();
    } catch (e: any) {
      showToast(e.message || 'Failed to start device', 'error');
    }
  };

  const handleStopDevice = async (id: string) => {
    try {
      showToast('Stopping device...', 'info');
      await api.stopDevice(id);
      showToast('Device stopped', 'info');
      fetchDevices();
    } catch (e: any) {
      showToast(e.message || 'Failed to stop device', 'error');
    }
  };

  const handleRestartDevice = async (id: string) => {
    try {
      showToast('Restarting device (user data preserved)...', 'info');
      await api.restartDevice(id);
      showToast('Restart initiated', 'success');
      fetchDevices();
    } catch (e: any) {
      showToast(e.message || 'Restart failed', 'error');
    }
  };

  const handleFactoryResetDevice = async (id: string) => {
    try {
      showToast('Factory resetting user partitions and booting clean...', 'info');
      await api.factoryResetDevice(id);
      showToast('Factory reset complete', 'success');
      fetchDevices();
    } catch (e: any) {
      showToast(e.message || 'Factory reset failed', 'error');
    }
  };

  const handleDeleteDevice = async (id: string) => {
    try {
      await api.deleteDevice(id);
      showToast('Device deleted', 'info');
      if (selectedDevice?.id === id) {
        setSelectedDevice(null);
      }
      fetchDevices();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'error');
    }
  };

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor:
              toast.type === 'success'
                ? '#052e16'
                : toast.type === 'error'
                ? '#450a0a'
                : '#082f49',
            border: `1px solid ${
              toast.type === 'success'
                ? '#3DDC84'
                : toast.type === 'error'
                ? '#ff4b4b'
                : '#00E5FF'
            }`,
            color: '#fff',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            zIndex: 200,
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        devices={devices}
        onOpenWizard={() => setWizardOpen(true)}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {currentTab === 'dashboard' && (
          <Dashboard
            devices={devices}
            metrics={metrics}
            onSelectDevice={(d) => {
              setSelectedDevice(d);
              setCurrentTab('live');
            }}
            onNavigate={setCurrentTab}
            onOpenWizard={() => setWizardOpen(true)}
            onStartDevice={handleStartDevice}
          />
        )}

        {currentTab === 'devices' && (
          <Devices
            devices={devices}
            onSelectDevice={(d) => {
              setSelectedDevice(d);
              setCurrentTab('live');
            }}
            onNavigate={setCurrentTab}
            onStartDevice={handleStartDevice}
            onStopDevice={handleStopDevice}
            onRestartDevice={handleRestartDevice}
            onFactoryReset={handleFactoryResetDevice}
            onDeleteDevice={handleDeleteDevice}
          />
        )}

        {currentTab === 'create' && (
          <CreateDevice
            onDeviceCreated={fetchDevices}
            onNavigate={setCurrentTab}
            onToast={showToast}
          />
        )}

        {(currentTab === 'live' || currentTab === 'apps' || currentTab === 'files' || currentTab === 'terminal') && (
          <LiveDevice
            device={selectedDevice}
            devices={devices}
            onSelectDevice={setSelectedDevice}
            onRefreshDevice={fetchDevices}
            onToast={showToast}
            onNavigate={setCurrentTab}
          />
        )}

        {currentTab === 'logs' && <LiveLogs deviceId={selectedDevice?.id} />}

        {currentTab === 'network' && <NetworkDiagnostics />}

        {currentTab === 'diagnostics' && <SystemDiagnostics />}

        {currentTab === 'admin' && <AdminPanel onToast={showToast} />}
      </main>

      {/* Setup Wizard Modal */}
      <SetupWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onToast={showToast}
      />
    </div>
  );
};
