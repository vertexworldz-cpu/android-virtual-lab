import React from 'react';
import {
  LayoutDashboard,
  Smartphone,
  PlusCircle,
  Play,
  Package,
  FolderDown,
  Terminal,
  FileText,
  Activity,
  ShieldCheck,
  Settings as SettingsIcon,
  Wand2,
} from 'lucide-react';
import { VirtualDevice } from '../../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  devices: VirtualDevice[];
  onOpenWizard: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  devices,
  onOpenWizard,
}) => {
  const runningCount = devices.filter(
    (d) => d.status === 'READY' || d.status === 'BOOTING' || d.status === 'STARTING'
  ).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Devices', icon: Smartphone, badge: devices.length },
    { id: 'create', label: 'Create Device', icon: PlusCircle },
    { id: 'live', label: 'Running Workspace', icon: Play, badge: runningCount, highlight: runningCount > 0 },
    { id: 'apps', label: 'Apps & APKs', icon: Package },
    { id: 'files', label: 'File Transfer', icon: FolderDown },
    { id: 'terminal', label: 'ADB Terminal', icon: Terminal },
    { id: 'logs', label: 'Live Logs', icon: FileText },
    { id: 'network', label: 'Network Health', icon: Activity },
    { id: 'diagnostics', label: 'System Tests', icon: ShieldCheck },
    { id: 'admin', label: 'Admin Panel', icon: SettingsIcon },
  ];

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '260px',
        backgroundColor: 'rgba(12, 16, 26, 0.95)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '1.5rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.875rem',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #3DDC84 0%, #00E5FF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(61, 220, 132, 0.4)',
          }}
        >
          <Smartphone size={22} color="#05140b" strokeWidth={2.5} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
            Android Virtual Lab
          </h1>
          <span style={{ fontSize: '0.7rem', color: '#3DDC84', fontWeight: 600 }}>
            REAL AVD RUNTIME
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, padding: '1rem 0.75rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(61, 220, 132, 0.15) 0%, rgba(61, 220, 132, 0.05) 100%)'
                    : 'transparent',
                  color: isActive ? '#3DDC84' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  borderLeft: isActive ? '3px solid #3DDC84' : '3px solid transparent',
                }}
              >
                <Icon size={18} color={isActive ? '#3DDC84' : 'currentColor'} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '10px',
                      background: item.highlight ? '#3DDC84' : 'rgba(255, 255, 255, 0.08)',
                      color: item.highlight ? '#05140b' : 'var(--text-secondary)',
                      fontWeight: 700,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom Setup Wizard Action */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onOpenWizard}
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: '0.8rem', gap: '0.5rem' }}
        >
          <Wand2 size={15} color="#3DDC84" />
          First-Run Setup Wizard
        </button>
        <div style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Unlimited Sessions • No Timers
        </div>
      </div>
    </aside>
  );
};
