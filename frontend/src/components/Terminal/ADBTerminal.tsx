import React, { useState } from 'react';
import { Terminal, Send, Play, ShieldAlert, Cpu } from 'lucide-react';
import { VirtualDevice } from '../../types';
import { api } from '../../services/api';

interface ADBTerminalProps {
  device: VirtualDevice;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ADBTerminal: React.FC<ADBTerminalProps> = ({ device, onToast }) => {
  const [command, setCommand] = useState('getprop ro.build.version.release');
  const [history, setHistory] = useState<Array<{ cmd: string; out: string; code: number }>>([
    {
      cmd: 'adb shell getprop ro.product.model',
      out: device.profile,
      code: 0,
    },
  ]);
  const [executing, setExecuting] = useState(false);

  const handleExecute = async (cmdToRun?: string) => {
    const target = cmdToRun || command;
    if (!target.trim()) return;

    if (device.status !== 'READY') {
      onToast('Device must be READY to execute shell commands', 'error');
      return;
    }

    try {
      setExecuting(true);
      const res = await api.runShell(device.id, target);
      setHistory((prev) => [
        ...prev,
        {
          cmd: `adb -s ${device.serial} shell ${target}`,
          out: res.output || '(No output returned)',
          code: res.exit_code,
        },
      ]);
      setCommand('');
    } catch (e: any) {
      setHistory((prev) => [
        ...prev,
        {
          cmd: `adb -s ${device.serial} shell ${target}`,
          out: `Error: ${e.message}`,
          code: -1,
        },
      ]);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      {/* Terminal Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            ADB Shell Terminal
          </h3>
          <span
            style={{
              fontSize: '0.7rem',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {device.serial || 'No Serial Attached'}
          </span>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Model: <strong style={{ color: '#fff' }}>{device.profile}</strong> • API: <strong style={{ color: '#fff' }}>{device.api_level}</strong>
        </div>
      </div>

      {/* Preset Quick Commands */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button
          onClick={() => handleExecute('df -h /data')}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
        >
          Check Disk (/data)
        </button>
        <button
          onClick={() => handleExecute('dumpsys battery')}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
        >
          Battery Status
        </button>
        <button
          onClick={() => handleExecute('pm list packages -3')}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
        >
          List User Packages
        </button>
        <button
          onClick={() => handleExecute('getprop gsm.network.type')}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
        >
          Network Type
        </button>
      </div>

      {/* Output Console */}
      <div
        className="terminal-window"
        style={{
          height: '240px',
          overflowY: 'auto',
          padding: '0.85rem',
          marginBottom: '0.75rem',
        }}
      >
        {history.map((item, idx) => (
          <div key={idx} style={{ marginBottom: '0.75rem' }}>
            <div style={{ color: '#3DDC84', display: 'flex', gap: '0.4rem', fontSize: '0.775rem' }}>
              <span>$</span>
              <span>{item.cmd}</span>
            </div>
            <pre
              style={{
                color: item.code === 0 ? '#e2e8f0' : '#ff7b7b',
                margin: '0.2rem 0 0 0.8rem',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {item.out}
            </pre>
          </div>
        ))}
      </div>

      {/* Input Prompt */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExecute();
        }}
        style={{ display: 'flex', gap: '0.5rem' }}
      >
        <input
          className="form-input"
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.825rem',
            backgroundColor: '#050810',
          }}
          placeholder="Enter shell command (e.g. pm list packages, getprop, top)..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={executing || device.status !== 'READY'}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={executing || device.status !== 'READY'}
        >
          <Send size={14} /> Run
        </button>
      </form>
    </div>
  );
};
